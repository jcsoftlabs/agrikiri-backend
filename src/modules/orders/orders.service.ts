import { prisma } from '../../config/database';
import { createError } from '../../middleware/error.middleware';
import { calculateOrderCommissions } from '../../utils/commission-engine';
import { generateOrderNumber } from '../../utils/mlm-calculator';
import { createPlopPlopPayment, verifyPlopPlopPayment } from '../../config/plopplop';
import { sendOrderCreatedEmail, sendOrderPaidEmail, sendOrderStatusEmail } from '../../services/email.service';
import { z } from 'zod';

// ================================
// SCHEMAS
// ================================

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        productVariantId: z.string().uuid().optional(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1, 'La commande doit contenir au moins un article'),
  deliveryAddress: z.object({
    label: z.string().optional(),
    countryCode: z.enum(['HT', 'US']),
    fullName: z.string().min(2),
    phoneCountryCode: z.enum(['+509', '+1']),
    phoneNumber: z.string().min(6),
    addressLine1: z.string().min(5),
    addressLine2: z.string().optional().nullable(),
    city: z.string().min(2),
    stateRegion: z.string().min(2),
    postalCode: z.string().optional().nullable(),
    deliveryInstructions: z.string().optional().nullable(),
  }),
  paymentMethod: z.enum(['PLOPPLOP', 'MONCASH', 'CASH', 'NATCASH', 'KASHPAW']),
  ayizanId: z.string().uuid().optional(),
});

export const updateOrderTrackingSchema = z.object({
  carrierName: z.string().trim().max(120).optional(),
  trackingNumber: z.string().trim().max(120).optional(),
  estimatedDeliveryDate: z.string().trim().optional(),
  eventTitle: z.string().trim().max(160).optional(),
  eventDescription: z.string().trim().max(500).optional(),
  eventStatus: z.enum(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']).optional(),
  isCustomerVisible: z.boolean().optional(),
});

function isOnlinePaymentMethod(method: z.infer<typeof createOrderSchema>['paymentMethod']) {
  return method !== 'CASH';
}

function mapPaymentMethodToPlopPlop(method: z.infer<typeof createOrderSchema>['paymentMethod']) {
  switch (method) {
    case 'PLOPPLOP':
      return 'all' as const;
    case 'MONCASH':
      return 'moncash' as const;
    case 'NATCASH':
      return 'natcash' as const;
    case 'KASHPAW':
      return 'kashpaw' as const;
    default:
      return 'all' as const;
  }
}

function getPaymentMethodLabel(method: z.infer<typeof createOrderSchema>['paymentMethod']) {
  switch (method) {
    case 'PLOPPLOP':
      return 'PLOP PLOP';
    case 'MONCASH':
      return 'MonCash';
    case 'NATCASH':
      return 'NatCash';
    case 'KASHPAW':
      return 'Kashpaw';
    case 'CASH':
    default:
      return 'Paiement à la livraison';
  }
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: 'Commande en attente',
    PROCESSING: 'Commande en préparation',
    SHIPPED: 'Commande expédiée',
    DELIVERED: 'Commande livrée',
    CANCELLED: 'Commande annulée',
  };

  return labels[status] || status;
}

async function createTrackingEvent(
  prismaClient: typeof prisma,
  orderId: string,
  title: string,
  description?: string,
  status?: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED',
  isCustomerVisible: boolean = true
) {
  await prismaClient.orderTrackingEvent.create({
    data: {
      orderId,
      title,
      description,
      status,
      isCustomerVisible,
    },
  });
}

function normalizeDateInput(value?: string) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// ================================
// CREATE ORDER
// ================================

