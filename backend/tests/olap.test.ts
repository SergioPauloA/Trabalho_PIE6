import "dotenv/config";
import type { HTTPMethods } from "fastify";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { createDb } from "../src/db.js";
import { createPromotion, localDate, recordMovement } from "../src/domain.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error(
    "TEST_DATABASE_URL deve apontar para um banco dedicado cujo nome termine em _test.",
  );
const db = createDb(url);
const clock = new Date();
const app = await buildApp({ db, now: () => clock });
async function call(method: HTTPMethods, path: string, payload?: object) {
  const response = await app.inject({ method, url: path, payload });
  return { status: response.statusCode, body: response.json() };
}
const at = (day: string) => new Date(`${day}T15:00:00Z`);
const key = () => ({ requestKey: randomUUID() });

before(async () => {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" },
  );
  await app.ready();
});
after(async () => {
  await app.close();
  await db.$disconnect();
});

test("roll-up dia > mês > ano traz subtotais e total geral, e respeita os filtros", async () => {
  const category = await call("POST", "/api/categories", {
    name: `Rollup ${randomUUID()}`,
  });
  const product = await call("POST", "/api/products", {
    name: "Produto roll-up",
    sku: randomUUID(),
    categoryId: category.body.id,
  });
  const expiresAt = new Date(Date.parse(localDate()) + 10 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const lot = await call("POST", "/api/lots", {
    code: randomUUID(),
    productId: product.body.id,
    expiresAt,
    initialQuantity: 200,
    unitCostCents: 500,
    unitPriceCents: 1000,
  });
  assert.equal(lot.status, 201, JSON.stringify(lot.body));
  const lotId: string = lot.body.id;

  // Dois anos e dois meses: 2025-12 (sem promoção) e 2026-01 (com promoção de 30% = R$ 7,00).
  await recordMovement(db, lotId, "SALE", { quantity: 10, ...key() }, at("2025-12-30"));
  await recordMovement(db, lotId, "SALE", { quantity: 5, ...key() }, at("2026-01-05"));
  await createPromotion(db, lotId, 30, at("2026-01-10"));
  await recordMovement(db, lotId, "SALE", { quantity: 20, ...key() }, at("2026-01-10"));
  await recordMovement(db, lotId, "SALE", { quantity: 15, ...key() }, at("2026-01-12"));
  await recordMovement(
    db, lotId, "DISCARD",
    { quantity: 4, reason: "Avaria", ...key() }, at("2026-01-12"),
  );

  assert.equal((await call("POST", "/api/etl/runs")).status, 201);

  const rollup = await call("GET", `/api/analytics/rollup?lotId=${lotId}`);
  assert.equal(rollup.status, 200, JSON.stringify(rollup.body));
  assert.ok(rollup.body.lastEtlAt);
  const rows: Record<string, unknown>[] = rollup.body.data;

  // Ordem cronológica, com cada subtotal logo após os seus detalhes e o total por último.
  assert.deepEqual(
    rows.map((r) => r.level),
    ["day", "month", "year", "day", "day", "day", "month", "year", "total"],
  );
  assert.deepEqual(
    rows.map((r) => r.day ?? r.month ?? r.year),
    [
      "2025-12-30", "2025-12", 2025,
      "2026-01-05", "2026-01-10", "2026-01-12", "2026-01", 2026,
      null,
    ],
  );

  const pick = (level: string, label: string | number | null) =>
    rows.find((r) => r.level === level && (r.day ?? r.month ?? r.year) === label)!;
  assert.equal(pick("month", "2025-12").soldQuantity, 10);
  assert.equal(pick("month", "2025-12").revenueCents, 10_000);
  assert.equal(pick("month", "2025-12").promotionalUnits, 0);
  const jan = pick("month", "2026-01");
  assert.equal(jan.soldQuantity, 40); // 5 + 20 + 15
  assert.equal(jan.revenueCents, 29_500); // 5.000 + 14.000 + 10.500
  assert.equal(jan.promotionalUnits, 35);
  assert.equal(jan.promotionalRevenueCents, 24_500);
  assert.equal(jan.discardedQuantity, 4);
  assert.equal(jan.lossCents, 2_000);
  assert.equal(pick("year", 2026).soldQuantity, 40);

  // O total geral é a soma das partes e coincide com o resumo.
  const total = pick("total", null);
  assert.equal(total.soldQuantity, 50);
  assert.equal(total.promotionalUnits, 35);
  assert.equal(total.promotionalRevenueCents, 24_500);
  assert.equal(total.lossCents, 2_000);
  const summary = await call("GET", `/api/analytics/summary?lotId=${lotId}`);
  for (const field of [
    "soldQuantity", "promotionalUnits", "discardedQuantity",
    "revenueCents", "promotionalRevenueCents", "lossCents",
  ])
    assert.equal(total[field], summary.body[field], field);

  // Fatiamento: período e tipo.
  const onlyJan = await call(
    "GET",
    `/api/analytics/rollup?lotId=${lotId}&from=2026-01-01&to=2026-01-31`,
  );
  assert.deepEqual(
    onlyJan.body.data.map((r: { level: string }) => r.level),
    ["day", "day", "day", "month", "year", "total"],
  );
  assert.equal(onlyJan.body.data.at(-1).soldQuantity, 40);
  const onlyDiscards = await call(
    "GET",
    `/api/analytics/rollup?lotId=${lotId}&type=DISCARD`,
  );
  assert.equal(onlyDiscards.body.data.at(-1).soldQuantity, 0);
  assert.equal(onlyDiscards.body.data.at(-1).discardedQuantity, 4);

  // Sem movimentações no filtro: apenas o total, zerado.
  const empty = await call(
    "GET",
    `/api/analytics/rollup?lotId=${lotId}&from=2000-01-01&to=2000-01-31`,
  );
  assert.equal(empty.status, 200);
  assert.deepEqual(
    empty.body.data.map((r: { level: string }) => r.level),
    ["total"],
  );
  assert.equal(empty.body.data[0].soldQuantity, 0);

  // Entradas inválidas.
  assert.equal(
    (await call("GET", "/api/analytics/rollup?from=2026-02-01&to=2026-01-01")).status,
    400,
  );
  assert.equal((await call("GET", "/api/analytics/rollup?lotId=abc")).status, 400);
});
