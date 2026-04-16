-- CreateEnum
CREATE TYPE "DeliveryMode" AS ENUM ('INTERNAL', 'EXTERNAL');

-- AlterTable
ALTER TABLE "Order"
ADD COLUMN "deliveryMode" "DeliveryMode" NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN "deliveryAgentName" TEXT,
ADD COLUMN "deliveryAgentPhone" TEXT,
ADD COLUMN "deliveryZone" TEXT;
