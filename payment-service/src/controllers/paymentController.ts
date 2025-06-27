import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { paymentService } from '../services/paymentService';
import { AppError } from '../utils/AppError';
import { logger, logPaymentEvent } from '../utils/logger';
import { PaymentStatus } from '../types/bank.types';

export const paymentController = {
  // Create new payment
  createPayment: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const communityId = req.user!.communityId || req.body.communityId;

      if (!communityId) {
        throw new AppError('Community ID is required', 400, 'MISSING_COMMUNITY_ID');
      }

      const paymentData = {
        ...req.body,
        userId,
        communityId,
        transactionId: `TXN-${Date.now()}-${uuidv4().substring(0, 8)}`,
      };

      const payment = await paymentService.createPayment(paymentData);

      logPaymentEvent('payment_created', payment.transactionId, payment.provider, {
        userId,
        communityId,
        amount: payment.amount,
        currency: payment.currency,
      });

      res.status(201).json({
        success: true,
        data: payment,
      });
    } catch (error) {
      next(error);
    }
  },

  // Get payment by ID
  getPayment: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const payment = await paymentService.getPaymentById(id, userId);

      res.json({
        success: true,
        data: payment,
      });
    } catch (error) {
      next(error);
    }
  },

  // List payments
  listPayments: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const communityId = req.user!.communityId;
      
      const filters = {
        ...req.query,
        userId: req.user!.role === 'SUPER_ADMIN' ? undefined : userId,
        communityId: req.user!.role === 'SUPER_ADMIN' ? req.query.communityId : communityId,
      };

      const result = await paymentService.listPayments(filters);

      res.json({
        success: true,
        data: result.payments,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  // Capture payment
  capturePayment: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { amount } = req.body;
      const userId = req.user!.id;

      const payment = await paymentService.capturePayment(id, userId, amount);

      logPaymentEvent('payment_captured', payment.transactionId, payment.provider, {
        userId,
        amount: payment.amount,
        authorizationCode: payment.authorizationCode,
      });

      res.json({
        success: true,
        data: payment,
      });
    } catch (error) {
      next(error);
    }
  },

  // Cancel payment
  cancelPayment: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const payment = await paymentService.cancelPayment(id, userId);

      logPaymentEvent('payment_cancelled', payment.transactionId, payment.provider, {
        userId,
      });

      res.json({
        success: true,
        data: payment,
      });
    } catch (error) {
      next(error);
    }
  },

  // Refund payment
  refundPayment: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { amount, reason } = req.body;
      const userId = req.user!.id;

      const refund = await paymentService.refundPayment(id, userId, amount, reason);

      logPaymentEvent('payment_refunded', refund.payment.transactionId, refund.payment.provider, {
        userId,
        refundAmount: amount,
        reason,
      });

      res.json({
        success: true,
        data: refund,
      });
    } catch (error) {
      next(error);
    }
  },

  // Get payment status (public endpoint)
  getPaymentStatus: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const status = await paymentService.getPaymentStatus(id);

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      next(error);
    }
  },

  // Retry failed payment
  retryPayment: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const payment = await paymentService.retryPayment(id, userId);

      logPaymentEvent('payment_retried', payment.transactionId, payment.provider, {
        userId,
        previousStatus: PaymentStatus.FAILED,
        newStatus: payment.status,
      });

      res.json({
        success: true,
        data: payment,
      });
    } catch (error) {
      next(error);
    }
  },

  // Get payment receipt
  getPaymentReceipt: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const receipt = await paymentService.generateReceipt(id, userId);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="receipt-${id}.pdf"`);
      res.send(receipt);
    } catch (error) {
      next(error);
    }
  },

  // Reconcile payment manually
  reconcilePayment: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const result = await paymentService.reconcilePayment(id, userId);

      logger.info('Payment reconciled manually', {
        paymentId: id,
        userId,
        result,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  // Export payments
  exportPayments: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { paymentIds } = req.body;
      const userId = req.user!.id;

      const exportData = await paymentService.exportPayments(paymentIds, userId);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="payments-export.csv"');
      res.send(exportData);
    } catch (error) {
      next(error);
    }
  },
};