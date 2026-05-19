import { z } from 'zod';

export const createDeliveryReportSchema = z.object({
  title: z.string().trim().min(3, 'Le titre est requis').max(120, 'Le titre est trop long'),
  shiftDate: z.string().datetime('Date invalide'),
  summary: z.string().trim().min(20, 'Le résumé est trop court').max(2000, 'Le résumé est trop long'),
  totalAssigned: z.coerce.number().int().min(0).max(500),
  deliveredCount: z.coerce.number().int().min(0).max(500),
  failedCount: z.coerce.number().int().min(0).max(500),
  cashCollected: z.coerce.number().min(0, 'Le montant cash doit être positif').max(100000000),
  fieldExpenses: z.coerce.number().min(0, 'Les frais doivent être positifs').max(100000000),
  incidents: z.string().trim().max(1200, 'La section incidents est trop longue').optional(),
  nextActions: z.string().trim().max(1200, 'La section prochaines actions est trop longue').optional(),
});

export type CreateDeliveryReportInput = z.infer<typeof createDeliveryReportSchema>;
