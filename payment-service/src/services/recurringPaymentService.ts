import { Op } from 'sequelize';
import { Payment } from '../models/Payment';
import { PaymentGateway, RecurringPayment, SubscriptionData, PaymentResult } from '../types/gateway.types';
import { StripeGateway } from '../gateways/stripe.gateway';
import { PayPalGateway } from '../gateways/paypal.gateway';
import { MercadoPagoGateway } from '../gateways/mercadopago.gateway';
import { AppError } from '../utils/AppError';
import logger from '../utils/logger';
import { CronJob } from 'cron';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

/**
 * Servicio para gestionar pagos recurrentes y suscripciones
 */
export class RecurringPaymentService {
  private gateways: Map<string, PaymentGateway>;
  private redis: Redis;
  private recurringJobs: Map<string, CronJob>;

  constructor(redis: Redis) {
    this.redis = redis;
    this.gateways = new Map();
    this.recurringJobs = new Map();

    // Inicializar gateways
    this.initializeGateways();

    // Iniciar procesamiento de pagos recurrentes
    this.startRecurringProcessor();
  }

  /**
   * Inicializar gateways de pago
   */
  private initializeGateways(): void {
    try {
      this.gateways.set('stripe', new StripeGateway());
      this.gateways.set('paypal', new PayPalGateway());
      this.gateways.set('mercadopago', new MercadoPagoGateway());

      logger.info('[RecurringPaymentService] Gateways inicializados');
    } catch (error: any) {
      logger.error('[RecurringPaymentService] Error inicializando gateways', {
        error: error.message
      });
    }
  }

  /**
   * Crear una nueva suscripción
   */
  async createSubscription(data: {
    customerId: string;
    communityId: string;
    unitId: string;
    amount: number;
    currency?: string;
    interval: 'monthly' | 'quarterly' | 'yearly';
    paymentMethod: string;
    gatewayProvider: 'stripe' | 'paypal' | 'mercadopago';
    description?: string;
    startDate?: Date;
    metadata?: any;
  }): Promise<RecurringPayment> {
    try {
      logger.info('[RecurringPaymentService] Creando suscripción', {
        customerId: data.customerId,
        amount: data.amount,
        interval: data.interval
      });

      const gateway = this.gateways.get(data.gatewayProvider);
      if (!gateway || !gateway.createSubscription) {
        throw new AppError('Gateway no soporta suscripciones', 400);
      }

      // Mapear intervalo
      const intervalMap = {
        'monthly': 'month',
        'quarterly': 'month', // Se manejará con intervalCount = 3
        'yearly': 'year'
      };

      // Crear suscripción en el gateway
      const subscriptionData: SubscriptionData = {
        customerId: data.customerId,
        amount: data.amount,
        currency: data.currency || 'CLP',
        interval: intervalMap[data.interval] as 'month' | 'year',
        intervalCount: data.interval === 'quarterly' ? 3 : 1,
        productName: data.description || `Gastos Comunes - ${data.unitId}`,
        startDate: data.startDate,
        metadata: {
          communityId: data.communityId,
          unitId: data.unitId,
          ...data.metadata
        }
      };

      const result = await gateway.createSubscription(subscriptionData);

      if (!result.success || !result.subscriptionId) {
        throw new AppError('Error creando suscripción en gateway', 500);
      }

      // Guardar en base de datos
      const recurringPayment = await Payment.create({
        id: uuidv4(),
        community_id: data.communityId,
        user_id: data.customerId,
        amount: data.amount,
        currency: data.currency || 'CLP',
        status: 'active',
        payment_type: 'recurring',
        gateway_provider: data.gatewayProvider,
        gateway_transaction_id: result.subscriptionId,
        payment_method: data.paymentMethod,
        description: data.description,
        metadata: {
          unitId: data.unitId,
          interval: data.interval,
          subscriptionId: result.subscriptionId,
          nextPaymentDate: result.nextPaymentDate,
          ...data.metadata
        },
        processed_at: new Date()
      });

      // Cachear información de suscripción
      await this.cacheSubscription({
        subscriptionId: result.subscriptionId!,
        customerId: data.customerId,
        amount: data.amount,
        currency: data.currency || 'CLP',
        interval: data.interval,
        nextPaymentDate: result.nextPaymentDate!,
        status: 'active',
        startDate: data.startDate || new Date(),
        paymentMethod: {
          type: data.paymentMethod,
          last4: result.paymentMethod?.last4
        }
      });

      // Programar recordatorios
      await this.schedulePaymentReminders(result.subscriptionId!, data.customerId);

      logger.info('[RecurringPaymentService] Suscripción creada exitosamente', {
        subscriptionId: result.subscriptionId,
        nextPayment: result.nextPaymentDate
      });

      return {
        subscriptionId: result.subscriptionId!,
        customerId: data.customerId,
        amount: data.amount,
        currency: data.currency || 'CLP',
        interval: data.interval,
        nextPaymentDate: result.nextPaymentDate!,
        status: 'active',
        startDate: data.startDate || new Date(),
        paymentMethod: {
          type: data.paymentMethod,
          last4: result.paymentMethod?.last4
        }
      };
    } catch (error: any) {
      logger.error('[RecurringPaymentService] Error creando suscripción', {
        error: error.message,
        data
      });
      throw error;
    }
  }

