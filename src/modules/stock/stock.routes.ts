import { Router } from 'express';
import { authenticate, requireAssociate, requireBuyer, requireRole } from '../../middleware/auth.middleware';
import * as controller from './stock.controller';

const router = Router();
const asyncHandler =
  (handler: any) =>
  (req: any, res: any, next: any) =>
    Promise.resolve(handler(req, res, next)).catch(next);

router.use(authenticate);

router.get('/dashboard', requireRole('STOCK_MANAGER', 'ADMIN'), asyncHandler(controller.getStockDashboard));
router.post('/buyer-shipments', requireBuyer, asyncHandler(controller.createBuyerStockShipment));
router.get('/buyer-shipments/my', requireBuyer, asyncHandler(controller.getMyBuyerStockShipments));
router.post('/buyer-shipments/:id/confirm', requireRole('STOCK_MANAGER', 'ADMIN'), asyncHandler(controller.confirmBuyerStockShipment));
router.patch('/quantities', requireRole('STOCK_MANAGER', 'ADMIN'), asyncHandler(controller.updateStockQuantity));
router.patch('/orders/:id/assign-delivery', requireRole('STOCK_MANAGER', 'ADMIN'), asyncHandler(controller.assignOrderToDelivery));
router.post('/reports', requireRole('STOCK_MANAGER', 'ADMIN'), asyncHandler(controller.createStockManagerReport));
router.get('/board/reports', requireAssociate, asyncHandler(controller.getBoardStockReports));

export default router;
