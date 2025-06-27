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
  BankAccountValidation,
  PaymentMethod
} from '../types/bank.types';

/**
 * BCI Adapter - Uses Transbank WebPay Plus for payment processing
 * BCI is integrated through Transbank, Chile's main payment processor
 */
export class BCIAdapter implements BankAdapter {
  private client: AxiosInstance;
  private apiKey: string;
  private apiSecret: string;
  private commerceCode: string;

  constructor() {
    const bankConfig = config.banks.bci;
    
    if (!bankConfig.apiKey || !bankConfig.apiSecret || !bankConfig.commerceCode) {
      throw new Error('BCI/Transbank configuration is incomplete');
    }

    this.apiKey = bankConfig.apiKey;
    this.apiSecret = bankConfig.apiSecret;
    this.commerceCode = bankConfig.commerceCode;

    this.client = axios.create({
      baseURL: bankConfig.apiUrl,
      timeout: bankConfig.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Tbk-Api-Key-Id': this.apiKey,
        'Tbk-Api-Key-Secret': this.apiSecret,
      },
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('BCI/Transbank API error:', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
        });

        if (error.response) {
          const { status, data } = error.response;
          
          switch (status) {
            case 401:
              throw new AppError('Authentication failed with Transbank', 401);
            case 422:
              throw new AppError(
                'Invalid transaction data',
                422,
                'VALIDATION_ERROR',
                data
              );
            case 503:
              throw new AppError('Transbank service unavailable', 503);
            default:
              throw new AppError(
                data.error_message || 'Transbank API error',
                status
              );
          }
        }

        throw new AppError('Network error connecting to Transbank', 503);
      }
    );
  }

  async processPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      logger.info('Processing payment with BCI/Transbank', {
        transactionId: request.transactionId,
        amount: request.amount,
        currency: request.currency,
      });

      // Transbank WebPay Plus payload
      const payload = {
        buy_order: request.transactionId,
        session_id: uuidv4(),
        amount: Math.round(request.amount), // Transbank expects integer
        return_url: request.successUrl || request.callbackUrl,
      };

      const response = await this.client.post('/rswebpaytransaction/api/webpay/v1.0/transactions', payload);

      const paymentResponse: PaymentResponse = {
        transactionId: request.transactionId,
        bankTransactionId: response.data.token,
        status: PaymentStatus.PENDING,
        amount: request.amount,
        currency: request.currency,
        redirectUrl: `${response.data.url}?token_ws=${response.data.token}`,
        timestamp: new Date(),
        rawResponse: response.data,
      };

      logger.info('BCI/Transbank payment created successfully', {
        transactionId: paymentResponse.transactionId,
        token: response.data.token,
      });

      return paymentResponse;
    } catch (error) {
      logger.error('Error processing payment with BCI/Transbank:', error);
      throw error;
    }
  }

  async confirmPayment(token: string): Promise<PaymentResponse> {
    try {
      logger.info('Confirming payment with BCI/Transbank', { token });

      // Confirm transaction with Transbank
      const response = await this.client.put(
        `/rswebpaytransaction/api/webpay/v1.0/transactions/${token}`
      );

      const status = this.mapTransbankStatus(response.data.status);
      const isApproved = response.data.response_code === 0;

      const paymentResponse: PaymentResponse = {
        transactionId: response.data.buy_order,
        bankTransactionId: token,
        status: isApproved ? status : PaymentStatus.FAILED,
        amount: response.data.amount,
        currency: 'CLP',
        authorizationCode: response.data.authorization_code,
        timestamp: new Date(response.data.transaction_date),
        errorCode: !isApproved ? response.data.response_code?.toString() : undefined,
        errorMessage: !isApproved ? this.getTransbankErrorMessage(response.data.response_code) : undefined,
        rawResponse: response.data,
      };

      logger.info('BCI/Transbank payment confirmed', {
        transactionId: paymentResponse.transactionId,
        status: paymentResponse.status,
        responseCode: response.data.response_code,
      });

      return paymentResponse;
    } catch (error) {
      logger.error('Error confirming payment with BCI/Transbank:', error);
      throw error;
    }
  }

  async cancelPayment(transactionId: string): Promise<PaymentResponse> {
    // Transbank doesn't support direct cancellation
    // Payments expire automatically if not confirmed
    logger.info('BCI/Transbank payments cannot be cancelled directly', { transactionId });
    
    return {
      transactionId,
      bankTransactionId: '',
      status: PaymentStatus.CANCELLED,
      amount: 0,
      currency: 'CLP',
      timestamp: new Date(),
    };
  }

  async refundPayment(request: RefundRequest): Promise<RefundResponse> {
    try {
      logger.info('Processing refund with BCI/Transbank', {
        originalTransactionId: request.originalTransactionId,
        amount: request.amount,
      });

      const payload = {
        amount: Math.round(request.amount),
      };

      // Transbank refund endpoint uses the token from the original transaction
      const response = await this.client.post(
        `/rswebpaytransaction/api/webpay/v1.0/transactions/${request.originalTransactionId}/refunds`,
        payload
      );

      const refundResponse: RefundResponse = {
        refundTransactionId: request.refundTransactionId,
        bankRefundId: response.data.nullification_id || response.data.id,
        originalTransactionId: request.originalTransactionId,
        status: response.data.response_code === 0 ? PaymentStatus.REFUNDED : PaymentStatus.FAILED,
        amount: response.data.nullified_amount || request.amount,
        currency: 'CLP',
        timestamp: new Date(),
        errorCode: response.data.response_code !== 0 ? response.data.response_code?.toString() : undefined,
        rawResponse: response.data,
      };

      logger.info('BCI/Transbank refund processed', {
        refundTransactionId: refundResponse.refundTransactionId,
        status: refundResponse.status,
      });

      return refundResponse;
    } catch (error) {
      logger.error('Error processing refund with BCI/Transbank:', error);
      throw error;
    }
  }

  async getTransaction(query: TransactionQuery): Promise<TransactionResponse> {
    try {
      logger.info('Querying transaction from BCI/Transbank', query);

      if (!query.bankTransactionId) {
        throw new AppError('Bank transaction ID (token) is required for Transbank', 400);
      }

      const response = await this.client.get(
        `/rswebpaytransaction/api/webpay/v1.0/transactions/${query.bankTransactionId}`
      );

      const transaction = response.data;

      const transactionResponse: TransactionResponse = {
        transactionId: transaction.buy_order,
        bankTransactionId: query.bankTransactionId,
        status: this.mapTransbankStatus(transaction.status),
        amount: transaction.amount,
        currency: 'CLP',
        createdAt: new Date(transaction.transaction_date),
        updatedAt: new Date(transaction.transaction_date),
        authorizationCode: transaction.authorization_code,
        paymentMethod: this.mapPaymentType(transaction.payment_type_code),
        customerEmail: transaction.payer_email,
        metadata: {
          cardNumber: transaction.card_detail?.card_number,
          installments: transaction.installments_number,
          installmentsAmount: transaction.installments_amount,
          responseCode: transaction.response_code,
        },
        rawResponse: transaction,
      };

      return transactionResponse;
    } catch (error) {
      logger.error('Error querying transaction from BCI/Transbank:', error);
      throw error;
    }
  }

  async validateBankAccount(account: BankAccountValidation): Promise<boolean> {
    // Transbank doesn't provide account validation
    // This would need to be implemented through BCI's direct API if available
    logger.warn('Account validation not available through Transbank');
    return false;
  }

  async getPaymentMethods(): Promise<any[]> {
    return [
      {
        code: 'WEBPAY_PLUS',
        name: 'WebPay Plus',
        description: 'Pago con tarjetas de crédito y débito',
        supported_cards: ['Visa', 'MasterCard', 'American Express', 'Diners'],
      },
      {
        code: 'WEBPAY_ONECLICK',
        name: 'OneClick',
        description: 'Pago con un click (requiere inscripción previa)',
      },
    ];
  }

  private mapTransbankStatus(status: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'INITIALIZED': PaymentStatus.PENDING,
      'AUTHORIZED': PaymentStatus.PROCESSING,
      'CAPTURED': PaymentStatus.COMPLETED,
      'FAILED': PaymentStatus.FAILED,
      'NULLIFIED': PaymentStatus.REFUNDED,
      'PARTIALLY_NULLIFIED': PaymentStatus.PARTIALLY_REFUNDED,
    };

    return statusMap[status] || PaymentStatus.UNKNOWN;
  }

  private mapPaymentType(typeCode?: string): string {
    const typeMap: Record<string, string> = {
      'VD': 'DEBIT_CARD',
      'VN': 'CREDIT_CARD',
      'VC': 'CREDIT_CARD',
      'SI': 'INSTALLMENTS',
      'S2': 'INSTALLMENTS_NO_INTEREST',
      'NC': 'INSTALLMENTS',
      'VP': 'PREPAID_CARD',
    };

    return typeMap[typeCode || ''] || 'UNKNOWN';
  }

  private getTransbankErrorMessage(responseCode: number): string {
    const errorMessages: Record<number, string> = {
      '-1': 'Rechazo de transacción',
      '-2': 'Transacción debe reintentarse',
      '-3': 'Error en transacción',
      '-4': 'Rechazo de transacción',
      '-5': 'Rechazo por error de tasa',
      '-6': 'Excede cupo máximo mensual',
      '-7': 'Excede límite diario por transacción',
      '-8': 'Rubro no autorizado',
    };

    return errorMessages[responseCode] || 'Error en la transacción';
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Transbank doesn't have a specific health endpoint
      // We can try to get the commerce info
      const response = await this.client.get('/rswebpaytransaction/api/webpay/v1.0/commerces', {
        timeout: 5000,
      });
      return response.status === 200;
    } catch (error) {
      logger.error('BCI/Transbank health check failed:', error);
      return false;
    }
  }
}