export async function createOrder(
  customerId: string,
  data: z.infer<typeof createOrderSchema>
) {
  const { items, deliveryAddress, paymentMethod, ayizanId } = data;

  // Récupérer les produits et calculer les totaux
  let totalAmount = 0;
  let totalVP = 0;
  const orderItems: any[] = [];

  for (const item of items) {
    let product = await prisma.product.findUnique({ where: { id: item.productId } });
    let selectedVariant: {
      id: string;
      label: string;
      price: any;
      vpPoints: any;
      stockQuantity: number;
      isDefault: boolean;
      productId: string;
    } | null = null;

    if (item.productVariantId) {
      selectedVariant = await prisma.productVariant.findFirst({
        where: {
          id: item.productVariantId,
          productId: item.productId,
          isActive: true,
        },
      });

      if (!selectedVariant) {
        throw createError(`Variante introuvable ou indisponible: ${item.productVariantId}`, 400);
      }
    }

    if (!product || !product.isActive) {
      throw createError(`Produit introuvable ou indisponible: ${item.productId}`, 400);
    }

    const availableStock = selectedVariant ? selectedVariant.stockQuantity : product.stockQuantity;
    if (availableStock < item.quantity) {
      throw createError(
        `Stock insuffisant pour "${product.name}". Disponible: ${availableStock}`,
        400
      );
    }

    const unitPrice = selectedVariant ? selectedVariant.price : product.price;
    const unitVP = selectedVariant ? selectedVariant.vpPoints : product.vpPoints;
    const itemTotal = Number(unitPrice) * item.quantity;
    const itemVP = Number(unitVP) * item.quantity;

    totalAmount += itemTotal;
    totalVP += itemVP;

    orderItems.push({
      productId: item.productId,
      productVariantId: selectedVariant?.id,
      quantity: item.quantity,
      unitPrice,
      vpPoints: unitVP,
    });
  }

  // Vérifier que l'ayizan existe si fourni
  if (ayizanId) {
    const ayizan = await prisma.user.findUnique({ where: { id: ayizanId } });
    if (!ayizan || ayizan.role !== 'AYIZAN') {
      throw createError('Vendeur AYIZAN invalide', 400);
    }
  }

  const orderNumber = generateOrderNumber();
  let paymentSession: { paymentUrl: string; transactionId: string | null } | null = null;

  if (isOnlinePaymentMethod(paymentMethod)) {
    try {
      paymentSession = await createPlopPlopPayment({
        referenceId: orderNumber,
        amount: totalAmount,
        method: mapPaymentMethodToPlopPlop(paymentMethod),
      });
    } catch (error: any) {
      throw createError(
        error?.message || 'Impossible d’initialiser le paiement en ligne pour cette commande.',
        502
      );
    }
  }

  // Créer la commande avec items
  const order = await prisma.$transaction(async (tx: any) => {
    const newOrder = await tx.order.create({
      data: {
        orderNumber,
        customerId,
        ayizanId,
        totalAmount,
        totalVP,
        deliveryAddress,
        paymentMethod,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        items: {
          create: orderItems,
        },
      },
      include: {
        items: {
          include: {
            product: { select: { name: true, images: { take: 1 } } },
            productVariant: { select: { id: true, label: true } },
          },
        },
        customer: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    await createTrackingEvent(
      tx,
      newOrder.id,
      'Commande créée',
      `Commande enregistrée avec un paiement ${getPaymentMethodLabel(paymentMethod)}.`,
      'PENDING'
    );

    // Décrémenter le stock
    for (const item of orderItems) {
      if (item.productVariantId) {
        await tx.productVariant.update({
          where: { id: item.productVariantId },
          data: { stockQuantity: { decrement: item.quantity } },
        });
      }

      const activeVariants = await tx.productVariant.findMany({
        where: { productId: item.productId, isActive: true },
        orderBy: { sortOrder: 'asc' },
      });

      if (activeVariants.length > 0) {
        const defaultVariant = activeVariants.find((variant: any) => variant.isDefault) ?? activeVariants[0];
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stockQuantity: activeVariants.reduce(
              (sum: number, variant: any) => sum + variant.stockQuantity,
              0
            ),
            price: defaultVariant.price,
            weightLbs: defaultVariant.weightLbs,
            vpPoints: defaultVariant.vpPoints,
          },
        });
      } else {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { decrement: item.quantity } },
        });
      }
    }

    return newOrder;
  });

  // Notification au client
  await prisma.notification.create({
    data: {
      userId: customerId,
      type: 'ORDER_CREATED',
      title: '✅ Commande confirmée',
      message: `Votre commande ${orderNumber} a été créée avec succès. Total: ${totalAmount.toLocaleString()} HTG`,
    },
  });

  void sendOrderCreatedEmail({
    to: order.customer.email,
    customerName: `${order.customer.firstName} ${order.customer.lastName}`.trim(),
    orderNumber,
    totalAmount,
    paymentMethod: getPaymentMethodLabel(paymentMethod),
    items: order.items.map((item: any) => ({
      name: item.product.name,
      quantity: item.quantity,
      variantLabel: item.productVariant?.label || null,
    })),
  });

  return {
    order,
    payment:
      paymentSession && isOnlinePaymentMethod(paymentMethod)
        ? {
            provider: 'PLOP_PLOP',
            requiresRedirect: true,
            paymentUrl: paymentSession.paymentUrl,
            transactionId: paymentSession.transactionId,
            referenceId: orderNumber,
          }
        : {
            provider: null,
            requiresRedirect: false,
            paymentUrl: null,
            transactionId: null,
            referenceId: orderNumber,
          },
  };
}

