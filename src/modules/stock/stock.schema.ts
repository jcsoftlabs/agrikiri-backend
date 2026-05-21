import { z } from 'zod';

const stockLineSchema = z.object({
  productId: z.string().uuid('Produit invalide'),
  productVariantId: z.string().uuid('Variante invalide').optional(),
  quantity: z.coerce.number().int().positive('La quantité doit être supérieure à 0').max(1000000),
});

export const createBuyerStockShipmentSchema = z.object({
  title: z.string().trim().min(3, 'Le titre est requis').max(120, 'Le titre est trop long'),
  notes: z.string().trim().max(1200, 'La note est trop longue').optional(),
  items: z.array(stockLineSchema).min(1, 'Ajoutez au moins une ligne').max(100),
});

export const updateStockQuantitySchema = z.object({
  productId: z.string().uuid('Produit invalide'),
  productVariantId: z.string().uuid('Variante invalide').optional(),
  stockQuantity: z.coerce.number().int().min(0, 'Le stock ne peut pas être négatif').max(100000000),
});

export const assignOrderDeliverySchema = z.object({
  deliveryAgentId: z.string().uuid('Livreur invalide'),
  deliveryZone: z.string().trim().max(120, 'Zone trop longue').optional(),
  estimatedDeliveryDate: z.string().datetime('Date de livraison estimée invalide').optional(),
});

export const createStockManagerReportSchema = z.object({
  title: z.string().trim().min(3, 'Le titre est requis').max(120, 'Le titre est trop long'),
  reportDate: z.string().datetime('Date invalide'),
  summary: z.string().trim().max(1500, 'Le résumé est trop long').optional(),
  buyerShipmentIds: z.array(z.string().uuid('Expédition invalide')).max(100).default([]),
  stockOutputItems: z.array(stockLineSchema).max(100).default([]),
  productionInputItems: z.array(stockLineSchema).max(100).default([]),
  productionOrderOutputItems: z.array(stockLineSchema).max(100).default([]),
});

export type CreateBuyerStockShipmentInput = z.infer<typeof createBuyerStockShipmentSchema>;
export type UpdateStockQuantityInput = z.infer<typeof updateStockQuantitySchema>;
export type AssignOrderDeliveryInput = z.infer<typeof assignOrderDeliverySchema>;
export type CreateStockManagerReportInput = z.infer<typeof createStockManagerReportSchema>;
