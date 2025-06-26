export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly details?: any;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    details?: any,
    isOperational: boolean = true
  ) {
    super(message);
    
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;

    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);
    
    // Set the prototype explicitly
    Object.setPrototypeOf(this, AppError.prototype);
  }

  // Helper method to create a validation error
  static validation(message: string, details?: any): AppError {
    return new AppError(message, 400, 'VALIDATION_ERROR', details);
  }

  // Helper method to create an authentication error
  static unauthorized(message: string = 'Unauthorized'): AppError {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  // Helper method to create a forbidden error
  static forbidden(message: string = 'Forbidden'): AppError {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  // Helper method to create a not found error
  static notFound(resource: string): AppError {
    return new AppError(`${resource} not found`, 404, 'NOT_FOUND');
  }

  // Helper method to create a conflict error
  static conflict(message: string, details?: any): AppError {
    return new AppError(message, 409, 'CONFLICT', details);
  }

  // Helper method to create a rate limit error
  static tooManyRequests(message: string = 'Too many requests'): AppError {
    return new AppError(message, 429, 'RATE_LIMIT_EXCEEDED');
  }

  // Helper method to create an internal server error
  static internal(message: string = 'Internal server error', details?: any): AppError {
    return new AppError(message, 500, 'INTERNAL_ERROR', details);
  }

  // Helper method to create a service unavailable error
  static serviceUnavailable(service: string): AppError {
    return new AppError(
      `${service} service is currently unavailable`,
      503,
      'SERVICE_UNAVAILABLE'
    );
  }
}