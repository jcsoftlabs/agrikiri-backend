CREATE TABLE "DossierDecision" (
  "id" TEXT NOT NULL,
  "dossierId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DossierDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DossierDecision_dossierId_idx" ON "DossierDecision"("dossierId");
CREATE INDEX "DossierDecision_authorId_idx" ON "DossierDecision"("authorId");

ALTER TABLE "DossierDecision"
ADD CONSTRAINT "DossierDecision_dossierId_fkey"
FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DossierDecision"
ADD CONSTRAINT "DossierDecision_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
