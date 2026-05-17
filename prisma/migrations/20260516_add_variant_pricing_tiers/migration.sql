-- CreateTable
CREATE TABLE "ProductVariantPricingTier" (
    "id" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "minQuantity" INTEGER NOT NULL,
    "maxQuantity" INTEGER,
    "price" DECIMAL(10,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariantPricingTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductVariantPricingTier_productVariantId_idx" ON "ProductVariantPricingTier"("productVariantId");

-- CreateIndex
CREATE INDEX "ProductVariantPricingTier_productVariantId_sortOrder_idx" ON "ProductVariantPricingTier"("productVariantId", "sortOrder");

-- AddForeignKey
ALTER TABLE "ProductVariantPricingTier" ADD CONSTRAINT "ProductVariantPricingTier_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
