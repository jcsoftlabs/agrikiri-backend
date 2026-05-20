import { z } from 'zod';

const accountingChannelEnum = z.enum([
  'CASH',
  'MONCASH',
  'NATCASH',
  'PLOPPLOP',
  'CHEQUE',
  'VIREMENT_BANCAIRE',
  'KASHPAW',
  'AUTRE',
]);

const disbursementLineSchema = z.object({
  reason: z.string().trim().min(1, 'Le motif est requis').max(160),
  amount: z.coerce.number().positive('Le montant doit etre superieur a 0').max(100000000),
});

export const createDossierSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().min(10),
  disbursementLines: z.array(disbursementLineSchema).max(100).optional().default([]),
  disbursementMethod: accountingChannelEnum.default('CASH'),
});

export const updateDossierStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED']),
});

export const createDossierDecisionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'REQUEST_CHANGES']),
  note: z.string().trim().max(800).optional(),
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
  content: z
    .string()
    .trim()
    .min(1, 'Le message ne peut pas etre vide.')
    .max(3000, 'Le message ne peut pas depasser 3000 caracteres.'),
});

export type CreateDossierInput = z.infer<typeof createDossierSchema>;
export type UpdateDossierStatusInput = z.infer<typeof updateDossierStatusSchema>;
export type CreateDossierDecisionInput = z.infer<typeof createDossierDecisionSchema>;
export type CreateVoteInput = z.infer<typeof createVoteSchema>;
export type SubmitBallotInput = z.infer<typeof submitBallotSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
