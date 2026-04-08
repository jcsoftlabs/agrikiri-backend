CREATE TABLE IF NOT EXISTS "CustomerAddress" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "phoneCountryCode" TEXT NOT NULL,
  "phoneNumber" TEXT NOT NULL,
  "addressLine1" TEXT NOT NULL,
  "addressLine2" TEXT,
  "city" TEXT NOT NULL,
  "stateRegion" TEXT NOT NULL,
  "postalCode" TEXT,
  "deliveryInstructions" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomerAddress_userId_idx" ON "CustomerAddress"("userId");
CREATE INDEX IF NOT EXISTS "CustomerAddress_userId_isDefault_idx" ON "CustomerAddress"("userId", "isDefault");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'CustomerAddress_userId_fkey'
  ) THEN
    ALTER TABLE "CustomerAddress"
    ADD CONSTRAINT "CustomerAddress_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
