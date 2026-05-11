ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ASSOCIATE';

CREATE TYPE "AssociateType" AS ENUM ('PDG', 'VOTING', 'OBSERVER');

ALTER TABLE "User"
ADD COLUMN "associateType" "AssociateType";

CREATE TABLE "Dossier" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "authorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Dossier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DossierDocument" (
  "id" TEXT NOT NULL,
  "dossierId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DossierDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Vote" (
  "id" TEXT NOT NULL,
  "dossierId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Ballot" (
  "id" TEXT NOT NULL,
  "voteId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "choice" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Ballot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InternalMessage" (
  "id" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InternalMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DossierComment" (
  "id" TEXT NOT NULL,
  "dossierId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DossierComment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Ballot_voteId_userId_key" ON "Ballot"("voteId", "userId");
CREATE INDEX "Dossier_authorId_idx" ON "Dossier"("authorId");
CREATE INDEX "DossierDocument_dossierId_idx" ON "DossierDocument"("dossierId");
CREATE INDEX "Vote_dossierId_idx" ON "Vote"("dossierId");
CREATE INDEX "Ballot_voteId_idx" ON "Ballot"("voteId");
CREATE INDEX "Ballot_userId_idx" ON "Ballot"("userId");
CREATE INDEX "InternalMessage_senderId_idx" ON "InternalMessage"("senderId");
CREATE INDEX "DossierComment_dossierId_idx" ON "DossierComment"("dossierId");
CREATE INDEX "DossierComment_authorId_idx" ON "DossierComment"("authorId");

ALTER TABLE "Dossier"
ADD CONSTRAINT "Dossier_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DossierDocument"
ADD CONSTRAINT "DossierDocument_dossierId_fkey"
FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Vote"
ADD CONSTRAINT "Vote_dossierId_fkey"
FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Ballot"
ADD CONSTRAINT "Ballot_voteId_fkey"
FOREIGN KEY ("voteId") REFERENCES "Vote"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Ballot"
ADD CONSTRAINT "Ballot_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InternalMessage"
ADD CONSTRAINT "InternalMessage_senderId_fkey"
FOREIGN KEY ("senderId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DossierComment"
ADD CONSTRAINT "DossierComment_dossierId_fkey"
FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DossierComment"
ADD CONSTRAINT "DossierComment_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
