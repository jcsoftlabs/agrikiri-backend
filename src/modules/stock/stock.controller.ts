import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as stockService from './stock.service';
import {
  assignOrderDeliverySchema,
  createBuyerStockShipmentSchema,
  createStockManagerReportSchema,
  updateStockQuantitySchema,
} from './stock.schema';

export async function getStockDashboard(_req: AuthRequest, res: Response) {
  const data = await stockService.getStockDashboard();
  res.json({ success: true, data });
}

export async function createBuyerStockShipment(req: AuthRequest, res: Response) {
  const payload = createBuyerStockShipmentSchema.parse(req.body);
  const data = await stockService.createBuyerStockShipment(req.user!.userId, payload);
  res.status(201).json({ success: true, message: 'Expédition stock envoyée', data });
}

export async function getMyBuyerStockShipments(req: AuthRequest, res: Response) {
  const data = await stockService.getBuyerStockShipments(req.user!.userId);
  res.json({ success: true, data });
}

export async function confirmBuyerStockShipment(req: AuthRequest, res: Response) {
  const data = await stockService.confirmBuyerStockShipment(req.params.id, req.user!.userId);
  res.json({ success: true, message: 'Réception stock confirmée', data });
}

export async function updateStockQuantity(req: AuthRequest, res: Response) {
  const payload = updateStockQuantitySchema.parse(req.body);
  const data = await stockService.updateStockQuantity(req.user!.userId, payload);
  res.json({ success: true, message: 'Stock mis à jour', data });
}

export async function assignOrderToDelivery(req: AuthRequest, res: Response) {
  const payload = assignOrderDeliverySchema.parse(req.body);
  const data = await stockService.assignOrderToDelivery(req.params.id, payload);
  res.json({ success: true, message: 'Commande assignée au livreur', data });
}

export async function createStockManagerReport(req: AuthRequest, res: Response) {
  const payload = createStockManagerReportSchema.parse(req.body);
  const data = await stockService.createStockManagerReport(req.user!.userId, payload);
  res.status(201).json({ success: true, message: 'Rapport stock publié', data });
}

export async function getBoardStockReports(_req: AuthRequest, res: Response) {
  const data = await stockService.getBoardStockReports();
  res.json({ success: true, data });
}
