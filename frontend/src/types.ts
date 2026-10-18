export interface Page<T> { data: T[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }
export interface Category { id: string; name: string }
export interface Product { id: string; name: string; sku: string; barcode: string | null; categoryId: string; active: boolean; category: Category }
export interface Lot { id: string; code: string; productId: string; product: Product; expiresAt: string; initialQuantity: number; balance: number; unitCostCents: number; unitPriceCents: number; daysUntilExpiry: number; status: 'OK' | 'ATTENTION' | 'EXPIRED' | 'EMPTY' }
export interface LotDetail extends Lot { soldQuantity: number; discardedQuantity: number }
export interface Promotion { id: string; lotId: string; discountPercent: number; unitPriceCents: number; initialQuantity: number; status: 'ACTIVE' | 'CLOSED'; startedAt: string; endedAt: string | null; lot: Lot }
export interface PromotionResult { promotion: Promotion; soldQuantity: number; discardedQuantity: number; remainingFromPromotion: number; currentLotBalance: number; sellThroughPercent: number; revenueCents: number; lossCents: number }
export interface Movement { id: string; lotId: string; promotionId: string | null; type: 'SALE' | 'DISCARD'; quantity: number; unitCostCents: number; unitPriceCents: number; reason: string | null; occurredAt: string }
export interface MovementResult { movement: Movement; balance: number; replayed: boolean }
export interface Stock { date: string; alertDays: number; activeLots: number; totalTonnes: number; expiredLots: number; expiredTonnes: number; attentionLots: number; attentionTonnes: number; activePromotions: number }
export interface Settings { alertDays: number; updatedAt: string }
export interface Metrics { soldQuantity: number; promotionalQuantity: number; discardedQuantity: number; revenueCents: number; promotionalRevenueCents: number; lossCents: number }
export interface Summary extends Metrics { lastEtlAt: string | null }
export interface Groups { lastEtlAt: string | null; data: (Metrics & { key: string; label: string })[] }
export interface Rollup { lastEtlAt: string | null; data: (Metrics & { level: 'day' | 'month' | 'year' | 'total'; day: string | null; month: string | null; year: number | null })[] }
export interface EtlRun { id: string; status: 'RUNNING' | 'COMPLETED' | 'FAILED'; processedCount: number; error: string | null; startedAt: string; finishedAt: string | null }
