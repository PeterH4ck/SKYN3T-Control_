// =====================================================
// PERMISSION VALIDATORS - PERMISSION SERVICE
// =====================================================
// Validadores específicos para operaciones de permisos

import { body, param, query, ValidationChain } from 'express-validator';

/**
 * Validador para UUID
 */
const uuidValidator = (field: string) => 
  field.matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    .withMessage(`${field} must be a valid UUID`);

/**
 * Validador para códigos de permisos
 */
const permissionCodeValidator = (field: string) =>
  field.matches(/^[a-z]+(\.[a-z_]+)*$/)
    .withMessage(`${field} must be a valid permission code (e.g., 'users.create', 'admin.*')`);

/**
 * Validaciones para verificación de permisos
 */
export const permissionValidationRules = {
  /**
   * Validar request de verificación de permisos
   */
  checkPermissions: [
    body('userId')
      .isUUID(4)
      .withMessage('userId must be a valid UUID'),
    
    body('permissions')
      .custom((value) => {
        if (typeof value === 'string') {
          return permissionCodeValidator(value);
        }
        if (Array.isArray(value)) {
          if (value.length === 0) {
            throw new Error('permissions array cannot be empty');
          }
          if (value.length > 50) {
            throw new Error('permissions array cannot have more than 50 items');
          }
          value.forEach((perm, index) => {
            if (typeof perm !== 'string') {
              throw new Error(`permissions[${index}] must be a string`);
            }
            if (!/^[a-z]+(\.[a-z_*]+)*$/.test(perm)) {
              throw new Error(`permissions[${index}] must be a valid permission code`);
            }
          });
          return true;
        }
        throw new Error('permissions must be a string or array of strings');
      }),
    
    body('communityId')
      .optional()
      .isUUID(4)
      .withMessage('communityId must be a valid UUID'),
    
    body('context')
      .optional()
      .isObject()
      .withMessage('context must be an object'),
    
    body('context.timeRestricted')
      .optional()
      .isBoolean()
      .withMessage('context.timeRestricted must be a boolean'),
    
    body('context.validFrom')
      .optional()
      .isISO8601()
      .withMessage('context.validFrom must be a valid ISO 8601 date'),
    
    body('context.validUntil')
      .optional()
      .isISO8601()
      .withMessage('context.validUntil must be a valid ISO 8601 date'),
    
    body('context.locationRestricted')
      .optional()
      .isBoolean()
      .withMessage('context.locationRestricted must be a boolean'),
    
    body('context.ipRestricted')
      .optional()
      .isBoolean()
      .withMessage('context.ipRestricted must be a boolean')
  ],

  /**
   * Validar request de verificación masiva de permisos
   */
  bulkPermissionCheck: [
    body('checks')
      .isArray({ min: 1, max: 1000 })
      .withMessage('checks must be an array with 1-1000 items'),
    
    body('checks.*.userId')
      .isUUID(4)
      .withMessage('Each check must have a valid userId UUID'),
    
    body('checks.*.permissions')
      .custom((value) => {
        if (typeof value === 'string') {
          if (!/^[a-z]+(\.[a-z_*]+)*$/.test(value)) {
            throw new Error('Permission must be a valid permission code');
          }
          return true;
        }
        if (Array.isArray(value)) {
          if (value.length === 0) {
            throw new Error('Permissions array cannot be empty');
          }
          if (value.length > 20) {
            throw new Error('Permissions array cannot have more than 20 items');
          }
          value.forEach((perm) => {
            if (typeof perm !== 'string' || !/^[a-z]+(\.[a-z_*]+)*$/.test(perm)) {
              throw new Error('Each permission must be a valid permission code');
            }
          });
          return true;
        }
        throw new Error('Permissions must be a string or array of strings');
      }),
    
    body('checks.*.communityId')
      .optional()
      .isUUID(4)
      .withMessage('communityId must be a valid UUID')
  ],

  /**
   * Validar obtención de permisos de usuario
   */
  getUserPermissions: [
    param('userId')
      .isUUID(4)
      .withMessage('userId must be a valid UUID'),
    
    query('communityId')
      .optional()
      .isUUID(4)
      .withMessage('communityId must be a valid UUID'),
    
    query('forceRefresh')
      .optional()
      .isBoolean()
      .withMessage('forceRefresh must be a boolean')
  ],

  /**
   * Validar obtención de jerarquía de roles
   */
  getRoleHierarchy: [
    param('roleId')
      .isUUID(4)
      .withMessage('roleId must be a valid UUID'),
    
    query('forceRefresh')
      .optional()
      .isBoolean()
      .withMessage('forceRefresh must be a boolean')
  ],

  /**
   * Validar invalidación de cache de usuario
   */
  invalidateUserCache: [
    param('userId')
      .isUUID(4)
      .withMessage('userId must be a valid UUID'),
    
    body('communityId')
      .optional()
      .isUUID(4)
      .withMessage('communityId must be a valid UUID')
  ],

  /**
   * Validar invalidación de cache de rol
   */
  invalidateRoleCache: [
    param('roleId')
      .isUUID(4)
      .withMessage('roleId must be a valid UUID')
  ],

  /**
   * Validar propagación de cambios de rol
   */
  propagateRoleChanges: [
    param('roleId')
      .isUUID(4)
      .withMessage('roleId must be a valid UUID'),
    
    body('changes')
      .isObject()
      .withMessage('changes must be an object'),
    
    body('changes.added')
      .optional()
      .isArray()
      .withMessage('changes.added must be an array'),
    
    body('changes.added.*')
      .optional()
      .custom((value) => {
        if (!/^[a-z]+(\.[a-z_*]+)*$/.test(value)) {
          throw new Error('Each added permission must be a valid permission code');
        }
        return true;
      }),
    
    body('changes.removed')
      .optional()
      .isArray()
      .withMessage('changes.removed must be an array'),
    
    body('changes.removed.*')
      .optional()
      .custom((value) => {
        if (!/^[a-z]+(\.[a-z_*]+)*$/.test(value)) {
          throw new Error('Each removed permission must be a valid permission code');
        }
        return true;
      }),
    
    body('changes.modified')
      .optional()
      .isArray()
      .withMessage('changes.modified must be an array'),
    
    body('changes.modified.*')
      .optional()
      .custom((value) => {
        if (!/^[a-z]+(\.[a-z_*]+)*$/.test(value)) {
          throw new Error('Each modified permission must be a valid permission code');
        }
        return true;
      }),
    
    body('communityId')
      .optional()
      .isUUID(4)
      .withMessage('communityId must be a valid UUID'),
    
    body('reason')
      .optional()
      .isString()
      .isLength({ max: 500 })
      .withMessage('reason must be a string with max 500 characters')
  ],

  /**
   * Validar propagación de cambios de usuario
   */
  propagateUserChanges: [
    param('userId')
      .isUUID(4)
      .withMessage('userId must be a valid UUID'),
    
    body('changes')
      .isObject()
      .withMessage('changes must be an object'),
    
    body('changes.added')
      .optional()
      .isArray()
      .withMessage('changes.added must be an array'),
    
    body('changes.added.*')
      .optional()
      .custom((value) => {
        if (!/^[a-z]+(\.[a-z_*]+)*$/.test(value)) {
          throw new Error('Each added permission must be a valid permission code');
        }
        return true;
      }),
    
    body('changes.removed')
      .optional()
      .isArray()
      .withMessage('changes.removed must be an array'),
    
    body('changes.removed.*')
      .optional()
      .custom((value) => {
        if (!/^[a-z]+(\.[a-z_*]+)*$/.test(value)) {
          throw new Error('Each removed permission must be a valid permission code');
        }
        return true;
      }),
    
    body('changes.modified')
      .optional()
      .isArray()
      .withMessage('changes.modified must be an array'),
    
    body('changes.modified.*')
      .optional()
      .custom((value) => {
        if (!/^[a-z]+(\.[a-z_*]+)*$/.test(value)) {
          throw new Error('Each modified permission must be a valid permission code');
        }
        return true;
      }),
    
    body('communityId')
      .optional()
      .isUUID(4)
      .withMessage('communityId must be a valid UUID'),
    
    body('reason')
      .optional()
      .isString()
      .isLength({ max: 500 })
      .withMessage('reason must be a string with max 500 characters')
  ],

  /**
   * Validar propagación masiva
   */
  bulkPropagation: [
    body('targets')
      .isArray({ min: 1, max: 10000 })
      .withMessage('targets must be an array with 1-10000 items'),
    
    body('targets.*')
      .isUUID(4)
      .withMessage('Each target must be a valid UUID'),
    
    body('type')
      .isIn(['role_permissions', 'user_permissions', 'community_permissions'])
      .withMessage('type must be one of: role_permissions, user_permissions, community_permissions'),
    
    body('changes')
      .isObject()
      .withMessage('changes must be an object')
  ],

  /**
   * Validar parámetros de paginación
   */
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('page must be a positive integer'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('limit must be between 1 and 1000'),
    
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('offset must be a non-negative integer')
  ],

  /**
   * Validar filtros de búsqueda
   */
  searchFilters: [
    query('search')
      .optional()
      .isString()
      .isLength({ min: 2, max: 100 })
      .withMessage('search must be between 2 and 100 characters'),
    
    query('module')
      .optional()
      .matches(/^[a-z]+$/)
      .withMessage('module must contain only lowercase letters'),
    
    query('riskLevel')
      .optional()
      .isIn(['low', 'medium', 'high', 'critical'])
      .withMessage('riskLevel must be one of: low, medium, high, critical'),
    
    query('sortBy')
      .optional()
      .isIn(['name', 'code', 'module', 'created_at', 'updated_at'])
      .withMessage('sortBy must be one of: name, code, module, created_at, updated_at'),
    
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('sortOrder must be either asc or desc')
  ]
};

