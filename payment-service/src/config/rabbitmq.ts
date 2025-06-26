import amqp, { Connection, Channel, ConsumeMessage } from 'amqplib';
import { logger } from '../utils/logger';
import { config } from './config';

// RabbitMQ connection and channel
let connection: Connection | null = null;
let channel: Channel | null = null;

// Queue configurations
const QUEUES = {
  PAYMENT_CREATED: `${config.rabbitmq.queuePrefix}.payment.created`,
  PAYMENT_COMPLETED: `${config.rabbitmq.queuePrefix}.payment.completed`,
  PAYMENT_FAILED: `${config.rabbitmq.queuePrefix}.payment.failed`,
  PAYMENT_REFUNDED: `${config.rabbitmq.queuePrefix}.payment.refunded`,
  WEBHOOK_RECEIVED: `${config.rabbitmq.queuePrefix}.webhook.received`,
  RECONCILIATION: `${config.rabbitmq.queuePrefix}.reconciliation`,
};

// Exchange configuration
const EXCHANGE = config.rabbitmq.exchange;
const EXCHANGE_TYPE = 'topic';

// Routing keys
const ROUTING_KEYS = {
  PAYMENT_CREATED: 'payment.created',
  PAYMENT_COMPLETED: 'payment.completed',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_REFUNDED: 'payment.refunded',
  WEBHOOK_RECEIVED: 'webhook.received',
  RECONCILIATION_NEEDED: 'reconciliation.needed',
};

// Connect to RabbitMQ
export const connectRabbitMQ = async (): Promise<void> => {
  try {
    // Create connection
    connection = await amqp.connect(config.rabbitmq.url);
    
    // Handle connection events
    connection.on('error', (error) => {
      logger.error('RabbitMQ connection error:', error);
    });
    
    connection.on('close', () => {
      logger.warn('RabbitMQ connection closed');
      // Attempt to reconnect after 5 seconds
      setTimeout(() => {
        connectRabbitMQ().catch(err => {
          logger.error('Failed to reconnect to RabbitMQ:', err);
        });
      }, 5000);
    });

    // Create channel
    channel = await connection.createChannel();
    
    // Set prefetch for fair dispatch
    await channel.prefetch(10);
    
    // Assert exchange
    await channel.assertExchange(EXCHANGE, EXCHANGE_TYPE, {
      durable: true,
    });

    // Assert and bind queues
    await setupQueues();
    
    logger.info('RabbitMQ connected and configured successfully');
  } catch (error) {
    logger.error('Failed to connect to RabbitMQ:', error);
    throw error;
  }
};

// Setup queues
const setupQueues = async (): Promise<void> => {
  if (!channel) throw new Error('RabbitMQ channel not initialized');

  // Assert all queues
  for (const [key, queueName] of Object.entries(QUEUES)) {
    await channel.assertQueue(queueName, {
      durable: true,
      arguments: {
        'x-message-ttl': 86400000, // 24 hours
        'x-max-length': 10000,
      },
    });
  }

  // Bind queues to exchange with routing keys
  await channel.bindQueue(QUEUES.PAYMENT_CREATED, EXCHANGE, ROUTING_KEYS.PAYMENT_CREATED);
  await channel.bindQueue(QUEUES.PAYMENT_COMPLETED, EXCHANGE, ROUTING_KEYS.PAYMENT_COMPLETED);
  await channel.bindQueue(QUEUES.PAYMENT_FAILED, EXCHANGE, ROUTING_KEYS.PAYMENT_FAILED);
  await channel.bindQueue(QUEUES.PAYMENT_REFUNDED, EXCHANGE, ROUTING_KEYS.PAYMENT_REFUNDED);
  await channel.bindQueue(QUEUES.WEBHOOK_RECEIVED, EXCHANGE, ROUTING_KEYS.WEBHOOK_RECEIVED);
  await channel.bindQueue(QUEUES.RECONCILIATION, EXCHANGE, ROUTING_KEYS.RECONCILIATION_NEEDED);
};

// Disconnect from RabbitMQ
export const disconnectRabbitMQ = async (): Promise<void> => {
  try {
    if (channel) {
      await channel.close();
      channel = null;
    }
    if (connection) {
      await connection.close();
      connection = null;
    }
    logger.info('RabbitMQ connection closed');
  } catch (error) {
    logger.error('Error closing RabbitMQ connection:', error);
    throw error;
  }
};

// Check RabbitMQ health
export const checkRabbitMQHealth = async (): Promise<boolean> => {
  try {
    if (!connection || !channel) return false;
    
    // Try to check a queue
    await channel.checkQueue(QUEUES.PAYMENT_CREATED);
    return true;
  } catch (error) {
    logger.error('RabbitMQ health check failed:', error);
    return false;
  }
};

