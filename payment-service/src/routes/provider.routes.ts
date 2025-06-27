import { Router } from 'express';
import { param } from 'express-validator';
import { providerController } from '../controllers/providerController';
import { requirePermission, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

// Get all available providers
router.get(
  '/',
  requirePermission('payments.read'),
  providerController.getProviders
);

// Get provider information
router.get(
  '/:provider',
  requirePermission('payments.read'),
  validate([
    param('provider')
      .isString()
      .isIn(['banco_estado', 'santander', 'bci', 'banco_chile', 'scotiabank', 
             'paypal', 'mercadopago', 'stripe'])
      .withMessage('Invalid provider'),
  ]),
  providerController.getProviderInfo
);

// Get provider health status
router.get(
  '/health/all',
  requirePermission('payments.read'),
  providerController.getProvidersHealth
);

// Get provider health status
router.get(
  '/:provider/health',
  requirePermission('payments.read'),
  validate([
    param('provider').isString(),
  ]),
  providerController.getProviderHealth
);

// Get provider statistics (admin only)
router.get(
  '/:provider/stats',
  requireRole(['SUPER_ADMIN', 'FINANCIAL_ADMIN']),
  validate([
    param('provider').isString(),
  ]),
  providerController.getProviderStats
);

// Validate provider configuration (admin only)
router.post(
  '/:provider/validate',
  requireRole(['SUPER_ADMIN', 'SYSTEM_ADMIN']),
  validate([
    param('provider').isString(),
  ]),
  providerController.validateProviderConfig
);

export default router;