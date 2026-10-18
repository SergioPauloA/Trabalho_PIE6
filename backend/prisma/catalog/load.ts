import { readFileSync } from "node:fs";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { localDate } from "../../src/domain.js";
import { money, quantity, quantityUnit } from "../../src/schemas.js";

const catalogSchema = z.object({
  description: z.string(),
  quantityUnit,
  products: z.array(z.object({
    sku: z.string().min(1).max(60),
    name: z.string().min(1).max(160),
    category: z.string().min(1).max(100),
    initialQuantity: quantity,
    unitCostCents: money,
    unitPriceCents: money.min(1),
    daysUntilExpiry: z.number().int().min(1).max(365),
  }).strict()).min(1),
}).strict().refine(catalog => new Set(catalog.products.map(p => p.sku)).size === catalog.products.length, "SKUs duplicados na carga.");

export function readCatalog() {
  return catalogSchema.parse(JSON.parse(readFileSync(new URL("./products.json", import.meta.url), "utf8")));
}

export async function loadCatalog(db: PrismaClient, options: { catalogOnly?: boolean; now?: Date } = {}) {
  const catalog = readCatalog();
  const baseDate = Date.parse(localDate(options.now ?? new Date()));
  return db.$transaction(async tx => {
    // Serialize concurrent runs of this seed; all entries commit or roll back together.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(624602)`;
    const result = { productsCreated: 0, productsPreserved: 0, lotsCreated: 0, lotsPreserved: 0, inactiveSkipped: 0, addedTonnes: "0.000" };
    let addedTonnes = new Prisma.Decimal(0);
    for (const entry of catalog.products) {
      let product = await tx.product.findUnique({ where: { sku: entry.sku } });
      if (!product) {
        const category = await tx.category.upsert({ where: { name: entry.category }, create: { name: entry.category }, update: {} });
        product = await tx.product.create({ data: { name: entry.name, sku: entry.sku, categoryId: category.id } });
        result.productsCreated++;
      } else result.productsPreserved++;
      if (options.catalogOnly) continue;
      const code = `DEMO-CATALOGO-${entry.sku}`;
      const existing = await tx.lot.findUnique({ where: { code } });
      if (existing) {
        if (existing.productId !== product.id) throw new Error(`O lote ${code} já pertence a outro produto. Nenhum dado da carga foi alterado.`);
        result.lotsPreserved++;
        continue;
      }
      if (!product.active) { result.inactiveSkipped++; continue; }
      await tx.lot.create({ data: {
        code, productId: product.id,
        expiresAt: new Date(baseDate + entry.daysUntilExpiry * 86_400_000),
        initialQuantity: entry.initialQuantity, balance: entry.initialQuantity,
        unitCostCents: entry.unitCostCents, unitPriceCents: entry.unitPriceCents,
      } });
      result.lotsCreated++;
      addedTonnes = addedTonnes.plus(entry.initialQuantity);
    }
    result.addedTonnes = addedTonnes.toFixed(3);
    return result;
  }, { timeout: 30_000 });
}
