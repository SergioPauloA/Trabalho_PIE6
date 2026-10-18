import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Teste de rede real; cria somente registros identificados como HTTP-SMOKE.
const base = (process.env.API_URL ?? 'http://localhost:3334').replace(/\/$/, '');
const runId = randomUUID();
let requests = 0;
async function request(method, path, body, expected = 200) {
  if (method === 'POST' && (path === '/api/lots' || /\/(sales|discards)$/.test(path))) body = { quantityUnit: 't', ...body };
  const response = await fetch(base + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(70_000),
  });
  const text = await response.text();
  assert.equal(response.status, expected, `${method} ${path}: ${text}`);
  requests++;
  console.log(`${method.padEnd(7)} ${path} -> ${response.status}`);
  return text ? JSON.parse(text) : null;
}
await request('GET', '/health');
const category = await request('POST', '/api/categories', { name: `HTTP-SMOKE ${runId}` }, 201);
const product = await request('POST', '/api/products', { name: 'Produto HTTP-SMOKE', sku: runId, categoryId: category.id }, 201);
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
assert.match(product.id, uuidV4);
await request('PATCH', `/api/products/${product.id}`, { name: 'Produto HTTP-SMOKE revisado' });
const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const lot = await request('POST', '/api/lots', { code: `HTTP-SMOKE-${runId}`, productId: product.id, expiresAt, initialQuantity: 1, unitCostCents: 50000, unitPriceCents: 100000 }, 201);
const promotion = await request('POST', '/api/promotions', { lotId: lot.id, discountPercent: 30 }, 201);
assert.equal(promotion.unitPriceCents, 70000);
const saleInput = { quantity: 0.6, requestKey: randomUUID() };
const sale = await request('POST', `/api/lots/${lot.id}/sales`, saleInput);
const repeated = await request('POST', `/api/lots/${lot.id}/sales`, saleInput);
assert.equal(sale.movement.id, repeated.movement.id);
assert.equal(repeated.replayed, true);
await request('POST', `/api/lots/${lot.id}/discards`, { quantity: 0.1, requestKey: randomUUID(), reason: 'Avaria - HTTP-SMOKE' });
const oversell = await request('POST', `/api/lots/${lot.id}/sales`, { quantity: 0.31, requestKey: randomUUID() }, 409);
assert.equal(oversell.error.code, 'INSUFFICIENT_STOCK');
await request('POST', `/api/lots/${lot.id}/sales`, { quantity: -1, requestKey: randomUUID() }, 400);
const detail = await request('GET', `/api/lots/${lot.id}`);
assert.equal(detail.balance, 0.3);
assert.equal(detail.soldQuantity, 0.6);
assert.equal(detail.discardedQuantity, 0.1);
await request('POST', `/api/promotions/${promotion.id}/close`);
const result = await request('GET', `/api/promotions/${promotion.id}/results`);
assert.equal(result.revenueCents, 42000);
assert.equal(result.lossCents, 5000);
const settings = await request('GET', '/api/settings');
await request('PUT', '/api/settings', { alertDays: settings.alertDays });
await request('POST', '/api/etl/runs', undefined, 201);
const summary = await request('GET', `/api/analytics/summary?lotId=${lot.id}`);
assert.equal(summary.promotionalQuantity, 0.6);
assert.equal(summary.promotionalRevenueCents, 42000);
assert.equal(summary.lossCents, 5000);
const groups = await request('GET', `/api/analytics/groups?groupBy=lot&lotId=${lot.id}`);
assert.equal(groups.data[0].key, lot.id);
await request('DELETE', `/api/lots/${lot.id}`, undefined, 404);
await request('GET', '/api/products?page=1000001', undefined, 400);
const cors = await fetch(base + '/api/products', { method: 'OPTIONS', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST' } });
assert.equal(cors.status, 204);
assert.equal(cors.headers.get('access-control-allow-origin'), 'http://localhost:5173');
requests++;
console.log('OPTIONS /api/products -> 204');
console.log(JSON.stringify({ base, requests, lotId: lot.id, balance: detail.balance, revenueCents: result.revenueCents, lossCents: result.lossCents }));
