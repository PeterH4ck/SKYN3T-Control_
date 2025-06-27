import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
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

export class BancoChileAdapter implements BankAdapter {
  private client: AxiosInstance;
  private apiKey: string;
  private apiSecret: string;
  private merchantId: string;

  constructor() {
    const bankConfig = config.banks.bancoChile;
    
    if (!bankConfig.apiKey || !bankConfig.apiSecret || !bankConfig.merchantId) {
      throw new Error('Banco de Chile configuration is incomplete');
    }

    this.apiKey = bankConfig.apiKey;
    this.apiSecret = bankConfig.apiSecret;
    this.merchantId = bankConfig.merchantId;

    this.client = axios.create({
      baseURL: bankConfig.apiUrl,
      timeout: bankConfig.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': this.apiKey,
        'X-Merchant-Id': this.merchantId,
      },
    });

    // Add request interceptor for signing
    this.client.interceptors.request.use(
      (request) => {
        const timestamp = Date.now().toString();
        const nonce = crypto.randomBytes(16).toString('hex');
        
        // Create signature
        const signatureData = `${request.method}${request.url}${timestamp}${nonce}${JSON.stringify(request.data || {})}`;
        const signature = crypto
          .createHmac('sha256', this.apiSecret)
          .update(signatureData)
          .digest('hex');

        // Add headers
        request.headers['X-Timestamp'] = timestamp;
        request.headers['X-Nonce'] = nonce;
        request.headers['X-Signature'] = signature;

        return request;
      },
      (error) => {
        logger.error('Banco de Chile request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('Banco de Chile API error:', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
        });

        if (error.response) {
          const { status, data } = error.response;
          
          switch (status) {
            case 401:
              throw new AppError('Authentication failed with Banco de Chile', 401);
            case 403:
              throw new AppError('Access forbidden to Banco de Chile resource', 403);
            case 422:
              throw new AppError(
                'Invalid request data',
                422,
                'VALIDATION_ERROR',
                data.errors
              );
            case 429:
              throw new AppError('Rate limit exceeded for Banco de Chile', 429);
            case 503:
              throw new AppError('Banco de Chile service temporarily unavailable', 503);
            default:
              throw new AppError(
                data.message || 'Banco de Chile API error',
                status,
                data.code
              );
          }
        }

        throw new AppError('Network error connecting to Banco de Chile', 503);
      }
    );
  }

  async processPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      logger.info('Processing payment with Banco de Chile', {
        transactionId: request.transactionId,
        amount: request.amount,
        currency: request.currency,
      });

      const payload = {
        merchantTransactionId: request.transactionId,
        amount: {
          value: request.amount,
          currency: request.currency,
        },
        description: request.description,
        customer: {
          email: request.customerEmail,
          fullName: request.customerName,
          documentNumber: request.customerRut,
          phone: request.customerPhone,
        },
        redirectUrls: {
          success: request.successUrl || request.callbackUrl,
          failure: request.failureUrl || request.callbackUrl,
          notification: request.callbackUrl,
        },
        paymentMethod: this.mapPaymentMethod(request.paymentMethod),
        metadata: request.metadata,
      };

      const response = await this.client.post('/payments/v1/transactions', payload);

      const paymentResponse: PaymentResponse = {
        transactionId: request.transactionId,
        bankTransactionId: response.data.transactionId,
        status: this.mapPaymentStatus(response.data.status),
        amount: response.data.amount.value,
        currency: response.data.amount.currency,
        redirectUrl: response.data.paymentUrl,
        timestamp: new Date(response.data.createdAt),
        rawResponse: response.data,
      };

      logger.info('Banco de Chile payment processed successfully', {
        transactionId: paymentResponse.transactionId,
        bankTransactionId: paymentResponse.bankTransactionId,
        status: paymentResponse.status,
      });

      return paymentResponse;
    } catch (error) {
      logger.error('Error processing payment with Banco de Chile:', error);
      throw error;
    }
  }

  async confirmPayment(transactionId: string): Promise<PaymentResponse> {
    try {
      logger.info('Confirming payment with Banco de Chile', { transactionId });

      const response = await this.client.post(
        `/payments/v1/transactions/${transactionId}/confirm`,
        {
          action: 'CONFIRM',
        }
      );

      const paymentResponse: PaymentResponse = {
        transactionId: response.data.merchantTransactionId,
        bankTransactionId: response.data.transactionId,
        status: this.mapPaymentStatus(response.data.status),
        amount: response.data.amount.value,
        currency: response.data.amount.currency,
        authorizationCode: response.data.authorizationCode,
        timestamp: new Date(response.data.updatedAt),
        rawResponse: response.data,
      };

      logger.info('Banco de Chile payment confirmed', {
        transactionId: paymentResponse.transactionId,
        status: paymentResponse.status,
      });

      return paymentResponse;
    } catch (error) {
      logger.error('Error confirming payment with Banco de Chile:', error);
      throw error;
    }
  }

  async cancelPayment(transactionId: string): Promise<PaymentResponse> {
    try {
      logger.info('Canceling payment with Banco de Chile', { transactionId });

      const response = await this.client.post(
        `/payments/v1/transactions/${transactionId}/cancel`,
        {
          reason: 'Customer request',
        }
      );

      const paymentResponse: PaymentResponse = {
        transactionId: response.data.merchantTransactionId,
        bankTransactionId: response.data.transactionId,
        status: PaymentStatus.CANCELLED,
        amount: response.data.amount.value,
        currency: response.data.amount.currency,
        timestamp: new Date(response.data.updatedAt),
        rawResponse: response.data,
      };

      logger.info('Banco de Chile payment cancelled', {
        transactionId: paymentResponse.transactionId,
      });

      return paymentResponse;
    } catch (error) {
      logger.error('Error canceling payment with Banco de Chile:', error);
      throw error;
    }
  }

  async refundPayment(request: RefundRequest): Promise<RefundResponse> {
    try {
      logger.info('Processing refund with Banco de Chile', {
        originalTransactionId: request.originalTransactionId,
        amount: request.amount,
      });

      const payload = {
        refundId: request.refundTransactionId,
        amount: {
          value: request.amount,
          currency: 'CLP',
        },
        reason: request.reason,
        metadata: request.metadata,
      };

      const response = await this.client.post(
        `/payments/v1/transactions/${request.originalTransactionId}/refunds`,
        payload
      );

      const refundResponse: RefundResponse = {
        refundTransactionId: request.refundTransactionId,
        bankRefundId: response.data.refundId,
        originalTransactionId: request.originalTransactionId,
        status: this.mapPaymentStatus(response.data.status),
        amount: response.data.amount.value,
        currency: response.data.amount.currency,
        timestamp: new Date(response.data.createdAt),
        rawResponse: response.data,
      };

      logger.info('Banco de Chile refund processed successfully', {
        refundTransactionId: refundResponse.refundTransactionId,
        status: refundResponse.status,
      });

      return refundResponse;
    } catch (error) {
      logger.error('Error processing refund with Banco de Chile:', error);
      throw error;
    }
  }

  async getTransaction(query: TransactionQuery): Promise<TransactionResponse> {
    try {
      logger.info('Querying transaction from Banco de Chile', query);

      let endpoint = '/payments/v1/transactions';
      
      if (query.transactionId) {
        endpoint += `?merchantTransactionId=${query.transactionId}`;
      } else if (query.bankTransactionId) {
        endpoint += `/${query.bankTransactionId}`;
      } else {
        throw new AppError('Transaction ID is required', 400);
      }

      const response = await this.client.get(endpoint);

      const transaction = Array.isArray(response.data) ? response.data[0] : response.data;

      if (!transaction) {
        throw AppError.notFound('Transaction');
      }

      const transactionResponse: TransactionResponse = {
        transactionId: transaction.merchantTransactionId,
        bankTransactionId: transaction.transactionId,
        status: this.mapPaymentStatus(transaction.status),
        amount: transaction.amount.value,
        currency: transaction.amount.currency,
        createdAt: new Date(transaction.createdAt),
        updatedAt: new Date(transaction.updatedAt),
        authorizationCode: transaction.authorizationCode,
        paymentMethod: transaction.paymentMethod,
        customerEmail: transaction.customer?.email,
        customerName: transaction.customer?.fullName,
        metadata: transaction.metadata,
        refunds: transaction.refunds?.map((refund: any) => ({
          refundTransactionId: refund.refundId,
          bankRefundId: refund.id,
          originalTransactionId: transaction.transactionId,
          status: this.mapPaymentStatus(refund.status),
          amount: refund.amount.value,
          currency: refund.amount.currency,
          timestamp: new Date(refund.createdAt),
        })),
        rawResponse: transaction,
      };

      return transactionResponse;
    } catch (error) {
      logger.error('Error querying transaction from Banco de Chile:', error);
      throw error;
    }
  }

  async validateBankAccount(account: BankAccountValidation): Promise<boolean> {
    try {
      logger.info('Validating bank account with Banco de Chile', {
        accountNumber: account.accountNumber.substring(0, 4) + '****',
      });

      const payload = {
        accountNumber: account.accountNumber,
        accountType: this.mapAccountType(account.accountType),
        documentNumber: account.rut,
        accountHolderName: account.name,
      };

      const response = await this.client.post('/accounts/v1/validate', payload);

      return response.data.isValid === true;
    } catch (error) {
      logger.error('Error validating bank account with Banco de Chile:', error);
      return false;
    }
  }

  async getPaymentMethods(): Promise<any[]> {
    try {
      logger.info('Fetching payment methods from Banco de Chile');

      const response = await this.client.get('/payments/v1/methods');

      return response.data.methods?.map((method: any) => ({
        code: method.code,
        name: method.name,
        description: method.description,
        enabled: method.enabled,
        logo: method.logoUrl,
      })) || [];
    } catch (error) {
      logger.error('Error fetching payment methods from Banco de Chile:', error);
      return [
        {
          code: 'BANK_TRANSFER',
          name: 'Transferencia Bancaria',
          description: 'Transferencia desde cuenta Banco de Chile',
          enabled: true,
        },
        {
          code: 'WEBPAY',
          name: 'WebPay',
          description: 'Pago con tarjetas de crédito y débito',
          enabled: true,
        },
      ];
    }
  }

  private mapPaymentStatus(bankStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'CREATED': PaymentStatus.PENDING,
      'PENDING': PaymentStatus.PENDING,
      'IN_PROCESS': PaymentStatus.PROCESSING,
      'AUTHORIZED': PaymentStatus.PROCESSING,
      'CONFIRMED': PaymentStatus.COMPLETED,
      'COMPLETED': PaymentStatus.COMPLETED,
      'REJECTED': PaymentStatus.FAILED,
      'FAILED': PaymentStatus.FAILED,
      'CANCELLED': PaymentStatus.CANCELLED,
      'EXPIRED': PaymentStatus.EXPIRED,
      'REFUNDED': PaymentStatus.REFUNDED,
      'PARTIALLY_REFUNDED': PaymentStatus.PARTIALLY_REFUNDED,
    };

    return statusMap[bankStatus] || PaymentStatus.UNKNOWN;
  }

  private mapPaymentMethod(method?: string): string {
    if (!method) return 'BANK_TRANSFER';
    
    const methodMap: Record<string, string> = {
      'CREDIT_CARD': 'CREDIT',
      'DEBIT_CARD': 'DEBIT',
      'BANK_TRANSFER': 'TRANSFER',
      'WEBPAY': 'WEBPAY',
    };

    return methodMap[method] || 'TRANSFER';
  }

  private mapAccountType(type: string): string {
    const typeMap: Record<string, string> = {
      'CHECKING': 'CORRIENTE',
      'SAVINGS': 'AHORRO',
      'CORRIENTE': 'CORRIENTE',
      'VISTA': 'VISTA',
    };

    return typeMap[type] || type;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', {
        timeout: 5000,
      });
      return response.status === 200;
    } catch (error) {
      logger.error('Banco de Chile health check failed:', error);
      return false;
    }
  }
}