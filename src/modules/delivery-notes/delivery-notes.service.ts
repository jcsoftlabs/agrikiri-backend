import { DeliveryNoteStatus, DeliveryNoteSourceType, Prisma, Role } from '@prisma/client';
import { prisma } from '../../config/database';
import { createError } from '../../middleware/error.middleware';
import { CreateDeliveryNoteInput, UpdateDeliveryNoteStatusInput } from './delivery-notes.schema';

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function generateDeliveryNoteNumber() {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `AGRO-BL-${suffix}`;
}

function normalizeAddress(value: any) {
  if (!value || typeof value !== 'object') return '';

  return [
    value.addressLine1,
    value.addressLine2,
    value.city,
    value.stateRegion,
    value.postalCode,
    value.countryCode,
  ]
    .filter(Boolean)
    .join(', ');
}

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  role: true,
} as const;

const deliveryNoteInclude = {
  createdBy: { select: userSelect },
  deliveryAgent: { select: userSelect },
  order: { select: { id: true, orderNumber: true, status: true } },
  posSale: { select: { id: true, saleNumber: true, documentType: true, status: true } },
  items: {
    include: {
      product: { select: { id: true, name: true } },
      productVariant: { select: { id: true, label: true, weightLbs: true } },
      orderItem: { select: { id: true, quantity: true } },
      posSaleItem: { select: { id: true, quantity: true } },
    },
  },
} as const;

function serializeDeliveryNote(note: any) {
  return {
    ...note,
    totalWeightLbs: toNumber(note.totalWeightLbs),
    items: note.items.map((item: any) => ({
      ...item,
      unitWeightLbs: toNumber(item.unitWeightLbs),
      lineWeightLbs: toNumber(item.lineWeightLbs),
    })),
  };
}

async function createOrderTrackingEvent(
  tx: Prisma.TransactionClient,
  orderId: string,
  title: string,
  description: string,
  status?: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'DELIVERY_FAILED' | 'CANCELLED'
) {
  await tx.orderTrackingEvent.create({
    data: {
      orderId,
      title,
      description,
      status: status || null,
      isCustomerVisible: true,
    },
  });
}

async function ensureDeliveryAgent(
  tx: Prisma.TransactionClient,
  deliveryAgentId: string | null | undefined
) {
  if (!deliveryAgentId) return null;

  const deliveryAgent = await tx.user.findFirst({
    where: {
      id: deliveryAgentId,
      role: Role.DELIVERY_AGENT,
      isActive: true,
    },
    select: userSelect,
  });

  if (!deliveryAgent) {
    throw createError('Livreur introuvable ou inactif', 404);
  }

  return deliveryAgent;
}

async function computeOrderDeliveredQuantities(
  tx: Prisma.TransactionClient,
  orderItemIds: string[]
) {
  const existing = await tx.deliveryNoteItem.findMany({
    where: {
      orderItemId: { in: orderItemIds },
      deliveryNote: {
        status: { not: DeliveryNoteStatus.CANCELLED },
      },
    },
    select: {
      orderItemId: true,
      deliveredQuantity: true,
    },
  });

  const deliveredMap = new Map<string, number>();
  existing.forEach((item) => {
    if (!item.orderItemId) return;
    deliveredMap.set(item.orderItemId, (deliveredMap.get(item.orderItemId) || 0) + item.deliveredQuantity);
  });

  return deliveredMap;
}

async function computePosDeliveredQuantities(
  tx: Prisma.TransactionClient,
  posSaleItemIds: string[]
) {
  const existing = await tx.deliveryNoteItem.findMany({
    where: {
      posSaleItemId: { in: posSaleItemIds },
      deliveryNote: {
        status: { not: DeliveryNoteStatus.CANCELLED },
      },
    },
    select: {
      posSaleItemId: true,
      deliveredQuantity: true,
    },
  });

  const deliveredMap = new Map<string, number>();
  existing.forEach((item) => {
    if (!item.posSaleItemId) return;
    deliveredMap.set(item.posSaleItemId, (deliveredMap.get(item.posSaleItemId) || 0) + item.deliveredQuantity);
  });

  return deliveredMap;
}

