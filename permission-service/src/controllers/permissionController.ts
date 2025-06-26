// =====================================================
// PERMISSION CONTROLLER - PERMISSION SERVICE
// =====================================================
// Controlador principal para APIs de permisos

import { Request, Response, NextFunction } from 'express';
import { permissionEngine, PermissionCheck } from '../core/permissionEngine';
import { permissionPropagator } from '../core/permissionPropagator';
import { PermissionCache } from '../config/redis';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { MetricsService } from '../services/metricsService';

export class PermissionController {
  /**
   * Verificar permisos de usuario
   */
  async checkUserPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, permissions, communityId, context } = req.body;

      if (!userId || !permissions) {
        throw new AppError('userId and permissions are required', 400);
      }

      const check: PermissionCheck = {
        userId,
        permissions,
        communityId,
        context
      };

      const result = context 
        ? await permissionEngine.validatePermissionWithContext(check)
        : await permissionEngine.checkPermission(check);

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Verificar permisos masivos
   */
  async checkBulkPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { checks } = req.body;

      if (!Array.isArray(checks) || checks.length === 0) {
        throw new AppError('checks array is required', 400);
      }

      if (checks.length > 1000) {
        throw new AppError('Maximum 1000 checks allowed per request', 400);
      }

      const results = await permissionEngine.checkBulkPermissions(checks);
      
      // Convertir Map a Object para JSON
      const resultsObject = Object.fromEntries(results);

      res.json({
        success: true,
        data: {
          total: checks.length,
          results: resultsObject
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener permisos efectivos de usuario
   */
  async getUserPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params;
      const { communityId, forceRefresh } = req.query;

      if (!userId) {
        throw new AppError('userId is required', 400);
      }

      const permissions = await permissionEngine.getUserPermissions(
        userId,
        communityId as string,
        forceRefresh === 'true'
      );

      res.json({
        success: true,
        data: {
          userId,
          communityId: communityId || null,
          permissions,
          cached: forceRefresh !== 'true',
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener jerarquía de roles
   */
  async getRoleHierarchy(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { roleId } = req.params;
      const { forceRefresh } = req.query;

      if (!roleId) {
        throw new AppError('roleId is required', 400);
      }

      const hierarchy = await permissionEngine.getRoleHierarchy(
        roleId,
        forceRefresh === 'true'
      );

      res.json({
        success: true,
        data: {
          roleId,
          hierarchy,
          cached: forceRefresh !== 'true',
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Invalidar cache de permisos de usuario
   */
  async invalidateUserCache(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params;
      const { communityId } = req.body;

      if (!userId) {
        throw new AppError('userId is required', 400);
      }

      await permissionEngine.invalidateUserPermissions(userId, communityId);

      res.json({
        success: true,
        message: `Cache invalidated for user ${userId}`,
        data: {
          userId,
          communityId: communityId || null,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Invalidar cache de permisos de rol
   */
  async invalidateRoleCache(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { roleId } = req.params;

      if (!roleId) {
        throw new AppError('roleId is required', 400);
      }

      await permissionEngine.invalidateRolePermissions(roleId);

      res.json({
        success: true,
        message: `Cache invalidated for role ${roleId}`,
        data: {
          roleId,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Propagar cambios de rol
   */
  async propagateRoleChanges(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { roleId } = req.params;
      const { changes, communityId, reason } = req.body;

      if (!roleId || !changes) {
        throw new AppError('roleId and changes are required', 400);
      }

      if (!changes.added && !changes.removed && !changes.modified) {
        throw new AppError('At least one change type must be specified', 400);
      }

      const initiatedBy = req.user?.id || 'system';

      await permissionPropagator.propagateRoleChanges(
        roleId,
        {
          added: changes.added || [],
          removed: changes.removed || [],
          modified: changes.modified || []
        },
        initiatedBy,
        communityId
      );

      res.json({
        success: true,
        message: 'Role changes propagation initiated',
        data: {
          roleId,
          changes,
          communityId,
          initiatedBy,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Propagar cambios de permisos de usuario
   */
  async propagateUserPermissionChanges(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params;
      const { changes, communityId, reason } = req.body;

      if (!userId || !changes) {
        throw new AppError('userId and changes are required', 400);
      }

      const initiatedBy = req.user?.id || 'system';

      await permissionPropagator.propagateUserPermissionChanges(
        userId,
        {
          added: changes.added || [],
          removed: changes.removed || [],
          modified: changes.modified || []
        },
        initiatedBy,
        communityId
      );

      res.json({
        success: true,
        message: 'User permission changes propagation initiated',
        data: {
          userId,
          changes,
          communityId,
          initiatedBy,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Iniciar propagación masiva
   */
  async startBulkPropagation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { targets, type, changes } = req.body;

      if (!Array.isArray(targets) || targets.length === 0) {
        throw new AppError('targets array is required', 400);
      }

      if (!['role_permissions', 'user_permissions', 'community_permissions'].includes(type)) {
        throw new AppError('Invalid propagation type', 400);
      }

      if (targets.length > 10000) {
        throw new AppError('Maximum 10000 targets allowed', 400);
      }

      const initiatedBy = req.user?.id || 'system';

      const jobId = await permissionPropagator.propagateBulkChanges(
        targets,
        type,
        changes,
        initiatedBy
      );

      res.json({
        success: true,
        message: 'Bulk propagation job started',
        data: {
          jobId,
          type,
          targets: targets.length,
          initiatedBy,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener estado de job de propagación masiva
   */
  async getBulkPropagationStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId } = req.params;

      if (!jobId) {
        throw new AppError('jobId is required', 400);
      }

      const job = permissionPropagator.getBulkJobStatus(jobId);

      if (!job) {
        throw new AppError('Job not found', 404);
      }

      res.json({
        success: true,
        data: job
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener todos los jobs activos
   */
  async getActivePropagationJobs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const jobs = permissionPropagator.getActiveJobs();

      res.json({
        success: true,
        data: {
          total: jobs.length,
          jobs
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener estadísticas del motor de permisos
   */
  async getEngineStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const engineStats = await permissionEngine.getEngineStats();
      const propagatorStats = permissionPropagator.getStats();
      const metrics = await MetricsService.getMetrics();

      res.json({
        success: true,
        data: {
          engine: engineStats,
          propagator: propagatorStats,
          metrics: metrics,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Health check del servicio de permisos
   */
  async healthCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const engineHealthy = await permissionEngine.healthCheck();
      const cacheStats = await PermissionCache.getCacheStats();

      const health = {
        engine: engineHealthy,
        cache: cacheStats !== null,
        overall: engineHealthy && cacheStats !== null
      };

      const statusCode = health.overall ? 200 : 503;

      res.status(statusCode).json({
        success: health.overall,
        data: {
          service: 'permission-service',
          version: '1.0.0',
          health,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Limpiar cache completo (uso administrativo)
   */
  async clearAllCache(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Solo permitir en desarrollo o con permisos específicos
      if (process.env.NODE_ENV === 'production' && !req.user?.isSuperAdmin) {
        throw new AppError('Operation not allowed in production', 403);
      }

      await PermissionCache.invalidateAllPermissionCache();

      res.json({
        success: true,
        message: 'All permission cache cleared',
        data: {
          timestamp: new Date().toISOString(),
          clearedBy: req.user?.id || 'system'
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Realizar mantenimiento del motor
   */
  async performMaintenance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await permissionEngine.performMaintenance();
      
      // Limpiar jobs completados
      permissionPropagator.cleanupCompletedJobs();

      res.json({
        success: true,
        message: 'Maintenance completed successfully',
        data: {
          timestamp: new Date().toISOString(),
          performedBy: req.user?.id || 'system'
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Validar integridad de permisos
   */
  async validateIntegrity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Esta función se implementaría para validar la consistencia
      // de permisos entre cache y base de datos
      
      res.json({
        success: true,
        message: 'Integrity validation not yet implemented',
        data: {
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      next(error);
    }
  }
}

export const permissionController = new PermissionController();