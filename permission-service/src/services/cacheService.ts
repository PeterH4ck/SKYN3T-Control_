// =====================================================
// CACHE SERVICE - PERMISSION SERVICE
// =====================================================
// Servicio de caché inteligente para permisos

import { PermissionCache, redisClient } from '../config/redis';
import { config, cacheKeys, cacheTTL } from '../config/config';
import { logger } from '../utils/logger';
import { MetricsService } from './metricsService';
import { publishCacheInvalidation } from '../config/rabbitmq';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  version: string;
  metadata?: any;
}

export interface CacheOptions {
  ttl?: number;
  version?: string;
  tags?: string[];
  compression?: boolean;
  fallback?: () => Promise<any>;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalKeys: number;
  memoryUsage: number;
  avgResponseTime: number;
}

/**
 * Servicio de caché inteligente para permisos
 */
export class CacheService {
  private static instance: CacheService;
  private initialized: boolean = false;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    totalKeys: 0,
    memoryUsage: 0,
    avgResponseTime: 0
  };
  private responseTimes: number[] = [];
  private maxResponseTimes: number = 1000;

  private constructor() {}

  /**
   * Singleton instance
   */
  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  /**
   * Inicializar servicio de caché
   */
  public static async initialize(): Promise<void> {
    const service = CacheService.getInstance();
    
    if (service.initialized) {
      return;
    }

    try {
      logger.info('🗄️ Initializing Cache Service...');
      
      // Configurar limpieza periódica
      service.setupPeriodicCleanup();
      
      // Configurar recolección de estadísticas
      service.setupStatsCollection();
      
      service.initialized = true;
      logger.info('✅ Cache Service initialized successfully');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Cache Service:', error);
      throw error;
    }
  }

  /**
   * Obtener valor del caché con opciones avanzadas
   */
  public async get<T>(
    key: string, 
    options: CacheOptions = {}
  ): Promise<T | null> {
    const startTime = Date.now();
    
    try {
      // Intentar obtener del caché
      const cached = await redisClient.get(key);
      
      if (cached) {
        const entry: CacheEntry<T> = JSON.parse(cached);
        
        // Verificar versión si se especifica
        if (options.version && entry.version !== options.version) {
          logger.debug(`Cache version mismatch for key ${key}`);
          await this.delete(key);
          return null;
        }
        
        // Verificar TTL
        if (Date.now() - entry.timestamp > entry.ttl * 1000) {
          logger.debug(`Cache entry expired for key ${key}`);
          await this.delete(key);
          return null;
        }
        
        // Cache hit
        this.recordHit(Date.now() - startTime);
        MetricsService.incrementCounter('cache_hits_total', {
          key_type: this.getKeyType(key)
        });
        
        logger.debug(`Cache hit for key: ${key}`);
        return entry.data;
      }
      
      // Cache miss
      this.recordMiss(Date.now() - startTime);
      MetricsService.incrementCounter('cache_misses_total', {
        key_type: this.getKeyType(key)
      });
      
      logger.debug(`Cache miss for key: ${key}`);
      
      // Intentar fallback si está configurado
      if (options.fallback) {
        try {
          const fallbackData = await options.fallback();
          
          if (fallbackData !== null) {
            // Guardar resultado del fallback en caché
            await this.set(key, fallbackData, options);
            return fallbackData;
          }
        } catch (fallbackError) {
          logger.warn(`Fallback failed for key ${key}:`, fallbackError);
        }
      }
      
      return null;
      
    } catch (error) {
      logger.error(`Error getting cache key ${key}:`, error);
      MetricsService.incrementCounter('cache_errors_total', {
        operation: 'get',
        key_type: this.getKeyType(key)
      });
      return null;
    }
  }

  /**
   * Establecer valor en el caché
   */
  public async set<T>(
    key: string, 
    value: T, 
    options: CacheOptions = {}
  ): Promise<boolean> {
    try {
      const entry: CacheEntry<T> = {
        data: value,
        timestamp: Date.now(),
        ttl: options.ttl || cacheTTL.medium,
        version: options.version || '1.0.0',
        metadata: {
          tags: options.tags || [],
          compressed: options.compression || false,
          size: JSON.stringify(value).length
        }
      };
      
      let serializedEntry = JSON.stringify(entry);
      
      // Comprimir si es necesario
      if (options.compression && entry.metadata.size > 1024) {
        // Aquí se podría implementar compresión
        // serializedEntry = await compress(serializedEntry);
        entry.metadata.compressed = true;
      }
      
      // Establecer en Redis con TTL
      await redisClient.setEx(key, entry.ttl, serializedEntry);
      
      // Establecer tags para invalidación por grupos
      if (options.tags && options.tags.length > 0) {
        await this.setTags(key, options.tags);
      }
      
      logger.debug(`Cache set for key: ${key}`, {
        ttl: entry.ttl,
        size: entry.metadata.size,
        compressed: entry.metadata.compressed
      });
      
      MetricsService.incrementCounter('cache_sets_total', {
        key_type: this.getKeyType(key)
      });
      
      return true;
      
    } catch (error) {
      logger.error(`Error setting cache key ${key}:`, error);
      MetricsService.incrementCounter('cache_errors_total', {
        operation: 'set',
        key_type: this.getKeyType(key)
      });
      return false;
    }
  }

  /**
   * Eliminar clave del caché
   */
  public async delete(key: string): Promise<boolean> {
    try {
      const result = await redisClient.del(key);
      
      // Limpiar tags asociadas
      await this.removeTags(key);
      
      logger.debug(`Cache delete for key: ${key}`);
      
      MetricsService.incrementCounter('cache_deletes_total', {
        key_type: this.getKeyType(key)
      });
      
      return result > 0;
      
    } catch (error) {
      logger.error(`Error deleting cache key ${key}:`, error);
      return false;
    }
  }

  /**
   * Eliminar múltiples claves
   */
  public async deleteMany(keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }
    
    try {
      const result = await redisClient.del(keys);
      
      // Limpiar tags asociadas
      for (const key of keys) {
        await this.removeTags(key);
      }
      
      logger.debug(`Cache delete many: ${keys.length} keys`);
      
      MetricsService.incrementCounter('cache_deletes_total', {
        key_type: 'bulk',
        count: keys.length.toString()
      });
      
      return result;
      
    } catch (error) {
      logger.error('Error deleting multiple cache keys:', error);
      return 0;
    }
  }

  /**
   * Eliminar por patrón
   */
  public async deleteByPattern(pattern: string): Promise<number> {
    try {
      const keys = await redisClient.keys(pattern);
      
      if (keys.length === 0) {
        return 0;
      }
      
      return await this.deleteMany(keys);
      
    } catch (error) {
      logger.error(`Error deleting by pattern ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Eliminar por tags
   */
  public async deleteByTags(tags: string[]): Promise<number> {
    try {
      let allKeys: Set<string> = new Set();
      
      for (const tag of tags) {
        const tagKey = `tag:${tag}`;
        const keys = await redisClient.sMembers(tagKey);
        keys.forEach(key => allKeys.add(key));
      }
      
      if (allKeys.size === 0) {
        return 0;
      }
      
      const result = await this.deleteMany(Array.from(allKeys));
      
      // Limpiar tags
      for (const tag of tags) {
        await redisClient.del(`tag:${tag}`);
      }
      
      return result;
      
    } catch (error) {
      logger.error('Error deleting by tags:', error);
      return 0;
    }
  }

  /**
   * Obtener o establecer (get-or-set pattern)
   */
  public async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    // Intentar obtener del caché
    let value = await this.get<T>(key, options);
    
    if (value !== null) {
      return value;
    }
    
    // Si no está en caché, ejecutar factory
    try {
      value = await factory();
      
      if (value !== null) {
        await this.set(key, value, options);
      }
      
      return value;
      
    } catch (error) {
      logger.error(`Error in getOrSet factory for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Invalidación inteligente de cache de permisos de usuario
   */
  public async invalidateUserPermissions(
    userId: string,
    communityId?: string,
    propagate: boolean = true
  ): Promise<void> {
    try {
      const patterns = [
        cacheKeys.userPermissions(userId, communityId),
        cacheKeys.userRoles(userId, communityId)
      ];

      // Si no se especifica comunidad, invalidar todas
      if (!communityId) {
        const userKeys = await redisClient.keys(`*:user:${userId}:*`);
        patterns.push(...userKeys);
      }

      await this.deleteMany(patterns);
      
      // Propagar invalidación a otros servicios
      if (propagate) {
        await publishCacheInvalidation('user', userId, communityId);
      }
      
      logger.info(`Invalidated cache for user ${userId}`, {
        communityId,
        keysInvalidated: patterns.length
      });
      
    } catch (error) {
      logger.error('Error invalidating user permissions cache:', error);
    }
  }

  /**
   * Invalidación de cache de rol
   */
  public async invalidateRolePermissions(
    roleId: string,
    propagate: boolean = true
  ): Promise<void> {
    try {
      const patterns = [
        cacheKeys.rolePermissions(roleId),
        cacheKeys.roleHierarchy(roleId)
      ];

      await this.deleteMany(patterns);
      
      // Invalidar usuarios afectados por este rol
      await this.deleteByTags([`role:${roleId}`]);
      
      if (propagate) {
        await publishCacheInvalidation('role', roleId);
      }
      
      logger.info(`Invalidated cache for role ${roleId}`);
      
    } catch (error) {
      logger.error('Error invalidating role permissions cache:', error);
    }
  }

  /**
   * Warm-up del caché con datos frecuentes
   */
  public async warmUp(): Promise<void> {
    try {
      logger.info('Starting cache warm-up...');
      
      // Aquí se podrían precargar datos frecuentemente accedidos
      // Por ejemplo, permisos de roles del sistema, árboles de permisos, etc.
      
      // Ejemplo: precargar árbol de permisos
      const permissionTreeKey = cacheKeys.permissionTree();
      const treeExists = await redisClient.exists(permissionTreeKey);
      
      if (!treeExists) {
        // Cargar árbol de permisos desde la base de datos
        // await this.loadPermissionTree();
      }
      
      logger.info('Cache warm-up completed');
      
    } catch (error) {
      logger.error('Error during cache warm-up:', error);
    }
  }

  /**
   * Limpiar cache expirado
   */
  public async cleanup(): Promise<void> {
    try {
      logger.debug('Starting cache cleanup...');
      
      // Redis maneja automáticamente la expiración de claves
      // Aquí podríamos limpiar metadatos adicionales o realizar optimizaciones
      
      // Limpiar estadísticas antiguas
      this.cleanupStats();
      
      logger.debug('Cache cleanup completed');
      
    } catch (error) {
      logger.error('Error during cache cleanup:', error);
    }
  }

  /**
   * Obtener estadísticas del caché
   */
  public async getStats(): Promise<CacheStats> {
    try {
      // Actualizar estadísticas desde Redis
      const info = await redisClient.info('memory');
      const keyspace = await redisClient.info('keyspace');
      
      // Parsear información básica
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const memoryUsage = memoryMatch ? parseInt(memoryMatch[1], 10) : 0;
      
      // Contar claves de permisos
      const permissionKeys = await redisClient.keys('perm:*');
      
      return {
        ...this.stats,
        totalKeys: permissionKeys.length,
        memoryUsage,
        hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
        avgResponseTime: this.responseTimes.length > 0 
          ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
          : 0
      };
      
    } catch (error) {
      logger.error('Error getting cache stats:', error);
      return this.stats;
    }
  }

  /**
   * Health check del caché
   */
  public async healthCheck(): Promise<boolean> {
    try {
      const testKey = 'health:check';
      const testValue = Date.now().toString();
      
      await redisClient.set(testKey, testValue, { EX: 1 });
      const retrieved = await redisClient.get(testKey);
      
      return retrieved === testValue;
      
    } catch (error) {
      logger.error('Cache health check failed:', error);
      return false;
    }
  }

  /**
   * Configurar limpieza periódica
   */
  private setupPeriodicCleanup(): void {
    setInterval(async () => {
      await this.cleanup();
    }, 30 * 60 * 1000); // Cada 30 minutos
  }

  /**
   * Configurar recolección de estadísticas
   */
  private setupStatsCollection(): void {
    setInterval(async () => {
      const stats = await this.getStats();
      
      MetricsService.setGauge('cache_size_bytes', stats.memoryUsage, {
        cache_type: 'permissions'
      });
      
      MetricsService.setGauge('cache_hit_rate', stats.hitRate);
      
    }, 60 * 1000); // Cada minuto
  }

  /**
   * Establecer tags para una clave
   */
  private async setTags(key: string, tags: string[]): Promise<void> {
    try {
      for (const tag of tags) {
        const tagKey = `tag:${tag}`;
        await redisClient.sAdd(tagKey, key);
        await redisClient.expire(tagKey, 3600); // 1 hora
      }
    } catch (error) {
      logger.warn('Error setting cache tags:', error);
    }
  }

  /**
   * Remover tags de una clave
   */
  private async removeTags(key: string): Promise<void> {
    try {
      // Buscar todas las tags que contienen esta clave
      const tagKeys = await redisClient.keys('tag:*');
      
      for (const tagKey of tagKeys) {
        await redisClient.sRem(tagKey, key);
      }
    } catch (error) {
      logger.warn('Error removing cache tags:', error);
    }
  }

  /**
   * Obtener tipo de clave para métricas
   */
  private getKeyType(key: string): string {
    if (key.startsWith('perm:user:')) return 'user_permissions';
    if (key.startsWith('perm:role:')) return 'role_permissions';
    if (key.startsWith('perm:tree')) return 'permission_tree';
    if (key.startsWith('perm:hierarchy:')) return 'role_hierarchy';
    return 'other';
  }

  /**
   * Registrar hit de caché
   */
  private recordHit(responseTime: number): void {
    this.stats.hits++;
    this.recordResponseTime(responseTime);
  }

  /**
   * Registrar miss de caché
   */
  private recordMiss(responseTime: number): void {
    this.stats.misses++;
    this.recordResponseTime(responseTime);
  }

  /**
   * Registrar tiempo de respuesta
   */
  private recordResponseTime(time: number): void {
    this.responseTimes.push(time);
    
    if (this.responseTimes.length > this.maxResponseTimes) {
      this.responseTimes.shift();
    }
  }

  /**
   * Limpiar estadísticas antigas
   */
  private cleanupStats(): void {
    // Resetear estadísticas cada 24 horas
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    
    if (!this.stats.lastReset || (now - this.stats.lastReset) > dayMs) {
      this.stats.hits = 0;
      this.stats.misses = 0;
      this.responseTimes = [];
      this.stats.lastReset = now;
    }
  }

  /**
   * Desconectar servicio de caché
   */
  public async disconnect(): Promise<void> {
    this.initialized = false;
    logger.info('Cache service disconnected');
  }
}

export default CacheService;