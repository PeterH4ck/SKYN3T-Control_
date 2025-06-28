import { Payment } from '../models/Payment';
import { PaymentService } from './paymentService';
import { SplitPayment, PaymentRequest, PaymentResult } from '../types/gateway.types';
import { AppError } from '../utils/AppError';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { Redis } from 'ioredis';
import { Op, Transaction } from 'sequelize';
import sequelize from '../config/database';

/**
 * Servicio para gestionar pagos divididos entre múltiples destinatarios
 * Útil para distribuir gastos comunes, comisiones, etc.
 */
export class SplitPaymentService {
  private paymentService: PaymentService;
  private redis: Redis;

  constructor(paymentService: PaymentService, redis: Redis) {
    this.paymentService = paymentService;
    this.redis = redis;
  }

  /**
   * Procesar un pago dividido
   */
  async processSplitPayment(data: {
    totalAmount: number;
    currency?: string;
    payerId: string;
    communityId: string;
    paymentMethod: string;
    gatewayProvider: string;
    description?: string;
    splits: SplitPayment;
    metadata?: any;
  }): Promise<{
    mainPayment: PaymentResult;
    splitPayments: PaymentResult[];
    summary: {
      totalAmount: number;
      totalDistributed: number;
      totalFees: number;
      recipients: number;
    };
  }> {
    const transaction = await sequelize.transaction();

    try {
      logger.info('[SplitPaymentService] Procesando pago dividido', {
        totalAmount: data.totalAmount,
        recipients: data.splits.splits.length + 1
      });

      // Validar splits
      this.validateSplits(data.totalAmount, data.splits);

      // 1. Procesar pago principal del pagador
      const mainPaymentRequest: PaymentRequest = {
        amount: data.totalAmount,
        currency: data.currency || 'CLP',
        reference: `SPLIT-${uuidv4()}`,
        description: data.description || 'Pago dividido',
        customer: {
          id: data.payerId,
          userId: data.payerId,
          email: '', // Se obtendría del usuario
          name: ''   // Se obtendría del usuario
        },
        paymentMethodId: data.paymentMethod,
        metadata: {
          type: 'split_payment',
          communityId: data.communityId,
          splitId: data.splits.mainRecipient.id,
          ...data.metadata
        }
      };

      const mainPayment = await this.paymentService.processPayment(
        mainPaymentRequest,
        data.gatewayProvider
      );

      if (!mainPayment.success) {
        throw new AppError('Error procesando pago principal', 400);
      }

      // 2. Calcular montos para cada destinatario
      const splitAmounts = this.calculateSplitAmounts(
        data.totalAmount,
        data.splits
      );

      // 3. Crear registros de pago para cada destinatario
      const splitPayments: PaymentResult[] = [];
      const splitPaymentRecords: any[] = [];

      // Pago para el destinatario principal
      const mainRecipientPayment = await this.createSplitPaymentRecord({
        recipientId: data.splits.mainRecipient.id,
        amount: splitAmounts.mainAmount,
        currency: data.currency || 'CLP',
        communityId: data.communityId,
        originalPaymentId: mainPayment.transactionId,
        description: `Pago principal - ${data.description}`,
        metadata: {
          role: 'main_recipient',
          percentage: data.splits.mainRecipient.percentage,
          splitPaymentId: mainPayment.transactionId
        },
        transaction
      });

      splitPayments.push({
        success: true,
        transactionId: mainRecipientPayment.id,
        status: 'pending_distribution',
        amount: mainRecipientPayment.amount,
        currency: mainRecipientPayment.currency,
        processedAt: new Date()
      });

      // Pagos para destinatarios secundarios
      for (const split of data.splits.splits) {
        const splitAmount = splitAmounts.splits.find(
          s => s.recipientId === split.recipientId
        )?.amount || 0;

        const splitPayment = await this.createSplitPaymentRecord({
          recipientId: split.recipientId,
          amount: splitAmount,
          currency: data.currency || 'CLP',
          communityId: data.communityId,
          originalPaymentId: mainPayment.transactionId,
          description: split.description || `División de pago - ${data.description}`,
          metadata: {
            role: 'split_recipient',
            percentage: split.percentage,
            splitPaymentId: mainPayment.transactionId
          },
          transaction
        });

        splitPayments.push({
          success: true,
          transactionId: splitPayment.id,
          status: 'pending_distribution',
          amount: splitPayment.amount,
          currency: splitPayment.currency,
          processedAt: new Date()
        });

        splitPaymentRecords.push(splitPayment);
      }

      // 4. Crear registro maestro del split payment
      await this.createSplitMasterRecord({
        splitPaymentId: mainPayment.transactionId,
        totalAmount: data.totalAmount,
        currency: data.currency || 'CLP',
        communityId: data.communityId,
        payerId: data.payerId,
        recipients: [
          data.splits.mainRecipient.id,
          ...data.splits.splits.map(s => s.recipientId)
        ],
        status: 'processing',
        transaction
      });

      // 5. Iniciar proceso de distribución asíncrono
      await this.queueDistribution(mainPayment.transactionId);

      await transaction.commit();

      // Calcular resumen
      const totalDistributed = splitAmounts.mainAmount + 
        splitAmounts.splits.reduce((sum, s) => sum + s.amount, 0);
      
      const totalFees = data.totalAmount - totalDistributed;

      logger.info('[SplitPaymentService] Pago dividido procesado', {
        mainPaymentId: mainPayment.transactionId,
        recipients: splitPayments.length,
        totalDistributed,
        totalFees
      });

      return {
        mainPayment,
        splitPayments,
        summary: {
          totalAmount: data.totalAmount,
          totalDistributed,
          totalFees,
          recipients: splitPayments.length
        }
      };
    } catch (error: any) {
      await transaction.rollback();
      
      logger.error('[SplitPaymentService] Error procesando pago dividido', {
        error: error.message,
        data
      });
      
      throw error;
    }
  }