// ================================
// COMPLETE ORDER & TRIGGER COMMISSIONS
// ================================

export async function markOrderPaid(orderId: string) {
  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, paymentStatus: true },
  });

  if (!existing) {
    throw createError('Commande introuvable', 404);
  }

  if (existing.paymentStatus === 'PAID') {
    return prisma.order.findUnique({ where: { id: orderId } });
  }

  const order = await prisma.order.update({
    where: { id: orderId },
    data: { paymentStatus: 'PAID', status: 'PROCESSING' },
    include: {
      customer: { select: { email: true, firstName: true, lastName: true } },
    },
  });

  // Déclencher le calcul des commissions
  await calculateOrderCommissions(orderId);

  await createTrackingEvent(
    prisma,
    order.id,
    'Paiement confirmé',
    'Le paiement de la commande a été confirmé avec succès.',
    'PROCESSING'
  );

  void sendOrderPaidEmail({
    to: order.customer.email,
    customerName: `${order.customer.firstName} ${order.customer.lastName}`.trim(),
    orderNumber: order.orderNumber,
    totalAmount: Number(order.totalAmount),
  });

  return order;
}

export async function verifyOrderPayment(orderId: string, userId: string, isAdmin: boolean) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      customerId: true,
      paymentMethod: true,
      paymentStatus: true,
      totalAmount: true,
      status: true,
    },
  });

  if (!order) throw createError('Commande introuvable', 404);
  if (!isAdmin && order.customerId !== userId) throw createError('Accès refusé', 403);
  if (order.paymentMethod === 'CASH') {
    throw createError('Cette commande ne nécessite pas de vérification de paiement en ligne.', 400);
  }

  const verification = await verifyPlopPlopPayment(order.orderNumber);
  const transactionStatus = verification.trans_status === 'ok' ? 'PAID' : 'PENDING';

  let updatedOrder = order;

  if (verification.trans_status === 'ok' && order.paymentStatus !== 'PAID') {
    updatedOrder = (await markOrderPaid(order.id)) as typeof order;
  } else if (verification.trans_status !== 'ok' && order.paymentStatus === 'FAILED') {
    updatedOrder = order;
  }

  return {
    order: updatedOrder,
    payment: {
      provider: 'PLOP_PLOP',
      referenceId: order.orderNumber,
      transactionId: verification.id_transaction || null,
      transactionStatus,
      rawStatus: verification.trans_status || null,
      method: verification.method || order.paymentMethod,
      amount: verification.montant ?? Number(order.totalAmount),
      verifiedAt: new Date().toISOString(),
    },
  };
}

// ================================
// GET MY ORDERS
// ================================

export async function getMyOrders(
  userId: string,
  page: number = 1,
  limit: number = 10
) {
  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where: { customerId: userId },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            product: { select: { name: true, images: { where: { isPrimary: true }, take: 1 } } },
            productVariant: { select: { id: true, label: true } },
          },
        },
      },
    }),
    prisma.order.count({ where: { customerId: userId } }),
  ]);

  return { orders, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

// ================================
// GET ORDER BY ID
// ================================

export async function getOrderById(orderId: string, userId: string, isAdmin: boolean) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { product: true, productVariant: true } },
      customer: { select: { firstName: true, lastName: true, email: true, phone: true } },
      ayizan: { select: { firstName: true, lastName: true, referralCode: true } },
      trackingEvents: { orderBy: { createdAt: 'desc' } },
    },
  });

  if (!order) throw createError('Commande introuvable', 404);
  if (!isAdmin && order.customerId !== userId) throw createError('Accès refusé', 403);

  return order;
}

// ================================
// UPDATE ORDER STATUS (Admin)
// ================================

