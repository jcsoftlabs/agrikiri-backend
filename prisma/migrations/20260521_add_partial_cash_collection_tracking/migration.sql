ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_PAID';

ALTER TABLE "Order"
ADD COLUMN "amountCollected" DECIMAL(10, 2) NOT NULL DEFAULT 0;

UPDATE "Order"
SET "amountCollected" = "totalAmount"
WHERE "paymentStatus" = 'PAID';
