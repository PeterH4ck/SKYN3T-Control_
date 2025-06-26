// =====================================================
// VALIDATION MIDDLEWARE - PERMISSION SERVICE
// =====================================================
// Middleware para validación de requests usando express-validator

import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationError as ExpressValidationError } from 'express-validator';
import { ValidationError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { MetricsService } from '../services/metricsService';

/**
 * Middleware para procesar resultados de validación
 */
export function validateRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      // Log de errores de validación
      logger.warn('Validation failed', {
        method: req.method,
        url: req.originalUrl,
        errors: errors.array(),
        body: sanitizeBody(req.body),
        query: req.query,
        params: req.params,
        userId: req.user?.id,
        ip: req.ip
      });

      // Métricas
      MetricsService.incrementCounter('validation_errors_total', {
        endpoint: req.route?.path || req.path,
        method: req.method
      });

      // Formatear errores
      const formattedErrors = formatValidationErrors(errors.array());

      // Crear error de validación
      const validationError = new ValidationError(
        'Request validation failed',
        {
          errors: formattedErrors,
          fields: formattedErrors.map(err => err.field)
        }
      );

      return next(validationError);
    }

    next();

  } catch (error) {
    logger.error('Error in validation middleware:', error);
    next(error);
  }
}

/**
 * Formatear errores de express-validator
 */
function formatValidationErrors(errors: ExpressValidationError[]): any[] {
  return errors.map(error => {
    const formatted: any = {
      field: error.type === 'field' ? error.path : error.type,
      message: error.msg,
      value: error.type === 'field' ? error.value : undefined
    };

    // Agregar información adicional según el tipo
    if (error.type === 'field') {
      formatted.location = error.location;
    }

    return formatted;
  });
}

/**
 * Sanitizar body para logs (remover campos sensibles)
 */
function sanitizeBody(body: any): any {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sensitiveFields = [
    'password',
    'token',
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
 * Middleware de validación condicional
 */
export function conditionalValidation(
  condition: (req: Request) => boolean,
  validationChain: any[]
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (condition(req)) {
      // Ejecutar validaciones si se cumple la condición
      Promise.all(validationChain.map(validation => validation.run(req)))
        .then(() => validateRequest(req, res, next))
        .catch(next);
    } else {
      next();
    }
  };
}

/**
 * Middleware para validar tipos de contenido
 */
export function validateContentType(allowedTypes: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentType = req.get('Content-Type');

    if (req.method === 'GET' || req.method === 'DELETE') {
      return next(); // No validar content-type para GET/DELETE
    }

    if (!contentType) {
      const error = new ValidationError(
        'Content-Type header is required',
        { allowedTypes }
      );
      return next(error);
    }

    const isAllowed = allowedTypes.some(type => 
      contentType.toLowerCase().includes(type.toLowerCase())
    );

    if (!isAllowed) {
      const error = new ValidationError(
        `Unsupported Content-Type: ${contentType}`,
        { 
          provided: contentType,
          allowedTypes 
        }
      );
      return next(error);
    }

    next();
  };
}

/**
 * Middleware para validar tamaño del body
 */
export function validateBodySize(maxSize: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.get('Content-Length') || '0', 10);

    if (contentLength > maxSize) {
      const error = new ValidationError(
        `Request body too large: ${contentLength} bytes (max: ${maxSize} bytes)`,
        {
          size: contentLength,
          maxSize
        }
      );
      return next(error);
    }

    next();
  };
}

/**
 * Middleware para validar UUID en parámetros
 */
export function validateUUIDParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = req.params[paramName];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (value && !uuidRegex.test(value)) {
      const error = new ValidationError(
        `Invalid UUID format for parameter: ${paramName}`,
        {
          parameter: paramName,
          value,
          expectedFormat: 'UUID v4'
        }
      );
      return next(error);
    }

    next();
  };
}

/**
 * Middleware para validar arrays
 */
