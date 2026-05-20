-- AlterTable
ALTER TABLE "Order"
ADD COLUMN "cashReconciledAt" TIMESTAMP(3),
ADD COLUMN "cashReconciledById" TEXT;

-- AlterTable
ALTER TABLE "DeliveryAgentReport"
ADD COLUMN "accountingValidatedAt" TIMESTAMP(3),
ADD COLUMN "accountingValidatedById" TEXT;

-- AlterTable
ALTER TABLE "BuyerExpenseReport"
ADD COLUMN "accountingValidatedAt" TIMESTAMP(3),
ADD COLUMN "accountingValidatedById" TEXT;

-- AlterTable
ALTER TABLE "Dossier"
ADD COLUMN "accountingExecutedAt" TIMESTAMP(3),
ADD COLUMN "accountingExecutedById" TEXT;

-- CreateTable
CREATE TABLE "AccountingPeriodClosure" (
  "id" TEXT NOT NULL,
  "rangeLabel" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "totalInflows" DECIMAL(10,2) NOT NULL,
  "totalOutflows" DECIMAL(10,2) NOT NULL,
  "netTreasury" DECIMAL(10,2) NOT NULL,
  "note" TEXT,
  "closedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccountingPeriodClosure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountingPeriodClosure_startDate_endDate_idx" ON "AccountingPeriodClosure"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "AccountingPeriodClosure_closedById_createdAt_idx" ON "AccountingPeriodClosure"("closedById", "createdAt");
