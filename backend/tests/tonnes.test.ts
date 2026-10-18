import "dotenv/config";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { createDb } from "../src/db.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("Use um banco dedicado _test.");
const db = createDb(url);
const app = await buildApp({ db });
before(async () => {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url }, stdio: "pipe",
  });
  await app.ready();
});
after(async () => { await app.close(); await db.$disconnect(); });

async function post(path: string, payload?: object, status = 200) {
  const response = await app.inject({ method: "POST", url: path, payload });
  assert.equal(response.statusCode, status, response.body);
  return response.json();
}
async function get(path: string) {
  const response = await app.inject(path);
  assert.equal(response.statusCode, 200, response.body);
  return response.json();
}
async function fixture(initialQuantity = 0.25, unitPriceCents = 100000, unitCostCents = 50000) {
  const category = await post("/api/categories", { name: `Toneladas ${randomUUID()}` }, 201);
  const product = await post("/api/products", { name: "Produto a granel", sku: randomUUID(), categoryId: category.id }, 201);
  const body = { code: randomUUID(), productId: product.id, expiresAt: "2099-12-31", initialQuantity, unitCostCents, unitPriceCents, quantityUnit: "t" };
  const lot = await post("/api/lots", body, 201);
  assert.equal(lot.balance, initialQuantity);
  return { lot, body };
}
const movement = (quantity: number) => ({ quantity, quantityUnit: "t", requestKey: randomUUID() });

test("toneladas: saldo exato, promoção, persistência e todos os agrupamentos analíticos", async () => {
  const { lot } = await fixture();
  const promotion = await post("/api/promotions", { lotId: lot.id, discountPercent: 20 }, 201);
  const input = movement(0.1);
  const sale = await post(`/api/lots/${lot.id}/sales`, input);
  assert.equal(sale.balance, 0.15);
  const replay = await post(`/api/lots/${lot.id}/sales`, input);
  assert.equal(replay.replayed, true);
  assert.equal(replay.movement.id, sale.movement.id);
  await post(`/api/lots/${lot.id}/sales`, { ...input, quantity: 0.101 }, 409);
  const discard = await post(`/api/lots/${lot.id}/discards`, { ...movement(0.025), reason: "Avaria" });
  assert.equal(discard.balance, 0.125);
  const saved = await db.lot.findUniqueOrThrow({ where: { id: lot.id } });
  assert.equal(saved.balance.toFixed(3), "0.125");
  const detail = await get(`/api/lots/${lot.id}`);
  assert.equal(detail.soldQuantity, 0.1);
  assert.equal(detail.discardedQuantity, 0.025);
  const results = await get(`/api/promotions/${promotion.id}/results`);
  assert.equal(results.remainingFromPromotion, 0.125);
  assert.equal(results.sellThroughPercent, 40);
  assert.equal(results.revenueCents, 8000);
  assert.equal(results.lossCents, 1250);
  await post("/api/etl/runs", undefined, 201);
  const summary = await get(`/api/analytics/summary?lotId=${lot.id}`);
  assert.equal(summary.soldQuantity, 0.1);
  assert.equal(summary.promotionalQuantity, 0.1);
  assert.equal(summary.discardedQuantity, 0.025);
  assert.equal(summary.revenueCents, results.revenueCents);
  assert.equal(summary.lossCents, results.lossCents);
  for (const groupBy of ["day", "month", "category", "product", "lot"]) {
    const groups = await get(`/api/analytics/groups?lotId=${lot.id}&groupBy=${groupBy}`);
    assert.equal(groups.data[0].soldQuantity, 0.1);
    assert.equal(groups.data[0].discardedQuantity, 0.025);
  }
  const rollup = await get(`/api/analytics/rollup?lotId=${lot.id}`);
  assert.deepEqual(rollup.data.map((row: { soldQuantity: number }) => row.soldQuantity), [0.1, 0.1, 0.1, 0.1]);
  assert.equal((await get("/api/dashboard/stock")).totalUnits, undefined);
});

test("toneladas: API rejeita unidade ausente/errada e precisão excessiva sem alterar saldo", async () => {
  const { lot, body } = await fixture();
  for (const quantityUnit of [undefined, "kg", "un"]) {
    await post("/api/lots", { ...body, code: randomUUID(), quantityUnit }, 400);
    await post(`/api/lots/${lot.id}/sales`, { ...movement(0.1), quantityUnit }, 400);
    await post(`/api/lots/${lot.id}/discards`, { ...movement(0.1), reason: "Avaria", quantityUnit }, 400);
  }
  for (const quantity of [0, -0.001, 0.0001, 0.2501, 1000000.001]) {
    await post("/api/lots", { ...body, code: randomUUID(), initialQuantity: quantity }, 400);
    await post(`/api/lots/${lot.id}/sales`, movement(quantity), 400);
  }
  await post(`/api/lots/${lot.id}/sales`, movement(0.251), 409);
  assert.equal((await get(`/api/lots/${lot.id}`)).balance, 0.25);
  assert.equal(await db.movement.count({ where: { lotId: lot.id } }), 0);
});

test("toneladas: saídas concorrentes não permitem saldo negativo", async () => {
  const { lot } = await fixture();
  const responses = await Promise.all([1, 2].map(() => app.inject({
    method: "POST", url: `/api/lots/${lot.id}/sales`, payload: movement(0.2),
  })));
  assert.deepEqual(responses.map(r => r.statusCode).sort(), [200, 409]);
  assert.equal((await get(`/api/lots/${lot.id}`)).balance, 0.05);
});

test("toneladas: 0,100 + 0,200 esgota 0,300 sem resíduo; mínimo de 1 kg aceito", async () => {
  const { lot } = await fixture(0.3);
  await post(`/api/lots/${lot.id}/sales`, movement(0.1));
  await post(`/api/lots/${lot.id}/sales`, movement(0.2));
  assert.equal((await get(`/api/lots/${lot.id}`)).status, "EMPTY");
  await post(`/api/lots/${lot.id}/sales`, movement(0.001), 409);
  const small = await fixture(0.009);
  await post(`/api/lots/${small.lot.id}/sales`, movement(0.001));
  assert.equal((await get(`/api/lots/${small.lot.id}`)).balance, 0.008);
});

test("toneladas: meio centavo arredonda para cima por movimentação, no resultado e no ETL", async () => {
  const { lot } = await fixture(0.01, 1000, 500);
  const promotion = await post("/api/promotions", { lotId: lot.id, discountPercent: 50 }, 201);
  for (let index = 0; index < 2; index++) {
    await post(`/api/lots/${lot.id}/sales`, movement(0.001));
    await post(`/api/lots/${lot.id}/discards`, { ...movement(0.001), reason: "Avaria" });
  }
  const results = await get(`/api/promotions/${promotion.id}/results`);
  assert.equal(results.revenueCents, 2);
  assert.equal(results.lossCents, 2);
  await post("/api/etl/runs", undefined, 201);
  const summary = await get(`/api/analytics/summary?lotId=${lot.id}`);
  assert.equal(summary.revenueCents, 2);
  assert.equal(summary.lossCents, 2);
  assert.equal(summary.promotionalQuantity, 0.002);
  assert.equal(summary.discardedQuantity, 0.002);
});