  /**
   * Distribuir fondos a los destinatarios
   */
  async distributeFunds(splitPaymentId: string): Promise<void> {
    try {
      logger.info('[SplitPaymentService] Distribuyendo fondos', {
        splitPaymentId
      });

      // Obtener pagos pendientes de distribución
      const pendingPayments = await Payment.findAll({
        where: {
          metadata: {
            splitPaymentId,
            role: ['main_recipient', 'split_recipient']
          },
          status: 'pending_distribution'
        }
      });

      if (pendingPayments.length === 0) {
        logger.warn('[SplitPaymentService] No hay pagos pendientes de distribución', {
          splitPaymentId
        });
        return;
      }

      // Procesar cada distribución
      const results = await Promise.allSettled(
        pendingPayments.map(payment => this.processSingleDistribution(payment))
      );

      // Verificar resultados
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      // Actualizar estado del split master
      const allSuccessful = failed === 0;
      await this.updateSplitMasterStatus(
        splitPaymentId,
        allSuccessful ? 'completed' : 'partially_distributed'
      );

      logger.info('[SplitPaymentService] Distribución completada', {
        splitPaymentId,
        successful,
        failed,
        total: pendingPayments.length
      });

      // Si hay fallos, programar reintento
      if (failed > 0) {
        await this.scheduleRetry(splitPaymentId);
      }
    } catch (error: any) {
      logger.error('[SplitPaymentService] Error distribuyendo fondos', {
        error: error.message,
        splitPaymentId
      });
      
      await this.updateSplitMasterStatus(splitPaymentId, 'distribution_failed');
      throw error;
    }
  }

  /**
   * Procesar distribución individual
   */
  private async processSingleDistribution(payment: Payment): Promise<void> {
    try {
      // Aquí se realizaría la transferencia real al destinatario
      // Por ahora simulamos el proceso
      
      logger.info('[SplitPaymentService] Procesando distribución', {
        paymentId: payment.id,
        recipientId: payment.metadata.recipientId,
        amount: payment.amount
      });

      // Simular transferencia bancaria o pago
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Actualizar estado del pago
      await payment.update({
        status: 'distributed',
        processed_at: new Date(),
        metadata: {
          ...payment.metadata,
          distributedAt: new Date(),
          distributionMethod: 'bank_transfer' // o el método real usado
        }
      });

      logger.info('[SplitPaymentService] Distribución exitosa', {
        paymentId: payment.id,
        recipientId: payment.metadata.recipientId
      });
    } catch (error: any) {
      logger.error('[SplitPaymentService] Error en distribución individual', {
        error: error.message,
        paymentId: payment.id
      });

      // Actualizar estado de fallo
      await payment.update({
        status: 'distribution_failed',
        metadata: {
          ...payment.metadata,
          lastDistributionError: error.message,
          lastDistributionAttempt: new Date()
        }
      });

      throw error;
    }
  }

