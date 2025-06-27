import { Router } from 'express';
import { webhookController } from '../controllers/webhookController';
import { webhookRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// Apply webhook rate limiter to all webhook routes
router.use(webhookRateLimiter);

// Webhook endpoints for each provider
// Note: No authentication on webhook endpoints - validated by signature

// Chilean Banks
router.post('/banco-estado', webhookController.handleBancoEstadoWebhook);
router.post('/santander', webhookController.handleSantanderWebhook);
router.post('/bci', webhookController.handleBCIWebhook);
router.post('/banco-chile', webhookController.handleBancoChileWebhook);
router.post('/scotiabank', webhookController.handleScotiabankWebhook);

// International Gateways
router.post('/paypal', webhookController.handlePayPalWebhook);
router.post('/mercadopago', webhookController.handleMercadoPagoWebhook);
router.post('/stripe', webhookController.handleStripeWebhook);

// Generic webhook handler (for testing)
router.post('/generic/:provider', webhookController.handleGenericWebhook);

export default router;