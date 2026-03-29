import { Request, Response, NextFunction } from 'express';
import * as productsService from './products.service';
import { AuthRequest } from '../../middleware/auth.middleware';

export async function getProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit, categoryId, minPrice, maxPrice, search, sortBy, sortOrder, adminMode } = req.query;
    const result = await productsService.getProducts({
      page: Number(page) || 1,
      limit: Number(limit) || 12,
      categoryId: categoryId as string,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      search: search as string,
      sortBy: sortBy as string,
      sortOrder: sortOrder as string,
      adminMode: String(adminMode) === 'true',
    });
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
}

export async function getProductBySlug(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const product = await productsService.getProductBySlug(req.params.slug);
    res.json({ success: true, data: product });
  } catch (error) { next(error); }
}

export async function createProduct(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = productsService.createProductSchema.parse(_req.body);
    const product = await productsService.createProduct(data);
    res.status(201).json({ success: true, message: 'Produit créé avec succès', data: product });
  } catch (error) { next(error); }
}

export async function updateProduct(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = productsService.updateProductSchema.parse(req.body);
    const product = await productsService.updateProduct(req.params.id, data);
    res.json({ success: true, message: 'Produit mis à jour', data: product });
  } catch (error) { next(error); }
}

export async function deleteProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await productsService.deleteProduct(req.params.id);
    res.json({ success: true, message: 'Produit supprimé avec succès' });
  } catch (error) { next(error); }
}

export async function addProductImages(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { images } = req.body;
    const result = await productsService.addProductImages(req.params.id, images);
    res.json({ success: true, message: 'Images ajoutées avec succès', data: result });
  } catch (error) { next(error); }
}

export async function deleteProductImage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await productsService.deleteProductImage(req.params.id, req.params.imageId);
    res.json({ success: true, message: 'Image supprimée avec succès' });
  } catch (error) { next(error); }
}

export async function getCategories(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const categories = await productsService.getCategories();
    res.json({ success: true, data: categories });
  } catch (error) { next(error); }
}

export async function createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const category = await productsService.createCategory(req.body);
    res.status(201).json({ success: true, message: 'Catégorie créée', data: category });
  } catch (error) { next(error); }
}

export async function updateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const category = await productsService.updateCategory(req.params.id, req.body);
    res.json({ success: true, message: 'Catégorie mise à jour', data: category });
  } catch (error) { next(error); }
}

export async function deleteCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await productsService.deleteCategory(req.params.id);
    res.json({ success: true, message: 'Catégorie supprimée avec succès' });
  } catch (error) { next(error); }
}
