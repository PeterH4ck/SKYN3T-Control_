import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { paymentController } from '../controllers/paymentController';
import { requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { strictRateLimiter } from '../middleware/rateLimiter';
import { PaymentMethod, Currency } from '../types/bank.types';

const router = Router();

// Validation schemas
const createPaymentValidation = [
  body('provider')
    .isIn(['banco_estado', 'santander', 'bci', 'banco_chile', 'scotiabank', 
           'paypal', 'mercadopago', 'stripe'])
    .withMessage('Invalid payment provider'),
  body('amount')
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number'),
  body('currency')
    .isIn(Object.values(Currency))
    .withMessage('Invalid currency'),
  body('description')
    .isString()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Description is required and must be less than 500 characters'),
  body('customerEmail')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('customerName')
    .isString()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Customer name is required'),
  body('customerRut')
    .optional()
    .isString()
    .trim()
    .matches(/^\d{7,8}-[\dkK]$/)
    .withMessage('Invalid RUT format'),
  body('customerPhone')
    .optional()
    .isMobilePhone('es-CL')
    .withMessage('Invalid phone number'),
  body('paymentMethod')
    .optional()
    .isIn(Object.values(PaymentMethod))
    .withMessage('Invalid payment method'),
  body('installments')
    .optional()
    .isInt({ min: 1, max: 48 })
    .withMessage('Installments must be between 1 and 48'),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object'),
];

const refundPaymentValidation = [
  param('id')
    .isUUID()
    .withMessage('Invalid payment ID'),
  body('amount')
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number'),
  body('reason')
    .isString()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Reason is required and must be less than 500 characters'),
];

const listPaymentsValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED'])
    .withMessage('Invalid status'),
  query('provider')
    .optional()
    .isIn(['banco_estado', 'santander', 'bci', 'banco_chile', 'scotiabank', 
           'paypal', 'mercadopago', 'stripe'])
    .withMessage('Invalid provider'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date'),
];

// Routes

// Create payment
router.post(
  '/',
  requirePermission('payments.create'),
  strictRateLimiter,
  validate(createPaymentValidation),
  paymentController.createPayment
);

// Get payment by ID
router.get(
  '/:id',
  requirePermission('payments.read'),
  validate([param('id').isUUID()]),
  paymentController.getPayment
);

// List payments
router.get(
  '/',
  requirePermission('payments.read'),
  validate(listPaymentsValidation),
  paymentController.listPayments
);

// Capture payment (for providers that support two-step payments)
router.put(
  '/:id/capture',
  requirePermission('payments.update'),
  strictRateLimiter,
  validate([
    param('id').isUUID(),
    body('amount').optional().isFloat({ min: 0 }),
  ]),
  paymentController.capturePayment
);

// Cancel payment
router.delete(
  '/:id',
  requirePermission('payments.delete'),
  strictRateLimiter,
  validate([param('id').isUUID()]),
  paymentController.cancelPayment
);

// Refund payment
router.post(
  '/:id/refund',
  requirePermission('payments.refund'),
  strictRateLimiter,
  validate(refundPaymentValidation),
  paymentController.refundPayment
);

// Get payment status (public endpoint for checking payment status)
router.get(
  '/:id/status',
  validate([param('id').isUUID()]),
  paymentController.getPaymentStatus
);

// Retry failed payment
router.post(
  '/:id/retry',
  requirePermission('payments.update'),
  strictRateLimiter,
  validate([param('id').isUUID()]),
  paymentController.retryPayment
);

// Get payment receipt
router.get(
  '/:id/receipt',
  requirePermission('payments.read'),
  validate([param('id').isUUID()]),
  paymentController.getPaymentReceipt
);

// Reconcile payment (manual reconciliation)
router.post(
  '/:id/reconcile',
  requirePermission('payments.reconcile'),
  validate([param('id').isUUID()]),
  paymentController.reconcilePayment
);

// Bulk payment operations (admin only)
router.post(
  '/bulk/export',
  requirePermission('payments.export'),
  validate([
    body('paymentIds').isArray(),
    body('paymentIds.*').isUUID(),
  ]),
  paymentController.exportPayments
);

export default router;