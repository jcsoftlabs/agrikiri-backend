import { Prisma, PosDocumentType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { createError } from '../../middleware/error.middleware';
import { createPosSaleSchema } from './pos.schema';

type CreatePosSaleInput = z.infer<typeof createPosSaleSchema>;

function generatePosSaleNumber(type: PosDocumentType) {
  const prefixMap: Record<PosDocumentType, string> = {
    RECEIPT: 'RC',
    INVOICE: 'FC',
    PROFORMA: 'PF',
  };

  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `AGRO-${prefixMap[type]}-${suffix}`;
}

function resolveTieredUnitPrice(
  basePrice: number,
  quantity: number,
  pricingTiers: Array<{ minQuantity: number; maxQuantity: number | null; price: Prisma.Decimal | number }> = []
) {
  const matchedTier = pricingTiers
    .slice()
    .sort((a, b) => a.minQuantity - b.minQuantity)
    .find((tier) => quantity >= tier.minQuantity && (tier.maxQuantity == null || quantity <= tier.maxQuantity));

  return matchedTier ? Number(matchedTier.price) : basePrice;
}

async function syncParentProductSnapshot(
  tx: Prisma.TransactionClient,
  productId: string,
  decrementFallbackQuantity: number
) {
  const activeVariants = await tx.productVariant.findMany({
    where: { productId, isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  if (activeVariants.length > 0) {
    const defaultVariant = activeVariants.find((variant) => variant.isDefault) ?? activeVariants[0];
    await tx.product.update({
      where: { id: productId },
      data: {
        stockQuantity: activeVariants.reduce((sum, variant) => sum + variant.stockQuantity, 0),
        price: defaultVariant.price,
        weightLbs: defaultVariant.weightLbs,
        vpPoints: defaultVariant.vpPoints,
      },
    });
    return;
  }

  await tx.product.update({
    where: { id: productId },
    data: { stockQuantity: { decrement: decrementFallbackQuantity } },
  });
}

async function resolveSaleItem(item: CreatePosSaleInput['items'][number]) {
  const product = await prisma.product.findUnique({
    where: { id: item.productId },
    include: {
      category: { select: { id: true, name: true } },
      images: { orderBy: { order: 'asc' } },
      variants: {
        where: { isActive: true },
        include: {
          pricingTiers: {
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
      },
    },
  });

  if (!product || !product.isActive) {
    throw createError('Produit introuvable ou indisponible pour le POS', 404);
  }

  let selectedVariant = null as null | (typeof product.variants)[number];

  if (item.productVariantId) {
    selectedVariant = product.variants.find((variant) => variant.id === item.productVariantId) ?? null;
    if (!selectedVariant) {
      throw createError('La variante choisie est introuvable ou inactive', 400);
    }
  } else if (product.variants.length > 0) {
    selectedVariant = product.variants.find((variant) => variant.isDefault) ?? product.variants[0];
  }

  const availableStock = selectedVariant ? selectedVariant.stockQuantity : product.stockQuantity;
  if (availableStock < item.quantity) {
    throw createError(`Stock insuffisant pour "${product.name}". Disponible: ${availableStock}`, 400);
  }

  const unitPrice = selectedVariant
    ? resolveTieredUnitPrice(Number(selectedVariant.price), item.quantity, selectedVariant.pricingTiers)
    : Number(product.price);

  return {
    product,
    selectedVariant,
    description:
      item.description?.trim() ||
      (selectedVariant ? `${product.name} - ${selectedVariant.label}` : product.name),
    quantity: item.quantity,
    unitPrice,
    lineTotal: Number((unitPrice * item.quantity).toFixed(2)),
  };
}

export async function listPosSales() {
  const sales = await prisma.posSale.findMany({
    include: {
      items: {
        include: {
          product: { select: { name: true, images: { orderBy: { order: 'asc' }, take: 1 } } },
          productVariant: { select: { label: true } },
        },
      },
      createdBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 40,
  });

  return sales;
}

export async function getPosSaleById(id: string) {
  const sale = await prisma.posSale.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: { select: { name: true, images: { orderBy: { order: 'asc' }, take: 1 } } },
          productVariant: { select: { id: true, label: true } },
        },
      },
      createdBy: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  if (!sale) {
    throw createError('Document POS introuvable', 404);
  }

  return sale;
}

export async function createPosSale(adminUserId: string, payload: CreatePosSaleInput) {
  const isProforma = payload.documentType === 'PROFORMA';

  if (!isProforma && !payload.paymentMethod) {
    throw createError('Le mode de paiement est requis pour un reçu ou une facture', 400);
  }

  if (payload.customerType === 'WALK_IN' && !payload.customerName.trim()) {
    throw createError('Le client comptoir doit avoir un libellé.', 400);
  }

  if (payload.customerType === 'BUSINESS' && !payload.companyName?.trim()) {
    throw createError('Le nom de l’entreprise est requis pour un client entreprise.', 400);
  }

  const resolvedItems = await Promise.all(payload.items.map(resolveSaleItem));
  const subtotalAmount = Number(resolvedItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
  const discountAmount = Number((payload.discountAmount || 0).toFixed(2));

  if (discountAmount > subtotalAmount) {
    throw createError('La remise ne peut pas dépasser le sous-total', 400);
  }

  const totalAmount = Number((subtotalAmount - discountAmount).toFixed(2));
  const saleNumber = generatePosSaleNumber(payload.documentType);

  const sale = await prisma.$transaction(async (tx) => {
    const newSale = await tx.posSale.create({
      data: {
        saleNumber,
        documentType: payload.documentType,
        status: isProforma ? 'DRAFT' : 'COMPLETED',
        customerType: payload.customerType,
        customerName: payload.customerName.trim(),
        companyName: payload.companyName?.trim() || null,
        taxId: payload.taxId?.trim() || null,
        customerPhone: payload.customerPhone?.trim() || null,
        customerEmail: payload.customerEmail?.trim() || null,
        customerAddress: payload.customerAddress?.trim() || null,
        paymentMethod: isProforma ? null : payload.paymentMethod ?? null,
        subtotalAmount,
        discountAmount,
        totalAmount,
        notes: payload.notes?.trim() || null,
        createdById: adminUserId,
        items: {
          create: resolvedItems.map((item) => ({
            productId: item.product.id,
            productVariantId: item.selectedVariant?.id ?? null,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
          })),
        },
      },
      include: {
        items: {
          include: {
            product: { select: { name: true, images: { orderBy: { order: 'asc' }, take: 1 } } },
            productVariant: { select: { id: true, label: true } },
          },
        },
        createdBy: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    if (!isProforma) {
      for (const item of resolvedItems) {
        if (item.selectedVariant) {
          await tx.productVariant.update({
            where: { id: item.selectedVariant.id },
            data: { stockQuantity: { decrement: item.quantity } },
          });
        }

        await syncParentProductSnapshot(tx, item.product.id, item.quantity);
      }
    }

    return newSale;
  });

  return sale;
}
