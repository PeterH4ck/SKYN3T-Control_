import { paymentService } from '../../services/paymentService';
import Payment from '../../models/Payment';
import { providerService } from '../../services/providerService';
import { cache } from '../../config/redis';
import { publisher } from '../../config/rabbitmq';
import { PaymentStatus, Currency } from '../../types/bank.types';

// Mock dependencies
jest.mock('../../models/Payment');
jest.mock('../../services/providerService');

describe('PaymentService', () => {
  const mockPaymentData = {
    provider: 'banco_estado',
    amount: 50000,
    currency: Currency.CLP,
    description: 'Test payment',
    customerEmail: 'test@example.com',
    customerName: 'Test User',
    customerRut: '12345678-9',
    userId: 'user-123',
    communityId: 'community-123',
    transactionId: 'TXN-TEST-123',
  };

  const mockProvider = {
    processPayment: jest.fn(),
    confirmPayment: jest.fn(),
    cancelPayment: jest.fn(),
    refundPayment: jest.fn(),
    getTransaction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (providerService.getProvider as jest.Mock).mockReturnValue(mockProvider);
  });

  describe('createPayment', () => {
    it('should create a payment successfully', async () => {
      const mockPayment = {
        id: 'payment-123',
        ...mockPaymentData,
        status: PaymentStatus.PENDING,
        update: jest.fn(),
        reload: jest.fn(),
      };

      const mockProviderResponse = {
        transactionId: mockPaymentData.transactionId,
        bankTransactionId: 'BANK-123',
        status: PaymentStatus.PENDING,
        amount: mockPaymentData.amount,
        currency: mockPaymentData.currency,
        redirectUrl: 'https://bank.example.com/pay',
        timestamp: new Date(),
      };

      (Payment.create as jest.Mock).mockResolvedValue(mockPayment);
      mockProvider.processPayment.mockResolvedValue(mockProviderResponse);
      mockPayment.reload.mockResolvedValue(mockPayment);

      const result = await paymentService.createPayment(mockPaymentData);

      expect(Payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...mockPaymentData,
          status: PaymentStatus.PENDING,
        }),
        expect.any(Object)
      );

      expect(providerService.getProvider).toHaveBeenCalledWith(mockPaymentData.provider);
      expect(mockProvider.processPayment).toHaveBeenCalled();
      expect(mockPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          bankTransactionId: mockProviderResponse.bankTransactionId,
          status: mockProviderResponse.status,
          redirectUrl: mockProviderResponse.redirectUrl,
        }),
        expect.any(Object)
      );

      expect(cache.set).toHaveBeenCalledWith(
        `payment:${mockPayment.id}`,
        { status: mockPayment.status, provider: mockPayment.provider },
        300
      );

      expect(publisher.paymentCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: mockPayment.id,
          transactionId: mockPayment.transactionId,
          provider: mockPayment.provider,
        })
      );

      expect(result).toBe(mockPayment);
    });

    it('should handle provider errors', async () => {
      const mockPayment = {
        id: 'payment-123',
        ...mockPaymentData,
        status: PaymentStatus.PENDING,
      };

      (Payment.create as jest.Mock).mockResolvedValue(mockPayment);
      mockProvider.processPayment.mockRejectedValue(new Error('Provider error'));

      await expect(paymentService.createPayment(mockPaymentData)).rejects.toThrow('Provider error');
    });
  });

  describe('getPaymentById', () => {
    it('should get payment from cache if available', async () => {
      const mockPayment = {
        id: 'payment-123',
        ...mockPaymentData,
        status: PaymentStatus.COMPLETED,
      };

      (cache.get as jest.Mock).mockResolvedValue(mockPayment);

      const result = await paymentService.getPaymentById('payment-123', 'user-123');

      expect(cache.get).toHaveBeenCalledWith('payment:full:payment-123');
      expect(Payment.findOne).not.toHaveBeenCalled();
      expect(result).toBe(mockPayment);
    });

    it('should get payment from database if not in cache', async () => {
      const mockPayment = {
        id: 'payment-123',
        ...mockPaymentData,
        status: PaymentStatus.COMPLETED,
        refunds: [],
      };

      (cache.get as jest.Mock).mockResolvedValue(null);
      (Payment.findOne as jest.Mock).mockResolvedValue(mockPayment);

      const result = await paymentService.getPaymentById('payment-123', 'user-123');

      expect(cache.get).toHaveBeenCalledWith('payment:full:payment-123');
      expect(Payment.findOne).toHaveBeenCalledWith({
        where: { id: 'payment-123', userId: 'user-123' },
        include: expect.any(Array),
      });
      expect(cache.set).toHaveBeenCalledWith('payment:full:payment-123', mockPayment, 60);
      expect(result).toBe(mockPayment);
    });

    it('should throw error if payment not found', async () => {
      (cache.get as jest.Mock).mockResolvedValue(null);
      (Payment.findOne as jest.Mock).mockResolvedValue(null);

      await expect(paymentService.getPaymentById('payment-123', 'user-123'))
        .rejects.toThrow('Payment not found');
    });
  });

  describe('capturePayment', () => {
    it('should capture a pending payment', async () => {
      const mockPayment = {
        id: 'payment-123',
        ...mockPaymentData,
        status: PaymentStatus.PENDING,
        bankTransactionId: 'BANK-123',
        update: jest.fn(),
      };

      const mockProviderResponse = {
        transactionId: mockPaymentData.transactionId,
        bankTransactionId: 'BANK-123',
        status: PaymentStatus.COMPLETED,
        amount: mockPaymentData.amount,
        currency: mockPaymentData.currency,
        authorizationCode: 'AUTH-123',
        timestamp: new Date(),
      };

      // Mock getPaymentById
      const getPaymentByIdSpy = jest.spyOn(paymentService, 'getPaymentById');
      getPaymentByIdSpy.mockResolvedValue(mockPayment as any);

      mockProvider.confirmPayment.mockResolvedValue(mockProviderResponse);

      const result = await paymentService.capturePayment('payment-123', 'user-123');

      expect(mockProvider.confirmPayment).toHaveBeenCalledWith('BANK-123');
      expect(mockPayment.update).toHaveBeenCalledWith({
        status: PaymentStatus.COMPLETED,
        authorizationCode: 'AUTH-123',
        processedAt: expect.any(Date),
      });
      expect(cache.del).toHaveBeenCalledWith(['payment:payment-123', 'payment:full:payment-123']);
      expect(publisher.paymentCompleted).toHaveBeenCalled();

      getPaymentByIdSpy.mockRestore();
    });

    it('should reject capture for non-pending payments', async () => {
      const mockPayment = {
        id: 'payment-123',
        status: PaymentStatus.COMPLETED,
      };

      const getPaymentByIdSpy = jest.spyOn(paymentService, 'getPaymentById');
      getPaymentByIdSpy.mockResolvedValue(mockPayment as any);

      await expect(paymentService.capturePayment('payment-123', 'user-123'))
        .rejects.toThrow('Payment cannot be captured in current status');

      getPaymentByIdSpy.mockRestore();
    });
  });

  describe('refundPayment', () => {
    it('should process a refund for completed payment', async () => {
      const mockPayment = {
        id: 'payment-123',
        ...mockPaymentData,
        status: PaymentStatus.COMPLETED,
        amount: 50000,
        bankTransactionId: 'BANK-123',
        refunds: [],
        update: jest.fn(),
      };

      const mockRefund = {
        id: 'refund-123',
        paymentId: 'payment-123',
        refundTransactionId: 'REF-123',
        amount: 10000,
        currency: Currency.CLP,
        reason: 'Customer request',
        status: PaymentStatus.PENDING,
        update: jest.fn(),
      };

      const mockProviderResponse = {
        refundTransactionId: 'REF-123',
        bankRefundId: 'BANK-REF-123',
        originalTransactionId: 'BANK-123',
        status: PaymentStatus.REFUNDED,
        amount: 10000,
        currency: Currency.CLP,
        timestamp: new Date(),
      };

      const getPaymentByIdSpy = jest.spyOn(paymentService, 'getPaymentById');
      getPaymentByIdSpy.mockResolvedValue(mockPayment as any);

      // Mock Refund model
      const Refund = jest.requireMock('../../models/Payment').Refund;
      Refund.create = jest.fn().mockResolvedValue(mockRefund);

      mockProvider.refundPayment.mockResolvedValue(mockProviderResponse);

      const result = await paymentService.refundPayment(
        'payment-123',
        'user-123',
        10000,
        'Customer request'
      );

      expect(mockProvider.refundPayment).toHaveBeenCalled();
      expect(mockRefund.update).toHaveBeenCalledWith(
        expect.objectContaining({
          bankRefundId: 'BANK-REF-123',
          status: PaymentStatus.REFUNDED,
          processedAt: expect.any(Date),
        }),
        expect.any(Object)
      );
      expect(mockPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PaymentStatus.PARTIALLY_REFUNDED,
          refundedAt: expect.any(Date),
        }),
        expect.any(Object)
      );
      expect(publisher.paymentRefunded).toHaveBeenCalled();

      getPaymentByIdSpy.mockRestore();
    });

    it('should reject refund for non-completed payments', async () => {
      const mockPayment = {
        id: 'payment-123',
        status: PaymentStatus.PENDING,
      };

      const getPaymentByIdSpy = jest.spyOn(paymentService, 'getPaymentById');
      getPaymentByIdSpy.mockResolvedValue(mockPayment as any);

      await expect(paymentService.refundPayment('payment-123', 'user-123', 10000, 'Test'))
        .rejects.toThrow('Only completed payments can be refunded');

      getPaymentByIdSpy.mockRestore();
    });
  });
});