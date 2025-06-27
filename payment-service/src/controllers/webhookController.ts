import { Request, Response, NextFunction } from 'express';
import { webhookService } from '../services/webhookService';
import { publisher } from '../config/rabbitmq';
import { logger, logWebhookEvent } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { WebhookPayload } from '../types/bank.types';

export const webhookController = {
  // Handle Banco Estado webhook
  handleBancoEstadoWebhook: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const signature = req.headers['x-signature'] as string;
      const provider = 'banco_estado';

      // Validate signature
      const isValid = await webhookService.validateWebhookSignature(provider, req.body, signature);
      
      if (!isValid) {
        throw new AppError('Invalid webhook signature', 401, 'INVALID_SIGNATURE');
      }

      // Log webhook
      logWebhookEvent(provider, req.body.event || 'unknown', req.body);

      // Process webhook asynchronously via RabbitMQ
      const webhookPayload: WebhookPayload = {
        event: req.body.event,
        transactionId: req.body.transactionId,
        bankTransactionId: req.body.bankTransactionId,
        status: req.body.status,
        amount: req.body.amount,
        currency: req.body.currency,
        timestamp: req.body.timestamp || new Date().toISOString(),
        signature,
        metadata: req.body.metadata,
      };

      await publisher.webhookReceived({
        provider,
        payload: webhookPayload,
        receivedAt: new Date().toISOString(),
      });

      // Respond immediately to webhook
      res.status(200).json({ received: true });
    } catch (error) {
      logger.error('Error handling Banco Estado webhook:', error);
      next(error);
    }
  },

  // Handle Santander webhook
  handleSantanderWebhook: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const signature = req.headers['x-santander-signature'] as string;
      const provider = 'santander';

      // Validate signature
      const isValid = await webhookService.validateWebhookSignature(provider, req.body, signature);
      
      if (!isValid) {
        throw new AppError('Invalid webhook signature', 401, 'INVALID_SIGNATURE');
      }

      // Log webhook
      logWebhookEvent(provider, req.body.eventType || 'unknown', req.body);

      // Map Santander webhook format
      const webhookPayload: WebhookPayload = {
        event: req.body.eventType,
        transactionId: req.body.data?.paymentId,
        bankTransactionId: req.body.data?.orderId,
        status: req.body.data?.status,
        amount: req.body.data?.amount?.value,
        currency: req.body.data?.amount?.currency,
        timestamp: req.body.timestamp,
        signature,
        metadata: req.body.data?.metadata,
      };

      await publisher.webhookReceived({
        provider,
        payload: webhookPayload,
        receivedAt: new Date().toISOString(),
      });

      res.status(200).json({ received: true });
    } catch (error) {
      logger.error('Error handling Santander webhook:', error);
      next(error);
    }
  },

  // Handle BCI webhook
  handleBCIWebhook: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = req.headers['tbk-token'] as string;
      const provider = 'bci';

      // Transbank uses a different validation mechanism
      if (!token) {
        throw new AppError('Missing Transbank token', 401, 'MISSING_TOKEN');
      }

      // Log webhook
      logWebhookEvent(provider, 'transbank_notification', req.body);

      // Map Transbank webhook format
      const webhookPayload: WebhookPayload = {
        event: 'payment.notification',
        transactionId: req.body.buy_order,
        bankTransactionId: req.body.transaction_id,
        status: req.body.status,
        amount: req.body.amount,
        currency: 'CLP',
        timestamp: req.body.accounting_date || new Date().toISOString(),
        signature: token,
        metadata: {
          commerceCode: req.body.commerce_code,
          responseCode: req.body.response_code,
          installments: req.body.installments_number,
        },
      };

      await publisher.webhookReceived({
        provider,
        payload: webhookPayload,
        receivedAt: new Date().toISOString(),
      });

      res.status(200).json({ received: true });
    } catch (error) {
      logger.error('Error handling BCI webhook:', error);
      next(error);
    }
  },

  // Handle Banco de Chile webhook
  handleBancoChileWebhook: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const signature = req.headers['x-bch-signature'] as string;
      const provider = 'banco_chile';

      // Validate signature
      const isValid = await webhookService.validateWebhookSignature(provider, req.body, signature);
      
      if (!isValid) {
        throw new AppError('Invalid webhook signature', 401, 'INVALID_SIGNATURE');
      }

      // Log webhook
      logWebhookEvent(provider, req.body.eventType || 'unknown', req.body);

      // Map webhook format
      const webhookPayload: WebhookPayload = {
        event: req.body.eventType,
        transactionId: req.body.merchantTransactionId,
        bankTransactionId: req.body.bankTransactionId,
        status: req.body.transactionStatus,
        amount: req.body.amount,
        currency: req.body.currency || 'CLP',
        timestamp: req.body.eventTime,
        signature,
        metadata: req.body.additionalData,
      };

      await publisher.webhookReceived({
        provider,
        payload: webhookPayload,
        receivedAt: new Date().toISOString(),
      });

      res.status(200).json({ received: true });
    } catch (error) {
      logger.error('Error handling Banco de Chile webhook:', error);
      next(error);
    }
  },

  // Handle Scotiabank webhook
  handleScotiabankWebhook: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const signature = req.headers['x-scotia-signature'] as string;
      const provider = 'scotiabank';

      // Validate signature
      const isValid = await webhookService.validateWebhookSignature(provider, req.body, signature);
      
      if (!isValid) {
        throw new AppError('Invalid webhook signature', 401, 'INVALID_SIGNATURE');
      }

      // Log webhook
      logWebhookEvent(provider, req.body.notificationType || 'unknown', req.body);

      // Map webhook format
      const webhookPayload: WebhookPayload = {
        event: req.body.notificationType,
        transactionId: req.body.referenceNumber,
        bankTransactionId: req.body.transactionId,
        status: req.body.status,
        amount: req.body.amount,
        currency: 'CLP',
        timestamp: req.body.timestamp,
        signature,
        metadata: req.body.metadata,
      };

      await publisher.webhookReceived({
        provider,
        payload: webhookPayload,
        receivedAt: new Date().toISOString(),
      });

      res.status(200).json({ received: true });
    } catch (error) {
      logger.error('Error handling Scotiabank webhook:', error);
      next(error);
    }
  },

  // Handle PayPal webhook
  handlePayPalWebhook: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const signature = req.headers['paypal-transmission-sig'] as string;
      const provider = 'paypal';

      // Validate signature
      const isValid = await webhookService.validateWebhookSignature(provider, req.body, signature);
      
      if (!isValid) {
        throw new AppError('Invalid webhook signature', 401, 'INVALID_SIGNATURE');
      }

      // Log webhook
      logWebhookEvent(provider, req.body.event_type || 'unknown', req.body);

      // Map PayPal webhook format
      const resource = req.body.resource || {};
      const webhookPayload: WebhookPayload = {
        event: req.body.event_type,
        transactionId: resource.invoice_number || resource.invoice_id,
        bankTransactionId: resource.id,
        status: resource.state || resource.status,
        amount: parseFloat(resource.amount?.total || resource.amount?.value || 0),
        currency: resource.amount?.currency,
        timestamp: req.body.create_time,
        signature,
        metadata: {
          paymentId: resource.parent_payment,
          saleId: resource.sale_id,
          payerId: resource.payer_id,
        },
      };

      await publisher.webhookReceived({
        provider,
        payload: webhookPayload,
        receivedAt: new Date().toISOString(),
      });

      res.status(200).json({ received: true });
    } catch (error) {
      logger.error('Error handling PayPal webhook:', error);
      next(error);
    }
  },

  // Handle MercadoPago webhook
  handleMercadoPagoWebhook: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const signature = req.headers['x-signature'] as string;
      const provider = 'mercadopago';

      // Validate signature
      const isValid = await webhookService.validateWebhookSignature(provider, req.body, signature);
      
      if (!isValid) {
        throw new AppError('Invalid webhook signature', 401, 'INVALID_SIGNATURE');
      }

      // Log webhook
      logWebhookEvent(provider, req.body.type || 'unknown', req.body);

      // MercadoPago sends minimal data in webhook, need to fetch full payment info
      // For now, just forward the notification
      const webhookPayload: WebhookPayload = {
        event: req.body.type,
        transactionId: req.body.data?.id?.toString(),
        bankTransactionId: req.body.data?.id?.toString(),
        status: req.body.action,
        amount: 0, // Would need to fetch from API
        currency: 'CLP',
        timestamp: req.body.date_created || new Date().toISOString(),
        signature,
        metadata: {
          userId: req.body.user_id,
          action: req.body.action,
          apiVersion: req.body.api_version,
        },
      };

      await publisher.webhookReceived({
        provider,
        payload: webhookPayload,
        receivedAt: new Date().toISOString(),
      });

      res.status(200).json({ received: true });
    } catch (error) {
      logger.error('Error handling MercadoPago webhook:', error);
      next(error);
    }
  },

  // Handle Stripe webhook
  handleStripeWebhook: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const signature = req.headers['stripe-signature'] as string;
      const provider = 'stripe';

      // Validate signature
      const isValid = await webhookService.validateWebhookSignature(provider, req.body, signature);
      
      if (!isValid) {
        throw new AppError('Invalid webhook signature', 401, 'INVALID_SIGNATURE');
      }

      // Log webhook
      logWebhookEvent(provider, req.body.type || 'unknown', req.body);

      // Map Stripe webhook format
      const data = req.body.data?.object || {};
      const webhookPayload: WebhookPayload = {
        event: req.body.type,
        transactionId: data.metadata?.transactionId || data.id,
        bankTransactionId: data.id,
        status: data.status,
        amount: data.amount ? data.amount / 100 : 0, // Stripe uses cents
        currency: data.currency?.toUpperCase(),
        timestamp: new Date(req.body.created * 1000).toISOString(),
        signature,
        metadata: {
          customerId: data.customer,
          paymentMethod: data.payment_method,
          livemode: req.body.livemode,
        },
      };

      await publisher.webhookReceived({
        provider,
        payload: webhookPayload,
        receivedAt: new Date().toISOString(),
      });

      res.status(200).json({ received: true });
    } catch (error) {
      logger.error('Error handling Stripe webhook:', error);
      next(error);
    }
  },

  // Handle generic webhook (for testing)
  handleGenericWebhook: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { provider } = req.params;
      const signature = req.headers['x-webhook-signature'] as string || 'test-signature';

      // Log webhook
      logWebhookEvent(provider, 'generic', req.body);

      // Forward as generic webhook
      const webhookPayload: WebhookPayload = {
        event: req.body.event || 'generic.webhook',
        transactionId: req.body.transactionId,
        bankTransactionId: req.body.bankTransactionId,
        status: req.body.status,
        amount: req.body.amount,
        currency: req.body.currency || 'CLP',
        timestamp: req.body.timestamp || new Date().toISOString(),
        signature,
        metadata: req.body.metadata || req.body,
      };

      await publisher.webhookReceived({
        provider,
        payload: webhookPayload,
        receivedAt: new Date().toISOString(),
      });

      res.status(200).json({ 
        received: true,
        provider,
        message: 'Generic webhook received and queued for processing',
      });
    } catch (error) {
      logger.error('Error handling generic webhook:', error);
      next(error);
    }
  },
};