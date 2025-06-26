// =====================================================
// AUTH MIDDLEWARE - PERMISSION SERVICE
// =====================================================
// Middleware de autenticación para el servicio de permisos

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { MetricsService } from '../services/metricsService';

// Extender Request para incluir user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        email: string;
        roles: string[];
        permissions: string[];
        communityId?: string;
        isSuperAdmin: boolean;
        sessionId?: string;
      };
    }
  }
}

/**
 * Middleware de autenticación JWT
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    // Extraer token del header Authorization
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Token de acceso requerido', 401, 'MISSING_TOKEN');
    }

    const token = authHeader.substring(7); // Remover "Bearer "

    if (!token) {
      throw new AppError('Token de acceso inválido', 401, 'INVALID_TOKEN');
    }

    // Verificar y decodificar token
    const decoded = jwt.verify(token, config.JWT_SECRET) as any;

    if (!decoded || !decoded.sub) {
      throw new AppError('Token de acceso inválido', 401, 'INVALID_TOKEN');
    }

    // Extraer información del usuario del token
    req.user = {
      id: decoded.sub,
      username: decoded.username || '',
      email: decoded.email || '',
      roles: decoded.roles || [],
      permissions: decoded.permissions || [],
      communityId: decoded.communityId,
      isSuperAdmin: decoded.roles?.includes('SUPER_ADMIN') || false,
      sessionId: decoded.sessionId
    };

    // Extraer community ID del header si está presente
    const communityHeader = req.headers['x-community-id'] as string;
    if (communityHeader) {
      req.user.communityId = communityHeader;
    }

    // Métricas
    MetricsService.incrementCounter('auth_requests_total', { 
      status: 'success',
      user_id: req.user.id
    });

    logger.debug(`User authenticated: ${req.user.id} (${req.user.username})`);

    next();

  } catch (error) {
    MetricsService.incrementCounter('auth_requests_total', { 
      status: 'failed',
      reason: error.name || 'unknown'
    });

    if (error instanceof jwt.TokenExpiredError) {
      logger.warn('Token expired:', error.message);
      return next(new AppError('Token expirado', 401, 'TOKEN_EXPIRED'));
    }

    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('Invalid JWT:', error.message);
      return next(new AppError('Token inválido', 401, 'INVALID_TOKEN'));
    }

    logger.error('Authentication error:', error);
    next(error);
  }
}

/**
 * Middleware opcional de autenticación (no falla si no hay token)
 */
export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continuar sin autenticación
    }

    const token = authHeader.substring(7);
    
    if (!token) {
      return next(); // Continuar sin autenticación
    }

    // Intentar verificar token
    const decoded = jwt.verify(token, config.JWT_SECRET) as any;

    if (decoded && decoded.sub) {
      req.user = {
        id: decoded.sub,
        username: decoded.username || '',
        email: decoded.email || '',
        roles: decoded.roles || [],
        permissions: decoded.permissions || [],
        communityId: decoded.communityId,
        isSuperAdmin: decoded.roles?.includes('SUPER_ADMIN') || false,
        sessionId: decoded.sessionId
      };

      logger.debug(`Optional auth successful for user: ${req.user.id}`);
    }

    next();

  } catch (error) {
    // En autenticación opcional, los errores no son fatales
    logger.debug('Optional authentication failed, continuing without auth:', error.message);
    next();
  }
}

/**
 * Middleware para verificar si el usuario es administrador
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) {
      throw new AppError('Autenticación requerida', 401, 'UNAUTHORIZED');
    }

    const isAdmin = req.user.isSuperAdmin || 
                   req.user.roles.includes('ADMIN') ||
                   req.user.permissions.includes('admin.*') ||
                   req.user.permissions.includes('*');

    if (!isAdmin) {
      throw new AppError('Permisos de administrador requeridos', 403, 'INSUFFICIENT_PERMISSIONS');
    }

    next();

  } catch (error) {
    next(error);
  }
}

/**
 * Middleware para verificar permisos específicos
 */
