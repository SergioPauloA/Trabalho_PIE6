import { z } from "zod";

export const id = z.uuid();
export const params = z.object({ id });
export const date = z.iso.date();
export const pagination = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export const money = z.number().int().min(0).max(10_000_000);
export const quantity = z.number().int().min(1).max(1_000_000);
export const categoryBody = z
  .object({ name: z.string().trim().min(1).max(100) })
  .strict();
export const productBody = z
  .object({
    name: z.string().trim().min(1).max(160),
    sku: z.string().trim().min(1).max(60),
    barcode: z.string().trim().min(1).max(40).nullable().optional(),
    categoryId: id,
    active: z.boolean().default(true),
  })
  .strict();
export const productPatch = productBody
  .omit({ active: true })
  .partial()
  .extend({ active: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, "Informe ao menos um campo.");
export const lotBody = z
  .object({
    code: z.string().trim().min(1).max(60),
    productId: id,
    expiresAt: date,
    initialQuantity: quantity,
    unitCostCents: money,
    unitPriceCents: money.min(1),
  })
  .strict();
export const lotPatch = lotBody
  .omit({ productId: true, initialQuantity: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Informe ao menos um campo.");
export const saleBody = z.object({ quantity, requestKey: id }).strict();
export const discardBody = saleBody
  .extend({ reason: z.string().trim().min(3).max(300) })
  .strict();
export const promotionBody = z
  .object({ lotId: id, discountPercent: z.number().int().min(1).max(99) })
  .strict();
export const settingsBody = z
  .object({ alertDays: z.number().int().min(0).max(365) })
  .strict();
export const productQuery = pagination.extend({
  search: z.string().max(160).optional(),
  categoryId: id.optional(),
  active: z.enum(["true", "false"]).optional(),
});
export const lotQuery = pagination.extend({
  search: z.string().max(160).optional(),
  productId: id.optional(),
  categoryId: id.optional(),
  status: z.enum(["OK", "ATTENTION", "EXPIRED", "EMPTY"]).optional(),
});
export const promotionQuery = pagination.extend({
  lotId: id.optional(),
  status: z.enum(["ACTIVE", "CLOSED"]).optional(),
});
export const periodFields = { from: date.optional(), to: date.optional() };
const checkPeriod = (v: { from?: string; to?: string }) =>
  !v.from || !v.to || v.from <= v.to;
export const movementQuery = pagination
  .extend({
    ...periodFields,
    lotId: id.optional(),
    promotionId: id.optional(),
    type: z.enum(["SALE", "DISCARD"]).optional(),
  })
  .refine(checkPeriod, "from deve ser anterior ou igual a to.");
export const analyticQuery = z
  .object({
    ...periodFields,
    categoryId: id.optional(),
    productId: id.optional(),
    lotId: id.optional(),
    promotionId: id.optional(),
    type: z.enum(["SALE", "DISCARD"]).optional(),
    groupBy: z
      .enum(["day", "month", "category", "product", "lot"])
      .default("month"),
  })
  .refine(checkPeriod, "from deve ser anterior ou igual a to.");
export type AnalyticQuery = z.infer<typeof analyticQuery>;

// Respostas públicas: datas UTC ISO; validade e filtros de período em YYYY-MM-DD.
const timestamp = z.string();
export const category = z.object({
  id,
  name: z.string(),
  createdAt: timestamp,
});
export const product = z.object({
  id,
  name: z.string(),
  sku: z.string(),
  barcode: z.string().nullable(),
  categoryId: id,
  active: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const productWithCategory = product.extend({ category });
export const lot = z.object({
  id,
  code: z.string(),
  productId: id,
  expiresAt: timestamp,
  initialQuantity: z.number(),
  balance: z.number(),
  unitCostCents: z.number(),
  unitPriceCents: z.number(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const publicLot = lot.extend({
  product: productWithCategory,
  daysUntilExpiry: z.number(),
  status: z.enum(["OK", "ATTENTION", "EXPIRED", "EMPTY"]),
});
export const promotion = z.object({
  id,
  lotId: id,
  discountPercent: z.number(),
  unitPriceCents: z.number(),
  initialQuantity: z.number(),
  status: z.enum(["ACTIVE", "CLOSED"]),
  startedAt: timestamp,
  endedAt: timestamp.nullable(),
});
export const promotionWithLot = promotion.extend({
  lot: lot.extend({ product }),
});
export const movement = z.object({
  id,
  lotId: id,
  promotionId: id.nullable(),
  type: z.enum(["SALE", "DISCARD"]),
  quantity: z.number(),
  unitCostCents: z.number(),
  unitPriceCents: z.number(),
  reason: z.string().nullable(),
  requestKey: id,
  occurredAt: timestamp,
});
export const settings = z.object({
  id: z.number(),
  alertDays: z.number(),
  updatedAt: timestamp,
});
export const etlRun = z.object({
  id,
  status: z.enum(["RUNNING", "COMPLETED", "FAILED"]),
  processedCount: z.number(),
  error: z.string().nullable(),
  startedAt: timestamp,
  finishedAt: timestamp.nullable(),
});
export const error = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export const metricFields = {
  soldQuantity: z.number(),
  promotionalUnits: z.number(),
  discardedQuantity: z.number(),
  revenueCents: z.number(),
  promotionalRevenueCents: z.number(),
  lossCents: z.number(),
};
export const analyticSummary = z.object({
  lastEtlAt: timestamp.nullable(),
  ...metricFields,
});
export const analyticGroup = z.object({
  key: z.string(),
  label: z.string(),
  ...metricFields,
});
export const analytics = z.object({
  lastEtlAt: timestamp.nullable(),
  groupBy: z.string(),
  data: z.array(analyticGroup),
});
export const promotionResultSchema = z.object({
  promotion: promotionWithLot,
  soldQuantity: z.number(),
  discardedQuantity: z.number(),
  remainingFromPromotion: z.number(),
  currentLotBalance: z.number(),
  sellThroughPercent: z.number(),
  revenueCents: z.number(),
  lossCents: z.number(),
});
export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    pagination: z.object({
      page: z.number(),
      pageSize: z.number(),
      total: z.number(),
      totalPages: z.number(),
    }),
  });
export const responses = (schema: z.ZodType, status = 200) => ({
  [status]: schema,
  400: error,
  404: error,
  409: error,
  422: error,
  500: error,
  503: error,
});
