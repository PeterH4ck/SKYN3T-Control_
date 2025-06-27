import { consumer, publisher } from '../config/rabbitmq';
import { paymentService } from './paymentService';
import { providerService } from './providerService';
import { logger, logWebhookEvent } from '../utils/logger';
import { WebhookPayload, PaymentStatus } from '../types/bank.types';

class WebhookService {
  // Start listening for webhook events
  async startWebhookListener(): Promise<void> {
    try {
      // Listen for webhook events from RabbitMQ
      await consumer.consume('WEBHOOK_RECEIVED', async (msg) => {
        const payload = consumer.parseMessage<WebhookPayload>(msg);
        await this.processWebhook(payload);
      });

      logger.info('Webhook listener started');
    } catch (error) {
      logger.error('Failed to start webhook listener:', error);
      throw error;
    }
  }

  // Process webhook payload
  async processWebhook(payload: WebhookPayload): Promise<void> {
    try {
      logWebhookEvent(payload.event, payload.transactionId, {
        bankTransactionId: payload.bankTransactionId,
        status: payload.status,
        amount: payload.amount,
      });

      // Get payment
      const payment = await paymentService.getPaymentById(payload.transactionId);
      
      if (!payment) {
        logger.error('Payment not found for webhook:', { transactionId: payload.transactionId });
        return;
      }

      // Update payment status based on webhook
      const newStatus = this.mapWebhookStatus(payload.status);
      
      if (newStatus && newStatus !== payment.status) {
        await payment.update({
          status: newStatus,
          bankTransactionId: payload.bankTransactionId || payment.bankTransactionId,
          processedAt: newStatus === PaymentStatus.COMPLETED ? new Date() : undefined,
          failedAt: newStatus === PaymentStatus.FAILED ? new Date() : undefined,
        });

        // Publish status change event
        await this.publishStatusChangeEvent(payment.id, payment.status, newStatus);
      }

      // Process specific webhook events
      await this.processSpecificWebhookEvent(payload, payment);

    } catch (error) {
      logger.error('Error processing webhook:', error);
      // Don't throw - we don't want to requeue webhook processing
    }
  }

  // Map webhook status to internal status
  private mapWebhookStatus(webhookStatus: string): PaymentStatus | null {
    const statusMap: Record<string, PaymentStatus> = {
      'completed': PaymentStatus.COMPLETED,
      'approved': PaymentStatus.COMPLETED,
      'paid': PaymentStatus.COMPLETED,
      'succeeded': PaymentStatus.COMPLETED,
      'pending': PaymentStatus.PENDING,
      'processing': PaymentStatus.PROCESSING,
      'failed': PaymentStatus.FAILED,
      'rejected': PaymentStatus.FAILED,
      'declined': PaymentStatus.FAILED,
      'cancelled': PaymentStatus.CANCELLED,
      'voided': PaymentStatus.CANCELLED,
      'refunded': PaymentStatus.REFUNDED,
      'partially_refunded': PaymentStatus.PARTIALLY_REFUNDED,
    };

    return statusMap[webhookStatus.toLowerCase()] || null;
  }

  // Process specific webhook events
  private async processSpecificWebhookEvent(payload: WebhookPayload, payment: any): Promise<void> {
    switch (payload.event.toLowerCase()) {
      case 'payment.completed':
      case 'payment.sale.completed':
        await publisher.paymentCompleted({
          paymentId: payment.id,
          transactionId: payment.transactionId,
          provider: payment.provider,
          amount: payment.amount,
        });
        break;

      case 'payment.failed':
      case 'payment.sale.denied':
        await publisher.paymentFailed({
          paymentId: payment.id,
          transactionId: payment.transactionId,
          provider: payment.provider,
          reason: payload.metadata?.reason || 'Unknown',
        });
        break;

      case 'payment.refunded':
      case 'payment.sale.refunded':
        await publisher.paymentRefunded({
          paymentId: payment.id,
          transactionId: payment.transactionId,
          provider: payment.provider,
          amount: payload.amount,
        });
        break;

      default:
        logger.info('Unhandled webhook event type:', { event: payload.event });
    }
  }

  // Publish status change event
  private async publishStatusChangeEvent(
    paymentId: string,
    oldStatus: PaymentStatus,
    newStatus: PaymentStatus
  ): Promise<void> {
    await publisher.paymentStatusChanged({
      paymentId,
      oldStatus,
      newStatus,
      timestamp: new Date().toISOString(),
    });
  }

  // Validate webhook signature
  async validateWebhookSignature(
    provider: string,
    payload: any,
    signature: string
  ): Promise<boolean> {
    try {
      const gateway = providerService.getProvider(provider);
      
      if ('validateWebhook' in gateway) {
        return gateway.validateWebhook(payload, signature);
      }

      // If provider doesn't support webhook validation, log warning
      logger.warn('Provider does not support webhook validation:', { provider });
      return true; // Allow webhook to proceed
    } catch (error) {
      logger.error('Error validating webhook signature:', error);
      return false;
    }
  }
}

export const webhookService = new WebhookService();
export const startWebhookListener = () => webhookService.startWebhookListener();