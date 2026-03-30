import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { createError } from '../../middleware/error.middleware';
import { generateReferralCode } from '../../utils/mlm-calculator';

const SALT_ROUNDS = 12;
const REPORT_RANGES = ['7d', '30d', '90d'] as const;

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

function normalizeDateInput(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getReportWindow(range: string, startDateParam?: string, endDateParam?: string) {
  const customStartDate = normalizeDateInput(startDateParam);
  const customEndDate = normalizeDateInput(endDateParam);

  if (customStartDate && customEndDate && customStartDate <= customEndDate) {
    const startDate = new Date(customStartDate);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(customEndDate);
    endDate.setHours(23, 59, 59, 999);

    const diffMs = endDate.getTime() - startDate.getTime();
    const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);

    return {
      normalizedRange: 'custom',
      days,
      startDate,
      endDate,
    };
  }

  const normalizedRange = REPORT_RANGES.includes(range as (typeof REPORT_RANGES)[number])
    ? (range as (typeof REPORT_RANGES)[number])
    : '30d';

  const days = normalizedRange === '7d' ? 7 : normalizedRange === '90d' ? 90 : 30;
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - (days - 1));

  return { normalizedRange, days, startDate, endDate };
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString('fr-HT', { day: 'numeric', month: 'short' });
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

type ReportFilters = {
  categoryId?: string;
  productId?: string;
  orderStatus?: string;
  paymentStatus?: string;
};

type LoadedReportData = Awaited<ReturnType<typeof getReportData>>;

function buildOverviewMetrics(reportData: LoadedReportData) {
  const { orders, commissions, usersCreated, ayizanCreated, paidOrdersCount } = reportData;

  let totalSales = 0;
  const totalOrders = orders.length;
  let deliveredOrders = 0;
  let pendingOrders = 0;
  let totalItemsSold = 0;
  let totalCommissions = 0;
  let paidCommissions = 0;
  let pendingCommissions = 0;

  for (const order of orders) {
    const orderAmount = toNumber(order.totalAmount);
    if (order.status === 'DELIVERED') deliveredOrders += 1;
    if (order.status === 'PENDING') pendingOrders += 1;
    if (order.paymentStatus === 'PAID') totalSales += orderAmount;

    for (const item of order.items) {
      totalItemsSold += item.quantity;
    }
  }

  for (const commission of commissions) {
    const amount = toNumber(commission.amount);
    totalCommissions += amount;
    if (commission.status === 'PAID') paidCommissions += amount;
    if (commission.status === 'PENDING') pendingCommissions += amount;
  }

  const averageBasket = paidOrdersCount > 0 ? totalSales / paidOrdersCount : 0;
  const conversionRate = totalOrders > 0 ? (deliveredOrders / totalOrders) * 100 : 0;

  return {
    totalSales,
    totalOrders,
    averageBasket,
    totalItemsSold,
    deliveredOrders,
    pendingOrders,
    newUsers: usersCreated,
    newAyizan: ayizanCreated,
    conversionRate,
    totalCommissions,
    paidCommissions,
    pendingCommissions,
  };
}

function computeDelta(currentValue: number, previousValue: number) {
  const diff = currentValue - previousValue;
  const percent = previousValue === 0
    ? (currentValue === 0 ? 0 : 100)
    : (diff / previousValue) * 100;

  return {
    current: currentValue,
    previous: previousValue,
    diff,
    percent,
    direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
  };
}

