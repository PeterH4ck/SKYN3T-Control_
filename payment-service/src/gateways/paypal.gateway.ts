import paypal from 'paypal-rest-sdk';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { config } from '../config/config';
import { AppError } from '../utils/AppError';
import {
  PaymentGateway,
  PaymentRequest,
  PaymentResponse,
  PaymentStatus,
  RefundRequest,
  RefundResponse,
  TransactionQuery,
  TransactionResponse,
  WebhookPayload,
  PaymentError,
  Currency
} from '../types/bank.types';

export class PayPalGateway implements PaymentGateway {
  private webhookId: string;

  constructor() {
    const paypalConfig = config.gateways.paypal;
    
    if (!paypalConfig.clientId || !paypalConfig.clientSecret) {
      throw new Error('PayPal configuration is incomplete');
    }

    // Configure PayPal SDK
    paypal.configure({
      mode: paypalConfig.mode,
      client_id: paypalConfig.clientId,
      client_secret: paypalConfig.clientSecret,
    });

    this.webhookId = paypalConfig.webhookId;

    logger.info('PayPal gateway initialized', { mode: paypalConfig.mode });
  }

  async createPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      logger.info('Creating PayPal payment', {
        transactionId: request.transactionId,
        amount: request.amount,
        currency: request.currency,
      });

      const createPaymentJson = {
        intent: 'sale',
        payer: {
          payment_method: 'paypal',
        },
        redirect_urls: {
          return_url: request.successUrl || `${request.callbackUrl}?status=success`,
          cancel_url: request.failureUrl || `${request.callbackUrl}?status=cancel`,
        },
        transactions: [{
          item_list: {
            items: [{
              name: request.description,
              sku: request.transactionId,
              price: request.amount.toFixed(2),
              currency: request.currency,
              quantity: 1,
            }],
          },
          amount: {
            currency: request.currency,
            total: request.amount.toFixed(2),
          },
          description: request.description,
          invoice_number: request.transactionId,
          custom: JSON.stringify(request.metadata || {}),
        }],
        note_to_payer: `Payment for ${request.description}`,
      };

      const payment = await this.createPayPalPayment(createPaymentJson);

      // Extract approval URL
      const approvalUrl = payment.links?.find(
        (link: any) => link.rel === 'approval_url'
      )?.href;

      if (!approvalUrl) {
        throw new AppError('PayPal approval URL not found', 500);
      }

      const paymentResponse: PaymentResponse = {
        transactionId: request.transactionId,
        bankTransactionId: payment.id,
        status: this.mapPaymentStatus(payment.state),
        amount: parseFloat(payment.transactions[0].amount.total),
        currency: payment.transactions[0].amount.currency,
        redirectUrl: approvalUrl,
        timestamp: new Date(payment.create_time),
        rawResponse: payment,
      };

      logger.info('PayPal payment created successfully', {
        transactionId: paymentResponse.transactionId,
        paypalId: paymentResponse.bankTransactionId,
        approvalUrl,
      });

