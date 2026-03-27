import { Request, Response, NextFunction } from 'express';
import { cloudinary } from '../../config/cloudinary';

export async function uploadProductImages(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ success: false, message: 'Aucune image fournie' });
      return;
    }

    const uploadedImages = (files as any[]).map((file) => ({
      url: file.path,
      publicId: file.filename,
    }));

    res.status(200).json({
      success: true,
      message: `${uploadedImages.length} image(s) uploadée(s) avec succès`,
      data: uploadedImages,
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const file = req.file as any;
    if (!file) {
      res.status(400).json({ success: false, message: 'Aucun avatar fourni' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Avatar uploadé avec succès',
      data: { url: file.path, publicId: file.filename },
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadCategoryImage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const file = req.file as any;
    if (!file) {
      res.status(400).json({ success: false, message: 'Aucune image fournie' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Image de catégorie uploadée avec succès',
      data: { url: file.path, publicId: file.filename },
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteFile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { publicId } = req.params;
    if (!publicId) {
      res.status(400).json({ success: false, message: 'publicId requis' });
      return;
    }

    await cloudinary.uploader.destroy(decodeURIComponent(publicId));

    res.status(200).json({
      success: true,
      message: 'Fichier supprimé avec succès de Cloudinary',
    });
  } catch (error) {
    next(error);
  }
}
