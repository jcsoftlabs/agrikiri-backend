import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as buyerService from './buyers.service';
import { createBuyerAllocationSchema, createBuyerExpenseReportSchema, createBuyerFundRequestSchema } from './buyers.schema';

export async function getBoardOverview(_req: AuthRequest, res: Response) {
  const data = await buyerService.getBoardOverview();
  res.json({ success: true, data });
}

export async function createAllocation(req: AuthRequest, res: Response) {
  const data = createBuyerAllocationSchema.parse(req.body);
  const allocation = await buyerService.createAllocation(req.user!.userId, data);
  res.status(201).json({ success: true, message: 'Montant alloué à l’acheteur', data: allocation });
}

export async function getMyDashboard(req: AuthRequest, res: Response) {
  const data = await buyerService.getBuyerDashboard(req.user!.userId);
  res.json({ success: true, data });
}

export async function confirmReceipt(req: AuthRequest, res: Response) {
  const allocation = await buyerService.confirmAllocationReceipt(req.params.id, req.user!.userId);
  res.json({ success: true, message: 'Réception confirmée', data: allocation });
}

export async function submitExpenseReport(req: AuthRequest, res: Response) {
  const data = createBuyerExpenseReportSchema.parse(req.body);
  const report = await buyerService.createExpenseReport(req.params.id, req.user!.userId, data);
  res.status(201).json({ success: true, message: 'Rapport de dépenses envoyé', data: report });
}

export async function createFundRequest(req: AuthRequest, res: Response) {
  const data = createBuyerFundRequestSchema.parse(req.body);
  const request = await buyerService.createFundRequest(req.user!.userId, data);
  res.status(201).json({ success: true, message: 'Demande de fonds envoyée', data: request });
}

export async function declineFundRequest(req: AuthRequest, res: Response) {
  const request = await buyerService.declineFundRequest(req.params.id, req.user!.userId, req.body?.reviewNote);
  res.json({ success: true, message: 'Demande de fonds refusée', data: request });
}
