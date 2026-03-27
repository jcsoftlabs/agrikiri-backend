import { Router } from 'express';
import * as mlmController from './mlm.controller';
import { authenticate, requireAyizan, requireAdmin } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

// Routes AYIZAN
router.get('/my-network', requireAyizan, mlmController.getMyNetwork);
router.get('/my-stats', mlmController.getMyStats);
router.get('/leaderboard', mlmController.getLeaderboard);

// Routes Admin
router.get('/stats', requireAdmin, mlmController.getGlobalStats);
router.get('/tree/:userId', requireAdmin, mlmController.getUserTree);
router.post('/validate-quota', requireAdmin, mlmController.validateQuota);

export default router;
