import { useState } from 'react';
import { BarChart3, Plus, Tag } from 'lucide-react';
import { datetime, hashParams, money, useApi, useOptions, useWrite, tonnes, pricePerTonne } from '../api';
import { expiryText } from '../lot-actions';
import type { Lot, Page, Promotion, PromotionResult } from '../types';
import { LotPicker } from '../components/LotPicker';
import { Badge, Empty, ErrorBox, Field, Form, Loading, Metric, Modal, PageHeading, Pagination, Panel, useNotice } from '../components/ui';

function Results({ id }: { id: string }) {
  const query = useApi<PromotionResult>(`/api/promotions/${id}/results`);
  return <><ErrorBox error={query.error} retry={() => void query.refetch()} />{query.isPending ? <Loading /> : query.data && <div className="grid gap-5"><div><h3 className="text-xl font-semibold">{query.data.promotion.lot.product.name}</h3><p className="text-slate-500">{query.data.promotion.lot.code} · {query.data.promotion.discountPercent}% de desconto</p></div><div className="grid grid-cols-2 gap-3"><Metric label="Toneladas vendidas" value={tonnes(query.data.soldQuantity)} /><Metric label="Receita da promoção" value={money(query.data.revenueCents)} /><Metric label="Toneladas descartadas" value={tonnes(query.data.discardedQuantity)} /><Metric label="Perdas a custo" value={money(query.data.lossCents)} /><Metric label="Saldo atual do lote" value={tonnes(query.data.currentLotBalance)} /><Metric label="Giro da promoção" value={`${query.data.sellThroughPercent.toLocaleString('pt-BR')}%`} /></div><p className="info-note">Restaram {tonnes(query.data.remainingFromPromotion)} da promoção. O saldo atual pode incluir movimentações feitas depois do encerramento.</p></div>}</>;
}
export default function Promotions() {
  const [status, setStatus] = useState('ACTIVE');
  const [page, setPage] = useState(1);
  // Vindo de "Criar promoção" no estoque: abre o formulário com o lote e o desconto sugerido.
  const [creating, setCreating] = useState(() => hashParams().has('lote'));
  const [lotId, setLotId] = useState(() => hashParams().get('lote') ?? '');
  const [discount, setDiscount] = useState(() => hashParams().get('desconto') ?? '20');
  const lots = useOptions<Lot>('/api/lots');
  const lot = lots.data?.find(item => item.id === lotId);
  // Remove os parâmetros do atalho: recarregar a página não reabre o formulário.
  function closeCreate() { setCreating(false); history.replaceState(null, '', '#promocoes'); }
  const [result, setResult] = useState<string | null>(null);
  const [closing, setClosing] = useState<Promotion | null>(null);
  const promotions = useApi<Page<Promotion>>(`/api/promotions?page=${page}&pageSize=9${status ? `&status=${status}` : ''}`, true, true);
  const active = useOptions<Promotion>('/api/promotions?status=ACTIVE');
  const write = useWrite<Promotion>();
  const notify = useNotice();
  return <><PageHeading eyebrow="MAIS GIRO, MENOS PERDAS" title="Promoções" description="Dê giro aos lotes em atenção com desconto no preço por tonelada e acompanhe o resultado de cada promoção." action={<button className="btn-primary" onClick={() => { setLotId(''); setDiscount('20'); setCreating(true); }}><Plus size={17} />Nova promoção</button>} />
    <div className="flex justify-between items-center gap-3 flex-wrap"><div className="tabs" role="group" aria-label="Situação da promoção">{[['ACTIVE', 'Ativas'], ['CLOSED', 'Encerradas'], ['', 'Todas']].map(([value, label]) => <button key={value} aria-pressed={status === value} className={status === value ? 'selected' : ''} onClick={() => { setStatus(value); setPage(1); }}>{label}</button>)}</div><span className="text-sm text-slate-500">{promotions.data?.pagination.total ?? '—'} promoções</span></div>
    <ErrorBox error={promotions.error} retry={() => void promotions.refetch()} />{promotions.isPending ? <Loading /> : promotions.data?.data.length ? <div className="promotion-grid">{promotions.data.data.map(promotion => <Panel key={promotion.id} className="promotion-card"><div className="flex justify-between items-center"><span className="promotion-icon"><Tag size={22} /></span><Badge status={promotion.status} /></div><div><h2>{promotion.lot.product.name}</h2><p className="text-sm text-slate-500 mt-1">Lote {promotion.lot.code}</p></div><div className="promo-price"><span>{pricePerTonne(promotion.unitPriceCents)}</span><strong>−{promotion.discountPercent}%</strong></div><div className="promo-details"><span>Saldo atual <b>{tonnes(promotion.lot.balance)}</b></span><span>Início <b>{datetime(promotion.startedAt)}</b></span>{promotion.endedAt && <span>Encerramento <b>{datetime(promotion.endedAt)}</b></span>}</div><div className="flex gap-2 flex-wrap mt-auto"><button className="btn-secondary flex-1" onClick={() => setResult(promotion.id)}><BarChart3 size={16} />Resultado</button>{promotion.status === 'ACTIVE' && <button className="btn-secondary" onClick={() => setClosing(promotion)}>Encerrar</button>}</div></Panel>)}</div> : !promotions.error && <Panel><Empty title="Nenhuma promoção nesta situação" text="Crie uma promoção para um lote com saldo e dentro da validade. Os lotes em atenção trazem um desconto sugerido." action={<a className="btn-secondary" href="#estoque?situacao=ATTENTION">Ver lotes em atenção</a>} /></Panel>}
    <Pagination meta={promotions.data?.pagination} onChange={setPage} />
    {creating && <Modal title="Criar promoção" onClose={closeCreate}><Form label="Ativar promoção" onSave={async () => { const saved = await write.mutateAsync({ path: '/api/promotions', body: { lotId, discountPercent: Number(discount) } }); closeCreate(); notify(`Promoção ativada. Preço aplicado: ${pricePerTonne(saved.unitPriceCents)}.`); }}><LotPicker value={lotId} onChange={id => { setLotId(id); const suggestion = lots.data?.find(item => item.id === id)?.suggestedDiscountPercent; if (suggestion) setDiscount(String(suggestion)); }} excluded={active.data?.map(item => item.lotId)} /><ErrorBox error={active.error || lots.error} /><Field label="Desconto (%)" hint={lot?.suggestedDiscountPercent ? `Sugestão para este lote: ${lot.suggestedDiscountPercent}% (${expiryText(lot.daysUntilExpiry).toLowerCase()}). Você pode ajustar entre 1% e 99%.` : 'Desconto inteiro entre 1% e 99%.'}><input name="discount" type="number" required min={1} max={99} step={1} value={discount} onChange={e => setDiscount(e.target.value)} /></Field>{lot && <p className="info-note">Preço normal: {pricePerTonne(lot.unitPriceCents)}. Preço promocional: <strong>{pricePerTonne(Math.round(lot.unitPriceCents * (100 - (Number(discount) || 0)) / 100))}</strong> para {tonnes(lot.balance)} em estoque. O valor final é confirmado ao ativar.</p>}</Form></Modal>}
    {result && <Modal title="Resultado da promoção" onClose={() => setResult(null)}><Results id={result} /></Modal>}
    {closing && <Modal title="Encerrar promoção" onClose={() => setClosing(null)}><Form label="Confirmar encerramento" onSave={async () => { await write.mutateAsync({ path: `/api/promotions/${closing.id}/close` }); setClosing(null); notify('Promoção encerrada. As próximas vendas usarão o preço normal.'); }}><p>Encerrar a promoção de <strong>{closing.lot.product.name}</strong>, lote {closing.lot.code}?</p><p className="info-note">O saldo e o histórico são preservados. Você poderá consultar o resultado na aba Encerradas.</p></Form></Modal>}
  </>;
}
