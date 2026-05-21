import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as stockService from './stock.service';
import {
  assignOrderDeliverySchema,
  createBuyerStockShipmentSchema,
  createStockManagerReportSchema,
  updateStockQuantitySchema,
} from './stock.schema';

const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://agrikiri.vercel.app').replace(/\/+$/, '');
const LOGO_URL = `${FRONTEND_URL}/images/logo.png`;
const COMPANY_PHONE = '+509 2999-3636';
const COMPANY_EMAIL = 'info@agrikiri.com';
let stockReportLogoCache: Buffer | null = null;

function formatNumber(value: number | string | null | undefined, digits = 2) {
  const amount = Number(value || 0);
  const fixed = Number.isFinite(amount) ? amount.toFixed(digits) : Number(0).toFixed(digits);
  const [integerPart, decimalPart] = fixed.split('.');
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return digits > 0 ? `${groupedInteger},${decimalPart}` : groupedInteger;
}

function formatWeight(value: number | string | null | undefined) {
  return `${formatNumber(value, 2)} Lbs`;
}

async function getStockLogoBuffer() {
  if (stockReportLogoCache) return stockReportLogoCache;

  try {
    const response = await fetch(LOGO_URL);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    stockReportLogoCache = Buffer.from(arrayBuffer);
    return stockReportLogoCache;
  } catch {
    return null;
  }
}

function drawSectionTable(
  doc: PDFKit.PDFDocument,
  title: string,
  items: any[],
  startY: number,
  showWeight = false
) {
  let currentY = startY;

  doc.fillColor('#16341f').font('Helvetica-Bold').fontSize(12).text(title, 40, currentY);
  currentY += 22;
  doc.roundedRect(40, currentY, 515, 26, 10).fill('#16341f');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
  doc.text('Description', 54, currentY + 8, { width: 260 });
  doc.text('Quantité', 328, currentY + 8, { width: 80, align: 'right' });
  if (showWeight) {
    doc.text('Poids', 430, currentY + 8, { width: 95, align: 'right' });
  }
  currentY += 38;

  if (items.length === 0) {
    doc.fillColor('#64748b').font('Helvetica').fontSize(10).text('Aucune ligne sur cette section.', 54, currentY);
    return currentY + 26;
  }

  let totalQuantity = 0;
  let totalWeight = 0;

  items.forEach((item) => {
    if (currentY > 720) {
      doc.addPage({ margin: 40, size: 'LETTER' });
      currentY = 60;
    }

    totalQuantity += Number(item.quantity || 0);
    totalWeight += Number(item.lineWeightLbs || 0);

    doc.roundedRect(40, currentY - 8, 515, 34, 10).fill('#fbfaf7');
    doc.fillColor('#111827').font('Helvetica').fontSize(9.5).text(item.description || 'Produit', 54, currentY, {
      width: 260,
    });
    doc.text(formatNumber(item.quantity || 0, 0), 328, currentY, { width: 80, align: 'right' });
    if (showWeight) {
      doc.text(formatWeight(item.lineWeightLbs || 0), 430, currentY, { width: 95, align: 'right' });
    }
    currentY += 42;
  });

  doc.roundedRect(40, currentY - 4, 515, 30, 10).fill('#f4f1e8');
  doc.fillColor('#16341f').font('Helvetica-Bold').fontSize(9.5).text('TOTAL', 54, currentY + 6, { width: 120 });
  doc.text(formatNumber(totalQuantity, 0), 328, currentY + 6, { width: 80, align: 'right' });
  if (showWeight) {
    doc.text(formatWeight(totalWeight), 430, currentY + 6, { width: 95, align: 'right' });
  }

  return currentY + 44;
}

