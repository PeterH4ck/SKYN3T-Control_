// =====================================================
// RABBITMQ SERVICE - PERMISSION SERVICE
// =====================================================
// Servicio para comunicación con RabbitMQ

import amqp, { Connection, Channel, Message } from 'amqplib';
import { config, events } from '../config/config';
import { logger } from '../utils/logger';
import { MetricsService } from './metricsService';

export interface MessageHandler {
  (data: any, message: Message, channel: Channel): Promise<void>;
}

export interface PublishOptions {
  persistent?: boolean;
  expiration?: string;
  priority?: number;
  correlationId?: string;
  replyTo?: string;
}

/**
 * Servicio de RabbitMQ para comunicación entre microservicios
 */
export class RabbitMQService {
  private static instance: RabbitMQService;
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private initialized: boolean = false;
  private subscribers: Map<string, MessageHandler> = new Map();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 5000;

  private constructor() {}

  /**
   * Singleton instance
   */
  public static getInstance(): RabbitMQService {
    if (!RabbitMQService.instance) {
      RabbitMQService.instance = new RabbitMQService();
    }
    return RabbitMQService.instance;
  }

  /**
   * Inicializar conexión a RabbitMQ
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      logger.info('🐰 Connecting to RabbitMQ...');
      
      // Crear conexión
      this.connection = await amqp.connect(config.RABBITMQ_URL);
      
      // Crear canal
      this.channel = await this.connection.createChannel();
      
      // Configurar prefetch para control de flujo
      await this.channel.prefetch(10);
      
      // Declarar exchange principal
      await this.channel.assertExchange(config.RABBITMQ_EXCHANGE, 'topic', {
        durable: true
      });
      
      // Declarar cola principal
      await this.channel.assertQueue(config.RABBITMQ_QUEUE, {
        durable: true,
        arguments: {
          'x-message-ttl': 3600000, // 1 hora
          'x-max-length': 10000,
          'x-overflow': 'reject-publish'
        }
      });
      
      // Configurar manejo de errores
      this.setupErrorHandlers();
      
      this.initialized = true;
      this.reconnectAttempts = 0;
      
      logger.info('✅ RabbitMQ connected successfully');
      
    } catch (error) {
      logger.error('❌ Failed to connect to RabbitMQ:', error);
      await this.handleConnectionError(error);
    }
  }

  /**
   * Configurar manejo de errores de conexión
   */
  private setupErrorHandlers(): void {
    if (!this.connection || !this.channel) {
      return;
    }

    this.connection.on('error', (error) => {
      logger.error('RabbitMQ connection error:', error);
      this.handleConnectionError(error);
    });

    this.connection.on('close', () => {
      logger.warn('RabbitMQ connection closed');
      this.initialized = false;
      this.scheduleReconnect();
    });

    this.channel.on('error', (error) => {
      logger.error('RabbitMQ channel error:', error);
    });

    this.channel.on('close', () => {
      logger.warn('RabbitMQ channel closed');
    });
  }

  /**
   * Manejar errores de conexión
   */
  private async handleConnectionError(error: any): Promise<void> {
    this.initialized = false;
    this.connection = null;
    this.channel = null;
    
    MetricsService.incrementCounter('rabbitmq_connection_errors_total');
    
    this.scheduleReconnect();
  }

  /**
   * Programar reconexión
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached. Giving up.');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, Math.min(this.reconnectAttempts - 1, 5));
    
    logger.info(`Scheduling RabbitMQ reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    setTimeout(async () => {
      try {
        await this.initialize();
        
        // Reestablecer suscripciones
        await this.reestablishSubscriptions();
        
      } catch (error) {
        logger.error('Reconnection attempt failed:', error);
        this.scheduleReconnect();
      }
    }, delay);
  }

  /**
   * Reestablecer suscripciones después de reconexión
   */
  private async reestablishSubscriptions(): Promise<void> {
    logger.info('Reestablishing RabbitMQ subscriptions...');
    
    for (const [eventType, handler] of this.subscribers.entries()) {
      try {
        await this.subscribe(eventType, handler);
        logger.debug(`Reestablished subscription for ${eventType}`);
      } catch (error) {
        logger.error(`Failed to reestablish subscription for ${eventType}:`, error);
      }
    }
  }

