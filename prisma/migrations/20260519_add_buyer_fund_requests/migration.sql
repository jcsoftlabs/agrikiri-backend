-- CreateEnum
CREATE TYPE "BuyerFundRequestStatus" AS ENUM ('PENDING', 'FULFILLED', 'DECLINED');

-- CreateTable
CREATE TABLE "BuyerFundRequest" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "amountRequested" DECIMAL(10,2) NOT NULL,
    "status" "BuyerFundRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerFundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuyerFundRequest_buyerId_status_idx" ON "BuyerFundRequest"("buyerId", "status");

-- CreateIndex
CREATE INDEX "BuyerFundRequest_status_createdAt_idx" ON "BuyerFundRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BuyerFundRequest_reviewedById_idx" ON "BuyerFundRequest"("reviewedById");

-- AddForeignKey
ALTER TABLE "BuyerFundRequest" ADD CONSTRAINT "BuyerFundRequest_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerFundRequest" ADD CONSTRAINT "BuyerFundRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
