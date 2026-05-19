import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { createError } from '../../middleware/error.middleware';
import { CreateDeliveryReportInput } from './delivery-reports.schema';

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function serializeReport(report: any) {
  return {
    ...report,
    cashCollected: toNumber(report.cashCollected),
    fieldExpenses: toNumber(report.fieldExpenses),
  };
}

export async function createDeliveryReport(deliveryAgentId: string, data: CreateDeliveryReportInput) {
  const deliveryAgent = await prisma.user.findFirst({
    where: {
      id: deliveryAgentId,
      role: 'DELIVERY_AGENT',
      isActive: true,
    },
    select: { id: true },
  });

  if (!deliveryAgent) {
    throw createError('Livreur introuvable', 404);
  }

  if (data.deliveredCount + data.failedCount > data.totalAssigned) {
    throw createError('Les livraisons réussies et échouées ne peuvent pas dépasser le total assigné', 400);
  }

  const report = await prisma.deliveryAgentReport.create({
    data: {
      deliveryAgentId,
      title: data.title.trim(),
      shiftDate: new Date(data.shiftDate),
      summary: data.summary.trim(),
      totalAssigned: data.totalAssigned,
      deliveredCount: data.deliveredCount,
      failedCount: data.failedCount,
      cashCollected: new Prisma.Decimal(Number(data.cashCollected).toFixed(2)),
      fieldExpenses: new Prisma.Decimal(Number(data.fieldExpenses).toFixed(2)),
      incidents: data.incidents?.trim() || null,
      nextActions: data.nextActions?.trim() || null,
    },
    include: {
      deliveryAgent: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
        },
      },
    },
  });

  return serializeReport(report);
}

export async function getMyDeliveryReports(deliveryAgentId: string) {
  const reports = await prisma.deliveryAgentReport.findMany({
    where: { deliveryAgentId },
    include: {
      deliveryAgent: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
        },
      },
    },
    orderBy: [{ shiftDate: 'desc' }, { createdAt: 'desc' }],
  });

  return reports.map(serializeReport);
}

export async function getBoardDeliveryReports() {
  const reports = await prisma.deliveryAgentReport.findMany({
    include: {
      deliveryAgent: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
        },
      },
    },
    orderBy: [{ shiftDate: 'desc' }, { createdAt: 'desc' }],
  });

  const serialized = reports.map(serializeReport);

  const overview = serialized.reduce(
    (acc, report) => {
      acc.totalReports += 1;
      acc.totalAssigned += report.totalAssigned;
      acc.totalDelivered += report.deliveredCount;
      acc.totalFailed += report.failedCount;
      acc.totalCashCollected += report.cashCollected;
      acc.totalFieldExpenses += report.fieldExpenses;
      return acc;
    },
    {
      totalReports: 0,
      totalAssigned: 0,
      totalDelivered: 0,
      totalFailed: 0,
      totalCashCollected: 0,
      totalFieldExpenses: 0,
    }
  );

  return {
    overview,
    reports: serialized,
  };
}
