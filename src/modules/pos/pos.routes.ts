import { Router } from 'express';
import * as controller from './pos.controller';
import { authenticate, requireAdmin } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/', controller.listPosSales);
router.post('/', controller.createPosSale);
router.get('/:id/document', controller.downloadPosDocument);
router.get('/:id', controller.getPosSaleById);

export default router;
