// =====================================================
// DEVICE SERVICE - SKYN3T ACCESS CONTROL
// =====================================================
// Servicio para gestión completa de dispositivos IoT

import { logger } from '../utils/logger';
import { redisClient } from '../config/redis';
import { Device, DeviceCommand, DeviceMetric, DeviceConfiguration } from '../models';
import { AppError } from '../utils/AppError';
import mqtt from 'mqtt';
import { v4 as uuidv4 } from 'uuid';

// Interfaces
interface CommandPayload {
  command: string;
  parameters: Record<string, any>;
  priority: number;
  issued_by: string;
  community_id: string;
}

interface DeviceStatus {
  device_id: string;
  status: 'online' | 'offline' | 'error' | 'maintenance';
  last_heartbeat: Date | null;
  metrics: DeviceMetrics;
  capabilities_status: Record<string, string>;
  firmware_version: string;
  uptime_seconds: number;
}

interface DeviceMetrics {
  cpu_usage?: number;
  memory_usage?: number;
  temperature?: number;
  network_strength?: number;
  battery_level?: number;
  command_queue_length?: number;
  last_command_response_time?: number;
}

interface FirmwareUpdatePayload {
  firmware_version: string;
  auto_install: boolean;
  initiated_by: string;
}

class DeviceService {
  private mqttClient: mqtt.MqttClient | null = null;
  private commandTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.initializeMQTT();
  }

  /**
   * Inicializar conexión MQTT
   */
  private async initializeMQTT() {
    try {
      const mqttUrl = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
      
      this.mqttClient = mqtt.connect(mqttUrl, {
        clientId: `skyn3t-device-service-${process.pid}`,
        clean: true,
        connectTimeout: 4000,
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
        reconnectPeriod: 5000
      });

      this.mqttClient.on('connect', () => {
        logger.info('✅ MQTT client connected to broker');
        this.subscribeToDeviceTopics();
      });

      this.mqttClient.on('error', (error) => {
        logger.error('❌ MQTT connection error:', error);
      });

      this.mqttClient.on('message', this.handleMQTTMessage.bind(this));

    } catch (error) {
      logger.error('Failed to initialize MQTT:', error);
    }
  }

  /**
   * Suscribirse a topics MQTT
   */
  private subscribeToDeviceTopics() {
    if (!this.mqttClient) return;

    const topics = [
      'skyn3t/devices/+/heartbeat',
      'skyn3t/devices/+/status',
      'skyn3t/devices/+/metrics',
      'skyn3t/devices/+/response',
      'skyn3t/devices/+/alert',
      'skyn3t/devices/+/error'
    ];

    topics.forEach(topic => {
      this.mqttClient!.subscribe(topic, (err) => {
        if (err) {
          logger.error(`Failed to subscribe to ${topic}:`, err);
        } else {
          logger.debug(`Subscribed to ${topic}`);
        }
      });
    });
  }

  /**
   * Manejar mensajes MQTT
   */
  private async handleMQTTMessage(topic: string, message: Buffer) {
    try {
      const parts = topic.split('/');
      const deviceId = parts[2];
      const messageType = parts[3];
      const payload = JSON.parse(message.toString());

      await this.processDeviceMessage(deviceId, messageType, payload);
    } catch (error) {
      logger.error('Error processing MQTT message:', error);
    }
  }

  /**
   * Procesar mensajes de dispositivos
   */
  private async processDeviceMessage(deviceId: string, messageType: string, payload: any) {
    try {
      switch (messageType) {
        case 'heartbeat':
          await this.handleHeartbeat(deviceId, payload);
          break;
        case 'status':
          await this.handleStatusUpdate(deviceId, payload);
          break;
        case 'metrics':
          await this.handleMetricsUpdate(deviceId, payload);
          break;
        case 'response':
          await this.handleCommandResponse(deviceId, payload);
          break;
        case 'alert':
          await this.handleDeviceAlert(deviceId, payload);
          break;
        case 'error':
          await this.handleDeviceError(deviceId, payload);
          break;
        default:
          logger.warn(`Unknown message type: ${messageType} from device ${deviceId}`);
      }
    } catch (error) {
      logger.error(`Error processing ${messageType} from device ${deviceId}:`, error);
    }
  }

  /**
   * Manejar heartbeat de dispositivo
   */
  private async handleHeartbeat(deviceId: string, payload: any) {
    const cacheKey = `device:heartbeat:${deviceId}`;
    
    await redisClient.setex(cacheKey, 300, JSON.stringify({
      timestamp: new Date(),
      ...payload
    }));

    // Actualizar status en BD si cambió a online
    const device = await Device.findByPk(deviceId);
    if (device && device.status !== 'online') {
      await device.update({
        status: 'online',
        last_heartbeat: new Date()
      });
    }
  }

  /**
   * Manejar actualización de estado
   */
  private async handleStatusUpdate(deviceId: string, payload: any) {
    const device = await Device.findByPk(deviceId);
    if (!device) return;

    await device.update({
      status: payload.status,
      last_heartbeat: new Date(),
      firmware_version: payload.firmware_version || device.firmware_version
    });

    // Cache del estado
    const cacheKey = `device:status:${deviceId}`;
    await redisClient.setex(cacheKey, 60, JSON.stringify(payload));
  }

  /**
   * Manejar actualización de métricas
   */
  private async handleMetricsUpdate(deviceId: string, payload: any) {
    // Guardar métricas en cache
    const cacheKey = `device:metrics:${deviceId}`;
    await redisClient.setex(cacheKey, 300, JSON.stringify({
      ...payload,
      timestamp: new Date()
    }));

    // Guardar en InfluxDB para históricos (si está disponible)
    try {
      await this.saveMetricsToInflux(deviceId, payload);
    } catch (error) {
      logger.warn('Failed to save metrics to InfluxDB:', error);
    }
  }

  /**
   * Manejar respuesta de comando
   */
  private async handleCommandResponse(deviceId: string, payload: any) {
    const { command_id, status, result, error, execution_time } = payload;

    // Actualizar comando en BD
    const command = await DeviceCommand.findByPk(command_id);
    if (command) {
      await command.update({
        status,
        result: result || null,
        error_message: error || null,
        executed_at: new Date(),
        execution_time_ms: execution_time || 0
      });
    }

    // Limpiar timeout
    if (this.commandTimeouts.has(command_id)) {
      clearTimeout(this.commandTimeouts.get(command_id)!);
      this.commandTimeouts.delete(command_id);
    }

    // Cache de la respuesta
    const cacheKey = `command:response:${command_id}`;
    await redisClient.setex(cacheKey, 300, JSON.stringify(payload));
  }

  /**
   * Manejar alerta de dispositivo
   */
  private async handleDeviceAlert(deviceId: string, payload: any) {
    logger.warn(`Device alert from ${deviceId}:`, payload);
    
    // Aquí se podría integrar con el sistema de notificaciones
    // notificationService.sendDeviceAlert(deviceId, payload);
  }

  /**
   * Manejar error de dispositivo
   */
  private async handleDeviceError(deviceId: string, payload: any) {
    logger.error(`Device error from ${deviceId}:`, payload);
    
    const device = await Device.findByPk(deviceId);
    if (device) {
      await device.update({
        status: 'error',
        last_error: payload.error_message,
        last_error_time: new Date()
      });
    }
  }

  /**
   * Enviar comando a dispositivo
   */
  async sendCommand(deviceId: string, commandPayload: CommandPayload) {
    try {
      const device = await Device.findByPk(deviceId);
      if (!device) {
        throw new AppError('Dispositivo no encontrado', 404, 'DEVICE_NOT_FOUND');
      }

      if (device.status !== 'online') {
        throw new AppError('Dispositivo no está en línea', 400, 'DEVICE_OFFLINE');
      }

      // Crear registro de comando
      const commandId = uuidv4();
      const command = await DeviceCommand.create({
        id: commandId,
        device_id: deviceId,
        command: commandPayload.command,
        parameters: commandPayload.parameters,
        priority: commandPayload.priority,
        status: 'queued',
        issued_by: commandPayload.issued_by,
        community_id: commandPayload.community_id,
        issued_at: new Date()
      });

      // Construir mensaje MQTT
      const mqttMessage = {
        command_id: commandId,
        command: commandPayload.command,
        parameters: commandPayload.parameters,
        priority: commandPayload.priority,
        timestamp: new Date().toISOString()
      };

      // Enviar comando via MQTT
      const topic = `skyn3t/devices/${deviceId}/command`;
      if (this.mqttClient) {
        this.mqttClient.publish(topic, JSON.stringify(mqttMessage), {
          qos: commandPayload.priority >= 5 ? 2 : 1, // QoS alto para comandos críticos
          retain: false
        });

        // Configurar timeout para el comando
        const timeout = setTimeout(async () => {
          await command.update({
            status: 'timeout',
            error_message: 'Command execution timeout'
          });
          this.commandTimeouts.delete(commandId);
        }, 30000); // 30 segundos timeout

        this.commandTimeouts.set(commandId, timeout);

        // Actualizar estado del comando
        await command.update({ status: 'sent' });
      }

      return {
        command_id: commandId,
        status: 'sent',
        estimated_execution: new Date(Date.now() + 5000) // Estimado 5 segundos
      };
    } catch (error) {
      logger.error('Error sending command:', error);
      throw error;
    }
  }

  /**
   * Obtener estado del dispositivo
   */
  async getDeviceStatus(deviceId: string): Promise<DeviceStatus | null> {
    try {
      const device = await Device.findByPk(deviceId);
      if (!device) return null;

      // Obtener métricas del cache
      const metricsKey = `device:metrics:${deviceId}`;
      const statusKey = `device:status:${deviceId}`;
      
      const [metricsData, statusData] = await Promise.all([
        redisClient.get(metricsKey),
        redisClient.get(statusKey)
      ]);

      const metrics = metricsData ? JSON.parse(metricsData) : {};
      const statusInfo = statusData ? JSON.parse(statusData) : {};

      return {
        device_id: deviceId,
        status: device.status as any,
        last_heartbeat: device.last_heartbeat,
        metrics: {
          cpu_usage: metrics.cpu_usage,
          memory_usage: metrics.memory_usage,
          temperature: metrics.temperature,
          network_strength: metrics.network_strength,
          battery_level: metrics.battery_level,
          command_queue_length: metrics.command_queue_length,
          last_command_response_time: metrics.last_command_response_time
        },
        capabilities_status: statusInfo.capabilities_status || {},
        firmware_version: device.firmware_version || 'Unknown',
        uptime_seconds: statusInfo.uptime_seconds || 0
      };
    } catch (error) {
      logger.error('Error getting device status:', error);
      return null;
    }
  }

  /**
   * Obtener métricas del dispositivo
   */
  async getDeviceMetrics(deviceId: string): Promise<DeviceMetrics> {
    try {
      const cacheKey = `device:metrics:${deviceId}`;
      const data = await redisClient.get(cacheKey);
      
      if (data) {
        const metrics = JSON.parse(data);
        return {
          cpu_usage: metrics.cpu_usage,
          memory_usage: metrics.memory_usage,
          temperature: metrics.temperature,
          network_strength: metrics.network_strength,
          battery_level: metrics.battery_level,
          command_queue_length: metrics.command_queue_length,
          last_command_response_time: metrics.last_command_response_time
        };
      }

      return {};
    } catch (error) {
      logger.error('Error getting device metrics:', error);
      return {};
    }
  }

  /**
   * Obtener historial de métricas
   */
  async getDeviceMetricsHistory(deviceId: string, options: {
    from?: string;
    to?: string;
    metric_type?: string;
  }) {
    // Esta función requeriría integración con InfluxDB
    // Por ahora devolver datos mock
    return {
      device_id: deviceId,
      metrics: [],
      period: {
        from: options.from,
        to: options.to
      }
    };
  }

  /**
   * Reiniciar dispositivo
   */
  async restartDevice(deviceId: string, userId: string) {
    return await this.sendCommand(deviceId, {
      command: 'restart',
      parameters: {},
      priority: 8,
      issued_by: userId,
      community_id: '' // Se obtendrá del dispositivo
    });
  }

  /**
   * Actualizar firmware
   */
  async updateFirmware(deviceId: string, payload: FirmwareUpdatePayload) {
    return await this.sendCommand(deviceId, {
      command: 'update_firmware',
      parameters: {
        firmware_version: payload.firmware_version,
        auto_install: payload.auto_install
      },
      priority: 9,
      issued_by: payload.initiated_by,
      community_id: ''
    });
  }

  /**
   * Obtener historial de comandos
   */
  async getCommandHistory(deviceId: string, options: {
    page: number;
    limit: number;
    status?: string;
    command_type?: string;
  }) {
    const offset = (options.page - 1) * options.limit;
    const where: any = { device_id: deviceId };
    
    if (options.status) where.status = options.status;
    if (options.command_type) where.command = options.command_type;

    const { rows: commands, count } = await DeviceCommand.findAndCountAll({
      where,
      order: [['issued_at', 'DESC']],
      limit: options.limit,
      offset
    });

    return {
      commands,
      pagination: {
        page: options.page,
        limit: options.limit,
        total: count,
        pages: Math.ceil(count / options.limit)
      }
    };
  }

  /**
   * Configurar alertas del dispositivo
   */
  async configureAlerts(deviceId: string, config: Record<string, any>) {
    const cacheKey = `device:alerts:${deviceId}`;
    await redisClient.setex(cacheKey, 86400, JSON.stringify(config)); // 24 horas
    
    // También enviar configuración al dispositivo
    await this.sendCommand(deviceId, {
      command: 'configure_alerts',
      parameters: config,
      priority: 3,
      issued_by: 'system',
      community_id: ''
    });
  }

  /**
   * Inicializar configuración del dispositivo
   */
  async initializeDeviceConfiguration(deviceId: string, config: Record<string, any>) {
    // Crear configuración por defecto
    const defaultConfig = {
      heartbeat_interval: 30,
      metrics_interval: 60,
      command_timeout: 30,
      auto_restart: false,
      maintenance_window: null,
      ...config
    };

    const cacheKey = `device:config:${deviceId}`;
    await redisClient.setex(cacheKey, 86400, JSON.stringify(defaultConfig));
  }

  /**
   * Actualizar configuración del dispositivo
   */
  async updateDeviceConfiguration(deviceId: string, config: Record<string, any>) {
    const cacheKey = `device:config:${deviceId}`;
    await redisClient.setex(cacheKey, 86400, JSON.stringify(config));
    
    // Enviar nueva configuración al dispositivo
    await this.sendCommand(deviceId, {
      command: 'update_config',
      parameters: config,
      priority: 5,
      issued_by: 'system',
      community_id: ''
    });
  }

  /**
   * Obtener configuración del dispositivo
   */
  async getDeviceConfiguration(deviceId: string) {
    try {
      const cacheKey = `device:config:${deviceId}`;
      const data = await redisClient.get(cacheKey);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Error getting device configuration:', error);
      return null;
    }
  }

  /**
   * Limpiar cache del dispositivo
   */
  async clearDeviceCache(deviceId: string) {
    const keys = [
      `device:status:${deviceId}`,
      `device:metrics:${deviceId}`,
      `device:config:${deviceId}`,
      `device:alerts:${deviceId}`,
      `device:heartbeat:${deviceId}`
    ];

    await Promise.all(keys.map(key => redisClient.del(key)));
  }

  /**
   * Guardar métricas en InfluxDB
   */
  private async saveMetricsToInflux(deviceId: string, metrics: any) {
    // Implementar integración con InfluxDB
    // Esta es una función placeholder
    logger.debug(`Saving metrics for device ${deviceId} to InfluxDB`);
  }

  /**
   * Cerrar conexiones
   */
  async cleanup() {
    if (this.mqttClient) {
      this.mqttClient.end();
    }
    
    // Limpiar timeouts pendientes
    this.commandTimeouts.forEach(timeout => clearTimeout(timeout));
    this.commandTimeouts.clear();
  }
}

// Singleton instance
export const deviceService = new DeviceService();

// Limpiar al terminar el proceso
process.on('SIGTERM', () => deviceService.cleanup());
process.on('SIGINT', () => deviceService.cleanup());