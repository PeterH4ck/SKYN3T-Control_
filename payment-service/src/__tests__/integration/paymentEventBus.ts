import amqp from 'amqplib';
import { EventEmitter } from 'events';
import logger from '../utils/logger';
import { Payment } from '../models/Payment';

/**
 * Event Bus para comunicación con el sistema principal
 * Utiliza RabbitMQ para mensajería asíncrona
 */
export class PaymentEventBus extends EventEmitter {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private exchange: string = 'skyn3t.events';
  private queue: string = 'payment.events';
  private deadLetterExchange: string = 'skyn3t.dlx';
  private deadLetterQueue: string = 'payment.events.dlq';

  constructor() {
    super();
    this.setupInternalHandlers();
  }

  /**
   * Conectar a RabbitMQ
   */
  async connect(): Promise<void> {
    try {
      const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
      
      this.connection = await amqp.connect(rabbitmqUrl);
      this.channel = await this.connection.createChannel();

      // Configurar exchanges
      await this.channel.assertExchange(this.exchange, 'topic', { durable: true });
      await this.channel.assertExchange(this.deadLetterExchange, 'topic', { durable: true });

      // Configurar queues
      await this.channel.assertQueue(this.queue, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': this.deadLetterExchange,
          'x-dead-letter-routing-key': 'payment.dlq'
        }
      });

      await this.channel.assertQueue(this.deadLetterQueue, { durable: true });

      // Bind queues
      await this.channel.bindQueue(this.queue, this.exchange, 'payment.*');
      await this.channel.bindQueue(this.deadLetterQueue, this.deadLetterExchange, 'payment.dlq');

      // Configurar consumidores
      await this.setupConsumers();

      logger.info('[PaymentEventBus] Conectado a RabbitMQ');

      // Manejar desconexiones
      this.connection.on('error', (err) => {
        logger.error('[PaymentEventBus] Error de conexión', { error: err.message });
        this.reconnect();
      });

