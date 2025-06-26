// =====================================================
// ROUTES - PERMISSION SERVICE
// =====================================================
// Rutas principales del servicio de permisos

import { Router } from 'express';
import { permissionController } from '../controllers/permissionController';
import { validateRequest } from '../middleware/validation';
import { permissionValidationRules } from '../validators/permissionValidators';
import { rateLimitMiddleware } from '../middleware/rateLimiter';

const router = Router();

// =====================================================
// RUTAS DE VERIFICACIÓN DE PERMISOS
// =====================================================

/**
 * @swagger
 * /permissions/check:
 *   post:
 *     summary: Verificar permisos de usuario
 *     tags: [Permissions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *               permissions:
 *                 oneOf:
 *                   - type: string
 *                   - type: array
 *                     items:
 *                       type: string
 *               communityId:
 *                 type: string
 *                 format: uuid
 *               context:
 *                 type: object
 *     responses:
 *       200:
 *         description: Resultado de verificación de permisos
 */
router.post('/check', 
  rateLimitMiddleware.checkPermissions,
  permissionValidationRules.checkPermissions,
  validateRequest,
  permissionController.checkUserPermissions
);

/**
 * @swagger
 * /permissions/check/bulk:
 *   post:
 *     summary: Verificar permisos masivos
 *     tags: [Permissions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               checks:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                     permissions:
 *                       oneOf:
 *                         - type: string
 *                         - type: array
 *                           items:
 *                             type: string
 *                     communityId:
 *                       type: string
 *     responses:
 *       200:
 *         description: Resultados de verificaciones masivas
 */
router.post('/check/bulk',
  rateLimitMiddleware.bulkOperations,
  permissionValidationRules.bulkPermissionCheck,
  validateRequest,
  permissionController.checkBulkPermissions
);

// =====================================================
// RUTAS DE OBTENCIÓN DE PERMISOS
// =====================================================

/**
 * @swagger
 * /permissions/users/{userId}:
 *   get:
 *     summary: Obtener permisos efectivos de usuario
 *     tags: [Permissions]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: communityId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: forceRefresh
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Permisos efectivos del usuario
 */
router.get('/users/:userId',
  rateLimitMiddleware.getUserPermissions,
  permissionValidationRules.getUserPermissions,
  validateRequest,
  permissionController.getUserPermissions
);

/**
 * @swagger
 * /permissions/roles/{roleId}/hierarchy:
 *   get:
 *     summary: Obtener jerarquía de roles
 *     tags: [Permissions]
 *     parameters:
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: forceRefresh
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Jerarquía de roles
 */
router.get('/roles/:roleId/hierarchy',
  rateLimitMiddleware.getRoleHierarchy,
  permissionValidationRules.getRoleHierarchy,
  validateRequest,
  permissionController.getRoleHierarchy
);

// =====================================================
// RUTAS DE INVALIDACIÓN DE CACHE
// =====================================================

/**
 * @swagger
 * /permissions/cache/users/{userId}/invalidate:
 *   post:
 *     summary: Invalidar cache de permisos de usuario
 *     tags: [Cache]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               communityId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Cache invalidado exitosamente
 */
router.post('/cache/users/:userId/invalidate',
  rateLimitMiddleware.cacheOperations,
  permissionValidationRules.invalidateUserCache,
  validateRequest,
  permissionController.invalidateUserCache
);

/**
 * @swagger
 * /permissions/cache/roles/{roleId}/invalidate:
 *   post:
 *     summary: Invalidar cache de permisos de rol
 *     tags: [Cache]
 *     parameters:
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Cache invalidado exitosamente
 */
router.post('/cache/roles/:roleId/invalidate',
  rateLimitMiddleware.cacheOperations,
  permissionValidationRules.invalidateRoleCache,
  validateRequest,
  permissionController.invalidateRoleCache
);

/**
 * @swagger
 * /permissions/cache/clear:
 *   post:
 *     summary: Limpiar todo el cache de permisos
 *     tags: [Cache]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache limpiado exitosamente
 */
router.post('/cache/clear',
  rateLimitMiddleware.adminOperations,
  permissionController.clearAllCache
);

// =====================================================
// RUTAS DE PROPAGACIÓN
// =====================================================