  /**
   * Validar configuración de splits
   */
  private validateSplits(totalAmount: number, splits: SplitPayment): void {
    // Validar que haya al menos un split
    if (!splits.splits || splits.splits.length === 0) {
      throw new AppError('Debe haber al menos un destinatario adicional', 400);
    }

    // Si se usan porcentajes, validar que sumen 100%
    if (splits.mainRecipient.percentage !== undefined) {
      const totalPercentage = splits.mainRecipient.percentage +
        splits.splits.reduce((sum, s) => sum + (s.percentage || 0), 0);

      if (Math.abs(totalPercentage - 100) > 0.01) {
        throw new AppError(
          `Los porcentajes deben sumar 100%. Suma actual: ${totalPercentage}%`,
          400
        );
      }
    }

    // Si se usan montos fijos, validar que no excedan el total
    if (splits.mainRecipient.amount !== undefined) {
      const totalFixed = splits.mainRecipient.amount +
        splits.splits.reduce((sum, s) => sum + (s.amount || 0), 0);

      if (totalFixed > totalAmount) {
        throw new AppError(
          `La suma de montos fijos (${totalFixed}) excede el total (${totalAmount})`,
          400
        );
      }
    }

    // Validar que no se mezclen porcentajes y montos fijos
    const hasPercentages = splits.mainRecipient.percentage !== undefined ||
      splits.splits.some(s => s.percentage !== undefined);
    
    const hasAmounts = splits.mainRecipient.amount !== undefined ||
      splits.splits.some(s => s.amount !== undefined);

    if (hasPercentages && hasAmounts) {
      throw new AppError(
        'No se pueden mezclar porcentajes y montos fijos',
        400
      );
    }

    // Validar IDs únicos
    const allIds = [
      splits.mainRecipient.id,
      ...splits.splits.map(s => s.recipientId)
    ];
    
    const uniqueIds = new Set(allIds);
    if (uniqueIds.size !== allIds.length) {
      throw new AppError('Los IDs de destinatarios deben ser únicos', 400);
    }
  }

  /**
   * Calcular montos para cada destinatario
   */
  private calculateSplitAmounts(
    totalAmount: number,
    splits: SplitPayment
  ): {
    mainAmount: number;
    splits: Array<{ recipientId: string; amount: number }>;
  } {
    let mainAmount: number;
    const splitAmounts: Array<{ recipientId: string; amount: number }> = [];

    if (splits.mainRecipient.percentage !== undefined) {
      // Cálculo por porcentajes
      mainAmount = Math.floor(totalAmount * splits.mainRecipient.percentage / 100);

      for (const split of splits.splits) {
        const amount = Math.floor(totalAmount * (split.percentage || 0) / 100);
        splitAmounts.push({
          recipientId: split.recipientId,
          amount
        });
      }

      // Ajustar diferencia por redondeo al destinatario principal
      const totalCalculated = mainAmount + 
        splitAmounts.reduce((sum, s) => sum + s.amount, 0);
      
      if (totalCalculated < totalAmount) {
        mainAmount += totalAmount - totalCalculated;
      }
    } else if (splits.mainRecipient.amount !== undefined) {
      // Montos fijos
      mainAmount = splits.mainRecipient.amount;

      for (const split of splits.splits) {
        splitAmounts.push({
          recipientId: split.recipientId,
          amount: split.amount || 0
        });
      }
    } else if (splits.calculateAutomatically) {
      // División equitativa
      const recipients = 1 + splits.splits.length;
      const amountPerRecipient = Math.floor(totalAmount / recipients);
      
      mainAmount = amountPerRecipient;
      
      for (const split of splits.splits) {
        splitAmounts.push({
          recipientId: split.recipientId,
          amount: amountPerRecipient
        });
      }

      // Ajustar diferencia al principal
      const totalCalculated = amountPerRecipient * recipients;
      if (totalCalculated < totalAmount) {
        mainAmount += totalAmount - totalCalculated;
      }
    } else {
      throw new AppError('Configuración de split inválida', 400);
    }

    return { mainAmount, splits: splitAmounts };
  }

