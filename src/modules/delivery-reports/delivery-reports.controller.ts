import { Response } from 'express';
import PDFDocument from 'pdfkit';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as deliveryReportsService from './delivery-reports.service';
import { createDeliveryReportSchema } from './delivery-reports.schema';

function formatSafeNumber(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  const fixed = Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
  const [integerPart, decimalPart] = fixed.split('.');
  return `${integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${decimalPart}`;
}

function renderDeliveryReportPdf(doc: PDFKit.PDFDocument, report: any) {
  doc.roundedRect(40, 36, 515, 94, 18).fill('#f4f1e8');
  doc.fillColor('#16341f').font('Helvetica-Bold').fontSize(23).text('RAPPORT LIVREUR', 56, 53);
  doc.fillColor('#5f6f65').font('Helvetica').fontSize(10).text(
    'Synthèse détaillée du passage terrain et des quantités réellement livrées.',
    56,
    83
  );
  doc.fillColor('#16341f').font('Helvetica-Bold').fontSize(10).text('+509 2999-3636', 385, 58, { width: 150, align: 'right' });
  doc.fillColor('#5f6f65').font('Helvetica').fontSize(10).text('info@agrikiri.com', 385, 76, { width: 150, align: 'right' });

  const infoY = 150;
  doc.roundedRect(40, infoY, 246, 116, 14).fill('#ffffff');
  doc.roundedRect(309, infoY, 246, 116, 14).fill('#ffffff');

  doc.fillColor('#16341f').font('Helvetica-Bold').fontSize(11).text('Rapport', 56, infoY + 14);
  [
    `Titre: ${report.title}`,
    `Date: ${new Date(report.shiftDate).toLocaleDateString('fr-FR')}`,
    `Livreur: ${report.deliveryAgent.firstName} ${report.deliveryAgent.lastName}`,
    report.deliveryNote ? `Bon: ${report.deliveryNote.noteNumber}` : '',
    report.deliveryNote?.receiverName ? `Receveur: ${report.deliveryNote.receiverName}` : '',
  ].filter(Boolean).forEach((line, index) => {
    doc.fillColor('#334155').font('Helvetica').fontSize(10).text(line, 56, infoY + 34 + index * 15, { width: 210 });
  });

  doc.fillColor('#16341f').font('Helvetica-Bold').fontSize(11).text('Synthèse', 325, infoY + 14);
  [
    `Assigné: ${report.totalAssigned}`,
    `Livré: ${report.deliveredCount}`,
    `Reste: ${report.remainingAssigned}`,
    `Poids: ${formatSafeNumber(report.totalDeliveredWeightLbs)} Lbs`,
    `Cash: ${formatSafeNumber(report.cashCollected)} HTG`,
    `Frais: ${formatSafeNumber(report.fieldExpenses)} HTG`,
  ].forEach((line, index) => {
    doc.fillColor('#334155').font('Helvetica').fontSize(10).text(line, 325, infoY + 34 + index * 15, { width: 210 });
  });

  doc.fillColor('#16341f').font('Helvetica-Bold').fontSize(12).text('Tableau livré', 40, 290);
  const tableTop = 314;
  doc.roundedRect(40, tableTop, 515, 26, 10).fill('#16341f');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
  doc.text('Description', 54, tableTop + 8, { width: 180 });
  doc.text('Cmd', 255, tableTop + 8, { width: 42, align: 'right' });
  doc.text('Affecté', 307, tableTop + 8, { width: 42, align: 'right' });
  doc.text('Livré', 359, tableTop + 8, { width: 42, align: 'right' });
  doc.text('Reste', 411, tableTop + 8, { width: 42, align: 'right' });
  doc.text('Poids ligne', 468, tableTop + 8, { width: 68, align: 'right' });

  let rowY = tableTop + 38;
  report.reportItems.forEach((item: any) => {
    if (rowY > 720) {
      doc.addPage({ margin: 40, size: 'LETTER' });
      rowY = 60;
    }

    doc.roundedRect(40, rowY - 8, 515, 36, 10).fill('#fbfaf7');
    doc.fillColor('#111827').font('Helvetica').fontSize(9.5).text(item.description, 54, rowY, { width: 180 });
    doc.text(String(item.orderedQuantity), 255, rowY, { width: 42, align: 'right' });
    doc.text(String(item.assignedQuantity), 307, rowY, { width: 42, align: 'right' });
    doc.text(String(item.deliveredThisReport), 359, rowY, { width: 42, align: 'right' });
    doc.text(String(item.remainingAfterReport), 411, rowY, { width: 42, align: 'right' });
    doc.text(`${formatSafeNumber(item.lineWeightLbs)} Lbs`, 468, rowY, { width: 68, align: 'right' });
    rowY += 44;
  });

  const noteTop = Math.max(rowY + 10, 610);
  doc.fillColor('#16341f').font('Helvetica-Bold').fontSize(11).text('Résumé', 40, noteTop);
  doc.fillColor('#334155').font('Helvetica').fontSize(10).text(report.summary, 40, noteTop + 18, { width: 515, lineGap: 3 });
}

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

export async function downloadDeliveryReportPdf(req: AuthRequest, res: Response) {
  const report = await deliveryReportsService.getDeliveryReportById(req.params.id, req.user!);
  const filename = `RAPPORT_LIVREUR_${report.id}.pdf`;
  const doc = new PDFDocument({ margin: 40, size: 'LETTER' });

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/pdf');

  doc.pipe(res);
  renderDeliveryReportPdf(doc, report);
  doc.end();
}
