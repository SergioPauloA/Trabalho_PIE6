import { Prisma, type PrismaClient } from "@prisma/client";
import { AppError, localDate } from "../domain.js";

/** Carga completa e atômica para o volume acadêmico. Dimensões tipo 1. */
export async function runEtl(db: PrismaClient) {
  const run = await db.etlRun.create({ data: {} });
  try {
    return await db.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<
          { acquired: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(624601) AS acquired`;
        if (!lock?.acquired)
          throw new AppError(
            409,
            "ETL_BUSY",
            "Já há uma carga ETL em andamento.",
          );
        const products = await tx.product.findMany({
          include: { category: true },
        });
        const lots = await tx.lot.findMany();
        const promotions = await tx.promotion.findMany();
        const movements = await tx.movement.findMany();
        const byLot = new Map(lots.map((l) => [l.id, l]));
        const byPromotion = new Map(promotions.map((p) => [p.id, p]));
        const dates = [
          ...new Set(movements.map((m) => localDate(m.occurredAt))),
        ];
        const facts = movements.map((m) => {
          const lot = byLot.get(m.lotId);
          if (
            !lot ||
            m.quantity < 1 ||
            (m.promotionId && byPromotion.get(m.promotionId)?.lotId !== m.lotId)
          ) {
            throw new AppError(
              422,
              "INVALID_SOURCE_DATA",
              `Movimentação inconsistente: ${m.id}`,
            );
          }
          return {
            id: m.id,
            dateId: localDate(m.occurredAt),
            productId: lot.productId,
            lotId: lot.id,
            promotionId: m.promotionId ?? "none",
            type: m.type,
            quantity: m.quantity,
            revenueCents:
              m.type === "SALE"
                ? BigInt(m.quantity) * BigInt(m.unitPriceCents)
                : 0n,
            lossCents:
              m.type === "DISCARD"
                ? BigInt(m.quantity) * BigInt(m.unitCostCents)
                : 0n,
            promotionalUnits:
              m.type === "SALE" && m.promotionId ? m.quantity : 0,
          };
        });
        // Somente o destino analítico é substituído. A transação preserva a carga anterior em caso de falha.
        await tx.factMovement.deleteMany();
        await tx.dimDate.deleteMany();
        await tx.dimProduct.deleteMany();
        await tx.dimLot.deleteMany();
        await tx.dimPromotion.deleteMany();
        await tx.dimDate.createMany({
          data: dates.map((d) => ({
            id: d,
            year: Number(d.slice(0, 4)),
            month: Number(d.slice(5, 7)),
            day: Number(d.slice(8, 10)),
          })),
        });
        await tx.dimProduct.createMany({
          data: products.map((p) => ({
            id: p.id,
            name: p.name,
            categoryId: p.categoryId,
            categoryName: p.category.name,
          })),
        });
        await tx.dimLot.createMany({
          data: lots.map((l) => ({
            id: l.id,
            code: l.code,
            expiresAt: l.expiresAt,
          })),
        });
        await tx.dimPromotion.createMany({
          data: [
            { id: "none", discountPercent: 0 },
            ...promotions.map((p) => ({
              id: p.id,
              discountPercent: p.discountPercent,
            })),
          ],
        });
        // Lotes pequenos evitam exceder o limite de parâmetros do PostgreSQL.
        for (let i = 0; i < facts.length; i += 1000)
          await tx.factMovement.createMany({ data: facts.slice(i, i + 1000) });
        return tx.etlRun.update({
          where: { id: run.id },
          data: {
            status: "COMPLETED",
            processedCount: facts.length,
            finishedAt: new Date(),
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 60_000,
        maxWait: 5000,
      },
    );
  } catch (error) {
    await db.etlRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error:
          error instanceof AppError
            ? error.message
            : "Falha na carga. Verifique os logs da API.",
      },
    });
    throw error;
  }
}
