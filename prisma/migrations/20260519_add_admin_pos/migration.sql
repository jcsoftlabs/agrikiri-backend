-- CreateEnum
CREATE TYPE "PosDocumentType" AS ENUM ('RECEIPT', 'INVOICE', 'PROFORMA');

-- CreateEnum
CREATE TYPE "PosSaleStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PosSale" (
    "id" TEXT NOT NULL,
    "saleNumber" TEXT NOT NULL,
    "documentType" "PosDocumentType" NOT NULL,
    "status" "PosSaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "customerAddress" TEXT,
    "paymentMethod" "PaymentMethod",
    "subtotalAmount" DECIMAL(10,2) NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSaleItem" (
    "id" TEXT NOT NULL,
    "posSaleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productVariantId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "lineTotal" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "PosSaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosSale_saleNumber_key" ON "PosSale"("saleNumber");

-- CreateIndex
CREATE INDEX "PosSale_documentType_createdAt_idx" ON "PosSale"("documentType", "createdAt");

-- CreateIndex
CREATE INDEX "PosSale_createdById_createdAt_idx" ON "PosSale"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "PosSale_status_idx" ON "PosSale"("status");

-- CreateIndex
CREATE INDEX "PosSaleItem_posSaleId_idx" ON "PosSaleItem"("posSaleId");

-- CreateIndex
CREATE INDEX "PosSaleItem_productId_idx" ON "PosSaleItem"("productId");

-- CreateIndex
CREATE INDEX "PosSaleItem_productVariantId_idx" ON "PosSaleItem"("productVariantId");

-- AddForeignKey
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleItem" ADD CONSTRAINT "PosSaleItem_posSaleId_fkey" FOREIGN KEY ("posSaleId") REFERENCES "PosSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleItem" ADD CONSTRAINT "PosSaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleItem" ADD CONSTRAINT "PosSaleItem_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
