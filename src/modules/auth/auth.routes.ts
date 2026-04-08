import { Router } from 'express';
import { register, login, refresh, becomeAyizan, me, getMyAddresses, createAddress, updateAddress, setDefaultAddress, deleteAddress } from './auth.controller';
import { authenticate } from '../../middleware/auth.middleware';
import rateLimit from 'express-rate-limit';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    success: false,
    message: 'Trop de tentatives. Veuillez réessayer dans 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Routes publiques
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/refresh', refresh);

// Routes protégées
router.get('/me', authenticate, me);
router.post('/become-ayizan', authenticate, becomeAyizan);
router.get('/addresses', authenticate, getMyAddresses);
router.post('/addresses', authenticate, createAddress);
router.patch('/addresses/:id', authenticate, updateAddress);
router.patch('/addresses/:id/default', authenticate, setDefaultAddress);
router.delete('/addresses/:id', authenticate, deleteAddress);

export default router;
