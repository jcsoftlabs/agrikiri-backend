import { prisma } from '../../config/database';
import { createError } from '../../middleware/error.middleware';
import { calculateOrderCommissions } from '../../utils/commission-engine';
import { generateOrderNumber } from '../../utils/mlm-calculator';
import { z } from 'zod';

// ================================
// SCHEMAS
// ================================

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
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
  paymentMethod: z.enum(['MONCASH', 'CASH', 'NATCASH']),
  ayizanId: z.string().uuid().optional(),
});

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
    const product = await prisma.product.findUnique({ where: { id: item.productId } });

    if (!product || !product.isActive) {
      throw createError(`Produit introuvable ou indisponible: ${item.productId}`, 400);
    }

    if (product.stockQuantity < item.quantity) {
      throw createError(
        `Stock insuffisant pour "${product.name}". Disponible: ${product.stockQuantity}`,
        400
      );
    }

    const itemTotal = Number(product.price) * item.quantity;
    const itemVP = Number(product.vpPoints) * item.quantity;

    totalAmount += itemTotal;
    totalVP += itemVP;

    orderItems.push({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: product.price,
      vpPoints: product.vpPoints,
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
        items: { include: { product: { select: { name: true, images: { take: 1 } } } } },
        customer: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    // Décrémenter le stock
    for (const item of orderItems) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stockQuantity: { decrement: item.quantity } },
      });
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

  return order;
}

// ================================
// COMPLETE ORDER & TRIGGER COMMISSIONS
// ================================

export async function markOrderPaid(orderId: string) {
  const order = await prisma.order.update({
    where: { id: orderId },
    data: { paymentStatus: 'PAID', status: 'PROCESSING' },
  });

  // Déclencher le calcul des commissions
  await calculateOrderCommissions(orderId);

  return order;
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
          include: { product: { select: { name: true, images: { where: { isPrimary: true }, take: 1 } } } },
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
      items: { include: { product: true } },
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