/**
 * Validaciones adicionales para operaciones específicas
 */
export const additionalValidations = {
  /**
   * Validar estructura de permisos complejos
   */
  complexPermissionStructure: [
    body('permissions')
      .custom((permissions) => {
        if (!Array.isArray(permissions)) {
          throw new Error('permissions must be an array');
        }

        permissions.forEach((permission, index) => {
          if (!permission.id || !permission.code) {
            throw new Error(`permissions[${index}] must have id and code fields`);
          }

          if (!permission.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
            throw new Error(`permissions[${index}].id must be a valid UUID`);
          }

          if (!permission.code.match(/^[a-z]+(\.[a-z_*]+)*$/)) {
            throw new Error(`permissions[${index}].code must be a valid permission code`);
          }

          if (permission.dependencies && !Array.isArray(permission.dependencies)) {
            throw new Error(`permissions[${index}].dependencies must be an array`);
          }

          if (permission.riskLevel && !['low', 'medium', 'high', 'critical'].includes(permission.riskLevel)) {
            throw new Error(`permissions[${index}].riskLevel must be one of: low, medium, high, critical`);
          }
        });

        return true;
      })
  ],

  /**
   * Validar jerarquía de roles
   */
  roleHierarchy: [
    body('roles')
      .isArray()
      .withMessage('roles must be an array'),
    
    body('roles.*.id')
      .isUUID(4)
      .withMessage('Each role must have a valid UUID'),
    
    body('roles.*.code')
      .matches(/^[A-Z_]+$/)
      .withMessage('Role code must contain only uppercase letters and underscores'),
    
    body('roles.*.level')
      .isInt({ min: 0, max: 10 })
      .withMessage('Role level must be between 0 and 10'),
    
    body('roles.*.parentRoleId')
      .optional()
      .isUUID(4)
      .withMessage('Parent role ID must be a valid UUID')
  ],

  /**
   * Validar configuración de cache
   */
  cacheConfiguration: [
    body('ttl')
      .optional()
      .isInt({ min: 60, max: 86400 })
      .withMessage('TTL must be between 60 and 86400 seconds'),
    
    body('strategy')
      .optional()
      .isIn(['cache-aside', 'write-through', 'write-behind'])
      .withMessage('Cache strategy must be one of: cache-aside, write-through, write-behind'),
    
    body('enabled')
      .optional()
      .isBoolean()
      .withMessage('enabled must be a boolean')
  ],

  /**
   * Validar configuración de propagación
   */
  propagationConfiguration: [
    body('batchSize')
      .optional()
      .isInt({ min: 10, max: 1000 })
      .withMessage('Batch size must be between 10 and 1000'),
    
    body('delayMs')
      .optional()
      .isInt({ min: 0, max: 10000 })
      .withMessage('Delay must be between 0 and 10000 milliseconds'),
    
    body('retryAttempts')
      .optional()
      .isInt({ min: 0, max: 5 })
      .withMessage('Retry attempts must be between 0 and 5'),
    
    body('timeout')
      .optional()
      .isInt({ min: 1000, max: 300000 })
      .withMessage('Timeout must be between 1000 and 300000 milliseconds')
  ]
};

