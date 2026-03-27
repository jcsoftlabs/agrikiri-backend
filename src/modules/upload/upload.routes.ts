import { Router } from 'express';
import { uploadProductImages, uploadAvatar, uploadCategoryImage, deleteFile } from './upload.controller';
import { authenticate, requireAdmin } from '../../middleware/auth.middleware';
import {
  uploadProductImages as productImagesMiddleware,
  uploadAvatar as avatarMiddleware,
  uploadCategoryImage as categoryImageMiddleware,
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

router.delete('/:publicId', authenticate, requireAdmin, deleteFile);

export default router;
