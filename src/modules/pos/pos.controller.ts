import { Request, Response, NextFunction } from 'express';
import PDFDocument from 'pdfkit';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as posService from './pos.service';
import { convertProformaToInvoiceSchema, createPosSaleSchema, posDocumentQuerySchema } from './pos.schema';

const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://agrikiri.vercel.app').replace(/\/+$/, '');
const LOGO_URL = `${FRONTEND_URL}/images/logo.png`;
const COMPANY_PHONE = '+509 2999-3636';
const COMPANY_EMAIL = 'info@agrikiri.com';
let posLogoCache: Buffer | null = null;

function formatCurrency(amount: number | string | null | undefined) {
  const value = Number(amount || 0);
  const fixed = Number.isFinite(value) ? value.toFixed(2) : '0.00';
  const [integerPart, decimalPart] = fixed.split('.');
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${groupedInteger},${decimalPart} HTG`;
}

function formatDocumentTitle(type: 'RECEIPT' | 'INVOICE' | 'PROFORMA') {
  const labels = {
    RECEIPT: 'RECU AGRIKIRI',
    INVOICE: 'FACTURE AGRIKIRI',
    PROFORMA: 'PROFORMA AGRIKIRI',
  };

  return labels[type];
}

function formatPaymentMethod(method?: string | null) {
  const labels: Record<string, string> = {
    PLOPPLOP: 'PLOP PLOP',
    MONCASH: 'MonCash',
    CHEQUE: 'Cheque',
    VIREMENT_BANCAIRE: 'Virement bancaire',
    NATCASH: 'NatCash',
    KASHPAW: 'Kashpaw',
    CASH: 'CASH',
  };

  return method ? labels[method] || method : 'Non renseigné';
}

function formatCustomerType(method?: string | null) {
  const labels: Record<string, string> = {
    WALK_IN: 'Walk-in customer',
    INDIVIDUAL: 'Individu',
    BUSINESS: 'Entreprise',
  };

  return method ? labels[method] || method : 'Client';
}

function formatDeliveryRuleNote(deliveryRequested?: boolean, totalWeightLbs?: number | string | null) {
  if (!deliveryRequested) {
    return 'Vente comptoir sans livraison.';
  }

  const weight = Number(totalWeightLbs || 0);
  if (weight > 11010) {
    return 'Livraison gratuite appliquee car la commande depasse 5 tonnes.';
  }

  if (weight >= 2202) {
    return 'Transport calcule a 5% car le chargement est compris entre 1 et 5 tonnes.';
  }

  return 'Transport calcule a 10% car le chargement est inferieur a 1 tonne.';
}

async function getPosLogoBuffer() {
  if (posLogoCache) return posLogoCache;

  try {
    const response = await fetch(LOGO_URL);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    posLogoCache = Buffer.from(arrayBuffer);
    return posLogoCache;
  } catch {
    return null;
  }
}

function drawHeader(doc: PDFKit.PDFDocument, title: string, subtitle: string, logoBuffer: Buffer | null) {
  doc.roundedRect(40, 36, 515, 94, 18).fill('#f4f1e8');

  if (logoBuffer) {
    doc.image(logoBuffer, 54, 51, { fit: [105, 48] });
  }

  doc
    .fillColor('#16341f')
    .font('Helvetica-Bold')
    .fontSize(23)
    .text(title, logoBuffer ? 180 : 58, 53);

  doc
    .fillColor('#5f6f65')
    .font('Helvetica')
    .fontSize(10)
    .text(subtitle, logoBuffer ? 180 : 58, 83);

  doc
    .fillColor('#16341f')
    .font('Helvetica-Bold')
    .fontSize(10)
    .text(COMPANY_PHONE, 385, 58, { width: 150, align: 'right' });
  doc
    .font('Helvetica')
    .fillColor('#5f6f65')
    .text(COMPANY_EMAIL, 385, 76, { width: 150, align: 'right' });
}

function drawInfoCard(doc: PDFKit.PDFDocument, title: string, lines: string[], x: number, y: number, width: number) {
  const height = 94;
  doc.roundedRect(x, y, width, height, 14).fill('#ffffff');
  doc
    .fillColor('#16341f')
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(title, x + 16, y + 14);

  let currentY = y + 34;
  lines.filter(Boolean).forEach((line) => {
    doc
      .fillColor('#334155')
      .font('Helvetica')
      .fontSize(10)
      .text(line, x + 16, currentY, { width: width - 32 });
    currentY += 15;
  });
}

function estimateThermalReceiptHeight(sale: any) {
  const baseHeight = 310;
  const itemsHeight = sale.items.reduce((sum: number, item: any) => {
    const descriptionLines = Math.max(1, Math.ceil(String(item.description || '').length / 22));
    return sum + 28 + descriptionLines * 12;
  }, 0);
  const notesHeight = sale.notes ? Math.max(28, Math.ceil(String(sale.notes).length / 24) * 12 + 18) : 0;
  return Math.max(420, baseHeight + itemsHeight + notesHeight);
}

function renderThermalReceipt(doc: PDFKit.PDFDocument, sale: any, logoBuffer: Buffer | null) {
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - 36;
  let cursorY = 18;

  if (logoBuffer) {
    doc.image(logoBuffer, (pageWidth - 64) / 2, cursorY, { fit: [64, 32], align: 'center' });
    cursorY += 40;
  }

  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(12).text('AGRIKIRI', 18, cursorY, {
    width: contentWidth,
    align: 'center',
  });
  cursorY += 16;
  doc.font('Helvetica').fontSize(8).text(COMPANY_PHONE, 18, cursorY, { width: contentWidth, align: 'center' });
  cursorY += 11;
  doc.text(COMPANY_EMAIL, 18, cursorY, { width: contentWidth, align: 'center' });
  cursorY += 16;

  doc.moveTo(18, cursorY).lineTo(pageWidth - 18, cursorY).dash(3, { space: 2 }).strokeColor('#000000').stroke();
  doc.undash();
  cursorY += 10;

  doc.font('Helvetica-Bold').fontSize(10).text('RECU DE VENTE', 18, cursorY, { width: contentWidth, align: 'center' });
  cursorY += 16;

  const metaLines = [
    `Numero: ${sale.saleNumber}`,
    `Date: ${new Date(sale.createdAt).toLocaleString('fr-FR')}`,
    `Type client: ${formatCustomerType(sale.customerType)}`,
    `Client: ${sale.customerName}`,
    sale.companyName ? `Entreprise: ${sale.companyName}` : '',
    sale.taxId ? `Identifiant: ${sale.taxId}` : '',
    sale.customerPhone ? `Telephone: ${sale.customerPhone}` : '',
    `Livraison: ${sale.deliveryRequested ? 'Oui' : 'Non'}`,
    sale.deliveryRequested ? `Poids total: ${Number(sale.totalWeightLbs || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Lbs` : '',
    `Paiement: ${formatPaymentMethod(sale.paymentMethod)}`,
    `Caissier: ${`${sale.createdBy?.firstName || 'AGRIKIRI'} ${sale.createdBy?.lastName || ''}`.trim()}`,
  ].filter(Boolean);

  doc.font('Helvetica').fontSize(8.5);
  metaLines.forEach((line) => {
    doc.text(line, 18, cursorY, { width: contentWidth });
    cursorY += 11;
  });

  cursorY += 2;
  doc.moveTo(18, cursorY).lineTo(pageWidth - 18, cursorY).dash(3, { space: 2 }).stroke();
  doc.undash();
  cursorY += 10;

  sale.items.forEach((item: any) => {
    doc.font('Helvetica-Bold').fontSize(8.8).text(item.description, 18, cursorY, {
      width: contentWidth,
    });
    const descriptionHeight = doc.heightOfString(item.description, { width: contentWidth });
    cursorY += descriptionHeight + 3;
    doc
      .font('Helvetica')
      .fontSize(8.4)
      .text(`${item.quantity} x ${formatCurrency(item.unitPrice)}`, 18, cursorY, { width: 90 });
    doc
      .font('Helvetica-Bold')
      .text(formatCurrency(item.lineTotal), 108, cursorY, { width: contentWidth - 90, align: 'right' });
    cursorY += 13;
  });

  cursorY += 2;
  doc.moveTo(18, cursorY).lineTo(pageWidth - 18, cursorY).dash(3, { space: 2 }).stroke();
  doc.undash();
  cursorY += 10;

  doc.font('Helvetica').fontSize(8.6);
  doc.text('Sous-total', 18, cursorY, { width: 90 });
  doc.text(formatCurrency(sale.subtotalAmount), 108, cursorY, { width: contentWidth - 90, align: 'right' });
  cursorY += 12;
  doc.text('Remise', 18, cursorY, { width: 90 });
  doc.text(formatCurrency(sale.discountAmount), 108, cursorY, { width: contentWidth - 90, align: 'right' });
  cursorY += 14;
  if (sale.deliveryRequested) {
    doc.text('Livraison', 18, cursorY, { width: 90 });
    doc.text(formatCurrency(sale.deliveryFee), 108, cursorY, { width: contentWidth - 90, align: 'right' });
    cursorY += 14;
  }

  doc.roundedRect(18, cursorY - 4, contentWidth, 28, 8).fill('#000000');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11);
  doc.text('TOTAL', 28, cursorY + 4, { width: 70 });
  doc.text(formatCurrency(sale.totalAmount), 98, cursorY + 4, { width: contentWidth - 88, align: 'right' });
  cursorY += 36;

  if (sale.notes) {
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8.8).text('Notes', 18, cursorY, { width: contentWidth });
    cursorY += 11;
    doc.font('Helvetica').fontSize(8.2).text(sale.notes, 18, cursorY, {
      width: contentWidth,
      lineGap: 1,
    });
    cursorY += doc.heightOfString(sale.notes, { width: contentWidth, lineGap: 1 }) + 10;
  }

  if (sale.deliveryRequested) {
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8.8).text('Transport', 18, cursorY, { width: contentWidth });
    cursorY += 11;
    doc.font('Helvetica').fontSize(8.2).text(formatDeliveryRuleNote(sale.deliveryRequested, sale.totalWeightLbs), 18, cursorY, {
      width: contentWidth,
      lineGap: 1,
    });
    cursorY += doc.heightOfString(formatDeliveryRuleNote(sale.deliveryRequested, sale.totalWeightLbs), { width: contentWidth, lineGap: 1 }) + 10;
  }

  doc.moveTo(18, cursorY).lineTo(pageWidth - 18, cursorY).dash(3, { space: 2 }).stroke();
  doc.undash();
  cursorY += 12;

  doc.font('Helvetica').fontSize(8).fillColor('#000000');
  doc.text('Merci pour votre achat.', 18, cursorY, { width: contentWidth, align: 'center' });
  cursorY += 10;
  doc.text('Produits agricoles locaux AGRIKIRI', 18, cursorY, { width: contentWidth, align: 'center' });
}

function renderPosDocument(doc: PDFKit.PDFDocument, sale: any, type: 'RECEIPT' | 'INVOICE' | 'PROFORMA', logoBuffer: Buffer | null) {
  const pageWidth = doc.page.width;
  const isProforma = type === 'PROFORMA';
  const title = formatDocumentTitle(type);
  const subtitle = isProforma
    ? 'Document commercial estimatif sans sortie de stock'
    : 'Document commercial généré depuis le mini POS admin';

  drawHeader(doc, title, subtitle, logoBuffer);

  drawInfoCard(
    doc,
    'Document',
    [
      `Numero: ${sale.saleNumber}`,
      `Date: ${new Date(sale.createdAt).toLocaleString('fr-FR')}`,
      `Statut: ${sale.status === 'DRAFT' ? 'Brouillon' : 'Finalise'}`,
      `Livraison: ${sale.deliveryRequested ? 'Oui' : 'Non'}`,
      sale.deliveryRequested ? `Poids total: ${Number(sale.totalWeightLbs || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Lbs` : '',
      `Paiement: ${formatPaymentMethod(type === 'PROFORMA' ? null : sale.paymentMethod)}`,
    ],
    40,
    150,
    246
  );

  drawInfoCard(
    doc,
    'Client',
    [
      `Type: ${formatCustomerType(sale.customerType)}`,
      sale.customerName,
      sale.companyName || '',
      sale.taxId ? `Identifiant: ${sale.taxId}` : '',
      sale.customerPhone || '',
      sale.customerEmail || '',
      sale.customerAddress || '',
    ],
    309,
    150,
    246
  );

  doc
    .fillColor('#16341f')
    .font('Helvetica-Bold')
    .fontSize(12)
    .text('Articles', 40, 268);

  const tableTop = 292;
  doc.roundedRect(40, tableTop, 515, 26, 10).fill('#16341f');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10);
  doc.text('Description', 56, tableTop + 8, { width: 230 });
  doc.text('Qté', 312, tableTop + 8, { width: 40, align: 'right' });
  doc.text('P.U.', 374, tableTop + 8, { width: 70, align: 'right' });
  doc.text('Montant', 464, tableTop + 8, { width: 70, align: 'right' });

  let rowY = tableTop + 38;
  for (const item of sale.items) {
    if (rowY > 715) {
      doc.addPage();
      rowY = 60;
    }

    doc.roundedRect(40, rowY - 8, 515, 36, 10).fill('#fbfaf7');
    doc.fillColor('#111827').font('Helvetica').fontSize(10);
    doc.text(item.description, 56, rowY, { width: 230 });
    doc.text(String(item.quantity), 312, rowY, { width: 40, align: 'right' });
    doc.text(formatCurrency(item.unitPrice), 374, rowY, { width: 70, align: 'right' });
    doc.text(formatCurrency(item.lineTotal), 464, rowY, { width: 70, align: 'right' });
    rowY += 44;
  }

  const totalsTop = Math.max(rowY + 8, 560);
  const totalsHeight = sale.deliveryRequested ? 124 : 104;
  doc.roundedRect(316, totalsTop, 239, totalsHeight, 14).fill('#f4f1e8');
  doc.fillColor('#16341f').font('Helvetica-Bold').fontSize(12).text('Synthèse', 334, totalsTop + 14);
  doc.fillColor('#334155').font('Helvetica').fontSize(10);
  doc.text('Sous-total', 334, totalsTop + 40, { width: 100 });
  doc.text(formatCurrency(sale.subtotalAmount), 450, totalsTop + 40, { width: 85, align: 'right' });
  doc.text('Remise', 334, totalsTop + 58, { width: 100 });
  doc.text(formatCurrency(sale.discountAmount), 450, totalsTop + 58, { width: 85, align: 'right' });
  if (sale.deliveryRequested) {
    doc.text('Livraison', 334, totalsTop + 76, { width: 100 });
    doc.text(formatCurrency(sale.deliveryFee), 450, totalsTop + 76, { width: 85, align: 'right' });
  }
  doc.font('Helvetica-Bold').fillColor('#16341f');
  const totalRowY = sale.deliveryRequested ? totalsTop + 98 : totalsTop + 80;
  doc.text('Total', 334, totalRowY, { width: 100 });
  doc.text(formatCurrency(sale.totalAmount), 450, totalRowY, { width: 85, align: 'right' });

  if (sale.notes) {
    doc
      .fillColor('#16341f')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text('Notes', 40, totalsTop + 6);
    doc
      .fillColor('#334155')
      .font('Helvetica')
      .fontSize(10)
      .text(sale.notes, 40, totalsTop + 26, { width: 250, lineGap: 3 });
  }

  if (sale.deliveryRequested) {
    doc
      .fillColor('#334155')
      .font('Helvetica')
      .fontSize(9)
      .text(formatDeliveryRuleNote(sale.deliveryRequested, sale.totalWeightLbs), 40, totalsTop + 94, { width: 250, lineGap: 2 });
  }

  doc
    .fillColor('#64748b')
    .font('Helvetica')
    .fontSize(9)
    .text(
      isProforma
        ? 'Proforma informative. Les prix et disponibilités restent soumis à validation finale.'
        : `Document émis par ${sale.createdBy?.firstName || 'AGRIKIRI'} ${sale.createdBy?.lastName || ''}`.trim(),
      40,
      770,
      { width: pageWidth - 80, align: 'center' }
    );
}

export async function listPosSales(_req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const data = await posService.listPosSales();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function createPosSale(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const payload = createPosSaleSchema.parse(req.body);
    const data = await posService.createPosSale(req.user!.userId, payload);
    res.status(201).json({ success: true, message: 'Document POS créé avec succès', data });
  } catch (error) {
    next(error);
  }
}

export async function getPosSaleById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const data = await posService.getPosSaleById(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function convertProformaToInvoice(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const payload = convertProformaToInvoiceSchema.parse(req.body);
    const data = await posService.convertProformaToInvoice(req.user!.userId, req.params.id, payload);
    res.json({ success: true, message: 'Proforma transformee en facture avec succes', data });
  } catch (error) {
    next(error);
  }
}

export async function downloadPosDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const sale = await posService.getPosSaleById(req.params.id);
    const query = posDocumentQuerySchema.parse(req.query);
    const type = (query.type || sale.documentType) as 'RECEIPT' | 'INVOICE' | 'PROFORMA';
    const filename = `${formatDocumentTitle(type).replace(/\s+/g, '_')}_${sale.saleNumber}.pdf`;
    const doc =
      type === 'RECEIPT'
        ? new PDFDocument({ margin: 18, size: [226.77, estimateThermalReceiptHeight(sale)] })
        : new PDFDocument({ margin: 40, size: 'LETTER' });
    const logoBuffer = await getPosLogoBuffer();

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/pdf');

    doc.pipe(res);
    if (type === 'RECEIPT') {
      renderThermalReceipt(doc, sale, logoBuffer);
    } else {
      renderPosDocument(doc, sale, type, logoBuffer);
    }
    doc.end();
  } catch (error) {
    next(error);
  }
}
