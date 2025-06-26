// =====================================================
// RATE LIMITER MIDDLEWARE - PERMISSION SERVICE
// =====================================================
// Rate limiting específico para operaciones de permisos

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { RateLimitError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { MetricsService } from '../services/metricsService';
import { redisClient } from '../config/redis';

/**
 * Configuración base para rate limiting
 */
const baseConfig = {
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    // Log del rate limit excedido
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userId: req.user?.id,
      endpoint: req.originalUrl,
      method: req.method,
      userAgent: req.get('User-Agent')
    });

    // Métricas
    MetricsService.incrementCounter('rate_limit_exceeded_total', {
      endpoint: req.route?.path || req.path,
      method: req.method,
      user_id: req.user?.id || 'anonymous'
    });

    const error = new RateLimitError(
      'Too many requests, please try again later',
      {
        resetTime: new Date(Date.now() + 15 * 60 * 1000), // 15 minutos
        endpoint: req.originalUrl
      }
    );

    res.status(429).json(error.toJSON());
  }
};

/**
 * Store para Redis (para rate limiting distribuido)
 */
class RedisStore {
  private prefix: string;

  constructor(prefix: string = 'rl:') {
    this.prefix = prefix;
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime?: Date }> {
    try {
      const fullKey = `${this.prefix}${key}`;
      const result = await redisClient.multi()
        .incr(fullKey)
        .expire(fullKey, 900) // 15 minutos
        .exec();

      const totalHits = result?.[0]?.[1] as number || 1;

      return {
        totalHits,
        resetTime: new Date(Date.now() + 900000) // 15 minutos desde ahora
      };
    } catch (error) {
      logger.error('Redis rate limit store error:', error);
      // Fallback a memoria si Redis falla
      return { totalHits: 1 };
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      const fullKey = `${this.prefix}${key}`;
      await redisClient.decr(fullKey);
    } catch (error) {
      logger.error('Redis rate limit decrement error:', error);
    }
  }

  async resetKey(key: string): Promise<void> {
    try {
      const fullKey = `${this.prefix}${key}`;
      await redisClient.del(fullKey);
    } catch (error) {
      logger.error('Redis rate limit reset error:', error);
    }
  }
}

/**
 * Generador de clave personalizada para rate limiting
 */
function generateKey(req: Request, prefix: string = ''): string {
  // Priorizar usuario autenticado, luego IP
  const identifier = req.user?.id || req.ip;
  return `${prefix}${identifier}`;
}

/**
 * Rate limiter para verificación de permisos
 */
export const checkPermissions = rateLimit({
  ...baseConfig,
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100, // 100 verificaciones por minuto por usuario/IP
  keyGenerator: (req) => generateKey(req, 'check:'),
  skip: (req) => {
    // Skip para super admins en desarrollo
    return process.env.NODE_ENV === 'development' && req.user?.isSuperAdmin;
  },
  onLimitReached: (req) => {
    logger.warn('Permission check rate limit reached', {
      userId: req.user?.id,
      ip: req.ip,
      endpoint: req.originalUrl
    });
  }
});

/**
 * Rate limiter para operaciones masivas
 */
export const bulkOperations = rateLimit({
  ...baseConfig,
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 5, // 5 operaciones masivas por 5 minutos
  keyGenerator: (req) => generateKey(req, 'bulk:'),
  skip: (req) => {
    return process.env.NODE_ENV === 'development' && req.user?.isSuperAdmin;
  }
});

/**
 * Rate limiter para obtener permisos de usuario
 */
export const getUserPermissions = rateLimit({
  ...baseConfig,
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 50, // 50 consultas por minuto
  keyGenerator: (req) => generateKey(req, 'getuser:')
});

/**
 * Rate limiter para obtener jerarquía de roles
 */
export const getRoleHierarchy = rateLimit({
  ...baseConfig,
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 30, // 30 consultas por minuto
  keyGenerator: (req) => generateKey(req, 'getrole:')
});

/**
 * Rate limiter para operaciones de cache
 */
export const cacheOperations = rateLimit({
  ...baseConfig,
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 20, // 20 operaciones de cache por minuto
  keyGenerator: (req) => generateKey(req, 'cache:'),
  skip: (req) => {
    // Solo permitir a usuarios autenticados
    return !req.user?.id;
  }
});

/**
 * Rate limiter para operaciones de propagación
 */
export const propagationOperations = rateLimit({
  ...baseConfig,
  windowMs: 2 * 60 * 1000, // 2 minutos
  max: 10, // 10 propagaciones por 2 minutos
  keyGenerator: (req) => generateKey(req, 'propagate:'),
  skip: (req) => {
    return process.env.NODE_ENV === 'development' && req.user?.isSuperAdmin;
  }
});

/**
 * Rate limiter para operaciones administrativas
 */
export const adminOperations = rateLimit({
  ...baseConfig,
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 5, // 5 operaciones admin por 10 minutos
  keyGenerator: (req) => generateKey(req, 'admin:'),
  skip: (req) => {
    // Solo aplicar a operaciones admin reales
    return !req.user?.isSuperAdmin && !req.user?.roles?.includes('ADMIN');
  }
});

