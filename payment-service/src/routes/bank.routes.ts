import { Router } from 'express';
import { body } from 'express-validator';
import { bankController } from '../controllers/bankController';
import { requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { BankAccountType } from '../types/bank.types';

const router = Router();

// Validation schemas
const validateAccountValidation = [
  body('accountNumber')
    .isString()
    .trim()
    .isLength({ min: 5, max: 20 })
    .withMessage('Invalid account number'),
  body('accountType')
    .isIn(Object.values(BankAccountType))
    .withMessage('Invalid account type'),
  body('bankCode')
    .optional()
    .isString()
    .isIn(['banco_estado', 'santander', 'bci', 'banco_chile', 'scotiabank'])
    .withMessage('Invalid bank code'),
  body('rut')
    .isString()
    .trim()
    .matches(/^\d{7,8}-[\dkK]$/)
    .withMessage('Invalid RUT format'),
  body('name')
    .isString()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Account holder name is required'),
];

const bankTransferValidation = [
  body('toAccount')
    .isString()
    .trim()
    .isLength({ min: 5, max: 20 })
    .withMessage('Invalid destination account'),
  body('toBankCode')
    .isString()
    .isIn(['banco_estado', 'santander', 'bci', 'banco_chile', 'scotiabank'])
    .withMessage('Invalid bank code'),
  body('amount')
    .isFloat({ min: 0 })
    .withMessage('Amount must be positive'),
  body('currency')
    .optional()
    .isIn(['CLP'])
    .withMessage('Only CLP is supported for bank transfers'),
  body('description')
    .isString()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Description is required'),
  body('recipientName')
    .isString()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Recipient name is required'),
  body('recipientRut')
    .isString()
    .trim()
    .matches(/^\d{7,8}-[\dkK]$/)
    .withMessage('Invalid recipient RUT format'),
  body('recipientEmail')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid recipient email'),
];

// Routes

// Validate bank account
router.post(
  '/validate-account',
  requirePermission('payments.create'),
  validate(validateAccountValidation),
  bankController.validateBankAccount
);

// Get available payment methods for a bank
router.get(
  '/payment-methods',
  requirePermission('payments.read'),
  bankController.getPaymentMethods
);

// Initiate bank transfer
router.post(
  '/transfer',
  requirePermission('payments.transfer'),
  validate(bankTransferValidation),
  bankController.initiateBankTransfer
);

// Get bank information
router.get(
  '/info/:bankCode',
  requirePermission('payments.read'),
  bankController.getBankInfo
);

// Get supported banks
router.get(
  '/supported',
  bankController.getSupportedBanks
);

export default router;