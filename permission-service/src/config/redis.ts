// =====================================================
// REDIS CONNECTION - PERMISSION SERVICE
// =====================================================
// Configuración y conexión a Redis para cache distribuido

import { createClient, RedisClientType } from 'redis';
import { config, cacheKeys, cacheTTL } from './config';
import { logger } from '../utils/logger';

// Cliente Redis
let redisClient: RedisClientType;

/**
 * Conectar a Redis
 */
export async function connectRedis(): Promise<void> {
  try {
    redisClient = createClient({
      socket: {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        connectTimeout: 10000,
        lazyConnect: true
      },
      password: config.REDIS_PASSWORD,
      database: config.REDIS_DB, // DB específica para permisos
      
      // Configuración de reconexión
      retry_unfulfilled_commands: true,
      enable_offline_queue: false
    });

    // Eventos de Redis
    redisClient.on('connect', () => {
      logger.info(`📦 Redis connecting to ${config.REDIS_HOST}:${config.REDIS_PORT}`);
    });

    redisClient.on('ready', () => {
      logger.info('📦 Redis connected and ready');
    });

    redisClient.on('error', (err) => {
      logger.error('Redis error:', err);
    });

    redisClient.on('end', () => {
      logger.warn('📦 Redis connection ended');
    });

    redisClient.on('reconnecting', () => {
      logger.info('📦 Redis reconnecting...');
    });

    // Conectar
    await redisClient.connect();

    // Verificar conexión
    await redisClient.ping();
    
    logger.info('📦 Redis successfully connected');

  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
}

/**
 * Desconectar Redis
 */
export async function disconnectRedis(): Promise<void> {
  if (redisClient && redisClient.isOpen) {
    await redisClient.disconnect();
    logger.info('📦 Redis disconnected');
  }
}

/**
 * Health check de Redis
 */
export async function healthCheckRedis(): Promise<boolean> {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return false;
    }
    
    const result = await redisClient.ping();
    return result === 'PONG';
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return false;
  }
}

// =====================================================
// CACHE SERVICE PARA PERMISOS
// =====================================================

export class PermissionCache {
  /**
   * Obtener permisos de usuario del cache
   */
  static async getUserPermissions(
    userId: string, 
    communityId?: string
  ): Promise<string[] | null> {
    try {
      const key = cacheKeys.userPermissions(userId, communityId);
      const cached = await redisClient.get(key);
      
      if (cached) {
        logger.debug(`Cache hit for user permissions: ${key}`);
        return JSON.parse(cached);
      }
      
      logger.debug(`Cache miss for user permissions: ${key}`);
      return null;
    } catch (error) {
      logger.error('Error getting user permissions from cache:', error);
      return null;
    }
  }

  /**
   * Guardar permisos de usuario en cache
   */
  static async setUserPermissions(
    userId: string, 
    permissions: string[], 
    communityId?: string,
    ttl: number = cacheTTL.medium
  ): Promise<void> {
    try {
      const key = cacheKeys.userPermissions(userId, communityId);
      await redisClient.setEx(key, ttl, JSON.stringify(permissions));
      
      logger.debug(`Cached user permissions: ${key} (TTL: ${ttl}s)`);
    } catch (error) {
      logger.error('Error setting user permissions in cache:', error);
    }
  }

  /**
   * Obtener permisos de rol del cache
   */
  static async getRolePermissions(roleId: string): Promise<string[] | null> {
    try {
      const key = cacheKeys.rolePermissions(roleId);
      const cached = await redisClient.get(key);
      
      if (cached) {
        logger.debug(`Cache hit for role permissions: ${key}`);
        return JSON.parse(cached);
      }
      
      logger.debug(`Cache miss for role permissions: ${key}`);
      return null;
    } catch (error) {
      logger.error('Error getting role permissions from cache:', error);
      return null;
    }
  }

  /**
   * Guardar permisos de rol en cache
   */
  static async setRolePermissions(
    roleId: string, 
    permissions: string[],
    ttl: number = cacheTTL.long
  ): Promise<void> {
    try {
      const key = cacheKeys.rolePermissions(roleId);
      await redisClient.setEx(key, ttl, JSON.stringify(permissions));
      
      logger.debug(`Cached role permissions: ${key} (TTL: ${ttl}s)`);
    } catch (error) {
      logger.error('Error setting role permissions in cache:', error);
    }
  }

  /**
   * Obtener jerarquía de roles del cache
   */
  static async getRoleHierarchy(roleId: string): Promise<any[] | null> {
    try {
      const key = cacheKeys.roleHierarchy(roleId);
      const cached = await redisClient.get(key);
      
      if (cached) {
        logger.debug(`Cache hit for role hierarchy: ${key}`);
        return JSON.parse(cached);
      }
      
      return null;
    } catch (error) {
      logger.error('Error getting role hierarchy from cache:', error);
      return null;
    }
  }

  /**
   * Guardar jerarquía de roles en cache
   */
  static async setRoleHierarchy(
    roleId: string, 
    hierarchy: any[],
    ttl: number = cacheTTL.long
  ): Promise<void> {
    try {
      const key = cacheKeys.roleHierarchy(roleId);
      await redisClient.setEx(key, ttl, JSON.stringify(hierarchy));
      
      logger.debug(`Cached role hierarchy: ${key} (TTL: ${ttl}s)`);
    } catch (error) {
      logger.error('Error setting role hierarchy in cache:', error);
    }
  }

