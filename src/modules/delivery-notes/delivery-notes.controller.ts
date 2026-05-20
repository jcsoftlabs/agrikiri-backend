import { Request, Response, NextFunction } from 'express';
import PDFDocument from 'pdfkit';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as deliveryNotesService from './delivery-notes.service';
import { createDeliveryNoteSchema, updateDeliveryNoteStatusSchema } from './delivery-notes.schema';

const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://agrikiri.vercel.app').replace(/\/+$/, '');
const LOGO_URL = `${FRONTEND_URL}/images/logo.png`;
const COMPANY_PHONE = '+509 2999-3636';
const COMPANY_EMAIL = 'info@agrikiri.com';
let deliveryNoteLogoCache: Buffer | null = null;

function formatWeight(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  const fixed = Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
  const [integerPart, decimalPart] = fixed.split('.');
  return `${integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${decimalPart} Lbs`;
}

async function getDeliveryLogoBuffer() {
  if (deliveryNoteLogoCache) return deliveryNoteLogoCache;

  try {
    const response = await fetch(LOGO_URL);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    deliveryNoteLogoCache = Buffer.from(arrayBuffer);
    return deliveryNoteLogoCache;
  } catch {
    return null;
  }
}

function renderDeliveryNotePdf(doc: PDFKit.PDFDocument, note: any, logoBuffer: Buffer | null) {
  doc.roundedRect(40, 36, 515, 94, 18).fill('#f4f1e8');

  if (logoBuffer) {
    doc.image(logoBuffer, 54, 51, { fit: [105, 48] });
  }

  doc.fillColor('#16341f').font('Helvetica-Bold').fontSize(23).text('BON DE LIVRAISON', logoBuffer ? 180 : 58, 53);
  doc.fillColor('#5f6f65').font('Helvetica').fontSize(10).text(
    note.sourceType === 'ORDER'
      ? 'Livraison partielle ou complète liée à une commande client'
      : 'Livraison partielle ou complète liée à une vente POS',
    logoBuffer ? 180 : 58,
    83
  );
  doc.fillColor('#16341f').font('Helvetica-Bold').fontSize(10).text(COMPANY_PHONE, 385, 58, { width: 150, align: 'right' });
  doc.fillColor('#5f6f65').font('Helvetica').fontSize(10).text(COMPANY_EMAIL, 385, 76, { width: 150, align: 'right' });

  const infoY = 150;
  doc.roundedRect(40, infoY, 246, 104, 14).fill('#ffffff');
  doc.roundedRect(309, infoY, 246, 104, 14).fill('#ffffff');

  doc.fillColor('#16341f').font('Helvetica-Bold').fontSize(11).text('Document', 56, infoY + 14);
  [
    `Numéro: ${note.noteNumber}`,
    `Date: ${new Date(note.createdAt).toLocaleString('fr-FR')}`,
    `Source: ${note.sourceType === 'ORDER' ? `Commande ${note.order?.orderNumber || ''}` : `POS ${note.posSale?.saleNumber || ''}`}`,
    `Statut: ${note.status}`,
    note.deliveryAgent ? `Livreur: ${note.deliveryAgent.firstName} ${note.deliveryAgent.lastName}` : 'Livreur: Non assigné',
  ].filter(Boolean).forEach((line, index) => {
    doc.fillColor('#334155').font('Helvetica').fontSize(10).text(line, 56, infoY + 34 + index * 15, { width: 210 });
  });

  doc.fillColor('#16341f').font('Helvetica-Bold').fontSize(11).text('Destinataire', 325, infoY + 14);
  [
    note.customerName,
    note.customerPhone || '',
    note.customerAddress || '',
  ].filter(Boolean).forEach((line, index) => {
    doc.fillColor('#334155').font('Helvetica').fontSize(10).text(line, 325, infoY + 34 + index * 15, { width: 210 });
  });

  doc.fillColor('#16341f').font('Helvetica-Bold').fontSize(12).text('Lignes livrées', 40, 278);
  const tableTop = 302;
  doc.roundedRect(40, tableTop, 515, 26, 10).fill('#16341f');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
  doc.text('Description', 54, tableTop + 8, { width: 180 });
  doc.text('Cmd', 255, tableTop + 8, { width: 42, align: 'right' });
  doc.text('Livré', 307, tableTop + 8, { width: 42, align: 'right' });
  doc.text('Reste', 359, tableTop + 8, { width: 42, align: 'right' });
  doc.text('Poids U.', 415, tableTop + 8, { width: 55, align: 'right' });
  doc.text('Poids ligne', 478, tableTop + 8, { width: 58, align: 'right' });

  let rowY = tableTop + 38;
  note.items.forEach((item: any) => {
    if (rowY > 720) {
      doc.addPage({ margin: 40, size: 'LETTER' });
      rowY = 60;
    }
    doc.roundedRect(40, rowY - 8, 515, 36, 10).fill('#fbfaf7');
    doc.fillColor('#111827').font('Helvetica').fontSize(9.5).text(item.description, 54, rowY, { width: 180 });
    doc.text(String(item.orderedQuantity), 255, rowY, { width: 42, align: 'right' });
    doc.text(String(item.deliveredQuantity), 307, rowY, { width: 42, align: 'right' });
    doc.text(String(item.remainingQuantity), 359, rowY, { width: 42, align: 'right' });
    doc.text(formatWeight(item.unitWeightLbs), 415, rowY, { width: 55, align: 'right' });
    doc.text(formatWeight(item.lineWeightLbs), 478, rowY, { width: 58, align: 'right' });
    rowY += 44;
  });

  const totalsTop = Math.max(rowY + 8, 580);
  doc.roundedRect(316, totalsTop, 239, 88, 14).fill('#f4f1e8');
  doc.fillColor('#16341f').font('Helvetica-Bold').fontSize(12).text('Chargement', 334, totalsTop + 14);
  doc.fillColor('#334155').font('Helvetica').fontSize(10);
  doc.text('Quantité totale', 334, totalsTop + 40, { width: 100 });
  doc.text(String(note.totalQuantity), 450, totalsTop + 40, { width: 85, align: 'right' });
  doc.text('Poids total', 334, totalsTop + 58, { width: 100 });
  doc.text(formatWeight(note.totalWeightLbs), 450, totalsTop + 58, { width: 85, align: 'right' });

  if (note.notes) {
    doc.fillColor('#16341f').font('Helvetica-Bold').fontSize(11).text('Notes', 40, totalsTop + 8);
    doc.fillColor('#334155').font('Helvetica').fontSize(10).text(note.notes, 40, totalsTop + 28, { width: 250, lineGap: 3 });
  }

  doc.fillColor('#64748b').font('Helvetica').fontSize(9).text(
    `Document créé par ${note.createdBy?.firstName || 'AGRIKIRI'} ${note.createdBy?.lastName || ''}`.trim(),
    40,
    770,
    { width: doc.page.width - 80, align: 'center' }
  );
}

