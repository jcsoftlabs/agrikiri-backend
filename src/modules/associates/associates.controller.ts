import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as associateService from './associates.service';
import { createDossierSchema, updateDossierStatusSchema, createVoteSchema, submitBallotSchema, createMessageSchema } from './associates.schema';
import PDFDocument from 'pdfkit';
import { createError } from '../../middleware/error.middleware';

const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://agrikiri.vercel.app').replace(/\/+$/, '');
const LOGO_URL = `${FRONTEND_URL}/images/logo.png`;
const COMPANY_PHONE = '+509 2999-3636';
const COMPANY_EMAIL = 'infos@agrikiri.com';
let dossierLogoCache: Buffer | null = null;
const PDF_COLORS = {
  brand: '#1f5f2c',
  brandSoft: '#eef7ea',
  text: '#1f2937',
  muted: '#6b7280',
  line: '#dbe5dc',
  surface: '#f8faf8',
  white: '#ffffff',
};

function formatHtg(amount: number) {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function sanitizeStatus(status: string) {
  return status.replace(/_/g, ' ');
}

function buildDossierVersion(date: Date | string) {
  const updated = new Date(date);
  const yyyy = updated.getFullYear();
  const mm = String(updated.getMonth() + 1).padStart(2, '0');
  const dd = String(updated.getDate()).padStart(2, '0');
  return `v${yyyy}.${mm}.${dd}`;
}

interface FinancialLine {
  reason: string;
  amount: number;
}

function parseFinancialDescription(description: string): { narrative: string; lines: FinancialLine[] } {
  const narrativeLines: string[] = [];
  const lines: FinancialLine[] = [];

  description.split(/\r?\n/).forEach((rawLine) => {
    const cleanedLine = rawLine.trim();
    const match = cleanedLine.match(/^(?:[-•]\s*)?(.+?)\s*:\s*([0-9][0-9\s,.]*)\s*(?:gourdes?|htg)?\.?$/i);

    if (!match) {
      if (cleanedLine) narrativeLines.push(cleanedLine);
      return;
    }

    const amount = Number(match[2].replace(/[^\d.]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) {
      narrativeLines.push(cleanedLine);
      return;
    }

    lines.push({
      reason: match[1].trim(),
      amount,
    });
  });

  return {
    narrative: narrativeLines.join('\n'),
    lines,
  };
}

function normalizeFinancialLines(value: unknown): FinancialLine[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((line: any) => ({
      reason: typeof line?.reason === 'string' ? line.reason.trim() : '',
      amount: Number(line?.amount),
    }))
    .filter((line) => line.reason && Number.isFinite(line.amount) && line.amount > 0);
}

function ensureSpace(doc: PDFKit.PDFDocument, heightNeeded: number) {
  const bottomLimit = doc.page.height - doc.page.margins.bottom - heightNeeded;
  if (doc.y > bottomLimit) {
    doc.addPage();
  }
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string) {
  ensureSpace(doc, 40);
  doc
    .fontSize(13)
    .fillColor(PDF_COLORS.brand)
    .text(title, 50, doc.y);
  doc
    .moveTo(50, doc.y + 4)
    .lineTo(545, doc.y + 4)
    .strokeColor(PDF_COLORS.line)
    .lineWidth(1)
    .stroke();
  doc.moveDown(0.9);
}

function drawInfoCard(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string
) {
  doc.roundedRect(x, y, width, 56, 10).fillAndStroke(PDF_COLORS.surface, PDF_COLORS.line);
  doc
    .fillColor(PDF_COLORS.muted)
    .fontSize(9)
    .text(label.toUpperCase(), x + 12, y + 10, { width: width - 24 });
  doc
    .fillColor(PDF_COLORS.text)
    .fontSize(12)
    .text(value, x + 12, y + 24, { width: width - 24 });
}

async function getDossierLogoBuffer() {
  if (dossierLogoCache) return dossierLogoCache;

  try {
    const response = await fetch(LOGO_URL);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    dossierLogoCache = Buffer.from(arrayBuffer);
    return dossierLogoCache;
  } catch {
    return null;
  }
}

function drawFinancialTable(doc: PDFKit.PDFDocument, lines: FinancialLine[], total: number) {
  if (lines.length === 0) return;

  const tableX = 50;
  const tableWidth = 495;
  const labelWidth = 330;
  const amountWidth = 130;
  const amountX = tableX + tableWidth - amountWidth - 14;
  const minRowHeight = 30;

  ensureSpace(doc, 72);
  const headerY = doc.y;
  doc.roundedRect(tableX, headerY, tableWidth, minRowHeight, 6).fillAndStroke(PDF_COLORS.brandSoft, PDF_COLORS.line);
  doc
    .fillColor(PDF_COLORS.brand)
    .fontSize(10)
    .font('Helvetica-Bold')
    .text('Désignation', tableX + 14, headerY + 9, { width: labelWidth });
  doc.text('Montant', amountX, headerY + 9, { width: amountWidth, align: 'right' });

  let currentY = headerY + minRowHeight;
  lines.forEach((line, index) => {
    const textHeight = doc.heightOfString(line.reason, { width: labelWidth, lineGap: 2 });
    const rowHeight = Math.max(minRowHeight, textHeight + 18);
    if (currentY > doc.page.height - doc.page.margins.bottom - rowHeight - 54) {
      doc.addPage();
      currentY = 50;
    }

    doc
      .roundedRect(tableX, currentY, tableWidth, rowHeight, 4)
      .fillAndStroke(index % 2 === 0 ? PDF_COLORS.white : '#fbfbf7', '#ece9df');
    doc
      .fillColor(PDF_COLORS.text)
      .fontSize(10)
      .font('Helvetica')
      .text(line.reason, tableX + 14, currentY + 9, { width: labelWidth, lineGap: 2 });
    doc
      .font('Helvetica-Bold')
      .text(`${formatHtg(line.amount)} HTG`, amountX, currentY + 9, { width: amountWidth, align: 'right' });
    currentY += rowHeight + 4;
  });

  doc
    .roundedRect(tableX, currentY + 4, tableWidth, 32, 6)
    .fillAndStroke(PDF_COLORS.brandSoft, PDF_COLORS.line);
  doc
    .fillColor(PDF_COLORS.brand)
    .fontSize(11)
    .font('Helvetica-Bold')
    .text('Total', tableX + 14, currentY + 14, { width: labelWidth });
  doc.text(`${formatHtg(total)} HTG`, amountX, currentY + 14, { width: amountWidth, align: 'right' });
  doc.y = currentY + 52;
}

export async function exportDossierPdf(req: AuthRequest, res: Response) {
  const dossier = await associateService.getDossierById(req.params.id);
  const pdg = await associateService.getPdgApprover();
  const pdgName = pdg ? `${pdg.firstName} ${pdg.lastName}`.trim() : 'PDG AGRIKIRI';
  const disbursementLines = normalizeFinancialLines(dossier.disbursementLines);
  const parsedDescription = parseFinancialDescription(dossier.description);
  const effectiveFinancialLines = disbursementLines.length > 0 ? disbursementLines : parsedDescription.lines;
  const totalDisbursement =
    effectiveFinancialLines.length > 0
      ? effectiveFinancialLines.reduce((sum, line) => sum + line.amount, 0)
      : Number(dossier.disbursementTotal ?? 0);
  
  const doc = new PDFDocument({ margin: 50, bufferPages: true });
  const filename = `Dossier_${dossier.id.slice(0, 8)}.pdf`;
  const logoBuffer = await getDossierLogoBuffer();
  const dossierVersion = buildDossierVersion(dossier.updatedAt);
  const isValidated = dossier.status === 'COMPLETED';
  const approverName = isValidated ? pdgName : 'Validation en attente';
  const approverRole = isValidated ? 'Direction générale' : 'Document non encore clôturé';
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));

  const renderFooter = (pageNumber: number, totalPages: number) => {
    const footerY = doc.page.height - 35;
    const previousX = doc.x;
    const previousY = doc.y;
    doc
      .moveTo(50, footerY - 10)
      .lineTo(545, footerY - 10)
      .strokeColor(PDF_COLORS.line)
      .lineWidth(1)
      .stroke();
    doc
      .fontSize(8)
      .fillColor(PDF_COLORS.muted)
      .text(`AGRIKIRI - Rapport de dossier confidentiel • ${COMPANY_PHONE} • ${COMPANY_EMAIL}`, 50, footerY, {
        width: 360,
        lineBreak: false,
      });
    doc
      .text(`Page ${pageNumber}/${totalPages}`, 450, footerY, { width: 95, align: 'right', lineBreak: false });
    doc.x = previousX;
    doc.y = previousY;
  };

  // Header
  doc.roundedRect(50, 40, 495, 98, 18).fill(PDF_COLORS.surface);

  if (logoBuffer) {
    doc.image(logoBuffer, 66, 56, { fit: [88, 42] });
  } else {
    doc
      .fontSize(18)
      .fillColor(PDF_COLORS.brand)
      .font('Helvetica-Bold')
      .text('AGRIKIRI', 66, 62, { width: 95, lineBreak: false });
  }

  doc
    .fontSize(19)
    .fillColor(PDF_COLORS.brand)
    .font('Helvetica-Bold')
    .text('RAPPORT DE DOSSIER', 175, 58, { width: 210, lineBreak: false });
  doc
    .fontSize(10)
    .fillColor(PDF_COLORS.muted)
    .font('Helvetica')
    .text('Synthèse administrative et financière', 175, 84, { width: 220, lineBreak: false });
  doc
    .fontSize(9)
    .fillColor(PDF_COLORS.text)
    .text(COMPANY_PHONE, 398, 56, { width: 130, align: 'right', lineBreak: false });
  doc
    .fontSize(9)
    .fillColor(PDF_COLORS.text)
    .text(COMPANY_EMAIL, 398, 72, { width: 130, align: 'right', lineBreak: false });
  doc
    .fontSize(10)
    .fillColor(PDF_COLORS.muted)
    .text(`Généré le : ${formatDateTime(new Date())}`, 398, 94, { width: 130, align: 'right' });
  doc
    .fontSize(9)
    .fillColor(PDF_COLORS.muted)
    .text(`Référence : ${dossier.id.slice(0, 8).toUpperCase()}`, 175, 108, { width: 160, lineBreak: false });
  doc
    .fontSize(9)
    .fillColor(PDF_COLORS.muted)
    .text(`Version : ${dossierVersion}`, 398, 108, { width: 130, align: 'right', lineBreak: false });

  doc.y = 160;

  doc
    .fontSize(22)
    .fillColor(PDF_COLORS.text)
    .text(dossier.title, 50, doc.y, { width: 495 });
  doc.moveDown(0.3);
  doc
    .fontSize(11)
    .fillColor(PDF_COLORS.muted)
    .text(`Dossier ${sanitizeStatus(dossier.status)} - créé par ${dossier.author.firstName} ${dossier.author.lastName}`);
  doc.moveDown(1);

  const summaryTop = doc.y;
  drawInfoCard(doc, 50, summaryTop, 152, 'Statut', sanitizeStatus(dossier.status));
  drawInfoCard(doc, 221, summaryTop, 152, 'Documents', `${dossier.documents.length} document(s)`);
  drawInfoCard(doc, 392, summaryTop, 153, 'Décaissement', `${formatHtg(totalDisbursement)} HTG`);
  doc.y = summaryTop + 76;

  drawSectionTitle(doc, 'Résumé du dossier');
  const narrative = disbursementLines.length > 0 ? dossier.description : parsedDescription.narrative;
  if (narrative.trim()) {
    doc
      .fontSize(11)
      .fillColor(PDF_COLORS.text)
      .font('Helvetica')
      .text(narrative, 50, doc.y, {
        width: 495,
        lineGap: 4,
      });
    doc.moveDown(1.2);
  }

  if (effectiveFinancialLines.length > 0) {
    drawFinancialTable(doc, effectiveFinancialLines, totalDisbursement);
  }

  // Documents
  if (dossier.documents.length > 0) {
    drawSectionTitle(doc, 'Documents joints');
    dossier.documents.forEach((d: any) => {
      ensureSpace(doc, 26);
      const itemY = doc.y;
      doc.roundedRect(50, itemY, 495, 24, 6).fillAndStroke(PDF_COLORS.white, PDF_COLORS.line);
      doc.fontSize(10).fillColor(PDF_COLORS.text).text(d.name, 62, itemY + 7, { width: 290 });
      doc.fontSize(9).fillColor(PDF_COLORS.muted).text(d.url, 310, itemY + 8, { width: 223, align: 'right' });
      doc.y = itemY + 30;
    });
    doc.moveDown(1);
  }

  // Votes
  if (dossier.votes.length > 0) {
    drawSectionTitle(doc, 'Résultats des votes');
    dossier.votes.forEach((v: any) => {
      ensureSpace(doc, 34);
      const voteY = doc.y;
      doc.roundedRect(50, voteY, 495, 30, 8).fillAndStroke(PDF_COLORS.surface, PDF_COLORS.line);
      doc.fontSize(10).fillColor(PDF_COLORS.text).text(v.title, 62, voteY + 8, { width: 320 });
      doc
        .fontSize(10)
        .fillColor(PDF_COLORS.brand)
        .text(`${v._count.ballots} vote(s)`, 395, voteY + 8, { width: 130, align: 'right' });
      doc.y = voteY + 38;
    });
    doc.moveDown(1);
  }

  // Comments
  if (dossier.comments && dossier.comments.length > 0) {
    drawSectionTitle(doc, 'Historique des discussions');
    dossier.comments.forEach((c: any) => {
      ensureSpace(doc, 72);
      const commentY = doc.y;
      doc.roundedRect(50, commentY, 495, 58, 10).fillAndStroke(PDF_COLORS.white, PDF_COLORS.line);
      doc
        .fontSize(10)
        .fillColor(PDF_COLORS.text)
        .text(`${c.author.firstName} ${c.author.lastName}`, 64, commentY + 10, { width: 240 });
      doc
        .fontSize(9)
        .fillColor(PDF_COLORS.muted)
        .text(formatDateTime(c.createdAt), 350, commentY + 10, { width: 180, align: 'right' });
      doc
        .fontSize(9)
        .fillColor(PDF_COLORS.text)
        .text(c.content, 64, commentY + 27, { width: 465, lineGap: 2 });
      doc.y = commentY + 66;
    });
  }

  ensureSpace(doc, 130);
  drawSectionTitle(doc, 'Validation et approbation');
  const approvalTop = doc.y;
  doc.roundedRect(50, approvalTop, 240, 108, 12).fillAndStroke(PDF_COLORS.surface, PDF_COLORS.line);
  doc
    .fontSize(9)
    .fillColor(PDF_COLORS.muted)
    .text('Approuvé par', 64, approvalTop + 14, { width: 180 });
  doc
    .fontSize(13)
    .fillColor(PDF_COLORS.text)
    .font('Helvetica-Bold')
    .text(approverName, 64, approvalTop + 34, { width: 180 });
  doc
    .fontSize(10)
    .fillColor(PDF_COLORS.muted)
    .font('Helvetica')
    .text(approverRole, 64, approvalTop + 54, { width: 180 });
  doc
    .fontSize(9)
    .fillColor(isValidated ? PDF_COLORS.brand : '#9ca3af')
    .text(isValidated ? `Validé le ${formatDateTime(dossier.updatedAt)}` : 'En attente de clôture du dossier', 64, approvalTop + 78, {
      width: 160,
    });

  doc.roundedRect(306, approvalTop, 239, 108, 12).fillAndStroke('#fffdf8', PDF_COLORS.line);
  doc
    .fontSize(9)
    .fillColor(PDF_COLORS.muted)
    .text('Signature visuelle', 320, approvalTop + 14, { width: 160 });
  doc
    .fontSize(24)
    .fillColor(isValidated ? PDF_COLORS.brand : '#b8c0b9')
    .text(pdgName, 320, approvalTop + 36, { width: 180 });
  doc
    .moveTo(320, approvalTop + 84)
    .lineTo(510, approvalTop + 84)
    .strokeColor('#cbd5cf')
    .lineWidth(1)
    .stroke();
  doc
    .fontSize(9)
    .fillColor(PDF_COLORS.muted)
    .text('Direction / validation', 320, approvalTop + 88, { width: 160 });

  if (isValidated) {
    doc.save();
    doc.rotate(-10, { origin: [472, approvalTop + 54] });
    doc
      .roundedRect(430, approvalTop + 24, 86, 42, 10)
      .lineWidth(2)
      .strokeColor('#2d7a2d')
      .stroke();
    doc
      .fontSize(13)
      .fillColor('#2d7a2d')
      .font('Helvetica-Bold')
      .text('APPROUVÉ', 438, approvalTop + 37, { width: 70, align: 'center' });
    doc.restore();
  }

  doc.y = approvalTop + 126;

  const pdfReady = new Promise<void>((resolve, reject) => {
    doc.on('end', () => resolve());
    doc.on('error', (error) => reject(error));
  });

  const pageRange = doc.bufferedPageRange();
  for (let index = 0; index < pageRange.count; index += 1) {
    doc.switchToPage(pageRange.start + index);
    renderFooter(index + 1, pageRange.count);
  }

  doc.end();

  await pdfReady;

  const pdfBuffer = Buffer.concat(chunks);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', String(pdfBuffer.length));
  res.send(pdfBuffer);
}


