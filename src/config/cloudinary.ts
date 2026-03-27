import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export { cloudinary };

export async function deleteCloudinaryFile(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId);
    console.log(`🗑️ Fichier Cloudinary supprimé: ${publicId}`);
  } catch (error) {
    console.error(`❌ Erreur suppression Cloudinary: ${publicId}`, error);
    throw error;
  }
}