  /**
   * Pausar una suscripción
   */
  async pauseSubscription(subscriptionId: string, reason?: string): Promise<void> {
    try {
      logger.info('[RecurringPaymentService] Pausando suscripción', {
        subscriptionId,
        reason
      });

      // Obtener información de la suscripción
      const payment = await Payment.findOne({
        where: {
          gateway_transaction_id: subscriptionId,
          payment_type: 'recurring',
          status: 'active'
        }
      });

      if (!payment) {
        throw new AppError('Suscripción no encontrada', 404);
      }

      // Actualizar estado en base de datos
      await payment.update({
        status: 'paused',
        metadata: {
          ...payment.metadata,
          pausedAt: new Date(),
          pauseReason: reason
        }
      });

      // Actualizar cache
      const cached = await this.getCachedSubscription(subscriptionId);
      if (cached) {
        cached.status = 'paused';
        await this.cacheSubscription(cached);
      }

      // Cancelar recordatorios programados
      this.cancelScheduledReminders(subscriptionId);

      logger.info('[RecurringPaymentService] Suscripción pausada', {
        subscriptionId
      });
    } catch (error: any) {
      logger.error('[RecurringPaymentService] Error pausando suscripción', {
        error: error.message,
        subscriptionId
      });
      throw error;
    }
  }

  /**
   * Reanudar una suscripción pausada
   */
  async resumeSubscription(subscriptionId: string): Promise<void> {
    try {
      logger.info('[RecurringPaymentService] Reanudando suscripción', {
        subscriptionId
      });

      const payment = await Payment.findOne({
        where: {
          gateway_transaction_id: subscriptionId,
          payment_type: 'recurring',
          status: 'paused'
        }
      });

      if (!payment) {
        throw new AppError('Suscripción pausada no encontrada', 404);
      }

      // Calcular próxima fecha de pago
      const nextPaymentDate = this.calculateNextPaymentDate(
        payment.metadata.interval,
        new Date()
      );

      // Actualizar estado
      await payment.update({
        status: 'active',
        metadata: {
          ...payment.metadata,
          resumedAt: new Date(),
          nextPaymentDate
        }
      });

      // Actualizar cache
      const cached = await this.getCachedSubscription(subscriptionId);
      if (cached) {
        cached.status = 'active';
        cached.nextPaymentDate = nextPaymentDate;
        await this.cacheSubscription(cached);
      }

      // Reprogramar recordatorios
      await this.schedulePaymentReminders(subscriptionId, payment.user_id);

      logger.info('[RecurringPaymentService] Suscripción reanudada', {
        subscriptionId,
        nextPaymentDate
      });
    } catch (error: any) {
      logger.error('[RecurringPaymentService] Error reanudando suscripción', {
        error: error.message,
        subscriptionId
      });
      throw error;
    }
  }

