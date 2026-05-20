import { z } from 'zod';

const posDocumentTypeEnum = z.enum(['RECEIPT', 'INVOICE', 'PROFORMA']);
const paymentMethodEnum = z.enum(['PLOPPLOP', 'MONCASH', 'CASH', 'NATCASH', 'KASHPAW']);
const customerTypeEnum = z.enum(['WALK_IN', 'INDIVIDUAL', 'BUSINESS']);

export const posSaleItemSchema = z.object({
  productId: z.string().uuid('Produit invalide'),
  productVariantId: z.string().uuid('Variante invalide').optional().nullable(),
  description: z.string().trim().min(1, 'Description requise').max(180, 'Description trop longue').optional(),
  quantity: z.number().int().positive('Quantité invalide'),
});

export const createPosSaleSchema = z.object({
  documentType: posDocumentTypeEnum,
  customerType: customerTypeEnum.default('WALK_IN'),
  customerName: z.string().trim().min(1, 'Le nom du client est requis').max(120, 'Nom trop long'),
  companyName: z.string().trim().max(160, 'Nom d’entreprise trop long').optional().nullable(),
  taxId: z.string().trim().max(80, 'Identifiant fiscal trop long').optional().nullable(),
  customerPhone: z.string().trim().max(40, 'Téléphone trop long').optional().nullable(),
  customerEmail: z.string().trim().email('Email invalide').max(120, 'Email trop long').optional().nullable().or(z.literal('')),
  customerAddress: z.string().trim().max(240, 'Adresse trop longue').optional().nullable(),
  deliveryRequested: z.boolean().optional().default(false),
  paymentMethod: paymentMethodEnum.optional().nullable(),
  discountAmount: z.number().min(0, 'Remise invalide').max(100000000, 'Remise trop élevée').default(0),
  notes: z.string().trim().max(500, 'Notes trop longues').optional().nullable(),
  items: z.array(posSaleItemSchema).min(1, 'Ajoutez au moins un article'),
});

export const posDocumentQuerySchema = z.object({
  type: posDocumentTypeEnum.optional(),
});