// DOSSIERS
export async function listDossiers(req: AuthRequest, res: Response) {
  const dossiers = await associateService.getAllDossiers();
  res.json({ success: true, data: dossiers });
}

export async function getDossier(req: AuthRequest, res: Response) {
  const dossier = await associateService.getDossierById(req.params.id);
  res.json({ success: true, data: dossier });
}

export async function createDossier(req: AuthRequest, res: Response) {
  const data = createDossierSchema.parse(req.body);
  const dossier = await associateService.createDossier(req.user!.userId, data);
  res.status(201).json({ success: true, data: dossier });
}

export async function updateDossierStatus(req: AuthRequest, res: Response) {
  const data = updateDossierStatusSchema.parse(req.body);
  const dossier = await associateService.updateDossierStatus(req.params.id, data.status);
  res.json({ success: true, data: dossier });
}

export async function addDossierDocument(req: AuthRequest, res: Response) {
  if (!req.file) throw createError('Aucun fichier fourni', 400);
  const doc = await associateService.addDossierDocument(
    req.params.id,
    req.file.originalname,
    (req.file as any).path
  );
  res.status(201).json({ success: true, data: doc });
}

export async function listDossierComments(req: AuthRequest, res: Response) {
  const comments = await associateService.getDossierComments(req.params.id);
  res.json({ success: true, data: comments });
}

