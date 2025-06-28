import { SplitPaymentService } from '../../services/splitPaymentService';
import { PaymentService } from '../../services/paymentService';
import { Payment } from '../../models/Payment';
import { AppError } from '../../utils/AppError';
import { Redis } from 'ioredis';
import sequelize from '../../config/database';

// Mocks
jest.mock('../../models/Payment');
jest.mock('../../services/paymentService');
jest.mock('ioredis');
jest.mock('../../config/database', () => ({
  transaction: jest.fn()
}));

describe('SplitPaymentService', () => {
  let splitService: SplitPaymentService;
  let mockPaymentService: jest.Mocked<PaymentService>;
  let mockRedis: jest.Mocked<Redis>;
  let mockTransaction: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mocks
    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
      lpush: jest.fn()
    } as any;

    mockPaymentService = {
      processPayment: jest.fn()
    } as any;

    mockTransaction = {
      commit: jest.fn(),
      rollback: jest.fn()
    };

    (sequelize.transaction as jest.Mock).mockResolvedValue(mockTransaction);

    // Initialize service
    splitService = new SplitPaymentService(mockPaymentService, mockRedis);
  });

  describe('processSplitPayment', () => {
    const mockSplitData = {
      totalAmount: 100000,
      currency: 'CLP',
      payerId: 'payer-123',
      communityId: 'comm-123',
      paymentMethod: 'card',
      gatewayProvider: 'stripe',
      description: 'Pago compartido servicios',
      splits: {
        mainRecipient: {
          id: 'main-recipient',
          percentage: 60
        },
        splits: [
          {
            recipientId: 'recipient-1',
            percentage: 25
          },
          {
            recipientId: 'recipient-2',
            percentage: 15
          }
        ]
      }
    };

    it('should process split payment with percentages successfully', async () => {
      // Arrange
      const mockMainPaymentResult = {
        success: true,
        transactionId: 'main-pay-123',
        status: 'completed',
        amount: 100000,
        currency: 'CLP',
        processedAt: new Date()
      };

      mockPaymentService.processPayment.mockResolvedValue(mockMainPaymentResult);
      (Payment.create as jest.Mock).mockImplementation((data) => 
        Promise.resolve({ id: `split-${data.user_id}`, ...data })
      );

      // Act
      const result = await splitService.processSplitPayment(mockSplitData);

      // Assert
      expect(result.mainPayment).toEqual(mockMainPaymentResult);
      expect(result.splitPayments).toHaveLength(3); // Main + 2 splits
      expect(result.summary.totalDistributed).toBe(100000);
      expect(result.summary.totalFees).toBe(0);
      
      // Verify amounts
      const mainAmount = result.splitPayments.find(p => p.transactionId.includes('main-recipient'));
      expect(mainAmount?.amount).toBe(60000); // 60%
      
      const split1Amount = result.splitPayments.find(p => p.transactionId.includes('recipient-1'));
      expect(split1Amount?.amount).toBe(25000); // 25%
      
      const split2Amount = result.splitPayments.find(p => p.transactionId.includes('recipient-2'));
      expect(split2Amount?.amount).toBe(15000); // 15%

      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    it('should process split payment with fixed amounts', async () => {
      // Arrange
      const fixedAmountData = {
        ...mockSplitData,
        splits: {
          mainRecipient: {
            id: 'main-recipient',
            amount: 50000
          },
          splits: [
            {
              recipientId: 'recipient-1',
              amount: 30000
            },
            {
              recipientId: 'recipient-2',
              amount: 20000
            }
          ]
        }
      };

      mockPaymentService.processPayment.mockResolvedValue({
        success: true,
        transactionId: 'main-pay-456',
        status: 'completed',
        amount: 100000,
        currency: 'CLP',
        processedAt: new Date()
      });
      (Payment.create as jest.Mock).mockResolvedValue({ id: 'split-payment' });

      // Act
      const result = await splitService.processSplitPayment(fixedAmountData);

      // Assert
      expect(result.summary.totalDistributed).toBe(100000);
      expect(result.splitPayments).toHaveLength(3);
    });

    it('should handle automatic equal distribution', async () => {
      // Arrange
      const autoSplitData = {
        ...mockSplitData,
        splits: {
          mainRecipient: {
            id: 'main-recipient'
          },
          splits: [
            { recipientId: 'recipient-1' },
            { recipientId: 'recipient-2' }
          ],
          calculateAutomatically: true
        }
      };

      mockPaymentService.processPayment.mockResolvedValue({
        success: true,
        transactionId: 'main-pay-789',
        status: 'completed',
        amount: 90000, // Divisible por 3
        currency: 'CLP',
        processedAt: new Date()
      });
      (Payment.create as jest.Mock).mockResolvedValue({ id: 'split-payment' });

      // Act
      const result = await splitService.processSplitPayment({
        ...mockSplitData,
        totalAmount: 90000,
        splits: autoSplitData.splits
      });

      // Assert
      // Cada uno debería recibir 30000
      const amounts = result.splitPayments.map(p => p.amount);
      expect(amounts).toContain(30000);
      expect(amounts.filter(a => a === 30000)).toHaveLength(3);
    });

    it('should handle rounding correctly for uneven amounts', async () => {
      // Arrange
      const unevenData = {
        ...mockSplitData,
        totalAmount: 100001, // No divisible exactamente
        splits: {
          mainRecipient: {
            id: 'main-recipient'
          },
          splits: [
            { recipientId: 'recipient-1' },
            { recipientId: 'recipient-2' }
          ],
          calculateAutomatically: true
        }
      };

      mockPaymentService.processPayment.mockResolvedValue({
        success: true,
        transactionId: 'main-pay-uneven',
        status: 'completed',
        amount: 100001,
        currency: 'CLP',
        processedAt: new Date()
      });
      (Payment.create as jest.Mock).mockResolvedValue({ id: 'split-payment' });

      // Act
      const result = await splitService.processSplitPayment(unevenData);

      // Assert
      const totalDistributed = result.splitPayments.reduce((sum, p) => sum + p.amount, 0);
      expect(totalDistributed).toBe(100001);
      // El resto debe ir al principal
      const mainAmount = result.splitPayments.find(p => p.transactionId.includes('main-recipient'));
      expect(mainAmount?.amount).toBeGreaterThan(33333);
    });

    it('should rollback transaction on payment failure', async () => {
      // Arrange
      mockPaymentService.processPayment.mockResolvedValue({
        success: false,
        transactionId: 'failed-pay',
        status: 'failed',
        errorMessage: 'Insufficient funds',
        amount: 100000,
        currency: 'CLP',
        processedAt: new Date()
      });

      // Act & Assert
      await expect(
        splitService.processSplitPayment(mockSplitData)
      ).rejects.toThrow('Error procesando pago principal');
      
      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(mockTransaction.commit).not.toHaveBeenCalled();
    });

    it('should validate percentage sum equals 100', async () => {
      // Arrange
      const invalidData = {
        ...mockSplitData,
        splits: {
          mainRecipient: {
            id: 'main-recipient',
            percentage: 50
          },
          splits: [
            {
              recipientId: 'recipient-1',
              percentage: 30
            },
            {
              recipientId: 'recipient-2',
              percentage: 15 // Total: 95%, not 100%
            }
          ]
        }
      };

      // Act & Assert
      await expect(
        splitService.processSplitPayment(invalidData)
      ).rejects.toThrow('Los porcentajes deben sumar 100%');
    });

    it('should validate fixed amounts do not exceed total', async () => {
      // Arrange
      const invalidData = {
        ...mockSplitData,
        splits: {
          mainRecipient: {
            id: 'main-recipient',
            amount: 60000
          },
          splits: [
            {
              recipientId: 'recipient-1',
              amount: 30000
            },
            {
              recipientId: 'recipient-2',
              amount: 20000 // Total: 110000 > 100000
            }
          ]
        }
      };

      // Act & Assert
      await expect(
        splitService.processSplitPayment(invalidData)
      ).rejects.toThrow('La suma de montos fijos (110000) excede el total (100000)');
    });

    it('should not allow mixing percentages and fixed amounts', async () => {
      // Arrange
      const invalidData = {
        ...mockSplitData,
        splits: {
          mainRecipient: {
            id: 'main-recipient',
            percentage: 60
          },
          splits: [
            {
              recipientId: 'recipient-1',
              amount: 30000 // Mixing percentage and amount
            }
          ]
        }
      };

      // Act & Assert
      await expect(
        splitService.processSplitPayment(invalidData)
      ).rejects.toThrow('No se pueden mezclar porcentajes y montos fijos');
    });

    it('should validate unique recipient IDs', async () => {
      // Arrange
      const duplicateData = {
        ...mockSplitData,
        splits: {
          mainRecipient: {
            id: 'recipient-1' // Duplicate ID
          },
          splits: [
            {
              recipientId: 'recipient-1', // Duplicate ID
              percentage: 50
            },
            {
              recipientId: 'recipient-2',
              percentage: 50
            }
          ]
        }
      };

      // Act & Assert
      await expect(
        splitService.processSplitPayment(duplicateData)
      ).rejects.toThrow('Los IDs de destinatarios deben ser únicos');
    });

    it('should queue distribution for async processing', async () => {
      // Arrange
      mockPaymentService.processPayment.mockResolvedValue({
        success: true,
        transactionId: 'queue-test',
        status: 'completed',
        amount: 100000,
        currency: 'CLP',
        processedAt: new Date()
      });
      (Payment.create as jest.Mock).mockResolvedValue({ id: 'split-payment' });

      // Act
      await splitService.processSplitPayment(mockSplitData);

      // Assert
      expect(mockRedis.lpush).toHaveBeenCalledWith(
        'split:distribution:queue',
        'queue-test'
      );
    });
  });

  describe('distributeFunds', () => {
    it('should distribute funds to all recipients', async () => {
      // Arrange
      const splitPaymentId = 'split-123';
      const mockPendingPayments = [
        {
          id: 'pay-1',
          user_id: 'main-recipient',
          amount: 60000,
          metadata: { splitPaymentId, role: 'main_recipient' },
          status: 'pending_distribution',
          update: jest.fn()
        },
        {
          id: 'pay-2',
          user_id: 'recipient-1',
          amount: 25000,
          metadata: { splitPaymentId, role: 'split_recipient' },
          status: 'pending_distribution',
          update: jest.fn()
        }
      ];

      (Payment.findAll as jest.Mock).mockResolvedValue(mockPendingPayments);
      mockRedis.get.mockResolvedValue(JSON.stringify({
        splitPaymentId,
        status: 'processing'
      }));

      // Act
      await splitService.distributeFunds(splitPaymentId);

      // Assert
      expect(mockPendingPayments[0].update).toHaveBeenCalledWith({
        status: 'distributed',
        processed_at: expect.any(Date),
        metadata: expect.objectContaining({
          distributedAt: expect.any(Date),
          distributionMethod: 'bank_transfer'
        })
      });
      expect(mockPendingPayments[1].update).toHaveBeenCalledWith({
        status: 'distributed',
        processed_at: expect.any(Date),
        metadata: expect.objectContaining({
          distributedAt: expect.any(Date)
        })
      });
    });

    it('should handle partial distribution failures', async () => {
      // Arrange
      const splitPaymentId = 'split-partial-fail';
      const mockPendingPayments = [
        {
          id: 'pay-success',
          amount: 60000,
          metadata: { splitPaymentId },
          status: 'pending_distribution',
          update: jest.fn()
        },
        {
          id: 'pay-fail',
          amount: 40000,
          metadata: { splitPaymentId },
          status: 'pending_distribution',
          update: jest.fn().mockRejectedValue(new Error('Distribution failed'))
        }
      ];

      (Payment.findAll as jest.Mock).mockResolvedValue(mockPendingPayments);
      mockRedis.get.mockResolvedValue(JSON.stringify({ splitPaymentId }));

      // Act
      await splitService.distributeFunds(splitPaymentId);

      // Assert
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('split:master:'),
        expect.any(Number),
        expect.stringContaining('partially_distributed')
      );
    });

    it('should schedule retry for failed distributions', async () => {
      // Arrange
      const splitPaymentId = 'split-retry';
      const mockFailedPayment = {
        id: 'pay-fail',
        metadata: { splitPaymentId },
        status: 'pending_distribution',
        update: jest.fn().mockRejectedValue(new Error('Network error'))
      };

      (Payment.findAll as jest.Mock).mockResolvedValue([mockFailedPayment]);
      mockRedis.get.mockResolvedValue(JSON.stringify({ splitPaymentId }));
      mockRedis.incr.mockResolvedValue(1);

      // Act
      await splitService.distributeFunds(splitPaymentId);

      // Assert
      expect(mockRedis.incr).toHaveBeenCalledWith(`split:retry:${splitPaymentId}`);
      expect(mockRedis.expire).toHaveBeenCalledWith(
        `split:retry:${splitPaymentId}`,
        86400
      );
    });

    it('should stop retrying after 3 attempts', async () => {
      // Arrange
      const splitPaymentId = 'split-max-retry';
      mockRedis.incr.mockResolvedValue(4); // 4th attempt

      const mockFailedPayment = {
        id: 'pay-fail',
        metadata: { splitPaymentId },
        status: 'pending_distribution',
        update: jest.fn().mockRejectedValue(new Error('Persistent error'))
      };

      (Payment.findAll as jest.Mock).mockResolvedValue([mockFailedPayment]);

      // Spy on setTimeout to verify no retry is scheduled
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      // Act
      await splitService.distributeFunds(splitPaymentId);

      // Assert
      // Should not schedule another retry
      const retryCalls = setTimeoutSpy.mock.calls.filter(
        call => call[1] && call[1] > 60000 // Retry delays are > 1 minute
      );
      expect(retryCalls).toHaveLength(0);

      setTimeoutSpy.mockRestore();
    });
  });

  describe('getSplitPaymentStatus', () => {
    it('should return complete split payment status', async () => {
      // Arrange
      const splitPaymentId = 'split-status-123';
      const mockMaster = {
        splitPaymentId,
        totalAmount: 100000,
        status: 'processing',
        recipients: ['main', 'recipient-1', 'recipient-2']
      };

      const mockDistributions = [
        {
          id: 'dist-1',
          amount: 60000,
          status: 'distributed'
        },
        {
          id: 'dist-2',
          amount: 25000,
          status: 'distributed'
        },
        {
          id: 'dist-3',
          amount: 15000,
          status: 'pending_distribution'
        }
      ];

      mockRedis.get.mockResolvedValue(JSON.stringify(mockMaster));
      (Payment.findAll as jest.Mock).mockResolvedValue(mockDistributions);

      // Act
      const status = await splitService.getSplitPaymentStatus(splitPaymentId);

      // Assert
      expect(status.master).toEqual(mockMaster);
      expect(status.distributions).toEqual(mockDistributions);
      expect(status.summary).toEqual({
        total: 3,
        distributed: 2,
        pending: 1,
        failed: 0
      });
    });

    it('should throw error if split payment not found', async () => {
      // Arrange
      mockRedis.get.mockResolvedValue(null);

      // Act & Assert
      await expect(
        splitService.getSplitPaymentStatus('invalid-id')
      ).rejects.toThrow('Split payment no encontrado');
    });
  });

  describe('cancelSplitPayment', () => {
    it('should cancel all pending distributions', async () => {
      // Arrange
      const splitPaymentId = 'split-cancel-123';
      const reason = 'Customer dispute';

      (Payment.update as jest.Mock).mockResolvedValue([2]); // 2 records updated

      // Act
      await splitService.cancelSplitPayment(splitPaymentId, reason);

      // Assert
      expect(Payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'cancelled'
        }),
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'pending_distribution'
          }),
          transaction: mockTransaction
        })
      );
      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    it('should rollback on cancellation error', async () => {
      // Arrange
      (Payment.update as jest.Mock).mockRejectedValue(new Error('DB error'));

      // Act & Assert
      await expect(
        splitService.cancelSplitPayment('split-123', 'reason')
      ).rejects.toThrow();
      
      expect(mockTransaction.rollback).toHaveBeenCalled();
    });
  });

  describe('getSplitMetrics', () => {
    it('should calculate split payment metrics', async () => {
      // Arrange
      const mockDistributions = [
        {
          amount: 60000,
          status: 'distributed',
          metadata: { splitPaymentId: 'split-1' }
        },
        {
          amount: 40000,
          status: 'distributed',
          metadata: { splitPaymentId: 'split-1' }
        },
        {
          amount: 50000,
          status: 'pending_distribution',
          metadata: { splitPaymentId: 'split-2' }
        },
        {
          amount: 50000,
          status: 'distribution_failed',
          metadata: { splitPaymentId: 'split-2' }
        }
      ];

      (Payment.findAll as jest.Mock).mockResolvedValue(mockDistributions);

      // Act
      const metrics = await splitService.getSplitMetrics();

      // Assert
      expect(metrics).toEqual({
        totalSplitPayments: 2,
        totalAmountProcessed: 200000,
        averageSplitCount: 2,
        successRate: 50, // 2 distributed out of 4
        pendingDistributions: 1
      });
    });

    it('should filter by community', async () => {
      // Arrange
      const communityId = 'comm-123';
      (Payment.findAll as jest.Mock).mockResolvedValue([]);

      // Act
      await splitService.getSplitMetrics(communityId);

      // Assert
      expect(Payment.findAll).toHaveBeenCalledWith({
        where: {
          payment_type: 'split_distribution',
          community_id: communityId
        }
      });
    });
  });
});