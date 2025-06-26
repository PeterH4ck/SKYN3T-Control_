// =====================================================
// LOGGER - PERMISSION SERVICE
// =====================================================
// Sistema de logging configurado con Winston

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from '../config/config';

// Definir niveles de log personalizados
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Colores para consola
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'cyan'
};

// Agregar colores a winston
winston.addColors(logColors);

// Formato personalizado para logs
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    const { timestamp, level, message, service = 'permission-service', ...meta } = info;
    
    let logMessage = `${timestamp} [${service}] ${level.toUpperCase()}: ${message}`;
    
    // Agregar metadata si existe
    if (Object.keys(meta).length > 0) {
      logMessage += ` ${JSON.stringify(meta)}`;
    }
    
    return logMessage;
  })
);

// Formato para consola (más legible)
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    
    let logMessage = `${timestamp} ${level}: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      logMessage += ` ${JSON.stringify(meta, null, 2)}`;
    }
    
    return logMessage;
  })
);

// Configurar transports
const transports: winston.transport[] = [];

// Transport para consola (siempre activo en desarrollo)
if (config.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      level: config.LOG_LEVEL,
      format: consoleFormat
    })
  );
}

// Transport para archivos (en producción o si está habilitado)
if (config.LOG_TO_FILE || config.NODE_ENV === 'production') {
  // Logs generales con rotación diaria
  transports.push(
    new DailyRotateFile({
      filename: `${config.LOG_FILE_PATH}/permission-service-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      level: config.LOG_LEVEL,
      format: logFormat
    })
  );

  // Logs de errores separados
  transports.push(
    new DailyRotateFile({
      filename: `${config.LOG_FILE_PATH}/permission-service-error-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error',
      format: logFormat
    })
  );

  // Logs de auditoría separados
  transports.push(
    new DailyRotateFile({
      filename: `${config.LOG_FILE_PATH}/permission-service-audit-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '50m',
      maxFiles: '90d',
      level: 'info',
      format: logFormat,
      // Solo logs que contienen información de auditoría
      filter: (info) => info.audit === true
    })
  );
}

// Crear logger principal
const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  levels: logLevels,
  format: logFormat,
  defaultMeta: { 
    service: 'permission-service',
    version: '1.0.0',
    environment: config.NODE_ENV
  },
  transports,
  exitOnError: false
});

// Logger específico para auditoría
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf((info) => {
      return JSON.stringify({
        timestamp: info.timestamp,
        service: 'permission-service',
        type: 'audit',
        ...info
      });
    })
  ),
  defaultMeta: { audit: true },
  transports: [
    new DailyRotateFile({
      filename: `${config.LOG_FILE_PATH}/audit-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '50m',
      maxFiles: '90d'
    })
  ]
});

// Logger específico para métricas/performance
const metricsLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { 
    service: 'permission-service',
    type: 'metrics'
  },
  transports: [
    new DailyRotateFile({
      filename: `${config.LOG_FILE_PATH}/metrics-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '7d'
    })
  ]
});

// Funciones helper para logging estructurado
export const loggerHelpers = {
  /**
   * Log de operación de permisos
   */
  logPermissionOperation(operation: string, userId: string, details: any) {
    logger.info('Permission operation', {
      operation,
      userId,
      ...details,
      category: 'permission'
    });
  },

  /**
   * Log de operación de cache
   */
  logCacheOperation(operation: 'hit' | 'miss' | 'set' | 'delete', key: string, details?: any) {
    logger.debug('Cache operation', {
      operation,
      key,
      ...details,
      category: 'cache'
    });
  },

  /**
   * Log de propagación de permisos
   */
  logPropagation(type: string, target: string, affectedCount: number, duration: number) {
    logger.info('Permission propagation', {
      type,
      target,
      affectedCount,
      duration,
      category: 'propagation'
    });
  },

  /**
   * Log de auditoría
   */
  logAudit(action: string, userId: string, details: any) {
    auditLogger.info('Audit event', {
      action,
      userId,
      ...details,
      timestamp: new Date().toISOString()
    });
  },

  /**
   * Log de métricas de performance
   */
  logMetrics(metric: string, value: number, tags?: Record<string, string>) {
    metricsLogger.info('Performance metric', {
      metric,
      value,
      tags,
      timestamp: new Date().toISOString()
    });
  },

  /**
   * Log de error estructurado
   */
  logError(error: Error, context?: any) {
    logger.error('Application error', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      context,
      category: 'error'
    });
  },

  /**
   * Log de inicio/fin de operación
   */
  logOperation(operation: string, userId?: string) {
    const startTime = Date.now();
    
    logger.info(`Starting operation: ${operation}`, {
      operation,
      userId,
      category: 'operation',
      phase: 'start'
    });

    return {
      end: (result?: any, error?: Error) => {
        const duration = Date.now() - startTime;
        
        if (error) {
          logger.error(`Operation failed: ${operation}`, {
            operation,
            userId,
            duration,
            error: error.message,
            category: 'operation',
            phase: 'error'
          });
        } else {
          logger.info(`Operation completed: ${operation}`, {
            operation,
            userId,
            duration,
            result: typeof result === 'object' ? Object.keys(result || {}).length : result,
            category: 'operation',
            phase: 'complete'
          });
        }
      }
    };
  },

  /**
   * Log de request HTTP
   */
  logRequest(req: any, res: any, duration: number) {
    const { method, originalUrl, ip, headers } = req;
    const { statusCode } = res;
    
    logger.http('HTTP Request', {
      method,
      url: originalUrl,
      ip,
      statusCode,
      duration,
      userAgent: headers['user-agent'],
      userId: req.user?.id,
      category: 'http'
    });
  }
};

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    message: error.message,
    stack: error.stack,
    category: 'system'
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', {
    reason,
    promise: promise.toString(),
    category: 'system'
  });
});

// Stream para Morgan
export const morganStream = {
  write: (message: string) => {
    logger.http(message.trim());
  }
};

// Configurar nivel de log según el entorno
if (config.NODE_ENV === 'production') {
  logger.level = 'info';
} else if (config.NODE_ENV === 'test') {
  logger.level = 'error';
  // Silenciar logs en tests
  logger.transports.forEach((transport) => {
    transport.silent = true;
  });
}

export { logger, auditLogger, metricsLogger };
export default logger;