export async function updateOrderStatus(
  orderId: string,
  status: string,
  paymentStatus?: string
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: { select: { email: true, firstName: true, lastName: true } },
    },
  });
  if (!order) throw createError('Commande introuvable', 404);

  const updateData: any = { status };
  if (paymentStatus) updateData.paymentStatus = paymentStatus;
  if (status === 'SHIPPED' && !order.shippedAt) {
    updateData.shippedAt = new Date();
  }
  if (status === 'DELIVERED' && !order.deliveredAt) {
    updateData.deliveredAt = new Date();
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: updateData,
  });

  // Si la commande est maintenant payée, déclencher les commissions
  if (paymentStatus === 'PAID' && order.paymentStatus !== 'PAID') {
    await calculateOrderCommissions(orderId);

    await createTrackingEvent(
      prisma,
      orderId,
      'Paiement confirmé',
      'Le paiement de la commande a été validé par l’administration.',
      updated.status as 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'
    );

    void sendOrderPaidEmail({
      to: order.customer.email,
      customerName: `${order.customer.firstName} ${order.customer.lastName}`.trim(),
      orderNumber: order.orderNumber,
      totalAmount: Number(updated.totalAmount),
    });
  }

  // Notification au client
  const statusMessages: Record<string, string> = {
    PROCESSING: '⚙️ Votre commande est en cours de traitement',
    SHIPPED: '🚚 Votre commande a été expédiée',
    DELIVERED: '✅ Votre commande a été livrée',
    CANCELLED: '❌ Votre commande a été annulée',
  };

  if (statusMessages[status]) {
    await prisma.notification.create({
      data: {
        userId: order.customerId,
        type: 'ORDER_STATUS',
        title: 'Mise à jour de commande',
        message: `Commande ${order.orderNumber}: ${statusMessages[status]}`,
      },
    });

    await createTrackingEvent(
      prisma,
      orderId,
      getStatusLabel(status),
      statusMessages[status],
      status as 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'
    );

    void sendOrderStatusEmail({
      to: order.customer.email,
      customerName: `${order.customer.firstName} ${order.customer.lastName}`.trim(),
      orderNumber: order.orderNumber,
      statusLabel: statusMessages[status],
    });
  }

  return updated;
}

export async function updateOrderTracking(
  orderId: string,
  data: z.infer<typeof updateOrderTrackingSchema>
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: { select: { email: true, firstName: true, lastName: true } },
      trackingEvents: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  if (!order) throw createError('Commande introuvable', 404);

  const estimatedDeliveryDate = normalizeDateInput(data.estimatedDeliveryDate);
  const shouldUpdateTrackingFields =
    data.carrierName !== undefined ||
    data.trackingNumber !== undefined ||
    data.estimatedDeliveryDate !== undefined;

  if (shouldUpdateTrackingFields) {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        carrierName: data.carrierName?.trim() || null,
        trackingNumber: data.trackingNumber?.trim() || null,
        estimatedDeliveryDate,
      },
    });
  }

  const eventTitle = data.eventTitle?.trim();
  const eventDescription = data.eventDescription?.trim();
  const shouldCreateCustomEvent =
    Boolean(eventTitle) ||
    Boolean(eventDescription) ||
    Boolean(data.eventStatus);

  if (shouldCreateCustomEvent) {
    await createTrackingEvent(
      prisma,
      orderId,
      eventTitle || getStatusLabel(data.eventStatus || order.status),
      eventDescription || undefined,
      data.eventStatus,
      data.isCustomerVisible ?? true
    );
  } else if (shouldUpdateTrackingFields) {
    const carrierLabel = data.carrierName?.trim() || order.carrierName || 'transporteur non précisé';
    const trackingSuffix = data.trackingNumber?.trim()
      ? ` Numéro de suivi : ${data.trackingNumber.trim()}.`
      : '';

    await createTrackingEvent(
      prisma,
      orderId,
      'Informations de livraison mises à jour',
      `Les informations logistiques ont été mises à jour pour ${carrierLabel}.${trackingSuffix}`.trim(),
      order.status as 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED',
      true
    );
  }

  return getOrderById(orderId, order.customerId, true);
}

// ================================
// GET ALL ORDERS (Admin)
// ================================

export async function getAllOrders(filters: {
  page?: number;
  limit?: number;
  status?: string;
  paymentStatus?: string;
}) {
  const { page = 1, limit = 20, status, paymentStatus } = filters;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (status) where.status = status;
  if (paymentStatus) where.paymentStatus = paymentStatus;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { firstName: true, lastName: true, email: true } },
        ayizan: { select: { firstName: true, lastName: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return { orders, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}
