ALTER TABLE "User"
ADD COLUMN "passwordResetCode" TEXT,
ADD COLUMN "passwordResetExpires" TIMESTAMP(3);
