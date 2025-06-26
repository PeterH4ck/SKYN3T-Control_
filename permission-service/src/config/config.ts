// =====================================================
// CONFIGURATION - PERMISSION SERVICE
// =====================================================
// Configuración centralizada del servicio de permisos

import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

interface Config {
  // Configuración general
  NODE_ENV: string;
  PORT: number;
  SERVICE_NAME: string;
  
  // URLs y endpoints
  FRONTEND_URL: string;
  
  // Base de datos
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_POOL_MIN: number;
  DB_POOL_MAX: number;
  DB_TIMEOUT: number;
  
  // Redis
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD: string;
  REDIS_DB: number;
  
  // RabbitMQ
  RABBITMQ_URL: string;
  RABBITMQ_EXCHANGE: string;
  RABBITMQ_QUEUE: string;
  
  // JWT
  JWT_SECRET: string;
  JWT_EXPIRE: string;
  
  // Cache
  CACHE_TTL_SHORT: number;
  CACHE_TTL_MEDIUM: number;
  CACHE_TTL_LONG: number;
  
  // Logging
  LOG_LEVEL: string;
  LOG_TO_FILE: boolean;
  LOG_FILE_PATH: string;
  
  // Métricas
  METRICS_ENABLED: boolean;
  
  // Performance
  PERMISSION_CALC_TIMEOUT: number;
  MAX_PERMISSION_DEPTH: number;
  BATCH_SIZE: number;
}

const config: Config = {
  // Configuración general
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3002', 10),
  SERVICE_NAME: 'permission-service',
  
  // URLs
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  
  // Base de datos
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT || '5432', 10),
  DB_NAME: process.env.DB_NAME || 'master_db',
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD || 'postgres123',
  DB_POOL_MIN: parseInt(process.env.DB_POOL_MIN || '2', 10),
  DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX || '20', 10),
  DB_TIMEOUT: parseInt(process.env.DB_TIMEOUT || '30000', 10),
  
  // Redis
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || 'redis123',
  REDIS_DB: parseInt(process.env.REDIS_DB || '1', 10), // DB específica para permisos
  
  // RabbitMQ
  RABBITMQ_URL: process.env.RABBITMQ_URL || 'amqp://admin:rabbitmq123@localhost:5672/skyn3t',
  RABBITMQ_EXCHANGE: 'permissions.events',
  RABBITMQ_QUEUE: 'permissions.queue',
  
  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'your-jwt-secret-here',
  JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
  
  // Cache TTL (en segundos)
  CACHE_TTL_SHORT: parseInt(process.env.CACHE_TTL_SHORT || '60', 10), // 1 minuto
  CACHE_TTL_MEDIUM: parseInt(process.env.CACHE_TTL_MEDIUM || '300', 10), // 5 minutos
  CACHE_TTL_LONG: parseInt(process.env.CACHE_TTL_LONG || '3600', 10), // 1 hora
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_TO_FILE: process.env.LOG_TO_FILE === 'true',
  LOG_FILE_PATH: process.env.LOG_FILE_PATH || '/app/logs',
  
  // Métricas
  METRICS_ENABLED: process.env.METRICS_ENABLED !== 'false',
  
  // Performance
  PERMISSION_CALC_TIMEOUT: parseInt(process.env.PERMISSION_CALC_TIMEOUT || '5000', 10), // 5 segundos
  MAX_PERMISSION_DEPTH: parseInt(process.env.MAX_PERMISSION_DEPTH || '10', 10), // Máximo 10 niveles de jerarquía
  BATCH_SIZE: parseInt(process.env.BATCH_SIZE || '100', 10) // Tamaño de lote para operaciones masivas
};

// Validaciones de configuración
function validateConfig(): void {
  const required = [
    'DB_HOST',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'REDIS_HOST',
    'JWT_SECRET'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (config.PORT < 1000 || config.PORT > 65535) {
    throw new Error('PORT must be between 1000 and 65535');
  }

  if (config.DB_POOL_MIN >= config.DB_POOL_MAX) {
    throw new Error('DB_POOL_MIN must be less than DB_POOL_MAX');
  }

  if (config.MAX_PERMISSION_DEPTH < 1 || config.MAX_PERMISSION_DEPTH > 20) {
    throw new Error('MAX_PERMISSION_DEPTH must be between 1 and 20');
  }
}

// Ejecutar validaciones en producción
if (config.NODE_ENV === 'production') {
  validateConfig();
}

// Cache keys
export const cacheKeys = {
  userPermissions: (userId: string, communityId?: string) => 
    `perm:user:${userId}:${communityId || 'global'}`,
  
  rolePermissions: (roleId: string) => 
    `perm:role:${roleId}`,
  
  permissionTree: () => 
    'perm:tree',
  
  roleHierarchy: (roleId: string) => 
    `perm:hierarchy:${roleId}`,
  
  userRoles: (userId: string, communityId?: string) => 
    `roles:user:${userId}:${communityId || 'global'}`,
  
  communityPermissions: (communityId: string) => 
    `perm:community:${communityId}`,
  
  permissionDependencies: (permissionCode: string) => 
    `perm:deps:${permissionCode}`,
  
  bulkOperation: (operationId: string) => 
    `perm:bulk:${operationId}`
};

// Cache TTL mapping
export const cacheTTL = {
  short: config.CACHE_TTL_SHORT,
  medium: config.CACHE_TTL_MEDIUM,
  long: config.CACHE_TTL_LONG
};

// Eventos de RabbitMQ
export const events = {
  PERMISSION_UPDATED: 'permission.updated',
  ROLE_UPDATED: 'role.updated',
  USER_PERMISSION_CHANGED: 'user.permission.changed',
  BULK_PERMISSION_UPDATE: 'bulk.permission.update',
  PERMISSION_CACHE_INVALIDATED: 'permission.cache.invalidated'
};

// Métricas
export const metrics = {
  PERMISSION_CALCULATIONS: 'permission_calculations_total',
  CACHE_HITS: 'permission_cache_hits_total',
  CACHE_MISSES: 'permission_cache_misses_total',
  DB_QUERIES: 'permission_db_queries_total',
  PROPAGATION_TIME: 'permission_propagation_duration_seconds',
  BULK_OPERATIONS: 'permission_bulk_operations_total'
};

export { config };