async function syncOrderDeliveryStatus(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      items: { select: { id: true, quantity: true } },
      deliveryNotes: {
        where: { status: { not: DeliveryNoteStatus.CANCELLED } },
        include: { items: true },
      },
    },
  });

  if (!order) return;

  const deliveredPerItem = new Map<string, number>();
  order.deliveryNotes.forEach((note) => {
    note.items.forEach((item) => {
      if (!item.orderItemId) return;
      deliveredPerItem.set(item.orderItemId, (deliveredPerItem.get(item.orderItemId) || 0) + item.deliveredQuantity);
    });
  });

  const allDelivered = order.items.length > 0 && order.items.every((item) => (deliveredPerItem.get(item.id) || 0) >= item.quantity);
  const anyPrepared = order.deliveryNotes.length > 0;
  const anyInTransit = order.deliveryNotes.some((note) => note.status === DeliveryNoteStatus.IN_TRANSIT);
  const anyDelivered = order.deliveryNotes.some((note) => note.status === DeliveryNoteStatus.DELIVERED);

  const nextStatus =
    allDelivered && anyDelivered
      ? 'DELIVERED'
      : anyInTransit || anyDelivered
        ? 'SHIPPED'
        : anyPrepared
          ? 'PROCESSING'
          : order.status;

  if (nextStatus !== order.status) {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: nextStatus,
        shippedAt: nextStatus === 'SHIPPED' && !order.shippedAt ? new Date() : order.shippedAt,
        deliveredAt: nextStatus === 'DELIVERED' ? order.deliveredAt || new Date() : order.deliveredAt,
      },
    });
  }
}

