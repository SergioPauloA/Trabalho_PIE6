import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CheckCircle2, History } from 'lucide-react';
import { datetime, hashParams, money, queryString, useApi, useOptions, useWrite, tonnes, pricePerTonne } from '../api';
import type { Lot, Movement, MovementResult, Page } from '../types';
import { movementFingerprint, resolveMovementKey } from '../movement-key.mjs';
import { movementValueCents } from '../movement-value.mjs';
import { LotPicker } from '../components/LotPicker';
import { Badge, Empty, ErrorBox, Field, Form, Loading, PageHeading, Pagination, Panel, fieldValue, useNotice } from '../components/ui';

const pendingStorage = 'mercelume:pending-movement:tonnes:v2';
// Motivos padronizados permitem comparar as perdas por motivo nas análises.
const reasons = ['Vencimento', 'Avaria ou embalagem danificada', 'Qualidade ou aparência', 'Armazenamento inadequado'];
export default function Movements() {
  const [type, setType] = useState<'SALE' | 'DISCARD'>(() => hashParams().get('tipo') === 'descarte' ? 'DISCARD' : 'SALE');
  const [lotId, setLotId] = useState(() => hashParams().get('lote') ?? '');
  const [otherReason, setOtherReason] = useState(false);
  const [result, setResult] = useState<MovementResult>();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ type: '', lotId: '', from: '', to: '' });
  const invalidPeriod = !!(filters.from && filters.to && filters.from > filters.to);
  const history = useApi<Page<Movement>>(`/api/movements?${queryString({ ...filters, page, pageSize: 12 })}`, !invalidPeriod, true);
  const lots = useOptions<Lot>('/api/lots');
  const write = useWrite<MovementResult>();
  const notify = useNotice();
  const lotsById = new Map(lots.data?.map(item => [item.id, item]));
  const lot = lotsById.get(lotId);
  // Retirada de lote vencido: sugere o saldo inteiro e o motivo "Vencimento".
  const withdrawal = type === 'DISCARD' && lot?.status === 'EXPIRED';
  function filter(key: keyof typeof filters, value: string) { setFilters(previous => ({ ...previous, [key]: value })); setPage(1); }
  function choose(next: 'SALE' | 'DISCARD') { setType(next); setLotId(''); setOtherReason(false); setResult(undefined); }
  async function save(data: FormData) {
    if (!lot) throw new Error('Selecione um lote.');
    const quantity = Number(data.get('quantity'));
    const reason = fieldValue(data, 'reason') === 'other' ? fieldValue(data, 'otherReason') : fieldValue(data, 'reason');
    const fingerprint = movementFingerprint(type, lot.id, quantity, reason);
    let previous = null;
    try { previous = JSON.parse(localStorage.getItem(pendingStorage) || 'null'); } catch { /* Uma entrada inválida é substituída antes do envio. */ }
    const pending = resolveMovementKey(previous, fingerprint, () => crypto.randomUUID());
    // Não envia se o navegador não conseguir guardar a chave de repetição.
    localStorage.setItem(pendingStorage, JSON.stringify(pending));
    const saved = await write.mutateAsync({ path: `/api/lots/${lot.id}/${type === 'SALE' ? 'sales' : 'discards'}`, body: { quantity, quantityUnit: 't', requestKey: pending.key, ...(type === 'DISCARD' ? { reason } : {}) } });
    localStorage.removeItem(pendingStorage);
    setResult(saved); setLotId(''); setOtherReason(false); notify(type === 'SALE' ? 'Venda registrada. Estoque atualizado.' : 'Perda registrada. Estoque atualizado.');
  }
  return <><PageHeading eyebrow="OPERAÇÃO DO DIA A DIA" title="Vendas e descartes" description="Registre cada saída, com o motivo de cada perda, e mantenha o estoque atualizado." />
    <div className="grid xl:grid-cols-[1.1fr_0.9fr] gap-5"><Panel title="Nova movimentação" subtitle="Selecione a operação e o lote"><div className="p-5 sm:p-6"><div className="tabs mb-6"><button className={type === 'SALE' ? 'selected' : ''} aria-pressed={type === 'SALE'} onClick={() => choose('SALE')}><ArrowUpRight size={16} />Venda</button><button className={type === 'DISCARD' ? 'selected' : ''} aria-pressed={type === 'DISCARD'} onClick={() => choose('DISCARD')}><ArrowDownRight size={16} />Descarte</button></div><Form key={type} onSave={save} label={type === 'SALE' ? 'Registrar venda' : withdrawal ? 'Retirar lote e registrar perda' : 'Registrar descarte'} reset><LotPicker value={lotId} onChange={id => { setLotId(id); setOtherReason(false); }} allowExpired={type === 'DISCARD'} /><Field label="Quantidade (t)" hint={lot ? `Saldo disponível: ${tonnes(lot.balance)}. 0,250 t = 250 kg.` : '0,250 t = 250 kg. Mínimo de 0,001 t (1 kg).'}><input key={`${type}-${lot?.id}`} name="quantity" type="number" min={0.001} max={lot?.balance ?? 1000000} step={0.001} required placeholder="Ex.: 0,250" defaultValue={withdrawal ? lot?.balance : undefined} /></Field>{type === 'DISCARD' && <><Field label="Motivo da perda"><select key={lot?.id} name="reason" required defaultValue={withdrawal ? reasons[0] : ''} onChange={e => setOtherReason(e.target.value === 'other')}><option value="">Selecione o motivo</option>{reasons.map(item => <option key={item}>{item}</option>)}<option value="other">Outro motivo</option></select></Field>{otherReason && <Field label="Descreva o motivo"><input name="otherReason" required minLength={3} maxLength={300} placeholder="Ex.: queda durante a reposição" /></Field>}</>}{lot && <div className="info-note">{type === 'SALE' ? <>Preço normal: <strong>{pricePerTonne(lot.unitPriceCents)}</strong>. A promoção ativa, quando houver, é aplicada automaticamente.</> : <>A perda é calculada pelo <strong>custo</strong> do lote ({pricePerTonne(lot.unitCostCents)}), não pelo preço de venda. Saldo inteiro: <strong>{money(movementValueCents(lot.balance, lot.unitCostCents))}</strong>.</>}</div>}</Form></div></Panel>
      <Panel title="Registro com rastreabilidade" subtitle="Do lançamento ao histórico"><div className="p-5 sm:p-6 grid gap-5"><div className="process-step"><span>01</span><div><h3>Escolha o lote</h3><p>Vendas aceitam somente lotes dentro da validade e com saldo. Lotes críticos (vencidos) só podem ser retirados como perda.</p></div></div><div className="process-step"><span>02</span><div><h3>Confirme a quantidade e o motivo</h3><p>Informe o peso em toneladas. Vendas usam o preço vigente; perdas exigem o motivo e são avaliadas pelo custo.</p></div></div><div className="process-step"><span>03</span><div><h3>Acompanhe o resultado</h3><p>O saldo e o histórico são atualizados após a confirmação. Em falha de conexão, repita os mesmos dados para recuperar o registro.</p></div></div>{result && <div className="success-box" role="status"><CheckCircle2 size={22} /><div><strong>{result.replayed ? 'Registro recuperado sem duplicação' : 'Movimentação confirmada'}</strong><p>{tonnes(result.movement.quantity)} · {result.movement.type === 'SALE' ? `Preço aplicado: ${pricePerTonne(result.movement.unitPriceCents)} · Receita: ${money(movementValueCents(result.movement.quantity, result.movement.unitPriceCents))}` : `Custo: ${pricePerTonne(result.movement.unitCostCents)} · Perda a custo: ${money(movementValueCents(result.movement.quantity, result.movement.unitCostCents))}`}</p><p>Saldo atual do lote: <b>{tonnes(result.balance)}</b></p></div></div>}</div></Panel></div>
    <Panel title="Histórico de movimentações" subtitle="Cada valor mostra de onde veio: quantidade × preço de venda (receita) ou × custo do lote (perda)" action={<History size={20} className="text-slate-400" />}><div className="filters"><select aria-label="Filtrar tipo de movimentação" value={filters.type} onChange={e => filter('type', e.target.value)}><option value="">Todas as operações</option><option value="SALE">Vendas</option><option value="DISCARD">Descartes</option></select><select aria-label="Filtrar lote" value={filters.lotId} onChange={e => filter('lotId', e.target.value)}><option value="">Todos os lotes</option>{lots.data?.map(item => <option key={item.id} value={item.id}>{item.code} · {item.product.name}</option>)}</select><Field label="De"><input type="date" value={filters.from} onChange={e => filter('from', e.target.value)} /></Field><Field label="Até"><input type="date" value={filters.to} onChange={e => filter('to', e.target.value)} /></Field></div><ErrorBox error={invalidPeriod ? new Error('A data inicial deve ser anterior ou igual à data final.') : history.error || lots.error} />{!invalidPeriod && (history.isPending ? <Loading /> : history.data?.data.length ? <div className="table-scroll"><table><thead><tr><th>Produto / lote</th><th>Data</th><th>Operação</th><th>Quantidade</th><th>Valor por tonelada</th><th>Total</th><th>Motivo / detalhe</th></tr></thead><tbody>{history.data.data.map(item => { const sale = item.type === 'SALE'; const unit = sale ? item.unitPriceCents : item.unitCostCents; return <tr key={item.id}><td><strong>{lotsById.get(item.lotId)?.product.name ?? 'Produto'}</strong><small>{lotsById.get(item.lotId)?.code ?? item.lotId}</small></td><td data-label="Data">{datetime(item.occurredAt)}</td><td data-label="Operação"><Badge status={item.type} /></td><td data-label="Quantidade">{tonnes(item.quantity)}</td><td data-label="Valor por tonelada">{pricePerTonne(unit)}<small>{sale ? 'Preço de venda' : 'Custo do lote'}</small></td><td data-label="Total"><strong>{money(movementValueCents(item.quantity, unit))}</strong><small>{sale ? 'Receita' : 'Perda a custo'}</small></td><td data-label="Motivo / detalhe" className="wrap">{item.reason || (item.promotionId ? 'Venda promocional' : 'Preço normal')}</td></tr>; })}</tbody></table></div> : !history.error && <Empty title="Nenhuma movimentação encontrada" text="As vendas e os descartes registrados aparecem aqui." />)}{!invalidPeriod && <Pagination meta={history.data?.pagination} onChange={setPage} />}</Panel>
  </>;
}
