// =====================================================
// PERMISSION PROPAGATOR - SKYN3T ACCESS CONTROL
// =====================================================
// Propagación de cambios de permisos en tiempo real

import { getUsersAffectedByRole } from '../config/database';
import { PermissionCache } from '../config/redis';
import { RabbitMQService } from '../services/rabbitmqService';
import { logger } from '../utils/logger';
import { MetricsService } from '../services/metricsService';
import { events } from '../config/config';

export interface PropagationEvent {
  type: 'role_updated' | 'user_permission_changed' | 'bulk_update';
  timestamp: Date;
  userId?: string;
  roleId?: string;
  communityId?: string;
  changes: {
    added: string[];
    removed: string[];
    modified: string[];
  };
  affectedUsers?: string[];
  reason?: string;
  initiatedBy: string;
}

export interface BulkPropagationJob {
  id: string;
  type: 'role_permissions' | 'user_permissions' | 'community_permissions';
  targets: string[];
  changes: any;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  startTime?: Date;
  endTime?: Date;
  errors: string[];
}

/**
 * Propagador de cambios de permisos
 */
export class PermissionPropagator {
  private static instance: PermissionPropagator;
  private initialized: boolean = false;
  private activeJobs: Map<string, BulkPropagationJob> = new Map();
  private propagationQueue: PropagationEvent[] = [];
  private processing: boolean = false;

  private constructor() {}

  /**
   * Singleton instance
   */
  public static getInstance(): PermissionPropagator {
    if (!PermissionPropagator.instance) {
      PermissionPropagator.instance = new PermissionPropagator();
    }
    return PermissionPropagator.instance;
  }

  /**
   * Inicializar el propagador
   */
  public static async initialize(): Promise<void> {
    const propagator = PermissionPropagator.getInstance();
    
    if (propagator.initialized) {
      return;
    }

    try {
      logger.info('🔄 Initializing Permission Propagator...');
      
      // Iniciar procesamiento de cola
      propagator.startQueueProcessor();
      
      // Configurar listeners de eventos
      await propagator.setupEventListeners();
      
      propagator.initialized = true;
      logger.info('✅ Permission Propagator initialized successfully');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Permission Propagator:', error);
      throw error;
    }
  }

  /**
   * Configurar listeners de eventos de RabbitMQ
   */
  private async setupEventListeners(): Promise<void> {
    try {
      const rabbitMQ = RabbitMQService.getInstance();
      
      // Escuchar eventos de cambio de roles
      await rabbitMQ.subscribe('role.updated', async (data) => {
        await this.handleRoleUpdated(data);
      });
      
      // Escuchar eventos de cambio de permisos de usuario
      await rabbitMQ.subscribe('user.permission.changed', async (data) => {
        await this.handleUserPermissionChanged(data);
      });
      
      // Escuchar solicitudes de propagación masiva
      await rabbitMQ.subscribe('bulk.permission.update.request', async (data) => {
        await this.handleBulkUpdateRequest(data);
      });
      
      logger.info('✅ Event listeners configured');
      
    } catch (error) {
      logger.error('Error setting up event listeners:', error);
      throw error;
    }
  }

  /**
   * Propagar cambios de rol
   */
  public async propagateRoleChanges(
    roleId: string,
    changes: { added: string[]; removed: string[]; modified: string[] },
    initiatedBy: string,
    communityId?: string
  ): Promise<void> {
    try {
      const startTime = Date.now();
      
      logger.info(`🔄 Propagating role changes for role ${roleId}`);
      
      // Obtener usuarios afectados
      const affectedUsers = await getUsersAffectedByRole(roleId);
      const userIds = affectedUsers.map(user => user.id);
      
      // Crear evento de propagación
      const event: PropagationEvent = {
        type: 'role_updated',
        timestamp: new Date(),
        roleId,
        communityId,
        changes,
        affectedUsers: userIds,
        initiatedBy
      };

      // Agregar a la cola de procesamiento
      this.addToQueue(event);
      
      // Publicar evento para otros servicios
      await RabbitMQService.getInstance().publish(events.ROLE_UPDATED, {
        roleId,
        changes,
        affectedUsers: userIds,
        timestamp: new Date()
      });

      // Métricas
      MetricsService.observeHistogram('permission_propagation_duration_seconds', 
        (Date.now() - startTime) / 1000);
      
      MetricsService.incrementCounter('permission_propagations_total', { type: 'role' });
      
      logger.info(`✅ Role propagation queued for ${userIds.length} users`);
      
    } catch (error) {
      logger.error('Error propagating role changes:', error);
      MetricsService.incrementCounter('permission_propagation_errors_total');
      throw error;
    }
  }

