import { z } from 'zod';
import { prisma } from '../../config/database';
import { deleteCloudinaryFile } from '../../config/cloudinary';
import { createError } from '../../middleware/error.middleware';

const productInclude = {
  category: { select: { id: true, name: true, slug: true } },
  images: { orderBy: { order: 'asc' as const } },
  variants: { orderBy: { sortOrder: 'asc' as const } },
} as const;

const productVariantSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1, 'Le libelle de la variante est requis'),
  price: z.number().positive('Prix doit etre positif'),
  weightLbs: z.number().positive('Poids doit etre positif'),
  stockQuantity: z.number().int().min(0),
  vpPoints: z.number().positive('Points VP doivent etre positifs'),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).optional(),
});

const baseProductSchema = z.object({
  name: z.string().min(2, 'Nom trop court'),
  description: z.string().min(10, 'Description trop courte'),
  categoryId: z.string().uuid('ID de categorie invalide'),
  images: z
    .array(z.object({ url: z.string().url(), publicId: z.string() }))
    .min(1, 'Au moins une image requise')
    .optional(),
  isActive: z.boolean().optional().default(true),
  variants: z.array(productVariantSchema).min(1, 'Au moins une variante est requise').optional(),
  price: z.number().positive('Prix doit etre positif').optional(),
  weightLbs: z.number().positive('Poids doit etre positif').optional(),
  stockQuantity: z.number().int().min(0).optional(),
  vpPoints: z.number().positive('Points VP doivent etre positifs').optional(),
});

export const createProductSchema = baseProductSchema.superRefine((data, ctx) => {
  const hasLegacyFields =
    data.price !== undefined &&
    data.weightLbs !== undefined &&
    data.stockQuantity !== undefined &&
    data.vpPoints !== undefined;

  if (!data.variants?.length && !hasLegacyFields) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Au moins une variante est requise',
      path: ['variants'],
    });
  }

  if (!data.images?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Au moins une image requise',
      path: ['images'],
    });
  }
});

export const updateProductSchema = baseProductSchema.partial();

