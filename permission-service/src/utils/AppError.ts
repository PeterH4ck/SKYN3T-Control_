// =====================================================
// APP ERROR - PERMISSION SERVICE
// =====================================================
// Clase de error personalizada para manejo consistente

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly timestamp: Date;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: any,
    isOperational: boolean = true
  ) {
    super(message);

    // Mantener el stack trace
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);

    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.timestamp = new Date();
    this.details = details;
  }

  /**
   * Convertir error a formato JSON para respuestas
   */
  toJSON() {
    return {
      success: false,
      error: {
        message: this.message,
        code: this.code,
        statusCode: this.statusCode,
        timestamp: this.timestamp.toISOString(),
        ...(this.details && { details: this.details })
      }
    };
  }

  /**
   * Verificar si es un error operacional
   */
  static isOperational(error: Error): boolean {
    if (error instanceof AppError) {
      return error.isOperational;
    }
    return false;
  }
}

// =====================================================
// ERRORES ESPECÍFICOS DE PERMISOS
// =====================================================

export class PermissionError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 403, 'PERMISSION_DENIED', details);
    this.name = 'PermissionError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', details?: any) {
    super(message, 401, 'AUTHENTICATION_REQUIRED', details);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions', details?: any) {
    super(message, 403, 'AUTHORIZATION_FAILED', details);
    this.name = 'AuthorizationError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource', details?: any) {
    super(`${resource} not found`, 404, 'NOT_FOUND', details);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict', details?: any) {
    super(message, 409, 'CONFLICT', details);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', details?: any) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', details);
    this.name = 'RateLimitError';
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(service: string = 'Service', details?: any) {
    super(`${service} temporarily unavailable`, 503, 'SERVICE_UNAVAILABLE', details);
    this.name = 'ServiceUnavailableError';
  }
}

export class TimeoutError extends AppError {
  constructor(operation: string = 'Operation', timeout: number, details?: any) {
    super(`${operation} timed out after ${timeout}ms`, 408, 'TIMEOUT', details);
    this.name = 'TimeoutError';
  }
}

