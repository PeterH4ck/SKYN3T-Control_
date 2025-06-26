// =====================================================
// ERROR HANDLER MIDDLEWARE - PERMISSION SERVICE
// =====================================================
// Middleware centralizado para manejo de errores

import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorUtils } from '../utils/AppError';
import { logger } from '../utils/logger';
import { config } from '../config/config';
import { MetricsService } from '../services/metricsService';

/**
 * Middleware principal de manejo de errores
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    // Convertir error a AppError si es necesario
    const appError = ErrorUtils.toAppError(err);
    
    // Incrementar métricas de errores
    MetricsService.incrementCounter('errors_total', {
      code: appError.code,
      status_code: appError.statusCode.toString(),
      endpoint: req.route?.path || req.path,
      method: req.method
    });

    // Log del error
    logError(appError, req);

    // Preparar respuesta
    const errorResponse = prepareErrorResponse(appError, req);

    // Enviar respuesta
    res.status(appError.statusCode).json(errorResponse);

  } catch (handlerError) {
    // Si el error handler falla, enviar respuesta genérica
    logger.error('Error in error handler:', handlerError);
    
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        code: 'HANDLER_ERROR',
        timestamp: new Date().toISOString()
      }
    });
  }
}

/**
 * Registrar error en logs
 */
function logError(error: AppError, req: Request): void {
  const errorContext = {
    message: error.message,
    code: error.code,
    statusCode: error.statusCode,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    body: req.method !== 'GET' ? sanitizeRequestBody(req.body) : undefined,
    query: req.query,
    params: req.params,
    details: error.details,
    timestamp: error.timestamp,
    correlationId: req.headers['x-correlation-id'] || generateCorrelationId()
  };

  // Determinar nivel de log basado en el código de estado
  if (error.statusCode >= 500) {
    logger.error('Server error occurred', errorContext);
  } else if (error.statusCode >= 400) {
    logger.warn('Client error occurred', errorContext);
  } else {
    logger.info('Non-error response with error handler', errorContext);
  }

  // Log adicional para errores críticos
  if (error.statusCode >= 500 && error.isOperational === false) {
    logger.error('CRITICAL ERROR - Potential system issue', {
      ...errorContext,
      critical: true,
      requiresAttention: true
    });
  }
}

/**
 * Preparar respuesta de error
 */
function prepareErrorResponse(error: AppError, req: Request): any {
  const baseResponse = {
    success: false,
    error: {
      message: error.message,
      code: error.code,
      timestamp: error.timestamp.toISOString()
    },
    path: req.originalUrl,
    method: req.method
  };

  // En desarrollo, incluir más detalles
  if (config.NODE_ENV === 'development') {
    return {
      ...baseResponse,
      error: {
        ...baseResponse.error,
        stack: error.stack,
        details: error.details
      }
    };
  }

  // En producción, solo incluir stack para errores no operacionales
  if (config.NODE_ENV === 'production') {
    const response = { ...baseResponse };
    
    // Solo incluir detalles para errores operacionales específicos
    if (error.isOperational && shouldIncludeDetails(error)) {
      response.error = {
        ...response.error,
        ...(error.details && { details: sanitizeErrorDetails(error.details) })
      };
    }

    return response;
  }

  // Entorno de staging u otros
  return {
    ...baseResponse,
    error: {
      ...baseResponse.error,
      ...(error.details && { details: sanitizeErrorDetails(error.details) })
    }
  };
}

/**
 * Determinar si se deben incluir detalles del error
 */
function shouldIncludeDetails(error: AppError): boolean {
  // Incluir detalles para errores de validación y autenticación
  const detailWhitelist = [
    'VALIDATION_ERROR',
    'AUTHENTICATION_REQUIRED',
    'AUTHORIZATION_FAILED',
    'PERMISSION_DENIED',
    'RATE_LIMIT_EXCEEDED',
    'NOT_FOUND'
  ];

  return detailWhitelist.includes(error.code);
}

/**
 * Sanitizar detalles del error para producción
 */