function renderStockReportPdf(doc: PDFKit.PDFDocument, report: any, logoBuffer: Buffer | null) {
  doc.roundedRect(40, 36, 515, 94, 18).fill('#f4f1e8');

  if (logoBuffer) {
    doc.image(logoBuffer, 54, 51, { fit: [105, 48] });
  }

  doc.fillColor('#16341f').font('Helvetica-Bold').fontSize(22).text('RAPPORT STOCK AGRIKIRI', logoBuffer ? 180 : 58, 53);
  doc.fillColor('#5f6f65').font('Helvetica').fontSize(10).text('Synthèse des mouvements d’entrée et de sortie de stock', logoBuffer ? 180 : 58, 83);
  doc.fillColor('#16341f').font('Helvetica-Bold').fontSize(10).text(COMPANY_PHONE, 385, 58, { width: 150, align: 'right' });
  doc.fillColor('#5f6f65').font('Helvetica').fontSize(10).text(COMPANY_EMAIL, 385, 76, { width: 150, align: 'right' });

  const infoY = 150;
  doc.roundedRect(40, infoY, 246, 102, 14).fill('#ffffff');
  doc.roundedRect(309, infoY, 246, 102, 14).fill('#ffffff');

  doc.fillColor('#16341f').font('Helvetica-Bold').fontSize(11).text('Rapport', 56, infoY + 14);
  [
    `Titre: ${report.title}`,
    `Date: ${new Date(report.reportDate).toLocaleDateString('fr-FR')}`,
    `Gestionnaire: ${report.stockManager.firstName} ${report.stockManager.lastName}`,
    `Réceptions liées: ${formatNumber(report.linkedShipments.length, 0)}`,
  ].forEach((line, index) => {
    doc.fillColor('#334155').font('Helvetica').fontSize(10).text(line, 56, infoY + 34 + index * 15, { width: 210 });
  });

  doc.fillColor('#16341f').font('Helvetica-Bold').fontSize(11).text('Synthèse', 325, infoY + 14);
  [
    `Réception buyer: ${formatNumber(report.buyerReceiptTotalQuantity, 0)} / ${formatWeight(report.buyerReceiptTotalWeightLbs)}`,
    `Sortie stock: ${formatNumber(report.stockOutputTotalQuantity, 0)} / ${formatWeight(report.stockOutputTotalWeightLbs)}`,
    `Rentrée production: ${formatNumber(report.productionInputTotalQuantity, 0)}`,
    `Sortie prod. commande: ${formatNumber(report.productionOrderOutputTotalQuantity, 0)}`,
  ].forEach((line, index) => {
    doc.fillColor('#334155').font('Helvetica').fontSize(10).text(line, 325, infoY + 34 + index * 15, { width: 210 });
  });

  if (report.summary) {
    doc.fillColor('#16341f').font('Helvetica-Bold').fontSize(11).text('Résumé', 40, 274);
    doc.fillColor('#334155').font('Helvetica').fontSize(10).text(report.summary, 40, 292, { width: 515, lineGap: 3 });
  }

  let cursorY = report.summary ? 352 : 274;
  cursorY = drawSectionTable(doc, 'Réception buyer', report.buyerReceiptItems || [], cursorY, true);
  cursorY = drawSectionTable(doc, 'Production / Sortie de stock', report.stockOutputItems || [], cursorY + 8, true);
  cursorY = drawSectionTable(doc, 'Production / Rentrée de stock', report.productionInputItems || [], cursorY + 8, false);
  cursorY = drawSectionTable(doc, 'Commande / Sortie de stock production', report.productionOrderOutputItems || [], cursorY + 8, false);

  const footerY = Math.min(cursorY + 8, 770);
  doc.fillColor('#64748b').font('Helvetica').fontSize(9).text(
    `Document généré le ${new Date().toLocaleString('fr-FR')} · AGRIKIRI`,
    40,
    footerY,
    { width: doc.page.width - 80, align: 'center' }
  );
}

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

export async function downloadStockReportPdf(req: Request, res: Response) {
  const authReq = req as AuthRequest;
  const report = await stockService.getStockReportById(req.params.id, authReq.user!);
  const filename = `RAPPORT_STOCK_${report.title.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || report.id}.pdf`;
  const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
  const logoBuffer = await getStockLogoBuffer();

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/pdf');

  doc.pipe(res);
  renderStockReportPdf(doc, report, logoBuffer);
  doc.end();
}
