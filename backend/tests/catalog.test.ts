import "dotenv/config";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { createDb } from "../src/db.js";
import { recordMovement } from "../src/domain.js";
import { loadCatalog, readCatalog } from "../prisma/catalog/load.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("Use um banco dedicado _test.");
const db = createDb(url);
before(() => {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
});
after(() => db.$disconnect());

test("carga de catálogo permite só cadastros e repetição preserva saldos, preços, validades e edições", async () => {
  const catalog = readCatalog();
  assert.equal(catalog.products.length, 24);
  assert.equal(new Set(catalog.products.map(p => p.category)).size, 6);
  // This prefix belongs exclusively to this seed's isolated test fixture.
  const codes = catalog.products.map(p => `DEMO-CATALOGO-${p.sku}`);
  const lotsBefore = await db.lot.count({ where: { code: { in: codes } } });
  await loadCatalog(db, { catalogOnly: true });
  assert.equal(await db.lot.count({ where: { code: { in: codes } } }), lotsBefore);
  assert.equal(await db.product.count({ where: { sku: { in: catalog.products.map(p => p.sku) } } }), 24);

  await loadCatalog(db);
  const lot = await db.lot.findUniqueOrThrow({ where: { code: codes[0]! } });
  // A legitimate operation and user edits must survive subsequent loads.
  await recordMovement(db, lot.id, "SALE", { quantity: 0.001, requestKey: randomUUID() });
  await db.product.update({ where: { id: lot.productId }, data: { name: "Arroz revisado pelo usuário" } });
  await db.lot.update({ where: { id: lot.id }, data: { unitPriceCents: 777777 } });
  const repeat = await loadCatalog(db, { now: new Date("2030-01-01T12:00:00Z") });
  assert.equal(repeat.productsCreated, 0);
  assert.equal(repeat.lotsCreated, 0);
  assert.equal(repeat.lotsPreserved, 24);
  assert.equal(repeat.addedTonnes, "0.000");
  const saved = await db.lot.findUniqueOrThrow({ where: { id: lot.id }, include: { product: true } });
  assert.equal(saved.balance.toFixed(3), lot.balance.minus(0.001).toFixed(3));
  assert.equal(saved.expiresAt.toISOString(), lot.expiresAt.toISOString());
  assert.equal(saved.unitPriceCents, 777777);
  assert.equal(saved.product.name, "Arroz revisado pelo usuário");
  assert.equal(saved.product.barcode, null);
});
