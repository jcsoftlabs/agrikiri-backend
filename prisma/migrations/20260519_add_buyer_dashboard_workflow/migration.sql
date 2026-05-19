ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'BUYER';

CREATE TYPE "BuyerAllocationStatus" AS ENUM (
  'PENDING_CONFIRMATION',
  'ACTIVE',
  'PARTIALLY_REPORTED',
  'REPORTED'
);

CREATE TABLE "BuyerAllocation" (
  "id" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "allocatedById" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "amountAllocated" DECIMAL(10,2) NOT NULL,
  "status" "BuyerAllocationStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
  "receivedConfirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuyerAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BuyerExpenseReport" (
  "id" TEXT NOT NULL,
  "allocationId" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "summary" TEXT,
  "totalSpent" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "totalFees" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "totalReported" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "remainingAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuyerExpenseReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BuyerExpenseLine" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(10,2) NOT NULL,
  "unitPrice" DECIMAL(10,2) NOT NULL,
  "fees" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "lineAmount" DECIMAL(10,2) NOT NULL,
  CONSTRAINT "BuyerExpenseLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BuyerAllocation_buyerId_status_idx" ON "BuyerAllocation"("buyerId", "status");
CREATE INDEX "BuyerAllocation_allocatedById_idx" ON "BuyerAllocation"("allocatedById");
CREATE INDEX "BuyerExpenseReport_allocationId_createdAt_idx" ON "BuyerExpenseReport"("allocationId", "createdAt");
CREATE INDEX "BuyerExpenseReport_buyerId_idx" ON "BuyerExpenseReport"("buyerId");
CREATE INDEX "BuyerExpenseLine_reportId_sortOrder_idx" ON "BuyerExpenseLine"("reportId", "sortOrder");

ALTER TABLE "BuyerAllocation"
  ADD CONSTRAINT "BuyerAllocation_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BuyerAllocation"
  ADD CONSTRAINT "BuyerAllocation_allocatedById_fkey"
  FOREIGN KEY ("allocatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BuyerExpenseReport"
  ADD CONSTRAINT "BuyerExpenseReport_allocationId_fkey"
  FOREIGN KEY ("allocationId") REFERENCES "BuyerAllocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BuyerExpenseReport"
  ADD CONSTRAINT "BuyerExpenseReport_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BuyerExpenseLine"
  ADD CONSTRAINT "BuyerExpenseLine_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "BuyerExpenseReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