/**
 * @swagger
 * /permissions/propagate/roles/{roleId}:
 *   post:
 *     summary: Propagar cambios de rol
 *     tags: [Propagation]
 *     parameters:
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               changes:
 *                 type: object
 *                 properties:
 *                   added:
 *                     type: array
 *                     items:
 *                       type: string
 *                   removed:
 *                     type: array
 *                     items:
 *                       type: string
 *                   modified:
 *                     type: array
 *                     items:
 *                       type: string
 *               communityId:
 *                 type: string
 *                 format: uuid
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Propagación iniciada exitosamente
 */
router.post('/propagate/roles/:roleId',
  rateLimitMiddleware.propagationOperations,
  permissionValidationRules.propagateRoleChanges,
  validateRequest,
  permissionController.propagateRoleChanges
);

/**
 * @swagger
 * /permissions/propagate/users/{userId}:
 *   post:
 *     summary: Propagar cambios de permisos de usuario
 *     tags: [Propagation]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               changes:
 *                 type: object
 *                 properties:
 *                   added:
 *                     type: array
 *                     items:
 *                       type: string
 *                   removed:
 *                     type: array
 *                     items:
 *                       type: string
 *                   modified:
 *                     type: array
 *                     items:
 *                       type: string
 *               communityId:
 *                 type: string
 *                 format: uuid
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Propagación iniciada exitosamente
 */
router.post('/propagate/users/:userId',
  rateLimitMiddleware.propagationOperations,
  permissionValidationRules.propagateUserChanges,
  validateRequest,
  permissionController.propagateUserPermissionChanges
);

/**
 * @swagger
 * /permissions/propagate/bulk:
 *   post:
 *     summary: Iniciar propagación masiva
 *     tags: [Propagation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               targets:
 *                 type: array
 *                 items:
 *                   type: string
 *               type:
 *                 type: string
 *                 enum: [role_permissions, user_permissions, community_permissions]
 *               changes:
 *                 type: object
 *     responses:
 *       200:
 *         description: Job de propagación masiva iniciado
 */
router.post('/propagate/bulk',
  rateLimitMiddleware.bulkOperations,
  permissionValidationRules.bulkPropagation,
  validateRequest,
  permissionController.startBulkPropagation
);

/**
 * @swagger
 * /permissions/propagate/jobs/{jobId}:
 *   get:
 *     summary: Obtener estado de job de propagación
 *     tags: [Propagation]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Estado del job de propagación
 */
router.get('/propagate/jobs/:jobId',
  permissionController.getBulkPropagationStatus
);

/**
 * @swagger
 * /permissions/propagate/jobs:
 *   get:
 *     summary: Obtener todos los jobs activos
 *     tags: [Propagation]
 *     responses:
 *       200:
 *         description: Lista de jobs activos
 */
router.get('/propagate/jobs',
  permissionController.getActivePropagationJobs
);

// =====================================================
// RUTAS DE ADMINISTRACIÓN Y MONITOREO
// =====================================================

/**
 * @swagger
 * /permissions/stats:
 *   get:
 *     summary: Obtener estadísticas del motor de permisos
 *     tags: [Administration]
 *     responses:
 *       200:
 *         description: Estadísticas del sistema
 */
router.get('/stats',
  permissionController.getEngineStats
);

/**
 * @swagger
 * /permissions/health:
 *   get:
 *     summary: Health check del servicio
 *     tags: [Administration]
 *     responses:
 *       200:
 *         description: Servicio saludable
 *       503:
 *         description: Servicio no saludable
 */
router.get('/health',
  permissionController.healthCheck
);

/**
 * @swagger
 * /permissions/maintenance:
 *   post:
 *     summary: Realizar mantenimiento del sistema
 *     tags: [Administration]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mantenimiento completado
 */
router.post('/maintenance',
  rateLimitMiddleware.adminOperations,
  permissionController.performMaintenance
);

/**
 * @swagger
 * /permissions/validate/integrity:
 *   post:
 *     summary: Validar integridad de permisos
 *     tags: [Administration]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Validación de integridad completada
 */
router.post('/validate/integrity',
  rateLimitMiddleware.adminOperations,
  permissionController.validateIntegrity
);

export default router;