      return paymentResponse;
    } catch (error) {
      logger.error('Error creating PayPal payment:', error);
      this.handlePayPalError(error);
      throw error;
    }
  }

  async capturePayment(transactionId: string, amount?: number): Promise<PaymentResponse> {
    try {
      logger.info('Capturing PayPal payment', { transactionId });

      // For PayPal, we need the payment ID and payer ID
      // These should be stored when the user returns from PayPal
      const [paymentId, payerId] = transactionId.split(':');

      if (!paymentId || !payerId) {
        throw new AppError('Invalid transaction ID format for PayPal', 400);
      }

      const executePaymentJson = {
        payer_id: payerId,
      };

      const payment = await this.executePayPalPayment(paymentId, executePaymentJson);

      const paymentResponse: PaymentResponse = {
        transactionId: payment.transactions[0].invoice_number,
        bankTransactionId: payment.id,
        status: this.mapPaymentStatus(payment.state),
        amount: parseFloat(payment.transactions[0].amount.total),
        currency: payment.transactions[0].amount.currency,
        authorizationCode: payment.transactions[0].related_resources[0]?.sale?.id,
        timestamp: new Date(payment.update_time || payment.create_time),
        rawResponse: payment,
      };

      logger.info('PayPal payment captured successfully', {
        transactionId: paymentResponse.transactionId,
        paypalId: paymentResponse.bankTransactionId,
        status: paymentResponse.status,
      });

      return paymentResponse;
    } catch (error) {
      logger.error('Error capturing PayPal payment:', error);
      this.handlePayPalError(error);
      throw error;
    }
  }

  async cancelPayment(transactionId: string): Promise<PaymentResponse> {
    try {
      logger.info('Canceling PayPal payment', { transactionId });

      // PayPal doesn't support canceling created payments
      // We'll just mark it as cancelled in our system
      const payment = await this.getPayPalPayment(transactionId);

      const paymentResponse: PaymentResponse = {
        transactionId: payment.transactions[0].invoice_number,
        bankTransactionId: payment.id,
        status: PaymentStatus.CANCELLED,
        amount: parseFloat(payment.transactions[0].amount.total),
        currency: payment.transactions[0].amount.currency,
        timestamp: new Date(),
        rawResponse: payment,
      };

      logger.info('PayPal payment marked as cancelled', {
        transactionId: paymentResponse.transactionId,
      });

      return paymentResponse;
    } catch (error) {
      logger.error('Error canceling PayPal payment:', error);
      throw error;
    }
  }

  async refundPayment(request: RefundRequest): Promise<RefundResponse> {
    try {
      logger.info('Processing PayPal refund', {
        originalTransactionId: request.originalTransactionId,
        amount: request.amount,
      });

      // Get the original payment to find the sale ID
      const payment = await this.getPayPalPayment(request.originalTransactionId);
      const saleId = payment.transactions[0].related_resources[0]?.sale?.id;

      if (!saleId) {
        throw new AppError('Sale ID not found for refund', 404);
      }

      const refundRequest = {
        amount: {
          total: request.amount.toFixed(2),
          currency: payment.transactions[0].amount.currency,
        },
        description: request.reason,
        invoice_number: request.refundTransactionId,
      };

      const refund = await this.createPayPalRefund(saleId, refundRequest);

      const refundResponse: RefundResponse = {
        refundTransactionId: request.refundTransactionId,
        bankRefundId: refund.id,
        originalTransactionId: request.originalTransactionId,
        status: this.mapRefundStatus(refund.state),
        amount: parseFloat(refund.amount.total),
        currency: refund.amount.currency,
        timestamp: new Date(refund.create_time),
        rawResponse: refund,
      };

      logger.info('PayPal refund processed successfully', {
        refundTransactionId: refundResponse.refundTransactionId,
        paypalRefundId: refundResponse.bankRefundId,
        status: refundResponse.status,
      });

      return refundResponse;
    } catch (error) {
      logger.error('Error processing PayPal refund:', error);
      this.handlePayPalError(error);
      throw error;
    }
  }

  async getPayment(transactionId: string): Promise<TransactionResponse> {
    try {
      logger.info('Getting PayPal payment details', { transactionId });

      const payment = await this.getPayPalPayment(transactionId);

      const transactionResponse: TransactionResponse = {
        transactionId: payment.transactions[0].invoice_number,
        bankTransactionId: payment.id,
        status: this.mapPaymentStatus(payment.state),
        amount: parseFloat(payment.transactions[0].amount.total),
        currency: payment.transactions[0].amount.currency,
        createdAt: new Date(payment.create_time),
        updatedAt: new Date(payment.update_time || payment.create_time),
        authorizationCode: payment.transactions[0].related_resources[0]?.sale?.id,
        paymentMethod: 'PAYPAL',
        customerEmail: payment.payer?.payer_info?.email,
        customerName: payment.payer?.payer_info?.first_name && payment.payer?.payer_info?.last_name
          ? `${payment.payer.payer_info.first_name} ${payment.payer.payer_info.last_name}`
          : undefined,
        metadata: payment.transactions[0].custom 
          ? JSON.parse(payment.transactions[0].custom)
          : undefined,
        rawResponse: payment,
      };

      return transactionResponse;
    } catch (error) {
      logger.error('Error getting PayPal payment:', error);
      throw error;
    }
  }

  async listPayments(query: TransactionQuery): Promise<TransactionResponse[]> {
    try {
      logger.info('Listing PayPal payments', query);

      // PayPal doesn't have a direct API to list payments by custom transaction ID
      // This would typically be handled by storing payment mappings in a database
      throw new AppError('List payments not implemented for PayPal gateway', 501);
    } catch (error) {
      logger.error('Error listing PayPal payments:', error);
      throw error;
    }
  }

  validateWebhook(payload: any, signature: string): boolean {
    try {
      // PayPal webhook validation
      const expectedSignature = this.generateWebhookSignature(payload);
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      logger.error('PayPal webhook validation error:', error);
      return false;
    }
  }

  async processWebhook(payload: WebhookPayload): Promise<void> {
    try {
      logger.info('Processing PayPal webhook', {
        event: payload.event,
        transactionId: payload.transactionId,
      });

      // Process different webhook events
      switch (payload.event) {
        case 'PAYMENT.SALE.COMPLETED':
          logger.info('PayPal payment completed', { transactionId: payload.transactionId });
          break;
        
        case 'PAYMENT.SALE.REFUNDED':
          logger.info('PayPal payment refunded', { transactionId: payload.transactionId });
          break;
        
        case 'PAYMENT.SALE.REVERSED':
          logger.info('PayPal payment reversed', { transactionId: payload.transactionId });
          break;
        
        default:
          logger.warn('Unhandled PayPal webhook event', { event: payload.event });
      }
    } catch (error) {
      logger.error('Error processing PayPal webhook:', error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Test PayPal connection by getting an access token
      return new Promise((resolve) => {
        paypal.notification.webhookEvent.list(
          { page_size: 1 },
          (error, response) => {
            if (error) {
              logger.error('PayPal health check failed:', error);
              resolve(false);
            } else {
              resolve(true);
            }
          }
        );
      });
    } catch (error) {
      logger.error('PayPal health check error:', error);
      return false;
    }
  }

  // Private helper methods
  private createPayPalPayment(createPaymentJson: any): Promise<any> {
    return new Promise((resolve, reject) => {
      paypal.payment.create(createPaymentJson, (error, payment) => {
        if (error) {
          reject(error);
        } else {
          resolve(payment);
        }
      });
    });
  }

  private executePayPalPayment(paymentId: string, executePaymentJson: any): Promise<any> {
    return new Promise((resolve, reject) => {
      paypal.payment.execute(paymentId, executePaymentJson, (error, payment) => {
        if (error) {
          reject(error);
        } else {
          resolve(payment);
        }
      });
    });
  }

  private getPayPalPayment(paymentId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      paypal.payment.get(paymentId, (error, payment) => {
        if (error) {
          reject(error);
        } else {
          resolve(payment);
        }
      });
    });
  }

  private createPayPalRefund(saleId: string, refundRequest: any): Promise<any> {
    return new Promise((resolve, reject) => {
      paypal.sale.refund(saleId, refundRequest, (error, refund) => {
        if (error) {
          reject(error);
        } else {
          resolve(refund);
        }
      });
    });
  }

  private mapPaymentStatus(paypalState: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'created': PaymentStatus.PENDING,
      'approved': PaymentStatus.PROCESSING,
      'failed': PaymentStatus.FAILED,
      'canceled': PaymentStatus.CANCELLED,
      'expired': PaymentStatus.EXPIRED,
      'pending': PaymentStatus.PENDING,
      'completed': PaymentStatus.COMPLETED,
    };

    return statusMap[paypalState.toLowerCase()] || PaymentStatus.UNKNOWN;
  }

  private mapRefundStatus(refundState: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'completed': PaymentStatus.REFUNDED,
      'pending': PaymentStatus.PROCESSING,
      'failed': PaymentStatus.FAILED,
    };

    return statusMap[refundState.toLowerCase()] || PaymentStatus.UNKNOWN;
  }

  private generateWebhookSignature(payload: any): string {
    const message = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', this.webhookId)
      .update(message)
      .digest('hex');
  }

  private handlePayPalError(error: any): void {
    if (error.response) {
      const paypalError = error.response;
      
      if (paypalError.name === 'VALIDATION_ERROR') {
        throw new PaymentError(
          'Invalid payment data',
          'VALIDATION_ERROR',
          400,
          paypalError.details
        );
      }
      
      if (paypalError.name === 'UNAUTHORIZED') {
        throw new PaymentError(
          'PayPal authentication failed',
          'AUTH_ERROR',
          401
        );
      }
      
      if (paypalError.name === 'INSTRUMENT_DECLINED') {
        throw new PaymentError(
          'Payment method declined',
          'PAYMENT_DECLINED',
          402,
          paypalError
        );
      }
    }
    
    throw new PaymentError(
      error.message || 'PayPal payment failed',
      'PAYPAL_ERROR',
      500,
      error
    );
  }
}