// Message publisher
export const publisher = {
  // Publish payment created event
  paymentCreated: async (data: any): Promise<void> => {
    await publish(ROUTING_KEYS.PAYMENT_CREATED, data);
  },

  // Publish payment completed event
  paymentCompleted: async (data: any): Promise<void> => {
    await publish(ROUTING_KEYS.PAYMENT_COMPLETED, data);
  },

  // Publish payment failed event
  paymentFailed: async (data: any): Promise<void> => {
    await publish(ROUTING_KEYS.PAYMENT_FAILED, data);
  },

  // Publish payment refunded event
  paymentRefunded: async (data: any): Promise<void> => {
    await publish(ROUTING_KEYS.PAYMENT_REFUNDED, data);
  },

  // Publish webhook received event
  webhookReceived: async (data: any): Promise<void> => {
    await publish(ROUTING_KEYS.WEBHOOK_RECEIVED, data);
  },

  // Publish reconciliation needed event
  reconciliationNeeded: async (data: any): Promise<void> => {
    await publish(ROUTING_KEYS.RECONCILIATION_NEEDED, data);
  },
};

// Generic publish function
const publish = async (routingKey: string, data: any): Promise<void> => {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized');
  }

  try {
    const message = Buffer.from(JSON.stringify({
      ...data,
      timestamp: new Date().toISOString(),
      service: config.serviceName,
    }));

    const published = channel.publish(
      EXCHANGE,
      routingKey,
      message,
      {
        persistent: true,
        contentType: 'application/json',
        timestamp: Date.now(),
      }
    );

    if (!published) {
      logger.warn(`RabbitMQ buffer full for routing key: ${routingKey}`);
      // Handle backpressure
      await new Promise(resolve => channel!.once('drain', resolve));
    }

    logger.debug(`Message published to ${routingKey}`);
  } catch (error) {
    logger.error(`Error publishing message to ${routingKey}:`, error);
    throw error;
  }
};

// Message consumer
export const consumer = {
  // Consume messages from a queue
  consume: async (
    queueKey: keyof typeof QUEUES,
    handler: (msg: ConsumeMessage) => Promise<void>,
    options?: { noAck?: boolean }
  ): Promise<void> => {
    if (!channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    const queueName = QUEUES[queueKey];
    
    try {
      await channel.consume(
        queueName,
        async (msg) => {
          if (!msg) return;

          try {
            logger.debug(`Message received from ${queueName}`);
            await handler(msg);
            
            // Acknowledge message if not in noAck mode
            if (!options?.noAck && channel) {
              channel.ack(msg);
            }
          } catch (error) {
            logger.error(`Error processing message from ${queueName}:`, error);
            
            // Reject and requeue message on error
            if (!options?.noAck && channel) {
              channel.nack(msg, false, true);
            }
          }
        },
        { noAck: options?.noAck || false }
      );

      logger.info(`Consumer started for queue: ${queueName}`);
    } catch (error) {
      logger.error(`Error starting consumer for ${queueName}:`, error);
      throw error;
    }
  },

  // Parse message content
  parseMessage: <T>(msg: ConsumeMessage): T => {
    try {
      return JSON.parse(msg.content.toString()) as T;
    } catch (error) {
      logger.error('Error parsing message content:', error);
      throw new Error('Invalid message format');
    }
  },
};

// RabbitMQ utilities
export const rabbitmq = {
  isConnected: (): boolean => {
    return connection !== null && channel !== null;
  },

  getConnection: (): Connection | null => {
    return connection;
  },

  getChannel: (): Channel | null => {
    return channel;
  },

  // Retry failed messages
  retryMessage: async (
    msg: ConsumeMessage,
    retryCount: number = 0,
    maxRetries: number = 3
  ): Promise<void> => {
    if (!channel) return;

    if (retryCount < maxRetries) {
      // Requeue with delay
      setTimeout(() => {
        channel!.nack(msg, false, true);
      }, Math.pow(2, retryCount) * 1000); // Exponential backoff
    } else {
      // Move to dead letter queue after max retries
      logger.error('Message exceeded max retries, moving to DLQ');
      channel.nack(msg, false, false);
    }
  },

  // Get queue statistics
  getQueueStats: async (queueKey: keyof typeof QUEUES): Promise<any> => {
    if (!channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    try {
      const queueName = QUEUES[queueKey];
      const info = await channel.checkQueue(queueName);
      return {
        name: queueName,
        messages: info.messageCount,
        consumers: info.consumerCount,
      };
    } catch (error) {
      logger.error(`Error getting queue stats for ${queueKey}:`, error);
      throw error;
    }
  },
};

export { QUEUES, ROUTING_KEYS };