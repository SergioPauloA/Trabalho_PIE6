BEGIN;

-- Approved reset of legacy TEST inventory: item counts have no known mass and
-- cannot be reinterpreted as tonnes. Keep products, categories and settings.
-- This migration runs once. Later deployments preserve all new tonne records.
TRUNCATE TABLE "FactMovement", "DimDate", "DimProduct", "DimLot",
  "DimPromotion", "EtlRun", "Movement", "Promotion", "Lot";

ALTER TABLE "Lot"
  ALTER COLUMN "initialQuantity" TYPE DECIMAL(12,3),
  ALTER COLUMN "balance" TYPE DECIMAL(12,3);
ALTER TABLE "Promotion" ALTER COLUMN "initialQuantity" TYPE DECIMAL(12,3);
ALTER TABLE "Movement" ALTER COLUMN "quantity" TYPE DECIMAL(12,3);
ALTER TABLE "FactMovement" RENAME COLUMN "promotionalUnits" TO "promotionalQuantity";
ALTER TABLE "FactMovement"
  ALTER COLUMN "quantity" TYPE DECIMAL(12,3),
  ALTER COLUMN "promotionalQuantity" TYPE DECIMAL(12,3);

COMMENT ON COLUMN "Lot"."initialQuantity" IS 'Tonnes, precision 0.001 t (1 kg)';
COMMENT ON COLUMN "Lot"."balance" IS 'Tonnes, precision 0.001 t (1 kg)';
COMMENT ON COLUMN "Lot"."unitCostCents" IS 'BRL cents per tonne';
COMMENT ON COLUMN "Lot"."unitPriceCents" IS 'BRL cents per tonne';
COMMENT ON COLUMN "Movement"."quantity" IS 'Tonnes, precision 0.001 t (1 kg)';
COMMENT ON COLUMN "Movement"."unitCostCents" IS 'BRL cents per tonne at movement time';
COMMENT ON COLUMN "Movement"."unitPriceCents" IS 'BRL cents per tonne at movement time';
COMMENT ON COLUMN "Promotion"."unitPriceCents" IS 'BRL cents per tonne';
COMMENT ON COLUMN "FactMovement"."quantity" IS 'Tonnes';
COMMENT ON COLUMN "FactMovement"."promotionalQuantity" IS 'Tonnes sold on promotion';

COMMIT;
