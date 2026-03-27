import { prisma } from '../../config/database';
import { createError } from '../../middleware/error.middleware';
import { getCommissionSummary } from '../../utils/commission-engine';

// ================================
// GET MY COMMISSIONS
// ================================

export async function getMyCommissions(
  userId: string,
  filters: { month?: number; year?: number; type?: string; status?: string; page?: number; limit?: number }
) {
  const { month, year, type, status, page = 1, limit = 20 } = filters;
  const skip = (page - 1) * limit;

  const where: any = { ayizanId: userId };
  if (month) where.month = month;
  if (year) where.year = year;
  if (type) where.type = type;
  if (status) where.status = status;

  const [commissions, total] = await Promise.all([
    prisma.commission.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        order: { select: { orderNumber: true, totalAmount: true } },
        sourceUser: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.commission.count({ where }),
  ]);

  return {
    commissions,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

// ================================
// GET COMMISSION SUMMARY
// ================================

export async function getMyCommissionSummary(userId: string, month?: number, year?: number) {
  return getCommissionSummary(userId, month, year);
}

// ================================
// VALIDATE COMMISSIONS (Admin)
// ================================

export async function validateCommissions(month: number, year: number) {
  await prisma.commission.updateMany({
    where: { month, year, status: 'PENDING' },
    data: { status: 'VALIDATED' },
  });

  const count = await prisma.commission.count({
    where: { month, year, status: 'VALIDATED' },
  });

  return {
    message: `${count} commission(s) validée(s) pour ${month}/${year}`,
    count,
  };
}

// ================================
// PAY COMMISSIONS (Admin)
// ================================

export async function payCommissions(month: number, year: number) {
  await prisma.commission.updateMany({
    where: { month, year, status: 'VALIDATED' },
    data: { status: 'PAID' },
  });

  // Notifier les AYIZAN
  const validatedCommissions = await prisma.commission.findMany({
    where: { month, year, status: 'PAID' },
    distinct: ['ayizanId'],
    select: { ayizanId: true, amount: true },
  });

  for (const commission of validatedCommissions) {
    await prisma.notification.create({
      data: {
        userId: commission.ayizanId,
        type: 'COMMISSION_PAID',
        title: '💰 Commissions payées',
        message: `Vos commissions pour ${month}/${year} ont été payées.`,
      },
    });
  }

  return { message: `Commissions payées pour ${month}/${year}` };
}

// ================================
// EXPORT COMMISSIONS CSV (Admin)
// ================================

export async function exportCommissionsCsv(month: number, year: number): Promise<string> {
  const commissions = await prisma.commission.findMany({
    where: { month, year },
    include: {
      ayizan: { select: { firstName: true, lastName: true, email: true, phone: true } },
      order: { select: { orderNumber: true } },
    },
    orderBy: { ayizanId: 'asc' },
  });

  const headers = [
    'Prénom',
    'Nom',
    'Email',
    'Téléphone',
    'Type',
    'Montant (HTG)',
    'Pourcentage',
    'Niveau MLM',
    'Commande',
    'Statut',
    'Date',
  ];

  const rows = commissions.map((c) => [
    c.ayizan.firstName,
    c.ayizan.lastName,
    c.ayizan.email,
    c.ayizan.phone,
    c.type,
    Number(c.amount).toFixed(2),
    Number(c.percentage).toFixed(2),
    c.mlmLevel,
    c.order?.orderNumber || 'N/A',
    c.status,
    new Date(c.createdAt).toLocaleDateString('fr-HT'),
  ]);

  const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n');
  return csvContent;
}

// ================================
// GET ALL COMMISSIONS (Admin)
// ================================

export async function getAllCommissions(filters: {
  month?: number;
  year?: number;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const { month, year, status, page = 1, limit = 50 } = filters;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (month) where.month = month;
  if (year) where.year = year;
  if (status) where.status = status;

  const [commissions, total] = await Promise.all([
    prisma.commission.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        ayizan: { select: { firstName: true, lastName: true, mlmLevel: true } },
        order: { select: { orderNumber: true } },
      },
    }),
    prisma.commission.count({ where }),
  ]);

  return { commissions, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}
