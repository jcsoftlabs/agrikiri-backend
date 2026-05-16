ALTER TABLE "Dossier"
ADD COLUMN "disbursementLines" JSONB,
ADD COLUMN "disbursementTotal" DECIMAL(10,2) NOT NULL DEFAULT 0;