  /**
   * Cancelar una suscripción
   */
  async cancelSubscription(
    subscriptionId: string, 
    reason?: string,
    immediate: boolean = false
  ): Promise<void> {
    try {
      logger.info('[RecurringPaymentService] Cancelando suscripción', {
        subscriptionId,
        reason,
        immediate
      });

      const payment = await Payment.findOne({
        where: {
          gateway_transaction_id: subscriptionId,
          payment_type: 'recurring',
          status: ['active', 'paused']
        }
      });

      if (!payment) {
        throw new AppError('Suscripción no encontrada', 404);
      }

      const gateway = this.gateways.get(payment.gateway_provider);
      if (!gateway) {
        throw new AppError('Gateway no disponible', 500);
      }

      // Si es cancelación inmediata, cancelar en el gateway
      if (immediate && gateway.createSubscription) {
        // Aquí se llamaría al método de cancelación del gateway
        // Por ahora simulamos la cancelación
        logger.info('[RecurringPaymentService] Cancelando en gateway', {
          provider: payment.gateway_provider,
          subscriptionId
        });
      }

      // Actualizar estado
      await payment.update({
        status: immediate ? 'cancelled' : 'pending_cancellation',
        metadata: {
          ...payment.metadata,
          cancelledAt: new Date(),
          cancelReason: reason,
          cancellationType: immediate ? 'immediate' : 'end_of_period'
        }
      });

      // Limpiar cache
      await this.redis.del(`subscription:${subscriptionId}`);

      // Cancelar recordatorios
      this.cancelScheduledReminders(subscriptionId);

      logger.info('[RecurringPaymentService] Suscripción cancelada', {
        subscriptionId,
        type: immediate ? 'immediate' : 'end_of_period'
      });
    } catch (error: any) {
      logger.error('[RecurringPaymentService] Error cancelando suscripción', {
        error: error.message,
        subscriptionId
      });
      throw error;
    }
  }

  /**
   * Obtener historial de pagos de una suscripción
   */
  async getSubscriptionHistory(subscriptionId: string): Promise<Payment[]> {
    try {
      const payments = await Payment.findAll({
        where: {
          [Op.or]: [
            { gateway_transaction_id: subscriptionId },
            { 
              metadata: {
                subscriptionId
              }
            }
          ]
        },
        order: [['created_at', 'DESC']]
      });

      return payments;
    } catch (error: any) {
      logger.error('[RecurringPaymentService] Error obteniendo historial', {
        error: error.message,
        subscriptionId
      });
      throw error;
    }
  }

  /**
   * Procesar pagos recurrentes pendientes
   */
  private async processRecurringPayments(): Promise<void> {
    try {
      logger.info('[RecurringPaymentService] Procesando pagos recurrentes');

      // Obtener suscripciones activas con pago pendiente
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const subscriptions = await Payment.findAll({
        where: {
          payment_type: 'recurring',
          status: 'active',
          [Op.and]: [
            {
              metadata: {
                nextPaymentDate: {
                  [Op.lte]: today
                }
              }
            }
          ]
        }
      });

      logger.info('[RecurringPaymentService] Suscripciones a procesar', {
        count: subscriptions.length
      });

      // Procesar cada suscripción
      for (const subscription of subscriptions) {
        try {
          await this.processSingleRecurringPayment(subscription);
        } catch (error: any) {
          logger.error('[RecurringPaymentService] Error procesando pago recurrente', {
            subscriptionId: subscription.gateway_transaction_id,
            error: error.message
          });

          // Notificar fallo
          await this.notifyPaymentFailure(subscription);
        }
      }
    } catch (error: any) {
      logger.error('[RecurringPaymentService] Error en procesamiento batch', {
        error: error.message
      });
    }
  }

