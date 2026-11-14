import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movementValueCents } from '../src/movement-value.mjs';

test('valor da movimentação segue a API: exato em kg e meio centavo para cima', () => {
  assert.equal(movementValueCents(0.025, 50000), 1250);
  assert.equal(movementValueCents(0.1, 80000), 8000);
  assert.equal(movementValueCents(0.001, 1500), 2);
  assert.equal(movementValueCents(0.001, 1499), 1);
  assert.equal(movementValueCents(0.3, 333333), 100000);
});
