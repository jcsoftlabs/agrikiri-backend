import { z } from 'zod';

export const deliveryNoteStatusEnum = z.enum(['PREPARED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']);

export const createDeliveryNoteItemSchema = z.object({
  orderItemId: z.string().uuid('Ligne de commande invalide').optional(),
  posSaleItemId: z.string().uuid('Ligne POS invalide').optional(),
  deliveredQuantity: z.coerce.number().int('Quantité invalide').positive('La quantité doit être supérieure à 0'),
});

export const createDeliveryNoteSchema = z.object({
  deliveryAgentId: z.string().uuid('Livreur invalide').optional().nullable(),
  customerName: z.string().trim().min(1, 'Le nom du client est requis').max(160).optional(),
  customerPhone: z.string().trim().max(80).optional().nullable(),
  customerAddress: z.string().trim().max(400).optional().nullable(),
  notes: z.string().trim().max(1000, 'Notes trop longues').optional().nullable(),
  status: deliveryNoteStatusEnum.optional().default('PREPARED'),
  items: z.array(createDeliveryNoteItemSchema).min(1, 'Ajoutez au moins une ligne à livrer').max(200),
});

export const updateDeliveryNoteStatusSchema = z.object({
  status: deliveryNoteStatusEnum,
  notes: z.string().trim().max(1000, 'Notes trop longues').optional().nullable(),
  receiverName: z.string().trim().max(160, 'Le nom du receveur est trop long').optional().nullable(),
  receiverSignatureUrl: z.string().trim().url('Signature invalide').optional().nullable(),
  receiverSignaturePublicId: z.string().trim().max(255).optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.status === 'DELIVERED') {
    if (!data.receiverName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['receiverName'],
        message: 'Le nom du receveur est requis pour marquer le bon comme livré.',
      });
    }

    if (!data.receiverSignatureUrl || !data.receiverSignaturePublicId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['receiverSignatureUrl'],
        message: 'La signature du receveur est requise pour marquer le bon comme livré.',
      });
    }
  }
});

export type CreateDeliveryNoteInput = z.infer<typeof createDeliveryNoteSchema>;
export type UpdateDeliveryNoteStatusInput = z.infer<typeof updateDeliveryNoteStatusSchema>;
