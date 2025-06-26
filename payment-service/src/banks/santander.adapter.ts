import axios, { AxiosInstance } from 'axios';
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
  BankAccountValidation,
  PaymentError
} from '../types/bank.types';

interface SantanderAuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export class SantanderAdapter implements BankAdapter {
  private client: AxiosInstance;
  private authToken: SantanderAuthToken | null = null;
  private tokenExpiresAt: Date | null = null;
  private clientId: string;
  private clientSecret: string;

  constructor() {
    const bankConfig = config.banks.santander;
    
    if (!bankConfig.clientId || !bankConfig.clientSecret) {
      throw new Error('Santander configuration is incomplete');
    }

    this.clientId = bankConfig.clientId;
    this.clientSecret = bankConfig.clientSecret;

    this.client = axios.create({
      baseURL: bankConfig.apiUrl,
      timeout: bankConfig.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Add request interceptor for OAuth2 authentication
    this.client.interceptors.request.use(
      async (request) => {
        // Skip auth for token endpoint
        if (request.url?.includes('/oauth/token')) {
          return request;
        }

        // Get or refresh token
        const token = await this.getAccessToken();
        request.headers['Authorization'] = `Bearer ${token}`;
        request.headers['X-Request-ID'] = uuidv4();
        
        return request;
      },
      (error) => {
        logger.error('Santander request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        logger.error('Santander API error:', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
        });

        // Handle token expiration
        if (error.response?.status === 401 && !error.config._retry) {
          error.config._retry = true;
          this.authToken = null;
          const token = await this.getAccessToken();
          error.config.headers['Authorization'] = `Bearer ${token}`;
          return this.client(error.config);
        }

        if (error.response) {
          const { status, data } = error.response;
          
          switch (status) {
            case 400:
              throw new PaymentError(
                data.error_description || 'Invalid request to Santander',
                data.error || 'INVALID_REQUEST',
                400,
                data
              );
            case 403:
              throw new AppError('Access forbidden to Santander resource', 403);
            case 429:
              throw new AppError('Rate limit exceeded for Santander', 429);
            case 503:
              throw new AppError('Santander service temporarily unavailable', 503);
            default:
              throw new AppError(
                data.error_description || 'Santander API error',
                status,
                data.error
              );
          }
        }

        throw new AppError('Network error connecting to Santander', 503);
      }
    );
  }

  private async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (this.authToken && this.tokenExpiresAt && new Date() < this.tokenExpiresAt) {
      return this.authToken.access_token;
    }

    try {
      logger.info('Requesting new access token from Santander');

      const response = await this.client.post('/oauth/token', 
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          scope: 'payments accounts transfers',
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      this.authToken = response.data;
      // Set expiration time with 5 minute buffer
      this.tokenExpiresAt = new Date(
        Date.now() + (this.authToken.expires_in - 300) * 1000
      );

      logger.info('Successfully obtained Santander access token');
      return this.authToken.access_token;
    } catch (error) {
      logger.error('Failed to obtain Santander access token:', error);
      throw new AppError('Failed to authenticate with Santander', 401);
    }
  }

  async processPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      logger.info('Processing payment with Santander', {
        transactionId: request.transactionId,
        amount: request.amount,
        currency: request.currency,
      });

      const payload = {
        paymentId: request.transactionId,
        amount: {
          value: request.amount,
          currency: request.currency,
        },
        description: request.description,
        customer: {
          email: request.customerEmail,
          name: request.customerName,
          documentNumber: request.customerRut,
          phone: request.customerPhone,
        },
        returnUrl: request.successUrl || request.callbackUrl,
        cancelUrl: request.failureUrl || request.callbackUrl,
        notificationUrl: request.callbackUrl,
        paymentMethod: this.mapPaymentMethod(request.paymentMethod),
        installments: request.installments || 1,
        metadata: request.metadata,
      };

      const response = await this.client.post('/payments/v1/orders', payload);

      const paymentResponse: PaymentResponse = {
        transactionId: request.transactionId,
        bankTransactionId: response.data.orderId,
        status: this.mapPaymentStatus(response.data.status),
        amount: response.data.amount.value,
        currency: response.data.amount.currency,
        redirectUrl: response.data.checkoutUrl,
        timestamp: new Date(response.data.createdAt),
        rawResponse: response.data,
      };

      logger.info('Santander payment processed successfully', {
        transactionId: paymentResponse.transactionId,
        bankTransactionId: paymentResponse.bankTransactionId,
        status: paymentResponse.status,
      });

      return paymentResponse;
    } catch (error) {
      logger.error('Error processing payment with Santander:', error);
      throw error;
    }
  }

  async confirmPayment(transactionId: string): Promise<PaymentResponse> {
    try {
      logger.info('Confirming payment with Santander', { transactionId });

      const response = await this.client.put(
        `/payments/v1/orders/${transactionId}/capture`
      );

      const paymentResponse: PaymentResponse = {
        transactionId: transactionId,
        bankTransactionId: response.data.orderId,
        status: this.mapPaymentStatus(response.data.status),
        amount: response.data.amount.value,
        currency: response.data.amount.currency,
        authorizationCode: response.data.authorizationCode,
        timestamp: new Date(response.data.updatedAt),
        rawResponse: response.data,
      };

      logger.info('Santander payment confirmed', {
        transactionId: paymentResponse.transactionId,
        status: paymentResponse.status,
      });

      return paymentResponse;
    } catch (error) {
      logger.error('Error confirming payment with Santander:', error);
      throw error;
    }
  }

  async cancelPayment(transactionId: string): Promise<PaymentResponse> {
    try {
      logger.info('Canceling payment with Santander', { transactionId });

      const response = await this.client.delete(
        `/payments/v1/orders/${transactionId}`
      );

      const paymentResponse: PaymentResponse = {
        transactionId: transactionId,
        bankTransactionId: response.data.orderId,
        status: PaymentStatus.CANCELLED,
        amount: response.data.amount.value,
        currency: response.data.amount.currency,
        timestamp: new Date(response.data.updatedAt),
        rawResponse: response.data,
      };

      logger.info('Santander payment cancelled', {
        transactionId: paymentResponse.transactionId,
      });

      return paymentResponse;
    } catch (error) {
      logger.error('Error canceling payment with Santander:', error);
      throw error;
    }
  }

  async refundPayment(request: RefundRequest): Promise<RefundResponse> {
    try {
      logger.info('Processing refund with Santander', {
        originalTransactionId: request.originalTransactionId,
        amount: request.amount,
      });

      const payload = {
        refundId: request.refundTransactionId,
        amount: {
          value: request.amount,
          currency: 'CLP', // Default to CLP for Chilean operations
        },
        description: request.reason,
        metadata: request.metadata,
      };

      const response = await this.client.post(
        `/payments/v1/orders/${request.originalTransactionId}/refunds`,
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

      logger.info('Santander refund processed successfully', {
        refundTransactionId: refundResponse.refundTransactionId,
        status: refundResponse.status,
      });

      return refundResponse;
    } catch (error) {
      logger.error('Error processing refund with Santander:', error);
      throw error;
    }
  }

  async getTransaction(query: TransactionQuery): Promise<TransactionResponse> {
    try {
      logger.info('Querying transaction from Santander', query);

      let endpoint = '/payments/v1/orders';
      if (query.transactionId) {
        endpoint += `/${query.transactionId}`;
      } else if (query.bankTransactionId) {
        endpoint += `/${query.bankTransactionId}`;
      } else {
        throw new AppError('Transaction ID is required', 400);
      }

      const response = await this.client.get(endpoint);

      const transactionResponse: TransactionResponse = {
        transactionId: response.data.paymentId || response.data.orderId,
        bankTransactionId: response.data.orderId,
        status: this.mapPaymentStatus(response.data.status),
        amount: response.data.amount.value,
        currency: response.data.amount.currency,
        createdAt: new Date(response.data.createdAt),
        updatedAt: new Date(response.data.updatedAt),
        authorizationCode: response.data.authorizationCode,
        paymentMethod: response.data.paymentMethod,
        customerEmail: response.data.customer?.email,
        customerName: response.data.customer?.name,
        metadata: response.data.metadata,
        refunds: response.data.refunds?.map((refund: any) => ({
          refundTransactionId: refund.refundId,
          bankRefundId: refund.id,
          originalTransactionId: response.data.orderId,
          status: this.mapPaymentStatus(refund.status),
          amount: refund.amount.value,
          currency: refund.amount.currency,
          timestamp: new Date(refund.createdAt),
        })),
        rawResponse: response.data,
      };

      return transactionResponse;
    } catch (error) {
      logger.error('Error querying transaction from Santander:', error);
      throw error;
    }
  }

  async validateBankAccount(account: BankAccountValidation): Promise<boolean> {
    try {
      logger.info('Validating bank account with Santander', {
        accountNumber: account.accountNumber.substring(0, 4) + '****',
      });

      const payload = {
        accountNumber: account.accountNumber,
        accountType: this.mapAccountType(account.accountType),
        documentNumber: account.rut,
        accountHolderName: account.name,
      };

      const response = await this.client.post('/accounts/v1/validate', payload);

      return response.data.valid === true;
    } catch (error) {
      logger.error('Error validating bank account with Santander:', error);
      return false;
    }
  }

  async getPaymentMethods(): Promise<any[]> {
    try {
      logger.info('Fetching payment methods from Santander');

      const response = await this.client.get('/payments/v1/methods');

      return response.data.paymentMethods || [];
    } catch (error) {
      logger.error('Error fetching payment methods from Santander:', error);
      throw error;
    }
  }

  private mapPaymentStatus(santanderStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'CREATED': PaymentStatus.PENDING,
      'PENDING': PaymentStatus.PENDING,
      'PROCESSING': PaymentStatus.PROCESSING,
      'AUTHORIZED': PaymentStatus.PROCESSING,
      'CAPTURED': PaymentStatus.COMPLETED,
      'COMPLETED': PaymentStatus.COMPLETED,
      'FAILED': PaymentStatus.FAILED,
      'REJECTED': PaymentStatus.FAILED,
      'CANCELLED': PaymentStatus.CANCELLED,
      'VOIDED': PaymentStatus.CANCELLED,
      'EXPIRED': PaymentStatus.EXPIRED,
      'REFUNDED': PaymentStatus.REFUNDED,
      'PARTIALLY_REFUNDED': PaymentStatus.PARTIALLY_REFUNDED,
    };

    return statusMap[santanderStatus] || PaymentStatus.UNKNOWN;
  }

  private mapPaymentMethod(method?: string): string {
    if (!method) return 'CARD';
    
    const methodMap: Record<string, string> = {
      'CREDIT_CARD': 'CREDIT',
      'DEBIT_CARD': 'DEBIT',
      'BANK_TRANSFER': 'TRANSFER',
      'WEBPAY': 'WEBPAY_PLUS',
    };

    return methodMap[method] || 'CARD';
  }

  private mapAccountType(type: string): string {
    const typeMap: Record<string, string> = {
      'CHECKING': 'CURRENT',
      'SAVINGS': 'SAVINGS',
      'CORRIENTE': 'CURRENT',
      'VISTA': 'SIGHT',
    };

    return typeMap[type] || type;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const token = await this.getAccessToken();
      return !!token;
    } catch (error) {
      logger.error('Santander health check failed:', error);
      return false;
    }
  }
}