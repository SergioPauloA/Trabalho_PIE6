import { lstat, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(backend, 'dist');
if (dirname(target) !== backend) throw new Error('Destino de limpeza inválido.');
const info = await lstat(target).catch(error => {
  if (error.code === 'ENOENT') return null;
  throw error;
});
if (info?.isSymbolicLink()) throw new Error('dist não pode ser um link simbólico.');
if (info) await rm(target, { recursive: true });
