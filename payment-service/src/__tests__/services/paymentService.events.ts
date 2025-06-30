import { PaymentService } from './paymentService';
import { paymentEventBus } from '../events/paymentEventBus';
import { Payment } from '../models/Payment';
import logger from '../utils/logger';

/**
 * Extensión del PaymentService para integrar eventos de dominio
 * Extiende la funcionalidad base agregando publicación de eventos
 */
export class PaymentServiceWithEvents extends PaymentService {
  constructor(redis: any) {
    super(redis);
    this.setupEventHandlers();
  }

  /**
   * Override processPayment para agregar eventos
   */
  async processPayment(request: any, provider: string): Promise<any> {
    const startTime = Date.now();

    try {
      // Publicar evento de inicio
      await paymentEventBus.publishPaymentEvent('payment.initiated', {
        amount: request.amount,
        currency: request.currency,
        provider,
        communityId: request.metadata?.communityId,
        userId: request.customer?.userId || request.customer?.id,
        paymentType: request.metadata?.paymentType || 'one_time'
      });

      // Procesar pago con servicio base
      const result = await super.processPayment(request, provider);

      // Publicar evento según resultado
      if (result.success) {
        await paymentEventBus.publishPaymentEvent('payment.completed', {
          transactionId: result.transactionId,
          amount: result.amount,
          currency: result.currency,
          provider,
          communityId: request.metadata?.communityId,
          userId: request.customer?.userId || request.customer?.id,
          processedAt: result.processedAt,
          fees: result.fees,
          processingTime: Date.now() - startTime
        });

        // Si es el primer pago del usuario, publicar evento especial
        if (await this.isFirstPayment(request.customer?.userId)) {
          await paymentEventBus.publishPaymentEvent('payment.first_completed', {
            userId: request.customer?.userId,
            communityId: request.metadata?.communityId,
            amount: result.amount
          });
        }
      } else {
        await paymentEventBus.publishPaymentEvent('payment.failed', {
          amount: request.amount,
          currency: request.currency,
          provider,
          communityId: request.metadata?.communityId,
          userId: request.customer?.userId || request.customer?.id,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
          processingTime: Date.now() - startTime
        });
      }

      return result;
    } catch (error: any) {
      // Publicar evento de error crítico
      await paymentEventBus.publishPaymentEvent('payment.error', {
        provider,
        error: error.message,
        stack: error.stack,
        request: {
          amount: request.amount,
          currency: request.currency
        }
      });

      throw error;
    }
  }

