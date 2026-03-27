import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('❌ Erreur:', err);

  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: 'Données invalides',
      errors: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Prisma unique constraint errors
  if (err.message.includes('Unique constraint')) {
    res.status(409).json({
      success: false,
      message: 'Cette valeur existe déjà dans le système',
    });
    return;
  }

  // Multer errors
  if (err.message.includes('Format de fichier') || err.message.includes('File too large')) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
    return;
  }

  const statusCode = err.statusCode || 500;
  const message =
    err.isOperational
      ? err.message
      : 'Une erreur interne est survenue. Veuillez réessayer.';

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

export function createError(message: string, statusCode: number): AppError {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: `Route non trouvée: ${req.originalUrl}`,
  });
}
