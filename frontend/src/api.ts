import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Page } from './types';

const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(90_000),
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError('Não foi possível conectar ao servidor. Verifique se a API está em execução e tente novamente.', 0);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(body?.error?.message || `Não foi possível concluir a operação (${response.status}).`, response.status, body?.error?.code);
  if (!body) throw new ApiError('O servidor retornou uma resposta inesperada.', response.status);
  return body as T;
}
export function queryString(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') search.set(key, String(value));
  return search.toString();
}
export function useApi<T>(path: string, enabled = true) {
  return useQuery({ queryKey: ['api', path], queryFn: ({ signal }) => request<T>(path, { signal }), enabled });
}
// Carrega todas as páginas somente para seletores; as tabelas usam paginação no servidor.
export function useOptions<T>(path: string) {
  return useQuery({ queryKey: ['api', 'options', path], queryFn: async ({ signal }) => {
    const separator = path.includes('?') ? '&' : '?';
    const first = await request<Page<T>>(`${path}${separator}pageSize=100&page=1`, { signal });
    const data = [...first.data];
    for (let page = 2; page <= first.pagination.totalPages; page++) {
      data.push(...(await request<Page<T>>(`${path}${separator}pageSize=100&page=${page}`, { signal })).data);
    }
    return data;
  } });
}
export function useWrite<T = unknown>() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ path, method = 'POST', body }: { path: string; method?: string; body?: unknown }) => request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['api'] }); },
    retry: false,
  });
}
export const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const number = (value: number) => value.toLocaleString('pt-BR');
export const date = (value: string) => value.slice(0, 10).split('-').reverse().join('/');
export const datetime = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

export const tonnes = (value: number) => `${value.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} t`;
export const pricePerTonne = (cents: number) => `${money(cents)}/t`;