/**
 * Rate limiter dinámico basado en el tipo de operación
 */
export function dynamicRateLimit(options: {
  windowMs: number;
  max: number;
  prefix?: string;
  skipCondition?: (req: Request) => boolean;
}) {
  return rateLimit({
    ...baseConfig,
    windowMs: options.windowMs,
    max: options.max,
    keyGenerator: (req) => generateKey(req, options.prefix || ''),
    skip: options.skipCondition || (() => false)
  });
}

/**
 * Rate limiter basado en roles
 */
export function roleBasedRateLimit(limits: Record<string, { windowMs: number; max: number }>) {
  return rateLimit({
    ...baseConfig,
    windowMs: 60000, // Default 1 minuto
    max: (req) => {
      const userRoles = req.user?.roles || [];
      
      // Buscar el límite más permisivo para los roles del usuario
      let maxRequests = 10; // Default muy restrictivo
      
      for (const role of userRoles) {
        if (limits[role] && limits[role].max > maxRequests) {
          maxRequests = limits[role].max;
        }
      }
      
      return maxRequests;
    },
    keyGenerator: (req) => {
      const highestRole = getHighestRole(req.user?.roles || []);
      return generateKey(req, `role:${highestRole}:`);
    }
  });
}

/**
 * Obtener el rol de mayor jerarquía
 */
function getHighestRole(roles: string[]): string {
  const roleHierarchy = [
    'SUPER_ADMIN',
    'ADMIN',
    'COMMUNITY_ADMIN',
    'MANAGER',
    'STAFF',
    'RESIDENT',
    'GUEST'
  ];

  for (const role of roleHierarchy) {
    if (roles.includes(role)) {
      return role;
    }
  }

  return 'UNKNOWN';
}

/**
 * Rate limiter para IPs específicas (whitelist/blacklist)
 */
export function ipBasedRateLimit(
  whitelist: string[] = [],
  blacklist: string[] = [],
  defaultLimits: { windowMs: number; max: number } = { windowMs: 60000, max: 100 }
) {
  return rateLimit({
    ...baseConfig,
    windowMs: defaultLimits.windowMs,
    max: defaultLimits.max,
    skip: (req) => {
      const ip = req.ip;
      
      // Bloquear IPs en blacklist
      if (blacklist.includes(ip)) {
        logger.warn('Request from blacklisted IP', { ip, endpoint: req.originalUrl });
        return false; // No skip, aplicar rate limit (efectivamente bloquear)
      }
      
      // Permitir IPs en whitelist
      if (whitelist.includes(ip)) {
        return true; // Skip rate limit
      }
      
      return false; // Aplicar rate limit normal
    },
    keyGenerator: (req) => `ip:${req.ip}`
  });
}

/**
 * Middleware para limpiar rate limits (uso administrativo)
 */
export async function clearRateLimit(userId?: string, ip?: string, prefix?: string): Promise<void> {
  try {
    const keys: string[] = [];
    
    if (userId) {
      keys.push(...[
        `${prefix || ''}check:${userId}`,
        `${prefix || ''}bulk:${userId}`,
        `${prefix || ''}getuser:${userId}`,
        `${prefix || ''}getrole:${userId}`,
        `${prefix || ''}cache:${userId}`,
        `${prefix || ''}propagate:${userId}`,
        `${prefix || ''}admin:${userId}`
      ]);
    }
    
    if (ip) {
      keys.push(...[
        `${prefix || ''}check:${ip}`,
        `${prefix || ''}bulk:${ip}`,
        `${prefix || ''}getuser:${ip}`,
        `${prefix || ''}getrole:${ip}`,
        `${prefix || ''}cache:${ip}`,
        `${prefix || ''}propagate:${ip}`,
        `${prefix || ''}admin:${ip}`
      ]);
    }
    
    if (keys.length > 0) {
      await redisClient.del(keys);
      logger.info('Rate limits cleared', { userId, ip, keysCleared: keys.length });
    }
  } catch (error) {
    logger.error('Error clearing rate limits:', error);
  }
}

/**
 * Middleware para obtener estadísticas de rate limiting
 */
export async function getRateLimitStats(userId?: string, ip?: string): Promise<any> {
  try {
    const identifier = userId || ip;
    if (!identifier) {
      return null;
    }
    
    const prefixes = ['check:', 'bulk:', 'getuser:', 'getrole:', 'cache:', 'propagate:', 'admin:'];
    const stats: Record<string, number> = {};
    
    for (const prefix of prefixes) {
      const key = `rl:${prefix}${identifier}`;
      const count = await redisClient.get(key);
      stats[prefix.slice(0, -1)] = parseInt(count || '0', 10);
    }
    
    return stats;
  } catch (error) {
    logger.error('Error getting rate limit stats:', error);
    return null;
  }
}

// Exportar todas las configuraciones de rate limiting
export const rateLimitMiddleware = {
  checkPermissions,
  bulkOperations,
  getUserPermissions,
  getRoleHierarchy,
  cacheOperations,
  propagationOperations,
  adminOperations,
  dynamicRateLimit,
  roleBasedRateLimit,
  ipBasedRateLimit
};