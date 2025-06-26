// =====================================================
// DATABASE CONNECTION - PERMISSION SERVICE
// =====================================================
// Configuración y conexión a PostgreSQL

import { Pool, PoolClient, PoolConfig } from 'pg';
import { config } from './config';
import { logger } from '../utils/logger';

// Configuración del pool de conexiones
const poolConfig: PoolConfig = {
  host: config.DB_HOST,
  port: config.DB_PORT,
  database: config.DB_NAME,
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  min: config.DB_POOL_MIN,
  max: config.DB_POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: config.DB_TIMEOUT,
  
  // Configuraciones específicas para PostgreSQL
  ssl: config.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false,
  
  // Configurar parser para tipos de datos
  types: {
    setTypeParser: (typeId: number, parseFn: (value: string) => any) => {
      // Parsear UUID como string
      if (typeId === 2950) {
        return (value: string) => value;
      }
      return parseFn;
    }
  }
};

// Crear pool de conexiones
let pool: Pool;

/**
 * Conectar a la base de datos
 */
export async function connectDatabase(): Promise<void> {
  try {
    pool = new Pool(poolConfig);
    
    // Probar conexión
    const client = await pool.connect();
    
    // Verificar que las tablas principales existan
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'roles', 'permissions', 'user_roles', 'role_permissions')
    `);
    
    client.release();
    
    if (result.rows.length < 5) {
      throw new Error('Required tables not found. Please run migrations first.');
    }
    
    logger.info(`📦 Database connected to ${config.DB_HOST}:${config.DB_PORT}/${config.DB_NAME}`);
    
    // Configurar eventos del pool
    pool.on('connect', (client) => {
      logger.debug('New database client connected');
    });
    
    pool.on('error', (err) => {
      logger.error('Database pool error:', err);
    });
    
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    throw error;
  }
}

/**
 * Obtener una conexión del pool
 */
export async function getConnection(): Promise<PoolClient> {
  if (!pool) {
    throw new Error('Database not connected. Call connectDatabase() first.');
  }
  
  return await pool.connect();
}

/**
 * Ejecutar una query simple
 */
export async function query(text: string, params?: any[]): Promise<any> {
  const client = await getConnection();
  
  try {
    const start = Date.now();
    const result = await client.query(text, params);
    const duration = Date.now() - start;
    
    logger.debug(`Query executed in ${duration}ms: ${text.substring(0, 100)}...`);
    
    return result;
  } finally {
    client.release();
  }
}

/**
 * Ejecutar múltiples queries en una transacción
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getConnection();
  
  try {
    await client.query('BEGIN');
    
    const result = await callback(client);
    
    await client.query('COMMIT');
    return result;
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Cerrar todas las conexiones
 */
export async function disconnectDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    logger.info('📦 Database disconnected');
  }
}

/**
 * Health check de la base de datos
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const result = await query('SELECT 1 as health');
    return result.rows[0].health === 1;
  } catch (error) {
    logger.error('Database health check failed:', error);
    return false;
  }
}

/**
 * Obtener estadísticas del pool
 */
export function getPoolStats() {
  if (!pool) {
    return null;
  }
  
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  };
}

// =====================================================
// CONSULTAS ESPECÍFICAS PARA PERMISOS
// =====================================================

/**
 * Obtener permisos efectivos de un usuario
 */
export async function getUserEffectivePermissions(
  userId: string, 
  communityId?: string
): Promise<any[]> {
  const query = `
    WITH RECURSIVE role_hierarchy AS (
      -- Roles directos del usuario
      SELECT ur.role_id, r.code, r.level, r.parent_role_id
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1 
        AND ur.is_active = true
        AND ($2::uuid IS NULL OR ur.community_id = $2 OR ur.community_id IS NULL)
      
      UNION ALL
      
      -- Roles heredados
      SELECT r.id, r.code, r.level, r.parent_role_id
      FROM roles r
      JOIN role_hierarchy rh ON r.id = rh.parent_role_id
    ),
    user_permissions AS (
      -- Permisos directos del usuario
      SELECT DISTINCT p.id, p.code, p.module, p.action, p.name, p.risk_level
      FROM user_permissions up
      JOIN permissions p ON up.permission_id = p.id
      WHERE up.user_id = $1
        AND up.granted = true
        AND ($2::uuid IS NULL OR up.community_id = $2 OR up.community_id IS NULL)
        AND (up.valid_until IS NULL OR up.valid_until > NOW())
      
      UNION
      
      -- Permisos de roles
      SELECT DISTINCT p.id, p.code, p.module, p.action, p.name, p.risk_level
      FROM role_hierarchy rh
      JOIN role_permissions rp ON rh.role_id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE rp.granted = true
    )
    SELECT * FROM user_permissions
    ORDER BY module, action;
  `;
  
  const result = await query(query, [userId, communityId]);
  return result.rows;
}

/**
 * Obtener jerarquía de roles
 */
export async function getRoleHierarchy(roleId: string): Promise<any[]> {
  const query = `
    WITH RECURSIVE role_tree AS (
      -- Rol raíz
      SELECT id, code, name, level, parent_role_id, 0 as depth
      FROM roles 
      WHERE id = $1
      
      UNION ALL
      
      -- Roles hijos
      SELECT r.id, r.code, r.name, r.level, r.parent_role_id, rt.depth + 1
      FROM roles r
      JOIN role_tree rt ON r.parent_role_id = rt.id
      WHERE rt.depth < 10 -- Evitar loops infinitos
    )
    SELECT * FROM role_tree
    ORDER BY depth, level;
  `;
  
  const result = await query(query, [roleId]);
  return result.rows;
}

/**
 * Verificar dependencias de permisos
 */
export async function checkPermissionDependencies(
  permissionCodes: string[]
): Promise<any> {
  const query = `
    SELECT 
      p.code,
      p.dependencies,
      CASE 
        WHEN array_length(p.dependencies, 1) IS NULL THEN true
        ELSE p.dependencies <@ $1::text[]
      END as dependencies_met
    FROM permissions p
    WHERE p.code = ANY($1::text[]);
  `;
  
  const result = await query(query, [permissionCodes]);
  return result.rows;
}

/**
 * Obtener usuarios afectados por cambio de rol
 */
export async function getUsersAffectedByRole(roleId: string): Promise<any[]> {
  const query = `
    SELECT DISTINCT
      u.id,
      u.username,
      u.email,
      ur.community_id
    FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    WHERE ur.role_id = $1
      AND ur.is_active = true;
  `;
  
  const result = await query(query, [roleId]);
  return result.rows;
}

/**
 * Validar integridad de permisos
 */
export async function validatePermissionIntegrity(): Promise<any> {
  const query = `
    SELECT 
      'orphaned_role_permissions' as issue_type,
      COUNT(*) as count
    FROM role_permissions rp
    LEFT JOIN roles r ON rp.role_id = r.id
    LEFT JOIN permissions p ON rp.permission_id = p.id
    WHERE r.id IS NULL OR p.id IS NULL
    
    UNION ALL
    
    SELECT 
      'orphaned_user_permissions' as issue_type,
      COUNT(*) as count
    FROM user_permissions up
    LEFT JOIN users u ON up.user_id = u.id
    LEFT JOIN permissions p ON up.permission_id = p.id
    WHERE u.id IS NULL OR p.id IS NULL
    
    UNION ALL
    
    SELECT 
      'circular_role_references' as issue_type,
      COUNT(*) as count
    FROM roles r1
    JOIN roles r2 ON r1.parent_role_id = r2.id
    WHERE r2.parent_role_id = r1.id;
  `;
  
  const result = await query(query);
  return result.rows;
}

// Exportar el pool para uso directo si es necesario
export { pool };