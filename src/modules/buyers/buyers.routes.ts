import { Router } from 'express';
import * as controller from './buyers.controller';
import { authenticate, requireAssociate, requireBuyer, requirePdg } from '../../middleware/auth.middleware';

const router = Router();
const asyncHandler =
  (handler: any) =>
  (req: any, res: any, next: any) =>
    Promise.resolve(handler(req, res, next)).catch(next);

router.use(authenticate);

router.get('/board/overview', requireAssociate, asyncHandler(controller.getBoardOverview));
router.post('/allocations', requirePdg, asyncHandler(controller.createAllocation));

router.get('/my/dashboard', requireBuyer, asyncHandler(controller.getMyDashboard));
router.post('/allocations/:id/confirm', requireBuyer, asyncHandler(controller.confirmReceipt));
router.post('/allocations/:id/reports', requireBuyer, asyncHandler(controller.submitExpenseReport));

export default router;
