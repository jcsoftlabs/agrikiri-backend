import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as ordersService from './orders.service';
import PDFDocument from 'pdfkit';

const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://agrikiri.vercel.app').replace(/\/+$/, '');
const LOGO_URL = `${FRONTEND_URL}/images/logo.png`;
const COMPANY_PHONE = '+509 2999-3636';
const COMPANY_EMAIL = 'info@agrikiri.com';
let invoiceLogoCache: Buffer | null = null;

function formatCurrency(amount: number | string | null | undefined) {
  return `${Number(amount || 0).toLocaleString('fr-FR')} HTG`;
}

function formatPaymentMethod(method?: string | null) {
  const labels: Record<string, string> = {
    PLOPPLOP: 'PLOP PLOP',
    MONCASH: 'MonCash',
    NATCASH: 'NatCash',
    KASHPAW: 'Kashpaw',
    CASH: 'Paiement à la livraison',
  };

  return method ? labels[method] || method : 'Non renseigné';
}

function formatStatus(status?: string | null) {
  const labels: Record<string, string> = {
    PENDING: 'En attente',
    PROCESSING: 'En préparation',
    SHIPPED: 'Expédiée',
    DELIVERED: 'Livrée',
    DELIVERY_FAILED: 'Échec de livraison',
    CANCELLED: 'Annulée',
    PAID: 'Payée',
    FAILED: 'Échoué',
  };

  return status ? labels[status] || status : 'Non renseigné';
}

function drawKeyValue(doc: any, label: string, value: string) {
  doc.font('Helvetica-Bold').text(label, { continued: true });
  doc.font('Helvetica').text(` ${value}`);
}

async function getInvoiceLogoBuffer() {
  if (invoiceLogoCache) return invoiceLogoCache;

  try {
    const response = await fetch(LOGO_URL);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    invoiceLogoCache = Buffer.from(arrayBuffer);
    return invoiceLogoCache;
  } catch {
    return null;
  }
}

export async function createOrder(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = ordersService.createOrderSchema.parse(req.body);
    const order = await ordersService.createOrder(req.user!.userId, data);
    res.status(201).json({ success: true, message: 'Commande créée avec succès', data: order });
  } catch (error) { next(error); }
}

export async function verifyOrderPayment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const isAdmin = req.user!.role === 'ADMIN';
    const result = await ordersService.verifyOrderPayment(req.params.id, req.user!.userId, isAdmin);
    res.json({ success: true, message: 'Vérification du paiement effectuée', data: result });
  } catch (error) { next(error); }
}

