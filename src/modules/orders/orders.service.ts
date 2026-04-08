import { prisma } from '../../config/database';
import { createError } from '../../middleware/error.middleware';
import { calculateOrderCommissions } from '../../utils/commission-engine';
import { generateOrderNumber } from '../../utils/mlm-calculator';
import { createPlopPlopPayment, verifyPlopPlopPayment } from '../../config/plopplop';
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
    fullName: z.string().min(2),
    phone: z.string(),
    address: z.string().min(5),
    city: z.string().min(2),
    department: z.string().min(2),
  }),
  paymentMethod: z.enum(['MONCASH', 'CASH', 'NATCASH', 'KASHPAW']),
  ayizanId: z.string().uuid().optional(),
});

function isOnlinePaymentMethod(method: z.infer<typeof createOrderSchema>['paymentMethod']) {
  return method !== 'CASH';
}

function mapPaymentMethodToPlopPlop(method: z.infer<typeof createOrderSchema>['paymentMethod']) {
  switch (method) {
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
  });

  // Déclencher le calcul des commissions
  await calculateOrderCommissions(orderId);

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
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw createError('Commande introuvable', 404);

  const updateData: any = { status };
  if (paymentStatus) updateData.paymentStatus = paymentStatus;

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: updateData,
  });

  // Si la commande est maintenant payée, déclencher les commissions
  if (paymentStatus === 'PAID' && order.paymentStatus !== 'PAID') {
    await calculateOrderCommissions(orderId);
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
  }

  return updated;
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
