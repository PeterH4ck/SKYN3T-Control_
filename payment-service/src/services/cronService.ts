import cron from 'node-cron';
import { Op } from 'sequelize';
import Payment from '../models/Payment';
import { paymentService } from './paymentService';
import { providerService } from './providerService';
import { publisher } from '../config/rabbitmq';
import { logger } from '../utils/logger';
import { PaymentStatus } from '../types/bank.types';
import { lock } from '../config/redis';

class CronService {
  private jobs: Map<string, cron.ScheduledTask> = new Map();

  // Initialize all cron jobs
  async initializeCronJobs(): Promise<void> {
    try {
      logger.info('Initializing cron jobs...');

      // Check pending payments every 5 minutes
      this.scheduleJob(
        'check-pending-payments',
        '*/5 * * * *',
        this.checkPendingPayments.bind(this)
      );

      // Reconcile payments every hour
      this.scheduleJob(
        'reconcile-payments',
        '0 * * * *',
        this.reconcilePayments.bind(this)
      );

      // Clean up expired payments daily
      this.scheduleJob(
        'cleanup-expired-payments',
        '0 2 * * *',
        this.cleanupExpiredPayments.bind(this)
      );

      // Update provider health status every minute
      this.scheduleJob(
        'update-provider-health',
        '* * * * *',
        this.updateProviderHealth.bind(this)
      );

      // Generate daily reports
      this.scheduleJob(
        'generate-daily-reports',
        '0 3 * * *',
        this.generateDailyReports.bind(this)
      );

      logger.info('Cron jobs initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize cron jobs:', error);
      throw error;
    }
  }

  // Schedule a cron job
  private scheduleJob(name: string, schedule: string, task: () => Promise<void>): void {
    const job = cron.schedule(schedule, async () => {
      try {
        logger.debug(`Running cron job: ${name}`);
        await task();
        logger.debug(`Cron job completed: ${name}`);
      } catch (error) {
        logger.error(`Error in cron job ${name}:`, error);
      }
    });

    this.jobs.set(name, job);
    job.start();
    logger.info(`Cron job scheduled: ${name} (${schedule})`);
  }

  // Check pending payments
  private async checkPendingPayments(): Promise<void> {
    await lock.withLock('cron:check-pending-payments', async () => {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

      // Find payments pending for more than 30 minutes
      const pendingPayments = await Payment.findAll({
        where: {
          status: PaymentStatus.PENDING,
          createdAt: {
            [Op.lt]: thirtyMinutesAgo,
          },
        },
        limit: 100,
      });

      logger.info(`Found ${pendingPayments.length} pending payments to check`);

      for (const payment of pendingPayments) {
        try {
          // Try to get status from provider
          const provider = providerService.getProvider(payment.provider);
          const transaction = await provider.getTransaction({
            transactionId: payment.transactionId,
            bankTransactionId: payment.bankTransactionId,
          });

          // Update payment if status changed
          if (transaction.status !== payment.status) {
            await payment.update({
              status: transaction.status,
              bankTransactionId: transaction.bankTransactionId || payment.bankTransactionId,
              authorizationCode: transaction.authorizationCode,
            });

            logger.info(`Updated payment status: ${payment.id} -> ${transaction.status}`);
          }
        } catch (error) {
          logger.error(`Error checking payment ${payment.id}:`, error);
          
          // Mark as expired if too old (2 hours)
          const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
          if (payment.createdAt < twoHoursAgo) {
            await payment.update({ status: PaymentStatus.EXPIRED });
            logger.info(`Marked payment as expired: ${payment.id}`);
          }
        }
      }
    });
  }

  // Reconcile payments
  private async reconcilePayments(): Promise<void> {
    await lock.withLock('cron:reconcile-payments', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Find recent completed payments that haven't been reconciled
      const paymentsToReconcile = await Payment.findAll({
        where: {
          status: PaymentStatus.COMPLETED,
          updatedAt: {
            [Op.between]: [oneDayAgo, oneHourAgo],
          },
          '$metadata.reconciled$': null,
        },
        limit: 50,
      });

      logger.info(`Found ${paymentsToReconcile.length} payments to reconcile`);

      for (const payment of paymentsToReconcile) {
        try {
          await paymentService.reconcilePayment(payment.id, payment.userId);
          
          // Mark as reconciled
          await payment.update({
            metadata: {
              ...payment.metadata,
              reconciled: true,
              reconciledAt: new Date().toISOString(),
            },
          });
        } catch (error) {
          logger.error(`Error reconciling payment ${payment.id}:`, error);
          
          // Publish reconciliation needed event
          await publisher.reconciliationNeeded({
            paymentId: payment.id,
            provider: payment.provider,
            error: (error as Error).message,
          });
        }
      }
    });
  }

  // Clean up expired payments
  private async cleanupExpiredPayments(): Promise<void> {
    await lock.withLock('cron:cleanup-expired-payments', async () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

      // Update old pending payments to expired
      const [updatedCount] = await Payment.update(
        { status: PaymentStatus.EXPIRED },
        {
          where: {
            status: PaymentStatus.PENDING,
            createdAt: {
              [Op.lt]: threeDaysAgo,
            },
          },
        }
      );

      if (updatedCount > 0) {
        logger.info(`Marked ${updatedCount} payments as expired`);
      }
    });
  }

  // Update provider health status
  private async updateProviderHealth(): Promise<void> {
    const healthStatus = await providerService.healthCheckAll();
    
    for (const [provider, healthy] of Object.entries(healthStatus)) {
      // Update metrics
      const { metricsService } = await import('./metricsService');
      metricsService.updateProviderHealth(provider, healthy);
      
      // Log unhealthy providers
      if (!healthy) {
        logger.warn(`Provider ${provider} is unhealthy`);
      }
    }
  }

  // Generate daily reports
  private async generateDailyReports(): Promise<void> => {
    await lock.withLock('cron:generate-daily-reports', async () => {
      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get payment statistics
        const stats = await Payment.findAll({
          attributes: [
            'provider',
            'status',
            'currency',
            [Payment.sequelize!.fn('COUNT', '*'), 'count'],
            [Payment.sequelize!.fn('SUM', Payment.sequelize!.col('amount')), 'total_amount'],
            [Payment.sequelize!.fn('AVG', Payment.sequelize!.col('amount')), 'avg_amount'],
          ],
          where: {
            createdAt: {
              [Op.between]: [yesterday, today],
            },
          },
          group: ['provider', 'status', 'currency'],
          raw: true,
        });

        logger.info('Daily payment statistics generated', { stats });

        // Publish report event
        await publisher.dailyReportGenerated({
          date: yesterday.toISOString().split('T')[0],
          stats,
          generatedAt: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('Error generating daily reports:', error);
      }
    });
  }

  // Stop all cron jobs
  stopAllJobs(): void {
    for (const [name, job] of this.jobs) {
      job.stop();
      logger.info(`Cron job stopped: ${name}`);
    }
    this.jobs.clear();
  }

  // Get job status
  getJobStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    for (const [name, job] of this.jobs) {
      status[name] = job.getStatus() === 'scheduled';
    }
    return status;
  }
}

export const cronService = new CronService();
export const initializeCronJobs = () => cronService.initializeCronJobs();