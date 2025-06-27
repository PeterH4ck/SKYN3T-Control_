import { Op } from 'sequelize';
import Payment, { Refund } from '../models/Payment';
import { providerService } from './providerService';
import { cache, lock } from '../config/redis';
import { publisher } from '../config/rabbitmq';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { withTransaction } from '../config/database';
import { 
  PaymentStatus, 
  PaymentRequest,
  RefundRequest,
  Currency
} from '../types/bank.types';

interface CreatePaymentData {
  provider: string;
  amount: number;
  currency: Currency;
  description: string;
  customerEmail: string;
  customerName: string;
  customerRut?: string;
  customerPhone?: string;
  paymentMethod?: string;
  installments?: number;
  metadata?: Record<string, any>;
  userId: string;
  communityId: string;
  transactionId: string;
}

interface PaymentFilters {
  page?: number;
  limit?: number;
  status?: PaymentStatus;
  provider?: string;
  startDate?: string;
  endDate?: string;
  userId?: string;
  communityId?: string;
}

class PaymentService {
  // Create new payment
  async createPayment(data: CreatePaymentData): Promise<Payment> {
    return withTransaction(async (transaction) => {
      try {
        // Create payment record
        const payment = await Payment.create({
          ...data,
          status: PaymentStatus.PENDING,
        }, { transaction });

        // Get provider adapter
        const provider = providerService.getProvider(data.provider);

        // Prepare payment request
        const paymentRequest: PaymentRequest = {
          transactionId: payment.transactionId,
          amount: data.amount,
          currency: data.currency,
          description: data.description,
          customerEmail: data.customerEmail,
          customerName: data.customerName,
          customerRut: data.customerRut,
          customerPhone: data.customerPhone,
          callbackUrl: `${process.env.CALLBACK_BASE_URL}/api/v1/webhooks/${data.provider}`,
          successUrl: `${process.env.FRONTEND_URL}/payments/success?id=${payment.id}`,
          failureUrl: `${process.env.FRONTEND_URL}/payments/failure?id=${payment.id}`,
          paymentMethod: data.paymentMethod as any,
          installments: data.installments,
          metadata: {
            ...data.metadata,
            paymentId: payment.id,
          },
        };

        // Process payment with provider
        const response = await provider.processPayment(paymentRequest);

        // Update payment with provider response
        await payment.update({
          bankTransactionId: response.bankTransactionId,
          status: response.status,
          redirectUrl: response.redirectUrl,
          authorizationCode: response.authorizationCode,
          errorCode: response.errorCode,
          errorMessage: response.errorMessage,
        }, { transaction });

        // Cache payment status
        await cache.set(
          `payment:${payment.id}`,
          { status: payment.status, provider: payment.provider },
          300 // 5 minutes
        );

        // Publish payment created event
        await publisher.paymentCreated({
          paymentId: payment.id,
          transactionId: payment.transactionId,
          provider: payment.provider,
          amount: payment.amount,
          currency: payment.currency,
          userId: payment.userId,
          communityId: payment.communityId,
        });

        await payment.reload();
        return payment;
      } catch (error) {
        logger.error('Error creating payment:', error);
        throw error;
      }
    });
  }

  // Get payment by ID
  async getPaymentById(id: string, userId?: string): Promise<Payment> {
    // Try cache first
    const cached = await cache.get<Payment>(`payment:full:${id}`);
    if (cached) {
      return cached;
    }

    const where: any = { id };
    if (userId) {
      where.userId = userId;
    }

    const payment = await Payment.findOne({
      where,
      include: [{
        model: Refund,
        as: 'refunds',
      }],
    });

    if (!payment) {
      throw AppError.notFound('Payment');
    }

    // Cache the full payment
    await cache.set(`payment:full:${id}`, payment, 60);

    return payment;
  }

