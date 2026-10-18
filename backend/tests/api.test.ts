import "dotenv/config";
import type { HTTPMethods } from "fastify";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { createDb } from "../src/db.js";
import { dayDifference, localDate, recordMovement } from "../src/domain.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error(
    "TEST_DATABASE_URL deve apontar para um banco dedicado cujo nome termine em _test.",
  );
const db = createDb(url);
const clock = new Date();
const today = localDate(clock);
const dateOffset = (days: number) =>
  new Date(Date.parse(today) + days * 86400000).toISOString().slice(0, 10);
const app = await buildApp({ db, now: () => clock });
async function call(method: HTTPMethods, path: string, payload?: object) {
  if (method === "POST" && (path === "/api/lots" || /\/(sales|discards)$/.test(path)))
    payload = { quantityUnit: "t", ...payload };
  const response = await app.inject({ method, url: path, payload });
  return {
    status: response.statusCode,
    body: response.json(),
    headers: response.headers,
  };
}
async function fixture(quantity = 100, expiresAt = dateOffset(10)) {
  const category = await call("POST", "/api/categories", {
    name: `Teste ${randomUUID()}`,
  });
  assert.equal(category.status, 201);
  const product = await call("POST", "/api/products", {
    name: "Produto de teste",
    sku: randomUUID(),
    categoryId: category.body.id,
  });
  assert.equal(product.status, 201);
  const lot = await call("POST", "/api/lots", {
    code: randomUUID(),
    productId: product.body.id,
    expiresAt,
    initialQuantity: quantity,
    unitCostCents: 500,
    unitPriceCents: 1000,
  });
  assert.equal(lot.status, 201, JSON.stringify(lot.body));
  return { category: category.body, product: product.body, lot: lot.body };
}
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

test("fluxo 100 -> venda 60 -> descarte 10, persistência e resultados da promoção", async () => {
  const { lot } = await fixture();
  const promo = await call("POST", "/api/promotions", {
    lotId: lot.id,
    discountPercent: 30,
  });
  assert.equal(promo.status, 201, JSON.stringify(promo.body));
  assert.equal(promo.body.unitPriceCents, 700);
  const sale = await call("POST", `/api/lots/${lot.id}/sales`, {
    quantity: 60,
    requestKey: randomUUID(),
  });
  assert.equal(sale.status, 200, JSON.stringify(sale.body));
  assert.equal(sale.body.movement.promotionId, promo.body.id);
  const discard = await call("POST", `/api/lots/${lot.id}/discards`, {
    quantity: 10,
    reason: "Embalagem danificada",
    requestKey: randomUUID(),
  });
  assert.equal(discard.status, 200);
  assert.equal(discard.body.balance, 30);
  assert.equal(
    (await call("POST", `/api/promotions/${promo.body.id}/close`)).status,
    200,
  );
  const result = await call("GET", `/api/promotions/${promo.body.id}/results`);
  assert.equal(result.status, 200);
  assert.deepEqual(
    {
      sold: result.body.soldQuantity,
      discarded: result.body.discardedQuantity,
      balance: result.body.currentLotBalance,
      revenue: result.body.revenueCents,
      loss: result.body.lossCents,
      percent: result.body.sellThroughPercent,
    },
    {
      sold: 60,
      discarded: 10,
      balance: 30,
      revenue: 42000,
      loss: 5000,
      percent: 60,
    },
  );
  const secondApp = await buildApp({ db });
  const saved = await secondApp.inject(`/api/lots/${lot.id}`);
  assert.equal(saved.json().balance, 30);
  assert.equal(saved.json().soldQuantity, 60);
  await secondApp.close();
  const closedAgain = await call(
    "POST",
    `/api/promotions/${promo.body.id}/close`,
  );
  assert.equal(closedAgain.body.endedAt, result.body.promotion.endedAt);
  const laterSale = await call("POST", `/api/lots/${lot.id}/sales`, {
    quantity: 1,
    requestKey: randomUUID(),
  });
  assert.equal(laterSale.body.movement.unitPriceCents, 1000);
  assert.equal(laterSale.body.movement.promotionId, null);
  assert.equal(
    (await call("GET", `/api/promotions/${promo.body.id}/results`)).body
      .remainingFromPromotion,
    30,
  );
});

