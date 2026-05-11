import { z } from 'zod';

export const createDossierSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().min(10),
});

export const updateDossierStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED']),
});

export const createVoteSchema = z.object({
  dossierId: z.string().uuid().optional(),
  title: z.string().min(3).max(100),
  description: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

export const submitBallotSchema = z.object({
  choice: z.enum(['FOR', 'AGAINST', 'ABSTAIN']),
});

export const createMessageSchema = z.object({
  content: z.string().min(1).max(1000),
});

export type CreateDossierInput = z.infer<typeof createDossierSchema>;
export type UpdateDossierStatusInput = z.infer<typeof updateDossierStatusSchema>;
export type CreateVoteInput = z.infer<typeof createVoteSchema>;
export type SubmitBallotInput = z.infer<typeof submitBallotSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
