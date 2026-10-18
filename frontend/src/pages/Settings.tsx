import { Bell, CalendarClock } from 'lucide-react';
import { datetime, useApi, useWrite } from '../api';
import type { Settings as SettingsData } from '../types';
import { ErrorBox, Field, Form, Loading, PageHeading, Panel, useNotice } from '../components/ui';

export default function Settings() {
  const query = useApi<SettingsData>('/api/settings');
  const write = useWrite<SettingsData>();
  const notify = useNotice();
  return <><PageHeading eyebrow="REGRAS DO ESTABELECIMENTO" title="Configurações" description="Defina quando um lote deve entrar na janela de atenção." /><div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-5"><Panel title="Antecedência dos alertas" subtitle="Uma regra única para todo o estoque" action={<Bell size={20} className="text-slate-400" />}><div className="p-5 sm:p-6"><ErrorBox error={query.error} retry={() => void query.refetch()} />{query.isPending ? <Loading /> : query.data && <Form key={query.data.updatedAt} label="Salvar configuração" onSave={async data => { await write.mutateAsync({ path: '/api/settings', method: 'PUT', body: { alertDays: Number(data.get('alertDays')) } }); notify('Prazo de alerta salvo. Painel e validades atualizados.'); }}><Field label="Dias antes do vencimento" hint="Entre 0 e 365 dias. Zero destaca apenas os lotes que vencem hoje."><input name="alertDays" type="number" min={0} max={365} step={1} required defaultValue={query.data.alertDays} /></Field><p className="text-sm text-slate-500">Última alteração: {datetime(query.data.updatedAt)}</p></Form>}</div></Panel><Panel title="Como os alertas funcionam"><div className="p-5 sm:p-6 grid gap-5"><CalendarClock size={34} className="text-emerald-700" /><p className="text-sm leading-7 text-slate-600">Os lotes com saldo e validade entre hoje e o prazo configurado aparecem como <strong>Em atenção</strong>. Após a validade, passam a <strong>Vencido</strong>.</p><p className="text-sm leading-7 text-slate-600">Lotes sem saldo aparecem como <strong>Sem saldo</strong>. A configuração é salva para o estabelecimento e aplicada ao painel e aos filtros de estoque.</p></div></Panel></div></>;
}