  /**
   * Publicar mensaje
   */
  public async publish(
    eventType: string, 
    data: any, 
    options: PublishOptions = {}
  ): Promise<boolean> {
    if (!this.initialized || !this.channel) {
      logger.error('RabbitMQ not initialized, cannot publish message');
      return false;
    }

    try {
      const message = {
        eventType,
        data,
        timestamp: new Date().toISOString(),
        service: 'permission-service',
        correlationId: options.correlationId || this.generateCorrelationId(),
        metadata: {
          version: '1.0.0',
          environment: config.NODE_ENV
        }
      };

      const publishOptions = {
        persistent: options.persistent !== false,
        expiration: options.expiration,
        priority: options.priority || 0,
        correlationId: message.correlationId,
        replyTo: options.replyTo,
        timestamp: Date.now(),
        headers: {
          'x-service': 'permission-service',
          'x-event-type': eventType
        }
      };

      const success = this.channel.publish(
        config.RABBITMQ_EXCHANGE,
        eventType,
        Buffer.from(JSON.stringify(message)),
        publishOptions
      );

      if (success) {
        logger.debug(`Published message: ${eventType}`, {
          correlationId: message.correlationId,
          dataSize: JSON.stringify(data).length
        });
        
        MetricsService.incrementCounter('rabbitmq_messages_published_total', {
          event_type: eventType,
          status: 'success'
        });
      } else {
        logger.warn('Failed to publish message to RabbitMQ');
        MetricsService.incrementCounter('rabbitmq_messages_published_total', {
          event_type: eventType,
          status: 'failed'
        });
      }

      return success;

    } catch (error) {
      logger.error('Error publishing message to RabbitMQ:', error);
      MetricsService.incrementCounter('rabbitmq_publish_errors_total', {
        event_type: eventType
      });
      return false;
    }
  }

  /**
   * Suscribirse a eventos
   */
  public async subscribe(eventType: string, handler: MessageHandler): Promise<void> {
    if (!this.initialized || !this.channel) {
      logger.error('RabbitMQ not initialized, cannot subscribe');
      return;
    }

    try {
      // Guardar handler para reconexiones
      this.subscribers.set(eventType, handler);

      // Crear cola específica para este tipo de evento
      const queueName = `permission-service.${eventType}`;
      
      await this.channel.assertQueue(queueName, {
        durable: true,
        exclusive: false,
        autoDelete: false,
        arguments: {
          'x-message-ttl': 3600000, // 1 hora
          'x-max-length': 1000
        }
      });

      // Vincular cola al exchange
      await this.channel.bindQueue(queueName, config.RABBITMQ_EXCHANGE, eventType);

      // Configurar consumidor
      await this.channel.consume(queueName, async (message) => {
        if (!message) {
          return;
        }

        const startTime = Date.now();

        try {
          const content = JSON.parse(message.content.toString());
          
          logger.debug(`Received message: ${eventType}`, {
            correlationId: content.correlationId,
            timestamp: content.timestamp
          });

          // Ejecutar handler
          await handler(content.data, message, this.channel!);

          // ACK del mensaje
          this.channel!.ack(message);

          // Métricas
          MetricsService.incrementCounter('rabbitmq_messages_processed_total', {
            event_type: eventType,
            status: 'success'
          });

          MetricsService.observeHistogram('rabbitmq_message_processing_duration_seconds', 
            (Date.now() - startTime) / 1000,
            { event_type: eventType }
          );

        } catch (error) {
          logger.error(`Error processing message ${eventType}:`, error);

          // NACK del mensaje (requeue si no es error permanente)
          const requeue = this.shouldRequeue(error);
          this.channel!.nack(message, false, requeue);

          MetricsService.incrementCounter('rabbitmq_messages_processed_total', {
            event_type: eventType,
            status: 'error'
          });
        }
      });

      logger.info(`Subscribed to RabbitMQ event: ${eventType}`);

    } catch (error) {
      logger.error(`Error subscribing to ${eventType}:`, error);
      throw error;
    }
  }

  /**
   * Determinar si un mensaje debe ser reencolado
   */
  private shouldRequeue(error: any): boolean {
    // No reencolar errores de validación o lógica de negocio
    const nonRetryableErrors = [
      'ValidationError',
      'AuthenticationError',
      'AuthorizationError'
    ];

    return !nonRetryableErrors.includes(error.name);
  }

  /**
   * Publicar evento específico de permisos
   */
  public async publishPermissionEvent(
    eventType: keyof typeof events,
    data: any,
    correlationId?: string
  ): Promise<boolean> {
    const eventName = events[eventType];
    return this.publish(eventName, data, { correlationId });
  }

