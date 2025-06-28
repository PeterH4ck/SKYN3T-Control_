import Stripe from 'stripe';
import { 
  PaymentGateway, 
  PaymentRequest, 
  PaymentResult, 
  RefundRequest,
  PaymentMethod,
  CustomerData,
  SubscriptionData 
} from '../types/gateway.types';
import { AppError } from '../utils/AppError';
import logger from '../utils/logger';

/**
 * Gateway para Stripe - Pagos con tarjeta de crédito/débito
 * Soporta pagos únicos, suscripciones y pagos recurrentes
 */
export class StripeGateway implements PaymentGateway {
  private stripe: Stripe;
  private webhookSecret: string;
  private currency: string;

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY || '';
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    this.currency = process.env.DEFAULT_CURRENCY || 'clp';

    if (!secretKey) {
      throw new Error('Stripe secret key no configurada');
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2023-10-16',
      typescript: true,
      maxNetworkRetries: 3,
      timeout: 30000
    });

    logger.info('[Stripe] Gateway inicializado', {
      currency: this.currency,
      environment: secretKey.startsWith('sk_test') ? 'test' : 'live'
    });
  }

  /**
   * Procesar pago único con Stripe
   */
  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    try {
      logger.info('[Stripe] Procesando pago', {
        amount: request.amount,
        currency: request.currency || this.currency,
        reference: request.reference
      });

      // Crear o recuperar cliente
      const customer = await this.getOrCreateCustomer(request.customer);

      // Crear PaymentIntent
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(request.amount), // Stripe maneja montos en centavos
        currency: request.currency || this.currency,
        customer: customer.id,
        payment_method: request.paymentMethodId,
        confirm: true,
        return_url: request.returnUrl || `${process.env.FRONTEND_URL}/payments/complete`,
        metadata: {
          reference: request.reference,
          community_id: request.metadata?.communityId || '',
          user_id: request.metadata?.userId || '',
          payment_type: request.metadata?.paymentType || 'one_time',
          system: 'SKYN3T'
        },
        description: request.description || 'Pago gastos comunes SKYN3T',
        statement_descriptor: 'SKYN3T',
        receipt_email: request.customer?.email
      });

      // Mapear resultado
      const result: PaymentResult = {
        success: paymentIntent.status === 'succeeded',
        transactionId: paymentIntent.id,
        status: this.mapPaymentStatus(paymentIntent.status),
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        paymentMethod: {
          type: 'card',
          last4: paymentIntent.payment_method ? 
            await this.getCardLast4(paymentIntent.payment_method as string) : undefined
        },
        processedAt: new Date(paymentIntent.created * 1000),
        fees: paymentIntent.charges.data[0]?.balance_transaction ? 
          await this.getTransactionFees(paymentIntent.charges.data[0].balance_transaction as string) : 0,
        rawResponse: paymentIntent
      };

      // Si requiere acción adicional (3D Secure)
      if (paymentIntent.status === 'requires_action' && paymentIntent.next_action) {
        result.requiresAction = true;
        result.actionUrl = paymentIntent.next_action.redirect_to_url?.url;
        result.clientSecret = paymentIntent.client_secret || undefined;
      }

      logger.info('[Stripe] Pago procesado', {
        transactionId: result.transactionId,
        status: result.status,
        requiresAction: result.requiresAction
      });

      return result;
    } catch (error: any) {
      logger.error('[Stripe] Error procesando pago', {
        error: error.message,
        type: error.type,
        code: error.code
      });

      if (error.type === 'StripeCardError') {
        throw new AppError(this.getCardErrorMessage(error.code), 400);
      }

      throw new AppError('Error procesando pago con tarjeta', 500);
    }
  }

  /**
   * Crear suscripción recurrente
   */
  async createSubscription(data: SubscriptionData): Promise<PaymentResult> {
    try {
      logger.info('[Stripe] Creando suscripción', {
        customerId: data.customerId,
        planId: data.planId,
        interval: data.interval
      });

      // Obtener o crear cliente
      const customer = await this.getOrCreateCustomer(data.customer);

      // Crear o recuperar precio/plan
      const price = await this.getOrCreatePrice({
        amount: data.amount,
        currency: data.currency || this.currency,
        interval: data.interval || 'month',
        productName: data.productName || 'Gastos Comunes SKYN3T',
        productId: data.planId
      });

      // Crear suscripción
      const subscription = await this.stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: price.id }],
        payment_behavior: 'default_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription'
        },
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          community_id: data.metadata?.communityId || '',
          unit_id: data.metadata?.unitId || '',
          system: 'SKYN3T'
        },
        trial_period_days: data.trialDays,
        cancel_at_period_end: false
      });

      const invoice = subscription.latest_invoice as Stripe.Invoice;
      const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

      return {
        success: subscription.status === 'active',
        transactionId: subscription.id,
        status: this.mapSubscriptionStatus(subscription.status),
        amount: price.unit_amount || 0,
        currency: price.currency,
        subscriptionId: subscription.id,
        processedAt: new Date(subscription.created * 1000),
        nextPaymentDate: new Date(subscription.current_period_end * 1000),
        clientSecret: paymentIntent?.client_secret,
        rawResponse: subscription
      };
    } catch (error: any) {
      logger.error('[Stripe] Error creando suscripción', {
        error: error.message,
        type: error.type
      });

      throw new AppError('Error creando suscripción', 500);
    }
  }

  /**
   * Obtener estado de un pago
   */
  async getPaymentStatus(transactionId: string): Promise<PaymentResult> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(transactionId);

      return {
        success: paymentIntent.status === 'succeeded',
        transactionId: paymentIntent.id,
        status: this.mapPaymentStatus(paymentIntent.status),
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        processedAt: new Date(paymentIntent.created * 1000),
        rawResponse: paymentIntent
      };
    } catch (error: any) {
      logger.error('[Stripe] Error obteniendo estado de pago', {
        transactionId,
        error: error.message
      });

      if (error.code === 'resource_missing') {
        throw new AppError('Transacción no encontrada', 404);
      }

      throw new AppError('Error obteniendo estado de pago', 500);
    }
  }

  /**
   * Procesar reembolso
   */
  async refundPayment(request: RefundRequest): Promise<PaymentResult> {
    try {
      logger.info('[Stripe] Procesando reembolso', {
        transactionId: request.transactionId,
        amount: request.amount
      });

      const refund = await this.stripe.refunds.create({
        payment_intent: request.transactionId,
        amount: request.amount ? Math.round(request.amount) : undefined,
        reason: this.mapRefundReason(request.reason),
        metadata: {
          requested_by: request.requestedBy || 'system',
          reason_detail: request.reason || '',
          system: 'SKYN3T'
        }
      });

      return {
        success: refund.status === 'succeeded',
        transactionId: refund.id,
        originalTransactionId: refund.payment_intent as string,
        status: refund.status,
        amount: refund.amount,
        currency: refund.currency,
        processedAt: new Date(refund.created * 1000),
        refundId: refund.id,
        rawResponse: refund
      };
    } catch (error: any) {
      logger.error('[Stripe] Error procesando reembolso', {
        error: error.message,
        transactionId: request.transactionId
      });

      throw new AppError('Error procesando reembolso', 500);
    }
  }

  /**
   * Crear método de pago
   */
  async createPaymentMethod(data: PaymentMethod): Promise<any> {
    try {
      if (data.type === 'card' && data.cardToken) {
        const paymentMethod = await this.stripe.paymentMethods.create({
          type: 'card',
          card: { token: data.cardToken },
          metadata: {
            system: 'SKYN3T'
          }
        });

        return paymentMethod;
      }

      throw new AppError('Tipo de método de pago no soportado', 400);
    } catch (error: any) {
      logger.error('[Stripe] Error creando método de pago', {
        error: error.message
      });

      throw new AppError('Error creando método de pago', 500);
    }
  }

  /**
   * Validar configuración del gateway
   */
  async validateConfiguration(): Promise<boolean> {
    try {
      // Verificar conexión con Stripe
      const balance = await this.stripe.balance.retrieve();
      
      logger.info('[Stripe] Configuración validada', {
        available: balance.available.length > 0,
        currency: balance.available[0]?.currency
      });

      return true;
    } catch (error: any) {
      logger.error('[Stripe] Error validando configuración', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Manejar webhook de Stripe
   */
  async handleWebhook(payload: any, signature: string): Promise<void> {
    try {
      // Verificar firma del webhook
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret
      );

      logger.info('[Stripe] Webhook recibido', {
        type: event.type,
        id: event.id
      });

      // Procesar según tipo de evento
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
          break;

        case 'charge.dispute.created':
          await this.handleDisputeCreated(event.data.object as Stripe.Dispute);
          break;

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionCancelled(event.data.object as Stripe.Subscription);
          break;

        case 'invoice.payment_succeeded':
          await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.payment_failed':
          await this.handleInvoiceFailed(event.data.object as Stripe.Invoice);
          break;

        default:
          logger.info('[Stripe] Evento no manejado', { type: event.type });
      }
    } catch (error: any) {
      logger.error('[Stripe] Error procesando webhook', {
        error: error.message
      });
      throw new AppError('Error procesando webhook', 400);
    }
  }

  /**
   * Crear o recuperar cliente en Stripe
   */
  private async getOrCreateCustomer(customerData?: CustomerData): Promise<Stripe.Customer> {
    if (!customerData) {
      throw new AppError('Datos de cliente requeridos', 400);
    }

    try {
      // Buscar cliente existente por email
      if (customerData.stripeCustomerId) {
        return await this.stripe.customers.retrieve(customerData.stripeCustomerId) as Stripe.Customer;
      }

      if (customerData.email) {
        const customers = await this.stripe.customers.list({
          email: customerData.email,
          limit: 1
        });

        if (customers.data.length > 0) {
          return customers.data[0];
        }
      }

      // Crear nuevo cliente
      const customer = await this.stripe.customers.create({
        email: customerData.email,
        name: customerData.name,
        phone: customerData.phone,
        metadata: {
          user_id: customerData.userId || '',
          rut: customerData.metadata?.rut || '',
          system: 'SKYN3T'
        }
      });

      return customer;
    } catch (error: any) {
      logger.error('[Stripe] Error gestionando cliente', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Crear o recuperar precio/plan
   */
  private async getOrCreatePrice(data: {
    amount: number;
    currency: string;
    interval: 'month' | 'year';
    productName: string;
    productId?: string;
  }): Promise<Stripe.Price> {
    try {
      // Buscar producto existente
      let product: Stripe.Product;
      
      if (data.productId) {
        try {
          product = await this.stripe.products.retrieve(data.productId);
        } catch {
          product = await this.stripe.products.create({
            id: data.productId,
            name: data.productName,
            metadata: { system: 'SKYN3T' }
          });
        }
      } else {
        product = await this.stripe.products.create({
          name: data.productName,
          metadata: { system: 'SKYN3T' }
        });
      }

      // Crear precio
      const price = await this.stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(data.amount),
        currency: data.currency,
        recurring: {
          interval: data.interval
        },
        metadata: { system: 'SKYN3T' }
      });

      return price;
    } catch (error: any) {
      logger.error('[Stripe] Error creando precio', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Obtener últimos 4 dígitos de tarjeta
   */
  private async getCardLast4(paymentMethodId: string): Promise<string | undefined> {
    try {
      const paymentMethod = await this.stripe.paymentMethods.retrieve(paymentMethodId);
      return paymentMethod.card?.last4;
    } catch {
      return undefined;
    }
  }

  /**
   * Obtener fees de transacción
   */
  private async getTransactionFees(balanceTransactionId: string): Promise<number> {
    try {
      const transaction = await this.stripe.balanceTransactions.retrieve(balanceTransactionId);
      return transaction.fee;
    } catch {
      return 0;
    }
  }

  /**
   * Mapear estado de pago
   */
  private mapPaymentStatus(stripeStatus: string): string {
    const statusMap: { [key: string]: string } = {
      'requires_payment_method': 'pending',
      'requires_confirmation': 'pending',
      'requires_action': 'pending_action',
      'processing': 'processing',
      'requires_capture': 'authorized',
      'canceled': 'cancelled',
      'succeeded': 'completed'
    };

    return statusMap[stripeStatus] || 'unknown';
  }

  /**
   * Mapear estado de suscripción
   */
  private mapSubscriptionStatus(stripeStatus: string): string {
    const statusMap: { [key: string]: string } = {
      'incomplete': 'pending',
      'incomplete_expired': 'failed',
      'trialing': 'trial',
      'active': 'active',
      'past_due': 'past_due',
      'canceled': 'cancelled',
      'unpaid': 'unpaid'
    };

    return statusMap[stripeStatus] || 'unknown';
  }

  /**
   * Mapear razón de reembolso
   */
  private mapRefundReason(reason?: string): 'duplicate' | 'fraudulent' | 'requested_by_customer' {
    const reasonMap: { [key: string]: 'duplicate' | 'fraudulent' | 'requested_by_customer' } = {
      'duplicate': 'duplicate',
      'fraud': 'fraudulent',
      'customer_request': 'requested_by_customer'
    };

    return reasonMap[reason || ''] || 'requested_by_customer';
  }

  /**
   * Obtener mensaje de error de tarjeta legible
   */
  private getCardErrorMessage(code?: string): string {
    const messages: { [key: string]: string } = {
      'card_declined': 'Tarjeta rechazada',
      'insufficient_funds': 'Fondos insuficientes',
      'lost_card': 'Tarjeta reportada como perdida',
      'stolen_card': 'Tarjeta reportada como robada',
      'expired_card': 'Tarjeta expirada',
      'incorrect_cvc': 'Código de seguridad incorrecto',
      'processing_error': 'Error procesando la tarjeta',
      'incorrect_number': 'Número de tarjeta incorrecto'
    };

    return messages[code || ''] || 'Error procesando la tarjeta';
  }

  // Handlers de eventos webhook

  private async handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    logger.info('[Stripe] Pago exitoso', {
      id: paymentIntent.id,
      amount: paymentIntent.amount
    });
    // Integrar con sistema principal
  }

  private async handlePaymentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    logger.error('[Stripe] Pago fallido', {
      id: paymentIntent.id,
      error: paymentIntent.last_payment_error?.message
    });
    // Integrar con sistema principal
  }

  private async handleDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
    logger.warn('[Stripe] Disputa creada', {
      id: dispute.id,
      amount: dispute.amount,
      reason: dispute.reason
    });
    // Integrar con sistema principal para manejar disputas
  }

  private async handleSubscriptionUpdate(subscription: Stripe.Subscription): Promise<void> {
    logger.info('[Stripe] Suscripción actualizada', {
      id: subscription.id,
      status: subscription.status
    });
    // Integrar con sistema principal
  }

  private async handleSubscriptionCancelled(subscription: Stripe.Subscription): Promise<void> {
    logger.info('[Stripe] Suscripción cancelada', {
      id: subscription.id
    });
    // Integrar con sistema principal
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    logger.info('[Stripe] Factura pagada', {
      id: invoice.id,
      subscription: invoice.subscription,
      amount: invoice.amount_paid
    });
    // Integrar con sistema principal
  }

  private async handleInvoiceFailed(invoice: Stripe.Invoice): Promise<void> {
    logger.error('[Stripe] Pago de factura fallido', {
      id: invoice.id,
      subscription: invoice.subscription,
      attemptCount: invoice.attempt_count
    });
    // Integrar con sistema principal
  }
}