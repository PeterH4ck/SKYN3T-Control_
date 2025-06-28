import { BankAdapter, BankPaymentResult, BankTransferRequest, BankAccountInfo } from '../types/bank.types';
import { AppError } from '../utils/AppError';
import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import logger from '../utils/logger';

/**
 * Adaptador para Scotiabank Chile
 * Implementa la integración con la API corporativa de Scotiabank
 */
export class ScotiabankAdapter implements BankAdapter {
  private apiClient: AxiosInstance;
  private clientId: string;
  private clientSecret: string;
  private apiKey: string;
  private environment: 'sandbox' | 'production';
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor() {
    this.clientId = process.env.SCOTIABANK_CLIENT_ID || '';
    this.clientSecret = process.env.SCOTIABANK_CLIENT_SECRET || '';
    this.apiKey = process.env.SCOTIABANK_API_KEY || '';
    this.environment = (process.env.SCOTIABANK_ENV as 'sandbox' | 'production') || 'sandbox';

    const baseURL = this.environment === 'production'
      ? 'https://api.scotiabank.cl/v1'
      : 'https://sandbox.api.scotiabank.cl/v1';

    this.apiClient = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // Request interceptor para agregar token
    this.apiClient.interceptors.request.use(
      async (config) => {
        if (!this.isTokenValid()) {
          await this.authenticate();
        }
        if (this.accessToken) {
          config.headers.Authorization = `Bearer ${this.accessToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor para manejar errores
    this.apiClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // Token expirado, reautenticar
          this.accessToken = null;
          this.tokenExpiry = null;
          
          const originalRequest = error.config;
          await this.authenticate();
          
          if (this.accessToken) {
            originalRequest.headers.Authorization = `Bearer ${this.accessToken}`;
            return this.apiClient(originalRequest);
          }
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Autenticación OAuth2 con Scotiabank
   */
  private async authenticate(): Promise<void> {
    try {
      const authData = {
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: 'payments accounts transfers'
      };

      const response = await axios.post(
        `${this.apiClient.defaults.baseURL}/oauth/token`,
        new URLSearchParams(authData).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-API-Key': this.apiKey
          }
        }
      );

      this.accessToken = response.data.access_token;
      const expiresIn = response.data.expires_in || 3600;
      this.tokenExpiry = new Date(Date.now() + (expiresIn * 1000) - 60000); // 1 min antes

      logger.info('[Scotiabank] Autenticación exitosa', {
        environment: this.environment,
        expiresIn
      });
    } catch (error: any) {
      logger.error('[Scotiabank] Error en autenticación', {
        error: error.message,
        response: error.response?.data
      });
      throw new AppError('Error al autenticar con Scotiabank', 500);
    }
  }

  /**
   * Verifica si el token actual es válido
   */
  private isTokenValid(): boolean {
    return !!(this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date());
  }

  /**
   * Procesar pago a través de Scotiabank
   */
  async processPayment(request: BankTransferRequest): Promise<BankPaymentResult> {
    try {
      logger.info('[Scotiabank] Procesando pago', {
        amount: request.amount,
        reference: request.reference
      });

      // Validar cuenta origen
      const accountInfo = await this.getAccountInfo(request.sourceAccount);
      if (!accountInfo || accountInfo.balance < request.amount) {
        throw new AppError('Fondos insuficientes o cuenta inválida', 400);
      }

      // Generar idempotency key
      const idempotencyKey = this.generateIdempotencyKey(request);

      // Crear transferencia
      const transferData = {
        source_account: request.sourceAccount,
        destination_account: request.destinationAccount,
        destination_bank: request.destinationBank || 'SCOTIABANK',
        destination_rut: request.destinationRut,
        destination_name: request.destinationName,
        amount: request.amount,
        currency: request.currency || 'CLP',
        reference: request.reference,
        description: request.description || 'Pago gastos comunes SKYN3T',
        transfer_type: 'TEF', // Transferencia Electrónica de Fondos
        notification_email: request.notificationEmail,
        metadata: {
          system: 'SKYN3T',
          module: 'payment-service',
          user_id: request.userId,
          community_id: request.communityId
        }
      };

      const response = await this.apiClient.post('/transfers', transferData, {
        headers: {
          'X-Idempotency-Key': idempotencyKey,
          'X-Request-ID': crypto.randomUUID()
        }
      });

      const result: BankPaymentResult = {
        success: true,
        transactionId: response.data.transaction_id,
        bankReference: response.data.bank_reference,
        status: this.mapTransferStatus(response.data.status),
        amount: response.data.amount,
        currency: response.data.currency,
        processedAt: new Date(response.data.processed_at),
        fees: response.data.fees || 0,
        exchangeRate: response.data.exchange_rate,
        rawResponse: response.data
      };

      logger.info('[Scotiabank] Pago procesado exitosamente', {
        transactionId: result.transactionId,
        status: result.status
      });

      return result;
    } catch (error: any) {
      logger.error('[Scotiabank] Error procesando pago', {
        error: error.message,
        response: error.response?.data
      });

      if (error.response?.status === 400) {
        throw new AppError(
          error.response.data.message || 'Datos de pago inválidos',
          400
        );
      }

      if (error.response?.status === 402) {
        throw new AppError('Fondos insuficientes', 402);
      }

      throw new AppError('Error procesando pago con Scotiabank', 500);
    }
  }

  /**
   * Verificar estado de una transacción
   */
  async getPaymentStatus(transactionId: string): Promise<BankPaymentResult> {
    try {
      const response = await this.apiClient.get(`/transfers/${transactionId}`);

      return {
        success: response.data.status !== 'failed',
        transactionId: response.data.transaction_id,
        bankReference: response.data.bank_reference,
        status: this.mapTransferStatus(response.data.status),
        amount: response.data.amount,
        currency: response.data.currency,
        processedAt: new Date(response.data.processed_at),
        fees: response.data.fees || 0,
        exchangeRate: response.data.exchange_rate,
        errorCode: response.data.error_code,
        errorMessage: response.data.error_message,
        rawResponse: response.data
      };
    } catch (error: any) {
      logger.error('[Scotiabank] Error obteniendo estado de pago', {
        transactionId,
        error: error.message
      });

      if (error.response?.status === 404) {
        throw new AppError('Transacción no encontrada', 404);
      }

      throw new AppError('Error obteniendo estado de pago', 500);
    }
  }

  /**
   * Obtener información de una cuenta
   */
  async getAccountInfo(accountNumber: string): Promise<BankAccountInfo | null> {
    try {
      const response = await this.apiClient.get(`/accounts/${accountNumber}`);

      return {
        accountNumber: response.data.account_number,
        accountType: response.data.account_type,
        balance: response.data.balance,
        availableBalance: response.data.available_balance,
        currency: response.data.currency,
        status: response.data.status,
        ownerName: response.data.owner_name,
        ownerRut: response.data.owner_rut,
        bankCode: 'SCOTIABANK',
        createdAt: new Date(response.data.created_at),
        lastTransaction: response.data.last_transaction_date 
          ? new Date(response.data.last_transaction_date) 
          : undefined
      };
    } catch (error: any) {
      logger.error('[Scotiabank] Error obteniendo información de cuenta', {
        accountNumber,
        error: error.message
      });

      if (error.response?.status === 404) {
        return null;
      }

      throw new AppError('Error obteniendo información de cuenta', 500);
    }
  }

  /**
   * Validar si el adaptador está configurado correctamente
   */
  async validateConfiguration(): Promise<boolean> {
    try {
      if (!this.clientId || !this.clientSecret || !this.apiKey) {
        logger.error('[Scotiabank] Configuración incompleta');
        return false;
      }

      // Intentar autenticar para validar credenciales
      await this.authenticate();
      
      // Hacer una llamada de prueba
      const response = await this.apiClient.get('/health');
      
      return response.status === 200;
    } catch (error: any) {
      logger.error('[Scotiabank] Error validando configuración', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Manejar webhook de Scotiabank
   */
  async handleWebhook(payload: any, headers: any): Promise<void> {
    try {
      // Verificar firma del webhook
      const signature = headers['x-scotiabank-signature'];
      if (!this.verifyWebhookSignature(payload, signature)) {
        throw new AppError('Firma de webhook inválida', 401);
      }

      const event = payload;
      
      logger.info('[Scotiabank] Webhook recibido', {
        eventType: event.type,
        transactionId: event.data?.transaction_id
      });

      // Procesar según tipo de evento
      switch (event.type) {
        case 'transfer.completed':
          await this.handleTransferCompleted(event.data);
          break;
          
        case 'transfer.failed':
          await this.handleTransferFailed(event.data);
          break;
          
        case 'transfer.reversed':
          await this.handleTransferReversed(event.data);
          break;
          
        case 'account.blocked':
          await this.handleAccountBlocked(event.data);
          break;
          
        default:
          logger.warn('[Scotiabank] Tipo de evento no manejado', {
            eventType: event.type
          });
      }
    } catch (error: any) {
      logger.error('[Scotiabank] Error procesando webhook', {
        error: error.message,
        payload
      });
      throw error;
    }
  }

  /**
   * Verificar firma del webhook
   */
  private verifyWebhookSignature(payload: any, signature: string): boolean {
    const webhookSecret = process.env.SCOTIABANK_WEBHOOK_SECRET || '';
    const computedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(computedSignature)
    );
  }

  /**
   * Generar clave de idempotencia
   */
  private generateIdempotencyKey(request: BankTransferRequest): string {
    const data = `${request.sourceAccount}-${request.destinationAccount}-${request.amount}-${request.reference}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Mapear estado de transferencia
   */
  private mapTransferStatus(bankStatus: string): string {
    const statusMap: { [key: string]: string } = {
      'pending': 'processing',
      'in_progress': 'processing',
      'completed': 'completed',
      'failed': 'failed',
      'rejected': 'failed',
      'reversed': 'reversed',
      'cancelled': 'cancelled'
    };

    return statusMap[bankStatus.toLowerCase()] || 'unknown';
  }

  /**
   * Manejar transferencia completada
   */
  private async handleTransferCompleted(data: any): Promise<void> {
    logger.info('[Scotiabank] Transferencia completada', {
      transactionId: data.transaction_id,
      amount: data.amount
    });
    // Aquí se integraría con el sistema principal para actualizar el estado
  }

  /**
   * Manejar transferencia fallida
   */
  private async handleTransferFailed(data: any): Promise<void> {
    logger.error('[Scotiabank] Transferencia fallida', {
      transactionId: data.transaction_id,
      reason: data.failure_reason
    });
    // Aquí se integraría con el sistema principal para manejar el fallo
  }

  /**
   * Manejar transferencia revertida
   */
  private async handleTransferReversed(data: any): Promise<void> {
    logger.warn('[Scotiabank] Transferencia revertida', {
      transactionId: data.transaction_id,
      reason: data.reversal_reason
    });
    // Aquí se integraría con el sistema principal para manejar la reversión
  }

  /**
   * Manejar cuenta bloqueada
   */
  private async handleAccountBlocked(data: any): Promise<void> {
    logger.error('[Scotiabank] Cuenta bloqueada', {
      accountNumber: data.account_number,
      reason: data.block_reason
    });
    // Aquí se integraría con el sistema principal para notificar el bloqueo
  }
}