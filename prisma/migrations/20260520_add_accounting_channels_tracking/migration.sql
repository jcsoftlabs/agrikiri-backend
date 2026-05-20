-- CreateEnum
CREATE TYPE "AccountingChannel" AS ENUM (
  'CASH',
  'MONCASH',
  'NATCASH',
  'PLOPPLOP',
  'CHEQUE',
  'VIREMENT_BANCAIRE',
  'KASHPAW',
  'AUTRE'
);

-- AlterTable
ALTER TABLE "BuyerAllocation"
ADD COLUMN "disbursementMethod" "AccountingChannel" NOT NULL DEFAULT 'CASH';

-- AlterTable
ALTER TABLE "DeliveryAgentReport"
ADD COLUMN "cashCollectionMethod" "AccountingChannel" NOT NULL DEFAULT 'CASH',
ADD COLUMN "fieldExpensesMethod" "AccountingChannel" NOT NULL DEFAULT 'CASH';

-- AlterTable
ALTER TABLE "Dossier"
ADD COLUMN "disbursementMethod" "AccountingChannel" NOT NULL DEFAULT 'CASH';
