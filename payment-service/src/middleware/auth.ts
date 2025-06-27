import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

interface JwtPayload {
  id: string;
  email: string;
  communityId?: string;
  role: string;
  permissions?: string[];
  iat?: number;
  exp?: number;
}

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      token?: string;
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      throw new AppError('No authentication token provided', 401, 'NO_TOKEN');
    }

    // Check format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new AppError('Invalid token format', 401, 'INVALID_TOKEN_FORMAT');
    }

    const token = parts[1];
    
    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
    
    // Add user info to request
    req.user = decoded;
    req.token = token;

    // Log authenticated request
    logger.debug('Request authenticated', {
      userId: decoded.id,
      email: decoded.email,
      role: decoded.role,
    });

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError('Invalid token', 401, 'INVALID_TOKEN'));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new AppError('Token expired', 401, 'TOKEN_EXPIRED'));
    } else {
      next(error);
    }
  }
};

// Check if user has required permission
export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'AUTH_REQUIRED'));
    }

    const hasPermission = req.user.permissions?.includes(permission) ||
                         req.user.permissions?.includes('*') ||
                         req.user.role === 'SUPER_ADMIN';

    if (!hasPermission) {
      logger.warn('Permission denied', {
        userId: req.user.id,
        requiredPermission: permission,
        userPermissions: req.user.permissions,
      });
      
      return next(new AppError(
        'You do not have permission to perform this action',
        403,
        'PERMISSION_DENIED'
      ));
    }

    next();
  };
};

// Check if user has any of the required permissions
export const requireAnyPermission = (permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'AUTH_REQUIRED'));
    }

    const hasPermission = permissions.some(permission =>
      req.user!.permissions?.includes(permission) ||
      req.user!.permissions?.includes('*') ||
      req.user!.role === 'SUPER_ADMIN'
    );

    if (!hasPermission) {
      logger.warn('Permission denied', {
        userId: req.user.id,
        requiredPermissions: permissions,
        userPermissions: req.user.permissions,
      });
      
      return next(new AppError(
        'You do not have permission to perform this action',
        403,
        'PERMISSION_DENIED'
      ));
    }

    next();
  };
};

// Check if user has all required permissions
export const requireAllPermissions = (permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'AUTH_REQUIRED'));
    }

    const hasAllPermissions = permissions.every(permission =>
      req.user!.permissions?.includes(permission) ||
      req.user!.permissions?.includes('*') ||
      req.user!.role === 'SUPER_ADMIN'
    );

    if (!hasAllPermissions) {
      logger.warn('Permission denied', {
        userId: req.user.id,
        requiredPermissions: permissions,
        userPermissions: req.user.permissions,
      });
      
      return next(new AppError(
        'You do not have all required permissions',
        403,
        'INSUFFICIENT_PERMISSIONS'
      ));
    }

    next();
  };
};

// Check if user has required role
export const requireRole = (roles: string | string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'AUTH_REQUIRED'));
    }

    const requiredRoles = Array.isArray(roles) ? roles : [roles];
    const hasRole = requiredRoles.includes(req.user.role) || req.user.role === 'SUPER_ADMIN';

    if (!hasRole) {
      logger.warn('Role denied', {
        userId: req.user.id,
        requiredRoles,
        userRole: req.user.role,
      });
      
      return next(new AppError(
        'You do not have the required role',
        403,
        'ROLE_DENIED'
      ));
    }

    next();
  };
};

// Optional authentication - doesn't fail if no token
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return next();
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return next();
    }

    const token = parts[1];
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
    
    req.user = decoded;
    req.token = token;

    next();
  } catch (error) {
    // Log error but continue without authentication
    logger.debug('Optional auth failed', { error: (error as Error).message });
    next();
  }
};