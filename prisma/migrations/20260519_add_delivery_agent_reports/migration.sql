CREATE TABLE "DeliveryAgentReport" (
  "id" TEXT NOT NULL,
  "deliveryAgentId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "shiftDate" TIMESTAMP(3) NOT NULL,
  "summary" TEXT NOT NULL,
  "totalAssigned" INTEGER NOT NULL DEFAULT 0,
  "deliveredCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "cashCollected" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "fieldExpenses" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "incidents" TEXT,
  "nextActions" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryAgentReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliveryAgentReport_deliveryAgentId_createdAt_idx" ON "DeliveryAgentReport"("deliveryAgentId", "createdAt");
CREATE INDEX "DeliveryAgentReport_shiftDate_idx" ON "DeliveryAgentReport"("shiftDate");

ALTER TABLE "DeliveryAgentReport"
  ADD CONSTRAINT "DeliveryAgentReport_deliveryAgentId_fkey"
  FOREIGN KEY ("deliveryAgentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
