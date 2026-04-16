import { Router } from 'express';
import * as ordersController from './orders.controller';
import { authenticate, requireAdmin, requireRole } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.post('/', ordersController.createOrder);
router.get('/', ordersController.getMyOrders);
router.get('/delivery/my-assignments', requireRole('DELIVERY_AGENT'), ordersController.getMyDeliveryAssignments);
router.get('/all', requireAdmin, ordersController.getAllOrders);
router.post('/:id/verify-payment', ordersController.verifyOrderPayment);
router.get('/:id', ordersController.getOrderById);
router.patch('/:id/delivery-status', requireRole('DELIVERY_AGENT'), ordersController.updateMyDeliveryStatus);
router.patch('/:id/status', requireAdmin, ordersController.updateOrderStatus);
router.patch('/:id/tracking', requireAdmin, ordersController.updateOrderTracking);

export default router;
