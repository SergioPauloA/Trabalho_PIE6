-- Regras que também devem valer fora da API.
ALTER TABLE "Lot" ADD CONSTRAINT "lot_stock_valid"
  CHECK ("initialQuantity" > 0 AND balance >= 0 AND balance <= "initialQuantity");
ALTER TABLE "Lot" ADD CONSTRAINT "lot_prices_valid"
  CHECK ("unitCostCents" >= 0 AND "unitPriceCents" > 0);
ALTER TABLE "Movement" ADD CONSTRAINT "movement_values_valid"
  CHECK (quantity > 0 AND "unitCostCents" >= 0 AND "unitPriceCents" >= 0
    AND (type <> 'DISCARD' OR (length(trim(reason)) >= 3 AND reason IS NOT NULL)));
ALTER TABLE "Promotion" ADD CONSTRAINT "promotion_values_valid"
  CHECK ("discountPercent" BETWEEN 1 AND 99 AND "unitPriceCents" > 0 AND "initialQuantity" > 0
    AND ((status = 'ACTIVE' AND "endedAt" IS NULL)
      OR (status = 'CLOSED' AND "endedAt" >= "startedAt" AND "endedAt" IS NOT NULL)));
CREATE UNIQUE INDEX "one_active_promotion_per_lot" ON "Promotion" ("lotId") WHERE status = 'ACTIVE';
ALTER TABLE "Promotion" ADD CONSTRAINT "promotion_id_lot_unique" UNIQUE (id, "lotId");
ALTER TABLE "Movement" ADD CONSTRAINT "movement_promotion_same_lot"
  FOREIGN KEY ("promotionId", "lotId") REFERENCES "Promotion" (id, "lotId") ON DELETE RESTRICT;
ALTER TABLE "Settings" ADD CONSTRAINT "settings_singleton_valid" CHECK (id = 1 AND "alertDays" BETWEEN 0 AND 365);
ALTER TABLE "FactMovement" ADD CONSTRAINT "fact_values_valid"
  CHECK (quantity > 0 AND "revenueCents" >= 0 AND "lossCents" >= 0 AND "promotionalUnits" BETWEEN 0 AND quantity);
INSERT INTO "Settings" (id, "alertDays", "updatedAt") VALUES (1, 10, now());
