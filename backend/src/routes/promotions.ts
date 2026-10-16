import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import * as s from '../schemas.js';
import { closePromotion, createPromotion, promotionResult, requireFound } from '../domain.js';
import { pageArgs, pageMeta, type RouteOptions } from './shared.js';

export const promotionsRoutes: FastifyPluginAsyncZod<RouteOptions> = async (app, { db, now }) => {
  app.post(
    "/api/promotions",
    {
      schema: {
        tags: ["Promoções"],
        summary: "Abrir promoção para um lote",
        body: s.promotionBody,
        response: s.responses(s.promotion, 201),
      },
    },
    async (req, reply) =>
      reply
        .status(201)
        .send(
          await createPromotion(
            db,
            req.body.lotId,
            req.body.discountPercent,
            now(),
          ),
        ),
  );

  app.get(
    "/api/promotions",
    {
      schema: {
        tags: ["Promoções"],
        summary: "Listar promoções ativas ou encerradas",
        querystring: s.promotionQuery,
        response: s.responses(s.pageOf(s.promotionWithLot)),
      },
    },
    async (req) => {
      const q = req.query;
      const where = { lotId: q.lotId, status: q.status };
      const [data, total] = await db.$transaction([
        db.promotion.findMany({
          where,
          ...pageArgs(q),
          include: { lot: { include: { product: true } } },
          orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        }),
        db.promotion.count({ where }),
      ]);
      return { data, pagination: pageMeta(q.page, q.pageSize, total) };
    },
  );

  app.get(
    "/api/promotions/:id",
    {
      schema: {
        tags: ["Promoções"],
        summary: "Consultar promoção",
        params: s.params,
        response: s.responses(s.promotionWithLot),
      },
    },
    async (req) =>
      requireFound(
        await db.promotion.findUnique({
          where: req.params,
          include: { lot: { include: { product: true } } },
        }),
        "Promoção",
      ),
  );

  app.post(
    "/api/promotions/:id/close",
    {
      schema: {
        tags: ["Promoções"],
        summary: "Encerrar promoção preservando saldo e histórico",
        params: s.params,
        response: s.responses(s.promotion),
      },
    },
    async (req) => closePromotion(db, req.params.id),
  );

  app.get(
    "/api/promotions/:id/results",
    {
      schema: {
        tags: ["Promoções"],
        summary: "Resultados do pós-promoção em tempo real",
        params: s.params,
        response: s.responses(s.promotionResultSchema),
      },
    },
    async (req) => promotionResult(db, req.params.id),
  );
};
