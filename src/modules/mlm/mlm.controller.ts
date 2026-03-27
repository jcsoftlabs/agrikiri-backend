import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as mlmService from './mlm.service';

export async function getMyNetwork(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await mlmService.getMyNetwork(req.user!.userId);
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function getMyStats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await mlmService.getMyMlmStats(req.user!.userId);
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function getLeaderboard(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const year = Number(req.query.year) || new Date().getFullYear();
    const data = await mlmService.getMlmLeaderboard(month, year);
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function getUserTree(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await mlmService.getUserMlmTree(req.params.userId);
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function validateQuota(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { month, year } = req.body;
    const currentMonth = month || new Date().getMonth() + 1;
    const currentYear = year || new Date().getFullYear();
    const result = await mlmService.validateMonthlyQuota(currentMonth, currentYear);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
}

export async function getGlobalStats(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await mlmService.getMlmGlobalStats();
    res.json({ success: true, data });
  } catch (error) { next(error); }
}
