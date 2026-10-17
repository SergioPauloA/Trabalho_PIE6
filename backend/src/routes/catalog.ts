import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import * as s from '../schemas.js';
import { Prisma } from '@prisma/client';
import { requireFound } from '../domain.js';
import { pageArgs, pageMeta, type RouteOptions } from './shared.js';

export const catalogRoutes: FastifyPluginAsyncZod<RouteOptions> = async (app, { db }) => {
  app.get(
    "/api/categories",
    {
      schema: {
        tags: ["Categorias"],
        summary: "Listar categorias",
        querystring: s.pagination,
        response: s.responses(s.pageOf(s.category)),
      },
    },
    async (req) => {
      const [data, total] = await db.$transaction([
        db.category.findMany({
          ...pageArgs(req.query),
          orderBy: [{ name: "asc" }, { id: "asc" }],
        }),
        db.category.count(),
      ]);
      return {
        data,
        pagination: pageMeta(req.query.page, req.query.pageSize, total),
      };
    },
  );

  app.post(
    "/api/categories",
    {
      schema: {
        tags: ["Categorias"],
        summary: "Criar categoria",
        body: s.categoryBody,
        response: s.responses(s.category, 201),
      },
    },
    async (req, reply) =>
      reply.status(201).send(await db.category.create({ data: req.body })),
  );

  app.patch(
    "/api/categories/:id",
    {
      schema: {
        tags: ["Categorias"],
        summary: "Renomear categoria",
        params: s.params,
        body: s.categoryBody,
        response: s.responses(s.category),
      },
    },
    async (req) => db.category.update({ where: req.params, data: req.body }),
  );

  app.get(
    "/api/products",
    {
      schema: {
        tags: ["Produtos"],
        summary: "Listar e buscar produtos",
        querystring: s.productQuery,
        response: s.responses(s.pageOf(s.productWithCategory)),
      },
    },
    async (req) => {
      const q = req.query;
      const where: Prisma.ProductWhereInput = {
        categoryId: q.categoryId,
        active: q.active === undefined ? undefined : q.active === "true",
        ...(q.search
          ? {
              OR: ["name", "sku", "barcode"].map((key) => ({
                [key]: { contains: q.search, mode: "insensitive" },
              })),
            }
          : {}),
      };
      const [data, total] = await db.$transaction([
        db.product.findMany({
          where,
          ...pageArgs(q),
          include: { category: true },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        }),
        db.product.count({ where }),
      ]);
      return { data, pagination: pageMeta(q.page, q.pageSize, total) };
    },
  );

  app.get(
    "/api/products/:id",
    {
      schema: {
        tags: ["Produtos"],
        summary: "Consultar produto",
        params: s.params,
        response: s.responses(s.productWithCategory),
      },
    },
    async (req) =>
      requireFound(
        await db.product.findUnique({
          where: req.params,
          include: { category: true },
        }),
        "Produto",
      ),
  );

  app.post(
    "/api/products",
    {
      schema: {
        tags: ["Produtos"],
        summary: "Cadastrar produto",
        body: s.productBody,
        response: s.responses(s.productWithCategory, 201),
      },
    },
    async (req, reply) =>
      reply.status(201).send(
        await db.product.create({
          data: req.body,
          include: { category: true },
        }),
      ),
  );

  app.patch(
    "/api/products/:id",
    {
      schema: {
        tags: ["Produtos"],
        summary: "Editar ou inativar produto (active=false)",
        params: s.params,
        body: s.productPatch,
        response: s.responses(s.productWithCategory),
      },
    },
    async (req) =>
      db.product.update({
        where: req.params,
        data: req.body,
        include: { category: true },
      }),
  );
};
