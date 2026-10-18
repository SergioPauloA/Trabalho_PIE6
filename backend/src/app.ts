import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { Prisma, type PrismaClient } from '@prisma/client';
import Fastify from 'fastify';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError, publicValues } from './domain.js';
import * as s from './schemas.js';
import { catalogRoutes } from './routes/catalog.js';
import { inventoryRoutes } from './routes/inventory.js';
import { promotionsRoutes } from './routes/promotions.js';
import { reportsRoutes } from './routes/reports.js';

export async function buildApp(options: { db: PrismaClient; logger?: boolean; corsOrigins?: string[]; now?: () => Date }) {
  const db = options.db;

  const now = options.now ?? (() => new Date());

  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 256 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);

  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: options.corsOrigins ?? [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Mercelume API",
        version: "2.0.0",
        description:
          "Sem login. Quantidades em toneladas (t), até 3 casas decimais. Custo e preço em centavos por tonelada; totais financeiros arredondados por movimentação. Envios de quantidade exigem quantityUnit: t. Validade inclusiva no fuso America/Sao_Paulo. ETL manual.",
      },
      servers: [{ url: "/" }],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.addHook("preSerialization", async (_request, _reply, payload) =>
    publicValues(payload),
  );

  app.setErrorHandler((err, request, reply) => {
    const e = err as Error & {
      validation?: unknown;
      statusCode?: number;
      code?: string;
    };
    const validation = e.validation;
    const statusCode = e.statusCode;
    if (validation || e instanceof z.ZodError)
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Dados inválidos.",
          details: validation ?? (e as z.ZodError).issues,
        },
      });
    if (e instanceof AppError)
      return reply
        .status(e.status)
        .send({ error: { code: e.code, message: e.message } });
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002")
        return reply.status(409).send({
          error: {
            code: "DUPLICATE_RECORD",
            message: "Identificador, nome ou chave já utilizado.",
          },
        });
      if (e.code === "P2003")
        return reply.status(422).send({
          error: {
            code: "INVALID_REFERENCE",
            message: "O registro referenciado não existe ou está em uso.",
          },
        });
      if (e.code === "P2025")
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Registro não encontrado." },
        });
      if (["P2034", "P2028"].includes(e.code))
        return reply.status(409).send({
          error: {
            code: "TRANSACTION_CONFLICT",
            message:
              "Operação concorrente. Tente novamente com a mesma requestKey.",
          },
        });
    }
    if (statusCode && statusCode >= 400 && statusCode < 500)
      return reply
        .status(statusCode)
        .send({ error: { code: e.code ?? "BAD_REQUEST", message: e.message } });
    request.log.error(e);
    return reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "Erro interno. Consulte os logs do servidor.",
      },
    });
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({
      error: { code: "ROUTE_NOT_FOUND", message: "Endpoint não encontrado." },
    }),
  );

  app.get(
    "/health",
    {
      schema: {
        tags: ["Sistema"],
        summary: "Verificar API e conexão com o banco",
        response: s.responses(z.object({ status: z.literal("ok") })),
      },
    },
    async () => {
      try {
        await db.$queryRaw`SELECT 1`;
      } catch {
        throw new AppError(503, "DATABASE_UNAVAILABLE", "Banco indisponível.");
      }
      return { status: "ok" as const };
    },
  );

  app.get("/openapi.json", { schema: { hide: true } }, async () =>
    app.swagger(),
  );
  await app.register(catalogRoutes, { db, now });
  await app.register(inventoryRoutes, { db, now });
  await app.register(promotionsRoutes, { db, now });
  await app.register(reportsRoutes, { db, now });
  return app;
}
