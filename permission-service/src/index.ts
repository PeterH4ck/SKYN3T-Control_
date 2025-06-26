// =====================================================
// PERMISSION SERVICE MAIN - SKYN3T ACCESS CONTROL
// =====================================================
// Motor de permisos granulares independiente

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

// Importar configuraciones
import { config } from './config/config';
import { logger } from './utils/logger';
import { connectDatabase } from './config/database';
import { connectRedis } from './config/redis';
import { connectRabbitMQ } from './config/rabbitmq';

// Importar rutas y middlewares
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { authMiddleware } from './middleware/auth';

// Importar servicios
import { PermissionEngine } from './core/permissionEngine';
import { PermissionPropagator } from './core/permissionPropagator';
import { CacheService } from './services/cacheService';
import { MetricsService } from './services/metricsService';

// Crear aplicación Express
const app = express();

// =====================================================
// CONFIGURACIÓN DE MIDDLEWARES
// =====================================================

// Seguridad
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS
const corsOptions = {
  origin: function (origin: any, callback: any) {
    const allowedOrigins = [
      config.FRONTEND_URL,
      'http://localhost:3000',
      'http://localhost:80'
    ].filter(Boolean);

    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Community-ID']
};

app.use(cors(corsOptions));

// Compresión
app.use(compression());

// Logging
if (config.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: {
      write: (message: string) => logger.info(message.trim())
    }
  }));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000, // Más permisivo para servicios internos
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// =====================================================
// HEALTH CHECK Y MÉTRICAS
// =====================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'permission-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.NODE_ENV,
    connections: {
      database: 'connected', // TODO: Check real status
      redis: 'connected',
      rabbitmq: 'connected'
    }
  });
});

// Métricas Prometheus
app.get('/metrics', async (req, res) => {
  try {
    const metrics = await MetricsService.getMetrics();
    res.set('Content-Type', 'text/plain');
    res.send(metrics);
  } catch (error) {
    logger.error('Error getting metrics:', error);
    res.status(500).send('Error getting metrics');
  }
});

// =====================================================
// RUTAS DE LA API
// =====================================================

// Aplicar autenticación a todas las rutas API
app.use('/api/v1', authMiddleware);

// Rutas principales
app.use('/api/v1', routes);

// =====================================================
// MANEJO DE ERRORES
// =====================================================

app.use(notFoundHandler);
app.use(errorHandler);

// =====================================================
// INICIALIZACIÓN DE SERVICIOS
// =====================================================

async function initializeServices() {
  try {
    logger.info('🚀 Starting Permission Service...');

    // Conectar a la base de datos
    logger.info('📦 Connecting to database...');
    await connectDatabase();
    logger.info('✅ Database connected');

    // Conectar a Redis
    logger.info('📦 Connecting to Redis...');
    await connectRedis();
    logger.info('✅ Redis connected');

    // Conectar a RabbitMQ
    logger.info('📦 Connecting to RabbitMQ...');
    await connectRabbitMQ();
    logger.info('✅ RabbitMQ connected');

    // Inicializar motor de permisos
    logger.info('⚙️ Initializing Permission Engine...');
    await PermissionEngine.initialize();
    logger.info('✅ Permission Engine initialized');

    // Inicializar propagador de permisos
    logger.info('⚙️ Initializing Permission Propagator...');
    await PermissionPropagator.initialize();
    logger.info('✅ Permission Propagator initialized');

    // Inicializar servicio de caché
    logger.info('⚙️ Initializing Cache Service...');
    await CacheService.initialize();
    logger.info('✅ Cache Service initialized');

    // Inicializar métricas
    logger.info('⚙️ Initializing Metrics Service...');
    MetricsService.initialize();
    logger.info('✅ Metrics Service initialized');

    logger.info('🎉 All services initialized successfully');

  } catch (error) {
    logger.error('❌ Failed to initialize services:', error);
    process.exit(1);
  }
}

// =====================================================
// INICIO DEL SERVIDOR
// =====================================================

async function startServer() {
  try {
    await initializeServices();

    const server = app.listen(config.PORT, () => {
      logger.info(`
🚀 Permission Service is running!
┌─────────────────────────────────────────┐
│  Port: ${config.PORT}                           │
│  Environment: ${config.NODE_ENV}               │
│  Version: 1.0.0                         │
│  Process ID: ${process.pid}                     │
└─────────────────────────────────────────┘
      `);
    });

    // Graceful shutdown
    const gracefulShutdown = (signal: string) => {
      logger.info(`📥 Received ${signal}. Starting graceful shutdown...`);
      
      server.close(async () => {
        logger.info('🔌 HTTP server closed');
        
        try {
          // Cerrar conexiones
          await CacheService.disconnect();
          logger.info('🔌 Redis disconnected');
          
          // Cerrar RabbitMQ
          // await rabbitMQ.disconnect();
          logger.info('🔌 RabbitMQ disconnected');
          
          logger.info('✅ Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('❌ Error during shutdown:', error);
          process.exit(1);
        }
      });
    };

    // Capturar señales
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Capturar errores no manejados
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('unhandledRejection');
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      gracefulShutdown('uncaughtException');
    });

    return server;

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Iniciar servidor si no está en modo test
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app, startServer };