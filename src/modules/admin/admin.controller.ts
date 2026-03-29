import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as adminService from './admin.service';

export async function getDashboardStats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const stats = await adminService.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}

export async function getUsersList(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit, search } = req.query;
    const users = await adminService.getUsersList(
      Number(page) || 1,
      Number(limit) || 20,
      search as string
    );
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
}

export async function createUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = adminService.createAdminUserSchema.parse(req.body);
    const user = await adminService.createUser(data);
    res.status(201).json({ success: true, message: 'Utilisateur créé avec succès', data: user });
  } catch (error) {
    next(error);
  }
}

export async function updateUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = adminService.updateAdminUserSchema.parse(req.body);
    const user = await adminService.updateUser(req.params.id, data, req.user!.userId);
    res.json({ success: true, message: 'Utilisateur mis à jour', data: user });
  } catch (error) {
    next(error);
  }
}

export async function deleteUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await adminService.deleteUser(req.params.id, req.user!.userId);
    res.json({ success: true, message: 'Utilisateur désactivé avec succès', data: user });
  } catch (error) {
    next(error);
  }
}
