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
