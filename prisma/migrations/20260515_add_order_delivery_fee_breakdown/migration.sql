ALTER TABLE "Order"
ADD COLUMN "subtotalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "deliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 0;

UPDATE "Order"
SET "subtotalAmount" = "totalAmount",
    "deliveryFee" = 0
WHERE "subtotalAmount" = 0;