  // List payments with filters
  async listPayments(filters: PaymentFilters) {
    const {
      page = 1,
      limit = 20,
      status,
      provider,
      startDate,
      endDate,
      userId,
      communityId,
    } = filters;

    const where: any = {};

    if (status) where.status = status;
    if (provider) where.provider = provider;
    if (userId) where.userId = userId;
    if (communityId) where.communityId = communityId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate);
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await Payment.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      include: [{
        model: Refund,
        as: 'refunds',
        required: false,
      }],
    });

    return {
      payments: rows,
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit),
      },
    };
  }

  // Capture payment
  async capturePayment(id: string, userId: string, amount?: number): Promise<Payment> {
    return lock.withLock(`payment:${id}`, async () => {
      const payment = await this.getPaymentById(id, userId);

      if (payment.status !== PaymentStatus.PENDING) {
        throw new AppError(
          'Payment cannot be captured in current status',
          400,
          'INVALID_STATUS'
        );
      }

      // Get provider adapter
      const provider = providerService.getProvider(payment.provider);

      // For PayPal and similar, we need special handling
      const transactionId = payment.metadata?.payerId 
        ? `${payment.bankTransactionId}:${payment.metadata.payerId}`
        : payment.bankTransactionId || payment.transactionId;

      // Capture with provider
      const response = await provider.confirmPayment(transactionId);

      // Update payment
      await payment.update({
        status: response.status,
        authorizationCode: response.authorizationCode,
        processedAt: response.status === PaymentStatus.COMPLETED ? new Date() : undefined,
      });

      // Clear cache
      await cache.del([`payment:${id}`, `payment:full:${id}`]);

      // Publish event
      if (response.status === PaymentStatus.COMPLETED) {
        await publisher.paymentCompleted({
          paymentId: payment.id,
          transactionId: payment.transactionId,
          provider: payment.provider,
          amount: payment.amount,
          authorizationCode: response.authorizationCode,
        });
      }

      return payment;
    });
  }

  // Cancel payment
  async cancelPayment(id: string, userId: string): Promise<Payment> {
    return lock.withLock(`payment:${id}`, async () => {
      const payment = await this.getPaymentById(id, userId);

      if (![PaymentStatus.PENDING, PaymentStatus.PROCESSING].includes(payment.status)) {
        throw new AppError(
          'Payment cannot be cancelled in current status',
          400,
          'INVALID_STATUS'
        );
      }

      // Get provider adapter
      const provider = providerService.getProvider(payment.provider);

      // Cancel with provider
      await provider.cancelPayment(payment.bankTransactionId || payment.transactionId);

      // Update payment
      await payment.update({
        status: PaymentStatus.CANCELLED,
      });

      // Clear cache
      await cache.del([`payment:${id}`, `payment:full:${id}`]);

      return payment;
    });
  }

  // Refund payment
  async refundPayment(
    id: string, 
    userId: string, 
    amount: number, 
    reason: string
  ): Promise<{ payment: Payment; refund: Refund }> {
    return withTransaction(async (transaction) => {
      const payment = await this.getPaymentById(id, userId);

      if (payment.status !== PaymentStatus.COMPLETED) {
        throw new AppError(
          'Only completed payments can be refunded',
          400,
          'INVALID_STATUS'
        );
      }

      // Check if amount is valid
      const totalRefunded = payment.refunds?.reduce(
        (sum, r) => sum + parseFloat(r.amount.toString()), 
        0
      ) || 0;
      
      if (totalRefunded + amount > parseFloat(payment.amount.toString())) {
        throw new AppError(
          'Refund amount exceeds payment amount',
          400,
          'INVALID_AMOUNT'
        );
      }

      // Create refund record
      const refund = await Refund.create({
        paymentId: payment.id,
        refundTransactionId: `REF-${Date.now()}-${payment.transactionId}`,
        amount,
        currency: payment.currency,
        reason,
        status: PaymentStatus.PENDING,
      }, { transaction });

      // Get provider adapter
      const provider = providerService.getProvider(payment.provider);

      // Process refund
      const refundRequest: RefundRequest = {
        originalTransactionId: payment.bankTransactionId || payment.transactionId,
        refundTransactionId: refund.refundTransactionId,
        amount,
        reason,
        metadata: {
          paymentId: payment.id,
          refundId: refund.id,
        },
      };

      const response = await provider.refundPayment(refundRequest);

      // Update refund
      await refund.update({
        bankRefundId: response.bankRefundId,
        status: response.status,
        processedAt: response.status === PaymentStatus.REFUNDED ? new Date() : undefined,
      }, { transaction });

      // Update payment status
      const isFullRefund = totalRefunded + amount === parseFloat(payment.amount.toString());
      await payment.update({
        status: isFullRefund ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED,
        refundedAt: new Date(),
      }, { transaction });

      // Clear cache
      await cache.del([`payment:${id}`, `payment:full:${id}`]);

      // Publish event
      await publisher.paymentRefunded({
        paymentId: payment.id,
        refundId: refund.id,
        amount,
        isFullRefund,
      });

      return { payment, refund };
    });
  }

  // Get payment status (public)
  async getPaymentStatus(id: string): Promise<{ id: string; status: PaymentStatus; provider: string }> {
    // Check cache first
    const cached = await cache.get<{ status: PaymentStatus; provider: string }>(`payment:${id}`);
    if (cached) {
      return { id, ...cached };
    }

    const payment = await Payment.findByPk(id, {
      attributes: ['id', 'status', 'provider'],
    });

    if (!payment) {
      throw AppError.notFound('Payment');
    }

    // Cache the status
    await cache.set(
      `payment:${id}`,
      { status: payment.status, provider: payment.provider },
      300
    );

    return {
      id: payment.id,
      status: payment.status,
      provider: payment.provider,
    };
  }

  // Retry failed payment
  async retryPayment(id: string, userId: string): Promise<Payment> {
    const payment = await this.getPaymentById(id, userId);

    if (payment.status !== PaymentStatus.FAILED) {
      throw new AppError(
        'Only failed payments can be retried',
        400,
        'INVALID_STATUS'
      );
    }

    // Create new payment with same data
    const newPaymentData: CreatePaymentData = {
      provider: payment.provider,
      amount: parseFloat(payment.amount.toString()),
      currency: payment.currency,
      description: payment.description,
      customerEmail: payment.customerEmail,
      customerName: payment.customerName,
      customerRut: payment.customerRut,
      customerPhone: payment.customerPhone,
      paymentMethod: payment.paymentMethod,
      metadata: {
        ...payment.metadata,
        originalPaymentId: payment.id,
        isRetry: true,
      },
      userId: payment.userId,
      communityId: payment.communityId,
      transactionId: `TXN-RETRY-${Date.now()}-${payment.transactionId}`,
    };

    return this.createPayment(newPaymentData);
  }

  // Generate receipt (placeholder - implement PDF generation)
  async generateReceipt(id: string, userId: string): Promise<Buffer> {
    const payment = await this.getPaymentById(id, userId);

    if (payment.status !== PaymentStatus.COMPLETED) {
      throw new AppError(
        'Receipt only available for completed payments',
        400,
        'INVALID_STATUS'
      );
    }

    // TODO: Implement PDF generation
    // For now, return a simple text receipt
    const receipt = `
PAYMENT RECEIPT
===============
Transaction ID: ${payment.transactionId}
Date: ${payment.processedAt?.toISOString()}
Amount: ${payment.currency} ${payment.amount}
Status: ${payment.status}
Customer: ${payment.customerName}
Email: ${payment.customerEmail}
Description: ${payment.description}
    `.trim();

    return Buffer.from(receipt);
  }

  // Reconcile payment
  async reconcilePayment(id: string, userId: string): Promise<any> {
    const payment = await this.getPaymentById(id, userId);

    // Get provider adapter
    const provider = providerService.getProvider(payment.provider);

    // Query transaction from provider
    const transaction = await provider.getTransaction({
      transactionId: payment.transactionId,
      bankTransactionId: payment.bankTransactionId,
    });

    // Compare and update if needed
    const updates: any = {};
    
    if (transaction.status !== payment.status) {
      updates.status = transaction.status;
    }
    
    if (transaction.authorizationCode && !payment.authorizationCode) {
      updates.authorizationCode = transaction.authorizationCode;
    }

    if (Object.keys(updates).length > 0) {
      await payment.update(updates);
      logger.info('Payment reconciled with updates', { paymentId: id, updates });
    }

    return {
      payment,
      providerTransaction: transaction,
      updated: Object.keys(updates).length > 0,
      updates,
    };
  }

  // Export payments as CSV
  async exportPayments(paymentIds: string[], userId: string): Promise<string> {
    const payments = await Payment.findAll({
      where: {
        id: { [Op.in]: paymentIds },
        userId,
      },
      order: [['createdAt', 'DESC']],
    });

    // Generate CSV
    const headers = [
      'Transaction ID',
      'Date',
      'Provider',
      'Status',
      'Amount',
      'Currency',
      'Customer Name',
      'Customer Email',
      'Description',
    ];

    const rows = payments.map(p => [
      p.transactionId,
      p.createdAt.toISOString(),
      p.provider,
      p.status,
      p.amount,
      p.currency,
      p.customerName,
      p.customerEmail,
      p.description,
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    return csv;
  }
}

export const paymentService = new PaymentService();