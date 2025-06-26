import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

interface BankConfig {
  apiUrl: string;
  apiKey?: string;
  apiSecret?: string;
  clientId?: string;
  clientSecret?: string;
  merchantId?: string;
  commerceCode?: string;
  timeout: number;
}

interface PaymentGatewayConfig {
  paypal: {
    mode: string;
    clientId: string;
    clientSecret: string;
    webhookId: string;
  };
  mercadopago: {
    accessToken: string;
    publicKey: string;
    webhookSecret: string;
  };
  stripe: {
    secretKey: string;
    publishableKey: string;
    webhookSecret: string;
  };
}

interface Config {
  env: string;
  port: number;
  serviceName: string;
  
  // Database
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    logging: boolean;
    pool: {
      max: number;
      min: number;
      acquire: number;
      idle: number;
    };
  };
  
  // Redis
  redis: {
    host: string;
    port: number;
    password: string;
    db: number;
    keyPrefix: string;
  };
  
  // RabbitMQ
  rabbitmq: {
    url: string;
    exchange: string;
    queuePrefix: string;
  };
  
  // JWT
  jwt: {
    secret: string;
  };
  
  // Chilean Banks
  banks: {
    bancoEstado: BankConfig;
    santander: BankConfig;
    bci: BankConfig;
    bancoChile: BankConfig;
    scotiabank: BankConfig;
  };
  
  // International Gateways
  gateways: PaymentGatewayConfig;
  
  // Payment Configuration
  payment: {
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
    defaultCurrency: string;
    supportedCurrencies: string[];
  };
  
  // Security
  security: {
    encryptionKey: string;
    signatureKey: string;
  };
  
  // Rate Limiting
  rateLimiting: {
    windowMs: number;
    maxRequests: number;
  };
  
  // CORS
  corsOrigins: string[];
  
  // Logging
  logging: {
    level: string;
    format: string;
  };
  
  // Metrics
  enableMetrics: boolean;
  metricsPort: number;
  
  // Webhook
  webhook: {
    timeout: number;
    retryAttempts: number;
  };
}

export const config: Config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3005', 10),
  serviceName: process.env.SERVICE_NAME || 'payment-service',
  
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'payment_db',
    user: process.env.DB_USER || 'payment_user',
    password: process.env.DB_PASSWORD || 'payment_pass',
    logging: process.env.NODE_ENV === 'development',
    pool: {
      max: 10,
      min: 2,
      acquire: 30000,
      idle: 10000,
    },
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB || '5', 10),
    keyPrefix: 'payment:',
  },
  
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost',
    exchange: process.env.RABBITMQ_EXCHANGE || 'skyn3t.events',
    queuePrefix: process.env.RABBITMQ_QUEUE_PREFIX || 'payment',
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'your-jwt-secret',
  },
  
  banks: {
    bancoEstado: {
      apiUrl: process.env.BANCO_ESTADO_API_URL || 'https://api.bancoestado.cl/v1',
      apiKey: process.env.BANCO_ESTADO_API_KEY,
      apiSecret: process.env.BANCO_ESTADO_API_SECRET,
      merchantId: process.env.BANCO_ESTADO_MERCHANT_ID,
      timeout: parseInt(process.env.BANCO_ESTADO_TIMEOUT || '30000', 10),
    },
    santander: {
      apiUrl: process.env.SANTANDER_API_URL || 'https://api.santander.cl/v2',
      clientId: process.env.SANTANDER_CLIENT_ID,
      clientSecret: process.env.SANTANDER_CLIENT_SECRET,
      timeout: parseInt(process.env.SANTANDER_TIMEOUT || '30000', 10),
    },
    bci: {
      apiUrl: process.env.BCI_API_URL || 'https://webpay3gint.transbank.cl',
      apiKey: process.env.BCI_API_TOKEN,
      apiSecret: process.env.BCI_API_SECRET,
      commerceCode: process.env.BCI_COMMERCE_CODE,
      timeout: parseInt(process.env.BCI_TIMEOUT || '30000', 10),
    },
    bancoChile: {
      apiUrl: process.env.BANCO_CHILE_API_URL || 'https://api.bancochile.cl/v1',
      apiKey: process.env.BANCO_CHILE_API_KEY,
      apiSecret: process.env.BANCO_CHILE_API_SECRET,
      merchantId: process.env.BANCO_CHILE_MERCHANT_ID,
      timeout: parseInt(process.env.BANCO_CHILE_TIMEOUT || '30000', 10),
    },
    scotiabank: {
      apiUrl: process.env.SCOTIABANK_API_URL || 'https://api.scotiabank.cl/v1',
      apiKey: process.env.SCOTIABANK_API_KEY,
      apiSecret: process.env.SCOTIABANK_API_SECRET,
      timeout: parseInt(process.env.SCOTIABANK_TIMEOUT || '30000', 10),
    },
  },
  
  gateways: {
    paypal: {
      mode: process.env.PAYPAL_MODE || 'sandbox',
      clientId: process.env.PAYPAL_CLIENT_ID || '',
      clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
      webhookId: process.env.PAYPAL_WEBHOOK_ID || '',
    },
    mercadopago: {
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || '',
      publicKey: process.env.MERCADOPAGO_PUBLIC_KEY || '',
      webhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET || '',
    },
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY || '',
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    },
  },
  
  payment: {
    timeout: parseInt(process.env.PAYMENT_TIMEOUT || '60000', 10),
    retryAttempts: parseInt(process.env.PAYMENT_RETRY_ATTEMPTS || '3', 10),
    retryDelay: parseInt(process.env.PAYMENT_RETRY_DELAY || '5000', 10),
    defaultCurrency: process.env.DEFAULT_CURRENCY || 'CLP',
    supportedCurrencies: (process.env.SUPPORTED_CURRENCIES || 'CLP,USD,EUR').split(','),
  },
  
  security: {
    encryptionKey: process.env.ENCRYPTION_KEY || 'your-32-character-encryption-key!!',
    signatureKey: process.env.PAYMENT_SIGNATURE_KEY || 'your-signature-key',
  },
  
  rateLimiting: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },
  
  enableMetrics: process.env.ENABLE_METRICS === 'true',
  metricsPort: parseInt(process.env.METRICS_PORT || '9095', 10),
  
  webhook: {
    timeout: parseInt(process.env.WEBHOOK_TIMEOUT || '10000', 10),
    retryAttempts: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS || '3', 10),
  },
};

// Validate critical configuration
const validateConfig = (): void => {
  const requiredEnvVars = [
    'JWT_SECRET',
    'ENCRYPTION_KEY',
  ];

  const missingVars = requiredEnvVars.filter(
    (varName) => !process.env[varName]
  );

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`
    );
  }

  // Validate encryption key length
  if (config.security.encryptionKey.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 characters long');
  }
};

// Validate on startup
if (process.env.NODE_ENV !== 'test') {
  validateConfig();
}