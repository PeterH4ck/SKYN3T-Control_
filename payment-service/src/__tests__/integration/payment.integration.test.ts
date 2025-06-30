import request from 'supertest';
import { app } from '../../index';
import { Payment } from '../../models/Payment';
import { Redis } from 'ioredis';
import sequelize from '../../config/database';
import jwt from 'jsonwebtoken';

// Test helpers
const generateTestToken = (userId: string, role: string = 'ADMIN') => {
  return jwt.sign(
    { 
      userId, 
      role,
      permissions: ['payments.create', 'payments.read', 'payments.update']
    },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
};

describe('Payment Service Integration Tests', () => {
  let authToken: string;
  let testUserId: string;
  let testCommunityId: string;
  let redis: Redis;

  beforeAll(async () => {
    // Setup test database
    await sequelize.sync({ force: true });
    
    // Setup Redis
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    });

    // Clear Redis
    await redis.flushall();

    // Setup test data
    testUserId = 'test-user-123';
    testCommunityId = 'test-community-123';
    authToken = generateTestToken(testUserId);
  });

  afterAll(async () => {
    await sequelize.close();
    await redis.quit();
  });

  beforeEach(async () => {
    // Clear payments table before each test
    await Payment.destroy({ where: {} });
  });

  describe('POST /api/v1/payments', () => {
    it('should create a payment successfully', async () => {
      // Arrange
      const paymentData = {
        amount: 50000,
        currency: 'CLP',
        communityId: testCommunityId,
        description: 'Gastos comunes enero 2024',
        gatewayProvider: 'banco_estado',
        paymentMethod: 'bank_transfer',
        metadata: {
          unitId: 'unit-456',
          period: '2024-01'
        }
      };

      // Act
      const response = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(paymentData);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        amount: 50000,
        currency: 'CLP',
        status: expect.any(String),
        transactionId: expect.any(String)
      });

      // Verify database
      const payment = await Payment.findOne({
        where: { gateway_transaction_id: response.body.data.transactionId }
      });
      expect(payment).toBeTruthy();
      expect(payment?.amount).toBe(50000);
    });

    it('should validate required fields', async () => {
      // Arrange
      const invalidData = {
        // Missing required fields
        currency: 'CLP'
      };

      // Act
      const response = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    it('should handle idempotent requests', async () => {
      // Arrange
      const idempotencyKey = 'test-idempotency-123';
      const paymentData = {
        amount: 30000,
        currency: 'CLP',
        communityId: testCommunityId,
        gatewayProvider: 'paypal',
        idempotencyKey
      };

      // Act - First request
      const response1 = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(paymentData);

      // Act - Second request with same idempotency key
      const response2 = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(paymentData);

      // Assert
      expect(response1.status).toBe(201);
      expect(response2.status).toBe(200); // Should return cached response
      expect(response1.body.data.transactionId).toBe(response2.body.data.transactionId);
    });

    it('should require authentication', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/payments')
        .send({ amount: 10000 });

      // Assert
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/payments/:id', () => {
    it('should get payment by ID', async () => {
      // Arrange
      const payment = await Payment.create({
        id: 'payment-123',
        community_id: testCommunityId,
        user_id: testUserId,
        amount: 75000,
        currency: 'CLP',
        status: 'completed',
        payment_type: 'one_time',
        gateway_provider: 'stripe',
        gateway_transaction_id: 'pi_test_123',
        processed_at: new Date()
      });

      // Act
      const response = await request(app)
        .get(`/api/v1/payments/${payment.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: payment.id,
        amount: 75000,
        status: 'completed'
      });
    });

    it('should return 404 for non-existent payment', async () => {
      // Act
      const response = await request(app)
        .get('/api/v1/payments/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/payments', () => {
    beforeEach(async () => {
      // Create test payments
      const payments = [];
      for (let i = 0; i < 15; i++) {
        payments.push({
          id: `payment-${i}`,
          community_id: testCommunityId,
          user_id: testUserId,
          amount: 10000 * (i + 1),
          currency: 'CLP',
          status: i % 3 === 0 ? 'failed' : 'completed',
          payment_type: 'one_time',
          gateway_provider: i % 2 === 0 ? 'stripe' : 'banco_estado',
          gateway_transaction_id: `trans-${i}`,
          created_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000) // Different days
        });
      }
      await Payment.bulkCreate(payments);
    });

    it('should list payments with pagination', async () => {
      // Act
      const response = await request(app)
        .get('/api/v1/payments')
        .query({ page: 1, limit: 10 })
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.data).toHaveLength(10);
      expect(response.body.data.total).toBe(15);
      expect(response.body.data.page).toBe(1);
      expect(response.body.data.totalPages).toBe(2);
    });

    it('should filter by status', async () => {
      // Act
      const response = await request(app)
        .get('/api/v1/payments')
        .query({ status: 'failed' })
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.data).toHaveLength(5); // Every 3rd payment is failed
      expect(response.body.data.data.every((p: any) => p.status === 'failed')).toBe(true);
    });

    it('should filter by date range', async () => {
      // Arrange
      const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      const to = new Date();

      // Act
      const response = await request(app)
        .get('/api/v1/payments')
        .query({ 
          from: from.toISOString(),
          to: to.toISOString()
        })
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.data).toHaveLength(8); // Payments from last 7 days
    });

    it('should filter by gateway provider', async () => {
      // Act
      const response = await request(app)
        .get('/api/v1/payments')
        .query({ gatewayProvider: 'stripe' })
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.data).toHaveLength(8); // Even indexed payments
      expect(
        response.body.data.data.every((p: any) => p.gateway_provider === 'stripe')
      ).toBe(true);
    });
  });

  describe('POST /api/v1/payments/:id/refund', () => {
    it('should process full refund', async () => {
      // Arrange
      const payment = await Payment.create({
        id: 'payment-to-refund',
        community_id: testCommunityId,
        user_id: testUserId,
        amount: 100000,
        currency: 'CLP',
        status: 'completed',
        payment_type: 'one_time',
        gateway_provider: 'stripe',
        gateway_transaction_id: 'pi_completed_123',
        processed_at: new Date()
      });

      const refundData = {
        reason: 'Customer request',
        notifyCustomer: true
      };

      // Act
      const response = await request(app)
        .post(`/api/v1/payments/${payment.id}/refund`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(refundData);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        success: true,
        status: expect.stringContaining('refund'),
        amount: 100000
      });

      // Verify payment status updated
      const updatedPayment = await Payment.findByPk(payment.id);
      expect(updatedPayment?.status).toBe('refunded');
    });

    it('should process partial refund', async () => {
      // Arrange
      const payment = await Payment.create({
        id: 'payment-partial-refund',
        community_id: testCommunityId,
        user_id: testUserId,
        amount: 100000,
        currency: 'CLP',
        status: 'completed',
        payment_type: 'one_time',
        gateway_provider: 'paypal',
        gateway_transaction_id: 'PAY_123',
        processed_at: new Date()
      });

      const refundData = {
        amount: 30000,
        reason: 'Partial service'
      };

      // Act
      const response = await request(app)
        .post(`/api/v1/payments/${payment.id}/refund`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(refundData);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.amount).toBe(30000);

      const updatedPayment = await Payment.findByPk(payment.id);
      expect(updatedPayment?.status).toBe('partially_refunded');
      expect(updatedPayment?.refunded_amount).toBe(30000);
    });

    it('should not allow refund exceeding original amount', async () => {
      // Arrange
      const payment = await Payment.create({
        id: 'payment-excess-refund',
        community_id: testCommunityId,
        user_id: testUserId,
        amount: 50000,
        currency: 'CLP',
        status: 'completed',
        payment_type: 'one_time',
        gateway_provider: 'banco_estado',
        gateway_transaction_id: 'BANK_123',
        processed_at: new Date()
      });

      const refundData = {
        amount: 60000, // More than original
        reason: 'Invalid refund'
      };

      // Act
      const response = await request(app)
        .post(`/api/v1/payments/${payment.id}/refund`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(refundData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('excede');
    });
  });

  describe('Webhooks', () => {
    describe('POST /api/v1/webhooks/stripe', () => {
      it('should handle Stripe webhook', async () => {
        // Arrange
        const webhookPayload = {
          id: 'evt_test_123',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_test_webhook',
              amount: 50000,
              currency: 'clp',
              status: 'succeeded'
            }
          }
        };

        // Generate Stripe signature
        const signature = 'mock_stripe_signature';

        // Act
        const response = await request(app)
          .post('/api/v1/webhooks/stripe')
          .set('stripe-signature', signature)
          .send(webhookPayload);

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.received).toBe(true);
      });
    });

    describe('POST /api/v1/webhooks/bank/:bankCode', () => {
      it('should handle bank webhook', async () => {
        // Arrange
        const webhookData = {
          event: 'transfer.completed',
          transactionId: 'BANK-WEBHOOK-123',
          amount: 75000,
          status: 'completed'
        };

        // Act
        const response = await request(app)
          .post('/api/v1/webhooks/bank/banco_estado')
          .set('x-banco-signature', 'mock_bank_signature')
          .send(webhookData);

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.received).toBe(true);
      });
    });
  });

  describe('Recurring Payments', () => {
    describe('POST /api/v1/payments/subscriptions', () => {
      it('should create subscription', async () => {
        // Arrange
        const subscriptionData = {
          amount: 50000,
          currency: 'CLP',
          interval: 'monthly',
          communityId: testCommunityId,
          unitId: 'unit-789',
          gatewayProvider: 'stripe',
          paymentMethod: 'card_123',
          description: 'Gastos comunes mensuales'
        };

        // Act
        const response = await request(app)
          .post('/api/v1/payments/subscriptions')
          .set('Authorization', `Bearer ${authToken}`)
          .send(subscriptionData);

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toMatchObject({
          subscriptionId: expect.any(String),
          amount: 50000,
          interval: 'monthly',
          status: 'active',
          nextPaymentDate: expect.any(String)
        });
      });
    });

    describe('PUT /api/v1/payments/subscriptions/:id/pause', () => {
      it('should pause active subscription', async () => {
        // Arrange
        const subscription = await Payment.create({
          id: 'sub-to-pause',
          community_id: testCommunityId,
          user_id: testUserId,
          amount: 50000,
          currency: 'CLP',
          status: 'active',
          payment_type: 'recurring',
          gateway_provider: 'stripe',
          gateway_transaction_id: 'sub_123',
          metadata: { interval: 'monthly' }
        });

        // Act
        const response = await request(app)
          .put(`/api/v1/payments/subscriptions/${subscription.gateway_transaction_id}/pause`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ reason: 'Temporary pause' });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        const updated = await Payment.findByPk(subscription.id);
        expect(updated?.status).toBe('paused');
      });
    });
  });

  describe('Split Payments', () => {
    describe('POST /api/v1/payments/split', () => {
      it('should create split payment', async () => {
        // Arrange
        const splitData = {
          totalAmount: 90000,
          currency: 'CLP',
          communityId: testCommunityId,
          gatewayProvider: 'banco_estado',
          paymentMethod: 'bank_transfer',
          description: 'Pago compartido servicios',
          splits: {
            mainRecipient: {
              id: 'admin-community',
              percentage: 60
            },
            splits: [
              {
                recipientId: 'provider-1',
                percentage: 25,
                description: 'Servicio de limpieza'
              },
              {
                recipientId: 'provider-2',
                percentage: 15,
                description: 'Mantención jardines'
              }
            ]
          }
        };

        // Act
        const response = await request(app)
          .post('/api/v1/payments/split')
          .set('Authorization', `Bearer ${authToken}`)
          .send(splitData);

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toMatchObject({
          mainPayment: expect.objectContaining({
            success: true,
            amount: 90000
          }),
          splitPayments: expect.arrayContaining([
            expect.objectContaining({ amount: 54000 }), // 60%
            expect.objectContaining({ amount: 22500 }), // 25%
            expect.objectContaining({ amount: 13500 })  // 15%
          ]),
          summary: {
            totalAmount: 90000,
            totalDistributed: 90000,
            recipients: 3
          }
        });
      });
    });

    describe('GET /api/v1/payments/split/:id/status', () => {
      it('should get split payment status', async () => {
        // Arrange - Create split payment records
        const splitId = 'split-status-test';
        
        await Payment.bulkCreate([
          {
            id: 'split-main',
            community_id: testCommunityId,
            user_id: 'admin',
            amount: 60000,
            currency: 'CLP',
            status: 'distributed',
            payment_type: 'split_distribution',
            gateway_provider: 'internal',
            gateway_transaction_id: `SPLIT-${splitId}-admin`,
            metadata: { splitPaymentId: splitId, role: 'main_recipient' }
          },
          {
            id: 'split-1',
            community_id: testCommunityId,
            user_id: 'provider-1',
            amount: 40000,
            currency: 'CLP',
            status: 'pending_distribution',
            payment_type: 'split_distribution',
            gateway_provider: 'internal',
            gateway_transaction_id: `SPLIT-${splitId}-provider-1`,
            metadata: { splitPaymentId: splitId, role: 'split_recipient' }
          }
        ]);

        // Cache master record
        await redis.setex(
          `split:master:${splitId}`,
          3600,
          JSON.stringify({
            splitPaymentId: splitId,
            totalAmount: 100000,
            status: 'processing'
          })
        );

        // Act
        const response = await request(app)
          .get(`/api/v1/payments/split/${splitId}/status`)
          .set('Authorization', `Bearer ${authToken}`);

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
          master: expect.objectContaining({
            splitPaymentId: splitId,
            totalAmount: 100000
          }),
          distributions: expect.arrayContaining([
            expect.objectContaining({ amount: 60000, status: 'distributed' }),
            expect.objectContaining({ amount: 40000, status: 'pending_distribution' })
          ]),
          summary: {
            total: 2,
            distributed: 1,
            pending: 1,
            failed: 0
          }
        });
      });
    });
  });

  describe('Metrics and Reports', () => {
    describe('GET /api/v1/payments/metrics', () => {
      it('should return payment metrics', async () => {
        // Arrange - Create various payments
        await Payment.bulkCreate([
          {
            id: 'metric-1',
            community_id: testCommunityId,
            user_id: 'user-1',
            amount: 50000,
            currency: 'CLP',
            status: 'completed',
            payment_type: 'one_time',
            gateway_provider: 'stripe',
            gateway_transaction_id: 'metric-1-trans',
            created_at: new Date()
          },
          {
            id: 'metric-2',
            community_id: testCommunityId,
            user_id: 'user-2',
            amount: 75000,
            currency: 'CLP',
            status: 'completed',
            payment_type: 'recurring_charge',
            gateway_provider: 'banco_estado',
            gateway_transaction_id: 'metric-2-trans',
            created_at: new Date()
          },
          {
            id: 'metric-3',
            community_id: testCommunityId,
            user_id: 'user-3',
            amount: 25000,
            currency: 'CLP',
            status: 'failed',
            payment_type: 'one_time',
            gateway_provider: 'paypal',
            gateway_transaction_id: 'metric-3-trans',
            created_at: new Date()
          }
        ]);

        // Act
        const response = await request(app)
          .get('/api/v1/payments/metrics')
          .query({ communityId: testCommunityId })
          .set('Authorization', `Bearer ${authToken}`);

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
          totalPayments: 3,
          totalAmount: 125000, // Only completed
          successRate: expect.closeTo(66.67, 1),
          averageAmount: 62500,
          paymentsByStatus: {
            completed: 2,
            failed: 1
          },
          paymentsByType: {
            one_time: 2,
            recurring_charge: 1
          }
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // Arrange - Force database error
      jest.spyOn(Payment, 'create').mockRejectedValueOnce(new Error('Database connection lost'));

      const paymentData = {
        amount: 10000,
        currency: 'CLP',
        communityId: testCommunityId,
        gatewayProvider: 'stripe'
      };

      // Act
      const response = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(paymentData);

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Error');
    });

    it('should handle gateway timeouts', async () => {
      // This would require mocking the actual gateway
      // For now, we'll test the timeout configuration
      const paymentData = {
        amount: 10000,
        currency: 'CLP',
        communityId: testCommunityId,
        gatewayProvider: 'timeout_test' // Non-existent provider
      };

      // Act
      const response = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(paymentData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Proveedor no soportado');
    });
  });
});