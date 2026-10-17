import { Prisma, type MovementType, type PrismaClient } from "@prisma/client";

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const businessDateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
export function localDate(now = new Date()): string {
  return businessDateFormatter.format(now);
}
export function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
export function dayDifference(expiresAt: Date, now = new Date()): number {
  return Math.round(
    (Date.parse(dateOnly(expiresAt)) - Date.parse(localDate(now))) / 86_400_000,
  );
}
export function lotView<T extends { expiresAt: Date; balance: number }>(
  lot: T,
  alertDays: number,
  now = new Date(),
) {
  const daysUntilExpiry = dayDifference(lot.expiresAt, now);
  const status =
    lot.balance === 0
      ? "EMPTY"
      : daysUntilExpiry < 0
        ? "EXPIRED"
        : daysUntilExpiry <= alertDays
          ? "ATTENTION"
          : "OK";
  return {
    ...lot,
    expiresAt: dateOnly(lot.expiresAt),
    daysUntilExpiry,
    status,
  };
}
export function requireFound<T>(value: T | null, label = "Registro"): T {
  if (!value) throw new AppError(404, "NOT_FOUND", `${label} não encontrado.`);
  return value;
}
export function safeNumber(value: bigint | number): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n))
    throw new AppError(
      422,
      "TOTAL_OVERFLOW",
      "Total excede o limite numérico; reduza o período consultado.",
    );
  return n;
}
export async function lockLot(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "Lot" WHERE id = ${id}::uuid FOR UPDATE`;
  return requireFound(
    await tx.lot.findUnique({
      where: { id },
      include: { product: { include: { category: true } } },
    }),
    "Lote",
  );
}

export interface MovementInput {
  quantity: number;
  requestKey: string;
  reason?: string;
}
export async function recordMovement(
  db: PrismaClient,
  lotId: string,
  type: MovementType,
  input: MovementInput,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const lot = await lockLot(tx, lotId);
    const previous = await tx.movement.findUnique({
      where: { requestKey: input.requestKey },
    });
    if (previous) {
      if (
        previous.lotId !== lotId ||
        previous.type !== type ||
        previous.quantity !== input.quantity ||
        previous.reason !== (input.reason ?? null)
      ) {
        throw new AppError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "requestKey já utilizado com outros dados.",
        );
      }
      return { movement: previous, balance: lot.balance, replayed: true };
    }
    if (lot.balance < input.quantity)
      throw new AppError(
        409,
        "INSUFFICIENT_STOCK",
        "Quantidade maior que o saldo disponível.",
      );
    if (type === "SALE" && dayDifference(lot.expiresAt, now) < 0)
      throw new AppError(
        409,
        "EXPIRED_LOT",
        "Lote vencido não pode ser vendido.",
      );
    if (type === "SALE" && !lot.product.active)
      throw new AppError(
        409,
        "INACTIVE_PRODUCT",
        "Produto inativo não pode ser vendido.",
      );
    const promotion = await tx.promotion.findFirst({
      where: { lotId, status: "ACTIVE" },
    });
    const movement = await tx.movement.create({
      data: {
        lotId,
        type,
        quantity: input.quantity,
        reason: input.reason,
        requestKey: input.requestKey,
        promotionId: promotion?.id,
        unitCostCents: lot.unitCostCents,
        unitPriceCents:
          type === "SALE"
            ? (promotion?.unitPriceCents ?? lot.unitPriceCents)
            : 0,
        occurredAt: now,
      },
    });
    const updated = await tx.lot.update({
      where: { id: lotId },
      data: { balance: { decrement: input.quantity } },
    });
    return { movement, balance: updated.balance, replayed: false };
  });
}

export async function createPromotion(
  db: PrismaClient,
  lotId: string,
  discountPercent: number,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const lot = await lockLot(tx, lotId);
    if (dayDifference(lot.expiresAt, now) < 0)
      throw new AppError(
        409,
        "EXPIRED_LOT",
        "Lote vencido não pode entrar em promoção.",
      );
    if (lot.balance === 0)
      throw new AppError(409, "EMPTY_LOT", "Lote sem saldo.");
    if (!lot.product.active)
      throw new AppError(409, "INACTIVE_PRODUCT", "Produto inativo.");
    if (await tx.promotion.findFirst({ where: { lotId, status: "ACTIVE" } }))
      throw new AppError(
        409,
        "ACTIVE_PROMOTION",
        "Já existe uma promoção ativa para este lote.",
      );
    const unitPriceCents = Math.round(
      (lot.unitPriceCents * (100 - discountPercent)) / 100,
    );
    if (unitPriceCents < 1)
      throw new AppError(
        422,
        "INVALID_PRICE",
        "O preço promocional deve ser de pelo menos um centavo.",
      );
    return tx.promotion.create({
      data: {
        lotId,
        discountPercent,
        unitPriceCents,
        initialQuantity: lot.balance,
        startedAt: now,
      },
    });
  });
}

export async function closePromotion(db: PrismaClient, id: string) {
  return db.$transaction(async (tx) => {
    const promotion = requireFound(
      await tx.promotion.findUnique({ where: { id } }),
      "Promoção",
    );
    await lockLot(tx, promotion.lotId);
    const current = requireFound(
      await tx.promotion.findUnique({ where: { id } }),
    );
    if (current.status === "CLOSED") return current;
    return tx.promotion.update({
      where: { id },
      data: { status: "CLOSED", endedAt: new Date() },
    });
  });
}

export async function promotionResult(db: PrismaClient, id: string) {
  return db.$transaction(
    async (tx) => {
      const promotion = requireFound(
        await tx.promotion.findUnique({
          where: { id },
          include: { lot: { include: { product: true } } },
        }),
        "Promoção",
      );
      const movements = await tx.movement.findMany({
        where: { promotionId: id },
      });
      const soldQuantity = movements
        .filter((m) => m.type === "SALE")
        .reduce((n, m) => n + m.quantity, 0);
      const discardedQuantity = movements
        .filter((m) => m.type === "DISCARD")
        .reduce((n, m) => n + m.quantity, 0);
      return {
        promotion,
        soldQuantity,
        discardedQuantity,
        remainingFromPromotion:
          promotion.initialQuantity - soldQuantity - discardedQuantity,
        currentLotBalance: promotion.lot.balance,
        sellThroughPercent:
          Math.round((soldQuantity / promotion.initialQuantity) * 10000) / 100,
        revenueCents: safeNumber(
          movements
            .filter((m) => m.type === "SALE")
            .reduce(
              (n, m) => n + BigInt(m.quantity) * BigInt(m.unitPriceCents),
              0n,
            ),
        ),
        lossCents: safeNumber(
          movements
            .filter((m) => m.type === "DISCARD")
            .reduce(
              (n, m) => n + BigInt(m.quantity) * BigInt(m.unitCostCents),
              0n,
            ),
        ),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