  /**
   * Propagar cambios de permisos de usuario
   */
  public async propagateUserPermissionChanges(
    userId: string,
    changes: { added: string[]; removed: string[]; modified: string[] },
    initiatedBy: string,
    communityId?: string
  ): Promise<void> {
    try {
      logger.info(`🔄 Propagating user permission changes for user ${userId}`);
      
      const event: PropagationEvent = {
        type: 'user_permission_changed',
        timestamp: new Date(),
        userId,
        communityId,
        changes,
        affectedUsers: [userId],
        initiatedBy
      };

      // Agregar a la cola
      this.addToQueue(event);
      
      // Publicar evento
      await RabbitMQService.getInstance().publish(events.USER_PERMISSION_CHANGED, {
        userId,
        changes,
        communityId,
        timestamp: new Date()
      });

      MetricsService.incrementCounter('permission_propagations_total', { type: 'user' });
      
    } catch (error) {
      logger.error('Error propagating user permission changes:', error);
      throw error;
    }
  }

  /**
   * Procesamiento masivo de propagaciones
   */
  public async propagateBulkChanges(
    targets: string[],
    type: 'role_permissions' | 'user_permissions' | 'community_permissions',
    changes: any,
    initiatedBy: string
  ): Promise<string> {
    try {
      const jobId = `bulk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const job: BulkPropagationJob = {
        id: jobId,
        type,
        targets,
        changes,
        status: 'pending',
        progress: 0,
        errors: []
      };

      // Guardar job
      this.activeJobs.set(jobId, job);
      
      logger.info(`🔄 Started bulk propagation job ${jobId} for ${targets.length} targets`);
      
      // Procesar de forma asíncrona
      this.processBulkJob(jobId).catch(error => {
        logger.error(`Error in bulk job ${jobId}:`, error);
        job.status = 'failed';
        job.errors.push(error.message);
      });

      return jobId;
      
    } catch (error) {
      logger.error('Error starting bulk propagation:', error);
      throw error;
    }
  }

  /**
   * Procesar job de propagación masiva
   */
  private async processBulkJob(jobId: string): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    try {
      job.status = 'running';
      job.startTime = new Date();
      
      const batchSize = 50; // Procesar en lotes de 50
      const total = job.targets.length;
      let processed = 0;

      for (let i = 0; i < total; i += batchSize) {
        const batch = job.targets.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (target) => {
          try {
            switch (job.type) {
              case 'role_permissions':
                await PermissionCache.invalidateRoleCache(target);
                break;
              case 'user_permissions':
                await PermissionCache.invalidateUserCache(target);
                break;
              case 'community_permissions':
                // Invalidar todo el cache de la comunidad
                await this.invalidateCommunityCache(target);
                break;
            }
          } catch (error) {
            job.errors.push(`Target ${target}: ${error.message}`);
          }
        }));

        processed += batch.length;
        job.progress = Math.round((processed / total) * 100);
        
        logger.debug(`Bulk job ${jobId} progress: ${job.progress}%`);
        
        // Pausa pequeña para no sobrecargar
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      job.status = 'completed';
      job.endTime = new Date();
      job.progress = 100;
      
      // Publicar evento de finalización
      await RabbitMQService.getInstance().publish(events.BULK_PERMISSION_UPDATE, {
        jobId,
        status: 'completed',
        processed: total,
        errors: job.errors.length,
        duration: job.endTime.getTime() - job.startTime!.getTime()
      });

      logger.info(`✅ Bulk job ${jobId} completed. Processed: ${total}, Errors: ${job.errors.length}`);
      
    } catch (error) {
      job.status = 'failed';
      job.endTime = new Date();
      job.errors.push(error.message);
      
      logger.error(`❌ Bulk job ${jobId} failed:`, error);
    }
  }

  /**
   * Agregar evento a la cola de procesamiento
   */
  private addToQueue(event: PropagationEvent): void {
    this.propagationQueue.push(event);
    
    if (!this.processing) {
      this.processQueue();
    }
  }

  /**
   * Iniciar procesador de cola
   */
  private startQueueProcessor(): void {
    setInterval(() => {
      if (this.propagationQueue.length > 0 && !this.processing) {
        this.processQueue();
      }
    }, 1000); // Procesar cada segundo
  }

  /**
   * Procesar cola de eventos
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.propagationQueue.length === 0) {
      return;
    }

    this.processing = true;
    
    try {
      while (this.propagationQueue.length > 0) {
        const event = this.propagationQueue.shift();
        if (event) {
          await this.processEvent(event);
        }
      }
    } catch (error) {
      logger.error('Error processing propagation queue:', error);
    } finally {
      this.processing = false;
    }
  }

  /**
   * Procesar evento individual
   */
  private async processEvent(event: PropagationEvent): Promise<void> {
    try {
      logger.debug(`Processing propagation event: ${event.type}`);
      
      switch (event.type) {
        case 'role_updated':
          await this.processRoleUpdatedEvent(event);
          break;
        case 'user_permission_changed':
          await this.processUserPermissionChangedEvent(event);
          break;
        case 'bulk_update':
          // Handled separately
          break;
      }
      
    } catch (error) {
      logger.error(`Error processing event ${event.type}:`, error);
    }
  }

  /**
   * Procesar evento de rol actualizado
   */
  private async processRoleUpdatedEvent(event: PropagationEvent): Promise<void> {
    if (!event.roleId || !event.affectedUsers) {
      return;
    }

    // Invalidar cache del rol
    await PermissionCache.invalidateRoleCache(event.roleId);
    
    // Invalidar cache de usuarios afectados
    for (const userId of event.affectedUsers) {
      await PermissionCache.invalidateUserCache(userId, event.communityId);
    }
    
    logger.info(`Invalidated cache for role ${event.roleId} and ${event.affectedUsers.length} users`);
  }

  /**
   * Procesar evento de cambio de permisos de usuario
   */
  private async processUserPermissionChangedEvent(event: PropagationEvent): Promise<void> {
    if (!event.userId) {
      return;
    }

    // Invalidar cache del usuario
    await PermissionCache.invalidateUserCache(event.userId, event.communityId);
    
    logger.info(`Invalidated cache for user ${event.userId}`);
  }

  /**
   * Invalidar cache de toda una comunidad
   */
  private async invalidateCommunityCache(communityId: string): Promise<void> {
    // Implementar invalidación específica por comunidad
    // Por ahora, invalidar patterns relacionados
    logger.info(`Invalidating cache for community ${communityId}`);
  }

  /**
   * Manejar evento de rol actualizado desde RabbitMQ
   */
  private async handleRoleUpdated(data: any): Promise<void> {
    logger.info('Received role updated event from message queue');
    // Procesar según sea necesario
  }

  /**
   * Manejar evento de cambio de permisos de usuario desde RabbitMQ
   */
  private async handleUserPermissionChanged(data: any): Promise<void> {
    logger.info('Received user permission changed event from message queue');
    // Procesar según sea necesario
  }

  /**
   * Manejar solicitud de actualización masiva
   */
  private async handleBulkUpdateRequest(data: any): Promise<void> {
    logger.info('Received bulk update request from message queue');
    // Procesar según sea necesario
  }

  /**
   * Obtener estado de job masivo
   */
  public getBulkJobStatus(jobId: string): BulkPropagationJob | null {
    return this.activeJobs.get(jobId) || null;
  }

  /**
   * Obtener todos los jobs activos
   */
  public getActiveJobs(): BulkPropagationJob[] {
    return Array.from(this.activeJobs.values());
  }

  /**
   * Limpiar jobs completados
   */
  public cleanupCompletedJobs(): void {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 horas
    
    for (const [jobId, job] of this.activeJobs.entries()) {
      if (job.status === 'completed' || job.status === 'failed') {
        if (job.endTime && job.endTime.getTime() < cutoffTime) {
          this.activeJobs.delete(jobId);
        }
      }
    }
  }

  /**
   * Obtener estadísticas del propagador
   */
  public getStats(): any {
    return {
      queue_size: this.propagationQueue.length,
      processing: this.processing,
      active_jobs: this.activeJobs.size,
      jobs_by_status: {
        pending: Array.from(this.activeJobs.values()).filter(j => j.status === 'pending').length,
        running: Array.from(this.activeJobs.values()).filter(j => j.status === 'running').length,
        completed: Array.from(this.activeJobs.values()).filter(j => j.status === 'completed').length,
        failed: Array.from(this.activeJobs.values()).filter(j => j.status === 'failed').length
      }
    };
  }
}

// Exportar instancia
export const permissionPropagator = PermissionPropagator.getInstance();