// =====================================================
// RABBITMQ CONFIG - PERMISSION SERVICE
// =====================================================
// Configuración específica de RabbitMQ para permisos

import { RabbitMQService } from '../services/rabbitmqService';
import { config, events } from './config';
import { logger } from '../utils/logger';

let rabbitMQService: RabbitMQService;

/**
 * Conectar a RabbitMQ y configurar intercambios y colas
 */
export async function connectRabbitMQ(): Promise<void> {
  try {
    rabbitMQService = RabbitMQService.getInstance();
    await rabbitMQService.initialize();
    
    // Configurar handlers de eventos específicos de permisos
    await setupPermissionEventHandlers();
    
    logger.info('✅ RabbitMQ configured for permission service');
    
  } catch (error) {
    logger.error('❌ Failed to configure RabbitMQ:', error);
    throw error;
  }
}

/**
 * Configurar handlers para eventos de permisos
 */
async function setupPermissionEventHandlers(): Promise<void> {
  // Handler para cambios de roles desde otros servicios
  await rabbitMQService.subscribe('role.updated', async (data) => {
    logger.info('Received role.updated event', data);
    
    // Aquí se procesaría la invalidación de cache
    // y propagación de cambios de permisos
    try {
      // Implementar lógica de manejo del evento
      logger.debug('Processing role update event', {
        roleId: data.roleId,
        changes: data.changes
      });
      
    } catch (error) {
      logger.error('Error processing role.updated event:', error);
      throw error;
    }
  });

  // Handler para cambios de usuarios
  await rabbitMQService.subscribe('user.updated', async (data) => {
    logger.info('Received user.updated event', data);
    
    try {
      // Invalidar cache de permisos del usuario
      if (data.userId) {
        logger.debug('Invalidating user permissions cache', {
          userId: data.userId
        });
      }
      
    } catch (error) {
      logger.error('Error processing user.updated event:', error);
      throw error;
    }
  });

  // Handler para cambios de membresía en comunidades
  await rabbitMQService.subscribe('community.member.updated', async (data) => {
    logger.info('Received community.member.updated event', data);
    
    try {
      // Invalidar cache de permisos específicos de comunidad
      if (data.userId && data.communityId) {
        logger.debug('Invalidating community-specific permissions', {
          userId: data.userId,
          communityId: data.communityId
        });
      }
      
    } catch (error) {
      logger.error('Error processing community.member.updated event:', error);
      throw error;
    }
  });

  // Handler para solicitudes de verificación de permisos desde otros servicios
  await rabbitMQService.subscribe('permission.check.request', async (data) => {
    logger.debug('Received permission check request', data);
    
    try {
      // Procesar verificación de permisos
      // y enviar respuesta al servicio solicitante
      
    } catch (error) {
      logger.error('Error processing permission check request:', error);
      throw error;
    }
  });

  // Handler para solicitudes de bulk operations
  await rabbitMQService.subscribe('permission.bulk.request', async (data) => {
    logger.info('Received bulk permission request', data);
    
    try {
      // Procesar operación masiva de permisos
      
    } catch (error) {
      logger.error('Error processing bulk permission request:', error);
      throw error;
    }
  });

  // Handler para eventos de sistema
  await rabbitMQService.subscribe('system.maintenance', async (data) => {
    logger.info('Received system maintenance event', data);
    
    try {
      if (data.action === 'cache.clear') {
        // Limpiar cache de permisos
        logger.info('Clearing permission cache due to maintenance');
      } else if (data.action === 'reload.config') {
        // Recargar configuración
        logger.info('Reloading permission configuration');
      }
      
    } catch (error) {
      logger.error('Error processing system maintenance event:', error);
      throw error;
    }
  });

  logger.info('Permission event handlers configured');
}

/**
 * Publicar evento de cambio de permisos
 */