export async function postDossierComment(req: AuthRequest, res: Response) {
  const data = createMessageSchema.parse(req.body);
  const comment = await associateService.createDossierComment(
    req.params.id,
    req.user!.userId,
    data.content
  );
  res.status(201).json({ success: true, data: comment });
}


// VOTES
export async function listVotes(req: AuthRequest, res: Response) {
  const votes = await associateService.getAllVotes();
  res.json({ success: true, data: votes });
}

export async function getVote(req: AuthRequest, res: Response) {
  const vote = await associateService.getVoteById(req.params.id);
  res.json({ success: true, data: vote });
}

export async function createVote(req: AuthRequest, res: Response) {
  const data = createVoteSchema.parse(req.body);
  const vote = await associateService.createVote(data);
  res.status(201).json({ success: true, data: vote });
}

export async function submitBallot(req: AuthRequest, res: Response) {
  const data = submitBallotSchema.parse(req.body);
  const ballot = await associateService.submitBallot(req.params.id, req.user!.userId, data);
  res.json({ success: true, data: ballot });
}

// CHAT
export async function listMessages(req: AuthRequest, res: Response) {
  const messages = await associateService.getMessages();
  res.json({ success: true, data: messages.reverse() });
}

export async function sendMessage(req: AuthRequest, res: Response) {
  const data = createMessageSchema.parse(req.body);
  const message = await associateService.createMessage(req.user!.userId, data);
  res.status(201).json({ success: true, data: message });
}
