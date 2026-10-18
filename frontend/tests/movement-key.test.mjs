import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movementFingerprint, resolveMovementKey } from '../src/movement-key.mjs';

test('uma tentativa repetida após recarga reutiliza a chave da operação', () => {
  const fingerprint = movementFingerprint('SALE', 'lot-a', 3);
  const first = resolveMovementKey(null, fingerprint, () => 'request-1');
  const persisted = JSON.parse(JSON.stringify(first));
  assert.equal(resolveMovementKey(persisted, fingerprint, () => 'request-2').key, 'request-1');
});
test('outra quantidade, lote, tipo ou motivo nunca reaproveita uma chave incompatível', () => {
  const first = resolveMovementKey(null, movementFingerprint('DISCARD', 'lot-a', 3, 'Avaria'), () => 'request-1');
  for (const fingerprint of [movementFingerprint('DISCARD', 'lot-a', 4, 'Avaria'), movementFingerprint('DISCARD', 'lot-b', 3, 'Avaria'), movementFingerprint('SALE', 'lot-a', 3), movementFingerprint('DISCARD', 'lot-a', 3, 'Validade')]) {
    assert.equal(resolveMovementKey(first, fingerprint, () => 'request-2').key, 'request-2');
  }
});
test('uma nova operação após sucesso recebe uma chave nova mesmo com os mesmos campos', () => {
  const fingerprint = movementFingerprint('SALE', 'lot-a', 3);
  assert.equal(resolveMovementKey(null, fingerprint, () => 'new-operation').key, 'new-operation');
});
