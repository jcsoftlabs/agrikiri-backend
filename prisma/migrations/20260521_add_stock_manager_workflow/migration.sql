ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'STOCK_MANAGER';

CREATE TYPE "BuyerStockShipmentStatus" AS ENUM (
  'PENDING_RECEIPT',
  'RECEIVED'
);

CREATE TABLE "BuyerStockShipment" (
  "id" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "notes" TEXT,
  "status" "BuyerStockShipmentStatus" NOT NULL DEFAULT 'PENDING_RECEIPT',
  "items" JSONB NOT NULL,
  "totalQuantity" INTEGER NOT NULL DEFAULT 0,
  "totalWeightLbs" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "receivedAt" TIMESTAMP(3),
  "receivedById" TEXT,
  "reportedInStockReportId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BuyerStockShipment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockManagerReport" (
  "id" TEXT NOT NULL,
  "stockManagerId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "reportDate" TIMESTAMP(3) NOT NULL,
  "summary" TEXT,
  "buyerReceiptItems" JSONB,
  "buyerReceiptTotalQuantity" INTEGER NOT NULL DEFAULT 0,
  "buyerReceiptTotalWeightLbs" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "stockOutputItems" JSONB,
  "stockOutputTotalQuantity" INTEGER NOT NULL DEFAULT 0,
  "stockOutputTotalWeightLbs" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "productionInputItems" JSONB,
  "productionInputTotalQuantity" INTEGER NOT NULL DEFAULT 0,
  "productionOrderOutputItems" JSONB,
  "productionOrderOutputTotalQuantity" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StockManagerReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BuyerStockShipment_buyerId_status_idx" ON "BuyerStockShipment"("buyerId", "status");
CREATE INDEX "BuyerStockShipment_receivedById_idx" ON "BuyerStockShipment"("receivedById");
CREATE INDEX "BuyerStockShipment_reportedInStockReportId_idx" ON "BuyerStockShipment"("reportedInStockReportId");
CREATE INDEX "StockManagerReport_stockManagerId_reportDate_idx" ON "StockManagerReport"("stockManagerId", "reportDate");

ALTER TABLE "BuyerStockShipment"
  ADD CONSTRAINT "BuyerStockShipment_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BuyerStockShipment"
  ADD CONSTRAINT "BuyerStockShipment_receivedById_fkey"
  FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BuyerStockShipment"
  ADD CONSTRAINT "BuyerStockShipment_reportedInStockReportId_fkey"
  FOREIGN KEY ("reportedInStockReportId") REFERENCES "StockManagerReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockManagerReport"
  ADD CONSTRAINT "StockManagerReport_stockManagerId_fkey"
  FOREIGN KEY ("stockManagerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
