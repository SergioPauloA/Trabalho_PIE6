import type { PrismaClient } from '@prisma/client';

export interface RouteOptions { db: PrismaClient; now: () => Date }

export function pageMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

export function pageArgs(q: { page: number; pageSize: number }) {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

export async function period(db: PrismaClient, q: { from?: string; to?: string }) {
  if (!q.from && !q.to) return {};
  // O PostgreSQL resolve as regras históricas de DST; o fim é o próximo dia local.
  const [bounds] = await db.$queryRaw<{ start: Date | null; end: Date | null }[]>`
    SELECT (${q.from ?? null}::date)::timestamp AT TIME ZONE 'America/Sao_Paulo' AS start,
           (${q.to ?? null}::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo' AS end
  `;
  return {
    ...(bounds?.start ? { gte: bounds.start } : {}),
    ...(bounds?.end ? { lt: bounds.end } : {}),
  };
}
