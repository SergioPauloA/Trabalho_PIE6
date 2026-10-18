import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import * as s from '../schemas.js';
import { requireFound } from '../domain.js';
import { queryAnalytics, queryRollup } from '../analytics.js';
import { runEtl } from '../etl/service.js';
import { pageArgs, pageMeta, type RouteOptions } from './shared.js';

export const reportsRoutes: FastifyPluginAsyncZod<RouteOptions> = async (app, { db }) => {
  app.post(
    "/api/etl/runs",
    {
      schema: {
        tags: ["ETL"],
        summary: "Executar carga completa de forma síncrona e atômica",
        response: s.responses(s.etlRun, 201),
      },
    },
    async (_req, reply) => reply.status(201).send(await runEtl(db)),
  );

  app.get(
    "/api/etl/runs",
    {
      schema: {
        tags: ["ETL"],
        summary: "Listar execuções e falhas de carga",
        querystring: s.pagination,
        response: s.responses(s.pageOf(s.etlRun)),
      },
    },
    async (req) => {
      const [data, total] = await db.$transaction([
        db.etlRun.findMany({
          ...pageArgs(req.query),
          orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        }),
        db.etlRun.count(),
      ]);
      return {
        data,
        pagination: pageMeta(req.query.page, req.query.pageSize, total),
      };
    },
  );

  app.get(
    "/api/etl/runs/:id",
    {
      schema: {
        tags: ["ETL"],
        summary: "Consultar execução de carga",
        params: s.params,
        response: s.responses(s.etlRun),
      },
    },
    async (req) =>
      requireFound(
        await db.etlRun.findUnique({ where: req.params }),
        "Carga ETL",
      ),
  );

  app.get(
    "/api/analytics/summary",
    {
      schema: {
        tags: ["OLAP"],
        summary: "Totais de vendas e perdas da última carga",
        querystring: s.analyticQuery,
        response: s.responses(s.analyticSummary),
      },
    },
    async (req) => queryAnalytics(db, req.query, false),
  );

  app.get(
    "/api/analytics/groups",
    {
      schema: {
        tags: ["OLAP"],
        summary: "Agrupar por dia, mês, categoria, produto ou lote",
        querystring: s.analyticQuery,
        response: s.responses(s.analytics),
      },
    },
    async (req) => queryAnalytics(db, req.query, true),
  );

  app.get(
    "/api/analytics/rollup",
    {
      schema: {
        tags: ["OLAP"],
        summary: "Roll-up dia > mês > ano com subtotais e total geral",
        querystring: s.rollupQuery,
        response: s.responses(s.analyticRollup),
      },
    },
    async (req) => queryRollup(db, req.query),
  );
};
