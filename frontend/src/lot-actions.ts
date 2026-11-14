import { money } from './api';
import { movementValueCents } from './movement-value.mjs';
import type { Lot } from './types';

export const expiryText = (days: number) => days < 0 ? `Vencido há ${-days} dia${days === -1 ? '' : 's'}` : days === 0 ? 'Vence hoje' : `Vence em ${days} dia${days === 1 ? '' : 's'}`;

/** Ação indicada para cada situação: Atenção pede ação preventiva; Crítico exige a retirada do lote. */
export function lotAction(lot: Lot, activeDiscount?: number): { title: string; detail: string; label?: string; href?: string } {
  if (lot.status === 'EXPIRED') return { title: 'Retirar da área de venda', detail: `Perda estimada de ${money(movementValueCents(lot.balance, lot.unitCostCents))} a custo`, label: 'Retirar lote', href: `#movimentacoes?tipo=descarte&lote=${lot.id}` };
  if (lot.status === 'EMPTY') return { title: 'Lote encerrado', detail: 'Sem saldo em estoque' };
  const sale = { label: 'Vender', href: `#movimentacoes?lote=${lot.id}` };
  if (activeDiscount) return { title: 'Priorizar na venda', detail: `Em promoção com ${activeDiscount}% de desconto`, ...sale };
  if (lot.status === 'ATTENTION') return { title: `Promoção de ${lot.suggestedDiscountPercent}%`, detail: 'Sugestão pelos dias restantes', label: 'Criar promoção', href: `#promocoes?lote=${lot.id}&desconto=${lot.suggestedDiscountPercent}` };
  return { title: 'Sem ação necessária', detail: 'Fora da janela de atenção', ...sale };
}
