import { Router } from 'express';
import { authenticate, requireAccountingAccess } from '../../middleware/auth.middleware';
import * as accountingController from './accounting.controller';

const router = Router();

router.use(authenticate, requireAccountingAccess);

router.get('/dashboard', accountingController.getAccountingDashboard);
router.get('/journal/export', accountingController.exportJournal);
router.post('/orders/:id/reconcile-cash', accountingController.reconcileCashOrder);
router.post('/outflows/validate', accountingController.validateOutflow);
router.post('/dossiers/:id/execute', accountingController.markDossierExecuted);
router.post('/periods/close', accountingController.closePeriod);

export default router;
