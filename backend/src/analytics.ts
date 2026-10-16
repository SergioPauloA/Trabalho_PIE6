import { Prisma, type PrismaClient } from "@prisma/client";
import { safeNumber } from "./domain.js";
import type { AnalyticQuery } from "./schemas.js";

const measures = Prisma.sql`
  COALESCE(SUM(CASE WHEN f.type = 'SALE' THEN f.quantity ELSE 0 END), 0)::bigint AS "soldQuantity",
  COALESCE(SUM(f."promotionalUnits"), 0)::bigint AS "promotionalUnits",
  COALESCE(SUM(CASE WHEN f.type = 'DISCARD' THEN f.quantity ELSE 0 END), 0)::bigint AS "discardedQuantity",
  COALESCE(SUM(f."revenueCents"), 0)::bigint AS "revenueCents",
  COALESCE(SUM(CASE WHEN f."promotionId" <> 'none' THEN f."revenueCents" ELSE 0 END), 0)::bigint AS "promotionalRevenueCents",
  COALESCE(SUM(f."lossCents"), 0)::bigint AS "lossCents"`;

const groups = {
  day: { key: Prisma.sql`f."dateId"`, label: Prisma.sql`f."dateId"` },
  month: {
    key: Prisma.sql`substring(f."dateId", 1, 7)`,
    label: Prisma.sql`substring(f."dateId", 1, 7)`,
  },
  category: {
    key: Prisma.sql`p."categoryId"::text`,
    label: Prisma.sql`p."categoryName"`,
  },
  product: { key: Prisma.sql`p.id::text`, label: Prisma.sql`p.name` },
  lot: { key: Prisma.sql`l.id::text`, label: Prisma.sql`l.code` },
};

export async function queryAnalytics(
  db: PrismaClient,
  query: AnalyticQuery,
  grouped: boolean,
) {
  const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (query.from) conditions.push(Prisma.sql`f."dateId" >= ${query.from}`);
  if (query.to) conditions.push(Prisma.sql`f."dateId" <= ${query.to}`);
  if (query.categoryId)
    conditions.push(Prisma.sql`p."categoryId" = ${query.categoryId}::uuid`);
  if (query.productId)
    conditions.push(Prisma.sql`p.id = ${query.productId}::uuid`);
  if (query.lotId) conditions.push(Prisma.sql`l.id = ${query.lotId}::uuid`);
  if (query.promotionId)
    conditions.push(Prisma.sql`f."promotionId" = ${query.promotionId}`);
  if (query.type)
    conditions.push(Prisma.sql`f.type = ${query.type}::"MovementType"`);
  const group = groups[query.groupBy];
  return db.$transaction(
    async (tx) => {
      const latest = await tx.etlRun.findFirst({
        where: { status: "COMPLETED" },
        orderBy: { finishedAt: "desc" },
      });
      const rows = await tx.$queryRaw<
        Record<string, bigint | string>[]
      >(Prisma.sql`
      SELECT ${grouped ? Prisma.sql`${group.key} AS key, ${group.label} AS label,` : Prisma.empty}
      ${measures}
      FROM "FactMovement" f
      JOIN "DimProduct" p ON p.id = f."productId"
      JOIN "DimLot" l ON l.id = f."lotId"
      WHERE ${Prisma.join(conditions, " AND ")}
      ${grouped ? Prisma.sql`GROUP BY ${group.key}, ${group.label} ORDER BY key` : Prisma.empty}
    `);
      const data = rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [
            k,
            typeof v === "bigint" ? safeNumber(v) : v,
          ]),
        ),
      );
      return grouped
        ? {
            lastEtlAt: latest?.finishedAt ?? null,
            groupBy: query.groupBy,
            data,
          }
        : { lastEtlAt: latest?.finishedAt ?? null, ...data[0] };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
