import { prisma } from '../../config/database';
import { createError } from '../../middleware/error.middleware';
import {
  calculateUserLevel,
  getNetworkTree,
  getLeaderboard,
  countTotalDownline,
  MLM_LEVELS,
} from '../../utils/mlm-calculator';
import { processMonthlyCommissions } from '../../utils/commission-engine';

// ================================
// GET MY NETWORK (3 niveaux)
// ================================

export async function getMyNetwork(userId: string) {
  const tree = await getNetworkTree(userId, 3);

  const directDownline = await prisma.user.findMany({
    where: { sponsorId: userId, role: { in: ['AYIZAN', 'CUSTOMER'] } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      mlmLevel: true,
      personalVolume: true,
      isActive: true,
      createdAt: true,
    },
  });

  const totalDownline = await countTotalDownline(userId);

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  const activeThisMonth = await prisma.monthlyPerformance.count({
    where: {
      user: { sponsorId: userId },
      month: currentMonth,
      year: currentYear,
      quotaReached: true,
    },
  });

  return {
    tree,
    directDownline,
    stats: {
      totalMembers: totalDownline,
      directMembers: directDownline.length,
      activeThisMonth,
    },
  };
}

// ================================
// GET MY MLM STATS
// ================================

export async function getMyMlmStats(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      mlmLevel: true,
      personalVolume: true,
      monthsAtCurrentLevel: true,
      referralCode: true,
    },
  });

  if (!user) throw createError('Utilisateur introuvable', 404);

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  const monthlyPerf = await prisma.monthlyPerformance.findUnique({
    where: { userId_month_year: { userId, month: currentMonth, year: currentYear } },
  });

  const levelInfo = MLM_LEVELS[user.mlmLevel as keyof typeof MLM_LEVELS];
  const downlineCount = await countTotalDownline(userId);

  // Calculer le prochain niveau
  const levels = Object.keys(MLM_LEVELS);
  const currentLevelIndex = levels.indexOf(user.mlmLevel);
  const nextLevel = currentLevelIndex < levels.length - 1 ? levels[currentLevelIndex + 1] : null;
  const nextLevelInfo = nextLevel ? MLM_LEVELS[nextLevel as keyof typeof MLM_LEVELS] : null;

  return {
    user,
    currentLevel: levelInfo,
    nextLevel: nextLevelInfo ? { key: nextLevel, ...nextLevelInfo } : null,
    monthlyPerformance: monthlyPerf,
    downlineCount,
    personalVP: Number(user.personalVolume),
    quotaVP: 546,
    quotaProgress: Math.min((Number(user.personalVolume) / 546) * 100, 100),
  };
}

// ================================
// GET LEADERBOARD
// ================================

export async function getMlmLeaderboard(month: number, year: number, limit: number = 10) {
  return getLeaderboard(month, year, limit);
}

// ================================
// GET USER MLM TREE (Admin)
// ================================

export async function getUserMlmTree(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw createError('Utilisateur introuvable', 404);

  return getNetworkTree(userId, 5);
}

// ================================
// VALIDATE MONTHLY QUOTA (Admin)
// ================================

export async function validateMonthlyQuota(month: number, year: number) {
  await processMonthlyCommissions(month, year);

  return {
    message: `Commissions mensuelles traitées pour ${month}/${year}`,
    processedAt: new Date(),
  };
}

// ================================
// GET MLM GLOBAL STATS (Admin)
// ================================

export async function getMlmGlobalStats() {
  const levelCounts = await prisma.user.groupBy({
    by: ['mlmLevel'],
    where: { role: 'AYIZAN' },
    _count: true,
  });

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  const activeThisMonth = await prisma.monthlyPerformance.count({
    where: { month: currentMonth, year: currentYear, quotaReached: true },
  });

  const totalCommissionsThisMonth = await prisma.commission.aggregate({
    where: { month: currentMonth, year: currentYear },
    _sum: { amount: true },
  });

  const totalAyizan = await prisma.user.count({ where: { role: 'AYIZAN' } });
  const totalCustomers = await prisma.user.count({ where: { role: 'CUSTOMER' } });

  return {
    levelDistribution: levelCounts.map((lc) => ({
      level: lc.mlmLevel,
      count: lc._count,
      levelInfo: MLM_LEVELS[lc.mlmLevel as keyof typeof MLM_LEVELS],
    })),
    activeThisMonth,
    totalAyizan,
    totalCustomers,
    totalCommissionsThisMonth: Number(totalCommissionsThisMonth._sum.amount || 0),
  };
}
