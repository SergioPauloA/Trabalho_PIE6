-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";
-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('SALE', 'DISCARD');
-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('ACTIVE', 'CLOSED');
-- CreateEnum
CREATE TYPE "EtlStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "sku" VARCHAR(60) NOT NULL,
    "barcode" VARCHAR(40),
    "categoryId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Lot" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "productId" UUID NOT NULL,
    "expiresAt" DATE NOT NULL,
    "initialQuantity" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Promotion" (
    "id" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "initialQuantity" INTEGER NOT NULL,
    "status" "PromotionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),
    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Movement" (
    "id" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "promotionId" UUID,
    "type" "MovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "reason" VARCHAR(300),
    "requestKey" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "alertDays" INTEGER NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "EtlRun" (
    "id" UUID NOT NULL,
    "status" "EtlStatus" NOT NULL DEFAULT 'RUNNING',
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),
    CONSTRAINT "EtlRun_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "DimDate" (
    "id" VARCHAR(10) NOT NULL,
    "day" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    CONSTRAINT "DimDate_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "DimProduct" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "categoryName" TEXT NOT NULL,
    CONSTRAINT "DimProduct_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "DimLot" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" DATE NOT NULL,
    CONSTRAINT "DimLot_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "DimPromotion" (
    "id" TEXT NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    CONSTRAINT "DimPromotion_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "FactMovement" (
    "id" UUID NOT NULL,
    "dateId" VARCHAR(10) NOT NULL,
    "productId" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "promotionId" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "revenueCents" BIGINT NOT NULL,
    "lossCents" BIGINT NOT NULL,
    "promotionalUnits" INTEGER NOT NULL,
    CONSTRAINT "FactMovement_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");
-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
-- CreateIndex
CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");
-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");
-- CreateIndex
CREATE UNIQUE INDEX "Lot_code_key" ON "Lot"("code");
-- CreateIndex
CREATE INDEX "Lot_productId_idx" ON "Lot"("productId");
-- CreateIndex
CREATE INDEX "Lot_expiresAt_balance_idx" ON "Lot"("expiresAt", "balance");
-- CreateIndex
CREATE INDEX "Promotion_lotId_status_idx" ON "Promotion"("lotId", "status");
-- CreateIndex
CREATE UNIQUE INDEX "Movement_requestKey_key" ON "Movement"("requestKey");
-- CreateIndex
CREATE INDEX "Movement_lotId_occurredAt_idx" ON "Movement"("lotId", "occurredAt");
-- CreateIndex
CREATE INDEX "Movement_promotionId_idx" ON "Movement"("promotionId");
-- CreateIndex
CREATE INDEX "Movement_occurredAt_type_idx" ON "Movement"("occurredAt", "type");
-- CreateIndex
CREATE INDEX "EtlRun_status_finishedAt_idx" ON "EtlRun"("status", "finishedAt");
-- CreateIndex
CREATE INDEX "DimProduct_categoryId_idx" ON "DimProduct"("categoryId");
-- CreateIndex
CREATE INDEX "FactMovement_dateId_type_idx" ON "FactMovement"("dateId", "type");
-- CreateIndex
CREATE INDEX "FactMovement_productId_idx" ON "FactMovement"("productId");
-- CreateIndex
CREATE INDEX "FactMovement_lotId_idx" ON "FactMovement"("lotId");
-- CreateIndex
CREATE INDEX "FactMovement_promotionId_idx" ON "FactMovement"("promotionId");
-- AddForeignKey
ALTER TABLE "Product"
ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Lot"
ADD CONSTRAINT "Lot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Promotion"
ADD CONSTRAINT "Promotion_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Movement"
ADD CONSTRAINT "Movement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Movement"
ADD CONSTRAINT "Movement_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "FactMovement"
ADD CONSTRAINT "FactMovement_dateId_fkey" FOREIGN KEY ("dateId") REFERENCES "DimDate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "FactMovement"
ADD CONSTRAINT "FactMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "DimProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "FactMovement"
ADD CONSTRAINT "FactMovement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "DimLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "FactMovement"
ADD CONSTRAINT "FactMovement_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "DimPromotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;