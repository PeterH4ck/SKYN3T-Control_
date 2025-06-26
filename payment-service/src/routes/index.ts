import { Router } from 'express';
import paymentRoutes from './payment.routes';
import bankRoutes from './bank.routes';
import webhookRoutes from './webhook.routes';
import providerRoutes from './provider.routes';
import { authenticate } from '../middleware/auth';

const router = Router();

// API Info
router.get('/', (req, res) => {
  res.json({
    service: 'Payment Service',
    version: '0.3.0',
    status: 'operational',
    endpoints: {
      payments: '/payments',
      banks: '/banks',
      webhooks: '/webhooks',
      providers: '/providers',
    },
  });
});

// Mount routes with authentication
router.use('/payments', authenticate, paymentRoutes);
router.use('/banks', authenticate, bankRoutes);
router.use('/providers', authenticate, providerRoutes);

// Webhook routes (no authentication - validated by signature)
router.use('/webhooks', webhookRoutes);

export default router;