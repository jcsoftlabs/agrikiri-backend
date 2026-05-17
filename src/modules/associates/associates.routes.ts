import { Router } from 'express';
import * as controller from './associates.controller';
import { authenticate, requireAssociate, requirePdg } from '../../middleware/auth.middleware';
import { uploadDossierDocument } from '../../middleware/upload.middleware';

const router = Router();
const asyncHandler =
  (handler: any) =>
  (req: any, res: any, next: any) =>
    Promise.resolve(handler(req, res, next)).catch(next);

// Toutes les routes nécessitent d'être un associé
router.use(authenticate, requireAssociate);

// Dossiers
router.get('/dossiers', asyncHandler(controller.listDossiers));
router.get('/dossiers/:id', asyncHandler(controller.getDossier));
router.post('/dossiers', asyncHandler(controller.createDossier));
router.patch('/dossiers/:id/status', requirePdg, asyncHandler(controller.updateDossierStatus));

// Documents par dossier
router.post(
  '/dossiers/:id/documents', 
  (req, res, next) => {
    uploadDossierDocument(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  },
  asyncHandler(controller.addDossierDocument)
);

// Commentaires par dossier
router.get('/dossiers/:id/comments', asyncHandler(controller.listDossierComments));
router.post('/dossiers/:id/comments', asyncHandler(controller.postDossierComment));
router.post('/dossiers/:id/decisions', asyncHandler(controller.createDossierDecision));

// Export PDF
router.get('/dossiers/:id/export', asyncHandler(controller.exportDossierPdf));



// Votes
router.get('/votes', asyncHandler(controller.listVotes));
router.get('/votes/:id', asyncHandler(controller.getVote));
router.post('/votes', requirePdg, asyncHandler(controller.createVote));
router.post('/votes/:id/ballot', asyncHandler(controller.submitBallot));

// Chat
router.get('/chat', asyncHandler(controller.listMessages));
router.post('/chat', asyncHandler(controller.sendMessage));

export default router;
