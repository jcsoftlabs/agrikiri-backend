-- AlterEnum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DELIVERY_AGENT';

-- AlterTable
ALTER TABLE "Order"
ADD COLUMN "deliveryAgentId" TEXT;

-- CreateIndex
CREATE INDEX "Order_deliveryAgentId_idx" ON "Order"("deliveryAgentId");

-- AddForeignKey
ALTER TABLE "Order"
ADD CONSTRAINT "Order_deliveryAgentId_fkey"
FOREIGN KEY ("deliveryAgentId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
