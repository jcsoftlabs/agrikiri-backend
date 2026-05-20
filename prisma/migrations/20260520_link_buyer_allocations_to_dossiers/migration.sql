-- AlterTable
ALTER TABLE "BuyerAllocation"
ADD COLUMN "sourceDossierId" TEXT;

-- CreateIndex
CREATE INDEX "BuyerAllocation_sourceDossierId_idx" ON "BuyerAllocation"("sourceDossierId");

-- AddForeignKey
ALTER TABLE "BuyerAllocation"
ADD CONSTRAINT "BuyerAllocation_sourceDossierId_fkey"
FOREIGN KEY ("sourceDossierId") REFERENCES "Dossier"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