export class CacheError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 500, 'CACHE_ERROR', details);
    this.name = 'CacheError';
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 500, 'DATABASE_ERROR', details);
    this.name = 'DatabaseError';
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, details?: any) {
    super(`${service}: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR', details);
    this.name = 'ExternalServiceError';
  }
}

// =====================================================
// ERRORES ESPECÍFICOS DEL SISTEMA DE PERMISOS
// =====================================================

export class PermissionCalculationError extends AppError {
  constructor(userId: string, reason: string, details?: any) {
    super(`Failed to calculate permissions for user ${userId}: ${reason}`, 500, 'PERMISSION_CALCULATION_ERROR', {
      userId,
      reason,
      ...details
    });
    this.name = 'PermissionCalculationError';
  }
}

export class RoleHierarchyError extends AppError {
  constructor(roleId: string, issue: string, details?: any) {
    super(`Role hierarchy error for role ${roleId}: ${issue}`, 400, 'ROLE_HIERARCHY_ERROR', {
      roleId,
      issue,
      ...details
    });
    this.name = 'RoleHierarchyError';
  }
}

export class PermissionDependencyError extends AppError {
  constructor(permission: string, missingDependencies: string[], details?: any) {
    super(`Permission ${permission} has unmet dependencies: ${missingDependencies.join(', ')}`, 400, 'PERMISSION_DEPENDENCY_ERROR', {
      permission,
      missingDependencies,
      ...details
    });
    this.name = 'PermissionDependencyError';
  }
}

export class PropagationError extends AppError {
  constructor(type: string, target: string, reason: string, details?: any) {
    super(`Failed to propagate ${type} changes to ${target}: ${reason}`, 500, 'PROPAGATION_ERROR', {
      type,
      target,
      reason,
      ...details
    });
    this.name = 'PropagationError';
  }
}

export class BulkOperationError extends AppError {
  constructor(operation: string, processed: number, total: number, errors: string[], details?: any) {
    super(`Bulk ${operation} partially failed: ${processed}/${total} processed`, 207, 'BULK_OPERATION_ERROR', {
      operation,
      processed,
      total,
      errors,
      ...details
    });
    this.name = 'BulkOperationError';
  }
}

export class CacheConsistencyError extends AppError {
  constructor(key: string, issue: string, details?: any) {
    super(`Cache consistency error for key ${key}: ${issue}`, 500, 'CACHE_CONSISTENCY_ERROR', {
      key,
      issue,
      ...details
    });
    this.name = 'CacheConsistencyError';
  }
}

export class CircularReferenceError extends AppError {
  constructor(type: 'role' | 'permission', id: string, path: string[], details?: any) {
    super(`Circular reference detected in ${type} ${id}: ${path.join(' -> ')}`, 400, 'CIRCULAR_REFERENCE_ERROR', {
      type,
      id,
      path,
      ...details
    });
    this.name = 'CircularReferenceError';
  }
}

// =====================================================
// FACTORY FUNCTIONS PARA ERRORES COMUNES
// =====================================================

export const ErrorFactory = {
  /**
   * Error de token expirado
   */
  tokenExpired(details?: any): AuthenticationError {
    return new AuthenticationError('Token has expired', {
      code: 'TOKEN_EXPIRED',
      ...details
    });
  },

  /**
   * Error de token inválido
   */
  invalidToken(details?: any): AuthenticationError {
    return new AuthenticationError('Invalid or malformed token', {
      code: 'INVALID_TOKEN',
      ...details
    });
  },

  /**
   * Error de permisos insuficientes
   */
  insufficientPermissions(required: string[], actual: string[], details?: any): PermissionError {
    return new PermissionError('Insufficient permissions', {
      required,
      actual,
      ...details
    });
  },

  /**
   * Error de usuario no encontrado
   */
  userNotFound(userId: string, details?: any): NotFoundError {
    return new NotFoundError('User', {
      userId,
      ...details
    });
  },

  /**
   * Error de rol no encontrado
   */
  roleNotFound(roleId: string, details?: any): NotFoundError {
    return new NotFoundError('Role', {
      roleId,
      ...details
    });
  },

  /**
   * Error de permiso no encontrado
   */
  permissionNotFound(permissionCode: string, details?: any): NotFoundError {
    return new NotFoundError('Permission', {
      permissionCode,
      ...details
    });
  },

  /**
   * Error de comunidad no encontrada
   */
  communityNotFound(communityId: string, details?: any): NotFoundError {
    return new NotFoundError('Community', {
      communityId,
      ...details
    });
  },

  /**
   * Error de validación de entrada
   */
  invalidInput(field: string, value: any, expected: string, details?: any): ValidationError {
    return new ValidationError(`Invalid ${field}: expected ${expected}, got ${value}`, {
      field,
      value,
      expected,
      ...details
    });
  },

  /**
   * Error de timeout en operación
   */
  operationTimeout(operation: string, timeout: number, details?: any): TimeoutError {
    return new TimeoutError(operation, timeout, details);
  },

  /**
   * Error de servicio no disponible
   */
  serviceUnavailable(service: string, details?: any): ServiceUnavailableError {
    return new ServiceUnavailableError(service, details);
  },

  /**
   * Error de límite de tasa excedido
   */
  rateLimitExceeded(limit: number, window: string, details?: any): RateLimitError {
    return new RateLimitError(`Rate limit of ${limit} requests per ${window} exceeded`, {
      limit,
      window,
      ...details
    });
  }
};

// =====================================================
// UTILIDADES PARA MANEJO DE ERRORES
// =====================================================

export class ErrorUtils {
  /**
   * Convertir error desconocido a AppError
   */
  static toAppError(error: any): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof Error) {
      return new AppError(error.message, 500, 'UNKNOWN_ERROR', {
        originalName: error.name,
        originalStack: error.stack
      });
    }

    return new AppError('Unknown error occurred', 500, 'UNKNOWN_ERROR', {
      originalError: error
    });
  }

  /**
   * Verificar si un error es recuperable
   */
  static isRecoverable(error: Error): boolean {
    if (error instanceof AppError) {
      return error.isOperational;
    }

    // Errores específicos que son recuperables
    const recoverableErrors = [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND'
    ];

    return recoverableErrors.some(code => 
      error.message.includes(code) || (error as any).code === code
    );
  }

  /**
   * Obtener código de estado HTTP de un error
   */
  static getStatusCode(error: Error): number {
    if (error instanceof AppError) {
      return error.statusCode;
    }

    // Mapear errores comunes a códigos HTTP
    const errorCodeMap: Record<string, number> = {
      'ECONNREFUSED': 503,
      'ETIMEDOUT': 408,
      'ENOTFOUND': 404,
      'ECONNRESET': 503
    };

    const code = (error as any).code;
    return errorCodeMap[code] || 500;
  }

  /**
   * Sanitizar error para logs públicos
   */
  static sanitizeForPublic(error: AppError): any {
    return {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      timestamp: error.timestamp.toISOString()
      // Excluir stack trace y detalles sensibles
    };
  }

  /**
   * Verificar si debe incluir stack trace
   */
  static shouldIncludeStack(error: Error, environment: string): boolean {
    return environment !== 'production' || !AppError.isOperational(error);
  }
}

export default AppError;