import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { createError } from '../../middleware/error.middleware';
import { CreateDeliveryReportInput } from './delivery-reports.schema';

const LBS_PER_KG = 2.20462;

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundWeight(value: number) {
  return Number(value.toFixed(2));
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function toKgFromLbs(value: number) {
  return roundWeight(value / LBS_PER_KG);
}

type SerializedReportItem = {
  deliveryNoteItemId: string;
  description: string;
  orderedQuantity: number;
  assignedQuantity: number;
  alreadyReportedQuantity: number;
  deliveredThisReport: number;
  remainingAfterReport: number;
  unitWeightLbs: number;
  unitWeightKg: number;
  lineWeightLbs: number;
  lineWeightKg: number;
};

function normalizeReportItems(rawItems: unknown): SerializedReportItem[] {
  if (!Array.isArray(rawItems)) return [];

  return rawItems
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const current = item as Record<string, unknown>;
      return {
        deliveryNoteItemId: String(current.deliveryNoteItemId || ''),
        description: String(current.description || ''),
        orderedQuantity: Number(current.orderedQuantity || 0),
        assignedQuantity: Number(current.assignedQuantity || 0),
        alreadyReportedQuantity: Number(current.alreadyReportedQuantity || 0),
        deliveredThisReport: Number(current.deliveredThisReport || 0),
        remainingAfterReport: Number(current.remainingAfterReport || 0),
        unitWeightLbs: Number(current.unitWeightLbs || 0),
        unitWeightKg: Number(current.unitWeightKg || 0),
        lineWeightLbs: Number(current.lineWeightLbs || 0),
        lineWeightKg: Number(current.lineWeightKg || 0),
      };
    })
    .filter((item): item is SerializedReportItem => Boolean(item && item.deliveryNoteItemId));
}

function serializeReport(report: any) {
  return {
    ...report,
    totalDeliveredWeightLbs: toNumber(report.totalDeliveredWeightLbs),
    totalDeliveredWeightKg: toNumber(report.totalDeliveredWeightKg),
    cashCollected: toNumber(report.cashCollected),
    fieldExpenses: toNumber(report.fieldExpenses),
    reportItems: normalizeReportItems(report.reportItems),
    deliveryNote: report.deliveryNote
      ? {
          ...report.deliveryNote,
          totalWeightLbs: toNumber(report.deliveryNote.totalWeightLbs),
        }
      : null,
  };
}

