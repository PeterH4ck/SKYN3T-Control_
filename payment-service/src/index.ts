import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

// Import configuration
import { config } from './config/config';
import { connectDatabase } from './config/database';
import { connectRedis } from './config/redis';
import { connectRabbitMQ } from './config/rabbitmq';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { requestLogger } from './middleware/requestLogger';

// Import routes
import routes from './routes';

// Import services
import { initializePaymentProviders } from './services/providerService';
import { startWebhookListener } from './services/webhookService';
import { startMetricsServer } from './services/metricsService';
import { initializeCronJobs } from './services/cronService';

// Import utils
import { logger } from './utils/logger';

class PaymentService {
  private app: Application;
  private port: number;

  constructor() {
    this.app = express();
    this.port = config.port;
  }

  private async initializeMiddleware(): Promise<void> {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    }));

    // Body parsing
    this.app.use(bodyParser.json({ limit: '10mb' }));
    this.app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
    
    // Request logging
    this.app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
    this.app.use(requestLogger);

    // Rate limiting
    this.app.use('/api', rateLimiter);

    // Health check endpoint (no rate limiting)
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'ok',
        service: 'payment-service',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.env,
      });
    });

    // Readiness check
    this.app.get('/ready', async (req, res) => {
      try {
        // Check all connections
        const checks = await Promise.all([
          this.checkDatabase(),
          this.checkRedis(),
          this.checkRabbitMQ(),
        ]);

        const allHealthy = checks.every(check => check.healthy);

        res.status(allHealthy ? 200 : 503).json({
          ready: allHealthy,
          checks: {
            database: checks[0],
            redis: checks[1],
            rabbitmq: checks[2],
          },
        });
      } catch (error) {
        res.status(503).json({ ready: false, error: 'Health check failed' });
      }
    });
  }

  private async checkDatabase(): Promise<{ healthy: boolean; message?: string }> {
    try {
      const sequelize = (await import('./config/database')).sequelize;
      await sequelize.authenticate();
      return { healthy: true };
    } catch (error) {
      return { healthy: false, message: 'Database connection failed' };
    }
  }

  private async checkRedis(): Promise<{ healthy: boolean; message?: string }> {
    try {
      const redis = (await import('./config/redis')).redis;
      await redis.ping();
      return { healthy: true };
    } catch (error) {
      return { healthy: false, message: 'Redis connection failed' };
    }
  }

  private async checkRabbitMQ(): Promise<{ healthy: boolean; message?: string }> {
    try {
      const rabbitmq = (await import('./config/rabbitmq')).rabbitmq;
      return { healthy: rabbitmq.isConnected(), message: rabbitmq.isConnected() ? undefined : 'RabbitMQ not connected' };
    } catch (error) {
      return { healthy: false, message: 'RabbitMQ connection failed' };
    }
  }

  private initializeRoutes(): void {
    // Mount API routes
    this.app.use('/api/v1', routes);

    // Error handlers (must be last)
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  private async initializeConnections(): Promise<void> {
    try {
      // Database connection
      logger.info('Connecting to database...');
      await connectDatabase();
      logger.info('Database connected successfully');

      // Redis connection
      logger.info('Connecting to Redis...');
      await connectRedis();
      logger.info('Redis connected successfully');

      // RabbitMQ connection
      logger.info('Connecting to RabbitMQ...');
      await connectRabbitMQ();
      logger.info('RabbitMQ connected successfully');

      // Initialize payment providers
      logger.info('Initializing payment providers...');
      await initializePaymentProviders();
      logger.info('Payment providers initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize connections:', error);
      throw error;
    }
  }

  private async startBackgroundServices(): Promise<void> {
    try {
      // Start webhook listener
      logger.info('Starting webhook listener...');
      await startWebhookListener();

      // Start metrics server if enabled
      if (config.enableMetrics) {
        logger.info('Starting metrics server...');
        await startMetricsServer();
      }

      // Initialize cron jobs
      logger.info('Initializing cron jobs...');
      await initializeCronJobs();

      logger.info('Background services started successfully');
    } catch (error) {
      logger.error('Failed to start background services:', error);
      throw error;
    }
  }

  public async start(): Promise<void> {
    try {
      logger.info('Starting Payment Service...');

      // Initialize connections
      await this.initializeConnections();

      // Initialize middleware
      await this.initializeMiddleware();

      // Initialize routes
      this.initializeRoutes();

      // Start background services
      await this.startBackgroundServices();

      // Start server
      this.app.listen(this.port, () => {
        logger.info(`Payment Service is running on port ${this.port}`);
        logger.info(`Environment: ${config.env}`);
        logger.info(`API URL: http://localhost:${this.port}/api/v1`);
      });

      // Graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('Failed to start Payment Service:', error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

    signals.forEach((signal) => {
      process.on(signal, async () => {
        logger.info(`Received ${signal}, starting graceful shutdown...`);

        try {
          // Stop accepting new requests
          logger.info('Closing HTTP server...');
          
          // Close database connections
          logger.info('Closing database connection...');
          const sequelize = (await import('./config/database')).sequelize;
          await sequelize.close();

          // Close Redis connection
          logger.info('Closing Redis connection...');
          const redis = (await import('./config/redis')).redis;
          await redis.quit();

          // Close RabbitMQ connection
          logger.info('Closing RabbitMQ connection...');
          const rabbitmq = (await import('./config/rabbitmq')).rabbitmq;
          await rabbitmq.close();

          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown:', error);
          process.exit(1);
        }
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  }
}

// Start the service
const paymentService = new PaymentService();
paymentService.start();

export default PaymentService;