function buildAlerts(
  overview: ReturnType<typeof buildOverviewMetrics>,
  comparison: {
    totalSales: ReturnType<typeof computeDelta>;
    totalOrders: ReturnType<typeof computeDelta>;
    averageBasket: ReturnType<typeof computeDelta>;
    totalCommissions: ReturnType<typeof computeDelta>;
    newAyizan: ReturnType<typeof computeDelta>;
  }
) {
  const alerts: Array<{ level: 'info' | 'warning' | 'success'; title: string; message: string }> = [];

  if (comparison.totalSales.direction === 'down' && Math.abs(comparison.totalSales.percent) >= 15) {
    alerts.push({
      level: 'warning',
      title: 'Baisse des ventes',
      message: `Les ventes reculent de ${Math.abs(comparison.totalSales.percent).toFixed(1)}% par rapport à la période précédente.`,
    });
  }

  if (comparison.averageBasket.direction === 'down' && Math.abs(comparison.averageBasket.percent) >= 10) {
    alerts.push({
      level: 'warning',
      title: 'Panier moyen en recul',
      message: `Le panier moyen baisse de ${Math.abs(comparison.averageBasket.percent).toFixed(1)}%, ce qui peut signaler une pression sur les formats ou prix.`,
    });
  }

  if (comparison.newAyizan.direction === 'up' && comparison.newAyizan.current > 0) {
    alerts.push({
      level: 'success',
      title: 'Recrutement réseau en hausse',
      message: `${comparison.newAyizan.current} nouvel(aux) AYIZAN sur la période, avec une progression de ${comparison.newAyizan.percent.toFixed(1)}%.`,
    });
  }

  if (overview.pendingOrders >= Math.max(5, overview.deliveredOrders)) {
    alerts.push({
      level: 'info',
      title: 'Volume de commandes en attente élevé',
      message: `${overview.pendingOrders} commande(s) sont encore en attente. Une revue logistique peut être utile.`,
    });
  }

  if (comparison.totalCommissions.direction === 'up' && comparison.totalCommissions.current > 0) {
    alerts.push({
      level: 'success',
      title: 'Commissions réseau dynamiques',
      message: `Les commissions progressent de ${comparison.totalCommissions.percent.toFixed(1)}% sur la période.`,
    });
  }

  return alerts.slice(0, 4);
}