/**
 * Validaciones específicas por contexto
 */
export const contextualValidations = {
  /**
   * Validaciones para modo de desarrollo
   */
  development: [
    body('debug')
      .optional()
      .isBoolean()
      .withMessage('debug must be a boolean'),
    
    body('skipCache')
      .optional()
      .isBoolean()
      .withMessage('skipCache must be a boolean')
  ],

  /**
   * Validaciones para modo de producción
   */
  production: [
    body('reason')
      .notEmpty()
      .isLength({ min: 10, max: 500 })
      .withMessage('reason is required in production and must be 10-500 characters'),
    
    body('approvedBy')
      .optional()
      .isUUID(4)
      .withMessage('approvedBy must be a valid UUID')
  ],

  /**
   * Validaciones para operaciones de emergencia
   */
  emergency: [
    body('emergencyCode')
      .notEmpty()
      .isLength({ min: 8, max: 32 })
      .withMessage('Emergency code is required and must be 8-32 characters'),
    
    body('emergencyReason')
      .notEmpty()
      .isLength({ min: 20, max: 1000 })
      .withMessage('Emergency reason must be 20-1000 characters')
  ]
};

/**
 * Función helper para combinar validaciones
 */
export function combineValidations(...validationGroups: ValidationChain[][]): ValidationChain[] {
  return validationGroups.flat();
}

/**
 * Función helper para validaciones condicionales
 */
export function conditionalValidations(
  condition: string,
  validations: ValidationChain[]
): ValidationChain[] {
  return validations.map(validation => 
    validation.if(body(condition).exists())
  );
}

/**
 * Validaciones personalizadas comunes
 */
export const customValidators = {
  /**
   * Validar que no existan referencias circulares en roles
   */
  noCircularReferences: (value: any, { req }: any) => {
    // Implementar lógica de validación de referencias circulares
    // Esta sería una validación compleja que requeriría acceso a la base de datos
    return true;
  },

  /**
   * Validar que las dependencias de permisos existan
   */
  dependenciesExist: (value: any, { req }: any) => {
    // Implementar validación de existencia de dependencias
    return true;
  },

  /**
   * Validar límites de operaciones masivas
   */
  withinBulkLimits: (value: any, { req }: any) => {
    if (Array.isArray(value) && value.length > 10000) {
      throw new Error('Bulk operations are limited to 10000 items');
    }
    return true;
  }
};

export default permissionValidationRules;