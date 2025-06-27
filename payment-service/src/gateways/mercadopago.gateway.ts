import axios, { AxiosInstance } from 'axios';
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

export class MercadoPagoGateway implements PaymentGateway {
  private client: AxiosInstance;
  private accessToken: string;
  private publicKey: string;
  private webhookSecret: string;

  constructor() {
    const mpConfig = config.gateways.mercadopago;
    
    if (!mpConfig.accessToken || !mpConfig.publicKey) {
      throw new Error('MercadoPago configuration is incomplete');
    }

    this.accessToken = mpConfig.accessToken;
    this.publicKey = mpConfig.publicKey;
    this.webhookSecret = mpConfig.webhookSecret;

    this.client = axios.create({
      baseURL: 'https://api.mercadopago.com',
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': uuidv4(),
      },
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('MercadoPago API error:', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
        });

        if (error.response) {
          const { status, data } = error.response;
          
          switch (status) {
            case 400:
              throw new PaymentError(
                data.message || 'Invalid request to MercadoPago',
                'INVALID_REQUEST',
                400,
                data
              );
            case 401:
              throw new PaymentError(
                'Authentication failed with MercadoPago',
                'AUTH_ERROR',
                401
              );
            case 403:
              throw new AppError('Access forbidden to MercadoPago resource', 403);
            case 404:
              throw new AppError('MercadoPago resource not found', 404);
            case 429:
              throw new AppError('Rate limit exceeded for MercadoPago', 429);
            default:
              throw new AppError(
                data.message || 'MercadoPago API error',
                status
              );
          }
        }

        throw new AppError('Network error connecting to MercadoPago', 503);
      }
    );

    logger.info('MercadoPago gateway initialized');
  }

  async createPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      logger.info('Creating MercadoPago payment', {
        transactionId: request.transactionId,
        amount: request.amount,
        currency: request.currency,
      });

      const payload = {
        transaction_amount: request.amount,
        description: request.description,
        external_reference: request.transactionId,
        notification_url: request.callbackUrl,
        back_urls: {
          success: request.successUrl || `${request.callbackUrl}?status=success`,
          failure: request.failureUrl || `${request.callbackUrl}?status=failure`,
          pending: `${request.callbackUrl}?status=pending`,
        },
        auto_return: 'approved',
        payer: {
          email: request.customerEmail,
          first_name: request.customerName.split(' ')[0],
          last_name: request.customerName.split(' ').slice(1).join(' ') || '',
          phone: request.customerPhone ? {
            number: request.customerPhone,
          } : undefined,
          identification: request.customerRut ? {
            type: 'RUT',
            number: request.customerRut,
          } : undefined,
        },
        payment_methods: {
          excluded_payment_types: [],
          installments: request.installments || 1,
          default_installments: request.installments || 1,
        },
        metadata: {
          ...request.metadata,
          integration_source: 'skyn3t_payment_service',
        },
        binary_mode: false, // Allow pending payments
      };

      const response = await this.client.post('/checkout/preferences', payload);

      const paymentResponse: PaymentResponse = {
        transactionId: request.transactionId,
        bankTransactionId: response.data.id,
        status: PaymentStatus.PENDING,
        amount: request.amount,
        currency: request.currency,
        redirectUrl: response.data.init_point,
        timestamp: new Date(response.data.date_created),
        rawResponse: response.data,
      };

      logger.info('MercadoPago payment created successfully', {
        transactionId: paymentResponse.transactionId,
        preferenceId: response.data.id,
        initPoint: response.data.init_point,
      });

      return paymentResponse;
    } catch (error) {
      logger.error('Error creating MercadoPago payment:', error);
      throw error;
    }
  }

  async capturePayment(transactionId: string, amount?: number): Promise<PaymentResponse> {
    try {
      logger.info('Capturing MercadoPago payment', { transactionId });

      // MercadoPago doesn't have a separate capture step for most payment methods
      // Payments are automatically captured when approved
      // This method is here for interface compatibility
      
      const payment = await this.getPayment(transactionId);

      return {
        transactionId: payment.transactionId,
        bankTransactionId: payment.bankTransactionId,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        authorizationCode: payment.authorizationCode,
        timestamp: new Date(),
        rawResponse: payment.rawResponse,
      };
    } catch (error) {
      logger.error('Error capturing MercadoPago payment:', error);
      throw error;
    }
  }

  async cancelPayment(transactionId: string): Promise<PaymentResponse> {
    try {
      logger.info('Canceling MercadoPago payment', { transactionId });

      // Search for the payment by external reference
      const searchResponse = await this.client.get('/v1/payments/search', {
        params: {
          external_reference: transactionId,
        },
      });

      if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
        throw new AppError('Payment not found', 404);
      }

      const payment = searchResponse.data.results[0];
      
      // Cancel the payment
      const response = await this.client.put(`/v1/payments/${payment.id}`, {
        status: 'cancelled',
      });

      const paymentResponse: PaymentResponse = {
        transactionId: transactionId,
        bankTransactionId: payment.id.toString(),
        status: PaymentStatus.CANCELLED,
        amount: payment.transaction_amount,
        currency: payment.currency_id,
        timestamp: new Date(),
        rawResponse: response.data,
      };

      logger.info('MercadoPago payment cancelled', {
        transactionId: paymentResponse.transactionId,
        paymentId: payment.id,
      });

      return paymentResponse;
    } catch (error) {
      logger.error('Error canceling MercadoPago payment:', error);
      throw error;
    }
  }

  async refundPayment(request: RefundRequest): Promise<RefundResponse> {
    try {
      logger.info('Processing MercadoPago refund', {
        originalTransactionId: request.originalTransactionId,
        amount: request.amount,
      });

      // Search for the original payment
      const searchResponse = await this.client.get('/v1/payments/search', {
        params: {
          external_reference: request.originalTransactionId,
        },
      });

      if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
        throw new AppError('Original payment not found', 404);
      }

      const payment = searchResponse.data.results[0];

      // Create refund
      const refundPayload = {
        amount: request.amount,
        metadata: {
          ...request.metadata,
          refund_reason: request.reason,
          refund_transaction_id: request.refundTransactionId,
        },
      };

      const response = await this.client.post(
        `/v1/payments/${payment.id}/refunds`,
        refundPayload
      );

      const refundResponse: RefundResponse = {
        refundTransactionId: request.refundTransactionId,
        bankRefundId: response.data.id.toString(),
        originalTransactionId: request.originalTransactionId,
        status: this.mapRefundStatus(response.data.status),
        amount: response.data.amount || request.amount,
        currency: payment.currency_id,
        timestamp: new Date(response.data.date_created),
        rawResponse: response.data,
      };

      logger.info('MercadoPago refund processed successfully', {
        refundTransactionId: refundResponse.refundTransactionId,
        refundId: response.data.id,
        status: refundResponse.status,
      });

      return refundResponse;
    } catch (error) {
      logger.error('Error processing MercadoPago refund:', error);
      throw error;
    }
  }

  async getPayment(transactionId: string): Promise<TransactionResponse> {
    try {
      logger.info('Getting MercadoPago payment details', { transactionId });

      // Search by external reference
      const searchResponse = await this.client.get('/v1/payments/search', {
        params: {
          external_reference: transactionId,
        },
      });

      if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
        throw new AppError('Payment not found', 404);
      }

      const payment = searchResponse.data.results[0];

      const transactionResponse: TransactionResponse = {
        transactionId: payment.external_reference,
        bankTransactionId: payment.id.toString(),
        status: this.mapPaymentStatus(payment.status),
        amount: payment.transaction_amount,
        currency: payment.currency_id,
        createdAt: new Date(payment.date_created),
        updatedAt: new Date(payment.date_last_updated || payment.date_created),
        authorizationCode: payment.authorization_code,
        paymentMethod: this.mapPaymentMethod(payment.payment_type_id),
        customerEmail: payment.payer?.email,
        customerName: payment.payer ? 
          `${payment.payer.first_name || ''} ${payment.payer.last_name || ''}`.trim() : 
          undefined,
        metadata: payment.metadata,
        refunds: payment.refunds?.map((refund: any) => ({
          refundTransactionId: refund.metadata?.refund_transaction_id,
          bankRefundId: refund.id.toString(),
          originalTransactionId: transactionId,
          status: this.mapRefundStatus(refund.status),
          amount: refund.amount,
          currency: payment.currency_id,
          timestamp: new Date(refund.date_created),
        })),
        rawResponse: payment,
      };

      return transactionResponse;
    } catch (error) {
      logger.error('Error getting MercadoPago payment:', error);
      throw error;
    }
  }

  async listPayments(query: TransactionQuery): Promise<TransactionResponse[]> {
    try {
      logger.info('Listing MercadoPago payments', query);

      const params: any = {
        sort: 'date_created',
        criteria: 'desc',
      };

      if (query.startDate) {
        params.begin_date = query.startDate.toISOString();
      }
      
      if (query.endDate) {
        params.end_date = query.endDate.toISOString();
      }

      const response = await this.client.get('/v1/payments/search', { params });

      const payments = response.data.results || [];

      return payments.map((payment: any) => ({
        transactionId: payment.external_reference,
        bankTransactionId: payment.id.toString(),
        status: this.mapPaymentStatus(payment.status),
        amount: payment.transaction_amount,
        currency: payment.currency_id,
        createdAt: new Date(payment.date_created),
        updatedAt: new Date(payment.date_last_updated || payment.date_created),
        authorizationCode: payment.authorization_code,
        paymentMethod: this.mapPaymentMethod(payment.payment_type_id),
        customerEmail: payment.payer?.email,
        metadata: payment.metadata,
        rawResponse: payment,
      }));
    } catch (error) {
      logger.error('Error listing MercadoPago payments:', error);
      throw error;
    }
  }

  validateWebhook(payload: any, signature: string): boolean {
    try {
      if (!this.webhookSecret) {
        logger.warn('MercadoPago webhook secret not configured');
        return true; // Allow webhook if secret not configured
      }

      // MercadoPago webhook validation
      const xSignature = signature;
      const xRequestId = payload.id;
      const dataId = payload.data?.id;

      // Construct the manifest string
      const manifest = `id:${dataId};request-id:${xRequestId};`;
      
      // Calculate HMAC
      const hmac = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(manifest)
        .digest('hex');

      // Compare signatures
      const expectedSignature = `ts=${Math.floor(Date.now() / 1000)},v1=${hmac}`;
      
      return xSignature.includes(hmac);
    } catch (error) {
      logger.error('MercadoPago webhook validation error:', error);
      return false;
    }
  }

  async processWebhook(payload: WebhookPayload): Promise<void> {
    try {
      logger.info('Processing MercadoPago webhook', {
        event: payload.event,
        transactionId: payload.transactionId,
      });

      // MercadoPago sends minimal data in webhooks
      // Usually need to fetch the full payment details
      if (payload.event === 'payment.updated' && payload.bankTransactionId) {
        const payment = await this.client.get(`/v1/payments/${payload.bankTransactionId}`);
        
        logger.info('MercadoPago payment updated via webhook', {
          paymentId: payload.bankTransactionId,
          status: payment.data.status,
          externalReference: payment.data.external_reference,
        });
      }
    } catch (error) {
      logger.error('Error processing MercadoPago webhook:', error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Test API connection by getting user info
      const response = await this.client.get('/users/me', {
        timeout: 5000,
      });
      return response.status === 200;
    } catch (error) {
      logger.error('MercadoPago health check failed:', error);
      return false;
    }
  }

  // Private helper methods
  private mapPaymentStatus(mpStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'pending': PaymentStatus.PENDING,
      'approved': PaymentStatus.COMPLETED,
      'authorized': PaymentStatus.PROCESSING,
      'in_process': PaymentStatus.PROCESSING,
      'in_mediation': PaymentStatus.PROCESSING,
      'rejected': PaymentStatus.FAILED,
      'cancelled': PaymentStatus.CANCELLED,
      'refunded': PaymentStatus.REFUNDED,
      'charged_back': PaymentStatus.REFUNDED,
    };

    return statusMap[mpStatus] || PaymentStatus.UNKNOWN;
  }

  private mapRefundStatus(refundStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'approved': PaymentStatus.REFUNDED,
      'pending': PaymentStatus.PROCESSING,
      'cancelled': PaymentStatus.CANCELLED,
    };

    return statusMap[refundStatus] || PaymentStatus.UNKNOWN;
  }

  private mapPaymentMethod(paymentTypeId: string): string {
    const methodMap: Record<string, string> = {
      'credit_card': 'CREDIT_CARD',
      'debit_card': 'DEBIT_CARD',
      'ticket': 'CASH_PAYMENT',
      'bank_transfer': 'BANK_TRANSFER',
      'account_money': 'MERCADOPAGO',
      'digital_wallet': 'DIGITAL_WALLET',
    };

    return methodMap[paymentTypeId] || paymentTypeId.toUpperCase();
  }
}