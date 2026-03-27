import { Router } from 'express';
import * as ordersController from './orders.controller';
import { authenticate, requireAdmin } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.post('/', ordersController.createOrder);
router.get('/', ordersController.getMyOrders);
router.get('/all', requireAdmin, ordersController.getAllOrders);
router.get('/:id', ordersController.getOrderById);
router.patch('/:id/status', requireAdmin, ordersController.updateOrderStatus);

export default router;
