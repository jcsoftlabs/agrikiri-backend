import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as deliveryReportsService from './delivery-reports.service';
import { createDeliveryReportSchema } from './delivery-reports.schema';

export async function createMyDeliveryReport(req: AuthRequest, res: Response) {
  const data = createDeliveryReportSchema.parse(req.body);
  const report = await deliveryReportsService.createDeliveryReport(req.user!.userId, data);
  res.status(201).json({ success: true, message: 'Rapport livreur envoyé', data: report });
}

export async function getMyDeliveryReports(req: AuthRequest, res: Response) {
  const reports = await deliveryReportsService.getMyDeliveryReports(req.user!.userId);
  res.json({ success: true, data: reports });
}

export async function getBoardDeliveryReports(_req: AuthRequest, res: Response) {
  const data = await deliveryReportsService.getBoardDeliveryReports();
  res.json({ success: true, data });
}
