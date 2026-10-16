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

if (!process.env.DATABASE_URL) throw new Error("Defina DATABASE_URL.");
const db = createDb(process.env.DATABASE_URL);
try {
  const categories = await Promise.all(
    ["Laticínios", "Mercearia"].map((name) =>
      db.category.upsert({ where: { name }, create: { name }, update: {} }),
    ),
  );
  for (const [index, name] of [
    "Iogurte natural 170g",
    "Biscoito integral 200g",
  ].entries()) {
    const category = categories[index]!;
    const product = await db.product.upsert({
      where: { sku: `DEMO-00${index + 1}` },
      create: { name, sku: `DEMO-00${index + 1}`, categoryId: category.id },
      update: {},
    });
    const date = new Date();
    date.setUTCDate(10);
    date.setUTCMonth(date.getUTCMonth() - index);
    date.setUTCHours(15, 0, 0, 0);
    const code = `DEMO-HISTORICO-${index + 1}`;
    if (!(await db.lot.findUnique({ where: { code } }))) {
      const lot = await db.lot.create({
        data: {
          code,
          productId: product.id,
          expiresAt: new Date(
            Date.parse(localDate(new Date())) + 90 * 86_400_000,
          ),
          initialQuantity: 100,
          balance: 100,
          unitCostCents: 500,
          unitPriceCents: 1000,
        },
      });
      const promotion = await createPromotion(db, lot.id, 30, date);
      await recordMovement(
        db,
        lot.id,
        "SALE",
        { quantity: index === 0 ? 60 : 40, requestKey: randomUUID() },
        date,
      );
      await recordMovement(
        db,
        lot.id,
        "DISCARD",
        {
          quantity: 10,
          reason: "Avaria na embalagem (demonstração)",
          requestKey: randomUUID(),
        },
        date,
      );
      await closePromotion(db, promotion.id);
    }
  }
  const product = (await db.product.findUnique({
    where: { sku: "DEMO-001" },
  }))!;
  for (const [code, days] of [
    ["DEMO-ATENCAO", 5],
    ["DEMO-VENCIDO", -2],
  ] as const) {
    await db.lot.upsert({
      where: { code },
      create: {
        code,
        productId: product.id,
        expiresAt: new Date(Date.parse(localDate()) + days * 86_400_000),
        initialQuantity: 50,
        balance: 50,
        unitCostCents: 400,
        unitPriceCents: 800,
      },
      update: {},
    });
  }
  const run = await runEtl(db);
  console.log(
    `Dados de exemplo preservados/criados. ETL ${run.id}: ${run.processedCount} movimentações.`,
  );
} finally {
  await db.$disconnect();
}
