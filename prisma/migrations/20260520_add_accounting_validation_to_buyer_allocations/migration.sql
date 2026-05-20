-- AlterTable
ALTER TABLE "BuyerAllocation"
ADD COLUMN "accountingValidatedAt" TIMESTAMP(3),
ADD COLUMN "accountingValidatedById" TEXT;
