import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as ordersService from './orders.service';

export async function createOrder(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = ordersService.createOrderSchema.parse(req.body);
    const order = await ordersService.createOrder(req.user!.userId, data);
    res.status(201).json({ success: true, message: 'Commande créée avec succès', data: order });
  } catch (error) { next(error); }
}

export async function getMyOrders(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = req.query;
    const result = await ordersService.getMyOrders(req.user!.userId, Number(page) || 1, Number(limit) || 10);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
}

export async function getOrderById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const isAdmin = req.user!.role === 'ADMIN';
    const order = await ordersService.getOrderById(req.params.id, req.user!.userId, isAdmin);
    res.json({ success: true, data: order });
  } catch (error) { next(error); }
}

export async function updateOrderStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status, paymentStatus } = req.body;
    const order = await ordersService.updateOrderStatus(req.params.id, status, paymentStatus);
    res.json({ success: true, message: 'Statut mis à jour', data: order });
  } catch (error) { next(error); }
}

export async function getAllOrders(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit, status, paymentStatus } = req.query;
    const result = await ordersService.getAllOrders({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      status: status as string,
      paymentStatus: paymentStatus as string,
    });
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
}
