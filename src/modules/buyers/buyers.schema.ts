import { z } from 'zod';

export const createBuyerAllocationSchema = z.object({
  buyerId: z.string().uuid('Acheteur invalide'),
  title: z.string().trim().min(3, 'Le libellé est requis').max(120, 'Le libellé est trop long'),
  description: z.string().trim().max(500, 'La note est trop longue').optional(),
  amountAllocated: z.coerce
    .number()
    .positive('Le montant alloué doit être supérieur à 0')
    .max(100000000, 'Le montant alloué est trop élevé'),
});

export const buyerExpenseLineSchema = z.object({
  description: z.string().trim().min(1, 'La description est requise').max(160, 'La description est trop longue'),
  quantity: z.coerce.number().positive('La quantité doit être supérieure à 0').max(1000000),
  unitPrice: z.coerce.number().min(0, 'Le prix unitaire doit être positif').max(100000000),
  fees: z.coerce.number().min(0, 'Les frais ne peuvent pas être négatifs').max(100000000).optional().default(0),
});

export const createBuyerExpenseReportSchema = z.object({
  summary: z.string().trim().max(1000, 'Le résumé est trop long').optional(),
  lines: z.array(buyerExpenseLineSchema).min(1, 'Ajoutez au moins une ligne').max(100),
});

export type CreateBuyerAllocationInput = z.infer<typeof createBuyerAllocationSchema>;
export type CreateBuyerExpenseReportInput = z.infer<typeof createBuyerExpenseReportSchema>;
