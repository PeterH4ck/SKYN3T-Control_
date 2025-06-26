// =====================================================
// METRICS SERVICE - PERMISSION SERVICE
// =====================================================
// Servicio de métricas usando Prometheus

import { register, Counter, Histogram, Gauge, Summary, collectDefaultMetrics } from 'prom-client';
import { config } from '../config/config';
import { logger } from '../utils/logger';

/**
 * Servicio de métricas para Prometheus
 */
export class MetricsService {
  private static instance: MetricsService;
  private static initialized: boolean = false;

  // Contadores
  private static permissionCalculationsTotal: Counter<string>;
  private static permissionChecksGrantedTotal: Counter<string>;
  private static permissionChecksDeniedTotal: Counter<string>;
  private static cacheHitsTotal: Counter<string>;
  private static cacheMissesTotal: Counter<string>;
  private static dbQueriesTotal: Counter<string>;
  private static errorsTotal: Counter<string>;
  private static httpRequestsTotal: Counter<string>;
  private static authRequestsTotal: Counter<string>;
  private static propagationsTotal: Counter<string>;
  private static bulkOperationsTotal: Counter<string>;
  private static rateLimitExceededTotal: Counter<string>;
  private static validationErrorsTotal: Counter<string>;
  private static cacheInvalidationsTotal: Counter<string>;

  // Histogramas para duraciones
  private static permissionCalculationDuration: Histogram<string>;
  private static httpRequestDuration: Histogram<string>;
  private static dbQueryDuration: Histogram<string>;
  private static cacheOperationDuration: Histogram<string>;
  private static propagationDuration: Histogram<string>;

  // Gauges para estados actuales
  private static activeConnections: Gauge<string>;
  private static activeBulkJobs: Gauge<string>;
  private static cacheSize: Gauge<string>;
  private static queueSize: Gauge<string>;
  private static memoryUsage: Gauge<string>;
  private static cpuUsage: Gauge<string>;

  // Summary para percentiles
  private static responseTimeSummary: Summary<string>;

  private constructor() {}