function sanitizeErrorDetails(details: any): any {
  if (!details || typeof details !== 'object') {
    return details;
  }

  const sensitiveFields = [
    'password',
    'token',
    'secret',
    'key',
    'authorization',
    'cookie',
    'session'
  ];

  const sanitized = { ...details };

  // Remover campos sensibles
  Object.keys(sanitized).forEach(key => {
    const lowerKey = key.toLowerCase();
    if (sensitiveFields.some(field => lowerKey.includes(field))) {
      sanitized[key] = '[REDACTED]';
    }
  });

  return sanitized;
}

/**
 * Sanitizar cuerpo de la petición
 */
function sanitizeRequestBody(body: any): any {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sensitiveFields = [
    'password',
    'currentPassword',
    'newPassword',
    'token',
    'refreshToken',
    'secret',
    'apiKey',
    'authorization'
  ];

  const sanitized = { ...body };

  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });

  return sanitized;
}

/**
 * Generar ID de correlación único
 */
function generateCorrelationId(): string {
  return `perm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Middleware para manejo de errores asíncronos
 */
export function asyncErrorHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Middleware para manejo de errores no capturados
 */
export function unhandledErrorHandler(): void {
  // Manejo de promesas rechazadas no capturadas
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Rejection', {
      reason: reason?.message || reason,
      stack: reason?.stack,
      promise: promise.toString(),
      category: 'unhandled'
    });

    // En producción, terminar el proceso de forma elegante
    if (config.NODE_ENV === 'production') {
      logger.error('Terminating process due to unhandled rejection');
      process.exit(1);
    }
  });

  // Manejo de excepciones no capturadas
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      category: 'uncaught'
    });

    // Siempre terminar el proceso para excepciones no capturadas
    logger.error('Terminating process due to uncaught exception');
    process.exit(1);
  });

  // Manejo de señales de terminación
  ['SIGTERM', 'SIGINT'].forEach(signal => {
    process.on(signal, () => {
      logger.info(`Received ${signal}, starting graceful shutdown`);
      
      // Permitir tiempo para completar requests en curso
      setTimeout(() => {
        logger.info('Graceful shutdown completed');
        process.exit(0);
      }, 5000);
    });
  });
}

/**
 * Middleware para errores de JSON malformado
 */
export function jsonErrorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof SyntaxError && 'body' in err) {
    logger.warn('Invalid JSON in request body', {
      url: req.originalUrl,
      method: req.method,
      error: err.message,
      ip: req.ip
    });

    const appError = new AppError(
      'Invalid JSON in request body',
      400,
      'INVALID_JSON',
      { originalError: err.message }
    );

    return errorHandler(appError, req, res, next);
  }

  next(err);
}

/**
 * Middleware para errores 404 (debe ir antes del error handler)
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const error = new AppError(
    `Route ${req.method} ${req.originalUrl} not found`,
    404,
    'ROUTE_NOT_FOUND',
    {
      method: req.method,
      url: req.originalUrl,
      availableRoutes: [] // Se podría poblarse con rutas disponibles
    }
  );

  next(error);
}

/**
 * Middleware para timeout de requests
 */
export function timeoutHandler(timeoutMs: number = 30000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        const error = new AppError(
          `Request timeout after ${timeoutMs}ms`,
          408,
          'REQUEST_TIMEOUT',
          {
            timeout: timeoutMs,
            url: req.originalUrl,
            method: req.method
          }
        );

        next(error);
      }
    }, timeoutMs);

    // Limpiar timeout cuando la respuesta se envía
    res.on('finish', () => {
      clearTimeout(timeout);
    });

    res.on('close', () => {
      clearTimeout(timeout);
    });

    next();
  };
}

/**
 * Middleware de validación de headers requeridos
 */
export function validateRequiredHeaders(requiredHeaders: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const missingHeaders = requiredHeaders.filter(
      header => !req.headers[header.toLowerCase()]
    );

    if (missingHeaders.length > 0) {
      const error = new AppError(
        `Missing required headers: ${missingHeaders.join(', ')}`,
        400,
        'MISSING_HEADERS',
        { missingHeaders }
      );

      return next(error);
    }

    next();
  };
}

// Configurar manejo de errores no capturados al importar el módulo
unhandledErrorHandler();