import { prisma } from '../../config/database';
import { deleteCloudinaryFile } from '../../config/cloudinary';
import { createError } from '../../middleware/error.middleware';
import { z } from 'zod';

// ================================
// SCHEMAS
// ================================

export const createProductSchema = z.object({
  name: z.string().min(2, 'Nom trop court'),
  description: z.string().min(10, 'Description trop courte'),
  price: z.number().positive('Prix doit être positif'),
  weightLbs: z.number().positive('Poids doit être positif'),
  stockQuantity: z.number().int().min(0),
  categoryId: z.string().uuid('ID de catégorie invalide'),
  vpPoints: z.number().positive('Points VP doivent être positifs'),
  images: z
    .array(z.object({ url: z.string().url(), publicId: z.string() }))
    .min(1, 'Au moins une image requise'),
  isActive: z.boolean().optional().default(true),
});

export const updateProductSchema = createProductSchema.partial();

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
  } = filters;

  const skip = (page - 1) * limit;

  const adminMode = (filters as any).adminMode === true;
  const where: any = adminMode ? {} : { isActive: true };

  if (categoryId) where.categoryId = categoryId;
  if (minPrice !== undefined) where.price = { ...where.price, gte: minPrice };
  if (maxPrice !== undefined) where.price = { ...where.price, lte: maxPrice };
  if (search)
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: { order: 'asc' } },
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
    },
  });

  if (!product || !product.isActive) throw createError('Produit introuvable', 404);

  return product;
}

// ================================
// CREATE PRODUCT (Admin)
// ================================

export async function createProduct(data: z.infer<typeof createProductSchema>) {
  const { images, ...productData } = data;

  // Auto-generate slug
  const slug = productData.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const product = await prisma.product.create({
    data: {
      ...productData,
      slug,
      price: productData.price,
      weightLbs: productData.weightLbs,
      vpPoints: productData.vpPoints,
      images: {
        create: images.map((img, index) => ({
          url: img.url,
          publicId: img.publicId,
          isPrimary: index === 0,
          order: index,
        })),
      },
    },
    include: { images: true, category: true },
  });

  return product;
}

// ================================
// UPDATE PRODUCT (Admin)
// ================================

export async function updateProduct(id: string, data: z.infer<typeof updateProductSchema>) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw createError('Produit introuvable', 404);

  const { images, ...productData } = data;

  const product = await prisma.product.update({
    where: { id },
    data: productData as any,
    include: { images: true, category: true },
  });

  return product;
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

  // Supprimer images Cloudinary
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

  const newImages = await prisma.$transaction(
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

  return newImages;
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
  const slug = data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return prisma.category.create({ data: { ...data, slug } });
}

// ================================
// UPDATE CATEGORY (Admin)
// ================================

export async function updateCategory(
  id: string,
  data: { name?: string; description?: string; imageUrl?: string; imagePublicId?: string }
) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw createError('Catégorie introuvable', 404);

  const updateData: any = { ...data };
  if (data.name) {
    updateData.slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  // Si on change l'image, supprimer l'ancienne sur Cloudinary
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

  if (!category) throw createError('Catégorie introuvable', 404);

  if (category._count.products > 0) {
    throw createError(
      `Impossible de supprimer : ${category._count.products} produit(s) utilisent cette catégorie. Réaffectez-les d'abord.`,
      409
    );
  }

  // Supprimer image Cloudinary si elle existe
  if (category.imagePublicId) {
    await deleteCloudinaryFile(category.imagePublicId).catch(console.error);
  }

  await prisma.category.delete({ where: { id } });
}
