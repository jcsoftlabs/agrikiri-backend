import { prisma } from '../config/database';
import { MlmLevel } from '@prisma/client';

// ================================
// MLM LEVEL REQUIREMENTS
// ================================

export const MLM_LEVELS = {
  AYIZAN: {
    name: 'Ayizan',
    monthlyQuotaVP: 546,
    monthlyCommission: 30000,
    requiredDownline: 0,
    color: '#4A90D9',
    icon: '🌱',
    description: 'Vendeur indépendant — premier niveau',
  },
  GUACANAGARIC: {
    name: 'Guacanagaric',
    monthlyQuotaVP: 546,
    monthlyCommission: 100000,
    requiredDownline: 3,
    color: '#F5A623',
    icon: '⭐',
    description: '3 AYIZAN actifs recrutés directement',
  },
  MACKANDAL: {
    name: 'Mackandal',
    monthlyQuotaVP: 546,
    monthlyCommission: 300000,
    requiredDownline: 12,
    color: '#7ED321',
    icon: '🔥',
    description: '12 membres dans tout le réseau',
  },
  BOUKMAN: {
    name: 'Boukman',
    monthlyQuotaVP: 546,
    monthlyCommission: 650000,
    requiredDownline: 39,
    color: '#D0021B',
    icon: '👑',
    description: '39 membres — bonus croisière 1 semaine',
    reward: 'Croisière 1 semaine',
  },
  SANITE_BELAIRE: {
    name: 'Sanite Bèlè',
    monthlyQuotaVP: 546,
    monthlyCommission: null,
    monthsRequired: 6,
    fromLevel: 'BOUKMAN',
    color: '#9B59B6',
    icon: '💎',
    bonusCheck: 300000,
    description: '6 mois consécutifs à BOUKMAN — chèque 300,000 Gds',
  },
  TOUSSAINT_LOUVERTURE: {
    name: 'Toussaint Louverture',
    monthlyQuotaVP: 546,
    monthlyCommission: null,
    monthsRequired: 6,
    fromLevel: 'SANITE_BELAIRE',
    color: '#E67E22',
    icon: '🏆',
    bonusCheck: 500000,
    description: '6 mois consécutifs à Sanite Bèlè — chèque 500,000 Gds',
  },
  CATHERINE_FLON: {
    name: 'Catherine Flon',
    monthlyQuotaVP: 546,
    monthlyCommission: null,
    monthsRequired: 6,
    fromLevel: 'TOUSSAINT_LOUVERTURE',
    color: '#1ABC9C',
    icon: '🌟',
    bonusCheck: 700000,
    description: '6 mois consécutifs à Toussaint — chèque 700,000 Gds',
  },
  JEAN_JACQUES_DESSALINES: {
    name: 'Jean Jacques Dessalines',
    monthlyQuotaVP: 546,
    monthlyCommission: null,
    monthsRequired: 6,
    fromLevel: 'CATHERINE_FLON',
    color: '#D4AF37',
    icon: '👑',
    annualBonus: 2000000,
    description: 'Niveau suprême — 2,000,000 Gds / an',
  },
};

// Progression via réseau (downline count)
const NETWORK_PROGRESSION: { min: number; level: MlmLevel }[] = [
  { min: 39, level: MlmLevel.BOUKMAN },
  { min: 12, level: MlmLevel.MACKANDAL },
  { min: 3, level: MlmLevel.GUACANAGARIC },
  { min: 0, level: MlmLevel.AYIZAN },
];

// Progression via temps (mois consécutifs)
const TIME_PROGRESSION: { from: MlmLevel; to: MlmLevel; monthsRequired: number }[] = [
  { from: MlmLevel.BOUKMAN, to: MlmLevel.SANITE_BELAIRE, monthsRequired: 6 },
  { from: MlmLevel.SANITE_BELAIRE, to: MlmLevel.TOUSSAINT_LOUVERTURE, monthsRequired: 6 },
  { from: MlmLevel.TOUSSAINT_LOUVERTURE, to: MlmLevel.CATHERINE_FLON, monthsRequired: 6 },
  { from: MlmLevel.CATHERINE_FLON, to: MlmLevel.JEAN_JACQUES_DESSALINES, monthsRequired: 6 },
];

