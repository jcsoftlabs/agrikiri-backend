import { prisma } from '../../config/database';
import { createError } from '../../middleware/error.middleware';

const REPORT_RANGES = ['7d', '30d', '90d'] as const;
const FALLBACK_CHANNEL = 'AUTRE';

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

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString('fr-HT', { day: 'numeric', month: 'short' });
}

function normalizeChannel(method?: string | null) {
  return method || FALLBACK_CHANNEL;
}

function formatChannelLabel(method?: string | null) {
  const labels: Record<string, string> = {
    CASH: 'Cash',
    MONCASH: 'MonCash',
    NATCASH: 'NatCash',
    PLOPPLOP: 'PLOP PLOP',
    CHEQUE: 'Chèque',
    VIREMENT_BANCAIRE: 'Virement bancaire',
    KASHPAW: 'Kashpaw',
    AUTRE: 'Autre',
  };

  const key = normalizeChannel(method);
  return labels[key] || key;
}

function computeDelta(currentValue: number, previousValue: number) {
  const diff = currentValue - previousValue;
  const percent = previousValue === 0 ? (currentValue === 0 ? 0 : 100) : (diff / previousValue) * 100;

  return {
    current: currentValue,
    previous: previousValue,
    diff,
    percent,
    direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
  };
}

function pushMethodAmount(store: Map<string, number>, method: string | null | undefined, amount: number) {
  if (amount <= 0) return;
  const key = normalizeChannel(method);
  store.set(key, (store.get(key) || 0) + amount);
}

