import { Router } from 'express';
import * as adminController from './admin.controller';
import { authenticate, requireAdmin } from '../../middleware/auth.middleware';

const router = Router();

// Toutes les routes admin nécessitent l'authentification et le rôle ADMIN
router.use(authenticate, requireAdmin);

router.get('/dashboard-stats', adminController.getDashboardStats);
router.get('/reports', adminController.getReports);
router.get('/reports/export', adminController.exportReportsCsv);
router.get('/users', adminController.getUsersList);
router.post('/users', adminController.createUser);
router.patch('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);

export default router;