export function requirePermission(permission: string | string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AppError('Autenticación requerida', 401, 'UNAUTHORIZED');
      }

      const requiredPermissions = Array.isArray(permission) ? permission : [permission];
      const userPermissions = req.user.permissions || [];

      // Verificar super admin
      if (req.user.isSuperAdmin || userPermissions.includes('*')) {
        return next();
      }

      // Verificar permisos específicos
      const hasPermission = requiredPermissions.some(perm => {
        // Permiso exacto
        if (userPermissions.includes(perm)) {
          return true;
        }

        // Wildcard de módulo
        const [module] = perm.split('.');
        if (userPermissions.includes(`${module}.*`)) {
          return true;
        }

        return false;
      });

      if (!hasPermission) {
        logger.warn(`Permission denied for user ${req.user.id}: required ${requiredPermissions.join(' OR ')}`);
        throw new AppError('Permisos insuficientes', 403, 'INSUFFICIENT_PERMISSIONS', {
          required: requiredPermissions,
          user: req.user.id
        });
      }

      next();

    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware para verificar roles específicos
 */
export function requireRole(role: string | string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AppError('Autenticación requerida', 401, 'UNAUTHORIZED');
      }

      const requiredRoles = Array.isArray(role) ? role : [role];
      const userRoles = req.user.roles || [];

      // Verificar super admin
      if (req.user.isSuperAdmin || userRoles.includes('SUPER_ADMIN')) {
        return next();
      }

      // Verificar roles específicos
      const hasRole = requiredRoles.some(r => userRoles.includes(r));

      if (!hasRole) {
        logger.warn(`Role check failed for user ${req.user.id}: required ${requiredRoles.join(' OR ')}`);
        throw new AppError('Rol insuficiente', 403, 'INSUFFICIENT_ROLE', {
          required: requiredRoles,
          user: req.user.id
        });
      }

      next();

    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware para verificar membresía en comunidad
 */
export function requireCommunityAccess(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) {
      throw new AppError('Autenticación requerida', 401, 'UNAUTHORIZED');
    }

    const communityId = req.params.communityId || 
                       req.body.communityId || 
                       req.query.communityId ||
                       req.headers['x-community-id'];

    if (!communityId) {
      throw new AppError('ID de comunidad requerido', 400, 'COMMUNITY_ID_REQUIRED');
    }

    // Super admin tiene acceso a todas las comunidades
    if (req.user.isSuperAdmin) {
      return next();
    }

    // Verificar si el usuario tiene acceso a la comunidad
    // Esta validación se podría extender para verificar en la base de datos
    // Por ahora, validamos si está en el token
    if (req.user.communityId !== communityId) {
      throw new AppError('Acceso a la comunidad no autorizado', 403, 'COMMUNITY_ACCESS_DENIED');
    }

    next();

  } catch (error) {
    next(error);
  }
}

/**
 * Middleware para logs de auditoría
 */
export function auditLog(action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const auditData = {
        action,
        userId: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date(),
        method: req.method,
        url: req.originalUrl,
        params: req.params,
        query: req.query,
        body: req.method !== 'GET' ? req.body : undefined
      };

      // Log de auditoría
      logger.info('Audit log:', auditData);

      // Aquí se podría guardar en base de datos si es necesario
      
      next();

    } catch (error) {
      logger.error('Audit log error:', error);
      // No fallar la request por errores de auditoría
      next();
    }
  };
}

/**
 * Middleware para rate limiting por usuario
 */
export function userRateLimit(maxRequests: number = 100, windowMs: number = 60000) {
  const userRequests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const userId = req.user?.id || req.ip;
      const now = Date.now();
      
      let userRecord = userRequests.get(userId);
      
      if (!userRecord || now > userRecord.resetTime) {
        userRecord = {
          count: 1,
          resetTime: now + windowMs
        };
      } else {
        userRecord.count++;
      }

      userRequests.set(userId, userRecord);

      if (userRecord.count > maxRequests) {
        logger.warn(`Rate limit exceeded for user ${userId}: ${userRecord.count}/${maxRequests}`);
        throw new AppError('Límite de solicitudes excedido', 429, 'RATE_LIMIT_EXCEEDED');
      }

      // Agregar headers informativos
      res.set({
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': Math.max(0, maxRequests - userRecord.count).toString(),
        'X-RateLimit-Reset': new Date(userRecord.resetTime).toISOString()
      });

      next();

    } catch (error) {
      next(error);
    }
  };
}