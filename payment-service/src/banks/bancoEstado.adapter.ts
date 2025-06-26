import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { config } from '../config/config';
import { AppError } from '../utils/AppError';
import { 
  BankAdapter, 
  PaymentRequest, 
  PaymentResponse, 
  PaymentStatus,
  RefundRequest,
  RefundResponse,
  TransactionQuery,
  TransactionResponse,
  BankAccountValidation
} from '../types/bank.types';

export class BancoEstadoAdapter implements BankAdapter {
  private client: AxiosInstance;
  private apiKey: string;
  private apiSecret: string;
  private merchantId: string;

  constructor() {
    const bankConfig = config.banks.bancoEstado;
    
    if (!bankConfig.apiKey || !bankConfig.apiSecret || !bankConfig.merchantId) {
      throw new Error('Banco Estado configuration is incomplete');
    }

    this.apiKey = bankConfig.apiKey;
    this.apiSecret = bankConfig.apiSecret;
    this.merchantId = bankConfig.merchantId;

    this.client = axios.create({
      baseURL: bankConfig.apiUrl,
      timeout: bankConfig.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
    });

    // Add request interceptor for authentication
    this.client.interceptors.request.use(
      (request) => {
        const timestamp = new Date().toISOString();
        const nonce = uuidv4();
        
        // Generate signature
        const signature = this.generateSignature(
          request.method?.toUpperCase() || 'GET',
          request.url || '',
          timestamp,
          nonce,
          request.data ? JSON.stringify(request.data) : ''
        );

        // Add authentication headers
        request.headers['X-Timestamp'] = timestamp;
        request.headers['X-Nonce'] = nonce;
        request.headers['X-Signature'] = signature;
        request.headers['X-Merchant-Id'] = this.merchantId;

        return request;
      },
      (error) => {
        logger.error('Banco Estado request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('Banco Estado API error:', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
        });

        if (error.response) {
          const { status, data } = error.response;
          
          switch (status) {
            case 401:
              throw new AppError('Authentication failed with Banco Estado', 401);
            case 403:
              throw new AppError('Access forbidden to Banco Estado resource', 403);
            case 429:
              throw new AppError('Rate limit exceeded for Banco Estado', 429);
            case 500:
              throw new AppError('Banco Estado internal server error', 500);
            default:
              throw new AppError(
                data.message || 'Banco Estado API error',
                status,
                data.code
              );
          }
        }

        throw new AppError('Network error connecting to Banco Estado', 503);
      }
    );
  }

  private generateSignature(
    method: string,
    path: string,
    timestamp: string,
    nonce: string,
    body: string
  ): string {
    const message = `${method}${path}${timestamp}${nonce}${body}`;
    const hmac = crypto.createHmac('sha256', this.apiSecret);
    hmac.update(message);
    return hmac.digest('base64');
  }

  async processPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      logger.info('Processing payment with Banco Estado', {
        transactionId: request.transactionId,
        amount: request.amount,
        currency: request.currency,
      });

      const payload = {
        transactionId: request.transactionId,
        amount: request.amount,
        currency: request.currency,
        description: request.description,
        customerEmail: request.customerEmail,
        customerName: request.customerName,
        customerRut: request.customerRut,
        callbackUrl: request.callbackUrl,
        metadata: request.metadata,
        paymentMethod: request.paymentMethod,
      };

      const response = await this.client.post('/payments', payload);

      const paymentResponse: PaymentResponse = {
        transactionId: response.data.transactionId,
        bankTransactionId: response.data.bankTransactionId,
        status: this.mapPaymentStatus(response.data.status),
        amount: response.data.amount,
        currency: response.data.currency,
        authorizationCode: response.data.authorizationCode,
        redirectUrl: response.data.redirectUrl,
        timestamp: new Date(response.data.timestamp),
        rawResponse: response.data,
      };

      logger.info('Banco Estado payment processed successfully', {
        transactionId: paymentResponse.transactionId,
        bankTransactionId: paymentResponse.bankTransactionId,
        status: paymentResponse.status,
      });

      return paymentResponse;
    } catch (error) {
      logger.error('Error processing payment with Banco Estado:', error);
      throw error;
    }
  }

  async confirmPayment(transactionId: string): Promise<PaymentResponse> {
    try {
      logger.info('Confirming payment with Banco Estado', { transactionId });

      const response = await this.client.post(`/payments/${transactionId}/confirm`);

      const paymentResponse: PaymentResponse = {
        transactionId: response.data.transactionId,
        bankTransactionId: response.data.bankTransactionId,
        status: this.mapPaymentStatus(response.data.status),
        amount: response.data.amount,
        currency: response.data.currency,
        authorizationCode: response.data.authorizationCode,
        timestamp: new Date(response.data.timestamp),
        rawResponse: response.data,
      };

      logger.info('Banco Estado payment confirmed', {
        transactionId: paymentResponse.transactionId,
        status: paymentResponse.status,
      });

      return paymentResponse;
    } catch (error) {
      logger.error('Error confirming payment with Banco Estado:', error);
      throw error;
    }
  }

  async cancelPayment(transactionId: string): Promise<PaymentResponse> {
    try {
      logger.info('Canceling payment with Banco Estado', { transactionId });

      const response = await this.client.post(`/payments/${transactionId}/cancel`);

      const paymentResponse: PaymentResponse = {
        transactionId: response.data.transactionId,
        bankTransactionId: response.data.bankTransactionId,
        status: PaymentStatus.CANCELLED,
        amount: response.data.amount,
        currency: response.data.currency,
        timestamp: new Date(response.data.timestamp),
        rawResponse: response.data,
      };

      logger.info('Banco Estado payment cancelled', {
        transactionId: paymentResponse.transactionId,
      });

      return paymentResponse;
    } catch (error) {
      logger.error('Error canceling payment with Banco Estado:', error);
      throw error;
    }
  }

  async refundPayment(request: RefundRequest): Promise<RefundResponse> {
    try {
      logger.info('Processing refund with Banco Estado', {
        originalTransactionId: request.originalTransactionId,
        amount: request.amount,
      });

      const payload = {
        originalTransactionId: request.originalTransactionId,
        refundTransactionId: request.refundTransactionId,
        amount: request.amount,
        reason: request.reason,
        metadata: request.metadata,
      };

      const response = await this.client.post('/refunds', payload);

      const refundResponse: RefundResponse = {
        refundTransactionId: response.data.refundTransactionId,
        bankRefundId: response.data.bankRefundId,
        originalTransactionId: response.data.originalTransactionId,
        status: this.mapPaymentStatus(response.data.status),
        amount: response.data.amount,
        currency: response.data.currency,
        timestamp: new Date(response.data.timestamp),
        rawResponse: response.data,
      };

      logger.info('Banco Estado refund processed successfully', {
        refundTransactionId: refundResponse.refundTransactionId,
        status: refundResponse.status,
      });

      return refundResponse;
    } catch (error) {
      logger.error('Error processing refund with Banco Estado:', error);
      throw error;
    }
  }

  async getTransaction(query: TransactionQuery): Promise<TransactionResponse> {
    try {
      logger.info('Querying transaction from Banco Estado', query);

      const params: any = {};
      if (query.transactionId) params.transactionId = query.transactionId;
      if (query.bankTransactionId) params.bankTransactionId = query.bankTransactionId;

      const response = await this.client.get('/transactions', { params });

      if (!response.data || response.data.length === 0) {
        throw new AppError('Transaction not found', 404);
      }

      const transaction = response.data[0];

      const transactionResponse: TransactionResponse = {
        transactionId: transaction.transactionId,
        bankTransactionId: transaction.bankTransactionId,
        status: this.mapPaymentStatus(transaction.status),
        amount: transaction.amount,
        currency: transaction.currency,
        createdAt: new Date(transaction.createdAt),
        updatedAt: new Date(transaction.updatedAt),
        authorizationCode: transaction.authorizationCode,
        paymentMethod: transaction.paymentMethod,
        customerEmail: transaction.customerEmail,
        metadata: transaction.metadata,
        rawResponse: transaction,
      };

      return transactionResponse;
    } catch (error) {
      logger.error('Error querying transaction from Banco Estado:', error);
      throw error;
    }
  }

  async validateBankAccount(account: BankAccountValidation): Promise<boolean> {
    try {
      logger.info('Validating bank account with Banco Estado', {
        accountNumber: account.accountNumber.substring(0, 4) + '****',
      });

      const payload = {
        accountNumber: account.accountNumber,
        accountType: account.accountType,
        rut: account.rut,
        name: account.name,
      };

      const response = await this.client.post('/accounts/validate', payload);

      return response.data.valid === true;
    } catch (error) {
      logger.error('Error validating bank account with Banco Estado:', error);
      return false;
    }
  }

  async getPaymentMethods(): Promise<any[]> {
    try {
      logger.info('Fetching payment methods from Banco Estado');

      const response = await this.client.get('/payment-methods');

      return response.data.methods || [];
    } catch (error) {
      logger.error('Error fetching payment methods from Banco Estado:', error);
      throw error;
    }
  }

  private mapPaymentStatus(bankStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'APPROVED': PaymentStatus.COMPLETED,
      'PENDING': PaymentStatus.PENDING,
      'PROCESSING': PaymentStatus.PROCESSING,
      'REJECTED': PaymentStatus.FAILED,
      'CANCELLED': PaymentStatus.CANCELLED,
      'EXPIRED': PaymentStatus.EXPIRED,
      'REFUNDED': PaymentStatus.REFUNDED,
    };

    return statusMap[bankStatus] || PaymentStatus.UNKNOWN;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', {
        timeout: 5000,
      });
      return response.status === 200;
    } catch (error) {
      logger.error('Banco Estado health check failed:', error);
      return false;
    }
  }
}