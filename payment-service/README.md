# 💰 Payment Service - SKYN3T Access Control System

![Payment Service](https://img.shields.io/badge/Service-Payment-green.svg)
![Version](https://img.shields.io/badge/Version-0.3.0-blue.svg)
![Status](https://img.shields.io/badge/Status-Development-orange.svg)

## 📋 Overview

The Payment Service is a critical microservice in the SKYN3T Access Control System that handles all payment processing operations. It provides seamless integration with Chilean banks and international payment gateways, ensuring secure and reliable payment processing for community management fees, access control services, and other financial transactions.

## 🏦 Supported Payment Providers

### Chilean Banks
- **Banco Estado** - Full API integration with Open Banking
- **Santander Chile** - OAuth2-based API integration
- **BCI** - Transbank WebPay Plus integration
- **Banco de Chile** - Corporate API integration
- **Scotiabank Chile** - Commercial API integration

### International Gateways
- **PayPal** - Global payment processing
- **MercadoPago** - Latin America focused payments
- **Stripe** - Credit/debit card processing

## 🚀 Features

- **Multi-Provider Support**: Seamlessly switch between different payment providers
- **Unified API**: Single interface for all payment operations regardless of provider
- **Webhook Processing**: Real-time payment status updates
- **Retry Mechanism**: Automatic retry for failed transactions
- **Currency Support**: CLP, USD, EUR with automatic conversion
- **Security**: PCI DSS compliant, encrypted sensitive data
- **Audit Trail**: Complete transaction logging and history
- **Refund Management**: Full and partial refund support
- **Recurring Payments**: Subscription and recurring billing support

## 🛠️ Technical Stack

- **Runtime**: Node.js 20.x with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Sequelize ORM
- **Cache**: Redis for session and transaction data
- **Message Queue**: RabbitMQ for async processing
- **Authentication**: JWT with refresh tokens
- **Validation**: Joi & Express Validator
- **Logging**: Winston with structured logging
- **Monitoring**: Prometheus metrics

## 📦 Installation

### Prerequisites
```bash
# Required
Node.js >= 20.0.0
PostgreSQL >= 15.0
Redis >= 7.0
RabbitMQ >= 3.12

# Optional (for development)
Docker & Docker Compose
```

### Setup
```bash
# Clone the repository
git clone https://github.com/PeterH4ck/SKYN3T-Control_.git
cd SKYN3T-Control_/payment-service

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Configure your .env file with actual credentials
nano .env

# Run database migrations
npm run db:migrate

# Start in development mode
npm run dev

# Start in production mode
npm run build && npm start
```

## ⚙️ Configuration

### Environment Variables

#### Service Configuration
```bash
NODE_ENV=development
PORT=3005
SERVICE_NAME=payment-service
```

#### Database Configuration
```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=payment_db
DB_USER=payment_user
DB_PASSWORD=your-secure-password
```

#### Chilean Banks Configuration
Each bank requires specific credentials obtained from their developer portals:

```bash
# Banco Estado
BANCO_ESTADO_API_KEY=your-api-key
BANCO_ESTADO_API_SECRET=your-api-secret
BANCO_ESTADO_MERCHANT_ID=your-merchant-id

# Santander
SANTANDER_CLIENT_ID=your-client-id
SANTANDER_CLIENT_SECRET=your-client-secret

# Add similar configurations for other banks...
```

#### International Gateways
```bash
# PayPal
PAYPAL_MODE=sandbox  # or 'live' for production
PAYPAL_CLIENT_ID=your-paypal-client-id
PAYPAL_CLIENT_SECRET=your-paypal-client-secret

# MercadoPago
MERCADOPAGO_ACCESS_TOKEN=your-access-token
MERCADOPAGO_PUBLIC_KEY=your-public-key
```

## 🔌 API Endpoints

### Health Checks
```http
GET /health          # Service health status
GET /ready           # Readiness probe with dependency checks
```

### Payment Operations
```http
POST   /api/v1/payments                    # Create new payment
GET    /api/v1/payments/:id                # Get payment details
PUT    /api/v1/payments/:id/capture        # Capture authorized payment
DELETE /api/v1/payments/:id                # Cancel payment
POST   /api/v1/payments/:id/refund         # Refund payment
```

### Bank Operations
```http
POST   /api/v1/banks/validate-account      # Validate bank account
GET    /api/v1/banks/payment-methods       # List available payment methods
POST   /api/v1/banks/transfer              # Initiate bank transfer
```

### Webhook Endpoints
```http
POST   /api/v1/webhooks/paypal             # PayPal webhook handler
POST   /api/v1/webhooks/mercadopago        # MercadoPago webhook handler
POST   /api/v1/webhooks/banco-estado       # Banco Estado webhook handler
```

## 📊 API Examples

### Create Payment
```bash
curl -X POST http://localhost:3005/api/v1/payments \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "banco_estado",
    "amount": 50000,
    "currency": "CLP",
    "description": "Gastos comunes - Enero 2024",
    "customerEmail": "usuario@ejemplo.cl",
    "customerName": "Juan Pérez",
    "customerRut": "12345678-9",
    "metadata": {
      "communityId": "torres-del-sol",
      "unitNumber": "1201",
      "period": "2024-01"
    }
  }'
```

### Response
```json
{
  "success": true,
  "data": {
    "transactionId": "TXN-2024-001",
    "bankTransactionId": "BE-123456789",
    "status": "PENDING",
    "amount": 50000,
    "currency": "CLP",
    "redirectUrl": "https://www.bancoestado.cl/pay/...",
    "expiresAt": "2024-01-15T12:00:00Z"
  }
}
```

## 🔒 Security

### Authentication
- All endpoints require JWT authentication
- Tokens must include appropriate scopes for payment operations
- Service-to-service communication uses mutual TLS

### Data Protection
- Sensitive data encrypted at rest using AES-256
- PCI DSS compliance for card data handling
- No storage of complete card numbers
- Audit logs for all payment operations

### Rate Limiting
- 100 requests per minute per user
- 1000 requests per minute per IP
- Webhook endpoints have separate limits

## 📈 Monitoring

### Metrics Exposed (Prometheus format)
```
# Payment metrics
payment_transactions_total{provider,status}
payment_transaction_amount{provider,currency}
payment_processing_duration_seconds{provider}
payment_errors_total{provider,error_type}

# Provider health
payment_provider_health{provider}
payment_provider_response_time{provider}
```

### Logging
All operations are logged with structured JSON format:
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "info",
  "service": "payment-service",
  "transactionId": "TXN-2024-001",
  "provider": "banco_estado",
  "operation": "create_payment",
  "duration": 1250,
  "status": "success"
}
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suite
npm test -- --testPathPattern=banks

# Run in watch mode
npm run test:watch
```

### Test Coverage Requirements
- Unit tests: >80% coverage
- Integration tests for all payment providers
- End-to-end tests for critical payment flows

## 🚀 Deployment

### Docker
```bash
# Build image
docker build -t skyn3t/payment-service:latest .

# Run container
docker run -d \
  --name payment-service \
  -p 3005:3005 \
  --env-file .env \
  skyn3t/payment-service:latest
```

### Kubernetes
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: payment-service
  template:
    metadata:
      labels:
        app: payment-service
    spec:
      containers:
      - name: payment-service
        image: skyn3t/payment-service:latest
        ports:
        - containerPort: 3005
        env:
        - name: NODE_ENV
          value: "production"
```

## 🔧 Development

### Adding New Payment Provider

1. Create adapter in `src/banks/` or `src/gateways/`
2. Implement `BankAdapter` or `PaymentGateway` interface
3. Add configuration to `config.ts`
4. Register in `providerService.ts`
5. Add tests and documentation

### Code Style
```bash
# Lint code
npm run lint

# Format code
npm run format

# Type check
npm run typecheck
```

## 📚 Documentation

- [API Documentation](../docs/API.md#payment-service)
- [Architecture Overview](../docs/ARCHITECTURE.md)
- [Deployment Guide](../docs/DEPLOYMENT.md)
- [Security Guidelines](../docs/SECURITY.md)

## 🐛 Troubleshooting

### Common Issues

#### Provider Connection Errors
```bash
# Check provider health
curl http://localhost:3005/api/v1/providers/health

# View provider logs
docker logs payment-service | grep "provider_name"
```

#### Transaction Stuck in Processing
1. Check webhook logs for missed notifications
2. Verify callback URLs are accessible
3. Use manual reconciliation endpoint

#### High Response Times
1. Check Redis connection and memory usage
2. Verify database query performance
3. Review provider API response times

## 📞 Support

- **GitHub Issues**: [Report bugs](https://github.com/PeterH4ck/SKYN3T-Control_/issues)
- **Documentation**: [Wiki](https://github.com/PeterH4ck/SKYN3T-Control_/wiki)
- **Developer**: PETERH4CK

## 📄 License

This service is part of the SKYN3T Access Control System and is licensed under the MIT License.

---

**Last Updated**: 2024-01-15  
**Version**: 0.3.0  
**Status**: In Development (Etapa 3)