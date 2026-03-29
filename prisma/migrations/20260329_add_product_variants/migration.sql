-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "productVariantId" TEXT;

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "weightLbs" DECIMAL(10,2) NOT NULL,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "vpPoints" DECIMAL(10,2) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- Backfill existing products with a default variant
INSERT INTO "ProductVariant" (
    "id",
    "productId",
    "label",
    "price",
    "weightLbs",
    "stockQuantity",
    "vpPoints",
    "isDefault",
    "isActive",
    "sortOrder",
    "createdAt",
    "updatedAt"
)
SELECT
    substr(md5("id" || '-default-variant'), 1, 8) || '-' ||
    substr(md5("id" || '-default-variant'), 9, 4) || '-' ||
    substr(md5("id" || '-default-variant'), 13, 4) || '-' ||
    substr(md5("id" || '-default-variant'), 17, 4) || '-' ||
    substr(md5("id" || '-default-variant'), 21, 12) AS "id",
    "id" AS "productId",
    trim(to_char("weightLbs", 'FM999999999.##')) || ' Livres' AS "label",
    "price",
    "weightLbs",
    "stockQuantity",
    "vpPoints",
    true AS "isDefault",
    true AS "isActive",
    0 AS "sortOrder",
    "createdAt",
    "updatedAt"
FROM "Product"
WHERE NOT EXISTS (
    SELECT 1
    FROM "ProductVariant"
    WHERE "ProductVariant"."productId" = "Product"."id"
);

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_isActive_idx" ON "ProductVariant"("productId", "isActive");

-- CreateIndex
CREATE INDEX "OrderItem_productVariantId_idx" ON "OrderItem"("productVariantId");

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
