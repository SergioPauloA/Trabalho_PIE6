import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Check, Inbox, LoaderCircle, X } from 'lucide-react';
import type { Page } from '../types';

export const NoticeContext = createContext<(message: string) => void>(() => {});
export const useNotice = () => useContext(NoticeContext);
export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  if (!error) return null;
  return <div role="alert" className="error-box"><AlertCircle size={18} className="shrink-0" /><div className="min-w-0 flex-1">{error instanceof Error ? error.message : String(error)}</div>{retry && <button className="underline shrink-0" onClick={retry}>Tentar novamente</button>}</div>;
}
export function Loading() { return <div role="status" className="flex items-center justify-center gap-3 p-12 text-slate-500"><LoaderCircle size={20} className="animate-spin" />Carregando dados…</div>; }
export function Empty({ title = 'Nenhum registro encontrado', text = 'Cadastre um registro ou ajuste os filtros para começar.', action }: { title?: string; text?: string; action?: ReactNode }) {
  return <div className="empty"><span className="empty-icon"><Inbox size={25} /></span><h3>{title}</h3><p>{text}</p>{action}</div>;
}
export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="flex flex-wrap gap-2">{action}</div>}</div>;
}
export function Panel({ title, subtitle, action, children, className = '' }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{title && <div className="panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>}{children}</section>;
}
export function Metric({ label, value, detail, icon, tone = '' }: { label: string; value: ReactNode; detail?: string; icon?: ReactNode; tone?: string }) {
  return <div className={`metric ${tone}`}><div className="flex items-center justify-between gap-2"><span>{label}</span>{icon}</div><strong>{value}</strong>{detail && <p>{detail}</p>}</div>;
}
const badges: Record<string, [string, string]> = { OK: ['Regular', 'green'], ATTENTION: ['Em atenção', 'amber'], EXPIRED: ['Vencido', 'red'], EMPTY: ['Sem saldo', 'gray'], ACTIVE: ['Ativa', 'green'], CLOSED: ['Encerrada', 'gray'], SALE: ['Venda', 'green'], DISCARD: ['Descarte', 'red'], COMPLETED: ['Concluída', 'green'], RUNNING: ['Em andamento', 'amber'], FAILED: ['Falhou', 'red'] };
export function Badge({ status }: { status: string }) { const [label, color] = badges[status] || [status, 'gray']; return <span className={`badge ${color}`}><span />{label}</span>; }
export function Pagination({ meta, onChange }: { meta?: Page<unknown>['pagination']; onChange: (page: number) => void }) {
  if (!meta) return null;
  return <div className="pagination"><span>{meta.total} registro{meta.total !== 1 ? 's' : ''} · Página {meta.page} de {Math.max(1, meta.totalPages)}</span><div className="flex gap-2"><button className="btn-icon" aria-label="Página anterior" disabled={meta.page <= 1} onClick={() => onChange(meta.page - 1)}><ArrowLeft size={16} /></button><button className="btn-icon" aria-label="Próxima página" disabled={meta.page >= meta.totalPages} onClick={() => onChange(meta.page + 1)}><ArrowRight size={16} /></button></div></div>;
}
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="modal" onCancel={onClose} aria-label={title}><div className="modal-heading"><h2>{title}</h2><button className="btn-icon" aria-label="Fechar janela" onClick={onClose}><X size={20} /></button></div><div className="p-5 sm:p-6">{children}</div></dialog>;
}
export function Field({ label, children, hint, className = '' }: { label: string; children: ReactNode; hint?: string; className?: string }) { return <label className={`field ${className}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function Form({ onSave, children, label = 'Salvar', reset = false }: { onSave: (data: FormData) => Promise<void>; children: ReactNode; label?: string; reset?: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const locked = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    locked.current = true; setPending(true); setError(null);
    try { await onSave(data); if (reset) form.reset(); }
    catch (error) { setError(error); }
    finally { locked.current = false; setPending(false); }
  }
  return <form onSubmit={submit}><fieldset disabled={pending} className="grid gap-5 min-w-0">{children}<ErrorBox error={error} /><div className="flex justify-end pt-2"><button className="btn-primary" type="submit">{pending ? <LoaderCircle size={17} className="animate-spin" /> : <Check size={17} />}{pending ? 'Salvando…' : label}</button></div></fieldset></form>;
}
export const fieldValue = (data: FormData, name: string) => String(data.get(name) ?? '').trim();
