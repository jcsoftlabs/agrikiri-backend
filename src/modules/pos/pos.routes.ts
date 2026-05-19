import { Router } from 'express';
import * as controller from './pos.controller';
import { authenticate, requirePosAccess } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate, requirePosAccess);

router.get('/', controller.listPosSales);
router.post('/', controller.createPosSale);
router.get('/:id/document', controller.downloadPosDocument);
router.get('/:id', controller.getPosSaleById);

export default router;
