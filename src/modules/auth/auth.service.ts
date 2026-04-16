import bcrypt from 'bcryptjs';
import { prisma } from '../../config/database';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../config/jwt';
import { RegisterInput, LoginInput, CustomerAddressInput } from './auth.schema';
import { generateReferralCode } from '../../utils/mlm-calculator';
import { createError } from '../../middleware/error.middleware';
import { sendAyizanWelcomeEmail } from '../../services/email.service';

const SALT_ROUNDS = 12;
const MINIMUM_PURCHASE_HTG = 9500;

const customerAddressSelect = {
  id: true,
  label: true,
  countryCode: true,
  fullName: true,
  phoneCountryCode: true,
  phoneNumber: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  stateRegion: true,
  postalCode: true,
  deliveryInstructions: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} as const;

function resolveAddressLabel(rawLabel: string | undefined, fallback: string) {
  const trimmed = rawLabel?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

// ================================
// REGISTER
// ================================

export async function registerUser(data: RegisterInput) {
  const { email, phone, password, firstName, lastName, referralCode } = data;

  // Vérifier unicité email
  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) throw createError('Cet email est déjà utilisé', 409);

  // Vérifier unicité téléphone
  const existingPhone = await prisma.user.findUnique({ where: { phone } });
  if (existingPhone) throw createError('Ce numéro de téléphone est déjà utilisé', 409);

  // Trouver le sponsor si referralCode fourni
  let sponsorId: string | undefined;
  if (referralCode) {
    const sponsor = await prisma.user.findUnique({ where: { referralCode } });
    if (!sponsor) throw createError('Code de parrainage invalide', 400);
    sponsorId = sponsor.id;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email,
      phone,
      passwordHash,
      firstName,
      lastName,
      sponsorId,
      role: 'CUSTOMER',
      mlmLevel: 'AYIZAN',
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      mlmLevel: true,
      referralCode: true,
      createdAt: true,
    },
  });

  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    mlmLevel: user.mlmLevel,
  });

  const refreshToken = generateRefreshToken({ userId: user.id });

  return { user, accessToken, refreshToken };
}

// ================================
// LOGIN
// ================================

export async function loginUser(data: LoginInput) {
  const { email, password } = data;

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      firstName: true,
      lastName: true,
      role: true,
      mlmLevel: true,
      avatarUrl: true,
      referralCode: true,
      isActive: true,
    },
  });

  if (!user) throw createError('Email ou mot de passe incorrect', 401);
  if (!user.isActive) throw createError('Votre compte a été désactivé. Contactez le support.', 403);

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) throw createError('Email ou mot de passe incorrect', 401);

  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    mlmLevel: user.mlmLevel,
  });

  const refreshToken = generateRefreshToken({ userId: user.id });

  const { passwordHash: _, ...userWithoutPassword } = user;

  return { user: userWithoutPassword, accessToken, refreshToken };
}

// ================================
// REFRESH TOKEN
// ================================

export async function refreshAccessToken(refreshToken: string) {
  let decoded: { userId: string };

  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw createError('Refresh token invalide ou expiré', 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { id: true, email: true, role: true, mlmLevel: true, isActive: true },
  });

  if (!user || !user.isActive) throw createError('Utilisateur introuvable ou désactivé', 401);

  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    mlmLevel: user.mlmLevel,
  });

  return { accessToken };
}

async function ensureSingleDefaultAddress(userId: string, keepAddressId?: string) {
  await prisma.customerAddress.updateMany({
    where: {
      userId,
      isDefault: true,
      ...(keepAddressId ? { id: { not: keepAddressId } } : {}),
    },
    data: { isDefault: false },
  });
}

export async function getMyAddresses(userId: string) {
  return prisma.customerAddress.findMany({
    where: { userId },
    orderBy: [
      { isDefault: 'desc' },
      { updatedAt: 'desc' },
    ],
    select: customerAddressSelect,
  });
}

export async function createAddress(userId: string, data: CustomerAddressInput) {
  const existingCount = await prisma.customerAddress.count({ where: { userId } });
  const shouldBeDefault = data.isDefault ?? existingCount === 0;
  const label = resolveAddressLabel(
    data.label,
    existingCount === 0 ? 'Adresse principale' : `Adresse ${existingCount + 1}`
  );

  if (shouldBeDefault) {
    await ensureSingleDefaultAddress(userId);
  }

  return prisma.customerAddress.create({
    data: {
      userId,
      ...data,
      label,
      addressLine2: data.addressLine2 || null,
      postalCode: data.postalCode || null,
      deliveryInstructions: data.deliveryInstructions || null,
      isDefault: shouldBeDefault,
    },
    select: customerAddressSelect,
  });
}

