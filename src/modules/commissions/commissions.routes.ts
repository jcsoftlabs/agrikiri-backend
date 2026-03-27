import { Router } from 'express';
import * as commissionsController from './commissions.controller';
import { authenticate, requireAdmin } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

// AYIZAN routes
router.get('/', commissionsController.getMyCommissions);
router.get('/summary', commissionsController.getMySummary);

// Admin routes
router.get('/all', requireAdmin, commissionsController.getAllCommissions);
router.get('/export', requireAdmin, commissionsController.exportCsv);
router.post('/validate', requireAdmin, commissionsController.validateCommissions);
router.post('/pay', requireAdmin, commissionsController.payCommissions);

export default router;
