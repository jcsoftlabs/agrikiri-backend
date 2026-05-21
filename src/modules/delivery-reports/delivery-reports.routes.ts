import { Router } from 'express';
import * as controller from './delivery-reports.controller';
import { authenticate, requireAssociate, requireRole } from '../../middleware/auth.middleware';

const router = Router();
const asyncHandler =
  (handler: any) =>
  (req: any, res: any, next: any) =>
    Promise.resolve(handler(req, res, next)).catch(next);

router.use(authenticate);

router.get('/board', requireAssociate, asyncHandler(controller.getBoardDeliveryReports));
router.get('/my', requireRole('DELIVERY_AGENT'), asyncHandler(controller.getMyDeliveryReports));
router.post('/my', requireRole('DELIVERY_AGENT'), asyncHandler(controller.createMyDeliveryReport));
router.get('/:id/document', requireRole('DELIVERY_AGENT', 'ASSOCIATE', 'ADMIN'), asyncHandler(controller.downloadDeliveryReportPdf));

export default router;