  /**
   * Singleton instance
   */
  public static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  /**
   * Inicializar métricas
   */
  public static initialize(): void {
    if (MetricsService.initialized || !config.METRICS_ENABLED) {
      return;
    }

    try {
      logger.info('📊 Initializing Metrics Service...');

      // Limpiar registro existente
      register.clear();

      // Métricas por defecto del sistema
      collectDefaultMetrics({
        register,
        prefix: 'permission_service_',
        gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5]
      });

      // Inicializar contadores
      MetricsService.initializeCounters();

      // Inicializar histogramas
      MetricsService.initializeHistograms();

      // Inicializar gauges
      MetricsService.initializeGauges();

      // Inicializar summaries
      MetricsService.initializeSummaries();

      // Configurar recolección periódica de métricas de sistema
      MetricsService.setupSystemMetricsCollection();

      MetricsService.initialized = true;
      logger.info('✅ Metrics Service initialized successfully');

    } catch (error) {
      logger.error('❌ Failed to initialize Metrics Service:', error);
      throw error;
    }
  }

  /**
   * Inicializar contadores
   */
  private static initializeCounters(): void {
    MetricsService.permissionCalculationsTotal = new Counter({
      name: 'permission_calculations_total',
      help: 'Total number of permission calculations performed',
      labelNames: ['user_id', 'community_id', 'result'],
      registers: [register]
    });

    MetricsService.permissionChecksGrantedTotal = new Counter({
      name: 'permission_checks_granted_total',
      help: 'Total number of permission checks that were granted',
      labelNames: ['permission_code', 'user_id', 'community_id'],
      registers: [register]
    });

    MetricsService.permissionChecksDeniedTotal = new Counter({
      name: 'permission_checks_denied_total',
      help: 'Total number of permission checks that were denied',
      labelNames: ['permission_code', 'user_id', 'community_id', 'reason'],
      registers: [register]
    });

    MetricsService.cacheHitsTotal = new Counter({
      name: 'cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['operation', 'key_type'],
      registers: [register]
    });

    MetricsService.cacheMissesTotal = new Counter({
      name: 'cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['operation', 'key_type'],
      registers: [register]
    });

    MetricsService.dbQueriesTotal = new Counter({
      name: 'db_queries_total',
      help: 'Total number of database queries executed',
      labelNames: ['operation', 'table', 'status'],
      registers: [register]
    });

    MetricsService.errorsTotal = new Counter({
      name: 'errors_total',
      help: 'Total number of errors by type',
      labelNames: ['code', 'status_code', 'endpoint', 'method'],
      registers: [register]
    });

    MetricsService.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'endpoint', 'status_code'],
      registers: [register]
    });

    MetricsService.authRequestsTotal = new Counter({
      name: 'auth_requests_total',
      help: 'Total number of authentication requests',
      labelNames: ['status', 'user_id', 'reason'],
      registers: [register]
    });

    MetricsService.propagationsTotal = new Counter({
      name: 'propagations_total',
      help: 'Total number of permission propagations',
      labelNames: ['type', 'status'],
      registers: [register]
    });

    MetricsService.bulkOperationsTotal = new Counter({
      name: 'bulk_operations_total',
      help: 'Total number of bulk operations',
      labelNames: ['operation_type', 'status'],
      registers: [register]
    });

    MetricsService.rateLimitExceededTotal = new Counter({
      name: 'rate_limit_exceeded_total',
      help: 'Total number of rate limit violations',
      labelNames: ['endpoint', 'method', 'user_id'],
      registers: [register]
    });

    MetricsService.validationErrorsTotal = new Counter({
      name: 'validation_errors_total',
      help: 'Total number of validation errors',
      labelNames: ['endpoint', 'method', 'field'],
      registers: [register]
    });

    MetricsService.cacheInvalidationsTotal = new Counter({
      name: 'cache_invalidations_total',
      help: 'Total number of cache invalidations',
      labelNames: ['type', 'reason'],
      registers: [register]
    });
  }

  /**
   * Inicializar histogramas
   */
  private static initializeHistograms(): void {
    MetricsService.permissionCalculationDuration = new Histogram({
      name: 'permission_calculation_duration_seconds',
      help: 'Duration of permission calculations in seconds',
      labelNames: ['user_id', 'community_id', 'complexity'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [register]
    });

    MetricsService.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'endpoint', 'status_code'],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [register]
    });

    MetricsService.dbQueryDuration = new Histogram({
      name: 'db_query_duration_seconds',
      help: 'Duration of database queries in seconds',
      labelNames: ['operation', 'table'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
      registers: [register]
    });

    MetricsService.cacheOperationDuration = new Histogram({
      name: 'cache_operation_duration_seconds',
      help: 'Duration of cache operations in seconds',
      labelNames: ['operation', 'key_type'],
      buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1],
      registers: [register]
    });

    MetricsService.propagationDuration = new Histogram({
      name: 'propagation_duration_seconds',
      help: 'Duration of permission propagations in seconds',
      labelNames: ['type', 'affected_count'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
      registers: [register]
    });
  }

  /**
   * Inicializar gauges
   */
  private static initializeGauges(): void {
    MetricsService.activeConnections = new Gauge({
      name: 'active_connections',
      help: 'Number of active connections',
      labelNames: ['type'],
      registers: [register]
    });

    MetricsService.activeBulkJobs = new Gauge({
      name: 'active_bulk_jobs',
      help: 'Number of active bulk jobs',
      labelNames: ['status'],
      registers: [register]
    });

    MetricsService.cacheSize = new Gauge({
      name: 'cache_size_bytes',
      help: 'Current cache size in bytes',
      labelNames: ['cache_type'],
      registers: [register]
    });

    MetricsService.queueSize = new Gauge({
      name: 'queue_size',
      help: 'Current queue size',
      labelNames: ['queue_name'],
      registers: [register]
    });

    MetricsService.memoryUsage = new Gauge({
      name: 'memory_usage_bytes',
      help: 'Current memory usage in bytes',
      labelNames: ['type'],
      registers: [register]
    });

    MetricsService.cpuUsage = new Gauge({
      name: 'cpu_usage_percent',
      help: 'Current CPU usage percentage',
      registers: [register]
    });
  }

  /**
   * Inicializar summaries
   */
  private static initializeSummaries(): void {
    MetricsService.responseTimeSummary = new Summary({
      name: 'response_time_summary_seconds',
      help: 'Summary of response times',
      labelNames: ['endpoint', 'method'],
      percentiles: [0.5, 0.75, 0.9, 0.95, 0.99],
      registers: [register]
    });
  }

  /**
   * Configurar recolección periódica de métricas del sistema
   */
  private static setupSystemMetricsCollection(): void {
    setInterval(() => {
      try {
        // Métricas de memoria
        const memUsage = process.memoryUsage();
        MetricsService.memoryUsage.set({ type: 'rss' }, memUsage.rss);
        MetricsService.memoryUsage.set({ type: 'heapUsed' }, memUsage.heapUsed);
        MetricsService.memoryUsage.set({ type: 'heapTotal' }, memUsage.heapTotal);
        MetricsService.memoryUsage.set({ type: 'external' }, memUsage.external);

        // Métricas de CPU (simplificado)
        const cpuUsage = process.cpuUsage();
        const totalUsage = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
        MetricsService.cpuUsage.set(totalUsage);

      } catch (error) {
        logger.warn('Error collecting system metrics:', error);
      }
    }, 30000); // Cada 30 segundos
  }

  /**
   * Incrementar contador
   */
  public static incrementCounter(
    name: string, 
    labels: Record<string, string> = {}
  ): void {
    try {
      const counter = MetricsService.getCounterByName(name);
      if (counter) {
        counter.inc(labels);
      }
    } catch (error) {
      logger.warn(`Error incrementing counter ${name}:`, error);
    }
  }

  /**
   * Observar histograma
   */
  public static observeHistogram(
    name: string, 
    value: number, 
    labels: Record<string, string> = {}
  ): void {
    try {
      const histogram = MetricsService.getHistogramByName(name);
      if (histogram) {
        histogram.observe(labels, value);
      }
    } catch (error) {
      logger.warn(`Error observing histogram ${name}:`, error);
    }
  }

  /**
   * Establecer gauge
   */
  public static setGauge(
    name: string, 
    value: number, 
    labels: Record<string, string> = {}
  ): void {
    try {
      const gauge = MetricsService.getGaugeByName(name);
      if (gauge) {
        gauge.set(labels, value);
      }
    } catch (error) {
      logger.warn(`Error setting gauge ${name}:`, error);
    }
  }

  /**
   * Observar summary
   */
  public static observeSummary(
    name: string, 
    value: number, 
    labels: Record<string, string> = {}
  ): void {
    try {
      if (name === 'response_time_summary_seconds') {
        MetricsService.responseTimeSummary.observe(labels, value);
      }
    } catch (error) {
      logger.warn(`Error observing summary ${name}:`, error);
    }
  }

  /**
   * Obtener contador por nombre
   */
  private static getCounterByName(name: string): Counter<string> | null {
    const counters: Record<string, Counter<string>> = {
      'permission_calculations_total': MetricsService.permissionCalculationsTotal,
      'permission_checks_granted_total': MetricsService.permissionChecksGrantedTotal,
      'permission_checks_denied_total': MetricsService.permissionChecksDeniedTotal,
      'cache_hits_total': MetricsService.cacheHitsTotal,
      'cache_misses_total': MetricsService.cacheMissesTotal,
      'db_queries_total': MetricsService.dbQueriesTotal,
      'errors_total': MetricsService.errorsTotal,
      'http_requests_total': MetricsService.httpRequestsTotal,
      'auth_requests_total': MetricsService.authRequestsTotal,
      'propagations_total': MetricsService.propagationsTotal,
      'bulk_operations_total': MetricsService.bulkOperationsTotal,
      'rate_limit_exceeded_total': MetricsService.rateLimitExceededTotal,
      'validation_errors_total': MetricsService.validationErrorsTotal,
      'cache_invalidations_total': MetricsService.cacheInvalidationsTotal
    };

    return counters[name] || null;
  }

  /**
   * Obtener histograma por nombre
   */
  private static getHistogramByName(name: string): Histogram<string> | null {
    const histograms: Record<string, Histogram<string>> = {
      'permission_calculation_duration_seconds': MetricsService.permissionCalculationDuration,
      'http_request_duration_seconds': MetricsService.httpRequestDuration,
      'db_query_duration_seconds': MetricsService.dbQueryDuration,
      'cache_operation_duration_seconds': MetricsService.cacheOperationDuration,
      'propagation_duration_seconds': MetricsService.propagationDuration
    };

    return histograms[name] || null;
  }

  /**
   * Obtener gauge por nombre
   */
  private static getGaugeByName(name: string): Gauge<string> | null {
    const gauges: Record<string, Gauge<string>> = {
      'active_connections': MetricsService.activeConnections,
      'active_bulk_jobs': MetricsService.activeBulkJobs,
      'cache_size_bytes': MetricsService.cacheSize,
      'queue_size': MetricsService.queueSize,
      'memory_usage_bytes': MetricsService.memoryUsage,
      'cpu_usage_percent': MetricsService.cpuUsage
    };

    return gauges[name] || null;
  }

  /**
   * Obtener todas las métricas en formato Prometheus
   */
  public static async getMetrics(): Promise<string> {
    if (!MetricsService.initialized) {
      return '# Metrics not initialized\n';
    }

    try {
      return await register.metrics();
    } catch (error) {
      logger.error('Error getting metrics:', error);
      return '# Error getting metrics\n';
    }
  }

  /**
   * Obtener métricas específicas de permisos
   */
  public static async getPermissionMetrics(): Promise<any> {
    try {
      const metrics = await register.getSingleMetricAsString('permission_calculations_total');
      return metrics;
    } catch (error) {
      logger.error('Error getting permission metrics:', error);
      return null;
    }
  }

  /**
   * Limpiar todas las métricas
   */
  public static clear(): void {
    register.clear();
    MetricsService.initialized = false;
    logger.info('Metrics cleared');
  }

  /**
   * Middleware para métricas HTTP
   */
  public static httpMetricsMiddleware() {
    return (req: any, res: any, next: any) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const duration = (Date.now() - startTime) / 1000;
        const endpoint = req.route?.path || req.path;
        
        // Incrementar contador de requests
        MetricsService.incrementCounter('http_requests_total', {
          method: req.method,
          endpoint,
          status_code: res.statusCode.toString()
        });
        
        // Observar duración
        MetricsService.observeHistogram('http_request_duration_seconds', duration, {
          method: req.method,
          endpoint,
          status_code: res.statusCode.toString()
        });
        
        // Observar summary
        MetricsService.observeSummary('response_time_summary_seconds', duration, {
          endpoint,
          method: req.method
        });
      });
      
      next();
    };
  }

  /**
   * Obtener estadísticas de rendimiento
   */
  public static getPerformanceStats(): any {
    return {
      initialized: MetricsService.initialized,
      metricsEnabled: config.METRICS_ENABLED,
      registeredMetrics: register.getMetricsAsArray().length,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };
  }

  /**
   * Health check de métricas
   */
  public static healthCheck(): boolean {
    return MetricsService.initialized && config.METRICS_ENABLED;
  }
}

export default MetricsService;