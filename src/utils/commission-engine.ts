import { prisma } from '../config/database';
import { CommissionType, MlmLevel, Prisma } from '@prisma/client';

// ================================
// COMMISSION RATES
// ================================

const DIRECT_COMMISSION_RATE = 0.10;   // 10% sur ses propres ventes
const NETWORK_LEVEL1_RATE = 0.05;      // 5% sur ventes des recrues directes

// Commission mensuelle par niveau (HTG)
export const MONTHLY_COMMISSIONS: Record<string, number | null> = {
  AYIZAN: 30000,
  GUACANAGARIC: 100000,
  MACKANDAL: 300000,
  BOUKMAN: 650000,
  SANITE_BELAIRE: null,    // Commission normale + chèque bonus
  TOUSSAINT_LOUVERTURE: null,
  CATHERINE_FLON: null,
  JEAN_JACQUES_DESSALINES: null,
};

// Bonus chèques pour les niveaux supérieurs
export const BONUS_CHECKS: Record<string, number> = {
  SANITE_BELAIRE: 300000,
  TOUSSAINT_LOUVERTURE: 500000,
  CATHERINE_FLON: 700000,
  JEAN_JACQUES_DESSALINES: 2000000, // annuel
};

// ================================
// CALCULATE COMMISSIONS ON ORDER
// ================================

export async function calculateOrderCommissions(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { product: true } },
      ayizan: { include: { sponsor: true } },
    },
  });

  if (!order || !order.ayizanId || !order.ayizan) return;

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  // 1. Commission directe pour l'AYIZAN vendeur (10%)
  const directAmount = Number(order.totalAmount) * DIRECT_COMMISSION_RATE;

  await prisma.commission.create({
    data: {
      ayizanId: order.ayizanId,
      orderId: order.id,
      sourceUserId: order.customerId,
      type: CommissionType.DIRECT,
      amount: new Prisma.Decimal(directAmount),
      percentage: new Prisma.Decimal(DIRECT_COMMISSION_RATE * 100),
      mlmLevel: order.ayizan.mlmLevel,
      month: currentMonth,
      year: currentYear,
    },
  });

  // 2. Commission réseau pour le sponsor (5%)
  if (order.ayizan.sponsorId && order.ayizan.sponsor) {
    const networkAmount = Number(order.totalAmount) * NETWORK_LEVEL1_RATE;

    await prisma.commission.create({
      data: {
        ayizanId: order.ayizan.sponsorId,
        orderId: order.id,
        sourceUserId: order.ayizanId,
        type: CommissionType.NETWORK,
        amount: new Prisma.Decimal(networkAmount),
        percentage: new Prisma.Decimal(NETWORK_LEVEL1_RATE * 100),
        mlmLevel: order.ayizan.sponsor.mlmLevel,
        month: currentMonth,
        year: currentYear,
      },
    });
  }

  // 3. Mettre à jour les Volume Points mensuels
  await updateMonthlyVP(order.ayizanId, Number(order.totalVP), currentMonth, currentYear);
}

// ================================
// UPDATE MONTHLY VP
// ================================

async function updateMonthlyVP(
  userId: string,
  vp: number,
  month: number,
  year: number
): Promise<void> {
  const existing = await prisma.monthlyPerformance.findUnique({
    where: { userId_month_year: { userId, month, year } },
  });

  if (existing) {
    await prisma.monthlyPerformance.update({
      where: { userId_month_year: { userId, month, year } },
      data: {
        personalVP: { increment: new Prisma.Decimal(vp) },
      },
    });
  } else {
    await prisma.monthlyPerformance.create({
      data: {
        userId,
        month,
        year,
        personalVP: new Prisma.Decimal(vp),
        networkVP: new Prisma.Decimal(0),
        totalCommissions: new Prisma.Decimal(0),
        directCommissions: new Prisma.Decimal(0),
        networkCommissions: new Prisma.Decimal(0),
        bonus: new Prisma.Decimal(0),
        quotaReached: false,
        downlineCount: 0,
      },
    });
  }

  // Mettre à jour le personalVolume sur le user
  await prisma.user.update({
    where: { id: userId },
    data: { personalVolume: { increment: new Prisma.Decimal(vp) } },
  });
}

// ================================
// PROCESS MONTHLY COMMISSIONS (Cron)
// ================================

