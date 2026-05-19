-- CreateEnum
CREATE TYPE "DeliveryNoteSourceType" AS ENUM ('ORDER', 'POS_SALE');

-- CreateEnum
CREATE TYPE "DeliveryNoteStatus" AS ENUM ('PREPARED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "DeliveryNote" (
    "id" TEXT NOT NULL,
    "noteNumber" TEXT NOT NULL,
    "sourceType" "DeliveryNoteSourceType" NOT NULL,
    "orderId" TEXT,
    "posSaleId" TEXT,
    "deliveryAgentId" TEXT,
    "createdById" TEXT NOT NULL,
    "status" "DeliveryNoteStatus" NOT NULL DEFAULT 'PREPARED',
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerAddress" TEXT,
    "notes" TEXT,
    "totalQuantity" INTEGER NOT NULL DEFAULT 0,
    "totalWeightLbs" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNoteItem" (
    "id" TEXT NOT NULL,
    "deliveryNoteId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "posSaleItemId" TEXT,
    "productId" TEXT NOT NULL,
    "productVariantId" TEXT,
    "description" TEXT NOT NULL,
    "orderedQuantity" INTEGER NOT NULL,
    "deliveredQuantity" INTEGER NOT NULL,
    "remainingQuantity" INTEGER NOT NULL,
    "unitWeightLbs" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "lineWeightLbs" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "DeliveryNoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryNote_noteNumber_key" ON "DeliveryNote"("noteNumber");

-- CreateIndex
CREATE INDEX "DeliveryNote_orderId_idx" ON "DeliveryNote"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryNote_posSaleId_idx" ON "DeliveryNote"("posSaleId");

-- CreateIndex
CREATE INDEX "DeliveryNote_deliveryAgentId_status_idx" ON "DeliveryNote"("deliveryAgentId", "status");

-- CreateIndex
CREATE INDEX "DeliveryNote_sourceType_createdAt_idx" ON "DeliveryNote"("sourceType", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryNoteItem_deliveryNoteId_idx" ON "DeliveryNoteItem"("deliveryNoteId");

-- CreateIndex
CREATE INDEX "DeliveryNoteItem_orderItemId_idx" ON "DeliveryNoteItem"("orderItemId");

-- CreateIndex
CREATE INDEX "DeliveryNoteItem_posSaleItemId_idx" ON "DeliveryNoteItem"("posSaleItemId");

-- CreateIndex
CREATE INDEX "DeliveryNoteItem_productId_idx" ON "DeliveryNoteItem"("productId");

-- CreateIndex
CREATE INDEX "DeliveryNoteItem_productVariantId_idx" ON "DeliveryNoteItem"("productVariantId");

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_posSaleId_fkey" FOREIGN KEY ("posSaleId") REFERENCES "PosSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_deliveryAgentId_fkey" FOREIGN KEY ("deliveryAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteItem" ADD CONSTRAINT "DeliveryNoteItem_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteItem" ADD CONSTRAINT "DeliveryNoteItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteItem" ADD CONSTRAINT "DeliveryNoteItem_posSaleItemId_fkey" FOREIGN KEY ("posSaleItemId") REFERENCES "PosSaleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteItem" ADD CONSTRAINT "DeliveryNoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteItem" ADD CONSTRAINT "DeliveryNoteItem_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
