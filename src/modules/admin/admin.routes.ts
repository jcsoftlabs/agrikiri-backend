import { Router } from 'express';
import * as adminController from './admin.controller';
import { authenticate, requireAdmin } from '../../middleware/auth.middleware';

const router = Router();

// Toutes les routes admin nécessitent l'authentification et le rôle ADMIN
router.use(authenticate, requireAdmin);

router.get('/dashboard-stats', adminController.getDashboardStats);
router.get('/users', adminController.getUsersList);

export default router;