// ================================
// CALCULATE USER LEVEL
// ================================

export async function calculateUserLevel(userId: string): Promise<MlmLevel> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mlmLevel: true, monthsAtCurrentLevel: true },
  });

  if (!user) throw new Error('Utilisateur introuvable');

  // Vérifier progression temporelle (BOUKMAN → DESSALINES)
  const timeProgression = TIME_PROGRESSION.find(
    (tp) => tp.from === user.mlmLevel && user.monthsAtCurrentLevel >= tp.monthsRequired
  );

  if (timeProgression) {
    return timeProgression.to;
  }

  // Si l'utilisateur est déjà dans les niveaux supérieurs (via temps), ne pas rétrograder
  const highLevels: MlmLevel[] = [
    MlmLevel.SANITE_BELAIRE,
    MlmLevel.TOUSSAINT_LOUVERTURE,
    MlmLevel.CATHERINE_FLON,
    MlmLevel.JEAN_JACQUES_DESSALINES,
  ];

  if (highLevels.includes(user.mlmLevel)) {
    return user.mlmLevel;
  }

  // Calculer niveau basé sur le réseau (AYIZAN → BOUKMAN)
  const downlineCount = await countTotalDownline(userId);

  for (const { min, level } of NETWORK_PROGRESSION) {
    if (downlineCount >= min) {
      return level;
    }
  }

  return MlmLevel.AYIZAN;
}

// ================================
// COUNT TOTAL DOWNLINE (Recursif)
// ================================

export async function countTotalDownline(userId: string): Promise<number> {
  const directDownline = await prisma.user.findMany({
    where: { sponsorId: userId, role: 'AYIZAN', isActive: true },
    select: { id: true },
  });

  let count = directDownline.length;

  for (const member of directDownline) {
    count += await countTotalDownline(member.id);
  }

  return count;
}

// ================================
// GET NETWORK TREE (3 niveaux)
// ================================

export async function getNetworkTree(userId: string, depth: number = 3): Promise<any> {
  if (depth === 0) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      mlmLevel: true,
      personalVolume: true,
      isActive: true,
    },
  });

  if (!user) return null;

  const children = await prisma.user.findMany({
    where: { sponsorId: userId, role: { in: ['AYIZAN', 'CUSTOMER'] } },
    select: { id: true },
  });

  const childrenWithTree = await Promise.all(
    children.map((child) => getNetworkTree(child.id, depth - 1))
  );

  return {
    ...user,
    children: childrenWithTree.filter(Boolean),
  };
}

// ================================
// CHECK AND UPDATE LEVELS (Cron)
// ================================

export async function updateAllUserLevels(): Promise<void> {
  const ayizans = await prisma.user.findMany({
    where: { role: 'AYIZAN', isActive: true },
    select: { id: true, mlmLevel: true },
  });

  for (const ayizan of ayizans) {
    const newLevel = await calculateUserLevel(ayizan.id);

    if (newLevel !== ayizan.mlmLevel) {
      await prisma.user.update({
        where: { id: ayizan.id },
        data: {
          mlmLevel: newLevel,
          monthsAtCurrentLevel: 0,
        },
      });

      // Créer une notification de montée de niveau
      await prisma.notification.create({
        data: {
          userId: ayizan.id,
          type: 'LEVEL_UP',
          title: '🎉 Félicitations ! Vous avez monté de niveau',
          message: `Vous êtes maintenant ${MLM_LEVELS[newLevel].name} — ${MLM_LEVELS[newLevel].description}`,
        },
      });

      console.log(`📈 Utilisateur ${ayizan.id} élevé au niveau ${newLevel}`);
    }
  }
}

// ================================
// GET MLM LEADERBOARD
// ================================

export async function getLeaderboard(month: number, year: number, limit: number = 10) {
  return prisma.monthlyPerformance.findMany({
    where: { month, year, quotaReached: true },
    orderBy: { totalCommissions: 'desc' },
    take: limit,
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          mlmLevel: true,
        },
      },
    },
  });
}

// ================================
// GENERATE REFERRAL CODE
// ================================

export function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'AGK-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ================================
// GENERATE ORDER NUMBER
// ================================

export function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `AGRO-${timestamp}${random}`.substring(0, 13);
}