  /**
   * Obtener árbol de permisos completo
   */
  static async getPermissionTree(): Promise<any | null> {
    try {
      const key = cacheKeys.permissionTree();
      const cached = await redisClient.get(key);
      
      if (cached) {
        logger.debug(`Cache hit for permission tree: ${key}`);
        return JSON.parse(cached);
      }
      
      return null;
    } catch (error) {
      logger.error('Error getting permission tree from cache:', error);
      return null;
    }
  }

  /**
   * Guardar árbol de permisos completo
   */
  static async setPermissionTree(
    tree: any,
    ttl: number = cacheTTL.long
  ): Promise<void> {
    try {
      const key = cacheKeys.permissionTree();
      await redisClient.setEx(key, ttl, JSON.stringify(tree));
      
      logger.debug(`Cached permission tree: ${key} (TTL: ${ttl}s)`);
    } catch (error) {
      logger.error('Error setting permission tree in cache:', error);
    }
  }

  /**
   * Invalidar cache de usuario específico
   */
  static async invalidateUserCache(userId: string, communityId?: string): Promise<void> {
    try {
      const patterns = [
        cacheKeys.userPermissions(userId, communityId),
        cacheKeys.userRoles(userId, communityId)
      ];

      // Si no se especifica comunidad, invalidar todas
      if (!communityId) {
        const userKeys = await redisClient.keys(`perm:user:${userId}:*`);
        patterns.push(...userKeys);
      }

      if (patterns.length > 0) {
        await redisClient.del(patterns);
        logger.info(`Invalidated cache for user ${userId} (${patterns.length} keys)`);
      }
    } catch (error) {
      logger.error('Error invalidating user cache:', error);
    }
  }

  /**
   * Invalidar cache de rol específico
   */
  static async invalidateRoleCache(roleId: string): Promise<void> {
    try {
      const patterns = [
        cacheKeys.rolePermissions(roleId),
        cacheKeys.roleHierarchy(roleId)
      ];

      await redisClient.del(patterns);
      logger.info(`Invalidated cache for role ${roleId}`);
    } catch (error) {
      logger.error('Error invalidating role cache:', error);
    }
  }

  /**
   * Invalidar todo el cache de permisos
   */
  static async invalidateAllPermissionCache(): Promise<void> {
    try {
      const keys = await redisClient.keys('perm:*');
      
      if (keys.length > 0) {
        await redisClient.del(keys);
        logger.info(`Invalidated all permission cache (${keys.length} keys)`);
      }
    } catch (error) {
      logger.error('Error invalidating all permission cache:', error);
    }
  }

  /**
   * Operaciones de bloqueo distribuido
   */
  static async acquireLock(
    resource: string, 
    ttl: number = 30, 
    timeout: number = 10
  ): Promise<string | null> {
    try {
      const lockKey = `lock:${resource}`;
      const lockValue = `${Date.now()}-${Math.random()}`;
      const endTime = Date.now() + (timeout * 1000);

      while (Date.now() < endTime) {
        const result = await redisClient.set(lockKey, lockValue, {
          PX: ttl * 1000,
          NX: true
        });

        if (result === 'OK') {
          logger.debug(`Acquired lock for resource: ${resource}`);
          return lockValue;
        }

        // Esperar un poco antes de reintentar
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      logger.warn(`Failed to acquire lock for resource: ${resource}`);
      return null;
    } catch (error) {
      logger.error('Error acquiring lock:', error);
      return null;
    }
  }

  /**
   * Liberar bloqueo distribuido
   */
  static async releaseLock(resource: string, lockValue: string): Promise<boolean> {
    try {
      const lockKey = `lock:${resource}`;
      
      // Script Lua para liberar el lock de forma atómica
      const luaScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await redisClient.eval(luaScript, {
        keys: [lockKey],
        arguments: [lockValue]
      });

      if (result === 1) {
        logger.debug(`Released lock for resource: ${resource}`);
        return true;
      }

      logger.warn(`Failed to release lock for resource: ${resource}`);
      return false;
    } catch (error) {
      logger.error('Error releasing lock:', error);
      return false;
    }
  }

  /**
   * Obtener estadísticas de cache
   */
  static async getCacheStats(): Promise<any> {
    try {
      const info = await redisClient.info('memory');
      const keyspace = await redisClient.info('keyspace');
      
      // Contar keys por patrón
      const permissionKeys = await redisClient.keys('perm:*');
      const lockKeys = await redisClient.keys('lock:*');
      
      return {
        memory: info,
        keyspace: keyspace,
        counts: {
          permission_keys: permissionKeys.length,
          lock_keys: lockKeys.length,
          total_keys: permissionKeys.length + lockKeys.length
        }
      };
    } catch (error) {
      logger.error('Error getting cache stats:', error);
      return null;
    }
  }
}

// Exportar cliente y funciones
export { redisClient, connectRedis, disconnectRedis, healthCheckRedis };