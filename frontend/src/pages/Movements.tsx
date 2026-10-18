import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CheckCircle2, History } from 'lucide-react';
import { datetime, queryString, useApi, useOptions, useWrite, tonnes, pricePerTonne } from '../api';
import type { Lot, Movement, MovementResult, Page } from '../types';
import { movementFingerprint, resolveMovementKey } from '../movement-key.mjs';
import { LotPicker } from '../components/LotPicker';
import { Badge, Empty, ErrorBox, Field, Form, Loading, PageHeading, Pagination, Panel, fieldValue, useNotice } from '../components/ui';

const pendingStorage = 'mercelume:pending-movement:tonnes:v2';
export default function Movements() {
  const [type, setType] = useState<'SALE' | 'DISCARD'>('SALE');
  const [lot, setLot] = useState<Lot>();
  const [result, setResult] = useState<MovementResult>();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ type: '', lotId: '', from: '', to: '' });
  const invalidPeriod = !!(filters.from && filters.to && filters.from > filters.to);
  const history = useApi<Page<Movement>>(`/api/movements?${queryString({ ...filters, page, pageSize: 12 })}`, !invalidPeriod);
  const lots = useOptions<Lot>('/api/lots');
  const write = useWrite<MovementResult>();
  const notify = useNotice();
  const lotsById = new Map(lots.data?.map(item => [item.id, item]));
  function filter(key: keyof typeof filters, value: string) { setFilters(previous => ({ ...previous, [key]: value })); setPage(1); }
  async function save(data: FormData) {
    if (!lot) throw new Error('Selecione um lote.');
    const quantity = Number(data.get('quantity'));
    const reason = fieldValue(data, 'reason');
    const fingerprint = movementFingerprint(type, lot.id, quantity, reason);
    let previous = null;
    try { previous = JSON.parse(localStorage.getItem(pendingStorage) || 'null'); } catch { /* Uma entrada inválida é substituída antes do envio. */ }
    const pending = resolveMovementKey(previous, fingerprint, () => crypto.randomUUID());
    // Não envia se o navegador não conseguir guardar a chave de repetição.
    localStorage.setItem(pendingStorage, JSON.stringify(pending));
    const saved = await write.mutateAsync({ path: `/api/lots/${lot.id}/${type === 'SALE' ? 'sales' : 'discards'}`, body: { quantity, quantityUnit: 't', requestKey: pending.key, ...(type === 'DISCARD' ? { reason } : {}) } });
    localStorage.removeItem(pendingStorage);
    setResult(saved); setLot(undefined); notify(type === 'SALE' ? 'Venda registrada. Estoque atualizado.' : 'Descarte registrado. Estoque atualizado.');
  }
  return <><PageHeading eyebrow="OPERAÇÃO DO DIA A DIA" title="Vendas e descartes" description="Registre cada saída e mantenha seu estoque sempre atualizado." />
    <div className="grid xl:grid-cols-[1.1fr_0.9fr] gap-5"><Panel title="Nova movimentação" subtitle="Selecione a operação e o lote"><div className="p-5 sm:p-6"><div className="tabs mb-6"><button className={type === 'SALE' ? 'selected' : ''} aria-pressed={type === 'SALE'} onClick={() => { setType('SALE'); setLot(undefined); setResult(undefined); }}><ArrowUpRight size={16} />Venda</button><button className={type === 'DISCARD' ? 'selected' : ''} aria-pressed={type === 'DISCARD'} onClick={() => { setType('DISCARD'); setLot(undefined); setResult(undefined); }}><ArrowDownRight size={16} />Descarte</button></div><Form key={type} onSave={save} label={type === 'SALE' ? 'Registrar venda' : 'Registrar descarte'} reset><LotPicker value={lot?.id ?? ''} onChange={setLot} allowExpired={type === 'DISCARD'} /><Field label="Quantidade (t)" hint="0,250 t = 250 kg. Mínimo de 0,001 t (1 kg)."><input name="quantity" type="number" min={0.001} max={1000000} step={0.001} required placeholder="Ex.: 0,250" /></Field>{type === 'DISCARD' && <Field label="Motivo do descarte"><textarea name="reason" required minLength={3} maxLength={300} rows={3} placeholder="Ex.: prazo de validade encerrado" /></Field>}{lot && <div className="info-note">Saldo disponível: <strong>{tonnes(lot.balance)}</strong>. {type === 'SALE' ? 'A promoção ativa, quando houver, será aplicada automaticamente.' : 'O valor da perda será calculado pelo custo do lote.'}</div>}</Form></div></Panel>
      <Panel title="Registro com rastreabilidade" subtitle="Do lançamento ao histórico"><div className="p-5 sm:p-6 grid gap-5"><div className="process-step"><span>01</span><div><h3>Escolha o lote</h3><p>Vendas aceitam somente lotes dentro da validade e com saldo.</p></div></div><div className="process-step"><span>02</span><div><h3>Confirme a quantidade</h3><p>Informe o peso em toneladas. O saldo é validado e as vendas usam o preço por tonelada vigente.</p></div></div><div className="process-step"><span>03</span><div><h3>Acompanhe o resultado</h3><p>O saldo e o histórico são atualizados após a confirmação. Em falha de conexão, repita os mesmos dados para recuperar o registro.</p></div></div>{result && <div className="success-box" role="status"><CheckCircle2 size={22} /><div><strong>{result.replayed ? 'Registro recuperado sem duplicação' : 'Movimentação confirmada'}</strong><p>{tonnes(result.movement.quantity)} · {result.movement.type === 'SALE' ? `Preço aplicado: ${pricePerTonne(result.movement.unitPriceCents)}` : `Custo por tonelada: ${pricePerTonne(result.movement.unitCostCents)}`}</p><p>Saldo atual do lote: <b>{tonnes(result.balance)}</b></p></div></div>}</div></Panel></div>
    <Panel title="Histórico de movimentações" subtitle="Vendas e descartes registrados no estoque" action={<History size={20} className="text-slate-400" />}><div className="filters"><select aria-label="Filtrar tipo de movimentação" value={filters.type} onChange={e => filter('type', e.target.value)}><option value="">Todas as operações</option><option value="SALE">Vendas</option><option value="DISCARD">Descartes</option></select><select aria-label="Filtrar lote" value={filters.lotId} onChange={e => filter('lotId', e.target.value)}><option value="">Todos os lotes</option>{lots.data?.map(item => <option key={item.id} value={item.id}>{item.code} · {item.product.name}</option>)}</select><Field label="De"><input type="date" value={filters.from} onChange={e => filter('from', e.target.value)} /></Field><Field label="Até"><input type="date" value={filters.to} onChange={e => filter('to', e.target.value)} /></Field></div><ErrorBox error={invalidPeriod ? new Error('A data inicial deve ser anterior ou igual à data final.') : history.error || lots.error} />{!invalidPeriod && (history.isPending ? <Loading /> : history.data?.data.length ? <div className="table-scroll"><table><thead><tr><th>Data</th><th>Produto / lote</th><th>Operação</th><th>Quantidade</th><th>Valor por tonelada</th><th>Detalhe</th></tr></thead><tbody>{history.data.data.map(item => <tr key={item.id}><td>{datetime(item.occurredAt)}</td><td><strong>{lotsById.get(item.lotId)?.product.name ?? 'Produto'}</strong><small>{lotsById.get(item.lotId)?.code ?? item.lotId}</small></td><td><Badge status={item.type} /></td><td>{tonnes(item.quantity)}</td><td>{pricePerTonne(item.type === 'SALE' ? item.unitPriceCents : item.unitCostCents)}<small>{item.type === 'SALE' ? 'Preço de venda' : 'Custo do lote'}</small></td><td>{item.reason || (item.promotionId ? 'Venda promocional' : 'Preço normal')}</td></tr>)}</tbody></table></div> : !history.error && <Empty title="Nenhuma movimentação encontrada" text="As vendas e os descartes registrados aparecem aqui." />)}{!invalidPeriod && <Pagination meta={history.data?.pagination} onChange={setPage} />}</Panel>
  </>;
}
