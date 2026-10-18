import { Prisma, type PrismaClient } from "@prisma/client";
import { safeNumber } from "./domain.js";
import type { AnalyticQuery, RollupQuery } from "./schemas.js";

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

/** Filtros de fatiamento (slice/dice) compartilhados pelas consultas. Aliases: f, p, l. */
function filterConditions(query: RollupQuery): Prisma.Sql[] {
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
  return conditions;
}

export async function queryAnalytics(
  db: PrismaClient,
  query: AnalyticQuery,
  grouped: boolean,
) {
  const conditions = filterConditions(query);
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

type RollupRaw = Record<string, bigint | number | string | null>;
const metric = (v: RollupRaw[string] | undefined) =>
  typeof v === "bigint" ? safeNumber(v) : Number(v ?? 0);

/**
 * Roll-up dia > mês > ano em uma única consulta (GROUP BY ROLLUP).
 * Cada linha traz `level` (day | month | year | total): os subtotais de mês, ano e o
 * total geral vêm junto com os dias, na ordem cronológica.
 */
export async function queryRollup(db: PrismaClient, query: RollupQuery) {
  const conditions = filterConditions(query);
  return db.$transaction(
    async (tx) => {
      const latest = await tx.etlRun.findFirst({
        where: { status: "COMPLETED" },
        orderBy: { finishedAt: "desc" },
      });
      const rows = await tx.$queryRaw<RollupRaw[]>(Prisma.sql`
      SELECT d.year AS "year", d.month AS "month", d.id AS "day",
        GROUPING(d.year) AS "groupedYear",
        GROUPING(d.month) AS "groupedMonth",
        GROUPING(d.id) AS "groupedDay",
        ${measures}
      FROM "FactMovement" f
      JOIN "DimDate" d ON d.id = f."dateId"
      JOIN "DimProduct" p ON p.id = f."productId"
      JOIN "DimLot" l ON l.id = f."lotId"
      WHERE ${Prisma.join(conditions, " AND ")}
      GROUP BY ROLLUP (d.year, d.month, d.id)
      ORDER BY d.year NULLS LAST, d.month NULLS LAST, d.id NULLS LAST
    `);
      const data = rows.map((row) => {
        const level =
          Number(row.groupedYear) === 1
            ? "total"
            : Number(row.groupedMonth) === 1
              ? "year"
              : Number(row.groupedDay) === 1
                ? "month"
                : "day";
        const year = row.year === null ? null : Number(row.year);
        const month = row.month === null ? null : Number(row.month);
        return {
          level,
          year,
          month:
            year !== null && month !== null
              ? `${year}-${String(month).padStart(2, "0")}`
              : null,
          day: level === "day" ? String(row.day) : null,
          soldQuantity: metric(row.soldQuantity),
          promotionalUnits: metric(row.promotionalUnits),
          discardedQuantity: metric(row.discardedQuantity),
          revenueCents: metric(row.revenueCents),
          promotionalRevenueCents: metric(row.promotionalRevenueCents),
          lossCents: metric(row.lossCents),
        };
      });
      return { lastEtlAt: latest?.finishedAt ?? null, data };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
