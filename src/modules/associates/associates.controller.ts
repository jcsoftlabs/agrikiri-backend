import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as associateService from './associates.service';
import { createDossierSchema, updateDossierStatusSchema, createVoteSchema, submitBallotSchema, createMessageSchema } from './associates.schema';
import PDFDocument from 'pdfkit';
import { createError } from '../../middleware/error.middleware';

const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://agrikiri.vercel.app').replace(/\/+$/, '');
const LOGO_URL = `${FRONTEND_URL}/images/logo.png`;
let dossierLogoCache: Buffer | null = null;

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

export async function exportDossierPdf(req: AuthRequest, res: Response) {
  const dossier = await associateService.getDossierById(req.params.id);
  
  const doc = new PDFDocument({ margin: 50 });
  const filename = `Dossier_${dossier.id.slice(0, 8)}.pdf`;
  const logoBuffer = await getDossierLogoBuffer();

  res.setHeader('Content-disposition', `attachment; filename=${filename}`);
  res.setHeader('Content-type', 'application/pdf');

  doc.pipe(res);

  if (logoBuffer) {
    doc.image(logoBuffer, 50, 45, { fit: [120, 50] });
  }

  // Header
  doc
    .fontSize(20)
    .fillColor('#1a2e1a')
    .text('RAPPORT DE DOSSIER - AGRIKIRI', logoBuffer ? 190 : 50, 55);
  doc
    .fontSize(10)
    .fillColor('gray')
    .text(`Généré le : ${new Date().toLocaleString()}`, 50, logoBuffer ? 72 : 85, { align: 'right' });
  doc.y = logoBuffer ? 125 : 115;
  doc.moveDown(1.5);

  // Dossier Info
  doc.fontSize(16).fillColor('#2D7A2D').text(dossier.title);
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('gray').text(`ID: ${dossier.id} | Statut: ${dossier.status}`);
  doc.moveDown();
  doc.fontSize(12).fillColor('black').text(dossier.description);
  doc.moveDown(2);

  // Author
  doc.fontSize(12).text(`Auteur : ${dossier.author.firstName} ${dossier.author.lastName}`);
  doc.moveDown(2);

  // Documents
  if (dossier.documents.length > 0) {
    doc.fontSize(14).text('Documents joints');
    doc.moveDown(0.5);
    dossier.documents.forEach((d: any) => {
      doc.fontSize(10).text(`- ${d.name} (${d.url})`);
    });
    doc.moveDown(2);
  }

  // Votes
  if (dossier.votes.length > 0) {
    doc.fontSize(14).text('Résultats des votes');
    doc.moveDown(0.5);
    dossier.votes.forEach((v: any) => {
      doc.fontSize(10).text(`${v.title} : ${v._count.ballots} votes enregistrés`);
    });
    doc.moveDown(2);
  }

  // Comments
  if (dossier.comments && dossier.comments.length > 0) {
    doc.fontSize(14).text('Historique des discussions');
    doc.moveDown(0.5);
    dossier.comments.forEach((c: any) => {
      doc.fontSize(10).text(`${c.author.firstName} ${c.author.lastName} (${new Date(c.createdAt).toLocaleDateString()}) :`);
      doc.fontSize(9).fillColor('#444').text(c.content, { indent: 10 });
      doc.moveDown(0.5);
    });
  }

  doc.end();
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
