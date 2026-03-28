import { prisma } from '../../config/database';

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
      select: {
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
      },
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