  /**
   * Crear registro de pago dividido
   */
  private async createSplitPaymentRecord(data: {
    recipientId: string;
    amount: number;
    currency: string;
    communityId: string;
    originalPaymentId: string;
    description: string;
    metadata: any;
    transaction: Transaction;
  }): Promise<Payment> {
    return await Payment.create({
      id: uuidv4(),
      community_id: data.communityId,
      user_id: data.recipientId,
      amount: data.amount,
      currency: data.currency,
      status: 'pending_distribution',
      payment_type: 'split_distribution',
      gateway_provider: 'internal',
      gateway_transaction_id: `SPLIT-${data.originalPaymentId}-${data.recipientId}`,
      description: data.description,
      metadata: {
        ...data.metadata,
        originalPaymentId: data.originalPaymentId,
        recipientId: data.recipientId
      }
    }, { transaction: data.transaction });
  }

  /**
   * Crear registro maestro del split payment
   */
  private async createSplitMasterRecord(data: {
    splitPaymentId: string;
    totalAmount: number;
    currency: string;
    communityId: string;
    payerId: string;
    recipients: string[];
    status: string;
    transaction: Transaction;
  }): Promise<void> {
    const key = `split:master:${data.splitPaymentId}`;
    const value = JSON.stringify({
      ...data,
      createdAt: new Date()
    });

    await this.redis.setex(key, 86400 * 7, value); // 7 días
  }

  /**
   * Actualizar estado del split master
   */
  private async updateSplitMasterStatus(
    splitPaymentId: string,
    status: string
  ): Promise<void> {
    const key = `split:master:${splitPaymentId}`;
    const data = await this.redis.get(key);

    if (data) {
      const parsed = JSON.parse(data);
      parsed.status = status;
      parsed.updatedAt = new Date();

      await this.redis.setex(key, 86400 * 7, JSON.stringify(parsed));
    }
  }

  /**
   * Encolar distribución para procesamiento asíncrono
   */
  private async queueDistribution(splitPaymentId: string): Promise<void> {
    const queueKey = 'split:distribution:queue';
    await this.redis.lpush(queueKey, splitPaymentId);

    // Programar procesamiento inmediato
    setTimeout(() => {
      this.distributeFunds(splitPaymentId).catch(error => {
        logger.error('[SplitPaymentService] Error en distribución async', {
          error: error.message,
          splitPaymentId
        });
      });
    }, 1000);
  }

  /**
   * Programar reintento de distribución
   */
  private async scheduleRetry(splitPaymentId: string): Promise<void> {
    const retryKey = `split:retry:${splitPaymentId}`;
    const retryCount = await this.redis.incr(retryKey);
    
    // Máximo 3 reintentos
    if (retryCount > 3) {
      logger.error('[SplitPaymentService] Máximo de reintentos alcanzado', {
        splitPaymentId,
        retryCount
      });
      return;
    }

    // Reintento exponencial: 5min, 15min, 45min
    const delayMinutes = Math.pow(3, retryCount) * 5;
    
    logger.info('[SplitPaymentService] Programando reintento', {
      splitPaymentId,
      retryCount,
      delayMinutes
    });

    setTimeout(() => {
      this.distributeFunds(splitPaymentId).catch(error => {
        logger.error('[SplitPaymentService] Error en reintento', {
          error: error.message,
          splitPaymentId,
          retryCount
        });
      });
    }, delayMinutes * 60 * 1000);

    await this.redis.expire(retryKey, 86400); // 24h TTL
  }

