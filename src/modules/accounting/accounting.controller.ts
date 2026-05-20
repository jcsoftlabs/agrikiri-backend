import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as accountingService from './accounting.service';
import { closeAccountingPeriodSchema, validateOutflowSchema } from './accounting.schema';

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

export async function reconcileCashOrder(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await accountingService.reconcileCashOrder(req.params.id, req.user!.userId);
    res.json({ success: true, message: 'Commande cash rapprochée', data });
  } catch (error) {
    next(error);
  }
}

export async function validateOutflow(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = validateOutflowSchema.parse(req.body);
    const data = await accountingService.validateOutflow(req.user!.userId, payload);
    res.json({ success: true, message: 'Sortie validée', data });
  } catch (error) {
    next(error);
  }
}

export async function markDossierExecuted(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await accountingService.markDossierExecuted(req.params.id, req.user!.userId);
    res.json({ success: true, message: 'Dossier pointé comme exécuté', data });
  } catch (error) {
    next(error);
  }
}

export async function closePeriod(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = closeAccountingPeriodSchema.parse(req.body);
    const data = await accountingService.closeAccountingPeriod(
      req.user!.userId,
      payload.range,
      payload.startDate,
      payload.endDate,
      payload.note
    );
    res.status(201).json({ success: true, message: 'Période comptable clôturée', data });
  } catch (error) {
    next(error);
  }
}

export async function exportJournal(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { range, startDate, endDate } = req.query;
    const csv = await accountingService.exportAccountingJournal(
      (range as string) || '30d',
      startDate as string | undefined,
      endDate as string | undefined
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="journal-comptable-${Date.now()}.csv"`);
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
}

export async function getAccountingJournal(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { range, startDate, endDate, method, type, direction, status, page, pageSize } = req.query;
    const data = await accountingService.getAccountingJournal({
      range: range as string | undefined,
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      method: method as string | undefined,
      type: type as string | undefined,
      direction: direction as 'INFLOW' | 'OUTFLOW' | undefined,
      status: status as string | undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
