import { Router } from 'express';
import { uploadProductImages, uploadAvatar, uploadCategoryImage, uploadDeliveryProof, deleteFile } from './upload.controller';
import { authenticate, requireAdmin, requireRole } from '../../middleware/auth.middleware';
import {
  uploadProductImages as productImagesMiddleware,
  uploadAvatar as avatarMiddleware,
  uploadCategoryImage as categoryImageMiddleware,
  uploadDeliveryProof as deliveryProofMiddleware,
} from '../../middleware/upload.middleware';

const router = Router();

router.post(
  '/product-images',
  authenticate,
  requireAdmin,
  (req, res, next) => {
    productImagesMiddleware(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  },
  uploadProductImages
);

router.post(
  '/avatar',
  authenticate,
  (req, res, next) => {
    avatarMiddleware(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  },
  uploadAvatar
);

router.post(
  '/category-image',
  authenticate,
  requireAdmin,
  (req, res, next) => {
    categoryImageMiddleware(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  },
  uploadCategoryImage
);

router.post(
  '/delivery-proof',
  authenticate,
  requireRole('DELIVERY_AGENT', 'ADMIN'),
  (req, res, next) => {
    deliveryProofMiddleware(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  },
  uploadDeliveryProof
);

router.delete('/:publicId', authenticate, requireAdmin, deleteFile);

export default router;