async function syncCashCollectionForOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      totalAmount: true,
      paymentMethod: true,
    },
  });

  if (!order || order.paymentMethod !== 'CASH') {
    return;
  }

  const deliveryReports = await prisma.deliveryAgentReport.findMany({
    where: {
      deliveryNote: {
        orderId,
      },
    },
    select: {
      cashCollected: true,
    },
  });

  const totalAmount = roundMoney(toNumber(order.totalAmount));
  const rawCollected = roundMoney(deliveryReports.reduce((sum, report) => sum + toNumber(report.cashCollected), 0));
  const amountCollected = Math.min(rawCollected, totalAmount);

  const paymentStatus =
    amountCollected <= 0
      ? 'PENDING'
      : amountCollected + 0.001 >= totalAmount
        ? 'PAID'
        : 'PARTIALLY_PAID';

  await prisma.order.update({
    where: { id: orderId },
    data: {
      amountCollected: new Prisma.Decimal(amountCollected.toFixed(2)),
      paymentStatus,
    },
  });
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

  let totalAssigned = data.totalAssigned;
  let deliveredCount = data.deliveredCount;
  let failedCount = data.failedCount;
  let remainingAssigned = Math.max(totalAssigned - deliveredCount - failedCount, 0);
  let totalDeliveredWeightLbs = 0;
  let totalDeliveredWeightKg = 0;
  let serializedItems: SerializedReportItem[] = [];
  let linkedCashOrderId: string | null = null;

  if (data.deliveryNoteId) {
    const deliveryNote = await prisma.deliveryNote.findFirst({
      where: {
        id: data.deliveryNoteId,
        deliveryAgentId,
      },
      include: {
        items: true,
        order: {
          select: {
            id: true,
            totalAmount: true,
            paymentMethod: true,
          },
        },
      },
    });

    if (!deliveryNote) {
      throw createError('Bon de livraison introuvable pour ce livreur.', 404);
    }

    if (deliveryNote.status === 'CANCELLED') {
      throw createError('Ce bon de livraison est annulé.', 400);
    }

    if (deliveryNote.order?.paymentMethod && deliveryNote.order.paymentMethod !== 'CASH' && data.cashCollected > 0) {
      throw createError('Cette commande n’est pas configurée pour un encaissement cash à la livraison.', 400);
    }

    if (deliveryNote.order?.paymentMethod === 'CASH') {
      const previousOrderCashReports = await prisma.deliveryAgentReport.findMany({
        where: {
          deliveryNote: {
            orderId: deliveryNote.order.id,
          },
        },
        select: {
          cashCollected: true,
        },
      });

      const alreadyCollected = roundMoney(
        previousOrderCashReports.reduce((sum, report) => sum + toNumber(report.cashCollected), 0)
      );
      const orderTotalAmount = roundMoney(toNumber(deliveryNote.order.totalAmount));
      const remainingCashDue = roundMoney(Math.max(0, orderTotalAmount - alreadyCollected));

      if (roundMoney(Number(data.cashCollected)) > remainingCashDue + 0.001) {
        throw createError(
          `Le montant encaissé dépasse le reste à payer sur cette commande (${remainingCashDue.toLocaleString('fr-FR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} HTG).`,
          400
        );
      }

      linkedCashOrderId = deliveryNote.order.id;
    }

    const previousReports = await prisma.deliveryAgentReport.findMany({
      where: {
        deliveryAgentId,
        deliveryNoteId: deliveryNote.id,
      },
      select: {
        id: true,
        reportItems: true,
      },
    });

    const alreadyReportedByItemId = previousReports.reduce<Record<string, number>>((acc, report) => {
      const items = normalizeReportItems(report.reportItems);
      items.forEach((item) => {
        acc[item.deliveryNoteItemId] = (acc[item.deliveryNoteItemId] || 0) + item.deliveredThisReport;
      });
      return acc;
    }, {});

    const submittedByItemId = new Map(data.reportItems.map((item) => [item.deliveryNoteItemId, item.quantity]));
    const noteItemsById = new Map(deliveryNote.items.map((item) => [item.id, item]));

    serializedItems = deliveryNote.items.map((item) => {
      const currentQuantity = Number(submittedByItemId.get(item.id) || 0);
      const alreadyReportedQuantity = Number(alreadyReportedByItemId[item.id] || 0);
      const assignedQuantity = item.deliveredQuantity;
      const remainingAvailable = Math.max(assignedQuantity - alreadyReportedQuantity, 0);

      if (currentQuantity > remainingAvailable) {
        throw createError(
          `La quantité déclarée pour "${item.description}" dépasse le restant disponible sur ce bon.`,
          400
        );
      }

      const unitWeightLbs = toNumber(item.unitWeightLbs);
      const lineWeightLbs = roundWeight(unitWeightLbs * currentQuantity);
      const lineWeightKg = toKgFromLbs(lineWeightLbs);

      totalDeliveredWeightLbs += lineWeightLbs;
      totalDeliveredWeightKg += lineWeightKg;

      return {
        deliveryNoteItemId: item.id,
        description: item.description,
        orderedQuantity: item.orderedQuantity,
        assignedQuantity,
        alreadyReportedQuantity,
        deliveredThisReport: currentQuantity,
        remainingAfterReport: Math.max(assignedQuantity - alreadyReportedQuantity - currentQuantity, 0),
        unitWeightLbs,
        unitWeightKg: toKgFromLbs(unitWeightLbs),
        lineWeightLbs,
        lineWeightKg,
      };
    });

    const invalidItem = data.reportItems.find((item) => !noteItemsById.has(item.deliveryNoteItemId));
    if (invalidItem) {
      throw createError('Une ligne sélectionnée ne correspond pas à ce bon de livraison.', 400);
    }

    deliveredCount = serializedItems.reduce((sum, item) => sum + item.deliveredThisReport, 0);
    totalAssigned = deliveryNote.totalQuantity;
    failedCount = Math.min(data.failedCount, Math.max(totalAssigned - deliveredCount, 0));
    remainingAssigned = Math.max(
      deliveryNote.totalQuantity -
        serializedItems.reduce((sum, item) => sum + item.alreadyReportedQuantity + item.deliveredThisReport, 0),
      0
    );

    if (deliveredCount <= 0) {
      throw createError('Ajoute au moins une quantité livrée sur le tableau du bon.', 400);
    }

    if (deliveryNote.status === 'DELIVERED' && remainingAssigned <= 0) {
      throw createError('Ce bon est déjà totalement soldé côté rapports.', 400);
    }
  }

  const report = await prisma.deliveryAgentReport.create({
    data: {
      deliveryAgentId,
      deliveryNoteId: data.deliveryNoteId || null,
      title: data.title.trim(),
      shiftDate: new Date(data.shiftDate),
      summary: data.summary.trim(),
      totalAssigned,
      deliveredCount,
      failedCount,
      remainingAssigned,
      totalDeliveredWeightLbs: new Prisma.Decimal(totalDeliveredWeightLbs.toFixed(2)),
      totalDeliveredWeightKg: new Prisma.Decimal(totalDeliveredWeightKg.toFixed(2)),
      weightUnit: data.weightUnit,
      reportItems: serializedItems as Prisma.InputJsonValue,
      cashCollected: new Prisma.Decimal(Number(data.cashCollected).toFixed(2)),
      cashCollectionMethod: data.cashCollectionMethod,
      fieldExpenses: new Prisma.Decimal(Number(data.fieldExpenses).toFixed(2)),
      fieldExpensesMethod: data.fieldExpensesMethod,
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
      deliveryNote: {
        select: {
          id: true,
          noteNumber: true,
          status: true,
          customerName: true,
          totalQuantity: true,
          totalWeightLbs: true,
        },
      },
    },
  });

  if (linkedCashOrderId && Number(data.cashCollected) > 0) {
    await syncCashCollectionForOrder(linkedCashOrderId);
  }

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
      deliveryNote: {
        select: {
          id: true,
          noteNumber: true,
          status: true,
          customerName: true,
          totalQuantity: true,
          totalWeightLbs: true,
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
      deliveryNote: {
        select: {
          id: true,
          noteNumber: true,
          status: true,
          customerName: true,
          totalQuantity: true,
          totalWeightLbs: true,
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
      acc.totalDeliveredWeightLbs += report.totalDeliveredWeightLbs;
      return acc;
    },
    {
      totalReports: 0,
      totalAssigned: 0,
      totalDelivered: 0,
      totalFailed: 0,
      totalCashCollected: 0,
      totalFieldExpenses: 0,
      totalDeliveredWeightLbs: 0,
    }
  );

  return {
    overview,
    reports: serialized,
  };
}

async function ensureReportAccess(reportId: string, actor: { userId: string; role: string }) {
  const report = await prisma.deliveryAgentReport.findUnique({
    where: { id: reportId },
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
      deliveryNote: {
        select: {
          id: true,
          noteNumber: true,
          status: true,
          customerName: true,
          totalQuantity: true,
          totalWeightLbs: true,
          receiverName: true,
        },
      },
    },
  });

  if (!report) {
    throw createError('Rapport livreur introuvable.', 404);
  }

  if (actor.role === 'DELIVERY_AGENT' && report.deliveryAgentId !== actor.userId) {
    throw createError('Accès refusé à ce rapport livreur.', 403);
  }

  return serializeReport(report);
}

export async function getDeliveryReportById(reportId: string, actor: { userId: string; role: string }) {
  return ensureReportAccess(reportId, actor);
}
