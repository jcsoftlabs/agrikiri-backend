import { Router } from 'express';
import * as controller from './associates.controller';
import { authenticate, requireAssociate, requirePdg } from '../../middleware/auth.middleware';
import { uploadDossierDocument } from '../../middleware/upload.middleware';

const router = Router();

// Toutes les routes nécessitent d'être un associé
router.use(authenticate, requireAssociate);

// Dossiers
router.get('/dossiers', controller.listDossiers);
router.get('/dossiers/:id', controller.getDossier);
router.post('/dossiers', controller.createDossier);
router.patch('/dossiers/:id/status', requirePdg, controller.updateDossierStatus);

// Documents par dossier
router.post(
  '/dossiers/:id/documents', 
  (req, res, next) => {
    uploadDossierDocument(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  },
  controller.addDossierDocument
);

// Commentaires par dossier
router.get('/dossiers/:id/comments', controller.listDossierComments);
router.post('/dossiers/:id/comments', controller.postDossierComment);
router.post('/dossiers/:id/decisions', controller.createDossierDecision);

// Export PDF
router.get('/dossiers/:id/export', controller.exportDossierPdf);



// Votes
router.get('/votes', controller.listVotes);
router.get('/votes/:id', controller.getVote);
router.post('/votes', requirePdg, controller.createVote);
router.post('/votes/:id/ballot', controller.submitBallot);

// Chat
router.get('/chat', controller.listMessages);
router.post('/chat', controller.sendMessage);

export default router;
