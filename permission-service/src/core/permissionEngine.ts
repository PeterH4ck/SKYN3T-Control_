// =====================================================
// PERMISSION ENGINE - SKYN3T ACCESS CONTROL
// =====================================================
// Motor de permisos granulares con RBAC y cache distribuido

import { getUserEffectivePermissions, getRoleHierarchy, checkPermissionDependencies } from '../config/database';
import { PermissionCache } from '../config/redis';
import { config, cacheTTL } from '../config/config';
import { logger } from '../utils/logger';
import { MetricsService } from '../services/metricsService';

export interface Permission {
  id: string;
  code: string;
  module: string;
  action: string;
  name: string;
  description?: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  dependencies: string[];
  ui_elements: string[];
  api_endpoints: string[];
  metadata: any;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  level: number;
  parent_role_id?: string;
  is_system: boolean;
  permissions: Permission[];
}

export interface PermissionCheck {
  userId: string;
  permissions: string | string[];
  communityId?: string;
  context?: any;
}

export interface PermissionResult {
  granted: boolean;
  permissions: string[];
  missing: string[];
  reason?: string;
  cached: boolean;
  calculationTime: number;
}

/**
 * Motor de permisos granulares con cache distribuido
 */
export class PermissionEngine {
  private static instance: PermissionEngine;
  private initialized: boolean = false;

  private constructor() {}

  /**
   * Singleton instance
   */
  public static getInstance(): PermissionEngine {
    if (!PermissionEngine.instance) {
      PermissionEngine.instance = new PermissionEngine();
    }
    return PermissionEngine.instance;
  }

  /**
   * Inicializar el motor de permisos
   */
  public static async initialize(): Promise<void> {
    const engine = PermissionEngine.getInstance();
    
    if (engine.initialized) {
      return;
    }

    try {
      logger.info('🔐 Initializing Permission Engine...');
      
      // Precarga de datos críticos
      await engine.preloadCriticalData();
      
      engine.initialized = true;
      logger.info('✅ Permission Engine initialized successfully');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Permission Engine:', error);
      throw error;
    }
  }

  /**
   * Precargar datos críticos en cache
   */
  private async preloadCriticalData(): Promise<void> {
    try {
      // Verificar si el árbol de permisos ya está en cache
      const cachedTree = await PermissionCache.getPermissionTree();
      
      if (!cachedTree) {
        logger.info('🔄 Preloading permission tree...');
        // Aquí cargaríamos desde la BD si fuera necesario
        // Por ahora, el tree se carga dinámicamente
      }

    } catch (error) {
      logger.warn('Warning during preload:', error);
      // No fallar la inicialización por errores de precarga
    }
  }

  /**
   * Verificar si un usuario tiene un permiso específico
   */
  public async checkPermission(check: PermissionCheck): Promise<PermissionResult> {
    const startTime = Date.now();
    const requiredPermissions = Array.isArray(check.permissions) ? check.permissions : [check.permissions];
    
    try {
      MetricsService.incrementCounter('permission_calculations_total');
      
      // Obtener permisos del usuario
      const userPermissions = await this.getUserPermissions(check.userId, check.communityId);
      
      // Verificar permisos especiales
      const hasWildcard = userPermissions.includes('*');
      const hasAdminWildcard = userPermissions.includes('admin.*');
      
      if (hasWildcard) {
        return {
          granted: true,
          permissions: userPermissions,
          missing: [],
          reason: 'Super admin privileges',
          cached: true,
          calculationTime: Date.now() - startTime
        };
      }

      // Verificar cada permiso requerido
      const missing: string[] = [];
      
      for (const permission of requiredPermissions) {
        const hasPermission = this.hasPermission(userPermissions, permission, hasAdminWildcard);
        
        if (!hasPermission) {
          missing.push(permission);
        }
      }

      const granted = missing.length === 0;
      
      const result: PermissionResult = {
        granted,
        permissions: userPermissions,
        missing,
        reason: granted ? 'Permission granted' : `Missing permissions: ${missing.join(', ')}`,
        cached: true,
        calculationTime: Date.now() - startTime
      };

      // Métricas
      if (granted) {
        MetricsService.incrementCounter('permission_checks_granted_total');
      } else {
        MetricsService.incrementCounter('permission_checks_denied_total');
      }

      MetricsService.observeHistogram('permission_calculation_duration_seconds', 
        (Date.now() - startTime) / 1000);

      return result;

    } catch (error) {
      logger.error('Error checking permission:', error);
      MetricsService.incrementCounter('permission_errors_total');
      
      return {
        granted: false,
        permissions: [],
        missing: requiredPermissions,
        reason: `Error: ${error.message}`,
        cached: false,
        calculationTime: Date.now() - startTime
      };
    }
  }

