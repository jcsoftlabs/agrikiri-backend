ALTER TABLE "Order"
ADD COLUMN "deliveryRecipientName" TEXT,
ADD COLUMN "deliveryProofNote" TEXT,
ADD COLUMN "deliveryProofPhotoUrl" TEXT,
ADD COLUMN "deliveryProofPhotoPublicId" TEXT,
ADD COLUMN "deliverySignatureUrl" TEXT,
ADD COLUMN "deliverySignaturePublicId" TEXT,
ADD COLUMN "deliveredLatitude" DECIMAL(10,7),
ADD COLUMN "deliveredLongitude" DECIMAL(10,7),
ADD COLUMN "deliveredLocationAccuracy" DECIMAL(10,2),
ADD COLUMN "deliveryProofCapturedAt" TIMESTAMP(3);
