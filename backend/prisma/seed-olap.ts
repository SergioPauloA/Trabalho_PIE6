import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createDb } from "../src/db.js";
import {
  closePromotion,
  createPromotion,
  localDate,
  recordMovement,
} from "../src/domain.js";
import { runEtl } from "../src/etl/service.js";

/**
 * Dados extras para demonstrar o painel OLAP: 3 categorias, 5 produtos e 8 lotes com
 * vendas, promoções e descartes distribuídos nos três últimos meses (mês atual e dois
 * anteriores). Usa as mesmas regras da API (recordMovement/createPromotion), então o
 * saldo e os preços ficam coerentes. Reexecutar não duplica: lotes OLAP-* já criados
 * são preservados. Ao final executa o ETL.
 */

type Entry = { monthsAgo: number; day: number; quantity: number };
type LotSeed = {
  code: string;
  sku: string;
  initialQuantity: number;
  unitCostCents: number;
  unitPriceCents: number;
  discountPercent: number;
  plain: Entry[]; // vendas sem promoção (antes de abri-la)
  promo: Entry[]; // vendas durante a promoção
  discards: Entry[];
};

const PRODUCTS = [
  { sku: "OLAP-001", name: "Iogurte grego 170g", category: "Laticínios" },
  { sku: "OLAP-002", name: "Queijo mussarela 500g", category: "Laticínios" },
  { sku: "OLAP-003", name: "Biscoito recheado 140g", category: "Mercearia" },
  { sku: "OLAP-004", name: "Macarrão espaguete 500g", category: "Mercearia" },
  { sku: "OLAP-005", name: "Alface crespa unidade", category: "Hortifruti" },
];

const LOTS: LotSeed[] = [
  {
    code: "OLAP-IOG-A", sku: "OLAP-001", initialQuantity: 0.2,
    unitCostCents: 150000, unitPriceCents: 400000, discountPercent: 25,
    plain: [{ monthsAgo: 2, day: 5, quantity: 0.04 }],
    promo: [
      { monthsAgo: 2, day: 12, quantity: 0.07 },
      { monthsAgo: 2, day: 15, quantity: 0.05 },
    ],
    discards: [{ monthsAgo: 2, day: 20, quantity: 0.02 }],
  },
  {
    code: "OLAP-IOG-B", sku: "OLAP-001", initialQuantity: 0.15,
    unitCostCents: 160000, unitPriceCents: 420000, discountPercent: 30,
    plain: [{ monthsAgo: 1, day: 6, quantity: 0.03 }],
    promo: [
      { monthsAgo: 1, day: 14, quantity: 0.04 },
      { monthsAgo: 1, day: 18, quantity: 0.035 },
    ],
    discards: [{ monthsAgo: 1, day: 25, quantity: 0.01 }],
  },
  {
    code: "OLAP-QUE-A", sku: "OLAP-002", initialQuantity: 0.08,
    unitCostCents: 1800000, unitPriceCents: 3200000, discountPercent: 20,
    plain: [],
    promo: [
      { monthsAgo: 2, day: 10, quantity: 0.025 },
      { monthsAgo: 2, day: 14, quantity: 0.02 },
    ],
    discards: [{ monthsAgo: 2, day: 22, quantity: 0.008 }],
  },
  {
    code: "OLAP-QUE-B", sku: "OLAP-002", initialQuantity: 0.06,
    unitCostCents: 1850000, unitPriceCents: 3300000, discountPercent: 35,
    plain: [{ monthsAgo: 1, day: 4, quantity: 0.01 }],
    promo: [
      { monthsAgo: 1, day: 9, quantity: 0.022 },
      { monthsAgo: 1, day: 12, quantity: 0.018 },
    ],
    discards: [{ monthsAgo: 1, day: 27, quantity: 0.006 }],
  },
  {
    code: "OLAP-BIS-A", sku: "OLAP-003", initialQuantity: 0.3,
    unitCostCents: 180000, unitPriceCents: 450000, discountPercent: 40,
    plain: [{ monthsAgo: 1, day: 3, quantity: 0.06 }],
    promo: [
      { monthsAgo: 1, day: 8, quantity: 0.09 },
      { monthsAgo: 1, day: 16, quantity: 0.07 },
    ],
    discards: [{ monthsAgo: 1, day: 28, quantity: 0.012 }],
  },
  {
    code: "OLAP-BIS-B", sku: "OLAP-003", initialQuantity: 0.25,
    unitCostCents: 190000, unitPriceCents: 470000, discountPercent: 30,
    plain: [{ monthsAgo: 0, day: 2, quantity: 0.04 }],
    promo: [
      { monthsAgo: 0, day: 5, quantity: 0.055 },
      { monthsAgo: 0, day: 9, quantity: 0.045 },
    ],
    discards: [{ monthsAgo: 0, day: 10, quantity: 0.005 }],
  },
  {
    code: "OLAP-MAC-A", sku: "OLAP-004", initialQuantity: 0.2,
    unitCostCents: 350000, unitPriceCents: 790000, discountPercent: 25,
    plain: [{ monthsAgo: 2, day: 3, quantity: 0.05 }],
    promo: [
      { monthsAgo: 2, day: 11, quantity: 0.06 },
      { monthsAgo: 2, day: 17, quantity: 0.04 },
    ],
    discards: [{ monthsAgo: 2, day: 26, quantity: 0.015 }],
  },
  {
    code: "OLAP-ALF-A", sku: "OLAP-005", initialQuantity: 0.09,
    unitCostCents: 200000, unitPriceCents: 450000, discountPercent: 50,
    plain: [{ monthsAgo: 0, day: 1, quantity: 0.02 }],
    promo: [
      { monthsAgo: 0, day: 4, quantity: 0.03 },
      { monthsAgo: 0, day: 8, quantity: 0.02 },
    ],
    discards: [{ monthsAgo: 0, day: 12, quantity: 0.01 }],
  },
];

