import express from 'express';
import { register, Counter, Histogram, Gauge, Summary } from 'prom-client';
import { config } from '../config/config';
import { logger } from '../utils/logger';

// Metrics
const paymentCounter = new Counter({
  name: 'payment_transactions_total',
  help: 'Total number of payment transactions',
  labelNames: ['provider', 'status', 'currency'],
});

const paymentAmountHistogram = new Histogram({
  name: 'payment_transaction_amount',
  help: 'Payment transaction amounts',
  labelNames: ['provider', 'currency'],
  buckets: [10, 50, 100, 500, 1000, 5000, 10000, 50000, 100000],
});

const paymentDurationHistogram = new Histogram({
  name: 'payment_processing_duration_seconds',
  help: 'Payment processing duration in seconds',
  labelNames: ['provider', 'operation'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
});

const paymentErrorCounter = new Counter({
  name: 'payment_errors_total',
  help: 'Total number of payment errors',
  labelNames: ['provider', 'error_type'],
});

const providerHealthGauge = new Gauge({
  name: 'payment_provider_health',
  help: 'Payment provider health status (1 = healthy, 0 = unhealthy)',
  labelNames: ['provider'],
});

const providerResponseTime = new Summary({
  name: 'payment_provider_response_time',
  help: 'Payment provider response time in milliseconds',
  labelNames: ['provider', 'operation'],
  percentiles: [0.5, 0.9, 0.95, 0.99],
});

const activePaymentsGauge = new Gauge({
  name: 'payment_active_transactions',
  help: 'Number of active payment transactions',
  labelNames: ['provider', 'status'],
});

// Metrics service class
class MetricsService {
  private metricsServer: express.Application;

  constructor() {
    this.metricsServer = express();
    this.setupMetricsEndpoint();
  }

  private setupMetricsEndpoint(): void {
    // Metrics endpoint
    this.metricsServer.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', register.contentType);
        const metrics = await register.metrics();
        res.end(metrics);
      } catch (error) {
        res.status(500).end();
      }
    });

    // Health endpoint for metrics server
    this.metricsServer.get('/health', (req, res) => {
      res.status(200).json({ status: 'ok' });
    });
  }

  // Start metrics server
  async startMetricsServer(): Promise<void> {
    const port = config.metricsPort;

    this.metricsServer.listen(port, () => {
      logger.info(`Metrics server started on port ${port}`);
    });
  }

  // Record payment transaction
  recordPaymentTransaction(
    provider: string,
    status: string,
    amount: number,
    currency: string,
    duration?: number
  ): void {
    paymentCounter.inc({ provider, status, currency });
    paymentAmountHistogram.observe({ provider, currency }, amount);
    
    if (duration) {
      paymentDurationHistogram.observe({ provider, operation: 'create' }, duration / 1000);
    }
  }

  // Record payment error
  recordPaymentError(provider: string, errorType: string): void {
    paymentErrorCounter.inc({ provider, error_type: errorType });
  }

  // Update provider health
  updateProviderHealth(provider: string, healthy: boolean): void {
    providerHealthGauge.set({ provider }, healthy ? 1 : 0);
  }

  // Record provider response time
  recordProviderResponseTime(
    provider: string,
    operation: string,
    responseTime: number
  ): void {
    providerResponseTime.observe({ provider, operation }, responseTime);
  }

  // Update active payments gauge
  updateActivePayments(provider: string, status: string, count: number): void {
    activePaymentsGauge.set({ provider, status }, count);
  }

  // Record refund transaction
  recordRefundTransaction(
    provider: string,
    status: string,
    amount: number,
    currency: string,
    duration?: number
  ): void {
    paymentCounter.inc({ 
      provider, 
      status: `refund_${status}`, 
      currency 
    });
    
    if (duration) {
      paymentDurationHistogram.observe(
        { provider, operation: 'refund' }, 
        duration / 1000
      );
    }
  }

  // Custom metric recorder
  recordCustomMetric(
    name: string,
    value: number,
    labels?: Record<string, string>
  ): void {
    // This would be used for custom business metrics
    logger.debug('Custom metric recorded:', { name, value, labels });
  }
}

export const metricsService = new MetricsService();
export const startMetricsServer = () => metricsService.startMetricsServer();