export async function processMonthlyCommissions(month: number, year: number): Promise<void> {
  const MONTHLY_QUOTA_VP = 546;

  // Récupérer tous les AYIZAN actifs
  const ayizans = await prisma.user.findMany({
    where: { role: 'AYIZAN', isActive: true },
  });

  for (const ayizan of ayizans) {
    const performance = await prisma.monthlyPerformance.findUnique({
      where: { userId_month_year: { userId: ayizan.id, month, year } },
    });

    const personalVP = Number(performance?.personalVP || 0);
    const quotaReached = personalVP >= MONTHLY_QUOTA_VP;

    // Calculer les commissions directes et réseau du mois
    const monthCommissions = await prisma.commission.findMany({
      where: { ayizanId: ayizan.id, month, year },
    });

    const directTotal = monthCommissions
      .filter((c) => c.type === CommissionType.DIRECT)
      .reduce((sum, c) => sum + Number(c.amount), 0);

    const networkTotal = monthCommissions
      .filter((c) => c.type === CommissionType.NETWORK)
      .reduce((sum, c) => sum + Number(c.amount), 0);

    // Bonus mensuel si quota atteint
    let monthlyBonus = 0;
    if (quotaReached) {
      const levelBonus = MONTHLY_COMMISSIONS[ayizan.mlmLevel];
      if (levelBonus) {
        monthlyBonus = levelBonus;

        await prisma.commission.create({
          data: {
            ayizanId: ayizan.id,
            type: CommissionType.MONTHLY_BONUS,
            amount: new Prisma.Decimal(monthlyBonus),
            percentage: new Prisma.Decimal(0),
            mlmLevel: ayizan.mlmLevel,
            month,
            year,
          },
        });
      }

      // Bonus de niveau (chèque)
      const levelCheckBonus = BONUS_CHECKS[ayizan.mlmLevel];
      if (levelCheckBonus && ['SANITE_BELAIRE', 'TOUSSAINT_LOUVERTURE', 'CATHERINE_FLON'].includes(ayizan.mlmLevel)) {
        await prisma.commission.create({
          data: {
            ayizanId: ayizan.id,
            type: CommissionType.LEVEL_BONUS,
            amount: new Prisma.Decimal(levelCheckBonus),
            percentage: new Prisma.Decimal(0),
            mlmLevel: ayizan.mlmLevel,
            month,
            year,
          },
        });
      }
    }

    const downlineCount = await countActiveDownline(ayizan.id, month, year);

    // Mettre à jour MonthlyPerformance
    await prisma.monthlyPerformance.upsert({
      where: { userId_month_year: { userId: ayizan.id, month, year } },
      update: {
        quotaReached,
        totalCommissions: new Prisma.Decimal(directTotal + networkTotal + monthlyBonus),
        directCommissions: new Prisma.Decimal(directTotal),
        networkCommissions: new Prisma.Decimal(networkTotal),
        bonus: new Prisma.Decimal(monthlyBonus),
        downlineCount,
      },
      create: {
        userId: ayizan.id,
        month,
        year,
        personalVP: new Prisma.Decimal(personalVP),
        networkVP: new Prisma.Decimal(0),
        totalCommissions: new Prisma.Decimal(directTotal + networkTotal + monthlyBonus),
        directCommissions: new Prisma.Decimal(directTotal),
        networkCommissions: new Prisma.Decimal(networkTotal),
        bonus: new Prisma.Decimal(monthlyBonus),
        quotaReached,
        downlineCount,
      },
    });

    // Incrémenter monthsAtCurrentLevel si quota atteint
    if (quotaReached) {
      await prisma.user.update({
        where: { id: ayizan.id },
        data: { monthsAtCurrentLevel: { increment: 1 } },
      });
    }

    // Reset personalVolume pour le mois suivant
    await prisma.user.update({
      where: { id: ayizan.id },
      data: { personalVolume: new Prisma.Decimal(0) },
    });
  }

  console.log(`✅ Commissions mensuelles traitées pour ${month}/${year}`);
}

// ================================
// COUNT ACTIVE DOWNLINE
// ================================

export async function countActiveDownline(
  userId: string,
  month: number,
  year: number
): Promise<number> {
  const directDownline = await prisma.user.findMany({
    where: { sponsorId: userId, role: { in: ['AYIZAN'] }, isActive: true },
    select: { id: true },
  });

  let count = directDownline.length;

  for (const member of directDownline) {
    count += await countActiveDownline(member.id, month, year);
  }

  return count;
}

// ================================
// GET COMMISSION SUMMARY
// ================================

export async function getCommissionSummary(userId: string, month?: number, year?: number) {
  const where: any = { ayizanId: userId };
  if (month && year) {
    where.month = month;
    where.year = year;
  }

  const commissions = await prisma.commission.findMany({ where });

  return {
    total: commissions.reduce((sum, c) => sum + Number(c.amount), 0),
    pending: commissions.filter((c) => c.status === 'PENDING').reduce((sum, c) => sum + Number(c.amount), 0),
    validated: commissions.filter((c) => c.status === 'VALIDATED').reduce((sum, c) => sum + Number(c.amount), 0),
    paid: commissions.filter((c) => c.status === 'PAID').reduce((sum, c) => sum + Number(c.amount), 0),
    byType: {
      direct: commissions.filter((c) => c.type === 'DIRECT').reduce((sum, c) => sum + Number(c.amount), 0),
      network: commissions.filter((c) => c.type === 'NETWORK').reduce((sum, c) => sum + Number(c.amount), 0),
      monthlyBonus: commissions.filter((c) => c.type === 'MONTHLY_BONUS').reduce((sum, c) => sum + Number(c.amount), 0),
      levelBonus: commissions.filter((c) => c.type === 'LEVEL_BONUS').reduce((sum, c) => sum + Number(c.amount), 0),
    },
  };
}
