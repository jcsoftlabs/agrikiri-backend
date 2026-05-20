import { Router } from 'express';
import { authenticate, requireAccountingAccess } from '../../middleware/auth.middleware';
import * as accountingController from './accounting.controller';

const router = Router();

router.use(authenticate, requireAccountingAccess);

router.get('/dashboard', accountingController.getAccountingDashboard);

export default router;
