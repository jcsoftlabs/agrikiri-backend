import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as accountingService from './accounting.service';

export async function getAccountingDashboard(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { range, startDate, endDate } = req.query;
    const data = await accountingService.getAccountingDashboard(
      (range as string) || '30d',
      startDate as string | undefined,
      endDate as string | undefined
    );

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