test("requestKey impede duplicação e detecta uso com outra quantidade", async () => {
  const { lot } = await fixture();
  const input = { quantity: 10, requestKey: randomUUID() };
  const first = await call("POST", `/api/lots/${lot.id}/sales`, input);
  const repeat = await call("POST", `/api/lots/${lot.id}/sales`, input);
  assert.equal(first.body.movement.id, repeat.body.movement.id);
  assert.equal(repeat.body.replayed, true);
  assert.equal(repeat.body.balance, 90);
  const conflict = await call("POST", `/api/lots/${lot.id}/sales`, {
    ...input,
    quantity: 11,
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, "IDEMPOTENCY_CONFLICT");
});

test("venda e descarte concorrentes nunca ultrapassam o estoque", async () => {
  const { lot } = await fixture();
  const results = await Promise.all([
    call("POST", `/api/lots/${lot.id}/sales`, {
      quantity: 70,
      requestKey: randomUUID(),
    }),
    call("POST", `/api/lots/${lot.id}/discards`, {
      quantity: 70,
      reason: "Quebra",
      requestKey: randomUUID(),
    }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await call("GET", `/api/lots/${lot.id}`)).body.balance, 30);
  assert.equal(await db.movement.count({ where: { lotId: lot.id } }), 1);
});

test("duas requisições simultâneas com a mesma chave baixam apenas uma vez", async () => {
  const { lot } = await fixture();
  const payload = { quantity: 70, requestKey: randomUUID() };
  const results = await Promise.all([
    call("POST", `/api/lots/${lot.id}/sales`, payload),
    call("POST", `/api/lots/${lot.id}/sales`, payload),
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    [200, 200],
  );
  assert.equal(results[0]!.body.movement.id, results[1]!.body.movement.id);
  assert.equal((await call("GET", `/api/lots/${lot.id}`)).body.balance, 30);
});

test("apenas uma promoção ativa por lote, inclusive sob concorrência", async () => {
  const { lot } = await fixture();
  const results = await Promise.all(
    [20, 30].map((discountPercent) =>
      call("POST", "/api/promotions", { lotId: lot.id, discountPercent }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  await assert.rejects(
    db.promotion.create({
      data: {
        lotId: lot.id,
        discountPercent: 10,
        unitPriceCents: 900,
        initialQuantity: 100,
      },
    }),
  );
});

test("vencidos bloqueiam venda/promoção, mas aceitam descarte; validade de hoje é inclusiva", async () => {
  const { lot } = await fixture(100, dateOffset(-1));
  assert.equal(
    (
      await call("POST", `/api/lots/${lot.id}/sales`, {
        quantity: 1,
        requestKey: randomUUID(),
      })
    ).body.error.code,
    "EXPIRED_LOT",
  );
  assert.equal(
    (
      await call("POST", "/api/promotions", {
        lotId: lot.id,
        discountPercent: 30,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call("POST", `/api/lots/${lot.id}/discards`, {
        quantity: 1,
        reason: "Vencimento",
        requestKey: randomUUID(),
      })
    ).status,
    200,
  );
  const current = await fixture(100, today);
  assert.equal(
    (
      await call("POST", `/api/lots/${current.lot.id}/sales`, {
        quantity: 1,
        requestKey: randomUUID(),
      })
    ).status,
    200,
  );
  assert.equal(localDate(new Date("2026-10-17T01:30:00Z")), "2026-10-16");
  assert.equal(
    dayDifference(new Date("2026-10-16"), new Date("2026-10-17T01:30:00Z")),
    0,
  );
});

test("validação rejeita dados inválidos, preços enviados na venda e IDs inválidos", async () => {
  const { lot, product } = await fixture();
  for (const payload of [
    { quantity: -1, requestKey: randomUUID() },
    { quantity: 1.0001, requestKey: randomUUID() },
    { quantity: 0, requestKey: randomUUID() },
    { quantity: 1 },
    { quantity: 1, requestKey: randomUUID(), unitPriceCents: 1 },
  ]) {
    assert.equal(
      (await call("POST", `/api/lots/${lot.id}/sales`, payload)).status,
      400,
    );
  }
  assert.equal(
    (
      await call("POST", "/api/lots", {
        code: randomUUID(),
        productId: product.id,
        expiresAt: "2026-02-30",
        initialQuantity: 10,
        unitCostCents: 10,
        unitPriceCents: 20,
      })
    ).status,
    400,
  );
  assert.equal((await call("GET", "/api/lots/not-a-uuid")).status, 400);
  assert.equal((await call("GET", `/api/lots/${randomUUID()}`)).status, 404);
  assert.equal(
    (await call("GET", "/api/analytics/summary?from=2026-10-31&to=2026-10-01"))
      .status,
    400,
  );
  assert.equal((await call("GET", "/api/products?pageSize=1000")).status, 400);
});

test("cadastro, busca, paginação, inativação e proteção de histórico", async () => {
  const { lot, product, category } = await fixture();
  assert.equal(
    (
      await call("PATCH", `/api/categories/${category.id}`, {
        name: `Renomeada ${randomUUID()}`,
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("PATCH", `/api/lots/${lot.id}`, { unitPriceCents: 1500 }))
      .status,
    200,
  );
  await call("POST", `/api/lots/${lot.id}/sales`, {
    quantity: 1,
    requestKey: randomUUID(),
  });
  assert.equal(
    (await call("PATCH", `/api/lots/${lot.id}`, { unitPriceCents: 2000 }))
      .status,
    409,
  );
  const found = await call("GET", `/api/lots?search=${lot.code}&pageSize=1`);
  assert.equal(found.body.data[0].id, lot.id);
  assert.equal(found.body.pagination.total, 1);
  assert.equal(
    (await call("GET", `/api/products?search=${product.sku}`)).body.data[0].id,
    product.id,
  );
  await call("PATCH", `/api/products/${product.id}`, { active: false });
  const renamed = await call("PATCH", `/api/products/${product.id}`, {
    name: "Nome corrigido",
  });
  assert.equal(renamed.body.active, false);
  assert.equal(
    (await call("PATCH", `/api/products/${product.id}`, {})).status,
    400,
  );
  assert.equal(
    (
      await call("POST", `/api/lots/${lot.id}/sales`, {
        quantity: 1,
        requestKey: randomUUID(),
      })
    ).status,
    409,
  );
  assert.equal(
    (await call("GET", `/api/movements?lotId=${lot.id}`)).body.pagination.total,
    1,
  );
});

test("alertas e painel refletem o saldo operacional e prazo configurado", async () => {
  const { lot } = await fixture(10, dateOffset(5));
  await call("PUT", "/api/settings", { alertDays: 3 });
  assert.equal((await call("GET", `/api/lots/${lot.id}`)).body.status, "OK");
  await call("PUT", "/api/settings", { alertDays: 10 });
  assert.equal(
    (await call("GET", `/api/lots?status=ATTENTION&search=${lot.code}`)).body
      .pagination.total,
    1,
  );
  await call("POST", `/api/lots/${lot.id}/sales`, {
    quantity: 10,
    requestKey: randomUUID(),
  });
  assert.equal((await call("GET", `/api/lots/${lot.id}`)).body.status, "EMPTY");
  assert.equal((await call("GET", "/api/dashboard/stock")).status, 200);
});

test("ETL atualiza análise, é idempotente e permite filtros/drill-down/roll-up", async () => {
  const { lot, category, product } = await fixture();
  const promo = await call("POST", "/api/promotions", {
    lotId: lot.id,
    discountPercent: 30,
  });
  await call("POST", `/api/lots/${lot.id}/sales`, {
    quantity: 60,
    requestKey: randomUUID(),
  });
  await call("POST", `/api/lots/${lot.id}/discards`, {
    quantity: 10,
    reason: "Avaria",
    requestKey: randomUUID(),
  });
  assert.equal(
    (await call("GET", `/api/analytics/summary?lotId=${lot.id}`)).body
      .soldQuantity,
    0,
  );
  const etl = await call("POST", "/api/etl/runs");
  assert.equal(etl.status, 201, JSON.stringify(etl.body));
  assert.equal(etl.body.status, "COMPLETED");
  const path = `/api/analytics/summary?lotId=${lot.id}&categoryId=${category.id}&productId=${product.id}&from=${today}&to=${today}&promotionId=${promo.body.id}`;
  const first = await call("GET", path);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.revenueCents, 42000);
  assert.equal(first.body.promotionalRevenueCents, 42000);
  assert.equal(first.body.lossCents, 5000);
  assert.equal(first.body.promotionalQuantity, 60);
  assert.ok(first.body.lastEtlAt);
  await call("POST", "/api/etl/runs");
  const repeated = await call("GET", path);
  const { lastEtlAt: _firstDate, ...firstTotals } = first.body;
  const { lastEtlAt: _secondDate, ...secondTotals } = repeated.body;
  assert.deepEqual(firstTotals, secondTotals);
  assert.equal(await db.factMovement.count({ where: { lotId: lot.id } }), 2);
  for (const groupBy of ["day", "month", "category", "product", "lot"]) {
    const group = await call(
      "GET",
      `/api/analytics/groups?lotId=${lot.id}&groupBy=${groupBy}`,
    );
    assert.equal(group.status, 200, JSON.stringify(group.body));
    assert.equal(group.body.data.length, 1);
    assert.equal(group.body.data[0].lossCents, 5000);
  }
  assert.equal(
    (
      await call(
        "GET",
        `/api/analytics/summary?lotId=${lot.id}&from=2000-01-01&to=2000-01-31`,
      )
    ).body.soldQuantity,
    0,
  );
  assert.equal(
    (await call("GET", `/api/etl/runs/${etl.body.id}`)).body.processedCount,
    etl.body.processedCount,
  );
});

test("ETL concorrente retorna conflito e preserva os fatos já publicados", async () => {
  let release!: () => void;
  let acquired!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const holder = db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(624601) AS acquired`;
      acquired();
      await gate;
    },
    { timeout: 10000 },
  );
  await ready;
  try {
    const count = await db.factMovement.count();
    const response = await call("POST", "/api/etl/runs");
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, "ETL_BUSY");
    assert.equal(await db.factMovement.count(), count);
    assert.ok(await db.etlRun.count({ where: { status: "FAILED" } }));
  } finally {
    release();
    await holder;
  }
});

test("falha durante a escrita do ETL reverte a carga inteira e mantém a última publicação", async () => {
  const beforeCount = await db.factMovement.count();
  const previousRun = await db.etlRun.findFirst({
    where: { status: "COMPLETED" },
    orderBy: { finishedAt: "desc" },
  });
  await db.$executeRaw`CREATE FUNCTION test_reject_fact() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Falha induzida pelo teste'; END; $$`;
  try {
    await db.$executeRaw`CREATE TRIGGER test_reject_fact_trigger BEFORE INSERT ON "FactMovement" FOR EACH ROW EXECUTE FUNCTION test_reject_fact()`;
    const response = await call("POST", "/api/etl/runs");
    assert.equal(response.status, 500);
    assert.equal(await db.factMovement.count(), beforeCount);
    const latest = await db.etlRun.findFirst({
      where: { status: "COMPLETED" },
      orderBy: { finishedAt: "desc" },
    });
    assert.equal(latest?.id, previousRun?.id);
  } finally {
    await db.$executeRaw`DROP TRIGGER IF EXISTS test_reject_fact_trigger ON "FactMovement"`;
    await db.$executeRaw`DROP FUNCTION test_reject_fact()`;
  }
});

test("filtros de datas respeitam o horário de verão histórico de São Paulo", async () => {
  const { lot } = await fixture();
  await recordMovement(db, lot.id, 'SALE', { quantity: 1, requestKey: randomUUID() }, new Date('2018-12-10T02:30:00Z'));
  const result = await call('GET', `/api/movements?lotId=${lot.id}&from=2018-12-10&to=2018-12-10`);
  assert.equal(result.status, 200);
  assert.equal(result.body.data.length, 1);
  assert.equal((await call('GET', `/api/movements?lotId=${lot.id}&from=2018-12-09&to=2018-12-09`)).body.data.length, 0);
  assert.equal((await call('GET', '/api/products?page=1000001')).status, 400);
});

test("health, OpenAPI, Swagger e CORS ficam disponíveis para os consumidores", async () => {
  assert.equal((await call("GET", "/health")).status, 200);
  const spec = await call("GET", "/openapi.json");
  assert.equal(spec.status, 200);
  assert.ok(spec.body.paths["/api/lots/{id}/sales"].post.requestBody);
  assert.ok(spec.body.paths["/api/analytics/summary"].get.responses["200"]);
  const docs = await app.inject("/docs/");
  assert.equal(docs.statusCode, 200);
  const preflight = await app.inject({
    method: "OPTIONS",
    url: "/api/products",
    headers: {
      origin: "http://localhost:5173",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });
  assert.equal(preflight.statusCode, 204);
  assert.equal(
    preflight.headers["access-control-allow-origin"],
    "http://localhost:5173",
  );
});
