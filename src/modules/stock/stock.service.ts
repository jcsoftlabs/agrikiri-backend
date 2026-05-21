import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { createError } from '../../middleware/error.middleware';
import type { AuthRequest } from '../../middleware/auth.middleware';
import { updateOrderTracking } from '../orders/orders.service';
import {
  AssignOrderDeliveryInput,
  CreateBuyerStockShipmentInput,
  CreateStockManagerReportInput,
  UpdateStockQuantityInput,
} from './stock.schema';

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function serializeShipment(shipment: any) {
  return {
    ...shipment,
    totalWeightLbs: toNumber(shipment.totalWeightLbs),
    items: Array.isArray(shipment.items) ? shipment.items : [],
  };
}

function serializeReport(report: any) {
  return {
    ...report,
    buyerReceiptTotalWeightLbs: toNumber(report.buyerReceiptTotalWeightLbs),
    stockOutputTotalWeightLbs: toNumber(report.stockOutputTotalWeightLbs),
    buyerReceiptItems: Array.isArray(report.buyerReceiptItems) ? report.buyerReceiptItems : [],
    stockOutputItems: Array.isArray(report.stockOutputItems) ? report.stockOutputItems : [],
    productionInputItems: Array.isArray(report.productionInputItems) ? report.productionInputItems : [],
    productionOrderOutputItems: Array.isArray(report.productionOrderOutputItems) ? report.productionOrderOutputItems : [],
  };
}

