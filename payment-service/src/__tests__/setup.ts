import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Mock logger to avoid console output during tests
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  logPaymentEvent: jest.fn(),
  logWebhookEvent: jest.fn(),
  logError: jest.fn(),
  logMetric: jest.fn(),
}));

// Mock Redis
jest.mock('../config/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
    keys: jest.fn(),
    ping: jest.fn(),
  },
  cache: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    ttl: jest.fn(),
    clearPrefix: jest.fn(),
  },
  lock: {
    acquire: jest.fn(),
    release: jest.fn(),
    withLock: jest.fn((key, callback) => callback()),
  },
  session: {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    extend: jest.fn(),
  },
  rateLimiter: {
    check: jest.fn(() => ({ allowed: true, remaining: 99, resetAt: Date.now() + 60000 })),
  },
  connectRedis: jest.fn(),
  disconnectRedis: jest.fn(),
  checkRedisHealth: jest.fn(() => true),
}));

// Mock RabbitMQ
jest.mock('../config/rabbitmq', () => ({
  publisher: {
    paymentCreated: jest.fn(),
    paymentCompleted: jest.fn(),
    paymentFailed: jest.fn(),
    paymentRefunded: jest.fn(),
    webhookReceived: jest.fn(),
    reconciliationNeeded: jest.fn(),
  },
  consumer: {
    consume: jest.fn(),
    parseMessage: jest.fn(),
  },
  rabbitmq: {
    isConnected: jest.fn(() => true),
    getConnection: jest.fn(),
    getChannel: jest.fn(),
    retryMessage: jest.fn(),
    getQueueStats: jest.fn(),
  },
  connectRabbitMQ: jest.fn(),
  disconnectRabbitMQ: jest.fn(),
  checkRabbitMQHealth: jest.fn(() => true),
  QUEUES: {},
  ROUTING_KEYS: {},
}));

// Mock database
jest.mock('../config/database', () => ({
  sequelize: {
    authenticate: jest.fn(),
    sync: jest.fn(),
    close: jest.fn(),
    query: jest.fn(),
    transaction: jest.fn((callback) => callback({})),
  },
  connectDatabase: jest.fn(),
  disconnectDatabase: jest.fn(),
  checkDatabaseHealth: jest.fn(() => true),
  withTransaction: jest.fn((callback) => callback({})),
}));

// Set test environment
process.env.NODE_ENV = 'test';

// Global test timeout
jest.setTimeout(10000);

// Clear all mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Close connections after all tests
afterAll(async () => {
  // Add any cleanup code here
});