  /**
   * Override refundPayment para agregar eventos
   */
  async refundPayment(request: any): Promise<any> {
    try {
      // Publicar evento de inicio de reembolso
      await paymentEventBus.publishPaymentEvent('refund.initiated', {
        transactionId: request.transactionId,
        amount: request.amount,
        reason: request.reason,
        requestedBy: request.requestedBy
      });

      // Procesar reembolso
      const result = await super.refundPayment(request);

      if (result.success) {
        // Obtener información del pago original
        const originalPayment = await Payment.findOne({
          where: { gateway_transaction_id: request.transactionId }
        });

        await paymentEventBus.publishPaymentEvent('refund.processed', {
          refundId: result.transactionId,
          originalTransactionId: request.transactionId,
          amount: result.amount,
          currency: result.currency,
          userId: originalPayment?.user_id,
          communityId: originalPayment?.community_id,
          processedAt: result.processedAt,
          reason: request.reason
        });

        // Si es reembolso total, publicar evento adicional
        if (!request.amount || request.amount === originalPayment?.amount) {
          await paymentEventBus.publishPaymentEvent('refund.full_processed', {
            transactionId: request.transactionId,
            userId: originalPayment?.user_id,
            communityId: originalPayment?.community_id
          });
        }
      } else {
        await paymentEventBus.publishPaymentEvent('refund.failed', {
          transactionId: request.transactionId,
          amount: request.amount,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage
        });
      }

      return result;
    } catch (error: any) {
      await paymentEventBus.publishPaymentEvent('refund.error', {
        transactionId: request.transactionId,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Override handleWebhook para agregar eventos
   */
  async handleWebhook(provider: string, payload: any, headers: any): Promise<void> {
    try {
      // Publicar evento de webhook recibido
      await paymentEventBus.publishPaymentEvent('webhook.received', {
        provider,
        eventType: payload.type || payload.event,
        webhookId: payload.id
      });

      // Procesar webhook
      await super.handleWebhook(provider, payload, headers);

      // Publicar evento de webhook procesado
      await paymentEventBus.publishPaymentEvent('webhook.processed', {
        provider,
        eventType: payload.type || payload.event,
        webhookId: payload.id
      });

      // Manejar eventos específicos del webhook
      await this.handleWebhookEvents(provider, payload);
    } catch (error: any) {
      await paymentEventBus.publishPaymentEvent('webhook.error', {
        provider,
        error: error.message,
        payload
      });

      throw error;
    }
  }

  /**
   * Configurar handlers de eventos internos
   */
  private setupEventHandlers(): void {
    // Listener para cambios de estado de pago
    this.on('payment:status:changed', async (data) => {
      await paymentEventBus.publishPaymentEvent('payment.status_changed', {
        transactionId: data.transactionId,
        oldStatus: data.oldStatus,
        newStatus: data.newStatus,
        updatedAt: new Date()
      });
    });

    // Listener para métricas
    this.on('payment:metrics:update', async (data) => {
      await paymentEventBus.publishPaymentEvent('metrics.payment_update', data);
    });
  }

  /**
   * Manejar eventos específicos de webhooks
   */
  private async handleWebhookEvents(provider: string, payload: any): Promise<void> {
    switch (provider) {
      case 'stripe':
        await this.handleStripeWebhookEvents(payload);
        break;
        
      case 'paypal':
        await this.handlePayPalWebhookEvents(payload);
        break;
        
      case 'banco_estado':
      case 'santander':
      case 'bci':
      case 'banco_chile':
        await this.handleBankWebhookEvents(provider, payload);
        break;
    }
  }

  /**
   * Manejar eventos de webhook de Stripe
   */
  private async handleStripeWebhookEvents(payload: any): Promise<void> {
    const eventMap: { [key: string]: string } = {
      'payment_intent.succeeded': 'payment.stripe_completed',
      'payment_intent.payment_failed': 'payment.stripe_failed',
      'charge.dispute.created': 'payment.dispute_created',
      'customer.subscription.created': 'subscription.stripe_created',
      'customer.subscription.deleted': 'subscription.stripe_cancelled',
      'invoice.payment_succeeded': 'invoice.stripe_paid',
      'invoice.payment_failed': 'invoice.stripe_failed'
    };

    const eventType = eventMap[payload.type];
    if (eventType) {
      await paymentEventBus.publishPaymentEvent(eventType, {
        stripeEventId: payload.id,
        objectId: payload.data.object.id,
        amount: payload.data.object.amount,
        customerId: payload.data.object.customer,
        metadata: payload.data.object.metadata
      });
    }
  }

  /**
   * Manejar eventos de webhook de PayPal
   */
  private async handlePayPalWebhookEvents(payload: any): Promise<void> {
    const eventMap: { [key: string]: string } = {
      'PAYMENT.CAPTURE.COMPLETED': 'payment.paypal_completed',
      'PAYMENT.CAPTURE.DENIED': 'payment.paypal_denied',
      'PAYMENT.CAPTURE.REFUNDED': 'refund.paypal_completed',
      'BILLING.SUBSCRIPTION.CREATED': 'subscription.paypal_created',
      'BILLING.SUBSCRIPTION.CANCELLED': 'subscription.paypal_cancelled'
    };

    const eventType = eventMap[payload.event_type];
    if (eventType) {
      await paymentEventBus.publishPaymentEvent(eventType, {
        paypalEventId: payload.id,
        resourceId: payload.resource.id,
        amount: payload.resource.amount?.value,
        currency: payload.resource.amount?.currency_code
      });
    }
  }

  /**
   * Manejar eventos de webhook bancarios
   */
  private async handleBankWebhookEvents(bank: string, payload: any): Promise<void> {
    const eventType = payload.event || payload.type;

    switch (eventType) {
      case 'transfer.completed':
      case 'payment.completed':
        await paymentEventBus.publishPaymentEvent('payment.bank_completed', {
          bank,
          transactionId: payload.transactionId || payload.transaction_id,
          amount: payload.amount,
          accountNumber: payload.accountNumber
        });
        break;

      case 'transfer.failed':
      case 'payment.failed':
        await paymentEventBus.publishPaymentEvent('payment.bank_failed', {
          bank,
          transactionId: payload.transactionId || payload.transaction_id,
          amount: payload.amount,
          reason: payload.reason || payload.error
        });
        break;

      case 'transfer.reversed':
        await paymentEventBus.publishPaymentEvent('payment.bank_reversed', {
          bank,
          transactionId: payload.transactionId || payload.transaction_id,
          originalTransactionId: payload.originalTransactionId,
          amount: payload.amount,
          reason: payload.reversalReason
        });
        break;
    }
  }

  /**
   * Verificar si es el primer pago del usuario
   */
  private async isFirstPayment(userId?: string): Promise<boolean> {
    if (!userId) return false;

    const paymentCount = await Payment.count({
      where: {
        user_id: userId,
        status: 'completed'
      }
    });

    return paymentCount === 1; // El pago actual ya está guardado
  }

  /**
   * Publicar métricas de pago
   */
  async publishPaymentMetrics(communityId?: string): Promise<void> {
    try {
      const metrics = await this.getPaymentMetrics(communityId);

      await paymentEventBus.publishPaymentEvent('metrics.payment_summary', {
        communityId,
        metrics,
        timestamp: new Date()
      });

      // Publicar métricas individuales para Prometheus
      for (const [status, count] of Object.entries(metrics.paymentsByStatus)) {
        await paymentEventBus.publishPaymentEvent('metrics.payment_count', {
          status,
          count,
          communityId
        });
      }

      // Publicar métricas de revenue
      await paymentEventBus.publishPaymentEvent('metrics.revenue', {
        total: metrics.totalAmount,
        average: metrics.averageAmount,
        communityId,
        period: 'all_time'
      });
    } catch (error: any) {
      logger.error('[PaymentServiceWithEvents] Error publicando métricas', {
        error: error.message,
        communityId
      });
    }
  }

  /**
   * Sincronizar estado con sistema principal
   */
  async syncWithMainSystem(paymentId: string): Promise<void> {
    try {
      const payment = await Payment.findByPk(paymentId);
      
      if (!payment) {
        throw new Error('Pago no encontrado');
      }

      await paymentEventBus.publishPaymentEvent('sync.payment_status', {
        paymentId: payment.id,
        transactionId: payment.gateway_transaction_id,
        status: payment.status,
        amount: payment.amount,
        communityId: payment.community_id,
        userId: payment.user_id,
        metadata: payment.metadata
      });

      logger.info('[PaymentServiceWithEvents] Sincronización iniciada', {
        paymentId
      });
    } catch (error: any) {
      logger.error('[PaymentServiceWithEvents] Error sincronizando', {
        error: error.message,
        paymentId
      });
      throw error;
    }
  }
}

// Factory function para crear instancia con eventos
export function createPaymentServiceWithEvents(redis: any): PaymentServiceWithEvents {
  return new PaymentServiceWithEvents(redis);
}