export async function createOrderDeliveryNote(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const payload = createDeliveryNoteSchema.parse(req.body);
    const data = await deliveryNotesService.createOrderDeliveryNote(req.params.orderId, req.user!, payload);
    res.status(201).json({ success: true, message: 'Bon de livraison créé', data });
  } catch (error) {
    next(error);
  }
}

export async function createPosSaleDeliveryNote(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const payload = createDeliveryNoteSchema.parse(req.body);
    const data = await deliveryNotesService.createPosSaleDeliveryNote(req.params.posSaleId, req.user!, payload);
    res.status(201).json({ success: true, message: 'Bon de livraison créé', data });
  } catch (error) {
    next(error);
  }
}

export async function listOrderDeliveryNotes(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const data = await deliveryNotesService.listOrderDeliveryNotes(req.params.orderId, req.user!);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function listPosSaleDeliveryNotes(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const data = await deliveryNotesService.listPosSaleDeliveryNotes(req.params.posSaleId, req.user!);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function listMyDeliveryNotes(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const data = await deliveryNotesService.listMyDeliveryNotes(req.user!.userId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function updateDeliveryNoteStatus(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const payload = updateDeliveryNoteStatusSchema.parse(req.body);
    const data = await deliveryNotesService.updateDeliveryNoteStatus(req.params.id, req.user!, payload);
    res.json({ success: true, message: 'Statut du bon mis à jour', data });
  } catch (error) {
    next(error);
  }
}

export async function getDeliveryNoteById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const data = await deliveryNotesService.getDeliveryNoteById(req.params.id, req.user!);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function downloadDeliveryNotePdf(req: Request, res: Response, next: NextFunction) {
  try {
    const authReq = req as AuthRequest;
    const note = await deliveryNotesService.getDeliveryNoteById(req.params.id, authReq.user!);
    const filename = `BON_LIVRAISON_${note.noteNumber}.pdf`;
    const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
    const logoBuffer = await getDeliveryLogoBuffer();

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/pdf');

    doc.pipe(res);
    renderDeliveryNotePdf(doc, note, logoBuffer);
    doc.end();
  } catch (error) {
    next(error);
  }
}
