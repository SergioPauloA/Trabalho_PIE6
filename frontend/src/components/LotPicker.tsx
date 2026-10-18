import { useState } from 'react';
import { useOptions, tonnes, pricePerTonne } from '../api';
import type { Lot } from '../types';
import { ErrorBox, Field } from './ui';

export function LotPicker({ value, onChange, allowExpired = false, excluded = [], name = 'lotId' }: { value: string; onChange: (lot: Lot | undefined) => void; allowExpired?: boolean; excluded?: string[]; name?: string }) {
  const query = useOptions<Lot>('/api/lots');
  const [search, setSearch] = useState('');
  const lots = query.data?.filter(lot => lot.balance > 0 && (allowExpired || lot.status !== 'EXPIRED') && !excluded.includes(lot.id)) ?? [];
  const filtered = lots.filter(lot => lot.id === value || `${lot.code} ${lot.product.name}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <div className="grid gap-3"><Field label="Buscar lote"><input type="search" placeholder="Nome do produto ou código do lote" value={search} onChange={e => setSearch(e.target.value)} /></Field><Field label="Lote" hint={allowExpired ? 'Lotes com saldo disponível, incluindo vencidos.' : 'Somente lotes com saldo e dentro da validade.'}><select name={name} required value={value} onChange={e => onChange(lots.find(lot => lot.id === e.target.value))}><option value="">{query.isPending ? 'Carregando lotes…' : 'Selecione um lote'}</option>{filtered.map(lot => <option key={lot.id} value={lot.id}>{lot.code} · {lot.product.name} · {tonnes(lot.balance)} · {pricePerTonne(lot.unitPriceCents)}</option>)}</select></Field><ErrorBox error={query.error} retry={() => void query.refetch()} />{query.isSuccess && lots.length === 0 && <p className="text-sm text-slate-500">Nenhum lote elegível. Cadastre um lote com saldo em Estoque e validades.</p>}</div>;
}
