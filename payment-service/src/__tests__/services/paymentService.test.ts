import { RecurringPaymentService } from '../../services/recurringPaymentService';
import { Payment } from '../../models/Payment';
import { PaymentGateway, SubscriptionData } from '../../types/gateway.types';
import { AppError } from '../../utils/AppError';
import { Redis } from 'ioredis';

// Mocks
jest.mock('../../models/Payment');
jest.mock('ioredis');
jest.mock('cron');

describe('RecurringPaymentService', () => {
  let recurringService: RecurringPaymentService;
  let mockRedis: jest.Mocked<Redis>;
  let mockGateway: jest.Mocked<PaymentGateway>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup Redis mock
    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn()
    } as any;

    // Setup Gateway mock with subscription support
    mockGateway = {
      processPayment: jest.fn(),
      getPaymentStatus: jest.fn(),
      refundPayment: jest.fn(),
      validateConfiguration: jest.fn(),
      handleWebhook: jest.fn(),
      createSubscription: jest.fn()
    };

    // Initialize service
    recurringService = new RecurringPaymentService(mockRedis);
    
    // Inject gateway mock
    (recurringService as any).gateways.set('stripe', mockGateway);
  });

  describe('createSubscription', () => {
    const mockSubscriptionData = {
      customerId: 'user-123',
      communityId: 'comm-123',
      unitId: 'unit-456',
      amount: 50000,
      currency: 'CLP',
      interval: 'monthly' as const,
      paymentMethod: 'card',
      gatewayProvider: 'stripe' as const,
      description: 'Gastos comunes mensuales'
    };

    it('should create subscription successfully', async () => {
      // Arrange
      const mockGatewayResult = {
        success: true,
        transactionId: 'sub_123',
        subscriptionId: 'sub_123',
        status: 'active',
        amount: 50000,
        currency: 'CLP',
        processedAt: new Date(),
        nextPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 días
      };

      mockGateway.createSubscription!.mockResolvedValue(mockGatewayResult);
      (Payment.create as jest.Mock).mockResolvedValue({
        id: 'payment-123',
        gateway_transaction_id: 'sub_123'
      });

      // Act
      const result = await recurringService.createSubscription(mockSubscriptionData);

      // Assert
      expect(result.subscriptionId).toBe('sub_123');
      expect(result.amount).toBe(50000);
      expect(result.status).toBe('active');
      expect(mockGateway.createSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 50000,
          currency: 'CLP',
          interval: 'month',
          intervalCount: 1,
          productName: 'Gastos comunes mensuales'
        })
      );
      expect(Payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_type: 'recurring',
          status: 'active',
          gateway_provider: 'stripe'
        })
      );
    });

    it('should handle quarterly subscriptions', async () => {
      // Arrange
      const quarterlyData = {
        ...mockSubscriptionData,
        interval: 'quarterly' as const
      };

      const mockResult = {
        success: true,
        subscriptionId: 'sub_quarterly',
        status: 'active',
        amount: 150000,
        currency: 'CLP',
        processedAt: new Date(),
        nextPaymentDate: new Date()
      };

      mockGateway.createSubscription!.mockResolvedValue(mockResult);
      (Payment.create as jest.Mock).mockResolvedValue({ id: 'payment-456' });

      // Act
      await recurringService.createSubscription(quarterlyData);

      // Assert
      expect(mockGateway.createSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          interval: 'month',
          intervalCount: 3 // Quarterly = 3 months
        })
      );
    });

    it('should throw error if gateway does not support subscriptions', async () => {
      // Arrange
      const invalidData = {
        ...mockSubscriptionData,
        gatewayProvider: 'paypal' as const // Mock que no tiene createSubscription
      };

      // Act & Assert
      await expect(
        recurringService.createSubscription(invalidData)
      ).rejects.toThrow('Gateway no soporta suscripciones');
    });

    it('should cache subscription data', async () => {
      // Arrange
      const mockResult = {
        success: true,
        subscriptionId: 'sub_cache_test',
        status: 'active',
        amount: 50000,
        currency: 'CLP',
        processedAt: new Date(),
        nextPaymentDate: new Date()
      };

      mockGateway.createSubscription!.mockResolvedValue(mockResult);
      (Payment.create as jest.Mock).mockResolvedValue({ id: 'payment-789' });

      // Act
      await recurringService.createSubscription(mockSubscriptionData);

      // Assert
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `subscription:${mockResult.subscriptionId}`,
        86400,
        expect.any(String)
      );
    });
  });

  describe('pauseSubscription', () => {
    it('should pause active subscription', async () => {
      // Arrange
      const subscriptionId = 'sub_123';
      const mockPayment = {
        id: 'payment-123',
        gateway_transaction_id: subscriptionId,
        status: 'active',
        metadata: { interval: 'monthly' },
        update: jest.fn()
      };

      (Payment.findOne as jest.Mock).mockResolvedValue(mockPayment);
      mockRedis.get.mockResolvedValue(JSON.stringify({
        subscriptionId,
        status: 'active'
      }));

      // Act
      await recurringService.pauseSubscription(subscriptionId, 'Customer request');

      // Assert
      expect(mockPayment.update).toHaveBeenCalledWith({
        status: 'paused',
        metadata: expect.objectContaining({
          pausedAt: expect.any(Date),
          pauseReason: 'Customer request'
        })
      });
    });

    it('should throw error if subscription not found', async () => {
      // Arrange
      (Payment.findOne as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        recurringService.pauseSubscription('invalid_sub')
      ).rejects.toThrow('Suscripción no encontrada');
    });
  });

  describe('resumeSubscription', () => {
    it('should resume paused subscription', async () => {
      // Arrange
      const subscriptionId = 'sub_123';
      const mockPayment = {
        id: 'payment-123',
        user_id: 'user-123',
        gateway_transaction_id: subscriptionId,
        status: 'paused',
        metadata: { interval: 'monthly' },
        update: jest.fn()
      };

      (Payment.findOne as jest.Mock).mockResolvedValue(mockPayment);
      mockRedis.get.mockResolvedValue(JSON.stringify({
        subscriptionId,
        status: 'paused'
      }));

      // Act
      await recurringService.resumeSubscription(subscriptionId);

      // Assert
      expect(mockPayment.update).toHaveBeenCalledWith({
        status: 'active',
        metadata: expect.objectContaining({
          resumedAt: expect.any(Date),
          nextPaymentDate: expect.any(Date)
        })
      });
    });

    it('should calculate correct next payment date for monthly', async () => {
      // Arrange
      const subscriptionId = 'sub_monthly';
      const mockPayment = {
        id: 'payment-123',
        user_id: 'user-123',
        gateway_transaction_id: subscriptionId,
        status: 'paused',
        metadata: { interval: 'monthly' },
        update: jest.fn()
      };

      (Payment.findOne as jest.Mock).mockResolvedValue(mockPayment);

      // Act
      await recurringService.resumeSubscription(subscriptionId);

      // Assert
      const updateCall = mockPayment.update.mock.calls[0][0];
      const nextPaymentDate = updateCall.metadata.nextPaymentDate;
      const expectedDate = new Date();
      expectedDate.setMonth(expectedDate.getMonth() + 1);

      expect(nextPaymentDate.getMonth()).toBe(expectedDate.getMonth());
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription immediately', async () => {
      // Arrange
      const subscriptionId = 'sub_123';
      const mockPayment = {
        id: 'payment-123',
        gateway_provider: 'stripe',
        gateway_transaction_id: subscriptionId,
        status: 'active',
        metadata: {},
        update: jest.fn()
      };

      (Payment.findOne as jest.Mock).mockResolvedValue(mockPayment);

      // Act
      await recurringService.cancelSubscription(subscriptionId, 'No longer needed', true);

      // Assert
      expect(mockPayment.update).toHaveBeenCalledWith({
        status: 'cancelled',
        metadata: expect.objectContaining({
          cancelledAt: expect.any(Date),
          cancelReason: 'No longer needed',
          cancellationType: 'immediate'
        })
      });
      expect(mockRedis.del).toHaveBeenCalledWith(`subscription:${subscriptionId}`);
    });

    it('should schedule cancellation at end of period', async () => {
      // Arrange
      const subscriptionId = 'sub_456';
      const mockPayment = {
        id: 'payment-456',
        gateway_provider: 'stripe',
        gateway_transaction_id: subscriptionId,
        status: 'active',
        metadata: {},
        update: jest.fn()
      };

      (Payment.findOne as jest.Mock).mockResolvedValue(mockPayment);

      // Act
      await recurringService.cancelSubscription(subscriptionId, 'End of contract', false);

      // Assert
      expect(mockPayment.update).toHaveBeenCalledWith({
        status: 'pending_cancellation',
        metadata: expect.objectContaining({
          cancellationType: 'end_of_period'
        })
      });
    });
  });

  describe('processRecurringPayments', () => {
    it('should process pending recurring payments', async () => {
      // Arrange
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const mockSubscriptions = [
        {
          id: 'payment-1',
          gateway_provider: 'stripe',
          gateway_transaction_id: 'sub_1',
          user_id: 'user-1',
          community_id: 'comm-1',
          amount: 50000,
          currency: 'CLP',
          payment_method: 'card',
          metadata: {
            nextPaymentDate: new Date(today.getTime() - 1),
            unitId: 'unit-1',
            interval: 'monthly'
          },
          update: jest.fn()
        }
      ];

      (Payment.findAll as jest.Mock).mockResolvedValue(mockSubscriptions);
      mockGateway.processPayment.mockResolvedValue({
        success: true,
        transactionId: 'charge_123',
        status: 'completed',
        amount: 50000,
        currency: 'CLP',
        processedAt: new Date()
      });
      (Payment.create as jest.Mock).mockResolvedValue({ id: 'new-payment' });

      // Act
      await (recurringService as any).processRecurringPayments();

      // Assert
      expect(Payment.findAll).toHaveBeenCalledWith({
        where: expect.objectContaining({
          payment_type: 'recurring',
          status: 'active'
        })
      });
      expect(mockGateway.processPayment).toHaveBeenCalled();
      expect(Payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_type: 'recurring_charge',
          status: 'completed'
        })
      );
    });

    it('should handle payment failures', async () => {
      // Arrange
      const mockSubscription = {
        id: 'payment-fail',
        gateway_provider: 'stripe',
        gateway_transaction_id: 'sub_fail',
        amount: 50000,
        metadata: {
          nextPaymentDate: new Date(Date.now() - 1),
          failedAttempts: 0
        },
        update: jest.fn()
      };

      (Payment.findAll as jest.Mock).mockResolvedValue([mockSubscription]);
      mockGateway.processPayment.mockResolvedValue({
        success: false,
        transactionId: 'charge_fail',
        status: 'failed',
        errorMessage: 'Card declined',
        amount: 50000,
        currency: 'CLP',
        processedAt: new Date()
      });

      // Act
      await (recurringService as any).processRecurringPayments();

      // Assert
      expect(mockSubscription.update).toHaveBeenCalledWith({
        metadata: expect.objectContaining({
          lastFailedAttempt: expect.any(Date),
          failedAttempts: 1,
          lastError: 'Card declined'
        })
      });
    });

    it('should pause subscription after 3 failed attempts', async () => {
      // Arrange
      const pauseSpy = jest.spyOn(recurringService, 'pauseSubscription');
      
      const mockSubscription = {
        id: 'payment-max-fail',
        gateway_provider: 'stripe',
        gateway_transaction_id: 'sub_max_fail',
        amount: 50000,
        metadata: {
          nextPaymentDate: new Date(Date.now() - 1),
          failedAttempts: 2 // Ya tiene 2 intentos fallidos
        },
        update: jest.fn()
      };

      (Payment.findAll as jest.Mock).mockResolvedValue([mockSubscription]);
      (Payment.findOne as jest.Mock).mockResolvedValue(mockSubscription);
      mockGateway.processPayment.mockResolvedValue({
        success: false,
        transactionId: 'charge_fail_3',
        status: 'failed',
        errorMessage: 'Card declined again',
        amount: 50000,
        currency: 'CLP',
        processedAt: new Date()
      });

      // Act
      await (recurringService as any).processRecurringPayments();

      // Assert
      expect(pauseSpy).toHaveBeenCalledWith(
        'sub_max_fail',
        'Múltiples intentos de pago fallidos'
      );
    });
  });

  describe('getSubscriptionHistory', () => {
    it('should return subscription payment history', async () => {
      // Arrange
      const subscriptionId = 'sub_123';
      const mockPayments = [
        {
          id: 'pay-1',
          amount: 50000,
          status: 'completed',
          created_at: new Date('2024-01-01')
        },
        {
          id: 'pay-2',
          amount: 50000,
          status: 'completed',
          created_at: new Date('2024-02-01')
        }
      ];

      (Payment.findAll as jest.Mock).mockResolvedValue(mockPayments);

      // Act
      const history = await recurringService.getSubscriptionHistory(subscriptionId);

      // Assert
      expect(history).toEqual(mockPayments);
      expect(Payment.findAll).toHaveBeenCalledWith({
        where: expect.any(Object),
        order: [['created_at', 'DESC']]
      });
    });
  });

  describe('getRecurringMetrics', () => {
    it('should calculate recurring payment metrics', async () => {
      // Arrange
      const communityId = 'comm-123';
      const mockSubscriptions = [
        {
          status: 'active',
          amount: 50000,
          metadata: { interval: 'monthly' }
        },
        {
          status: 'active',
          amount: 150000,
          metadata: { interval: 'yearly' }
        },
        {
          status: 'paused',
          amount: 50000,
          metadata: { interval: 'monthly' }
        },
        {
          status: 'cancelled',
          amount: 50000,
          metadata: {
            interval: 'monthly',
            cancelledAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 días atrás
          }
        }
      ];

      (Payment.findAll as jest.Mock).mockResolvedValue(mockSubscriptions);

      // Act
      const metrics = await recurringService.getRecurringMetrics(communityId);

      // Assert
      expect(metrics.activeSubscriptions).toBe(2);
      expect(metrics.pausedSubscriptions).toBe(1);
      // MRR: 50000 (mensual) + 150000/12 (anual) = 62500
      expect(metrics.monthlyRecurringRevenue).toBe(62500);
      expect(metrics.averageSubscriptionValue).toBe(31250);
      // Churn: 1 cancelado de 2 activos = 50%
      expect(metrics.churnRate).toBe(50);
    });

    it('should handle empty subscriptions', async () => {
      // Arrange
      (Payment.findAll as jest.Mock).mockResolvedValue([]);

      // Act
      const metrics = await recurringService.getRecurringMetrics();

      // Assert
      expect(metrics.activeSubscriptions).toBe(0);
      expect(metrics.monthlyRecurringRevenue).toBe(0);
      expect(metrics.averageSubscriptionValue).toBe(0);
      expect(metrics.churnRate).toBe(0);
    });
  });
});