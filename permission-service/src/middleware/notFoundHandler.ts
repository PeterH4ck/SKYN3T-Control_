// =====================================================
// NOT FOUND HANDLER - PERMISSION SERVICE
// =====================================================
// Middleware para manejar rutas no encontradas

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { MetricsService } from '../services/metricsService';

/**
 * Middleware para manejar rutas no encontradas (404)
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log de la ruta no encontrada
  logger.warn('Route not found', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  });

  // Métricas
  MetricsService.incrementCounter('http_requests_total', {
    method: req.method,
    status_code: '404',
    endpoint: 'not_found'
  });

  // Crear error 404
  const error = new AppError(
    `Endpoint ${req.method} ${req.originalUrl} not found`,
    404,
    'ENDPOINT_NOT_FOUND',
    {
      method: req.method,
      path: req.originalUrl,
      query: req.query,
      availableEndpoints: getAvailableEndpoints()
    }
  );

  next(error);
}

/**
 * Obtener lista de endpoints disponibles para incluir en respuesta 404
 */
function getAvailableEndpoints(): string[] {
  return [
    'GET /health',
    'GET /metrics',
    'POST /api/v1/permissions/check',
    'POST /api/v1/permissions/check/bulk',
    'GET /api/v1/permissions/users/:userId',
    'GET /api/v1/permissions/roles/:roleId/hierarchy',
    'POST /api/v1/permissions/cache/users/:userId/invalidate',
    'POST /api/v1/permissions/cache/roles/:roleId/invalidate',
    'POST /api/v1/permissions/propagate/roles/:roleId',
    'POST /api/v1/permissions/propagate/users/:userId',
    'POST /api/v1/permissions/propagate/bulk',
    'GET /api/v1/permissions/propagate/jobs/:jobId',
    'GET /api/v1/permissions/propagate/jobs',
    'GET /api/v1/permissions/stats',
    'POST /api/v1/permissions/maintenance',
    'POST /api/v1/permissions/validate/integrity'
  ];
}

export default notFoundHandler;