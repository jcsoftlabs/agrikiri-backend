import { Router } from 'express';
import * as controller from './delivery-notes.controller';
import { authenticate, requireRole } from '../../middleware/auth.middleware';

const router = Router();
const asyncHandler =
  (handler: any) =>
  (req: any, res: any, next: any) =>
    Promise.resolve(handler(req, res, next)).catch(next);

router.use(authenticate);

router.get('/my', requireRole('DELIVERY_AGENT'), asyncHandler(controller.listMyDeliveryNotes));
router.post('/orders/:orderId', requireRole('ADMIN', 'STOCK_MANAGER', 'DELIVERY_AGENT'), asyncHandler(controller.createOrderDeliveryNote));
router.get('/orders/:orderId', requireRole('ADMIN', 'STOCK_MANAGER', 'DELIVERY_AGENT'), asyncHandler(controller.listOrderDeliveryNotes));
router.post('/pos-sales/:posSaleId', requireRole('ADMIN', 'CASHIER', 'STOCK_MANAGER', 'DELIVERY_AGENT'), asyncHandler(controller.createPosSaleDeliveryNote));
router.get('/pos-sales/:posSaleId', requireRole('ADMIN', 'CASHIER', 'STOCK_MANAGER', 'DELIVERY_AGENT'), asyncHandler(controller.listPosSaleDeliveryNotes));
router.get('/:id/document', requireRole('ADMIN', 'CASHIER', 'STOCK_MANAGER', 'DELIVERY_AGENT'), asyncHandler(controller.downloadDeliveryNotePdf));
router.get('/:id', requireRole('ADMIN', 'CASHIER', 'STOCK_MANAGER', 'DELIVERY_AGENT'), asyncHandler(controller.getDeliveryNoteById));
router.patch('/:id/status', requireRole('ADMIN', 'DELIVERY_AGENT'), asyncHandler(controller.updateDeliveryNoteStatus));

export default router;
