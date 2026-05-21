-- AlterTable
ALTER TABLE "DeliveryNote"
ADD COLUMN "receiverName" TEXT,
ADD COLUMN "receiverSignatureUrl" TEXT,
ADD COLUMN "receiverSignaturePublicId" TEXT;