export function validateArray(
  field: string,
  minLength?: number,
  maxLength?: number,
  itemValidator?: (item: any) => boolean
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = req.body[field];

    if (value !== undefined) {
      if (!Array.isArray(value)) {
        const error = new ValidationError(
          `Field ${field} must be an array`,
          { field, type: typeof value }
        );
        return next(error);
      }

      if (minLength !== undefined && value.length < minLength) {
        const error = new ValidationError(
          `Field ${field} must have at least ${minLength} items`,
          { field, length: value.length, minLength }
        );
        return next(error);
      }

      if (maxLength !== undefined && value.length > maxLength) {
        const error = new ValidationError(
          `Field ${field} must have at most ${maxLength} items`,
          { field, length: value.length, maxLength }
        );
        return next(error);
      }

      if (itemValidator) {
        const invalidItems = value.filter((item, index) => {
          try {
            return !itemValidator(item);
          } catch (error) {
            return true; // Item inválido si la validación falla
          }
        });

        if (invalidItems.length > 0) {
          const error = new ValidationError(
            `Field ${field} contains invalid items`,
            { 
              field, 
              invalidItems: invalidItems.slice(0, 5), // Solo mostrar primeros 5
              invalidCount: invalidItems.length
            }
          );
          return next(error);
        }
      }
    }

    next();
  };
}

/**
 * Middleware para validar paginación
 */
export function validatePagination(
  maxLimit: number = 100,
  defaultLimit: number = 20
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { page, limit, offset } = req.query;

    // Validar page
    if (page !== undefined) {
      const pageNum = parseInt(page as string, 10);
      if (isNaN(pageNum) || pageNum < 1) {
        const error = new ValidationError(
          'Page must be a positive integer',
          { page, expected: 'positive integer >= 1' }
        );
        return next(error);
      }
      req.query.page = pageNum.toString();
    }

    // Validar limit
    if (limit !== undefined) {
      const limitNum = parseInt(limit as string, 10);
      if (isNaN(limitNum) || limitNum < 1 || limitNum > maxLimit) {
        const error = new ValidationError(
          `Limit must be between 1 and ${maxLimit}`,
          { limit, maxLimit }
        );
        return next(error);
      }
      req.query.limit = limitNum.toString();
    } else {
      req.query.limit = defaultLimit.toString();
    }

    // Validar offset
    if (offset !== undefined) {
      const offsetNum = parseInt(offset as string, 10);
      if (isNaN(offsetNum) || offsetNum < 0) {
        const error = new ValidationError(
          'Offset must be a non-negative integer',
          { offset, expected: 'non-negative integer >= 0' }
        );
        return next(error);
      }
      req.query.offset = offsetNum.toString();
    }

    next();
  };
}

/**
 * Middleware para validar fechas
 */
export function validateDateRange(
  startDateField: string = 'startDate',
  endDateField: string = 'endDate',
  maxRangeDays?: number
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startDate = req.query[startDateField] as string;
    const endDate = req.query[endDateField] as string;

    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      // Validar formato de fechas
      if (start && isNaN(start.getTime())) {
        const error = new ValidationError(
          `Invalid start date format: ${startDate}`,
          { field: startDateField, value: startDate }
        );
        return next(error);
      }

      if (end && isNaN(end.getTime())) {
        const error = new ValidationError(
          `Invalid end date format: ${endDate}`,
          { field: endDateField, value: endDate }
        );
        return next(error);
      }

      // Validar que start date sea anterior a end date
      if (start && end && start > end) {
        const error = new ValidationError(
          'Start date must be before end date',
          { startDate, endDate }
        );
        return next(error);
      }

      // Validar rango máximo
      if (maxRangeDays && start && end) {
        const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > maxRangeDays) {
          const error = new ValidationError(
            `Date range cannot exceed ${maxRangeDays} days`,
            { 
              startDate, 
              endDate, 
              rangeDays: diffDays, 
              maxRangeDays 
            }
          );
          return next(error);
        }
      }
    }

    next();
  };
}

export default validateRequest;