export async function createOrderDeliveryNote(
  orderId: string,
  actor: { userId: string; role: string },
  payload: CreateDeliveryNoteInput
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: userSelect },
        items: {
          include: {
            product: { select: { id: true, name: true, weightLbs: true } },
            productVariant: { select: { id: true, label: true, weightLbs: true } },
          },
        },
      },
    });

    if (!order) throw createError('Commande introuvable', 404);

    if (actor.role === 'DELIVERY_AGENT') {
      if (!order.deliveryAgentId || order.deliveryAgentId !== actor.userId) {
        throw createError('Ce livreur ne peut générer des bons que pour ses commandes assignées', 403);
      }
      if (payload.deliveryAgentId && payload.deliveryAgentId !== actor.userId) {
        throw createError('Un livreur ne peut pas assigner le bon à un autre livreur', 403);
      }
    }

    const assignedAgentId = actor.role === 'DELIVERY_AGENT' ? actor.userId : (payload.deliveryAgentId || order.deliveryAgentId || null);
    const assignedAgent = await ensureDeliveryAgent(tx, assignedAgentId);

    const orderItemIds = payload.items.map((item) => item.orderItemId).filter(Boolean) as string[];
    const deliveredMap = await computeOrderDeliveredQuantities(tx, orderItemIds);
    const itemMap = new Map(order.items.map((item) => [item.id, item]));
    const requestedMap = new Map<string, number>();

    const normalizedItems = payload.items.map((item) => {
      if (!item.orderItemId) {
        throw createError('Chaque ligne du bon commande doit pointer vers une ligne de commande', 400);
      }

      const sourceItem = itemMap.get(item.orderItemId);
      if (!sourceItem) {
        throw createError('Une ligne demandée ne fait pas partie de cette commande', 400);
      }

      const alreadyDelivered = deliveredMap.get(item.orderItemId) || 0;
      const alreadyRequestedHere = requestedMap.get(item.orderItemId) || 0;
      const remainingBefore = Math.max(0, sourceItem.quantity - alreadyDelivered);
      if (item.deliveredQuantity + alreadyRequestedHere > remainingBefore) {
        throw createError(`La quantité pour "${sourceItem.product.name}" dépasse le restant à livrer`, 400);
      }
      requestedMap.set(item.orderItemId, alreadyRequestedHere + item.deliveredQuantity);

      const unitWeightLbs = roundMoney(
        toNumber(sourceItem.productVariant?.weightLbs) || toNumber(sourceItem.product.weightLbs)
      );
      const lineWeightLbs = roundMoney(unitWeightLbs * item.deliveredQuantity);
      const remainingAfter = remainingBefore - item.deliveredQuantity;

      return {
        orderItemId: sourceItem.id,
        posSaleItemId: null,
        productId: sourceItem.productId,
        productVariantId: sourceItem.productVariantId,
        description: sourceItem.productVariant ? `${sourceItem.product.name} - ${sourceItem.productVariant.label}` : sourceItem.product.name,
        orderedQuantity: sourceItem.quantity,
        deliveredQuantity: item.deliveredQuantity,
        remainingQuantity: remainingAfter,
        unitWeightLbs,
        lineWeightLbs,
      };
    });

    const totalQuantity = normalizedItems.reduce((sum, item) => sum + item.deliveredQuantity, 0);
    const totalWeightLbs = roundMoney(normalizedItems.reduce((sum, item) => sum + item.lineWeightLbs, 0));

    const note = await tx.deliveryNote.create({
      data: {
        noteNumber: generateDeliveryNoteNumber(),
        sourceType: DeliveryNoteSourceType.ORDER,
        orderId: order.id,
        deliveryAgentId: assignedAgent?.id || null,
        createdById: actor.userId,
        status: payload.status,
        customerName: payload.customerName?.trim() || `${order.customer.firstName} ${order.customer.lastName}`.trim(),
        customerPhone: payload.customerPhone?.trim() || null,
        customerAddress: payload.customerAddress?.trim() || normalizeAddress(order.deliveryAddress),
        notes: payload.notes?.trim() || null,
        totalQuantity,
        totalWeightLbs: new Prisma.Decimal(totalWeightLbs.toFixed(2)),
        deliveredAt: payload.status === 'DELIVERED' ? new Date() : null,
        items: {
          create: normalizedItems.map((item) => ({
            orderItemId: item.orderItemId,
            posSaleItemId: null,
            productId: item.productId,
            productVariantId: item.productVariantId,
            description: item.description,
            orderedQuantity: item.orderedQuantity,
            deliveredQuantity: item.deliveredQuantity,
            remainingQuantity: item.remainingQuantity,
            unitWeightLbs: new Prisma.Decimal(item.unitWeightLbs.toFixed(2)),
            lineWeightLbs: new Prisma.Decimal(item.lineWeightLbs.toFixed(2)),
          })),
        },
      },
      include: deliveryNoteInclude,
    });

    await createOrderTrackingEvent(
      tx,
      order.id,
      `Bon de livraison ${note.noteNumber} généré`,
      `Un bon de livraison partiel a été préparé pour ${totalQuantity} unité(s), poids total ${totalWeightLbs.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Lbs.${assignedAgent ? ` Livreur assigné : ${assignedAgent.firstName} ${assignedAgent.lastName}.` : ''}`,
      payload.status === 'DELIVERED' ? 'DELIVERED' : payload.status === 'IN_TRANSIT' ? 'SHIPPED' : 'PROCESSING'
    );

    await syncOrderDeliveryStatus(tx, order.id);

    return serializeDeliveryNote(note);
  });
}

