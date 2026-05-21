ALTER TABLE "DeliveryAgentReport"
ADD COLUMN "deliveryNoteId" TEXT,
ADD COLUMN "remainingAssigned" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "totalDeliveredWeightLbs" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "totalDeliveredWeightKg" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "weightUnit" TEXT NOT NULL DEFAULT 'LBS',
ADD COLUMN "reportItems" JSONB;

CREATE INDEX "DeliveryAgentReport_deliveryNoteId_idx" ON "DeliveryAgentReport"("deliveryNoteId");

ALTER TABLE "DeliveryAgentReport"
ADD CONSTRAINT "DeliveryAgentReport_deliveryNoteId_fkey"
FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
