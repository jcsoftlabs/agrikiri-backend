import { BuyerAllocationStatus, BuyerFundRequestStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { createError } from '../../middleware/error.middleware';
import { CreateBuyerAllocationInput, CreateBuyerExpenseReportInput, CreateBuyerFundRequestInput } from './buyers.schema';

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

const buyerPersonSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
} as const;

const dossierBudgetSelect = {
  id: true,
  title: true,
  status: true,
  disbursementTotal: true,
  disbursementMethod: true,
  accountingExecutedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const buyerAllocationInclude = {
  buyer: { select: buyerPersonSelect },
  allocatedBy: { select: buyerPersonSelect },
  sourceDossier: { select: dossierBudgetSelect },
  reports: {
    include: {
      lines: {
        orderBy: { sortOrder: 'asc' as const },
      },
    },
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

const buyerFundRequestInclude = {
  buyer: { select: buyerPersonSelect },
  reviewedBy: { select: buyerPersonSelect },
} as const;

function serializeReport(report: any) {
  return {
    ...report,
    totalSpent: toNumber(report.totalSpent),
    totalFees: toNumber(report.totalFees),
    totalReported: toNumber(report.totalReported),
    remainingAmount: toNumber(report.remainingAmount),
    lines: report.lines.map((line: any) => ({
      ...line,
      quantity: toNumber(line.quantity),
      unitPrice: toNumber(line.unitPrice),
      fees: toNumber(line.fees),
      lineAmount: toNumber(line.lineAmount),
    })),
  };
}

function serializeAllocation(allocation: any) {
  const reports = allocation.reports.map(serializeReport);
  const totalSpent = reports.reduce((sum: number, report: any) => sum + report.totalSpent, 0);
  const totalFees = reports.reduce((sum: number, report: any) => sum + report.totalFees, 0);
  const totalReported = reports.reduce((sum: number, report: any) => sum + report.totalReported, 0);
  const amountAllocated = toNumber(allocation.amountAllocated);
  const remainingAmount = roundMoney(Math.max(0, amountAllocated - totalReported));

  return {
    ...allocation,
    amountAllocated,
    totalSpent,
    totalFees,
    totalReported,
    remainingAmount,
    sourceDossier: allocation.sourceDossier
      ? {
          ...allocation.sourceDossier,
          disbursementTotal: toNumber(allocation.sourceDossier.disbursementTotal),
        }
      : null,
    reports,
  };
}

function serializeFundRequest(request: any) {
  return {
    ...request,
    amountRequested: toNumber(request.amountRequested),
  };
}

function buildOverview(allocations: any[]) {
  const totalAllocated = allocations.reduce((sum, allocation) => sum + allocation.amountAllocated, 0);
  const totalSpent = allocations.reduce((sum, allocation) => sum + allocation.totalSpent, 0);
  const totalFees = allocations.reduce((sum, allocation) => sum + allocation.totalFees, 0);
  const totalReported = allocations.reduce((sum, allocation) => sum + allocation.totalReported, 0);
  const totalRemaining = allocations.reduce((sum, allocation) => sum + allocation.remainingAmount, 0);

  return {
    totalAllocated: roundMoney(totalAllocated),
    totalSpent: roundMoney(totalSpent),
    totalFees: roundMoney(totalFees),
    totalReported: roundMoney(totalReported),
    totalRemaining: roundMoney(totalRemaining),
    pendingConfirmations: allocations.filter((allocation) => allocation.status === 'PENDING_CONFIRMATION').length,
    activeAllocations: allocations.filter((allocation) =>
      allocation.status === 'ACTIVE' || allocation.status === 'PARTIALLY_REPORTED'
    ).length,
    reportedAllocations: allocations.filter((allocation) => allocation.status === 'REPORTED').length,
  };
}

function serializeApprovedBudget(dossier: any) {
  const approvedAmount = toNumber(dossier.disbursementTotal);
  const allocatedAmount = roundMoney(
    dossier.buyerAllocations.reduce((sum: number, allocation: any) => sum + toNumber(allocation.amountAllocated), 0)
  );
  const remainingAmount = roundMoney(Math.max(0, approvedAmount - allocatedAmount));

  return {
    id: dossier.id,
    title: dossier.title,
    status: dossier.status,
    disbursementMethod: dossier.disbursementMethod,
    accountingExecutedAt: dossier.accountingExecutedAt,
    createdAt: dossier.createdAt,
    updatedAt: dossier.updatedAt,
    approvedAmount,
    allocatedAmount,
    remainingAmount,
    linkedAllocationsCount: dossier.buyerAllocations.length,
  };
}

export async function getBuyerOptions() {
  return prisma.user.findMany({
    where: {
      role: 'BUYER',
      isActive: true,
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: buyerPersonSelect,
  });
}

export async function createAllocation(allocatedById: string, data: CreateBuyerAllocationInput) {
  const buyer = await prisma.user.findFirst({
    where: {
      id: data.buyerId,
      role: 'BUYER',
      isActive: true,
    },
    select: { id: true },
  });

  if (!buyer) {
    throw createError('Cet acheteur est introuvable ou inactif', 404);
  }

  if (data.fundRequestId) {
    const request = await prisma.buyerFundRequest.findFirst({
      where: {
        id: data.fundRequestId,
        buyerId: data.buyerId,
      },
      select: { id: true, status: true },
    });

    if (!request) {
      throw createError('Demande de fonds introuvable pour cet acheteur', 404);
    }

    if (request.status !== BuyerFundRequestStatus.PENDING) {
      throw createError('Cette demande de fonds a déjà été traitée', 400);
    }
  }

  const allocation = await prisma.$transaction(async (tx) => {
    if (data.sourceDossierId) {
      const dossier = await tx.dossier.findFirst({
        where: {
          id: data.sourceDossierId,
          status: 'COMPLETED',
        },
        select: {
          id: true,
          title: true,
          disbursementTotal: true,
          buyerAllocations: {
            select: {
              amountAllocated: true,
            },
          },
        },
      });

      if (!dossier) {
        throw createError('Le dossier source est introuvable ou pas encore approuvé', 404);
      }

      const alreadyAllocated = dossier.buyerAllocations.reduce(
        (sum, allocation) => sum + toNumber(allocation.amountAllocated),
        0
      );
      const approvedAmount = toNumber(dossier.disbursementTotal);
      const remainingBudget = roundMoney(Math.max(0, approvedAmount - alreadyAllocated));

      if (roundMoney(data.amountAllocated) > remainingBudget + 0.001) {
        throw createError(
          `Cette allocation dépasse l’enveloppe restante du dossier (${remainingBudget.toLocaleString('fr-FR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} HTG).`,
          400
        );
      }
    }

    const created = await tx.buyerAllocation.create({
      data: {
        buyerId: data.buyerId,
        allocatedById,
        sourceDossierId: data.sourceDossierId || null,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        amountAllocated: new Prisma.Decimal(roundMoney(data.amountAllocated).toFixed(2)),
        disbursementMethod: data.disbursementMethod,
      },
      include: buyerAllocationInclude,
    });

    if (data.fundRequestId) {
      await tx.buyerFundRequest.update({
        where: { id: data.fundRequestId },
        data: {
          status: BuyerFundRequestStatus.FULFILLED,
          reviewedById: allocatedById,
          reviewedAt: new Date(),
          reviewNote: 'Demande couverte par une allocation envoyée.',
        },
      });
    }

    return created;
  });

  return serializeAllocation(allocation);
}

export async function createFundRequest(buyerId: string, data: CreateBuyerFundRequestInput) {
  const buyer = await prisma.user.findFirst({
    where: { id: buyerId, role: 'BUYER', isActive: true },
    select: { id: true },
  });

  if (!buyer) {
    throw createError('Acheteur introuvable', 404);
  }

  const request = await prisma.buyerFundRequest.create({
    data: {
      buyerId,
      title: data.title.trim(),
      justification: data.justification.trim(),
      amountRequested: new Prisma.Decimal(roundMoney(data.amountRequested).toFixed(2)),
    },
    include: buyerFundRequestInclude,
  });

  return serializeFundRequest(request);
}

export async function getBoardOverview() {
  const [buyers, allocations, fundRequests, approvedBudgets] = await Promise.all([
    getBuyerOptions(),
    prisma.buyerAllocation.findMany({
      include: buyerAllocationInclude,
      orderBy: [{ createdAt: 'desc' }],
    }),
    prisma.buyerFundRequest.findMany({
      include: buyerFundRequestInclude,
      orderBy: [{ createdAt: 'desc' }],
    }),
    prisma.dossier.findMany({
      where: {
        status: 'COMPLETED',
      },
      select: {
        ...dossierBudgetSelect,
        buyerAllocations: {
          select: {
            id: true,
            amountAllocated: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
    }),
  ]);

  const serializedAllocations = allocations.map(serializeAllocation);
  const serializedRequests = fundRequests.map(serializeFundRequest);
  const serializedBudgets = approvedBudgets.map(serializeApprovedBudget);
  const approvedBudgetTotal = serializedBudgets.reduce((sum, dossier) => sum + dossier.approvedAmount, 0);
  const approvedBudgetAllocated = serializedBudgets.reduce((sum, dossier) => sum + dossier.allocatedAmount, 0);
  const approvedBudgetRemaining = serializedBudgets.reduce((sum, dossier) => sum + dossier.remainingAmount, 0);

  return {
    buyers,
    overview: {
      ...buildOverview(serializedAllocations),
      totalBuyers: buyers.length,
      pendingRequests: serializedRequests.filter((request) => request.status === 'PENDING').length,
      approvedBudgetTotal: roundMoney(approvedBudgetTotal),
      approvedBudgetAllocated: roundMoney(approvedBudgetAllocated),
      approvedBudgetRemaining: roundMoney(approvedBudgetRemaining),
    },
    allocations: serializedAllocations,
    fundRequests: serializedRequests,
    approvedBudgets: serializedBudgets,
  };
}

export async function getBuyerDashboard(buyerId: string) {
  const [buyer, allocations, fundRequests] = await Promise.all([
    prisma.user.findFirst({
      where: {
        id: buyerId,
        role: 'BUYER',
        isActive: true,
      },
      select: buyerPersonSelect,
    }),
    prisma.buyerAllocation.findMany({
      where: { buyerId },
      include: buyerAllocationInclude,
      orderBy: [{ createdAt: 'desc' }],
    }),
    prisma.buyerFundRequest.findMany({
      where: { buyerId },
      include: buyerFundRequestInclude,
      orderBy: [{ createdAt: 'desc' }],
    }),
  ]);

  if (!buyer) {
    throw createError('Acheteur introuvable', 404);
  }

  const serializedAllocations = allocations.map(serializeAllocation);

  return {
    buyer,
    overview: buildOverview(serializedAllocations),
    allocations: serializedAllocations,
    fundRequests: fundRequests.map(serializeFundRequest),
  };
}

export async function confirmAllocationReceipt(allocationId: string, buyerId: string) {
  const allocation = await prisma.buyerAllocation.findFirst({
    where: {
      id: allocationId,
      buyerId,
    },
    include: buyerAllocationInclude,
  });

  if (!allocation) {
    throw createError('Allocation introuvable', 404);
  }

  if (allocation.status !== BuyerAllocationStatus.PENDING_CONFIRMATION) {
    throw createError('Cette allocation a déjà été confirmée', 400);
  }

  const updated = await prisma.buyerAllocation.update({
    where: { id: allocationId },
    data: {
      status: BuyerAllocationStatus.ACTIVE,
      receivedConfirmedAt: new Date(),
    },
    include: buyerAllocationInclude,
  });

  return serializeAllocation(updated);
}

export async function createExpenseReport(
  allocationId: string,
  buyerId: string,
  data: CreateBuyerExpenseReportInput
) {
  const allocation = await prisma.buyerAllocation.findFirst({
    where: {
      id: allocationId,
      buyerId,
    },
    include: {
      reports: true,
    },
  });

  if (!allocation) {
    throw createError('Allocation introuvable', 404);
  }

  if (allocation.status === BuyerAllocationStatus.PENDING_CONFIRMATION) {
    throw createError('Confirmez d’abord la réception du montant', 400);
  }

  if (allocation.status === BuyerAllocationStatus.REPORTED) {
    throw createError('Cette allocation a déjà été totalement justifiée', 400);
  }

  const alreadyReported = allocation.reports.reduce((sum, report) => sum + toNumber(report.totalReported), 0);
  const availableBeforeReport = roundMoney(Math.max(0, toNumber(allocation.amountAllocated) - alreadyReported));

  const normalizedLines = data.lines.map((line, index) => {
    const quantity = roundMoney(line.quantity);
    const unitPrice = roundMoney(line.unitPrice);
    const fees = roundMoney(line.fees ?? 0);
    const lineAmount = roundMoney(quantity * unitPrice + fees);

    return {
      sortOrder: index,
      description: line.description.trim(),
      quantity,
      unitPrice,
      fees,
      lineAmount,
    };
  });

  const totalSpent = roundMoney(normalizedLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0));
  const totalFees = roundMoney(normalizedLines.reduce((sum, line) => sum + line.fees, 0));
  const totalReported = roundMoney(normalizedLines.reduce((sum, line) => sum + line.lineAmount, 0));

  if (totalReported > availableBeforeReport + 0.001) {
    throw createError('Le rapport dépasse le montant encore disponible pour cet acheteur', 400);
  }

  const remainingAmount = roundMoney(Math.max(0, availableBeforeReport - totalReported));
  const nextStatus =
    remainingAmount <= 0 ? BuyerAllocationStatus.REPORTED : BuyerAllocationStatus.PARTIALLY_REPORTED;

  const report = await prisma.$transaction(async (tx) => {
    const createdReport = await tx.buyerExpenseReport.create({
      data: {
        allocationId,
        buyerId,
        summary: data.summary?.trim() || null,
        totalSpent: new Prisma.Decimal(totalSpent.toFixed(2)),
        totalFees: new Prisma.Decimal(totalFees.toFixed(2)),
        totalReported: new Prisma.Decimal(totalReported.toFixed(2)),
        remainingAmount: new Prisma.Decimal(remainingAmount.toFixed(2)),
        lines: {
          create: normalizedLines.map((line) => ({
            sortOrder: line.sortOrder,
            description: line.description,
            quantity: new Prisma.Decimal(line.quantity.toFixed(2)),
            unitPrice: new Prisma.Decimal(line.unitPrice.toFixed(2)),
            fees: new Prisma.Decimal(line.fees.toFixed(2)),
            lineAmount: new Prisma.Decimal(line.lineAmount.toFixed(2)),
          })),
        },
      },
      include: {
        lines: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    await tx.buyerAllocation.update({
      where: { id: allocationId },
      data: { status: nextStatus },
    });

    return createdReport;
  });

  return serializeReport(report);
}

export async function declineFundRequest(requestId: string, reviewerId: string, reviewNote?: string) {
  const request = await prisma.buyerFundRequest.findUnique({
    where: { id: requestId },
    include: buyerFundRequestInclude,
  });

  if (!request) {
    throw createError('Demande de fonds introuvable', 404);
  }

  if (request.status !== BuyerFundRequestStatus.PENDING) {
    throw createError('Cette demande a déjà été traitée', 400);
  }

  const updated = await prisma.buyerFundRequest.update({
    where: { id: requestId },
    data: {
      status: BuyerFundRequestStatus.DECLINED,
      reviewedById: reviewerId,
      reviewedAt: new Date(),
      reviewNote: reviewNote?.trim() || null,
    },
    include: buyerFundRequestInclude,
  });

  return serializeFundRequest(updated);
}