type ProductVariantInput = z.infer<typeof productVariantSchema>;
type CreateProductInput = z.infer<typeof createProductSchema>;
type UpdateProductInput = z.infer<typeof updateProductSchema>;
type NormalizedProductVariant = {
  id?: string;
  label: string;
  price: number;
  weightLbs: number;
  stockQuantity: number;
  vpPoints: number;
  isActive: boolean;
  sortOrder: number;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function buildLegacyVariant(data: {
  price?: number;
  weightLbs?: number;
  stockQuantity?: number;
  vpPoints?: number;
}): NormalizedProductVariant | null {
  if (
    data.price === undefined ||
    data.weightLbs === undefined ||
    data.stockQuantity === undefined ||
    data.vpPoints === undefined
  ) {
    return null;
  }

  return {
    label: `${data.weightLbs} Livres`,
    price: data.price,
    weightLbs: data.weightLbs,
    stockQuantity: data.stockQuantity,
    vpPoints: data.vpPoints,
    isActive: true,
    sortOrder: 0,
  };
}

function normalizeVariants(data: {
  variants?: ProductVariantInput[];
  price?: number;
  weightLbs?: number;
  stockQuantity?: number;
  vpPoints?: number;
}): NormalizedProductVariant[] {
  const variants =
    data.variants?.length
      ? data.variants.map((variant, index) => ({
          id: variant.id,
          ...variant,
          isActive: variant.isActive ?? true,
          sortOrder: variant.sortOrder ?? index,
        }))
      : buildLegacyVariant(data)
        ? [buildLegacyVariant(data)!]
        : [];

  if (variants.length === 0) {
    throw createError('Au moins une variante est requise', 400);
  }

  const activeVariants = variants.filter((variant) => variant.isActive !== false);
  if (activeVariants.length === 0) {
    throw createError('Au moins une variante active est requise', 400);
  }

  return variants.map((variant, index) => ({
    ...variant,
    isActive: variant.isActive ?? true,
    sortOrder: index,
  }));
}

function getPrimaryVariant<T extends { isActive?: boolean; price: number; weightLbs: number; vpPoints: number }>(
  variants: T[]
) {
  const activeVariants = variants.filter((variant) => variant.isActive !== false);
  return activeVariants[0] ?? variants[0];
}

function deriveProductSnapshot(variants: Array<{ isActive?: boolean; price: number; weightLbs: number; stockQuantity: number; vpPoints: number }>) {
  const activeVariants = variants.filter((variant) => variant.isActive !== false);
  const primaryVariant = getPrimaryVariant(variants);

  return {
    price: primaryVariant.price,
    weightLbs: primaryVariant.weightLbs,
    vpPoints: primaryVariant.vpPoints,
    stockQuantity: activeVariants.reduce((sum, variant) => sum + variant.stockQuantity, 0),
  };
}

// ================================
// GET ALL PRODUCTS
// ================================

export async function getProducts(filters: {
  page?: number;
  limit?: number;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
  adminMode?: boolean;
}) {
  const {
    page = 1,
    limit = 12,
    categoryId,
    minPrice,
    maxPrice,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    adminMode = false,
  } = filters;

  const skip = (page - 1) * limit;
  const where: Record<string, unknown> = adminMode ? {} : { isActive: true };

  if (categoryId) where.categoryId = categoryId;
  if (minPrice !== undefined) where.price = { ...(where.price as object), gte: minPrice };
  if (maxPrice !== undefined) where.price = { ...(where.price as object), lte: maxPrice };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        ...productInclude,
        variants: {
          where: adminMode ? {} : { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return {
    products,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
}

// ================================
// GET PRODUCT BY SLUG
// ================================

export async function getProductBySlug(slug: string) {
  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      category: true,
      images: { orderBy: { order: 'asc' } },
      variants: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!product || !product.isActive) throw createError('Produit introuvable', 404);

  return product;
}

// ================================
// CREATE PRODUCT (Admin)
// ================================

export async function createProduct(data: CreateProductInput) {
  const { images = [], variants: _variants, ...productData } = data;
  const variants = normalizeVariants({ ...productData, variants: _variants });
  const snapshot = deriveProductSnapshot(variants);
  const slug = slugify(productData.name);

  const product = await prisma.product.create({
    data: {
      name: productData.name,
      description: productData.description,
      categoryId: productData.categoryId,
      isActive: productData.isActive ?? true,
      slug,
      ...snapshot,
      images: {
        create: images.map((img, index) => ({
          url: img.url,
          publicId: img.publicId,
          isPrimary: index === 0,
          order: index,
        })),
      },
      variants: {
        create: variants.map((variant, index) => ({
          label: variant.label,
          price: variant.price,
          weightLbs: variant.weightLbs,
          stockQuantity: variant.stockQuantity,
          vpPoints: variant.vpPoints,
          isActive: variant.isActive,
          isDefault: index === 0,
          sortOrder: index,
        })),
      },
    },
    include: productInclude,
  });

  return product;
}

// ================================
// UPDATE PRODUCT (Admin)
// ================================

export async function updateProduct(id: string, data: UpdateProductInput) {
  const existing = await prisma.product.findUnique({
    where: { id },
    include: { variants: { orderBy: { sortOrder: 'asc' } } },
  });

  if (!existing) throw createError('Produit introuvable', 404);

  const { variants, images: _images, ...productData } = data;

  return prisma.$transaction(async (tx) => {
    let snapshotUpdate: Record<string, number> = {};

    if (variants?.length) {
      const normalizedVariants = normalizeVariants({ variants });
      const existingVariants = await tx.productVariant.findMany({
        where: { productId: id },
        orderBy: { sortOrder: 'asc' },
      });

      const existingVariantIds = new Set(existingVariants.map((variant) => variant.id));
      const submittedVariantIds = new Set(
        normalizedVariants.flatMap((variant) => (variant.id ? [variant.id] : []))
      );

      for (const variant of existingVariants) {
        if (!submittedVariantIds.has(variant.id)) {
          await tx.productVariant.update({
            where: { id: variant.id },
            data: { isActive: false, isDefault: false },
          });
        }
      }

      const savedVariantIds: string[] = [];
      for (const [index, variant] of normalizedVariants.entries()) {
        if (variant.id && existingVariantIds.has(variant.id)) {
          const updatedVariant = await tx.productVariant.update({
            where: { id: variant.id },
            data: {
              label: variant.label,
              price: variant.price,
              weightLbs: variant.weightLbs,
              stockQuantity: variant.stockQuantity,
              vpPoints: variant.vpPoints,
              isActive: variant.isActive,
              isDefault: false,
              sortOrder: index,
            },
          });
          savedVariantIds.push(updatedVariant.id);
        } else {
          const createdVariant = await tx.productVariant.create({
            data: {
              productId: id,
              label: variant.label,
              price: variant.price,
              weightLbs: variant.weightLbs,
              stockQuantity: variant.stockQuantity,
              vpPoints: variant.vpPoints,
              isActive: variant.isActive,
              isDefault: false,
              sortOrder: index,
            },
          });
          savedVariantIds.push(createdVariant.id);
        }
      }

      await tx.productVariant.updateMany({
        where: { productId: id },
        data: { isDefault: false },
      });

      if (savedVariantIds[0]) {
        await tx.productVariant.update({
          where: { id: savedVariantIds[0] },
          data: { isDefault: true },
        });
      }

      snapshotUpdate = deriveProductSnapshot(normalizedVariants);
    } else {
      const legacyVariant = buildLegacyVariant(productData);
      if (legacyVariant) {
        snapshotUpdate = deriveProductSnapshot([legacyVariant]);
      }
    }

    await tx.product.update({
      where: { id },
      data: {
        ...(productData.name ? { name: productData.name, slug: slugify(productData.name) } : {}),
        ...(productData.description ? { description: productData.description } : {}),
        ...(productData.categoryId ? { categoryId: productData.categoryId } : {}),
        ...(productData.isActive !== undefined ? { isActive: productData.isActive } : {}),
        ...snapshotUpdate,
      },
    });

    const updatedProduct = await tx.product.findUnique({
      where: { id },
      include: productInclude,
    });

    if (!updatedProduct) throw createError('Produit introuvable', 404);
    return updatedProduct;
  });
}

// ================================
// DELETE PRODUCT (Admin)
// ================================

export async function deleteProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { images: true },
  });

  if (!product) throw createError('Produit introuvable', 404);

  await Promise.all(
    product.images.map((img) => deleteCloudinaryFile(img.publicId).catch(console.error))
  );

  await prisma.product.delete({ where: { id } });
}

