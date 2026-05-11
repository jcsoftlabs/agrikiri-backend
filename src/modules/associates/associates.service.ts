import { prisma } from '../../config/database';
import { CreateDossierInput, CreateVoteInput, SubmitBallotInput, CreateMessageInput } from './associates.schema';
import { createError } from '../../middleware/error.middleware';

// ================================
// DOSSIERS
// ================================

export async function getAllDossiers() {
  return prisma.dossier.findMany({
    include: {
      author: {
        select: { firstName: true, lastName: true }
      },
      _count: {
        select: { documents: true, votes: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
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
      }
    }
  });

  if (!dossier) throw createError('Dossier introuvable', 404);
  return dossier;
}

export async function createDossier(userId: string, data: CreateDossierInput) {
  return prisma.dossier.create({
    data: {
      ...data,
      authorId: userId,
    }
  });
}

export async function addDossierDocument(dossierId: string, name: string, url: string) {
  return prisma.dossierDocument.create({
    data: { dossierId, name, url }
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