export async function markOrderPaymentFailed(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const isAdmin = req.user!.role === 'ADMIN';
    const order = await ordersService.markOrderPaymentFailed(
      req.params.id,
      req.user!.userId,
      isAdmin,
      typeof req.body?.reason === 'string' ? req.body.reason : undefined
    );
    res.json({ success: true, message: 'Paiement marqué comme non confirmé', data: order });
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

export async function downloadOrderInvoice(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const isAdmin = req.user!.role === 'ADMIN';
    const order = await ordersService.getOrderById(req.params.id, req.user!.userId, isAdmin);
    const deliveryAddress = (order.deliveryAddress || {}) as Record<string, string | undefined>;
    const filename = `Facture_${order.orderNumber}.pdf`;
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const logoBuffer = await getInvoiceLogoBuffer();

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/pdf');

    doc.pipe(res);

    if (logoBuffer) {
      doc.image(logoBuffer, 50, 45, { fit: [120, 50] });
    }

    doc
      .fillColor('#183222')
      .fontSize(24)
      .font('Helvetica-Bold')
      .text('FACTURE AGRIKIRI', logoBuffer ? 190 : 50, 55);

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#6b7280')
      .text(`Générée le ${new Date().toLocaleString('fr-FR')}`, 50, logoBuffer ? 72 : 85, { align: 'right' });

    doc.y = logoBuffer ? 125 : 115;
    doc.moveDown(1.2);

    doc
      .fillColor('#111827')
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Informations commande');
    doc.moveDown(0.5);
    drawKeyValue(doc, 'Commande :', order.orderNumber);
    drawKeyValue(doc, 'Date :', new Date(order.createdAt).toLocaleDateString('fr-FR'));
    drawKeyValue(doc, 'Statut commande :', formatStatus(order.status));
    drawKeyValue(doc, 'Statut paiement :', formatStatus(order.paymentStatus));
    drawKeyValue(doc, 'Paiement :', formatPaymentMethod(order.paymentMethod));

    doc.moveDown(1.2);
    doc.font('Helvetica-Bold').text('Client');
    doc.moveDown(0.5);
    drawKeyValue(doc, 'Nom :', `${order.customer?.firstName || ''} ${order.customer?.lastName || ''}`.trim() || 'Non renseigné');
    drawKeyValue(doc, 'Email :', order.customer?.email || 'Non renseigné');
    drawKeyValue(doc, 'Téléphone :', order.customer?.phone || 'Non renseigné');

    doc.moveDown(1.2);
    doc.font('Helvetica-Bold').text('Adresse de livraison');
    doc.moveDown(0.5);
    [
      deliveryAddress.fullName,
      deliveryAddress.phoneCountryCode && deliveryAddress.phoneNumber
        ? `${deliveryAddress.phoneCountryCode} ${deliveryAddress.phoneNumber}`
        : undefined,
      deliveryAddress.addressLine1,
      deliveryAddress.addressLine2,
      [deliveryAddress.city, deliveryAddress.stateRegion].filter(Boolean).join(', '),
      deliveryAddress.postalCode,
      deliveryAddress.countryCode,
    ]
      .filter(Boolean)
      .forEach((line) => {
        doc.font('Helvetica').text(String(line), { lineGap: 2 });
      });

    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').text('Articles');
    doc.moveDown(0.5);

    const tableTop = doc.y;
    doc.font('Helvetica-Bold');
    doc.text('Produit', 50, tableTop);
    doc.text('Qté', 320, tableTop, { width: 40, align: 'right' });
    doc.text('P.U.', 380, tableTop, { width: 70, align: 'right' });
    doc.text('Total', 470, tableTop, { width: 75, align: 'right' });
    doc.moveTo(50, tableTop + 18).lineTo(545, tableTop + 18).strokeColor('#d1d5db').stroke();

    let rowY = tableTop + 28;
    for (const item of order.items || []) {
      const label = item.productVariant?.label ? `${item.product?.name} (${item.productVariant.label})` : item.product?.name;
      const unitPrice = Number(item.unitPrice);
      const lineTotal = unitPrice * item.quantity;
      doc.font('Helvetica').fillColor('#111827').text(label || 'Produit', 50, rowY, { width: 250 });
      doc.text(String(item.quantity), 320, rowY, { width: 40, align: 'right' });
      doc.text(formatCurrency(unitPrice), 380, rowY, { width: 70, align: 'right' });
      doc.text(formatCurrency(lineTotal), 470, rowY, { width: 75, align: 'right' });
      rowY += 24;
      if (rowY > 720) {
        doc.addPage();
        rowY = 70;
      }
    }

    doc.moveTo(320, rowY + 8).lineTo(545, rowY + 8).strokeColor('#d1d5db').stroke();
    rowY += 20;
    doc.font('Helvetica').text('Sous-total', 360, rowY, { width: 90, align: 'right' });
    doc.text(formatCurrency(Number(order.subtotalAmount ?? order.totalAmount)), 470, rowY, { width: 75, align: 'right' });
    rowY += 18;
    doc.text('Livraison', 360, rowY, { width: 90, align: 'right' });
    doc.text(formatCurrency(Number(order.deliveryFee ?? 0)), 470, rowY, { width: 75, align: 'right' });
    rowY += 22;
    doc.font('Helvetica-Bold').fillColor('#183222').text('Total', 360, rowY, { width: 90, align: 'right' });
    doc.text(formatCurrency(Number(order.totalAmount)), 470, rowY, { width: 75, align: 'right' });

    doc.moveDown(3);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#6b7280')
      .text('Merci d’avoir commandé chez AGRIKIRI. Cette facture est fournie à titre de justificatif de commande.', 50, doc.y + 20, {
        width: 495,
        align: 'center',
      });
    doc
      .moveDown(1.1)
      .fontSize(9)
      .text(`Contact AGRIKIRI : ${COMPANY_PHONE} • ${COMPANY_EMAIL}`, {
        width: 495,
        align: 'center',
      });

    doc.end();
  } catch (error) { next(error); }
}

export async function updateOrderStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status, paymentStatus } = req.body;
    const order = await ordersService.updateOrderStatus(req.params.id, status, paymentStatus);
    res.json({ success: true, message: 'Statut mis à jour', data: order });
  } catch (error) { next(error); }
}

export async function updateOrderTracking(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = ordersService.updateOrderTrackingSchema.parse(req.body);
    const order = await ordersService.updateOrderTracking(req.params.id, data);
    res.json({ success: true, message: 'Suivi logistique mis à jour', data: order });
  } catch (error) { next(error); }
}

export async function getMyDeliveryAssignments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const orders = await ordersService.getDeliveryAgentOrders(req.user!.userId);
    res.json({ success: true, data: orders });
  } catch (error) { next(error); }
}

export async function updateMyDeliveryStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = ordersService.deliveryAgentStatusSchema.parse(req.body);
    const order = await ordersService.updateDeliveryAgentOrderStatus(req.params.id, req.user!.userId, data.status, data);
    res.json({ success: true, message: 'Statut livraison mis à jour', data: order });
  } catch (error) { next(error); }
}

export async function getAllOrders(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit, status, paymentStatus, deliveryAgentId } = req.query;
    const result = await ordersService.getAllOrders({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      status: status as string,
      paymentStatus: paymentStatus as string,
      deliveryAgentId: deliveryAgentId as string | undefined,
    });
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
}
