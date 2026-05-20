import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import {
  CreateDossierDecisionInput,
  CreateDossierInput,
  CreateVoteInput,
  SubmitBallotInput,
  CreateMessageInput,
} from './associates.schema';
import { createError } from '../../middleware/error.middleware';

const DOSSIER_VOTE_QUORUM = 3;

// ================================
// DOSSIERS
// ================================

export async function getAllDossiers() {
  const dossiers = await prisma.dossier.findMany({
    include: {
      author: {
        select: { firstName: true, lastName: true }
      },
      _count: {
        select: { documents: true, votes: true }
      },
      votes: {
        select: {
          _count: {
            select: { ballots: true }
          }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return dossiers.map(({ votes, ...dossier }) => ({
    ...dossier,
    voteBallotsCount: votes.reduce((sum, vote) => sum + vote._count.ballots, 0),
  }));
}

export async function getDossierById(id: string) {
  const dossier = await prisma.dossier.findUnique({
    where: { id },
    include: {
      author: { select: { firstName: true, lastName: true } },
      documents: true,
      votes: {
        include: {
          _count: { select: { ballots: true } }
        }
      },
      comments: {
        include: {
          author: { select: { firstName: true, lastName: true, associateType: true, avatarUrl: true } }
        },
        orderBy: { createdAt: 'desc' }
      },
      decisions: {
        include: {
          author: { select: { id: true, firstName: true, lastName: true, associateType: true, avatarUrl: true } }
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!dossier) throw createError('Dossier introuvable', 404);
  return dossier;
}

function getLatestDecisionByAuthor(decisions: Array<{ authorId: string; action: string; createdAt: Date }>) {
  const latest = new Map<string, { action: string; createdAt: Date }>();
  decisions
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .forEach((decision) => {
      if (!latest.has(decision.authorId)) {
        latest.set(decision.authorId, { action: decision.action, createdAt: decision.createdAt });
      }
    });
  return Array.from(latest.values());
}

export async function getPdgApprover() {
  return prisma.user.findFirst({
    where: {
      role: 'ASSOCIATE',
      associateType: 'PDG',
      isActive: true,
    },
    select: {
      firstName: true,
      lastName: true,
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createDossier(userId: string, data: CreateDossierInput) {
  const disbursementLines = (data.disbursementLines ?? []).map((line) => ({
    reason: line.reason.trim(),
    amount: Number(line.amount.toFixed(2)),
  }));
  const disbursementTotal = disbursementLines.reduce((sum, line) => sum + line.amount, 0);

  return prisma.dossier.create({
    data: {
      title: data.title,
      description: data.description,
      disbursementLines: disbursementLines as Prisma.InputJsonValue,
      disbursementTotal: new Prisma.Decimal(disbursementTotal.toFixed(2)),
      disbursementMethod: data.disbursementMethod,
      authorId: userId,
    }
  });
}

export async function addDossierDocument(dossierId: string, name: string, url: string) {
  return prisma.dossierDocument.create({
    data: { dossierId, name, url }
  });
}

export async function createDossierDecision(dossierId: string, authorId: string, data: CreateDossierDecisionInput) {
  const dossier = await prisma.dossier.findUnique({ where: { id: dossierId } });
  if (!dossier) throw createError('Dossier introuvable', 404);
  if (dossier.status === 'COMPLETED') throw createError('Ce dossier est déjà validé', 400);

  const user = await prisma.user.findUnique({
    where: { id: authorId },
    select: { role: true, associateType: true },
  });

  if (!user || (user.role !== 'ASSOCIATE' && user.role !== 'ADMIN')) {
    throw createError('Accès réservé aux associés', 403);
  }

  if (user.associateType === 'OBSERVER') {
    throw createError('Les observateurs peuvent consulter et commenter, mais ne peuvent pas décider', 403);
  }

  return prisma.dossierDecision.create({
    data: {
      dossierId,
      authorId,
      action: data.action,
      note: data.note || null,
    },
    include: {
      author: { select: { id: true, firstName: true, lastName: true, associateType: true, avatarUrl: true } },
    },
  });
}

export async function getDossierComments(dossierId: string) {
  return prisma.dossierComment.findMany({
    where: { dossierId },
    include: {
      author: { select: { firstName: true, lastName: true, associateType: true, avatarUrl: true } }
    },
    orderBy: { createdAt: 'asc' }
  });
}

export async function createDossierComment(dossierId: string, authorId: string, content: string) {
  return prisma.dossierComment.create({
    data: { dossierId, authorId, content },
    include: {
      author: { select: { firstName: true, lastName: true, associateType: true, avatarUrl: true } }
    }
  });
}


export async function updateDossierStatus(id: string, status: string) {
  if (status === 'COMPLETED') {
    const dossier = await prisma.dossier.findUnique({
      where: { id },
      include: {
        votes: {
          select: {
            id: true,
            _count: { select: { ballots: true } },
          },
        },
        decisions: {
          select: { authorId: true, action: true, createdAt: true },
        },
      },
    });

    if (!dossier) throw createError('Dossier introuvable', 404);

    const latestDecisions = getLatestDecisionByAuthor(dossier.decisions);
    const hasApproval = latestDecisions.some((decision) => decision.action === 'APPROVE');
    const hasBlockingDecision = latestDecisions.some((decision) =>
      ['REJECT', 'REQUEST_CHANGES'].includes(decision.action)
    );

    if (!hasApproval) {
      throw createError('Le dossier doit recevoir au moins une approbation associée avant validation finale', 400);
    }

    if (hasBlockingDecision) {
      throw createError('Le dossier contient encore un refus ou une demande de correction active', 400);
    }

    if (dossier.votes.length > 0) {
      const hasReachedVoteQuorum = dossier.votes.some((vote) => vote._count.ballots >= DOSSIER_VOTE_QUORUM);

      if (!hasReachedVoteQuorum) {
        throw createError(`Au moins ${DOSSIER_VOTE_QUORUM} votes sont requis lorsqu’une session de vote est liée au dossier`, 400);
      }
    }
  }

  return prisma.dossier.update({
    where: { id },
    data: { status }
  });
}

// ================================
// VOTES
// ================================

export async function getAllVotes() {
  return prisma.vote.findMany({
    include: {
      dossier: { select: { title: true } },
      _count: { select: { ballots: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
}

export async function getVoteById(id: string) {
  const vote = await prisma.vote.findUnique({
    where: { id },
    include: {
      dossier: true,
      ballots: {
        include: {
          user: { select: { firstName: true, lastName: true, associateType: true } }
        }
      }
    }
  });

  if (!vote) throw createError('Vote introuvable', 404);
  return vote;
}

export async function createVote(data: CreateVoteInput) {
  return prisma.vote.create({
    data: {
      title: data.title,
      description: data.description,
      dossierId: data.dossierId,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    }
  });
}

export async function submitBallot(voteId: string, userId: string, data: SubmitBallotInput) {
  const vote = await prisma.vote.findUnique({ where: { id: voteId } });
  if (!vote) throw createError('Session de vote introuvable', 404);
  if (!vote.isActive) throw createError('Cette session de vote est clôturée', 400);
  if (vote.expiresAt && new Date() > vote.expiresAt) throw createError('Cette session de vote a expiré', 400);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, associateType: true },
  });

  if (!user || (user.associateType !== 'PDG' && user.associateType !== 'VOTING' && user.role !== 'ADMIN')) {
    throw createError('Vous n’êtes pas habilité à voter', 403);
  }

  return prisma.ballot.upsert({
    where: {
      voteId_userId: { voteId, userId }
    },
    update: { choice: data.choice },
    create: {
      voteId,
      userId,
      choice: data.choice
    }
  });
}

// ================================
// CHAT
// ================================

export async function getMessages(limit = 50) {
  return prisma.internalMessage.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      sender: {
        select: { firstName: true, lastName: true, associateType: true, avatarUrl: true }
      }
    }
  });
}

export async function createMessage(senderId: string, data: CreateMessageInput) {
  return prisma.internalMessage.create({
    data: {
      content: data.content,
      senderId
    },
    include: {
      sender: {
        select: { firstName: true, lastName: true, associateType: true, avatarUrl: true }
      }
    }
  });
}
