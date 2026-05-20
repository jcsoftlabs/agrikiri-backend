import { prisma } from '../../config/database';

const REPORT_RANGES = ['7d', '30d', '90d'] as const;

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

type DashboardPeriodData = Awaited<ReturnType<typeof loadAccountingPeriodData>>;

async function loadAccountingPeriodData(startDate: Date, endDate: Date) {
  const rangeWhere = { gte: startDate, lte: endDate };

  const [
    paidOrders,
    posSales,
    deliveryReports,
    allocations,
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
        fieldExpenses: true,
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
        status: true,
        createdAt: true,
        buyer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.buyerExpenseReport.findMany({
      where: { createdAt: rangeWhere },
      select: {
        id: true,
        totalSpent: true,
        totalFees: true,
        totalReported: true,
        remainingAmount: true,
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
  const buyerSpent = data.buyerReports.reduce((sum, report) => sum + toNumber(report.totalSpent), 0);
  const buyerFees = data.buyerReports.reduce((sum, report) => sum + toNumber(report.totalFees), 0);
  const buyerReported = data.buyerReports.reduce((sum, report) => sum + toNumber(report.totalReported), 0);
  const deliveryFieldExpenses = data.deliveryReports.reduce((sum, report) => sum + toNumber(report.fieldExpenses), 0);
  const pendingFundRequestsAmount = data.pendingFundRequests.reduce((sum, request) => sum + toNumber(request.amountRequested), 0);
  const pendingCodAmount = data.deliveredCashOrders.reduce((sum, order) => sum + toNumber(order.totalAmount), 0);
  const pendingBuyerBalance = data.buyerReports.reduce((sum, report) => sum + toNumber(report.remainingAmount), 0);
  const totalInflows = totalOnlinePaid + totalPosSales + deliveryCashCollected;
  const totalOutflows = buyerAllocated + deliveryFieldExpenses;

  return {
    totalInflows,
    totalOutflows,
    netTreasury: totalInflows - totalOutflows,
    totalOnlinePaid,
    totalPosSales,
    deliveryCashCollected,
    buyerAllocated,
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
      createdAt: order.createdAt.toISOString(),
    })),
    ...currentData.posSales.slice(-4).map((sale) => ({
      id: `pos-${sale.id}`,
      type: sale.documentType === 'PROFORMA' ? 'Proforma POS' : 'Vente POS',
      label: sale.saleNumber,
      counterparty: sale.customerName,
      amount: toNumber(sale.totalAmount),
      createdAt: sale.createdAt.toISOString(),
    })),
    ...currentData.allocations.slice(-4).map((allocation) => ({
      id: `allocation-${allocation.id}`,
      type: 'Allocation acheteur',
      label: allocation.title,
      counterparty: `${allocation.buyer.firstName} ${allocation.buyer.lastName}`,
      amount: toNumber(allocation.amountAllocated),
      createdAt: allocation.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

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
    },
    disbursements: {
      buyerAllocated: overview.buyerAllocated,
      buyerSpent: overview.buyerSpent,
      buyerFees: overview.buyerFees,
      buyerReported: overview.buyerReported,
      deliveryFieldExpenses: overview.deliveryFieldExpenses,
      pendingFundRequestsAmount: overview.pendingFundRequestsAmount,
      pendingFundRequestsCount: overview.pendingFundRequestsCount,
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
  };
}