  /**
   * Procesar un pago recurrente individual
   */
  private async processSingleRecurringPayment(subscription: Payment): Promise<void> {
    const gateway = this.gateways.get(subscription.gateway_provider);
    if (!gateway) {
      throw new AppError('Gateway no disponible', 500);
    }

    // Crear nuevo pago
    const paymentResult = await gateway.processPayment({
      amount: subscription.amount,
      currency: subscription.currency,
      reference: `RECURRING-${subscription.id}-${Date.now()}`,
      description: subscription.description || 'Pago recurrente gastos comunes',
      customer: {
        id: subscription.user_id,
        email: subscription.metadata.customerEmail
      },
      paymentMethodId: subscription.metadata.paymentMethodId,
      metadata: {
        subscriptionId: subscription.gateway_transaction_id,
        communityId: subscription.community_id,
        unitId: subscription.metadata.unitId,
        paymentType: 'recurring_charge'
      }
    });

    if (paymentResult.success) {
      // Crear registro del pago exitoso
      await Payment.create({
        id: uuidv4(),
        community_id: subscription.community_id,
        user_id: subscription.user_id,
        amount: subscription.amount,
        currency: subscription.currency,
        status: 'completed',
        payment_type: 'recurring_charge',
        gateway_provider: subscription.gateway_provider,
        gateway_transaction_id: paymentResult.transactionId,
        payment_method: subscription.payment_method,
        description: `Cargo recurrente - ${subscription.description}`,
        metadata: {
          subscriptionId: subscription.gateway_transaction_id,
          ...subscription.metadata
        },
        processed_at: new Date()
      });

      // Actualizar próxima fecha de pago
      const nextPaymentDate = this.calculateNextPaymentDate(
        subscription.metadata.interval,
        new Date()
      );

      await subscription.update({
        metadata: {
          ...subscription.metadata,
          lastPaymentDate: new Date(),
          nextPaymentDate,
          consecutivePayments: (subscription.metadata.consecutivePayments || 0) + 1
        }
      });

      logger.info('[RecurringPaymentService] Pago recurrente exitoso', {
        subscriptionId: subscription.gateway_transaction_id,
        transactionId: paymentResult.transactionId,
        nextPaymentDate
      });
    } else {
      // Manejar fallo
      await subscription.update({
        metadata: {
          ...subscription.metadata,
          lastFailedAttempt: new Date(),
          failedAttempts: (subscription.metadata.failedAttempts || 0) + 1,
          lastError: paymentResult.errorMessage
        }
      });

      // Si hay muchos fallos, pausar la suscripción
      if (subscription.metadata.failedAttempts >= 3) {
        await this.pauseSubscription(
          subscription.gateway_transaction_id,
          'Múltiples intentos de pago fallidos'
        );
      }

      throw new AppError(
        paymentResult.errorMessage || 'Pago recurrente fallido',
        400
      );
    }
  }

  /**
   * Iniciar procesador de pagos recurrentes
   */
  private startRecurringProcessor(): void {
    // Ejecutar diariamente a las 6 AM
    const job = new CronJob('0 6 * * *', async () => {
      await this.processRecurringPayments();
    });

    job.start();
    this.recurringJobs.set('daily-processor', job);

    logger.info('[RecurringPaymentService] Procesador recurrente iniciado');
  }

  /**
   * Programar recordatorios de pago
   */
  private async schedulePaymentReminders(
    subscriptionId: string,
    customerId: string
  ): Promise<void> {
    const cached = await this.getCachedSubscription(subscriptionId);
    if (!cached) return;

    // Recordatorio 3 días antes
    const reminderDate = new Date(cached.nextPaymentDate);
    reminderDate.setDate(reminderDate.getDate() - 3);

    const jobId = `reminder-${subscriptionId}`;
    const job = new CronJob(reminderDate, async () => {
      await this.sendPaymentReminder(subscriptionId, customerId);
    });

    job.start();
    this.recurringJobs.set(jobId, job);
  }