  /**
   * Enviar respuesta directa a un servicio
   */
  public async sendDirectMessage(
    targetService: string,
    data: any,
    correlationId?: string
  ): Promise<boolean> {
    const routingKey = `direct.${targetService}`;
    return this.publish(routingKey, data, { correlationId });
  }

  /**
   * Solicitar respuesta de otro servicio (RPC pattern)
   */
  public async requestResponse<T>(
    targetService: string,
    data: any,
    timeout: number = 30000
  ): Promise<T> {
    if (!this.initialized || !this.channel) {
      throw new Error('RabbitMQ not initialized');
    }

    return new Promise(async (resolve, reject) => {
      const correlationId = this.generateCorrelationId();
      
      // Crear cola temporal para respuesta
      const replyQueue = await this.channel!.assertQueue('', {
        exclusive: true,
        autoDelete: true
      });

      // Timeout
      const timeoutHandle = setTimeout(() => {
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      // Consumir respuesta
      await this.channel!.consume(replyQueue.queue, (message) => {
        if (!message) {
          return;
        }

        if (message.properties.correlationId === correlationId) {
          clearTimeout(timeoutHandle);
          
          try {
            const response = JSON.parse(message.content.toString());
            this.channel!.ack(message);
            resolve(response.data);
          } catch (error) {
            reject(new Error('Invalid response format'));
          }
        }
      }, { noAck: false });

      // Enviar solicitud
      const success = await this.publish(`rpc.${targetService}`, data, {
        correlationId,
        replyTo: replyQueue.queue
      });

      if (!success) {
        clearTimeout(timeoutHandle);
        reject(new Error('Failed to send request'));
      }
    });
  }

  /**
   * Generar ID de correlación único
   */
  private generateCorrelationId(): string {
    return `perm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Obtener estadísticas de RabbitMQ
   */
  public getStats(): any {
    return {
      initialized: this.initialized,
      connected: this.connection !== null && !this.connection.connection.destroyed,
      channelOpen: this.channel !== null,
      subscriptions: this.subscribers.size,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  /**
   * Health check
   */
  public healthCheck(): boolean {
    return this.initialized && 
           this.connection !== null && 
           !this.connection.connection.destroyed &&
           this.channel !== null;
  }

  /**
   * Cerrar conexión
   */
  public async close(): Promise<void> {
    try {
      logger.info('Closing RabbitMQ connection...');
      
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      
      this.initialized = false;
      this.subscribers.clear();
      
      logger.info('RabbitMQ connection closed');
      
    } catch (error) {
      logger.error('Error closing RabbitMQ connection:', error);
    }
  }

  /**
   * Limpiar cola específica
   */
  public async purgeQueue(queueName: string): Promise<number> {
    if (!this.initialized || !this.channel) {
      throw new Error('RabbitMQ not initialized');
    }

    try {
      const result = await this.channel.purgeQueue(queueName);
      logger.info(`Purged ${result.messageCount} messages from queue ${queueName}`);
      return result.messageCount;
    } catch (error) {
      logger.error(`Error purging queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Obtener información de cola
   */
  public async getQueueInfo(queueName: string): Promise<any> {
    if (!this.initialized || !this.channel) {
      throw new Error('RabbitMQ not initialized');
    }

    try {
      return await this.channel.checkQueue(queueName);
    } catch (error) {
      logger.error(`Error getting queue info for ${queueName}:`, error);
      return null;
    }
  }

  /**
   * Configurar dead letter queue
   */
  public async setupDeadLetterQueue(queueName: string): Promise<void> {
    if (!this.initialized || !this.channel) {
      throw new Error('RabbitMQ not initialized');
    }

    try {
      const dlqName = `${queueName}.dlq`;
      const dlxName = `${queueName}.dlx`;

      // Crear exchange para DLQ
      await this.channel.assertExchange(dlxName, 'direct', { durable: true });

      // Crear DLQ
      await this.channel.assertQueue(dlqName, {
        durable: true,
        arguments: {
          'x-message-ttl': 86400000 // 24 horas
        }
      });

      // Vincular DLQ al DLX
      await this.channel.bindQueue(dlqName, dlxName, '');

      logger.info(`Dead letter queue configured for ${queueName}`);

    } catch (error) {
      logger.error(`Error setting up dead letter queue for ${queueName}:`, error);
      throw error;
    }
  }
}

export default RabbitMQService;