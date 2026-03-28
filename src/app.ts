import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';

import { connectDatabase } from './config/database';
import { errorHandler, notFound } from './middleware/error.middleware';
import { processMonthlyCommissions } from './utils/commission-engine';
import { updateAllUserLevels } from './utils/mlm-calculator';

// Routes
import authRoutes from './modules/auth/auth.routes';
import uploadRoutes from './modules/upload/upload.routes';
import productsRoutes from './modules/products/products.routes';
import ordersRoutes from './modules/orders/orders.routes';
import mlmRoutes from './modules/mlm/mlm.routes';
import commissionsRoutes from './modules/commissions/commissions.routes';
import adminRoutes from './modules/admin/admin.routes';

const app = express();
const PORT = process.env.PORT || 3001;

// ================================
// SECURITY MIDDLEWARE
// ================================

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    if (!origin) return callback(null, true); // Allow tools like Postman
    const allowed = [
      process.env.FRONTEND_URL,
      'http://localhost:3000',
    ];
    if (allowed.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: { success: false, message: 'Trop de requêtes. Veuillez réessayer plus tard.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);

// ================================
// BODY PARSING
// ================================

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ================================
// HEALTH CHECK
// ================================

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'AGRIKIRI API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ================================
// API ROUTES
// ================================

app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/mlm', mlmRoutes);
app.use('/api/commissions', commissionsRoutes);
app.use('/api/admin', adminRoutes);

// ================================
// 404 & ERROR HANDLING
// ================================

app.use(notFound);
app.use(errorHandler);

// ================================
// CRON JOBS
// ================================

// Fin de mois — calcul des commissions (1er du mois à minuit)
cron.schedule('0 0 1 * *', async () => {
  const now = new Date();
  const previousMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  console.log(`🕛 [CRON] Traitement commissions pour ${previousMonth}/${year}`);

  try {
    await processMonthlyCommissions(previousMonth, year);
    console.log(`✅ [CRON] Commissions traitées pour ${previousMonth}/${year}`);
  } catch (error) {
    console.error(`❌ [CRON] Erreur traitement commissions:`, error);
  }
});

// Vérification des niveaux MLM (tous les jours à 2h du matin)
cron.schedule('0 2 * * *', async () => {
  console.log('🔄 [CRON] Mise à jour des niveaux MLM...');
  try {
    await updateAllUserLevels();
    console.log('✅ [CRON] Niveaux MLM mis à jour');
  } catch (error) {
    console.error('❌ [CRON] Erreur mise à jour niveaux:', error);
  }
});

// ================================
// START SERVER
// ================================

async function start() {
  await connectDatabase();

  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════╗
║     🌿 AGRIKIRI API v1.0.0          ║
║     Serveur démarré sur port ${PORT}   ║
║     Environnement: ${process.env.NODE_ENV || 'development'}       ║
╚══════════════════════════════════════╝
    `);
  });
}

start().catch((error) => {
  console.error('❌ Erreur fatale au démarrage:', error);
  process.exit(1);
});

export default app;