if (!process.env.DATABASE_URL) throw new Error("Defina DATABASE_URL.");
const db = createDb(process.env.DATABASE_URL);

// Dia civil atual em America/Sao_Paulo (yyyy-mm-dd).
const [todayYear, todayMonth, todayDay] = localDate().split("-").map(Number) as [
  number,
  number,
  number,
];

/** Meio-dia em São Paulo (15:00 UTC) do dia pedido; nunca no futuro. */
function at({ monthsAgo, day }: Entry): Date {
  const monthIndex = todayMonth - 1 - monthsAgo;
  const safeDay = monthsAgo === 0 ? Math.min(day, todayDay) : day;
  return new Date(Date.UTC(todayYear, monthIndex, safeDay, 15, 0, 0));
}

try {
  const categories = new Map<string, string>();
  for (const name of new Set(PRODUCTS.map((p) => p.category))) {
    const row = await db.category.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    categories.set(name, row.id);
  }
  const productIds = new Map<string, string>();
  for (const p of PRODUCTS) {
    const row = await db.product.upsert({
      where: { sku: p.sku },
      create: {
        name: p.name,
        sku: p.sku,
        categoryId: categories.get(p.category)!,
      },
      update: {},
    });
    productIds.set(p.sku, row.id);
  }

  // Validade bem à frente da primeira movimentação: vendas históricas continuam válidas.
  const expiresAt = new Date(Date.parse(localDate()) + 120 * 86_400_000);
  let created = 0;
  for (const seed of LOTS) {
    if (await db.lot.findUnique({ where: { code: seed.code } })) continue;
    const lot = await db.lot.create({
      data: {
        code: seed.code,
        productId: productIds.get(seed.sku)!,
        expiresAt,
        initialQuantity: seed.initialQuantity,
        balance: seed.initialQuantity,
        unitCostCents: seed.unitCostCents,
        unitPriceCents: seed.unitPriceCents,
      },
    });
    for (const e of seed.plain)
      await recordMovement(
        db, lot.id, "SALE",
        { quantity: e.quantity, requestKey: randomUUID() }, at(e),
      );
    const firstPromo = seed.promo[0]!;
    const promotion = await createPromotion(
      db, lot.id, seed.discountPercent, at(firstPromo),
    );
    for (const e of seed.promo)
      await recordMovement(
        db, lot.id, "SALE",
        { quantity: e.quantity, requestKey: randomUUID() }, at(e),
      );
    for (const e of seed.discards)
      await recordMovement(
        db, lot.id, "DISCARD",
        {
          quantity: e.quantity,
          reason: "Avaria na embalagem (demonstração)",
          requestKey: randomUUID(),
        },
        at(e),
      );
    await closePromotion(db, promotion.id);
    created += 1;
  }

  const run = await runEtl(db);
  console.log(
    `Seed OLAP: ${created} lote(s) novo(s) de ${LOTS.length}. ETL ${run.id}: ${run.processedCount} movimentações.`,
  );
} finally {
  await db.$disconnect();
}