async function loadStockReport(reportId: string) {
  const report = await prisma.stockManagerReport.findUnique({
    where: { id: reportId },
    include: {
      stockManager: { select: { id: true, firstName: true, lastName: true, email: true } },
      linkedShipments: {
        select: {
          id: true,
          title: true,
          buyer: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  if (!report) {
    throw createError('Rapport stock introuvable.', 404);
  }

  return serializeReport(report);
}

async function resolveInventoryLine(
  tx: Prisma.TransactionClient,
  productId: string,
  productVariantId?: string
) {
  const product = await tx.product.findUnique({
    where: { id: productId },
    include: {
      variants: {
        where: productVariantId ? { id: productVariantId } : undefined,
      },
    },
  });

  if (!product) {
    throw createError('Produit introuvable.', 404);
  }

  if (productVariantId) {
    const variant = product.variants.find((entry) => entry.id === productVariantId);
    if (!variant) {
      throw createError('Variante introuvable pour ce produit.', 404);
    }

    return {
      product,
      variant,
      description: `${product.name} (${variant.label})`,
      unitWeightLbs: toNumber(variant.weightLbs),
      currentStock: variant.stockQuantity,
    };
  }

  return {
    product,
    variant: null,
    description: product.name,
    unitWeightLbs: toNumber(product.weightLbs),
    currentStock: product.stockQuantity,
  };
}

async function syncProductStockFromVariants(tx: Prisma.TransactionClient, productId: string) {
  const variants = await tx.productVariant.findMany({
    where: { productId, isActive: true },
    select: { stockQuantity: true },
  });

  const aggregated = variants.reduce((sum, variant) => sum + variant.stockQuantity, 0);
  await tx.product.update({
    where: { id: productId },
    data: { stockQuantity: aggregated },
  });
}

async function applyStockDelta(
  tx: Prisma.TransactionClient,
  params: { productId: string; productVariantId?: string; quantity: number; mode: 'increment' | 'decrement' | 'set' }
) {
  const line = await resolveInventoryLine(tx, params.productId, params.productVariantId);

  if (params.mode === 'set') {
    if (line.variant) {
      await tx.productVariant.update({
        where: { id: line.variant.id },
        data: { stockQuantity: params.quantity },
      });
      await syncProductStockFromVariants(tx, line.product.id);
    } else {
      await tx.product.update({
        where: { id: line.product.id },
        data: { stockQuantity: params.quantity },
      });
    }
    return;
  }

  if (params.mode === 'decrement' && line.currentStock < params.quantity) {
    throw createError(`Stock insuffisant pour "${line.description}". Disponible: ${line.currentStock}`, 400);
  }

  if (line.variant) {
    await tx.productVariant.update({
      where: { id: line.variant.id },
      data: {
        stockQuantity:
          params.mode === 'increment'
            ? { increment: params.quantity }
            : { decrement: params.quantity },
      },
    });
    await syncProductStockFromVariants(tx, line.product.id);
  } else {
    await tx.product.update({
      where: { id: line.product.id },
      data: {
        stockQuantity:
          params.mode === 'increment'
            ? { increment: params.quantity }
            : { decrement: params.quantity },
      },
    });
  }
}

async function buildPersistedLine(
  tx: Prisma.TransactionClient,
  item: { productId: string; productVariantId?: string; quantity: number }
) {
  const line = await resolveInventoryLine(tx, item.productId, item.productVariantId);
  const lineWeightLbs = roundMoney(line.unitWeightLbs * item.quantity);

  return {
    productId: item.productId,
    productVariantId: item.productVariantId || null,
    description: line.description,
    quantity: item.quantity,
    unitWeightLbs: line.unitWeightLbs,
    lineWeightLbs,
  };
}

async function listDeliveryAgents() {
  return prisma.user.findMany({
    where: { role: 'DELIVERY_AGENT', isActive: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
    },
  });
}

export async function getStockDashboard() {
  const [shipments, reports, deliveryAgents, orders, products] = await Promise.all([
    prisma.buyerStockShipment.findMany({
      include: {
        buyer: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        receivedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    }),
    prisma.stockManagerReport.findMany({
      include: {
        stockManager: { select: { id: true, firstName: true, lastName: true, email: true } },
        linkedShipments: {
          select: { id: true, title: true, buyer: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }],
      take: 12,
    }),
    listDeliveryAgents(),
    prisma.order.findMany({
      where: {
        status: { in: ['PENDING', 'PROCESSING', 'SHIPPED'] },
      },
      include: {
        customer: { select: { firstName: true, lastName: true } },
        deliveryAgent: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
    prisma.product.findMany({
      where: { isActive: true },
      include: {
        category: { select: { id: true, name: true } },
        variants: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            label: true,
            stockQuantity: true,
            weightLbs: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  const serializedShipments = shipments.map(serializeShipment);
  const serializedReports = reports.map(serializeReport);

  return {
    overview: {
      pendingShipments: serializedShipments.filter((shipment) => shipment.status === 'PENDING_RECEIPT').length,
      receivedShipments: serializedShipments.filter((shipment) => shipment.status === 'RECEIVED').length,
      lowStockProducts: products.filter((product) => Number(product.stockQuantity) <= 5).length,
      assignableOrders: orders.filter((order) => !order.deliveryAgentId).length,
    },
    shipments: serializedShipments,
    reports: serializedReports,
    deliveryAgents,
    orders: orders.map((order) => ({
      ...order,
      subtotalAmount: toNumber(order.subtotalAmount),
      deliveryFee: toNumber(order.deliveryFee),
      totalAmount: toNumber(order.totalAmount),
    })),
    products: products.map((product) => ({
      ...product,
      price: toNumber(product.price),
      weightLbs: toNumber(product.weightLbs),
      variants: product.variants.map((variant) => ({
        ...variant,
        weightLbs: toNumber(variant.weightLbs),
      })),
    })),
  };
}

export async function createBuyerStockShipment(buyerId: string, data: CreateBuyerStockShipmentInput) {
  const shipment = await prisma.$transaction(async (tx) => {
    const lines = [];
    let totalQuantity = 0;
    let totalWeightLbs = 0;

    for (const item of data.items) {
      const line = await buildPersistedLine(tx, item);
      totalQuantity += line.quantity;
      totalWeightLbs += line.lineWeightLbs;
      lines.push(line);
    }

    return tx.buyerStockShipment.create({
      data: {
        buyerId,
        title: data.title.trim(),
        notes: data.notes?.trim() || null,
        items: lines as Prisma.InputJsonValue,
        totalQuantity,
        totalWeightLbs: new Prisma.Decimal(totalWeightLbs.toFixed(2)),
      },
      include: {
        buyer: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
      },
    });
  });

  return serializeShipment(shipment);
}

export async function getBuyerStockShipments(buyerId: string) {
  const shipments = await prisma.buyerStockShipment.findMany({
    where: { buyerId },
    include: {
      buyer: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
      receivedBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
  });

  return shipments.map(serializeShipment);
}

export async function confirmBuyerStockShipment(shipmentId: string, stockManagerId: string) {
  const shipment = await prisma.$transaction(async (tx) => {
    const shipmentRecord = await tx.buyerStockShipment.findUnique({
      where: { id: shipmentId },
      include: {
        buyer: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
      },
    });

    if (!shipmentRecord) {
      throw createError('Expédition introuvable.', 404);
    }

    if (shipmentRecord.status === 'RECEIVED') {
      return shipmentRecord;
    }

    const items = Array.isArray(shipmentRecord.items) ? shipmentRecord.items : [];
    for (const rawItem of items as any[]) {
      await applyStockDelta(tx, {
        productId: rawItem.productId,
        productVariantId: rawItem.productVariantId || undefined,
        quantity: Number(rawItem.quantity || 0),
        mode: 'increment',
      });
    }

    return tx.buyerStockShipment.update({
      where: { id: shipmentId },
      data: {
        status: 'RECEIVED',
        receivedAt: new Date(),
        receivedById: stockManagerId,
      },
      include: {
        buyer: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        receivedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  });

  return serializeShipment(shipment);
}

export async function updateStockQuantity(_stockManagerId: string, data: UpdateStockQuantityInput) {
  await prisma.$transaction(async (tx) => {
    await applyStockDelta(tx, {
      productId: data.productId,
      productVariantId: data.productVariantId,
      quantity: data.stockQuantity,
      mode: 'set',
    });
  });

  return { success: true };
}

export async function assignOrderToDelivery(orderId: string, data: AssignOrderDeliveryInput) {
  const deliveryAgent = await prisma.user.findFirst({
    where: {
      id: data.deliveryAgentId,
      role: 'DELIVERY_AGENT',
      isActive: true,
    },
    select: { id: true, firstName: true, lastName: true, phone: true },
  });

  if (!deliveryAgent) {
    throw createError('Livreur introuvable.', 404);
  }

  return updateOrderTracking(orderId, {
    deliveryMode: 'INTERNAL',
    deliveryAgentId: deliveryAgent.id,
    deliveryAgentName: `${deliveryAgent.firstName} ${deliveryAgent.lastName}`.trim(),
    deliveryAgentPhone: deliveryAgent.phone || '',
    deliveryZone: data.deliveryZone,
    estimatedDeliveryDate: data.estimatedDeliveryDate,
    eventTitle: 'Commande assignée par le gestionnaire de stock',
    eventDescription: `Commande assignée à ${deliveryAgent.firstName} ${deliveryAgent.lastName}.`,
    eventStatus: 'PROCESSING',
    isCustomerVisible: false,
  });
}

export async function createStockManagerReport(stockManagerId: string, data: CreateStockManagerReportInput) {
  const report = await prisma.$transaction(async (tx) => {
    const receivedShipments = data.buyerShipmentIds.length
      ? await tx.buyerStockShipment.findMany({
          where: {
            id: { in: data.buyerShipmentIds },
            status: 'RECEIVED',
            reportedInStockReportId: null,
          },
          include: {
            buyer: { select: { id: true, firstName: true, lastName: true } },
          },
        })
      : [];

    if (receivedShipments.length !== data.buyerShipmentIds.length) {
      throw createError('Certaines expéditions reçues sont introuvables ou déjà reportées.', 400);
    }

    const buyerReceiptItems = receivedShipments.flatMap((shipment) =>
      (Array.isArray(shipment.items) ? shipment.items : []).map((item: any) => ({
        ...item,
        shipmentId: shipment.id,
        shipmentTitle: shipment.title,
        buyerName: `${shipment.buyer.firstName} ${shipment.buyer.lastName}`.trim(),
      }))
    );

    let buyerReceiptTotalQuantity = 0;
    let buyerReceiptTotalWeightLbs = 0;
    buyerReceiptItems.forEach((item: any) => {
      buyerReceiptTotalQuantity += Number(item.quantity || 0);
      buyerReceiptTotalWeightLbs += Number(item.lineWeightLbs || 0);
    });

    const stockOutputItems = [];
    let stockOutputTotalQuantity = 0;
    let stockOutputTotalWeightLbs = 0;
    for (const item of data.stockOutputItems) {
      const line = await buildPersistedLine(tx, item);
      await applyStockDelta(tx, {
        productId: item.productId,
        productVariantId: item.productVariantId,
        quantity: item.quantity,
        mode: 'decrement',
      });
      stockOutputTotalQuantity += line.quantity;
      stockOutputTotalWeightLbs += line.lineWeightLbs;
      stockOutputItems.push(line);
    }

    const productionInputItems = [];
    let productionInputTotalQuantity = 0;
    for (const item of data.productionInputItems) {
      const line = await buildPersistedLine(tx, item);
      await applyStockDelta(tx, {
        productId: item.productId,
        productVariantId: item.productVariantId,
        quantity: item.quantity,
        mode: 'increment',
      });
      productionInputTotalQuantity += line.quantity;
      productionInputItems.push(line);
    }

    const productionOrderOutputItems = [];
    let productionOrderOutputTotalQuantity = 0;
    for (const item of data.productionOrderOutputItems) {
      const line = await buildPersistedLine(tx, item);
      await applyStockDelta(tx, {
        productId: item.productId,
        productVariantId: item.productVariantId,
        quantity: item.quantity,
        mode: 'decrement',
      });
      productionOrderOutputTotalQuantity += line.quantity;
      productionOrderOutputItems.push(line);
    }

    const created = await tx.stockManagerReport.create({
      data: {
        stockManagerId,
        title: data.title.trim(),
        reportDate: new Date(data.reportDate),
        summary: data.summary?.trim() || null,
        buyerReceiptItems: buyerReceiptItems as Prisma.InputJsonValue,
        buyerReceiptTotalQuantity,
        buyerReceiptTotalWeightLbs: new Prisma.Decimal(buyerReceiptTotalWeightLbs.toFixed(2)),
        stockOutputItems: stockOutputItems as Prisma.InputJsonValue,
        stockOutputTotalQuantity,
        stockOutputTotalWeightLbs: new Prisma.Decimal(stockOutputTotalWeightLbs.toFixed(2)),
        productionInputItems: productionInputItems as Prisma.InputJsonValue,
        productionInputTotalQuantity,
        productionOrderOutputItems: productionOrderOutputItems as Prisma.InputJsonValue,
        productionOrderOutputTotalQuantity,
      },
      include: {
        stockManager: { select: { id: true, firstName: true, lastName: true, email: true } },
        linkedShipments: {
          select: { id: true, title: true, buyer: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    if (receivedShipments.length > 0) {
      await tx.buyerStockShipment.updateMany({
        where: { id: { in: receivedShipments.map((shipment) => shipment.id) } },
        data: { reportedInStockReportId: created.id },
      });
    }

    return created;
  });

  return serializeReport(report);
}

export async function getBoardStockReports() {
  const reports = await prisma.stockManagerReport.findMany({
    include: {
      stockManager: { select: { id: true, firstName: true, lastName: true, email: true } },
      linkedShipments: {
        select: { id: true, title: true, buyer: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }],
  });

  const serializedReports = reports.map(serializeReport);

  const overview = serializedReports.reduce(
    (acc, report) => {
      acc.totalReports += 1;
      acc.totalBuyerReceiptQuantity += report.buyerReceiptTotalQuantity;
      acc.totalBuyerReceiptWeightLbs += report.buyerReceiptTotalWeightLbs;
      acc.totalStockOutputQuantity += report.stockOutputTotalQuantity;
      acc.totalProductionInputQuantity += report.productionInputTotalQuantity;
      acc.totalProductionOrderOutputQuantity += report.productionOrderOutputTotalQuantity;
      return acc;
    },
    {
      totalReports: 0,
      totalBuyerReceiptQuantity: 0,
      totalBuyerReceiptWeightLbs: 0,
      totalStockOutputQuantity: 0,
      totalProductionInputQuantity: 0,
      totalProductionOrderOutputQuantity: 0,
    }
  );

  return {
    overview,
    reports: serializedReports,
  };
}

export async function getStockReportById(reportId: string, user: NonNullable<AuthRequest['user']>) {
  if (!['ADMIN', 'ASSOCIATE', 'STOCK_MANAGER'].includes(user.role)) {
    throw createError('Accès refusé à ce rapport stock.', 403);
  }

  return loadStockReport(reportId);
}
