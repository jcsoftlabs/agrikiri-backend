import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { createError } from '../../middleware/error.middleware';
import { generateReferralCode } from '../../utils/mlm-calculator';

const SALT_ROUNDS = 12;

const userRoleSchema = z.enum(['CUSTOMER', 'AYIZAN', 'ADMIN']);

export const createAdminUserSchema = z.object({
  firstName: z.string().min(2, 'Le prénom est trop court'),
  lastName: z.string().min(2, 'Le nom est trop court'),
  email: z.string().email('Email invalide'),
  phone: z
    .string()
    .regex(/^(\+509)?[2-9]\d{7}$/, 'Numéro de téléphone haïtien invalide (ex: 36123456)'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
  role: userRoleSchema.default('CUSTOMER'),
  isActive: z.boolean().optional().default(true),
});

export const updateAdminUserSchema = z.object({
  firstName: z.string().min(2, 'Le prénom est trop court').optional(),
  lastName: z.string().min(2, 'Le nom est trop court').optional(),
  email: z.string().email('Email invalide').optional(),
  phone: z
    .string()
    .regex(/^(\+509)?[2-9]\d{7}$/, 'Numéro de téléphone haïtien invalide (ex: 36123456)')
    .optional(),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères').optional(),
  role: userRoleSchema.optional(),
  isActive: z.boolean().optional(),
});

async function ensureUniqueUserFields(email?: string, phone?: string, excludeId?: string) {
  if (email) {
    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail && existingEmail.id !== excludeId) {
      throw createError('Cet email est déjà utilisé', 409);
    }
  }

  if (phone) {
    const existingPhone = await prisma.user.findUnique({ where: { phone } });
    if (existingPhone && existingPhone.id !== excludeId) {
      throw createError('Ce numéro de téléphone est déjà utilisé', 409);
    }
  }
}

async function generateUniqueReferralCode() {
  let referralCode = generateReferralCode();

  while (await prisma.user.findUnique({ where: { referralCode } })) {
    referralCode = generateReferralCode();
  }

  return referralCode;
}

const adminUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  role: true,
  mlmLevel: true,
  personalVolume: true,
  isActive: true,
  referralCode: true,
  createdAt: true,
} as const;

export async function getDashboardStats() {
  const [
    totalUsers,
    totalAyizan,
    totalOrders,
    totalSales,
    newUsersMonth,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'AYIZAN' } }),
    prisma.order.count(),
    prisma.order.aggregate({
      where: { paymentStatus: 'PAID' },
      _sum: { totalAmount: true },
    }),
    prisma.user.count({
      where: {
        createdAt: { gte: new Date(new Date().setDate(new Date().getDate() - 30)) },
      },
    }),
  ]);

  // Commandes récentes
  const recentOrders = await prisma.order.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      customer: { select: { firstName: true, lastName: true } },
    },
  });

  // Top produits (basé sur la quantité vendue)
  const topProductsRaw = await prisma.orderItem.groupBy({
    by: ['productId'],
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 5,
  });

  const topProducts = await Promise.all(
    topProductsRaw.map(async (tp: { productId: string; _sum: { quantity: number | null } }) => {
      const product = await prisma.product.findUnique({
        where: { id: tp.productId },
        select: { name: true },
      });
      return {
        name: product?.name || 'Inconnu',
        ventes: tp._sum.quantity || 0,
      };
    })
  );

  // Évolution ventes (4 dernières semaines)
  // Note: Simplifié pour l'instant, on pourrait faire un group by plus complexe
  const salesHistory = [
    { week: 'S1', ventes: 450000 },
    { week: 'S2', ventes: 620000 },
    { week: 'S3', ventes: 540000 },
    { week: 'S4', ventes: Number(totalSales._sum.totalAmount || 0) / 4 }, // Mock progressif pour l'instant
  ];

  return {
    stats: {
      totalUsers,
      totalAyizan,
      totalOrders,
      totalSales: Number(totalSales._sum.totalAmount || 0),
      newUsersMonth,
    },
    recentOrders: recentOrders.map((o) => ({
      number: `AGRO-${o.id.slice(0, 5).toUpperCase()}`,
      customer: `${o.customer.firstName} ${o.customer.lastName}`,
      amount: `${o.totalAmount.toLocaleString()} HTG`,
      status: o.status,
      date: o.createdAt.toLocaleDateString('fr-HT', { day: 'numeric', month: 'short' }),
    })),
    topProducts,
    salesHistory,
  };
}

export async function getUsersList(page: number = 1, limit: number = 20, search?: string) {
  const skip = (page - 1) * limit;

  const where = search ? {
    OR: [
      { firstName: { contains: search, mode: 'insensitive' as const } },
      { lastName: { contains: search, mode: 'insensitive' as const } },
      { email: { contains: search, mode: 'insensitive' as const } },
      { phone: { contains: search, mode: 'insensitive' as const } },
      { referralCode: { contains: search, mode: 'insensitive' as const } },
    ],
  } : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: adminUserSelect,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function createUser(data: z.infer<typeof createAdminUserSchema>) {
  await ensureUniqueUserFields(data.email, data.phone);

  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
  const referralCode = data.role === 'AYIZAN' ? await generateUniqueReferralCode() : null;

  return prisma.user.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      passwordHash,
      role: data.role,
      isActive: data.isActive,
      referralCode,
      ...(data.role === 'AYIZAN' ? { mlmLevel: 'AYIZAN' } : {}),
    },
    select: adminUserSelect,
  });
}

export async function updateUser(
  userId: string,
  data: z.infer<typeof updateAdminUserSchema>,
  currentAdminId: string
) {
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      email: true,
      phone: true,
      referralCode: true,
      isActive: true,
    },
  });

  if (!existingUser) {
    throw createError('Utilisateur introuvable', 404);
  }

  if (existingUser.id === currentAdminId) {
    if (data.isActive === false) {
      throw createError('Vous ne pouvez pas désactiver votre propre compte admin', 400);
    }

    if (data.role && data.role !== 'ADMIN') {
      throw createError('Vous ne pouvez pas retirer votre propre rôle administrateur', 400);
    }
  }

  await ensureUniqueUserFields(data.email, data.phone, userId);

  const updateData: Record<string, unknown> = {
    ...data,
  };

  if (data.password) {
    updateData.passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
    delete updateData.password;
  }

  if (data.role === 'AYIZAN' && !existingUser.referralCode) {
    updateData.referralCode = await generateUniqueReferralCode();
    updateData.mlmLevel = 'AYIZAN';
  }

  if (data.role && data.role !== 'AYIZAN') {
    updateData.referralCode = null;
  }

  return prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: adminUserSelect,
  });
}

export async function deleteUser(userId: string, currentAdminId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true },
  });

  if (!user) {
    throw createError('Utilisateur introuvable', 404);
  }

  if (user.id === currentAdminId) {
    throw createError('Vous ne pouvez pas supprimer votre propre compte admin', 400);
  }

  return prisma.user.update({
    where: { id: userId },
    data: { isActive: false },
    select: adminUserSelect,
  });
}