export async function createPosSaleDeliveryNote(
  posSaleId: string,
  actor: { userId: string; role: string },
  payload: CreateDeliveryNoteInput
) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.posSale.findUnique({
      where: { id: posSaleId },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, weightLbs: true } },
            productVariant: { select: { id: true, label: true, weightLbs: true } },
          },
        },
      },
    });

    if (!sale) throw createError('Vente POS introuvable', 404);

    if (actor.role === 'DELIVERY_AGENT') {
      if (payload.deliveryAgentId && payload.deliveryAgentId !== actor.userId) {
        throw createError('Un livreur ne peut pas assigner le bon à un autre livreur', 403);
      }
    }

    const assignedAgentId = actor.role === 'DELIVERY_AGENT' ? actor.userId : (payload.deliveryAgentId || null);
    const assignedAgent = await ensureDeliveryAgent(tx, assignedAgentId);

    const posSaleItemIds = payload.items.map((item) => item.posSaleItemId).filter(Boolean) as string[];
    const deliveredMap = await computePosDeliveredQuantities(tx, posSaleItemIds);
    const itemMap = new Map(sale.items.map((item) => [item.id, item]));
    const requestedMap = new Map<string, number>();

    const normalizedItems = payload.items.map((item) => {
      if (!item.posSaleItemId) {
        throw createError('Chaque ligne du bon POS doit pointer vers une ligne POS', 400);
      }

      const sourceItem = itemMap.get(item.posSaleItemId);
      if (!sourceItem) {
        throw createError('Une ligne demandée ne fait pas partie de cette vente POS', 400);
      }

      const alreadyDelivered = deliveredMap.get(item.posSaleItemId) || 0;
      const alreadyRequestedHere = requestedMap.get(item.posSaleItemId) || 0;
      const remainingBefore = Math.max(0, sourceItem.quantity - alreadyDelivered);
      if (item.deliveredQuantity + alreadyRequestedHere > remainingBefore) {
        throw createError(`La quantité pour "${sourceItem.description}" dépasse le restant à livrer`, 400);
      }
      requestedMap.set(item.posSaleItemId, alreadyRequestedHere + item.deliveredQuantity);

      const unitWeightLbs = roundMoney(
        toNumber(sourceItem.productVariant?.weightLbs) || toNumber(sourceItem.product.weightLbs)
      );
      const lineWeightLbs = roundMoney(unitWeightLbs * item.deliveredQuantity);
      const remainingAfter = remainingBefore - item.deliveredQuantity;

      return {
        orderItemId: null,
        posSaleItemId: sourceItem.id,
        productId: sourceItem.productId,
        productVariantId: sourceItem.productVariantId,
        description: sourceItem.description,
        orderedQuantity: sourceItem.quantity,
        deliveredQuantity: item.deliveredQuantity,
        remainingQuantity: remainingAfter,
        unitWeightLbs,
        lineWeightLbs,
      };
    });

    const totalQuantity = normalizedItems.reduce((sum, item) => sum + item.deliveredQuantity, 0);
    const totalWeightLbs = roundMoney(normalizedItems.reduce((sum, item) => sum + item.lineWeightLbs, 0));

    const note = await tx.deliveryNote.create({
      data: {
        noteNumber: generateDeliveryNoteNumber(),
        sourceType: DeliveryNoteSourceType.POS_SALE,
        posSaleId: sale.id,
        deliveryAgentId: assignedAgent?.id || null,
        createdById: actor.userId,
        status: payload.status,
        customerName: payload.customerName?.trim() || sale.customerName,
        customerPhone: payload.customerPhone?.trim() || sale.customerPhone || null,
        customerAddress: payload.customerAddress?.trim() || sale.customerAddress || null,
        notes: payload.notes?.trim() || null,
        totalQuantity,
        totalWeightLbs: new Prisma.Decimal(totalWeightLbs.toFixed(2)),
        deliveredAt: payload.status === 'DELIVERED' ? new Date() : null,
        items: {
          create: normalizedItems.map((item) => ({
            orderItemId: null,
            posSaleItemId: item.posSaleItemId,
            productId: item.productId,
            productVariantId: item.productVariantId,
            description: item.description,
            orderedQuantity: item.orderedQuantity,
            deliveredQuantity: item.deliveredQuantity,
            remainingQuantity: item.remainingQuantity,
            unitWeightLbs: new Prisma.Decimal(item.unitWeightLbs.toFixed(2)),
            lineWeightLbs: new Prisma.Decimal(item.lineWeightLbs.toFixed(2)),
          })),
        },
      },
      include: deliveryNoteInclude,
    });

    return serializeDeliveryNote(note);
  });
}

async function ensureNoteAccess(noteId: string, actor: { userId: string; role: string }) {
  const note = await prisma.deliveryNote.findUnique({
    where: { id: noteId },
    include: deliveryNoteInclude,
  });

  if (!note) {
    throw createError('Bon de livraison introuvable', 404);
  }

  if (actor.role === 'DELIVERY_AGENT' && note.deliveryAgentId !== actor.userId) {
    throw createError('Accès refusé à ce bon de livraison', 403);
  }

  return note;
}