  /**
   * Obtener estado de un split payment
   */
  async getSplitPaymentStatus(splitPaymentId: string): Promise<{
    master: any;
    distributions: Payment[];
    summary: {
      total: number;
      distributed: number;
      pending: number;
      failed: number;
    };
  }> {
    try {
      // Obtener master record
      const masterKey = `split:master:${splitPaymentId}`;
      const masterData = await this.redis.get(masterKey);
      const master = masterData ? JSON.parse(masterData) : null;

      if (!master) {
        throw new AppError('Split payment no encontrado', 404);
      }

      // Obtener distribuciones
      const distributions = await Payment.findAll({
        where: {
          metadata: {
            splitPaymentId
          }
        },
        order: [['created_at', 'ASC']]
      });

      // Calcular resumen
      const summary = {
        total: distributions.length,
        distributed: distributions.filter(d => d.status === 'distributed').length,
        pending: distributions.filter(d => d.status === 'pending_distribution').length,
        failed: distributions.filter(d => d.status === 'distribution_failed').length
      };

      return {
        master,
        distributions,
        summary
      };
    } catch (error: any) {
      logger.error('[SplitPaymentService] Error obteniendo estado', {
        error: error.message,
        splitPaymentId
      });
      throw error;
    }
  }

  /**
   * Cancelar un split payment
   */
  async cancelSplitPayment(
    splitPaymentId: string,
    reason: string
  ): Promise<void> {
    const transaction = await sequelize.transaction();

    try {
      logger.info('[SplitPaymentService] Cancelando split payment', {
        splitPaymentId,
        reason
      });

      // Actualizar todas las distribuciones pendientes
      await Payment.update(
        {
          status: 'cancelled',
          metadata: sequelize.literal(`
            jsonb_set(
              metadata,
              '{cancelledAt}',
              '"${new Date().toISOString()}"'::jsonb
            ) || 
            jsonb_build_object('cancelReason', '${reason}')
          `)
        },
        {
          where: {
            metadata: {
              splitPaymentId
            },
            status: 'pending_distribution'
          },
          transaction
        }
      );

      // Actualizar master
      await this.updateSplitMasterStatus(splitPaymentId, 'cancelled');

      await transaction.commit();

      logger.info('[SplitPaymentService] Split payment cancelado', {
        splitPaymentId
      });
    } catch (error: any) {
      await transaction.rollback();
      
      logger.error('[SplitPaymentService] Error cancelando split payment', {
        error: error.message,
        splitPaymentId
      });
      
      throw error;
    }
  }

  /**
   * Obtener métricas de split payments
   */
  async getSplitMetrics(communityId?: string): Promise<{
    totalSplitPayments: number;
    totalAmountProcessed: number;
    averageSplitCount: number;
    successRate: number;
    pendingDistributions: number;
  }> {
    try {
      const where: any = {
        payment_type: 'split_distribution'
      };

      if (communityId) {
        where.community_id = communityId;
      }

      const distributions = await Payment.findAll({ where });

      // Agrupar por split payment ID
      const splitGroups = new Map<string, Payment[]>();
      
      distributions.forEach(dist => {
        const splitId = dist.metadata.splitPaymentId;
        if (!splitGroups.has(splitId)) {
          splitGroups.set(splitId, []);
        }
        splitGroups.get(splitId)!.push(dist);
      });

      // Calcular métricas
      const totalSplitPayments = splitGroups.size;
      const totalAmountProcessed = distributions.reduce(
        (sum, d) => sum + d.amount,
        0
      );

      const averageSplitCount = totalSplitPayments > 0
        ? distributions.length / totalSplitPayments
        : 0;

      const successfulDistributions = distributions.filter(
        d => d.status === 'distributed'
      ).length;

      const successRate = distributions.length > 0
        ? (successfulDistributions / distributions.length) * 100
        : 0;

      const pendingDistributions = distributions.filter(
        d => d.status === 'pending_distribution'
      ).length;

      return {
        totalSplitPayments,
        totalAmountProcessed,
        averageSplitCount,
        successRate,
        pendingDistributions
      };
    } catch (error: any) {
      logger.error('[SplitPaymentService] Error obteniendo métricas', {
        error: error.message,
        communityId
      });
      throw error;
    }
  }
}