  /**
   * Cancelar recordatorios programados
   */
  private cancelScheduledReminders(subscriptionId: string): void {
    const jobId = `reminder-${subscriptionId}`;
    const job = this.recurringJobs.get(jobId);
    
    if (job) {
      job.stop();
      this.recurringJobs.delete(jobId);
    }
  }

  /**
   * Calcular próxima fecha de pago
   */
  private calculateNextPaymentDate(
    interval: string,
    fromDate: Date
  ): Date {
    const nextDate = new Date(fromDate);

    switch (interval) {
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case 'quarterly':
        nextDate.setMonth(nextDate.getMonth() + 3);
        break;
      case 'yearly':
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        break;
    }

    return nextDate;
  }

  /**
   * Cachear información de suscripción
   */
  private async cacheSubscription(subscription: RecurringPayment): Promise<void> {
    const key = `subscription:${subscription.subscriptionId}`;
    const ttl = 86400; // 24 horas

    await this.redis.setex(
      key,
      ttl,
      JSON.stringify(subscription)
    );
  }

  /**
   * Obtener suscripción desde cache
   */
  private async getCachedSubscription(
    subscriptionId: string
  ): Promise<RecurringPayment | null> {
    const key = `subscription:${subscriptionId}`;
    const cached = await this.redis.get(key);

    if (cached) {
      return JSON.parse(cached);
    }

    return null;
  }

  /**
   * Enviar recordatorio de pago
   */
  private async sendPaymentReminder(
    subscriptionId: string,
    customerId: string
  ): Promise<void> {
    logger.info('[RecurringPaymentService] Enviando recordatorio de pago', {
      subscriptionId,
      customerId
    });

    // Aquí se integraría con el servicio de notificaciones
    // Por ahora solo logueamos
  }

  /**
   * Notificar fallo de pago
   */
  private async notifyPaymentFailure(subscription: Payment): Promise<void> {
    logger.info('[RecurringPaymentService] Notificando fallo de pago', {
      subscriptionId: subscription.gateway_transaction_id,
      customerId: subscription.user_id
    });

    // Aquí se integraría con el servicio de notificaciones
    // Por ahora solo logueamos
  }

  /**
   * Obtener métricas de pagos recurrentes
   */
  async getRecurringMetrics(communityId?: string): Promise<{
    activeSubscriptions: number;
    pausedSubscriptions: number;
    monthlyRecurringRevenue: number;
    averageSubscriptionValue: number;
    churnRate: number;
  }> {
    try {
      const where: any = {
        payment_type: 'recurring'
      };

      if (communityId) {
        where.community_id = communityId;
      }

      // Obtener todas las suscripciones
      const subscriptions = await Payment.findAll({ where });

      const active = subscriptions.filter(s => s.status === 'active');
      const paused = subscriptions.filter(s => s.status === 'paused');

      // Calcular MRR (Monthly Recurring Revenue)
      const mrr = active.reduce((total, sub) => {
        let monthlyAmount = sub.amount;
        
        // Ajustar según intervalo
        if (sub.metadata.interval === 'yearly') {
          monthlyAmount = sub.amount / 12;
        } else if (sub.metadata.interval === 'quarterly') {
          monthlyAmount = sub.amount / 3;
        }

        return total + monthlyAmount;
      }, 0);

      // Calcular valor promedio
      const avgValue = active.length > 0 ? mrr / active.length : 0;

      // Calcular churn rate (últimos 30 días)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const cancelled = subscriptions.filter(
        s => s.status === 'cancelled' && 
        s.metadata.cancelledAt && 
        new Date(s.metadata.cancelledAt) > thirtyDaysAgo
      );

      const churnRate = active.length > 0 ? 
        (cancelled.length / active.length) * 100 : 0;

      return {
        activeSubscriptions: active.length,
        pausedSubscriptions: paused.length,
        monthlyRecurringRevenue: mrr,
        averageSubscriptionValue: avgValue,
        churnRate
      };
    } catch (error: any) {
      logger.error('[RecurringPaymentService] Error obteniendo métricas', {
        error: error.message,
        communityId
      });
      throw error;
    }
  }
}