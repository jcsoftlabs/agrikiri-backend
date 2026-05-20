import { z } from 'zod';

export const validateOutflowSchema = z.object({
  type: z.enum(['BUYER_ALLOCATION', 'BUYER_REPORT', 'DELIVERY_REPORT']),
  id: z.string().uuid('Identifiant invalide'),
});

export const closeAccountingPeriodSchema = z.object({
  range: z.enum(['7d', '30d', '90d', 'custom']).default('30d'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  note: z.string().trim().max(500, 'La note de clôture est trop longue').optional(),
});

export type ValidateOutflowInput = z.infer<typeof validateOutflowSchema>;
export type CloseAccountingPeriodInput = z.infer<typeof closeAccountingPeriodSchema>;
