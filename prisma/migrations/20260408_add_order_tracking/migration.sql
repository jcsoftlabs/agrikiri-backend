ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "carrierName" TEXT,
ADD COLUMN IF NOT EXISTS "trackingNumber" TEXT,
ADD COLUMN IF NOT EXISTS "estimatedDeliveryDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "shippedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "OrderTrackingEvent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "status" "OrderStatus",
  "title" TEXT NOT NULL,
  "description" TEXT,
  "isCustomerVisible" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderTrackingEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrderTrackingEvent_orderId_createdAt_idx"
ON "OrderTrackingEvent"("orderId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'OrderTrackingEvent_orderId_fkey'
  ) THEN
    ALTER TABLE "OrderTrackingEvent"
    ADD CONSTRAINT "OrderTrackingEvent_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