export async function getDeliveryNoteById(noteId: string, actor: { userId: string; role: string }) {
  const note = await ensureNoteAccess(noteId, actor);
  return serializeDeliveryNote(note);
}

export async function listOrderDeliveryNotes(orderId: string, actor: { userId: string; role: string }) {
  const notes = await prisma.deliveryNote.findMany({
    where: { orderId },
    include: deliveryNoteInclude,
    orderBy: [{ createdAt: 'desc' }],
  });

  if (actor.role === 'DELIVERY_AGENT' && notes.some((note) => note.deliveryAgentId !== actor.userId)) {
    return notes.filter((note) => note.deliveryAgentId === actor.userId).map(serializeDeliveryNote);
  }

  return notes.map(serializeDeliveryNote);
}

export async function listPosSaleDeliveryNotes(posSaleId: string, actor: { userId: string; role: string }) {
  const notes = await prisma.deliveryNote.findMany({
    where: { posSaleId },
    include: deliveryNoteInclude,
    orderBy: [{ createdAt: 'desc' }],
  });

  if (actor.role === 'DELIVERY_AGENT') {
    return notes.filter((note) => note.deliveryAgentId === actor.userId).map(serializeDeliveryNote);
  }

  return notes.map(serializeDeliveryNote);
}

export async function listMyDeliveryNotes(deliveryAgentId: string) {
  const notes = await prisma.deliveryNote.findMany({
    where: {
      deliveryAgentId,
      status: { in: [DeliveryNoteStatus.PREPARED, DeliveryNoteStatus.IN_TRANSIT, DeliveryNoteStatus.DELIVERED] },
    },
    include: deliveryNoteInclude,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });

  return notes.map(serializeDeliveryNote);
}

export async function updateDeliveryNoteStatus(
  noteId: string,
  actor: { userId: string; role: string },
  payload: UpdateDeliveryNoteStatusInput
) {
  const note = await ensureNoteAccess(noteId, actor);

  if (actor.role === 'DELIVERY_AGENT' && note.deliveryAgentId !== actor.userId) {
    throw createError('Accès refusé à ce bon de livraison', 403);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.deliveryNote.update({
      where: { id: noteId },
      data: {
        status: payload.status,
        notes: payload.notes?.trim() || note.notes,
        receiverName:
          payload.status === DeliveryNoteStatus.DELIVERED
            ? payload.receiverName?.trim() || note.receiverName
            : note.receiverName,
        receiverSignatureUrl:
          payload.status === DeliveryNoteStatus.DELIVERED
            ? payload.receiverSignatureUrl || note.receiverSignatureUrl
            : note.receiverSignatureUrl,
        receiverSignaturePublicId:
          payload.status === DeliveryNoteStatus.DELIVERED
            ? payload.receiverSignaturePublicId || note.receiverSignaturePublicId
            : note.receiverSignaturePublicId,
        deliveredAt: payload.status === DeliveryNoteStatus.DELIVERED ? new Date() : payload.status === DeliveryNoteStatus.CANCELLED ? null : note.deliveredAt,
      },
      include: deliveryNoteInclude,
    });

    if (saved.orderId) {
      await createOrderTrackingEvent(
        tx,
        saved.orderId,
        `Bon de livraison ${saved.noteNumber} mis à jour`,
        payload.status === DeliveryNoteStatus.DELIVERED
          ? `Le bon de livraison a été marqué comme livré.${payload.receiverName?.trim() ? ` Receveur: ${payload.receiverName.trim()}.` : ''}`
          : payload.status === DeliveryNoteStatus.IN_TRANSIT
            ? 'Le bon de livraison est en cours de transport.'
            : payload.status === DeliveryNoteStatus.CANCELLED
              ? 'Le bon de livraison a été annulé.'
              : 'Le bon de livraison a été préparé.',
        payload.status === DeliveryNoteStatus.DELIVERED ? 'DELIVERED' : payload.status === DeliveryNoteStatus.IN_TRANSIT ? 'SHIPPED' : 'PROCESSING'
      );
      await syncOrderDeliveryStatus(tx, saved.orderId);
    }

    return saved;
  });

  return serializeDeliveryNote(updated);
}
