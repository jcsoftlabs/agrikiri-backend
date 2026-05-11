import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { cloudinary } from '../config/cloudinary';

// ================================
// STORAGE CONFIGURATIONS
// ================================

const productStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'agrikiri/products',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'fill', quality: 'auto', fetch_format: 'auto' }],
  } as any,
});

const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'agrikiri/avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face', quality: 'auto', fetch_format: 'auto' }],
  } as any,
});

const categoryStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'agrikiri/categories',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 600, height: 400, crop: 'fill', quality: 'auto', fetch_format: 'auto' }],
  } as any,
});

const deliveryProofStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'agrikiri/delivery-proofs',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1400, height: 1400, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
  } as any,
});

const dossierStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'agrikiri/associates/dossiers',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx'],
  } as any,
});

// ================================
// FILE FILTER
// ================================

const imageFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Format de fichier non autorisé. Utilisez JPG, PNG ou WebP.'));
  }
};

const documentFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  const allowedMimes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Format de fichier non autorisé. Utilisez PDF, Word, Excel ou Image.'));
  }
};

// ================================
// MULTER INSTANCES
// ================================

export const uploadProductImages = multer({
  storage: productStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
}).array('images', 10);

export const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
}).single('avatar');

export const uploadCategoryImage = multer({
  storage: categoryStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
}).single('image');

export const uploadDeliveryProof = multer({
  storage: deliveryProofStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 8 * 1024 * 1024 },
}).single('file');

export const uploadDossierDocument = multer({
  storage: dossierStorage,
  fileFilter: documentFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
}).single('file');
