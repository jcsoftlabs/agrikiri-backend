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

export const createDeliveryReportSchema = z
  .object({
    title: z.string().trim().min(3, 'Le titre est requis').max(120, 'Le titre est trop long'),
    shiftDate: z.string().datetime('Date invalide'),
    summary: z.string().trim().min(20, 'Le résumé est trop court').max(2000, 'Le résumé est trop long'),
    totalAssigned: z.coerce.number().int().min(0).max(500),
    deliveredCount: z.coerce.number().int().min(0).max(500),
    failedCount: z.coerce.number().int().min(0).max(500),
    cashCollected: z.coerce.number().min(0, 'Le montant cash doit être positif').max(100000000),
    cashCollectionMethod: accountingChannelEnum.default('CASH'),
    fieldExpenses: z.coerce.number().min(0, 'Les frais doivent être positifs').max(100000000),
    fieldExpensesMethod: accountingChannelEnum.default('CASH'),
    incidents: z.string().trim().max(1200, 'La section incidents est trop longue').optional(),
    nextActions: z.string().trim().max(1200, 'La section prochaines actions est trop longue').optional(),
  })
  .superRefine((data, ctx) => {
    if (data.cashCollected > 0 && !data.cashCollectionMethod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cashCollectionMethod'],
        message: 'Choisis le moyen de collecte pour ce montant encaissé.',
      });
    }

    if (data.fieldExpenses > 0 && !data.fieldExpensesMethod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fieldExpensesMethod'],
        message: 'Choisis le moyen utilisé pour ces frais terrain.',
      });
    }
  });

export type CreateDeliveryReportInput = z.infer<typeof createDeliveryReportSchema>;