export async function updateAddress(userId: string, addressId: string, data: CustomerAddressInput) {
  const existing = await prisma.customerAddress.findFirst({
    where: { id: addressId, userId },
    select: { id: true, userId: true, label: true },
  });

  if (!existing) {
    throw createError('Adresse introuvable', 404);
  }

  if (data.isDefault) {
    await ensureSingleDefaultAddress(userId, addressId);
  }

  return prisma.customerAddress.update({
    where: { id: addressId },
    data: {
      ...data,
      label: resolveAddressLabel(data.label, existing.label || 'Adresse'),
      addressLine2: data.addressLine2 || null,
      postalCode: data.postalCode || null,
      deliveryInstructions: data.deliveryInstructions || null,
      isDefault: data.isDefault ?? false,
    },
    select: customerAddressSelect,
  });
}

export async function setDefaultAddress(userId: string, addressId: string) {
  const existing = await prisma.customerAddress.findFirst({
    where: { id: addressId, userId },
    select: { id: true },
  });

  if (!existing) {
    throw createError('Adresse introuvable', 404);
  }

  await ensureSingleDefaultAddress(userId, addressId);

  return prisma.customerAddress.update({
    where: { id: addressId },
    data: { isDefault: true },
    select: customerAddressSelect,
  });
}

export async function deleteAddress(userId: string, addressId: string) {
  const existing = await prisma.customerAddress.findFirst({
    where: { id: addressId, userId },
    select: { id: true, isDefault: true },
  });

  if (!existing) {
    throw createError('Adresse introuvable', 404);
  }

  await prisma.customerAddress.delete({ where: { id: addressId } });

  if (existing.isDefault) {
    const fallback = await prisma.customerAddress.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });

    if (fallback) {
      await prisma.customerAddress.update({
        where: { id: fallback.id },
        data: { isDefault: true },
      });
    }
  }

  return { success: true };
}

// ================================
// BECOME AYIZAN
// ================================

export async function becomeAyizan(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, referralCode: true, email: true, firstName: true },
  });

  if (!user) throw createError('Utilisateur introuvable', 404);
  if (user.role === 'AYIZAN') throw createError('Vous êtes déjà membre AYIZAN', 400);
  if (user.role === 'ADMIN') throw createError('Les administrateurs ne peuvent pas devenir AYIZAN', 400);

  // Vérifier le premier achat minimum requis pour devenir AYIZAN
  const totalPurchases = await prisma.order.aggregate({
    where: {
      customerId: userId,
      paymentStatus: 'PAID',
    },
    _sum: { totalAmount: true },
  });

  const totalAmount = Number(totalPurchases._sum.totalAmount || 0);

  if (totalAmount < MINIMUM_PURCHASE_HTG) {
    throw createError(
      `Vous devez avoir acheté au minimum ${MINIMUM_PURCHASE_HTG.toLocaleString()} HTG de produits pour devenir AYIZAN. Montant actuel : ${totalAmount.toLocaleString()} HTG`,
      400
    );
  }

  // Générer un referralCode unique
  let referralCode = generateReferralCode();
  let isUnique = false;

  while (!isUnique) {
    const existing = await prisma.user.findUnique({ where: { referralCode } });
    if (!existing) {
      isUnique = true;
    } else {
      referralCode = generateReferralCode();
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      role: 'AYIZAN',
      mlmLevel: 'AYIZAN',
      referralCode,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      mlmLevel: true,
      referralCode: true,
    },
  });

  // Notification de bienvenue
  await prisma.notification.create({
    data: {
      userId,
      type: 'AYIZAN_ACTIVATED',
      title: '🌱 Bienvenue dans le réseau AGRIKIRI !',
      message: `Vous êtes maintenant AYIZAN. Votre code de parrainage est : ${referralCode}. Commencez à vendre et à recruter !`,
    },
  });

  void sendAyizanWelcomeEmail({
    to: updatedUser.email,
    firstName: updatedUser.firstName,
    referralCode,
  });

  return updatedUser;
}
