import { Router } from 'express';
import * as productsController from './products.controller';
import { authenticate, requireAdmin } from '../../middleware/auth.middleware';

const router = Router();

// Routes publiques — catalogue
router.get('/', productsController.getProducts);
router.get('/categories', productsController.getCategories);
router.get('/:slug', productsController.getProductBySlug);

// Routes admin
router.post('/', authenticate, requireAdmin, productsController.createProduct);
router.patch('/:id', authenticate, requireAdmin, productsController.updateProduct);
router.delete('/:id', authenticate, requireAdmin, productsController.deleteProduct);
router.post('/:id/images', authenticate, requireAdmin, productsController.addProductImages);
router.delete('/:id/images/:imageId', authenticate, requireAdmin, productsController.deleteProductImage);
router.post('/categories', authenticate, requireAdmin, productsController.createCategory);

export default router;
