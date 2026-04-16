import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Email invalide'),
  phone: z
    .string()
    .regex(/^(\+509)?[2-9]\d{7}$/, 'Numéro de téléphone haïtien invalide (ex: 36123456)'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
  firstName: z.string().min(2, 'Le prénom est trop court'),
  lastName: z.string().min(2, 'Le nom est trop court'),
  referralCode: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token requis'),
});

export const customerAddressSchema = z.object({
  label: z.string().trim().max(60).optional().or(z.literal('')),
  countryCode: z.enum(['HT', 'US']),
  fullName: z.string().trim().min(2, 'Nom requis').max(120),
  phoneCountryCode: z.enum(['+509', '+1']),
  phoneNumber: z.string().trim().min(6, 'Téléphone requis').max(20),
  addressLine1: z.string().trim().min(5, 'Adresse requise').max(160),
  addressLine2: z.string().trim().max(160).optional().or(z.literal('')),
  city: z.string().trim().min(2, 'Ville requise').max(100),
  stateRegion: z.string().trim().min(2, 'Département ou État requis').max(100),
  postalCode: z.string().trim().max(20).optional().or(z.literal('')),
  deliveryInstructions: z.string().trim().max(300).optional().or(z.literal('')),
  isDefault: z.boolean().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CustomerAddressInput = z.infer<typeof customerAddressSchema>;
