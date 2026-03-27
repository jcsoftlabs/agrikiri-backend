import { Request, Response, NextFunction } from 'express';
import { registerSchema, loginSchema, refreshSchema } from './auth.schema';
import * as authService from './auth.service';
import { AuthRequest } from '../../middleware/auth.middleware';

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = registerSchema.parse(req.body);
    const result = await authService.registerUser(data);

    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès ! Bienvenue sur AGRIKIRI.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = loginSchema.parse(req.body);
    const result = await authService.loginUser(data);

    res.status(200).json({
      success: true,
      message: 'Connexion réussie',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const result = await authService.refreshAccessToken(refreshToken);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function becomeAyizan(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const result = await authService.becomeAyizan(userId);

    res.status(200).json({
      success: true,
      message: 'Félicitations ! Vous êtes maintenant membre AYIZAN.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function me(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { prisma } = await import('../../config/database');
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        mlmLevel: true,
        personalVolume: true,
        referralCode: true,
        monthsAtCurrentLevel: true,
        createdAt: true,
        sponsor: {
          select: { id: true, firstName: true, lastName: true, referralCode: true },
        },
      },
    });

    if (!user) {
      res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
      return;
    }

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}