// ================================
// ADD PRODUCT IMAGES (Admin)
// ================================

export async function addProductImages(
  productId: string,
  images: { url: string; publicId: string }[]
) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw createError('Produit introuvable', 404);

  const existingCount = await prisma.productImage.count({ where: { productId } });

  return prisma.$transaction(
    images.map((img, index) =>
      prisma.productImage.create({
        data: {
          productId,
          url: img.url,
          publicId: img.publicId,
          isPrimary: existingCount === 0 && index === 0,
          order: existingCount + index,
        },
      })
    )
  );
}

// ================================
// DELETE PRODUCT IMAGE (Admin)
// ================================

export async function deleteProductImage(productId: string, imageId: string) {
  const image = await prisma.productImage.findFirst({
    where: { id: imageId, productId },
  });

  if (!image) throw createError('Image introuvable', 404);

  await deleteCloudinaryFile(image.publicId).catch(console.error);
  await prisma.productImage.delete({ where: { id: imageId } });
}

// ================================
// GET CATEGORIES
// ================================

export async function getCategories() {
  return prisma.category.findMany({ include: { _count: { select: { products: true } } } });
}

export async function createCategory(data: {
  name: string;
  description?: string;
  imageUrl?: string;
  imagePublicId?: string;
}) {
  return prisma.category.create({ data: { ...data, slug: slugify(data.name) } });
}

// ================================
// UPDATE CATEGORY (Admin)
// ================================

export async function updateCategory(
  id: string,
  data: { name?: string; description?: string; imageUrl?: string; imagePublicId?: string }
) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw createError('Categorie introuvable', 404);

  const updateData: Record<string, unknown> = { ...data };
  if (data.name) updateData.slug = slugify(data.name);

  if (data.imagePublicId && existing.imagePublicId && existing.imagePublicId !== data.imagePublicId) {
    await deleteCloudinaryFile(existing.imagePublicId).catch(console.error);
  }

  return prisma.category.update({ where: { id }, data: updateData });
}

// ================================
// DELETE CATEGORY (Admin)
// ================================

export async function deleteCategory(id: string) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });

  if (!category) throw createError('Categorie introuvable', 404);

  if (category._count.products > 0) {
    throw createError(
      `Impossible de supprimer : ${category._count.products} produit(s) utilisent cette categorie. Reaffectez-les d'abord.`,
      409
    );
  }

  if (category.imagePublicId) {
    await deleteCloudinaryFile(category.imagePublicId).catch(console.error);
  }

  await prisma.category.delete({ where: { id } });
}