  /**
   * Verificar múltiples permisos para múltiples usuarios (bulk)
   */
  public async checkBulkPermissions(
    checks: PermissionCheck[]
  ): Promise<Map<string, PermissionResult>> {
    const results = new Map<string, PermissionResult>();
    
    try {
      MetricsService.incrementCounter('permission_bulk_operations_total');
      
      // Procesar en lotes para evitar sobrecarga
      const batchSize = config.BATCH_SIZE;
      
      for (let i = 0; i < checks.length; i += batchSize) {
        const batch = checks.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (check) => {
          const key = `${check.userId}:${check.communityId || 'global'}:${JSON.stringify(check.permissions)}`;
          const result = await this.checkPermission(check);
          return { key, result };
        });

        const batchResults = await Promise.all(batchPromises);
        
        batchResults.forEach(({ key, result }) => {
          results.set(key, result);
        });
      }

      return results;

    } catch (error) {
      logger.error('Error in bulk permission check:', error);
      throw error;
    }
  }

  /**
   * Obtener permisos efectivos de un usuario
   */
  public async getUserPermissions(
    userId: string, 
    communityId?: string,
    forceRefresh: boolean = false
  ): Promise<string[]> {
    try {
      // Intentar obtener del cache si no es refresh forzado
      if (!forceRefresh) {
        const cached = await PermissionCache.getUserPermissions(userId, communityId);
        if (cached) {
          MetricsService.incrementCounter('permission_cache_hits_total');
          return cached;
        }
      }

      MetricsService.incrementCounter('permission_cache_misses_total');
      MetricsService.incrementCounter('permission_db_queries_total');

      // Calcular permisos desde la base de datos
      const permissions = await this.calculateUserPermissions(userId, communityId);
      
      // Guardar en cache
      await PermissionCache.setUserPermissions(userId, permissions, communityId, cacheTTL.medium);
      
      return permissions;

    } catch (error) {
      logger.error('Error getting user permissions:', error);
      throw error;
    }
  }

  /**
   * Calcular permisos efectivos desde la base de datos
   */
  private async calculateUserPermissions(
    userId: string, 
    communityId?: string
  ): Promise<string[]> {
    try {
      // Usar función optimizada de la base de datos
      const dbResult = await getUserEffectivePermissions(userId, communityId);
      
      const permissions = dbResult.map((row: any) => row.code);
      
      // Verificar dependencias de permisos
      if (permissions.length > 0) {
        const dependencyCheck = await checkPermissionDependencies(permissions);
        
        // Filtrar permisos que no cumplen dependencias
        const validPermissions = permissions.filter(permission => {
          const depInfo = dependencyCheck.find((dep: any) => dep.code === permission);
          return !depInfo || depInfo.dependencies_met;
        });

        return validPermissions;
      }

      return permissions;

    } catch (error) {
      logger.error('Error calculating user permissions:', error);
      return [];
    }
  }

  /**
   * Verificar si un conjunto de permisos incluye uno específico
   */
  private hasPermission(
    userPermissions: string[], 
    requiredPermission: string, 
    hasAdminWildcard: boolean = false
  ): boolean {
    // Verificar permiso exacto
    if (userPermissions.includes(requiredPermission)) {
      return true;
    }

    // Verificar wildcards de admin
    if (hasAdminWildcard && requiredPermission.startsWith('admin.')) {
      return true;
    }

    // Verificar wildcards de módulo
    const [module] = requiredPermission.split('.');
    if (userPermissions.includes(`${module}.*`)) {
      return true;
    }

    // Verificar patrones jerárquicos
    const parts = requiredPermission.split('.');
    for (let i = parts.length - 1; i > 0; i--) {
      const pattern = parts.slice(0, i).join('.') + '.*';
      if (userPermissions.includes(pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Obtener jerarquía de roles con cache
   */
  public async getRoleHierarchy(
    roleId: string,
    forceRefresh: boolean = false
  ): Promise<any[]> {
    try {
      // Intentar obtener del cache
      if (!forceRefresh) {
        const cached = await PermissionCache.getRoleHierarchy(roleId);
        if (cached) {
          return cached;
        }
      }

      // Calcular desde la base de datos
      const hierarchy = await getRoleHierarchy(roleId);
      
      // Guardar en cache
      await PermissionCache.setRoleHierarchy(roleId, hierarchy, cacheTTL.long);
      
      return hierarchy;

    } catch (error) {
      logger.error('Error getting role hierarchy:', error);
      return [];
    }
  }

  /**
   * Validar permisos con contexto adicional
   */
  public async validatePermissionWithContext(
    check: PermissionCheck
  ): Promise<PermissionResult> {
    const result = await this.checkPermission(check);
    
    if (!result.granted) {
      return result;
    }

    // Validaciones adicionales basadas en contexto
    if (check.context) {
      // Verificar restricciones de tiempo
      if (check.context.timeRestricted) {
        const now = new Date();
        const validFrom = check.context.validFrom ? new Date(check.context.validFrom) : null;
        const validUntil = check.context.validUntil ? new Date(check.context.validUntil) : null;
        
        if (validFrom && now < validFrom) {
          result.granted = false;
          result.reason = 'Permission not yet valid';
          return result;
        }
        
        if (validUntil && now > validUntil) {
          result.granted = false;
          result.reason = 'Permission expired';
          return result;
        }
      }

      // Verificar restricciones por ubicación
      if (check.context.locationRestricted && check.context.currentLocation) {
        // Implementar lógica de geolocalización
        // Por ahora solo log
        logger.debug('Location validation not implemented');
      }

      // Verificar restricciones por IP
      if (check.context.ipRestricted && check.context.clientIP) {
        // Implementar lógica de IP whitelisting
        logger.debug('IP validation not implemented');
      }
    }

    return result;
  }

  /**
   * Invalidar cache de permisos de usuario
   */
  public async invalidateUserPermissions(
    userId: string, 
    communityId?: string
  ): Promise<void> {
    try {
      await PermissionCache.invalidateUserCache(userId, communityId);
      MetricsService.incrementCounter('permission_cache_invalidations_total');
      
      logger.info(`Invalidated permissions cache for user ${userId}`);
    } catch (error) {
      logger.error('Error invalidating user permissions:', error);
    }
  }

  /**
   * Invalidar cache de permisos de rol
   */
  public async invalidateRolePermissions(roleId: string): Promise<void> {
    try {
      await PermissionCache.invalidateRoleCache(roleId);
      MetricsService.incrementCounter('permission_cache_invalidations_total');
      
      logger.info(`Invalidated permissions cache for role ${roleId}`);
    } catch (error) {
      logger.error('Error invalidating role permissions:', error);
    }
  }

  /**
   * Obtener estadísticas del motor de permisos
   */
  public async getEngineStats(): Promise<any> {
    try {
      const cacheStats = await PermissionCache.getCacheStats();
      
      return {
        engine: {
          initialized: this.initialized,
          version: '1.0.0'
        },
        cache: cacheStats,
        config: {
          cache_ttl_medium: cacheTTL.medium,
          cache_ttl_long: cacheTTL.long,
          max_permission_depth: config.MAX_PERMISSION_DEPTH,
          batch_size: config.BATCH_SIZE
        }
      };
    } catch (error) {
      logger.error('Error getting engine stats:', error);
      return null;
    }
  }

  /**
   * Realizar mantenimiento del cache
   */
  public async performMaintenance(): Promise<void> {
    try {
      logger.info('🔧 Performing permission engine maintenance...');
      
      // Limpiar locks expirados
      // await this.cleanupExpiredLocks();
      
      // Validar integridad del cache
      // await this.validateCacheIntegrity();
      
      logger.info('✅ Permission engine maintenance completed');
      
    } catch (error) {
      logger.error('❌ Error during maintenance:', error);
    }
  }

  /**
   * Verificar si el motor está saludable
   */
  public async healthCheck(): Promise<boolean> {
    try {
      if (!this.initialized) {
        return false;
      }

      // Verificar conectividad de cache
      const cacheHealthy = await PermissionCache.getCacheStats();
      
      return cacheHealthy !== null;
      
    } catch (error) {
      logger.error('Permission engine health check failed:', error);
      return false;
    }
  }
}

// Exportar funciones convenientes
export const permissionEngine = PermissionEngine.getInstance();

/**
 * Función de conveniencia para verificar permisos
 */
export async function hasPermission(
  userId: string,
  permission: string | string[],
  communityId?: string
): Promise<boolean> {
  const result = await permissionEngine.checkPermission({
    userId,
    permissions: permission,
    communityId
  });
  
  return result.granted;
}

/**
 * Función de conveniencia para obtener permisos de usuario
 */
export async function getUserPermissions(
  userId: string,
  communityId?: string
): Promise<string[]> {
  return await permissionEngine.getUserPermissions(userId, communityId);
}