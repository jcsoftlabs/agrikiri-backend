-- CreateEnum
CREATE TYPE "PosCustomerType" AS ENUM ('WALK_IN', 'INDIVIDUAL', 'BUSINESS');

-- AlterTable
ALTER TABLE "PosSale"
ADD COLUMN "customerType" "PosCustomerType" NOT NULL DEFAULT 'WALK_IN',
ADD COLUMN "companyName" TEXT,
ADD COLUMN "taxId" TEXT;
