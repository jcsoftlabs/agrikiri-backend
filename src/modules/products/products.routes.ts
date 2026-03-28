import { Router } from 'express';
import * as productsController from './products.controller';
import { authenticate, requireAdmin } from '../../middleware/auth.middleware';

const router = Router();

// ─── Routes publiques ────────────────────────────────────────────────────────

// Catégories — doit être AVANT /:slug pour éviter le conflit Express
router.get('/categories', productsController.getCategories);
// Liste des produits
router.get('/', productsController.getProducts);
// Détail produit par slug — en dernier parmi les GET publics
router.get('/:slug', productsController.getProductBySlug);

// ─── Routes admin — Catégories (avant les routes /:id génériques) ─────────────

router.post('/categories', authenticate, requireAdmin, productsController.createCategory);
router.patch('/categories/:id', authenticate, requireAdmin, productsController.updateCategory);
router.delete('/categories/:id', authenticate, requireAdmin, productsController.deleteCategory);

// ─── Routes admin — Produits ──────────────────────────────────────────────────

router.post('/', authenticate, requireAdmin, productsController.createProduct);
router.patch('/:id', authenticate, requireAdmin, productsController.updateProduct);
router.delete('/:id', authenticate, requireAdmin, productsController.deleteProduct);
router.post('/:id/images', authenticate, requireAdmin, productsController.addProductImages);
router.delete('/:id/images/:imageId', authenticate, requireAdmin, productsController.deleteProductImage);

export default router;
