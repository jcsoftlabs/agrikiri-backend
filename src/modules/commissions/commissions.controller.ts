import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as commissionsService from './commissions.service';

export async function getMyCommissions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { month, year, type, status, page, limit } = req.query;
    const result = await commissionsService.getMyCommissions(req.user!.userId, {
      month: month ? Number(month) : undefined,
      year: year ? Number(year) : undefined,
      type: type as string,
      status: status as string,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
}

export async function getMySummary(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { month, year } = req.query;
    const summary = await commissionsService.getMyCommissionSummary(
      req.user!.userId,
      month ? Number(month) : undefined,
      year ? Number(year) : undefined
    );
    res.json({ success: true, data: summary });
  } catch (error) { next(error); }
}

export async function validateCommissions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { month, year } = req.body;
    const result = await commissionsService.validateCommissions(
      month || new Date().getMonth() + 1,
      year || new Date().getFullYear()
    );
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
}

export async function payCommissions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { month, year } = req.body;
    const result = await commissionsService.payCommissions(
      month || new Date().getMonth() + 1,
      year || new Date().getFullYear()
    );
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
}

export async function exportCsv(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const year = Number(req.query.year) || new Date().getFullYear();
    const csv = await commissionsService.exportCommissionsCsv(month, year);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="commissions-${month}-${year}.csv"`);
    res.send('\uFEFF' + csv); // BOM for Excel compatibility
  } catch (error) { next(error); }
}

export async function getAllCommissions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { month, year, status, page, limit } = req.query;
    const result = await commissionsService.getAllCommissions({
      month: month ? Number(month) : undefined,
      year: year ? Number(year) : undefined,
      status: status as string,
      page: Number(page) || 1,
      limit: Number(limit) || 50,
    });
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
}
