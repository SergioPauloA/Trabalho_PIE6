import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import * as s from '../schemas.js';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError, localDate, lockLot, lotView, recordMovement, requireFound } from '../domain.js';
import { pageArgs, pageMeta, period, type RouteOptions } from './shared.js';

export const inventoryRoutes: FastifyPluginAsyncZod<RouteOptions> = async (app, { db, now }) => {
  app.get(
    "/api/lots",
    {
      schema: {
        tags: ["Lotes"],
        summary: "Listar lotes por risco, categoria ou busca",
        querystring: s.lotQuery,
        response: s.responses(s.pageOf(s.publicLot)),
      },
    },
    async (req) => {
      const q = req.query;
      const alertDays =
        (await db.settings.findUnique({ where: { id: 1 } }))?.alertDays ?? 10;
      const today = new Date(localDate(now()));
      const limit = new Date(today.getTime() + alertDays * 86_400_000);
      const where: Prisma.LotWhereInput = {
        productId: q.productId,
        product: { categoryId: q.categoryId },
        ...(q.search
          ? {
              OR: [
                { code: { contains: q.search, mode: "insensitive" } },
                {
                  product: {
                    name: { contains: q.search, mode: "insensitive" },
                  },
                },
                {
                  product: { sku: { contains: q.search, mode: "insensitive" } },
                },
                {
                  product: {
                    barcode: { contains: q.search, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
        ...(q.status === "EMPTY"
          ? { balance: 0 }
          : q.status
            ? { balance: { gt: 0 } }
            : {}),
        ...(q.status === "EXPIRED"
          ? { expiresAt: { lt: today } }
          : q.status === "ATTENTION"
            ? { expiresAt: { gte: today, lte: limit } }
            : q.status === "OK"
              ? { expiresAt: { gt: limit } }
              : {}),
      };
      const [lots, total] = await db.$transaction([
        db.lot.findMany({
          where,
          ...pageArgs(q),
          include: { product: { include: { category: true } } },
          orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
        }),
        db.lot.count({ where }),
      ]);
      return {
        data: lots.map((l) => lotView(l, alertDays, now())),
        pagination: pageMeta(q.page, q.pageSize, total),
      };
    },
  );

  app.get(
    "/api/lots/:id",
    {
      schema: {
        tags: ["Lotes"],
        summary: "Detalhar lote e quantidades",
        params: s.params,
        response: s.responses(
          s.publicLot.extend({
            soldQuantity: z.number(),
            discardedQuantity: z.number(),
          }),
        ),
      },
    },
    async (req) =>
      db.$transaction(
        async (tx) => {
          const lot = requireFound(
            await tx.lot.findUnique({
              where: req.params,
              include: { product: { include: { category: true } } },
            }),
            "Lote",
          );
          const alertDays =
            (await tx.settings.findUnique({ where: { id: 1 } }))?.alertDays ??
            10;
          const quantities = await tx.movement.groupBy({
            by: ["type"],
            where: { lotId: lot.id },
            _sum: { quantity: true },
          });
          return {
            ...lotView(lot, alertDays, now()),
            soldQuantity:
              quantities.find((q) => q.type === "SALE")?._sum.quantity ?? 0,
            discardedQuantity:
              quantities.find((q) => q.type === "DISCARD")?._sum.quantity ?? 0,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      ),
  );

  app.post(
    "/api/lots",
    {
      schema: {
        tags: ["Lotes"],
        summary: "Cadastrar lote e estoque inicial",
        body: s.lotBody,
        response: s.responses(s.lot, 201),
      },
    },
    async (req, reply) => {
      const product = requireFound(
        await db.product.findUnique({ where: { id: req.body.productId } }),
        "Produto",
      );
      if (!product.active)
        throw new AppError(409, "INACTIVE_PRODUCT", "Produto inativo.");
      return reply.status(201).send(
        await db.lot.create({
          data: {
            ...req.body,
            expiresAt: new Date(req.body.expiresAt),
            balance: req.body.initialQuantity,
          },
        }),
      );
    },
  );

  app.patch(
    "/api/lots/:id",
    {
      schema: {
        tags: ["Lotes"],
        summary: "Corrigir lote antes de qualquer movimentação ou promoção",
        params: s.params,
        body: s.lotPatch,
        response: s.responses(s.lot),
      },
    },
    async (req) =>
      db.$transaction(async (tx) => {
        await lockLot(tx, req.params.id);
        if (
          (await tx.movement.count({ where: { lotId: req.params.id } })) ||
          (await tx.promotion.count({ where: { lotId: req.params.id } }))
        )
          throw new AppError(
            409,
            "LOT_HAS_HISTORY",
            "Lote com histórico não pode ter seus dados alterados.",
          );
        return tx.lot.update({
          where: req.params,
          data: {
            ...req.body,
            expiresAt: req.body.expiresAt
              ? new Date(req.body.expiresAt)
              : undefined,
          },
        });
      }),
  );

  const movementResponse = z.object({
    movement: s.movement,
    balance: z.number(),
    replayed: z.boolean(),
  });

  app.post(
    "/api/lots/:id/sales",
    {
      schema: {
        tags: ["Movimentações"],
        summary: "Registrar venda; usa automaticamente a promoção ativa",
        params: s.params,
        body: s.saleBody,
        response: s.responses(movementResponse),
      },
    },
    async (req) => recordMovement(db, req.params.id, "SALE", req.body, now()),
  );

  app.post(
    "/api/lots/:id/discards",
    {
      schema: {
        tags: ["Movimentações"],
        summary: "Registrar descarte com motivo",
        params: s.params,
        body: s.discardBody,
        response: s.responses(movementResponse),
      },
    },
    async (req) =>
      recordMovement(db, req.params.id, "DISCARD", req.body, now()),
  );

  app.get(
    "/api/movements",
    {
      schema: {
        tags: ["Movimentações"],
        summary: "Consultar histórico imutável de vendas e descartes",
        querystring: s.movementQuery,
        response: s.responses(s.pageOf(s.movement)),
      },
    },
    async (req) => {
      const q = req.query;
      const where: Prisma.MovementWhereInput = {
        lotId: q.lotId,
        promotionId: q.promotionId,
        type: q.type,
        occurredAt: await period(db, q),
      };
      const [data, total] = await db.$transaction([
        db.movement.findMany({
          where,
          ...pageArgs(q),
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        }),
        db.movement.count({ where }),
      ]);
      return { data, pagination: pageMeta(q.page, q.pageSize, total) };
    },
  );

  app.get(
    "/api/settings",
    {
      schema: {
        tags: ["Configurações"],
        summary: "Consultar prazo de alerta",
        response: s.responses(s.settings),
      },
    },
    async () =>
      db.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} }),
  );

  app.put(
    "/api/settings",
    {
      schema: {
        tags: ["Configurações"],
        summary: "Alterar prazo de alerta",
        body: s.settingsBody,
        response: s.responses(s.settings),
      },
    },
    async (req) =>
      db.settings.upsert({
        where: { id: 1 },
        create: { id: 1, ...req.body },
        update: req.body,
      }),
  );

  app.get(
    "/api/dashboard/stock",
    {
      schema: {
        tags: ["Painel"],
        summary: "Indicadores operacionais atualizados imediatamente",
        response: s.responses(
          z.object({
            alertDays: z.number(),
            date: s.date,
            activeLots: z.number(),
            totalUnits: z.number(),
            expiredLots: z.number(),
            expiredUnits: z.number(),
            attentionLots: z.number(),
            attentionUnits: z.number(),
            activePromotions: z.number(),
          }),
        ),
      },
    },
    async () =>
      db.$transaction(
        async (tx) => {
          const alertDays =
            (await tx.settings.findUnique({ where: { id: 1 } }))?.alertDays ??
            10;
          const today = new Date(localDate(now()));
          const limit = new Date(today.getTime() + alertDays * 86_400_000);
          const all = await tx.lot.aggregate({
            where: { balance: { gt: 0 } },
            _count: true,
            _sum: { balance: true },
          });
          const expired = await tx.lot.aggregate({
            where: { balance: { gt: 0 }, expiresAt: { lt: today } },
            _count: true,
            _sum: { balance: true },
          });
          const attention = await tx.lot.aggregate({
            where: {
              balance: { gt: 0 },
              expiresAt: { gte: today, lte: limit },
            },
            _count: true,
            _sum: { balance: true },
          });
          return {
            date: localDate(now()),
            alertDays,
            activeLots: all._count,
            totalUnits: all._sum.balance ?? 0,
            expiredLots: expired._count,
            expiredUnits: expired._sum.balance ?? 0,
            attentionLots: attention._count,
            attentionUnits: attention._sum.balance ?? 0,
            activePromotions: await tx.promotion.count({
              where: { status: "ACTIVE" },
            }),
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      ),
  );
};