      this.connection.on('close', () => {
        logger.warn('[PaymentEventBus] Conexión cerrada, reconectando...');
        this.reconnect();
      });
    } catch (error: any) {
      logger.error('[PaymentEventBus] Error conectando a RabbitMQ', {
        error: error.message
      });
      
      // Reintentar después de 5 segundos
      setTimeout(() => this.connect(), 5000);
    }
  }

  /**
   * Publicar evento de pago
   */
  async publishPaymentEvent(eventType: string, data: any): Promise<void> {
    try {
      if (!this.channel) {
        throw new Error('Canal no disponible');
      }

      const event = {
        id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: eventType,
        timestamp: new Date().toISOString(),
        source: 'payment-service',
        data: {
          ...data,
          _metadata: {
            service: 'payment-service',
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development'
          }
        }
      };

      const routingKey = `payment.${eventType}`;
      const message = Buffer.from(JSON.stringify(event));

      await this.channel.publish(
        this.exchange,
        routingKey,
        message,
        {
          persistent: true,
          contentType: 'application/json',
          timestamp: Date.now(),
          messageId: event.id
        }
      );

      logger.info('[PaymentEventBus] Evento publicado', {
        eventId: event.id,
        type: eventType,
        routingKey
      });

      // Emitir localmente también
      this.emit(eventType, event);
    } catch (error: any) {
      logger.error('[PaymentEventBus] Error publicando evento', {
        error: error.message,
        eventType,
        data
      });
      
      // Guardar en cola local para reintentar
      this.queueFailedEvent(eventType, data);
    }
  }

  /**
   * Suscribirse a eventos del sistema principal
   */
  private async setupConsumers(): Promise<void> {
    if (!this.channel) return;

    // Consumir eventos de otros servicios
    await this.channel.consume(this.queue, async (msg) => {
      if (!msg) return;

      try {
        const event = JSON.parse(msg.content.toString());
        
        logger.info('[PaymentEventBus] Evento recibido', {
          eventId: event.id,
          type: event.type,
          source: event.source
        });

        // Procesar según el tipo de evento
        await this.processIncomingEvent(event);

        // Acknowledge
        this.channel!.ack(msg);
      } catch (error: any) {
        logger.error('[PaymentEventBus] Error procesando evento', {
          error: error.message,
          message: msg.content.toString()
        });

        // Reject y enviar a DLQ después de 3 intentos
        const retryCount = (msg.properties.headers['x-retry-count'] || 0) + 1;
        
        if (retryCount >= 3) {
          this.channel!.nack(msg, false, false); // No requeue, va a DLQ
        } else {
          // Requeue con delay
          setTimeout(() => {
            this.channel!.nack(msg, false, true);
          }, retryCount * 1000);
        }
      }
    });
  }

  /**
   * Procesar eventos entrantes
   */
  private async processIncomingEvent(event: any): Promise<void> {
    switch (event.type) {
      case 'user.created':
        await this.handleUserCreated(event.data);
        break;
        
      case 'community.payment_due':
        await this.handlePaymentDue(event.data);
        break;
        
      case 'community.settings_updated':
        await this.handleCommunitySettingsUpdated(event.data);
        break;
        
      case 'invoice.requested':
        await this.handleInvoiceRequested(event.data);
        break;
        
      default:
        logger.debug('[PaymentEventBus] Evento no manejado', {
          type: event.type
        });
    }
  }

  /**
   * Configurar handlers internos
   */
  private setupInternalHandlers(): void {
    // Handler para pagos completados
    this.on('payment.completed', async (event) => {
      try {
        // Notificar al servicio de notificaciones
        await this.publishNotificationEvent({
          type: 'payment_completed',
          userId: event.data.userId,
          data: {
            amount: event.data.amount,
            description: event.data.description,
            transactionId: event.data.transactionId
          }
        });

        // Actualizar métricas
        await this.publishMetricsEvent({
          type: 'payment',
          metric: 'completed',
          value: event.data.amount,
          tags: {
            communityId: event.data.communityId,
            provider: event.data.provider
          }
        });
      } catch (error: any) {
        logger.error('[PaymentEventBus] Error en handler payment.completed', {
          error: error.message
        });
      }
    });

    // Handler para pagos fallidos
    this.on('payment.failed', async (event) => {
      try {
        // Notificar fallo
        await this.publishNotificationEvent({
          type: 'payment_failed',
          userId: event.data.userId,
          data: {
            amount: event.data.amount,
            reason: event.data.errorMessage,
            transactionId: event.data.transactionId
          }
        });

        // Actualizar métricas
        await this.publishMetricsEvent({
          type: 'payment',
          metric: 'failed',
          value: 1,
          tags: {
            communityId: event.data.communityId,
            provider: event.data.provider,
            errorCode: event.data.errorCode
          }
        });
      } catch (error: any) {
        logger.error('[PaymentEventBus] Error en handler payment.failed', {
          error: error.message
        });
      }
    });

    // Handler para suscripciones creadas
    this.on('subscription.created', async (event) => {
      try {
        // Notificar creación de suscripción
        await this.publishNotificationEvent({
          type: 'subscription_created',
          userId: event.data.userId,
          data: {
            subscriptionId: event.data.subscriptionId,
            amount: event.data.amount,
            interval: event.data.interval,
            nextPaymentDate: event.data.nextPaymentDate
          }
        });
      } catch (error: any) {
        logger.error('[PaymentEventBus] Error en handler subscription.created', {
          error: error.message
        });
      }
    });

    // Handler para reembolsos
    this.on('refund.processed', async (event) => {
      try {
        // Notificar reembolso
        await this.publishNotificationEvent({
          type: 'refund_processed',
          userId: event.data.userId,
          data: {
            amount: event.data.amount,
            originalTransactionId: event.data.originalTransactionId,
            refundId: event.data.refundId
          }
        });

        // Actualizar estado en contabilidad
        await this.publishAccountingEvent({
          type: 'refund',
          transactionId: event.data.originalTransactionId,
          amount: event.data.amount,
          date: event.data.processedAt
        });
      } catch (error: any) {
        logger.error('[PaymentEventBus] Error en handler refund.processed', {
          error: error.message
        });
      }
    });
  }

  /**
   * Handlers para eventos externos
   */
  private async handleUserCreated(data: any): Promise<void> {
    logger.info('[PaymentEventBus] Usuario creado', {
      userId: data.userId,
      communityId: data.communityId
    });

    // Aquí se podría crear un customer en los gateways de pago
    // o preparar configuración de pagos para el nuevo usuario
  }

  private async handlePaymentDue(data: any): Promise<void> {
    logger.info('[PaymentEventBus] Pago pendiente', {
      communityId: data.communityId,
      amount: data.amount,
      dueDate: data.dueDate
    });

    // Procesar cobros automáticos para suscripciones activas
    const subscriptions = await Payment.findAll({
      where: {
        community_id: data.communityId,
        payment_type: 'recurring',
        status: 'active'
      }
    });

    for (const subscription of subscriptions) {
      // Trigger cobro automático
      await this.publishPaymentEvent('payment.auto_charge_triggered', {
        subscriptionId: subscription.gateway_transaction_id,
        amount: data.amount,
        dueDate: data.dueDate
      });
    }
  }

  private async handleCommunitySettingsUpdated(data: any): Promise<void> {
    logger.info('[PaymentEventBus] Configuración de comunidad actualizada', {
      communityId: data.communityId,
      settings: data.settings
    });

    // Actualizar configuración de pagos si es necesario
    if (data.settings.paymentSettings) {
      // Actualizar configuración local de la comunidad
      await this.updateCommunityPaymentSettings(
        data.communityId,
        data.settings.paymentSettings
      );
    }
  }

  private async handleInvoiceRequested(data: any): Promise<void> {
    logger.info('[PaymentEventBus] Factura solicitada', {
      paymentId: data.paymentId,
      requestedBy: data.userId
    });

    // Generar factura si el pago existe
    const payment = await Payment.findByPk(data.paymentId);
    
    if (payment && payment.status === 'completed') {
      await this.publishPaymentEvent('invoice.generation_started', {
        paymentId: payment.id,
        userId: payment.user_id,
        amount: payment.amount,
        requestedBy: data.userId
      });
    }
  }

  /**
   * Publicar evento a servicio de notificaciones
   */
  private async publishNotificationEvent(data: any): Promise<void> {
    if (!this.channel) return;

    const event = {
      id: `notif_${Date.now()}`,
      type: 'notification.send',
      timestamp: new Date().toISOString(),
      source: 'payment-service',
      data
    };

    await this.channel.publish(
      this.exchange,
      'notification.send',
      Buffer.from(JSON.stringify(event)),
      { persistent: true }
    );
  }

  /**
   * Publicar evento a servicio de contabilidad
   */
  private async publishAccountingEvent(data: any): Promise<void> {
    if (!this.channel) return;

    const event = {
      id: `acc_${Date.now()}`,
      type: 'accounting.transaction',
      timestamp: new Date().toISOString(),
      source: 'payment-service',
      data
    };

    await this.channel.publish(
      this.exchange,
      'accounting.transaction',
      Buffer.from(JSON.stringify(event)),
      { persistent: true }
    );
  }

  /**
   * Publicar evento de métricas
   */
  private async publishMetricsEvent(data: any): Promise<void> {
    if (!this.channel) return;

    const event = {
      id: `metric_${Date.now()}`,
      type: 'metrics.record',
      timestamp: new Date().toISOString(),
      source: 'payment-service',
      data
    };

    await this.channel.publish(
      this.exchange,
      'metrics.record',
      Buffer.from(JSON.stringify(event)),
      { persistent: true }
    );
  }

  /**
   * Actualizar configuración de pagos de comunidad
   */
  private async updateCommunityPaymentSettings(
    communityId: string,
    settings: any
  ): Promise<void> {
    // Aquí se actualizaría la configuración local
    // Por ejemplo, métodos de pago permitidos, límites, etc.
    logger.info('[PaymentEventBus] Actualizando configuración de pagos', {
      communityId,
      settings
    });
  }

  /**
   * Guardar evento fallido para reintentar
   */
  private queueFailedEvent(eventType: string, data: any): void {
    // En producción, esto se guardaría en una base de datos
    // o en un sistema de cola persistente
    logger.warn('[PaymentEventBus] Evento encolado para reintento', {
      eventType,
      data
    });
  }

  /**
   * Reconectar a RabbitMQ
   */
  private async reconnect(): Promise<void> {
    try {
      await this.disconnect();
      await this.connect();
    } catch (error: any) {
      logger.error('[PaymentEventBus] Error reconectando', {
        error: error.message
      });
      
      // Reintentar en 10 segundos
      setTimeout(() => this.reconnect(), 10000);
    }
  }

  /**
   * Desconectar de RabbitMQ
   */
  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      
      logger.info('[PaymentEventBus] Desconectado de RabbitMQ');
    } catch (error: any) {
      logger.error('[PaymentEventBus] Error desconectando', {
        error: error.message
      });
    }
  }
}

// Singleton
export const paymentEventBus = new PaymentEventBus();