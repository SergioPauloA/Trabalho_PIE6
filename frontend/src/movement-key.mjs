// A mesma operação mantém a chave após uma falha de rede ou recarga da página.
export function movementFingerprint(type, lotId, quantity, reason = '') {
  return JSON.stringify(['t', type, lotId, Number(quantity), type === 'DISCARD' ? reason.trim() : '']);
}
export function resolveMovementKey(previous, fingerprint, createKey) {
  return previous?.fingerprint === fingerprint ? previous : { fingerprint, key: createKey() };
}