async function getReportData(
  range: string = '30d',
  startDateParam?: string,
  endDateParam?: string,
  filters: ReportFilters = {}
) {
  const { normalizedRange, days, startDate, endDate } = getReportWindow(range, startDateParam, endDateParam);
  const { categoryId, productId, orderStatus, paymentStatus } = filters;

  const orderWhere: any = {
    createdAt: { gte: startDate, lte: endDate },
  };

  if (orderStatus) orderWhere.status = orderStatus;
  if (paymentStatus) orderWhere.paymentStatus = paymentStatus;
  if (productId || categoryId) {
    orderWhere.items = {
      some: {
        ...(productId ? { productId } : {}),
        ...(categoryId ? { product: { categoryId } } : {}),
      },
    };
  }

  const commissionWhere: any = {
    createdAt: { gte: startDate, lte: endDate },
  };

  const [orders, commissions, usersCreated, ayizanCreated, paidOrdersCount] = await Promise.all([
    prisma.order.findMany({
      where: orderWhere,
      orderBy: { createdAt: 'asc' },
      include: {
        customer: { select: { firstName: true, lastName: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                category: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.commission.findMany({
      where: commissionWhere,
      orderBy: { createdAt: 'asc' },
      include: {
        ayizan: { select: { firstName: true, lastName: true, email: true } },
        sourceUser: { select: { firstName: true, lastName: true, email: true } },
      },
    }),
    prisma.user.count({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
    }),
    prisma.user.count({
      where: {
        role: 'AYIZAN',
        createdAt: { gte: startDate, lte: endDate },
      },
    }),
    prisma.order.count({
      where: {
        ...orderWhere,
        paymentStatus: 'PAID',
      },
    }),
  ]);

  return { normalizedRange, days, startDate, endDate, orders, commissions, usersCreated, ayizanCreated, paidOrdersCount };
}

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

export async function getReports(
  range: string = '30d',
  startDateParam?: string,
  endDateParam?: string,
  filters: ReportFilters = {}
) {
  const { normalizedRange, days, startDate, endDate, orders, commissions, usersCreated, ayizanCreated, paidOrdersCount } =
    await getReportData(range, startDateParam, endDateParam, filters);
  const previousPeriodEnd = new Date(startDate);
  previousPeriodEnd.setMilliseconds(previousPeriodEnd.getMilliseconds() - 1);
  const previousPeriodStart = new Date(previousPeriodEnd);
  previousPeriodStart.setDate(previousPeriodStart.getDate() - (days - 1));
  previousPeriodStart.setHours(0, 0, 0, 0);

  const previousData = await getReportData(
    'custom',
    previousPeriodStart.toISOString(),
    previousPeriodEnd.toISOString(),
    filters
  );

  const labels = Array.from({ length: days }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return {
      key: date.toISOString().slice(0, 10),
      label: formatDayLabel(date),
      ventes: 0,
      commandes: 0,
    };
  });

  const salesByDate = new Map(labels.map((entry) => [entry.key, entry]));
  const previousLabels = Array.from({ length: days }, (_, index) => {
    const date = new Date(previousPeriodStart);
    date.setDate(previousPeriodStart.getDate() + index);
    return {
      key: date.toISOString().slice(0, 10),
      label: formatDayLabel(date),
      ventes: 0,
      commandes: 0,
    };
  });
  const previousSalesByDate = new Map(previousLabels.map((entry) => [entry.key, entry]));
  const orderStatusMap = new Map<string, number>();
  const paymentStatusMap = new Map<string, number>();
  const topProductsMap = new Map<string, { productId: string; name: string; quantity: number; amount: number }>();
  const topCategoriesMap = new Map<string, { categoryId: string; name: string; quantity: number; amount: number }>();

  let totalSales = 0;
  let totalOrders = orders.length;
  let deliveredOrders = 0;
  let pendingOrders = 0;
  let totalItemsSold = 0;

  for (const order of orders) {
    const key = order.createdAt.toISOString().slice(0, 10);
    const dayEntry = salesByDate.get(key);
    const orderAmount = toNumber(order.totalAmount);

    if (dayEntry) {
      dayEntry.commandes += 1;
      if (order.paymentStatus === 'PAID') {
        dayEntry.ventes += orderAmount;
      }
    }

    orderStatusMap.set(order.status, (orderStatusMap.get(order.status) || 0) + 1);
    paymentStatusMap.set(order.paymentStatus, (paymentStatusMap.get(order.paymentStatus) || 0) + 1);

    if (order.status === 'DELIVERED') deliveredOrders += 1;
    if (order.status === 'PENDING') pendingOrders += 1;
    if (order.paymentStatus === 'PAID') totalSales += orderAmount;

    for (const item of order.items) {
      const quantity = item.quantity;
      const lineAmount = quantity * toNumber(item.unitPrice);
      totalItemsSold += quantity;

      const productEntry = topProductsMap.get(item.productId) || {
        productId: item.productId,
        name: item.product.name,
        quantity: 0,
        amount: 0,
      };
      productEntry.quantity += quantity;
      productEntry.amount += lineAmount;
      topProductsMap.set(item.productId, productEntry);

      const category = item.product.category;
      if (category) {
        const categoryEntry = topCategoriesMap.get(category.id) || {
          categoryId: category.id,
          name: category.name,
          quantity: 0,
          amount: 0,
        };
        categoryEntry.quantity += quantity;
        categoryEntry.amount += lineAmount;
        topCategoriesMap.set(category.id, categoryEntry);
      }
    }
  }

  for (const order of previousData.orders) {
    const key = order.createdAt.toISOString().slice(0, 10);
    const dayEntry = previousSalesByDate.get(key);
    const orderAmount = toNumber(order.totalAmount);

    if (dayEntry) {
      dayEntry.commandes += 1;
      if (order.paymentStatus === 'PAID') {
        dayEntry.ventes += orderAmount;
      }
    }
  }

  const commissionByTypeMap = new Map<string, number>();
  const currentOverview = buildOverviewMetrics({
    normalizedRange,
    days,
    startDate,
    endDate,
    orders,
    commissions,
    usersCreated,
    ayizanCreated,
    paidOrdersCount,
  } as LoadedReportData);

  for (const commission of commissions) {
    const amount = toNumber(commission.amount);
    commissionByTypeMap.set(commission.type, (commissionByTypeMap.get(commission.type) || 0) + amount);
  }
  const previousOverview = buildOverviewMetrics(previousData as LoadedReportData);

  const comparison = {
    totalSales: computeDelta(currentOverview.totalSales, previousOverview.totalSales),
    totalOrders: computeDelta(currentOverview.totalOrders, previousOverview.totalOrders),
    averageBasket: computeDelta(currentOverview.averageBasket, previousOverview.averageBasket),
    totalCommissions: computeDelta(currentOverview.totalCommissions, previousOverview.totalCommissions),
    newAyizan: computeDelta(currentOverview.newAyizan, previousOverview.newAyizan),
  };

  const alerts = buildAlerts(currentOverview, comparison);

  return {
    range: normalizedRange,
    period: {
      startDate,
      endDate,
      label: `${formatDayLabel(startDate)} - ${formatDayLabel(endDate)}`,
    },
    filters,
    overview: {
      totalSales: currentOverview.totalSales,
      totalOrders: currentOverview.totalOrders,
      averageBasket: currentOverview.averageBasket,
      totalItemsSold: currentOverview.totalItemsSold,
      deliveredOrders: currentOverview.deliveredOrders,
      pendingOrders: currentOverview.pendingOrders,
      newUsers: currentOverview.newUsers,
      newAyizan: currentOverview.newAyizan,
      conversionRate: currentOverview.conversionRate,
    },
    comparison,
    alerts,
    salesHistory: labels,
    comparisonHistory: labels.map((entry, index) => ({
      label: entry.label,
      currentSales: entry.ventes,
      previousSales: previousLabels[index]?.ventes || 0,
      currentOrders: entry.commandes,
      previousOrders: previousLabels[index]?.commandes || 0,
    })),
    ordersByStatus: Array.from(orderStatusMap.entries()).map(([status, count]) => ({ status, count })),
    paymentsByStatus: Array.from(paymentStatusMap.entries()).map(([status, count]) => ({ status, count })),
    topProducts: Array.from(topProductsMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 6),
    topCategories: Array.from(topCategoriesMap.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6),
    commissions: {
      total: currentOverview.totalCommissions,
      paid: currentOverview.paidCommissions,
      pending: currentOverview.pendingCommissions,
      byType: Array.from(commissionByTypeMap.entries()).map(([type, amount]) => ({ type, amount })),
    },
    details: {
      orders: orders
        .slice()
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 12)
        .map((order) => ({
          id: order.id,
          orderNumber: order.orderNumber,
          customer: `${order.customer.firstName} ${order.customer.lastName}`,
          status: order.status,
          paymentStatus: order.paymentStatus,
          totalAmount: toNumber(order.totalAmount),
          itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
          createdAt: order.createdAt,
        })),
      products: Array.from(topProductsMap.values())
        .sort((a, b) => b.quantity - a.quantity)
        .map((product) => ({
          ...product,
          averagePrice: product.quantity > 0 ? product.amount / product.quantity : 0,
        })),
      commissions: commissions
        .slice()
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 12)
        .map((commission) => ({
          id: commission.id,
          createdAt: commission.createdAt,
          ayizanName: commission.ayizan ? `${commission.ayizan.firstName} ${commission.ayizan.lastName}` : 'N/A',
          sourceName: commission.sourceUser ? `${commission.sourceUser.firstName} ${commission.sourceUser.lastName}` : 'Système',
          type: commission.type,
          status: commission.status,
          amount: toNumber(commission.amount),
        })),
    },
  };
}

export async function exportReportsCsv(
  type: 'sales' | 'commissions',
  range: string = '30d',
  startDateParam?: string,
  endDateParam?: string,
  filters: ReportFilters = {}
) {
  const { orders, commissions } = await getReportData(range, startDateParam, endDateParam, filters);

  if (type === 'commissions') {
    const headers = ['Date', 'AYIZAN', 'Email AYIZAN', 'Source', 'Type', 'Montant HTG', 'Statut'];
    const rows = commissions.map((commission) => [
      new Date(commission.createdAt).toLocaleDateString('fr-HT'),
      commission.ayizan ? `${commission.ayizan.firstName} ${commission.ayizan.lastName}` : 'N/A',
      commission.ayizan?.email || '',
      commission.sourceUser ? `${commission.sourceUser.firstName} ${commission.sourceUser.lastName}` : 'Système',
      commission.type,
      toNumber(commission.amount).toFixed(2),
      commission.status,
    ]);

    return [headers, ...rows].map((row) => row.join(',')).join('\n');
  }

  const headers = ['Date', 'Commande', 'Client', 'Statut commande', 'Statut paiement', 'Montant HTG', 'Articles'];
  const rows = orders.map((order) => [
    new Date(order.createdAt).toLocaleDateString('fr-HT'),
    order.orderNumber,
    `${order.customer.firstName} ${order.customer.lastName}`,
    order.status,
    order.paymentStatus,
    toNumber(order.totalAmount).toFixed(2),
    order.items.reduce((sum, item) => sum + item.quantity, 0),
  ]);

  return [headers, ...rows].map((row) => row.join(',')).join('\n');
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