function toMethodRows(store: Map<string, number>) {
  return Array.from(store.entries())
    .map(([method, amount]) => ({
      method,
      label: formatChannelLabel(method),
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);
}

type DashboardPeriodData = Awaited<ReturnType<typeof loadAccountingPeriodData>>;

async function loadAccountingPeriodData(startDate: Date, endDate: Date) {
  const rangeWhere = { gte: startDate, lte: endDate };

  const [
    paidOrders,
    posSales,
    deliveryReports,
    allocations,
    completedDossiers,
    buyerReports,
    pendingFundRequests,
    deliveredCashOrders,
    inTransitNotes,
    pendingAllocationConfirmations,
  ] = await Promise.all([
    prisma.order.findMany({
      where: {
        createdAt: rangeWhere,
        paymentStatus: 'PAID',
      },
      select: {
        id: true,
        orderNumber: true,
        totalAmount: true,
        paymentMethod: true,
        createdAt: true,
        customer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.posSale.findMany({
      where: {
        createdAt: rangeWhere,
        status: 'COMPLETED',
      },
      select: {
        id: true,
        saleNumber: true,
        documentType: true,
        totalAmount: true,
        paymentMethod: true,
        customerName: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.deliveryAgentReport.findMany({
      where: { createdAt: rangeWhere },
      select: {
        id: true,
        title: true,
        cashCollected: true,
        cashCollectionMethod: true,
        fieldExpenses: true,
        fieldExpensesMethod: true,
        accountingValidatedAt: true,
        createdAt: true,
        deliveryAgent: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.buyerAllocation.findMany({
      where: { createdAt: rangeWhere },
      select: {
        id: true,
        title: true,
        amountAllocated: true,
        disbursementMethod: true,
        status: true,
        createdAt: true,
        buyer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.dossier.findMany({
      where: {
        status: 'COMPLETED',
        updatedAt: rangeWhere,
      },
      select: {
        id: true,
        title: true,
        disbursementTotal: true,
        disbursementMethod: true,
        accountingExecutedAt: true,
        updatedAt: true,
        author: { select: { firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: 'asc' },
    }),
    prisma.buyerExpenseReport.findMany({
      where: { createdAt: rangeWhere },
      select: {
        id: true,
        totalSpent: true,
        totalFees: true,
        totalReported: true,
        remainingAmount: true,
        accountingValidatedAt: true,
        createdAt: true,
        allocation: { select: { title: true } },
        buyer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.buyerFundRequest.findMany({
      where: {
        createdAt: rangeWhere,
        status: 'PENDING',
      },
      select: {
        id: true,
        title: true,
        amountRequested: true,
        createdAt: true,
        buyer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.order.findMany({
      where: {
        status: 'DELIVERED',
        paymentMethod: 'CASH',
        paymentStatus: { not: 'PAID' },
      },
      select: {
        id: true,
        orderNumber: true,
        totalAmount: true,
        deliveredAt: true,
        customer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { deliveredAt: 'desc' },
      take: 10,
    }),
    prisma.deliveryNote.findMany({
      where: {
        status: 'IN_TRANSIT',
        createdAt: rangeWhere,
      },
      select: { id: true, noteNumber: true, totalWeightLbs: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.buyerAllocation.findMany({
      where: {
        status: 'PENDING_CONFIRMATION',
        createdAt: rangeWhere,
      },
      select: {
        id: true,
        title: true,
        amountAllocated: true,
        createdAt: true,
        buyer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  return {
    paidOrders,
    posSales,
    deliveryReports,
    allocations,
    completedDossiers,
    buyerReports,
    pendingFundRequests,
    deliveredCashOrders,
    inTransitNotes,
    pendingAllocationConfirmations,
  };
}

function buildTimeline(
  days: number,
  startDate: Date,
  data: DashboardPeriodData
) {
  const labels = Array.from({ length: days }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return {
      key: date.toISOString().slice(0, 10),
      label: formatDayLabel(date),
      inflows: 0,
      outflows: 0,
      net: 0,
    };
  });

  const byKey = new Map(labels.map((entry) => [entry.key, entry]));

  for (const order of data.paidOrders) {
    const key = order.createdAt.toISOString().slice(0, 10);
    const day = byKey.get(key);
    if (day) day.inflows += toNumber(order.totalAmount);
  }

  for (const sale of data.posSales) {
    if (sale.documentType === 'PROFORMA') continue;
    const key = sale.createdAt.toISOString().slice(0, 10);
    const day = byKey.get(key);
    if (day) day.inflows += toNumber(sale.totalAmount);
  }

  for (const allocation of data.allocations) {
    const key = allocation.createdAt.toISOString().slice(0, 10);
    const day = byKey.get(key);
    if (day) day.outflows += toNumber(allocation.amountAllocated);
  }

  for (const dossier of data.completedDossiers) {
    const key = dossier.updatedAt.toISOString().slice(0, 10);
    const day = byKey.get(key);
    if (day) day.outflows += toNumber(dossier.disbursementTotal);
  }

  for (const report of data.deliveryReports) {
    const key = report.createdAt.toISOString().slice(0, 10);
    const day = byKey.get(key);
    if (day) day.outflows += toNumber(report.fieldExpenses);
  }

  return labels.map((entry) => ({
    ...entry,
    net: entry.inflows - entry.outflows,
  }));
}

function buildAlerts(current: ReturnType<typeof buildOverview>, previous: ReturnType<typeof buildOverview>) {
  const alerts: Array<{ level: 'info' | 'warning' | 'success'; title: string; message: string }> = [];

  const revenueDelta = computeDelta(current.totalInflows, previous.totalInflows);
  const expenseDelta = computeDelta(current.totalOutflows, previous.totalOutflows);

  if (current.pendingCodAmount > 0) {
    alerts.push({
      level: 'warning',
      title: 'Encaissements cash à rapprocher',
      message: `${Math.round(current.pendingCodAmount).toLocaleString('fr-FR')} HTG restent à rapprocher sur des commandes livrées cash.`,
    });
  }

  if (current.pendingBuyerBalance > 0) {
    alerts.push({
      level: 'info',
      title: 'Avances acheteurs encore ouvertes',
      message: `${Math.round(current.pendingBuyerBalance).toLocaleString('fr-FR')} HTG restent à justifier côté acheteurs.`,
    });
  }

  if (current.pendingFundRequestsAmount > 0) {
    alerts.push({
      level: 'info',
      title: 'Demandes de fonds en attente',
      message: `${current.pendingFundRequestsCount} demande(s) de fonds attendent une décision comptable ou PDG.`,
    });
  }

  if (current.approvedDossierDisbursements > 0) {
    alerts.push({
      level: 'info',
      title: 'Décaissements dossiers validés',
      message: `${Math.round(current.approvedDossierDisbursements).toLocaleString('fr-FR')} HTG issus de dossiers approuvés impactent la trésorerie.`,
    });
  }

  if (revenueDelta.direction === 'up' && revenueDelta.percent >= 10) {
    alerts.push({
      level: 'success',
      title: 'Encaissements en hausse',
      message: `Les entrées progressent de ${revenueDelta.percent.toFixed(1)}% sur la période.`,
    });
  }

  if (expenseDelta.direction === 'up' && expenseDelta.percent >= 15) {
    alerts.push({
      level: 'warning',
      title: 'Décaissements en hausse',
      message: `Les sorties montent de ${expenseDelta.percent.toFixed(1)}%. Vérifie les allocations et frais terrain.`,
    });
  }

  return alerts.slice(0, 5);
}

function buildOverview(data: DashboardPeriodData) {
  const totalOnlinePaid = data.paidOrders.reduce((sum, order) => sum + toNumber(order.totalAmount), 0);
  const totalPosSales = data.posSales
    .filter((sale) => sale.documentType !== 'PROFORMA')
    .reduce((sum, sale) => sum + toNumber(sale.totalAmount), 0);
  const deliveryCashCollected = data.deliveryReports.reduce((sum, report) => sum + toNumber(report.cashCollected), 0);
  const buyerAllocated = data.allocations.reduce((sum, allocation) => sum + toNumber(allocation.amountAllocated), 0);
  const approvedDossierDisbursements = data.completedDossiers.reduce(
    (sum, dossier) => sum + toNumber(dossier.disbursementTotal),
    0
  );
  const buyerSpent = data.buyerReports.reduce((sum, report) => sum + toNumber(report.totalSpent), 0);
  const buyerFees = data.buyerReports.reduce((sum, report) => sum + toNumber(report.totalFees), 0);
  const buyerReported = data.buyerReports.reduce((sum, report) => sum + toNumber(report.totalReported), 0);
  const deliveryFieldExpenses = data.deliveryReports.reduce((sum, report) => sum + toNumber(report.fieldExpenses), 0);
  const pendingFundRequestsAmount = data.pendingFundRequests.reduce((sum, request) => sum + toNumber(request.amountRequested), 0);
  const pendingCodAmount = data.deliveredCashOrders.reduce((sum, order) => sum + toNumber(order.totalAmount), 0);
  const pendingBuyerBalance = data.buyerReports.reduce((sum, report) => sum + toNumber(report.remainingAmount), 0);
  const totalInflows = totalOnlinePaid + totalPosSales + deliveryCashCollected;
  const totalOutflows = buyerAllocated + approvedDossierDisbursements + deliveryFieldExpenses;

  return {
    totalInflows,
    totalOutflows,
    netTreasury: totalInflows - totalOutflows,
    totalOnlinePaid,
    totalPosSales,
    deliveryCashCollected,
    buyerAllocated,
    approvedDossierDisbursements,
    buyerSpent,
    buyerFees,
    buyerReported,
    deliveryFieldExpenses,
    pendingFundRequestsAmount,
    pendingFundRequestsCount: data.pendingFundRequests.length,
    pendingCodAmount,
    pendingBuyerBalance,
    pendingAllocationConfirmations: data.pendingAllocationConfirmations.length,
    inTransitDeliveryNotes: data.inTransitNotes.length,
  };
}

function buildMethodBreakdowns(data: DashboardPeriodData) {
  const inflows = new Map<string, number>();
  const outflows = new Map<string, number>();

  for (const order of data.paidOrders) {
    pushMethodAmount(inflows, order.paymentMethod, toNumber(order.totalAmount));
  }

  for (const sale of data.posSales) {
    if (sale.documentType === 'PROFORMA') continue;
    pushMethodAmount(inflows, sale.paymentMethod, toNumber(sale.totalAmount));
  }

  for (const report of data.deliveryReports) {
    pushMethodAmount(inflows, report.cashCollectionMethod, toNumber(report.cashCollected));
    pushMethodAmount(outflows, report.fieldExpensesMethod, toNumber(report.fieldExpenses));
  }

  for (const allocation of data.allocations) {
    pushMethodAmount(outflows, allocation.disbursementMethod, toNumber(allocation.amountAllocated));
  }

  for (const dossier of data.completedDossiers) {
    pushMethodAmount(outflows, dossier.disbursementMethod, toNumber(dossier.disbursementTotal));
  }

  return {
    inflows: toMethodRows(inflows),
    outflows: toMethodRows(outflows),
  };
}

function escapeCsv(value: string | number | null | undefined) {
  const stringValue = String(value ?? '');
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export async function getAccountingDashboard(range: string = '30d', startDateParam?: string, endDateParam?: string) {
  const { normalizedRange, days, startDate, endDate } = getReportWindow(range, startDateParam, endDateParam);

  const previousPeriodEnd = new Date(startDate);
  previousPeriodEnd.setMilliseconds(previousPeriodEnd.getMilliseconds() - 1);
  const previousPeriodStart = new Date(previousPeriodEnd);
  previousPeriodStart.setDate(previousPeriodStart.getDate() - (days - 1));
  previousPeriodStart.setHours(0, 0, 0, 0);

  const [currentData, previousData, globalOpenAllocations] = await Promise.all([
    loadAccountingPeriodData(startDate, endDate),
    loadAccountingPeriodData(previousPeriodStart, previousPeriodEnd),
    prisma.buyerAllocation.findMany({
      where: {
        status: { in: ['ACTIVE', 'PARTIALLY_REPORTED', 'PENDING_CONFIRMATION'] },
      },
      select: {
        amountAllocated: true,
        reports: {
          select: {
            totalReported: true,
          },
        },
      },
    }),
  ]);

  const overview = buildOverview(currentData);
  const previousOverview = buildOverview(previousData);
  const timeline = buildTimeline(days, startDate, currentData);
  const methodBreakdowns = buildMethodBreakdowns(currentData);

  const openAllocationBalance = globalOpenAllocations.reduce((sum, allocation) => {
    const reported = allocation.reports.reduce((reportSum, report) => reportSum + toNumber(report.totalReported), 0);
    return sum + Math.max(0, toNumber(allocation.amountAllocated) - reported);
  }, 0);

  const recentOperations = [
    ...currentData.paidOrders.slice(-4).map((order) => ({
      id: `order-${order.id}`,
      type: 'Encaissement online',
      label: order.orderNumber,
      counterparty: `${order.customer.firstName} ${order.customer.lastName}`,
      amount: toNumber(order.totalAmount),
      method: formatChannelLabel(order.paymentMethod),
      createdAt: order.createdAt.toISOString(),
    })),
    ...currentData.posSales.slice(-4).map((sale) => ({
      id: `pos-${sale.id}`,
      type: sale.documentType === 'PROFORMA' ? 'Proforma POS' : 'Vente POS',
      label: sale.saleNumber,
      counterparty: sale.customerName,
      amount: toNumber(sale.totalAmount),
      method: sale.documentType === 'PROFORMA' ? 'Document' : formatChannelLabel(sale.paymentMethod),
      createdAt: sale.createdAt.toISOString(),
    })),
    ...currentData.allocations.slice(-4).map((allocation) => ({
      id: `allocation-${allocation.id}`,
      type: 'Allocation acheteur',
      label: allocation.title,
      counterparty: `${allocation.buyer.firstName} ${allocation.buyer.lastName}`,
      amount: toNumber(allocation.amountAllocated),
      method: formatChannelLabel(allocation.disbursementMethod),
      createdAt: allocation.createdAt.toISOString(),
    })),
    ...currentData.completedDossiers.slice(-4).map((dossier) => ({
      id: `dossier-${dossier.id}`,
      type: 'Dossier approuvé',
      label: dossier.title,
      counterparty: `${dossier.author.firstName} ${dossier.author.lastName}`,
      amount: toNumber(dossier.disbursementTotal),
      method: formatChannelLabel(dossier.disbursementMethod),
      createdAt: dossier.updatedAt.toISOString(),
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  const recentClosures = await prisma.accountingPeriodClosure.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      rangeLabel: true,
      startDate: true,
      endDate: true,
      totalInflows: true,
      totalOutflows: true,
      netTreasury: true,
      note: true,
      closedById: true,
      createdAt: true,
    },
  });

  return {
    range: normalizedRange,
    period: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      label: `${startDate.toLocaleDateString('fr-HT')} - ${endDate.toLocaleDateString('fr-HT')}`,
    },
    overview,
    comparison: {
      inflows: computeDelta(overview.totalInflows, previousOverview.totalInflows),
      outflows: computeDelta(overview.totalOutflows, previousOverview.totalOutflows),
      netTreasury: computeDelta(overview.netTreasury, previousOverview.netTreasury),
      buyerAllocated: computeDelta(overview.buyerAllocated, previousOverview.buyerAllocated),
    },
    cashflow: timeline,
    collections: {
      online: overview.totalOnlinePaid,
      pos: overview.totalPosSales,
      deliveryCashCollected: overview.deliveryCashCollected,
      paidOrdersCount: currentData.paidOrders.length,
      completedPosSalesCount: currentData.posSales.filter((sale) => sale.documentType !== 'PROFORMA').length,
      byMethod: methodBreakdowns.inflows,
    },
    disbursements: {
      buyerAllocated: overview.buyerAllocated,
      approvedDossierDisbursements: overview.approvedDossierDisbursements,
      buyerSpent: overview.buyerSpent,
      buyerFees: overview.buyerFees,
      buyerReported: overview.buyerReported,
      deliveryFieldExpenses: overview.deliveryFieldExpenses,
      pendingFundRequestsAmount: overview.pendingFundRequestsAmount,
      pendingFundRequestsCount: overview.pendingFundRequestsCount,
      byMethod: methodBreakdowns.outflows,
    },
    reconciliation: {
      pendingCodCount: currentData.deliveredCashOrders.length,
      pendingCodAmount: overview.pendingCodAmount,
      inTransitDeliveryNotes: overview.inTransitDeliveryNotes,
      pendingAllocationConfirmations: overview.pendingAllocationConfirmations,
      openAllocationBalance,
    },
    alerts: buildAlerts(overview, previousOverview),
    recentOperations,
    pendingCashOrders: currentData.deliveredCashOrders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customer: `${order.customer.firstName} ${order.customer.lastName}`,
      amount: toNumber(order.totalAmount),
      deliveredAt: order.deliveredAt?.toISOString() || null,
    })),
    pendingFundRequests: currentData.pendingFundRequests.map((request) => ({
      id: request.id,
      title: request.title,
      buyer: `${request.buyer.firstName} ${request.buyer.lastName}`,
      amountRequested: toNumber(request.amountRequested),
      createdAt: request.createdAt.toISOString(),
    })),
    pendingBuyerReports: currentData.buyerReports
      .filter((report) => !report.accountingValidatedAt)
      .slice(-10)
      .reverse()
      .map((report) => ({
        id: report.id,
        title: report.allocation.title,
        buyer: `${report.buyer.firstName} ${report.buyer.lastName}`,
        amount: toNumber(report.totalReported),
        createdAt: report.createdAt.toISOString(),
      })),
    pendingDeliveryExpenses: currentData.deliveryReports
      .filter((report) => toNumber(report.fieldExpenses) > 0 && !report.accountingValidatedAt)
      .slice(-10)
      .reverse()
      .map((report) => ({
        id: report.id,
        title: report.title,
        deliveryAgent: `${report.deliveryAgent.firstName} ${report.deliveryAgent.lastName}`,
        amount: toNumber(report.fieldExpenses),
        method: formatChannelLabel(report.fieldExpensesMethod),
        createdAt: report.createdAt.toISOString(),
      })),
    pendingDossierExecutions: currentData.completedDossiers
      .filter((dossier) => !dossier.accountingExecutedAt)
      .slice(-10)
      .reverse()
      .map((dossier) => ({
        id: dossier.id,
        title: dossier.title,
        amount: toNumber(dossier.disbursementTotal),
        method: formatChannelLabel(dossier.disbursementMethod),
        createdAt: dossier.updatedAt.toISOString(),
      })),
    recentClosures: recentClosures.map((closure) => ({
      id: closure.id,
      rangeLabel: closure.rangeLabel,
      startDate: closure.startDate.toISOString(),
      endDate: closure.endDate.toISOString(),
      totalInflows: toNumber(closure.totalInflows),
      totalOutflows: toNumber(closure.totalOutflows),
      netTreasury: toNumber(closure.netTreasury),
      note: closure.note,
      closedById: closure.closedById,
      createdAt: closure.createdAt.toISOString(),
    })),
  };
}

export async function reconcileCashOrder(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      paymentMethod: true,
      paymentStatus: true,
      status: true,
      totalAmount: true,
      orderNumber: true,
      cashReconciledAt: true,
    },
  });

  if (!order) throw createError('Commande introuvable', 404);
  if (order.paymentMethod !== 'CASH') throw createError('Seules les commandes cash peuvent être rapprochées ici', 400);
  if (order.status !== 'DELIVERED') throw createError('La commande doit être livrée avant rapprochement', 400);
  if (order.cashReconciledAt || order.paymentStatus === 'PAID') throw createError('Cette commande est déjà rapprochée', 400);

  return prisma.order.update({
    where: { id: orderId },
    data: {
      paymentStatus: 'PAID',
      cashReconciledAt: new Date(),
      cashReconciledById: userId,
    },
    select: {
      id: true,
      orderNumber: true,
      totalAmount: true,
      paymentStatus: true,
      cashReconciledAt: true,
    },
  });
}

export async function validateOutflow(userId: string, payload: { type: 'BUYER_REPORT' | 'DELIVERY_REPORT'; id: string }) {
  if (payload.type === 'BUYER_REPORT') {
    const report = await prisma.buyerExpenseReport.findUnique({
      where: { id: payload.id },
      select: { id: true, accountingValidatedAt: true, totalReported: true },
    });
    if (!report) throw createError('Rapport acheteur introuvable', 404);
    if (report.accountingValidatedAt) throw createError('Cette sortie a déjà été validée', 400);

    return prisma.buyerExpenseReport.update({
      where: { id: payload.id },
      data: {
        accountingValidatedAt: new Date(),
        accountingValidatedById: userId,
      },
      select: { id: true, accountingValidatedAt: true, totalReported: true },
    });
  }

  const report = await prisma.deliveryAgentReport.findUnique({
    where: { id: payload.id },
    select: { id: true, accountingValidatedAt: true, fieldExpenses: true },
  });
  if (!report) throw createError('Rapport livreur introuvable', 404);
  if (report.accountingValidatedAt) throw createError('Cette sortie a déjà été validée', 400);

  return prisma.deliveryAgentReport.update({
    where: { id: payload.id },
    data: {
      accountingValidatedAt: new Date(),
      accountingValidatedById: userId,
    },
    select: { id: true, accountingValidatedAt: true, fieldExpenses: true },
  });
}

export async function markDossierExecuted(dossierId: string, userId: string) {
  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    select: {
      id: true,
      status: true,
      accountingExecutedAt: true,
      disbursementTotal: true,
      title: true,
    },
  });

  if (!dossier) throw createError('Dossier introuvable', 404);
  if (dossier.status !== 'COMPLETED') throw createError('Seuls les dossiers approuvés peuvent être pointés comme exécutés', 400);
  if (dossier.accountingExecutedAt) throw createError('Ce dossier est déjà pointé comme exécuté', 400);

  return prisma.dossier.update({
    where: { id: dossierId },
    data: {
      accountingExecutedAt: new Date(),
      accountingExecutedById: userId,
    },
    select: {
      id: true,
      title: true,
      accountingExecutedAt: true,
      disbursementTotal: true,
    },
  });
}

export async function closeAccountingPeriod(userId: string, range: string, startDate?: string, endDate?: string, note?: string) {
  const dashboard = await getAccountingDashboard(range, startDate, endDate);

  return prisma.accountingPeriodClosure.create({
    data: {
      rangeLabel: dashboard.period.label,
      startDate: new Date(dashboard.period.startDate),
      endDate: new Date(dashboard.period.endDate),
      totalInflows: dashboard.overview.totalInflows,
      totalOutflows: dashboard.overview.totalOutflows,
      netTreasury: dashboard.overview.netTreasury,
      note: note?.trim() || null,
      closedById: userId,
    },
  });
}

export async function exportAccountingJournal(range: string, startDate?: string, endDate?: string) {
  const dashboard = await getAccountingDashboard(range, startDate, endDate);
  const rows = [
    ['Date', 'Sens', 'Type', 'Libellé', 'Contrepartie', 'Moyen', 'Montant HTG'],
    ...dashboard.recentOperations.map((operation) => [
      new Date(operation.createdAt).toISOString(),
      ['Allocation acheteur', 'Dossier approuvé'].includes(operation.type) ? 'SORTIE' : 'ENTREE',
      operation.type,
      operation.label,
      operation.counterparty,
      operation.method,
      operation.amount.toFixed(2),
    ]),
  ];

  return rows.map((row) => row.map((cell) => escapeCsv(cell)).join(',')).join('\n');
}