export async function publishPermissionChange(
  type: 'role' | 'user' | 'bulk',
  data: any
): Promise<boolean> {
  try {
    let eventType: string;
    
    switch (type) {
      case 'role':
        eventType = events.ROLE_UPDATED;
        break;
      case 'user':
        eventType = events.USER_PERMISSION_CHANGED;
        break;
      case 'bulk':
        eventType = events.BULK_PERMISSION_UPDATE;
        break;
      default:
        throw new Error(`Unknown permission change type: ${type}`);
    }
    
    return await rabbitMQService.publish(eventType, data);
    
  } catch (error) {
    logger.error('Error publishing permission change:', error);
    return false;
  }
}

/**
 * Publicar invalidación de cache
 */
export async function publishCacheInvalidation(
  target: 'user' | 'role' | 'all',
  targetId?: string,
  communityId?: string
): Promise<boolean> {
  try {
    const data = {
      target,
      targetId,
      communityId,
      timestamp: new Date().toISOString(),
      service: 'permission-service'
    };
    
    return await rabbitMQService.publish(events.PERMISSION_CACHE_INVALIDATED, data);
    
  } catch (error) {
    logger.error('Error publishing cache invalidation:', error);
    return false;
  }
}

/**
 * Solicitar información de otro servicio
 */
export async function requestServiceData<T>(
  targetService: string,
  requestType: string,
  data: any,
  timeout: number = 10000
): Promise<T> {
  try {
    const requestData = {
      type: requestType,
      data,
      timestamp: new Date().toISOString(),
      requestedBy: 'permission-service'
    };
    
    return await rabbitMQService.requestResponse<T>(
      targetService,
      requestData,
      timeout
    );
    
  } catch (error) {
    logger.error(`Error requesting data from ${targetService}:`, error);
    throw error;
  }
}

/**
 * Notificar a otros servicios sobre cambios de permisos
 */
export async function notifyPermissionUpdate(
  affectedUsers: string[],
  changes: any,
  metadata?: any
): Promise<void> {
  try {
    const notificationData = {
      affectedUsers,
      changes,
      metadata,
      timestamp: new Date().toISOString(),
      service: 'permission-service'
    };
    
    // Notificar a servicios específicos que necesitan esta información
    const targetServices = ['auth-service', 'user-service', 'device-service'];
    
    const notifications = targetServices.map(service =>
      rabbitMQService.sendDirectMessage(service, notificationData)
    );
    
    await Promise.all(notifications);
    
    logger.info('Permission update notifications sent', {
      affectedUsers: affectedUsers.length,
      targetServices
    });
    
  } catch (error) {
    logger.error('Error sending permission update notifications:', error);
  }
}

/**
 * Configurar patrones de retry para eventos críticos
 */
export async function setupRetryPolicies(): Promise<void> {
  try {
    // Configurar dead letter queues para eventos críticos
    const criticalEvents = [
      'permission.check.request',
      'permission.bulk.request',
      'role.updated',
      'user.updated'
    ];
    
    for (const eventType of criticalEvents) {
      await rabbitMQService.setupDeadLetterQueue(`permission-service.${eventType}`);
    }
    
    logger.info('Retry policies configured for critical events');
    
  } catch (error) {
    logger.error('Error setting up retry policies:', error);
  }
}

/**
 * Obtener estadísticas de RabbitMQ
 */
export function getRabbitMQStats(): any {
  return rabbitMQService ? rabbitMQService.getStats() : null;
}

/**
 * Health check de RabbitMQ
 */
export function rabbitMQHealthCheck(): boolean {
  return rabbitMQService ? rabbitMQService.healthCheck() : false;
}

/**
 * Cerrar conexión de RabbitMQ
 */
export async function disconnectRabbitMQ(): Promise<void> {
  if (rabbitMQService) {
    await rabbitMQService.close();
    logger.info('RabbitMQ disconnected');
  }
}

// Exportar instancia del servicio
export { rabbitMQService };