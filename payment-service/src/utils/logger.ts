import winston from 'winston';
import path from 'path';
import { config } from '../config/config';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  verbose: 'cyan',
  debug: 'blue',
  silly: 'gray',
};

// Add colors to winston
winston.addColors(colors);

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.align(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta, null, 2)}`;
    }
    return msg;
  })
);

// Create transports
const transports: winston.transport[] = [];

// Console transport
if (config.env !== 'test') {
  transports.push(
    new winston.transports.Console({
      format: config.env === 'development' ? consoleFormat : logFormat,
      level: config.env === 'development' ? 'debug' : 'info',
    })
  );
}

// File transports
if (config.env === 'production') {
  // Error log file
  transports.push(
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true,
      format: logFormat,
    })
  );

  // Combined log file
  transports.push(
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/combined.log'),
      level: 'info',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true,
      format: logFormat,
    })
  );

  // Payment specific log file
  transports.push(
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/payments.log'),
      level: 'info',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      tailable: true,
      format: logFormat,
      // Filter only payment related logs
      filter: (info) => {
        return info.message?.includes('payment') || 
               info.message?.includes('transaction') ||
               info.message?.includes('refund');
      },
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  levels,
  level: config.logging.level || 'info',
  format: logFormat,
  transports,
  defaultMeta: { service: config.serviceName },
  exitOnError: false,
});

// Add request context to logger
export const addRequestContext = (requestId: string, userId?: string) => {
  return logger.child({
    requestId,
    userId,
  });
};

// Log unhandled errors
if (config.env !== 'test') {
  logger.exceptions.handle(
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/exceptions.log'),
      maxsize: 10485760,
      maxFiles: 5,
    })
  );

  logger.rejections.handle(
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/rejections.log'),
      maxsize: 10485760,
      maxFiles: 5,
    })
  );
}

// Export logger
export { logger };

// Helper functions for structured logging
export const logPaymentEvent = (
  event: string,
  transactionId: string,
  provider: string,
  data: any
): void => {
  logger.info(`Payment event: ${event}`, {
    event,
    transactionId,
    provider,
    timestamp: new Date().toISOString(),
    ...data,
  });
};

export const logWebhookEvent = (
  provider: string,
  event: string,
  data: any
): void => {
  logger.info(`Webhook received: ${provider} - ${event}`, {
    webhook: true,
    provider,
    event,
    timestamp: new Date().toISOString(),
    ...data,
  });
};

export const logError = (
  error: Error,
  context: string,
  additionalData?: any
): void => {
  logger.error(`Error in ${context}`, {
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
    context,
    timestamp: new Date().toISOString(),
    ...additionalData,
  });
};

export const logMetric = (
  metric: string,
  value: number,
  tags?: Record<string, string>
): void => {
  logger.info(`Metric: ${metric}`, {
    metric,
    value,
    tags,
    timestamp: new Date().toISOString(),
  });
};