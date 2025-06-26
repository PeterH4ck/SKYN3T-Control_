# 🚀 DEPLOYMENT GUIDE - SKYN3T ACCESS CONTROL

![Deployment Status](https://img.shields.io/badge/Deployment-Production%20Ready-brightgreen.svg)
![Environments](https://img.shields.io/badge/Environments-4-blue.svg)
![Uptime](https://img.shields.io/badge/Uptime-99.95%25-brightgreen.svg)
![K8s](https://img.shields.io/badge/Kubernetes-v1.28-326ce5.svg)

## 📋 Descripción General

Esta guía proporciona instrucciones completas para el deployment de SKYN3T Access Control en diferentes entornos, desde desarrollo local hasta producción distribuida con alta disponibilidad, auto-scaling y disaster recovery.

### Entornos de Deployment

- **🏠 Local Development**: Docker Compose con hot reload
- **🧪 Staging**: Kubernetes single-node con datos sintéticos
- **🚀 Production**: Kubernetes multi-region con HA
- **☁️ Cloud Providers**: AWS (primary), Azure, GCP
- **🌐 Edge**: CDN y edge computing capabilities

---

## 🏗️ Arquitectura de Deployment Multi-Environment

### Environment Strategy Matrix

```
┌──────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT ENVIRONMENTS                    │
├──────────────────────────────────────────────────────────────┤
│  Development (Local)                                         │
│  ├─ Docker Compose                                           │
│  ├─ Hot reload & debugging                                   │
│  ├─ Mock external services                                   │
│  ├─ Local SSL certificates                                   │
│  └─ Development tools (pgAdmin, Redis Commander)             │
│                                                              │
│  Staging (Cloud)                                             │
│  ├─ Kubernetes (single AZ)                                   │
│  ├─ Production-like configuration                            │
│  ├─ Real integrations (sandbox mode)                         │
│  ├─ Automated testing pipeline                               │
│  └─ Performance benchmarking                                 │
│                                                              │
│  Production (Multi-Region)                                   │
│  ├─ Kubernetes (multi-AZ, multi-region)                      │
│  ├─ Service mesh (Istio)                                     │
│  ├─ Auto-scaling (HPA + VPA + CA)                            │
│  ├─ Full monitoring stack                                    │
│  ├─ Disaster recovery                                        │
│  └─ Blue-green deployments                                   │
│                                                              │
│  Edge (Global CDN)                                           │
│  ├─ CloudFront distributions                                 │
│  ├─ Edge computing (Lambda@Edge)                             │
│  ├─ Global load balancing                                    │
│  └─ DDoS protection                                          │
└──────────────────────────────────────────────────────────────┘
```

---

## 🏠 Local Development Environment

### Prerequisites

#### Required Software Stack
```bash
# Core requirements
Docker Engine 24.0+           # Container runtime
Docker Compose 2.20+          # Multi-container orchestration
Node.js 20.x LTS             # JavaScript runtime
Python 3.11+                 # OCR/ML services
Git 2.40+                    # Version control
Make 4.3+                    # Build automation

# Development tools
kubectl 1.28+                # Kubernetes CLI
helm 3.12+                   # Package manager
k9s 0.27+                    # Kubernetes TUI (optional)
pgcli 3.5+                   # PostgreSQL CLI (optional)
redis-cli 7.0+               # Redis CLI (optional)

# IDE extensions (VS Code recommended)
- Docker
- Kubernetes
- TypeScript
- Python
- REST Client
```

#### System Requirements
```yaml
Minimum Hardware:
  CPU: 4 cores (8 recommended)
  RAM: 8GB (16GB recommended)
  Storage: 50GB available space
  Network: Broadband internet connection

Operating Systems:
  - macOS 12+ (Intel/Apple Silicon)
  - Ubuntu 20.04+ LTS
  - Windows 11 with WSL2
  - Arch Linux (advanced users)
```

### Quick Start Setup

#### 1. Repository Setup
```bash
# Clone the repository
git clone https://github.com/PeterH4ck/SKYN3T-Control_.git
cd SKYN3T-Control_

# Install development dependencies
make install-dev-deps

# Setup Git hooks for code quality
make setup-git-hooks

# Verify environment
make check-requirements
```

#### 2. Environment Configuration
```bash
# Create environment files
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Generate development certificates
make generate-dev-certs

# Initialize development databases
make db-init-dev

# Seed with sample data
make db-seed-dev
```

#### 3. Service Orchestration
```bash
# Start all services in development mode
make dev                      # Full stack
make dev-backend             # Backend services only
make dev-frontend            # Frontend only
make dev-minimal             # Core services only

# Or using docker-compose directly
docker-compose -f docker-compose.dev.yml up -d

# View logs
make logs                    # All services
make logs-api               # API services only
make logs-db                # Database logs
```

### Development Configuration

#### docker-compose.dev.yml
```yaml
version: '3.8'

services:
  # ===================
  # Core Infrastructure
  # ===================
  
  postgres-dev:
    image: postgres:15-alpine
    container_name: skyn3t-postgres-dev
    environment:
      POSTGRES_DB: skyn3t_dev
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_INITDB_ARGS: "--auth-host=trust"
    ports:
      - "5432:5432"
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data
      - ./backend/src/database/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
      - ./backend/src/database/seeds:/docker-entrypoint-initdb.d/seeds
      - ./scripts/postgres-dev-config.sql:/docker-entrypoint-initdb.d/99-dev-config.sql
    command: |
      postgres 
      -c log_statement=all 
      -c log_duration=on
      -c log_min_duration_statement=0
      -c max_connections=200
      -c shared_preload_libraries='pg_stat_statements'
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - skyn3t-dev

  redis-dev:
    image: redis:7-alpine
    container_name: skyn3t-redis-dev
    ports:
      - "6379:6379"
    volumes:
      - redis_dev_data:/data
      - ./config/redis-dev.conf:/usr/local/etc/redis/redis.conf
    command: redis-server /usr/local/etc/redis/redis.conf
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    networks:
      - skyn3t-dev

  rabbitmq-dev:
    image: rabbitmq:3.12-management-alpine
    container_name: skyn3t-rabbitmq-dev
    environment:
      RABBITMQ_DEFAULT_USER: admin
      RABBITMQ_DEFAULT_PASS: admin123
      RABBITMQ_DEFAULT_VHOST: skyn3t_dev
    ports:
      - "5672:5672"    # AMQP
      - "15672:15672"  # Management UI
    volumes:
      - rabbitmq_dev_data:/var/lib/rabbitmq
      - ./config/rabbitmq-dev.conf:/etc/rabbitmq/rabbitmq.conf
    healthcheck:
      test: ["CMD", "rabbitmqctl", "status"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - skyn3t-dev

  minio-dev:
    image: minio/minio:latest
    container_name: skyn3t-minio-dev
    environment:
      MINIO_ROOT_USER: admin
      MINIO_ROOT_PASSWORD: admin123456
      MINIO_CONSOLE_ADDRESS: ":9001"
    ports:
      - "9000:9000"    # API
      - "9001:9001"    # Console
    volumes:
      - minio_dev_data:/data
    command: server /data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 3
    networks:
      - skyn3t-dev

  # ====================
  # Microservices Stack
  # ====================

  auth-service-dev:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
      target: development
    container_name: skyn3t-auth-dev
    environment:
      NODE_ENV: development
      SERVICE_NAME: auth-service
      PORT: 3001
      DATABASE_URL: postgresql://postgres:postgres@postgres-dev:5432/skyn3t_dev
      REDIS_URL: redis://redis-dev:6379/0
      RABBITMQ_URL: amqp://admin:admin123@rabbitmq-dev:5672/skyn3t_dev
      JWT_SECRET: dev-jwt-secret-key-change-in-production
      JWT_EXPIRES_IN: 15m
      JWT_REFRESH_EXPIRES_IN: 7d
      BCRYPT_ROUNDS: 10
      RATE_LIMIT_WINDOW_MS: 900000
      RATE_LIMIT_MAX_REQUESTS: 100
      ENABLE_SWAGGER: true
      LOG_LEVEL: debug
    ports:
      - "3001:3001"
      - "9229:9229"    # Debug port
    volumes:
      - ./backend/src:/app/src
      - ./backend/package.json:/app/package.json
      - ./backend/package-lock.json:/app/package-lock.json
      - ./backend/tsconfig.json:/app/tsconfig.json
    depends_on:
      postgres-dev:
        condition: service_healthy
      redis-dev:
        condition: service_healthy
      rabbitmq-dev:
        condition: service_healthy
    command: npm run dev:debug
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 10s
      timeout: 5s
      retries: 3
    networks:
      - skyn3t-dev

  user-service-dev:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
      target: development
    container_name: skyn3t-user-dev
    environment:
      NODE_ENV: development
      SERVICE_NAME: user-service
      PORT: 3003
      DATABASE_URL: postgresql://postgres:postgres@postgres-dev:5432/skyn3t_dev
      REDIS_URL: redis://redis-dev:6379/1
      RABBITMQ_URL: amqp://admin:admin123@rabbitmq-dev:5672/skyn3t_dev
      MINIO_ENDPOINT: minio-dev
      MINIO_PORT: 9000
      MINIO_ACCESS_KEY: admin
      MINIO_SECRET_KEY: admin123456
      MINIO_BUCKET: user-uploads
      LOG_LEVEL: debug
    ports:
      - "3003:3003"
      - "9230:9229"    # Debug port
    volumes:
      - ./backend/src:/app/src
    depends_on:
      postgres-dev:
        condition: service_healthy
      redis-dev:
        condition: service_healthy
      minio-dev:
        condition: service_healthy
    command: npm run dev:debug
    restart: unless-stopped
    networks:
      - skyn3t-dev

  device-service-dev:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
      target: development
    container_name: skyn3t-device-dev
    environment:
      NODE_ENV: development
      SERVICE_NAME: device-service
      PORT: 3004
      DATABASE_URL: postgresql://postgres:postgres@postgres-dev:5432/skyn3t_dev
      REDIS_URL: redis://redis-dev:6379/2
      RABBITMQ_URL: amqp://admin:admin123@rabbitmq-dev:5672/skyn3t_dev
      MQTT_BROKER_URL: mqtt://rabbitmq-dev:1883
      INFLUXDB_URL: http://influxdb-dev:8086
      INFLUXDB_TOKEN: dev-token
      INFLUXDB_ORG: skyn3t-dev
      INFLUXDB_BUCKET: device-metrics
      LOG_LEVEL: debug
    ports:
      - "3004:3004"
      - "9231:9229"    # Debug port
    volumes:
      - ./backend/src:/app/src
    depends_on:
      postgres-dev:
        condition: service_healthy
      redis-dev:
        condition: service_healthy
    command: npm run dev:debug
    restart: unless-stopped
    networks:
      - skyn3t-dev

  ocr-service-dev:
    build:
      context: ./ocr-service
      dockerfile: Dockerfile.dev
    container_name: skyn3t-ocr-dev
    environment:
      ENVIRONMENT: development
      PORT: 5000
      REDIS_URL: redis://redis-dev:6379/3
      MINIO_ENDPOINT: minio-dev:9000
      MINIO_ACCESS_KEY: admin
      MINIO_SECRET_KEY: admin123456
      MINIO_BUCKET: ocr-processing
      TESSERACT_CONFIG: --psm 6 -l spa
      ML_MODEL_PATH: /app/models
      LOG_LEVEL: DEBUG
    ports:
      - "5000:5000"
    volumes:
      - ./ocr-service/src:/app/src
      - ./ocr-service/models:/app/models
    depends_on:
      redis-dev:
        condition: service_healthy
      minio-dev:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - skyn3t-dev

  # ====================
  # Frontend Application
  # ====================

  frontend-dev:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    container_name: skyn3t-frontend-dev
    environment:
      NODE_ENV: development
      REACT_APP_API_URL: http://localhost:8000/api/v1
      REACT_APP_WS_URL: ws://localhost:8000
      REACT_APP_ENVIRONMENT: development
      REACT_APP_VERSION: 2.8.0
      GENERATE_SOURCEMAP: true
      FAST_REFRESH: true
    ports:
      - "3000:3000"
    volumes:
      - ./frontend/src:/app/src
      - ./frontend/public:/app/public
      - ./frontend/package.json:/app/package.json
    command: npm start
    restart: unless-stopped
    networks:
      - skyn3t-dev

  # ====================
  # Development Tools
  # ====================

  nginx-dev:
    image: nginx:alpine
    container_name: skyn3t-nginx-dev
    ports:
      - "8000:80"
      - "8443:443"
    volumes:
      - ./nginx/nginx-dev.conf:/etc/nginx/nginx.conf
      - ./nginx/conf.d:/etc/nginx/conf.d
      - ./ssl/dev-certs:/etc/nginx/ssl
    depends_on:
      - auth-service-dev
      - user-service-dev
      - device-service-dev
      - ocr-service-dev
      - frontend-dev
    restart: unless-stopped
    networks:
      - skyn3t-dev

  pgadmin-dev:
    image: dpage/pgadmin4:latest
    container_name: skyn3t-pgadmin-dev
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@skyn3t.local
      PGADMIN_DEFAULT_PASSWORD: admin123
      PGADMIN_CONFIG_SERVER_MODE: 'False'
    ports:
      - "5050:80"
    volumes:
      - pgadmin_dev_data:/var/lib/pgadmin
    profiles:
      - tools
    networks:
      - skyn3t-dev

  redis-commander-dev:
    image: rediscommander/redis-commander:latest
    container_name: skyn3t-redis-commander-dev
    environment:
      REDIS_HOSTS: local:redis-dev:6379
    ports:
      - "8081:8081"
    profiles:
      - tools
    networks:
      - skyn3t-dev

  mailhog-dev:
    image: mailhog/mailhog:latest
    container_name: skyn3t-mailhog-dev
    ports:
      - "1025:1025"    # SMTP
      - "8025:8025"    # Web UI
    profiles:
      - tools
    networks:
      - skyn3t-dev

volumes:
  postgres_dev_data:
  redis_dev_data:
  rabbitmq_dev_data:
  minio_dev_data:
  pgadmin_dev_data:

networks:
  skyn3t-dev:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

### Development Commands and Scripts

#### Makefile for Development
```makefile
# Makefile for SKYN3T Development

.PHONY: help dev dev-backend dev-frontend dev-minimal

# Default target
help: ## Show this help message
	@echo "SKYN3T Development Commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ====================
# Development Environment
# ====================

install-dev-deps: ## Install development dependencies
	@echo "Installing development dependencies..."
	@command -v docker >/dev/null 2>&1 || { echo "Docker is required but not installed"; exit 1; }
	@command -v docker-compose >/dev/null 2>&1 || { echo "Docker Compose is required but not installed"; exit 1; }
	@command -v node >/dev/null 2>&1 || { echo "Node.js is required but not installed"; exit 1; }
	@echo "✅ All dependencies are available"

check-requirements: ## Check system requirements
	@echo "Checking system requirements..."
	@./scripts/check-system-requirements.sh

setup-git-hooks: ## Setup Git hooks for code quality
	@echo "Setting up Git hooks..."
	@cp scripts/git-hooks/* .git/hooks/
	@chmod +x .git/hooks/*
	@echo "✅ Git hooks installed"

generate-dev-certs: ## Generate development SSL certificates
	@echo "Generating development certificates..."
	@mkdir -p ssl/dev-certs
	@./scripts/generate-dev-certs.sh
	@echo "✅ Development certificates generated"

# ====================
# Environment Management
# ====================

dev: ## Start full development environment
	@echo "Starting full development environment..."
	docker-compose -f docker-compose.dev.yml up -d
	@echo "✅ Development environment started"
	@echo "🌐 Frontend: http://localhost:3000"
	@echo "🔧 API Gateway: http://localhost:8000"
	@echo "📊 pgAdmin: http://localhost:5050"
	@echo "📧 MailHog: http://localhost:8025"

dev-backend: ## Start backend services only
	@echo "Starting backend services..."
	docker-compose -f docker-compose.dev.yml up -d \
		postgres-dev redis-dev rabbitmq-dev minio-dev \
		auth-service-dev user-service-dev device-service-dev ocr-service-dev \
		nginx-dev

dev-frontend: ## Start frontend only (requires backend)
	docker-compose -f docker-compose.dev.yml up -d frontend-dev

dev-minimal: ## Start minimal stack (core services only)
	docker-compose -f docker-compose.dev.yml up -d \
		postgres-dev redis-dev auth-service-dev user-service-dev nginx-dev

dev-tools: ## Start development tools
	docker-compose -f docker-compose.dev.yml --profile tools up -d

stop: ## Stop all development services
	docker-compose -f docker-compose.dev.yml down

clean: ## Clean up development environment
	docker-compose -f docker-compose.dev.yml down -v
	docker system prune -f

restart: ## Restart development environment
	$(MAKE) stop
	$(MAKE) dev

# ====================
# Database Management
# ====================

db-init-dev: ## Initialize development database
	@echo "Initializing development database..."
	@docker-compose -f docker-compose.dev.yml up -d postgres-dev
	@sleep 10
	@docker-compose -f docker-compose.dev.yml exec postgres-dev psql -U postgres -d skyn3t_dev -f /docker-entrypoint-initdb.d/01-schema.sql
	@echo "✅ Database initialized"

db-seed-dev: ## Seed development database with sample data
	@echo "Seeding development database..."
	@for seed_file in backend/src/database/seeds/*.sql; do \
		docker-compose -f docker-compose.dev.yml exec postgres-dev \
			psql -U postgres -d skyn3t_dev -f "/docker-entrypoint-initdb.d/seeds/$$(basename $$seed_file)"; \
	done
	@echo "✅ Database seeded"

db-reset: ## Reset development database
	@echo "Resetting development database..."
	docker-compose -f docker-compose.dev.yml stop postgres-dev
	docker-compose -f docker-compose.dev.yml rm -f postgres-dev
	docker volume rm skyn3t-control_postgres_dev_data || true
	$(MAKE) db-init-dev
	$(MAKE) db-seed-dev

db-backup: ## Backup development database
	@echo "Backing up development database..."
	@mkdir -p backups
	@docker-compose -f docker-compose.dev.yml exec postgres-dev \
		pg_dump -U postgres skyn3t_dev > backups/dev-backup-$$(date +%Y%m%d_%H%M%S).sql
	@echo "✅ Database backed up"

db-restore: ## Restore development database from backup
	@echo "Available backups:"
	@ls -la backups/
	@read -p "Enter backup filename: " backup_file; \
	docker-compose -f docker-compose.dev.yml exec -T postgres-dev \
		psql -U postgres -d skyn3t_dev < backups/$$backup_file

# ====================
# Logging and Monitoring
# ====================

logs: ## View logs for all services
	docker-compose -f docker-compose.dev.yml logs -f

logs-api: ## View API service logs
	docker-compose -f docker-compose.dev.yml logs -f \
		auth-service-dev user-service-dev device-service-dev ocr-service-dev

logs-db: ## View database logs
	docker-compose -f docker-compose.dev.yml logs -f postgres-dev

logs-service: ## View logs for specific service (usage: make logs-service SERVICE=auth-service-dev)
	docker-compose -f docker-compose.dev.yml logs -f $(SERVICE)

# ====================
# Testing
# ====================

test: ## Run all tests
	@echo "Running all tests..."
	$(MAKE) test-unit
	$(MAKE) test-integration
	$(MAKE) test-e2e

test-unit: ## Run unit tests
	@echo "Running unit tests..."
	@for service in backend frontend ocr-service; do \
		echo "Testing $$service..."; \
		cd $$service && npm test && cd ..; \
	done

test-integration: ## Run integration tests
	@echo "Running integration tests..."
	@./scripts/run-integration-tests.sh

test-e2e: ## Run end-to-end tests
	@echo "Running E2E tests..."
	@./scripts/run-e2e-tests.sh

test-load: ## Run load tests
	@echo "Running load tests..."
	@./scripts/load-test-dev.sh

# ====================
# Code Quality
# ====================

lint: ## Run linting for all services
	@echo "Running linting..."
	@for service in backend frontend; do \
		echo "Linting $$service..."; \
		cd $$service && npm run lint && cd ..; \
	done

format: ## Format code for all services
	@echo "Formatting code..."
	@for service in backend frontend; do \
		echo "Formatting $$service..."; \
		cd $$service && npm run format && cd ..; \
	done

type-check: ## TypeScript type checking
	@echo "Type checking..."
	@cd backend && npm run type-check
	@cd frontend && npm run type-check

security-scan: ## Run security scanning
	@echo "Running security scan..."
	@./scripts/security-scan.sh

# ====================
# Shell Access
# ====================

shell-api: ## SSH into API container
	docker-compose -f docker-compose.dev.yml exec auth-service-dev sh

shell-db: ## SSH into database container
	docker-compose -f docker-compose.dev.yml exec postgres-dev psql -U postgres -d skyn3t_dev

shell-redis: ## SSH into Redis container
	docker-compose -f docker-compose.dev.yml exec redis-dev redis-cli

# ====================
# Health Checks
# ====================

health-check: ## Check health of all services
	@echo "Checking service health..."
	@./scripts/health-check-dev.sh

status: ## Show status of all services
	docker-compose -f docker-compose.dev.yml ps

# ====================
# Performance and Debugging
# ====================

debug-api: ## Attach debugger to API service
	@echo "Debugger available on port 9229"
	@echo "VS Code: Use 'Node.js: Attach' configuration"

profile-memory: ## Profile memory usage
	@echo "Memory profiling..."
	@./scripts/profile-memory.sh

benchmark: ## Run development benchmarks
	@echo "Running benchmarks..."
	@./scripts/benchmark-dev.sh
```

#### Development Health Check Script
```bash
#!/bin/bash
# scripts/health-check-dev.sh

set -e

SERVICES=(
    "http://localhost:3001/health|Auth Service"
    "http://localhost:3003/health|User Service" 
    "http://localhost:3004/health|Device Service"
    "http://localhost:5000/health|OCR Service"
    "http://localhost:3000|Frontend"
    "http://localhost:8000/health|API Gateway"
)

echo "🔍 Checking development environment health..."
echo "================================================"

for service in "${SERVICES[@]}"; do
    IFS='|' read -r url name <<< "$service"
    
    printf "%-20s " "$name:"
    
    if curl -sf "$url" > /dev/null 2>&1; then
        echo "✅ Healthy"
    else
        echo "❌ Unhealthy"
    fi
done

echo ""
echo "🗄️ Database Status:"
if docker-compose -f docker-compose.dev.yml exec postgres-dev pg_isready -U postgres > /dev/null 2>&1; then
    echo "PostgreSQL: ✅ Ready"
else
    echo "PostgreSQL: ❌ Not Ready"
fi

if docker-compose -f docker-compose.dev.yml exec redis-dev redis-cli ping > /dev/null 2>&1; then
    echo "Redis: ✅ Ready"
else
    echo "Redis: ❌ Not Ready"
fi

echo ""
echo "🐳 Container Status:"
docker-compose -f docker-compose.dev.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
```

---

## 🧪 Staging Environment

### Infrastructure as Code (Terraform)

#### AWS Staging Infrastructure
```hcl
# infrastructure/staging/main.tf

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }
  
  backend "s3" {
    bucket         = "skyn3t-terraform-state"
    key            = "staging/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Environment = "staging"
      Project     = "skyn3t"
      ManagedBy   = "terraform"
    }
  }
}

# VPC and Networking
module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
  
  name = "skyn3t-staging-vpc"
  cidr = "10.1.0.0/16"
  
  azs             = ["${var.aws_region}a", "${var.aws_region}b"]
  private_subnets = ["10.1.1.0/24", "10.1.2.0/24"]
  public_subnets  = ["10.1.101.0/24", "10.1.102.0/24"]
  
  enable_nat_gateway = true
  enable_vpn_gateway = false
  single_nat_gateway = true  # Cost optimization for staging
  
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  public_subnet_tags = {
    "kubernetes.io/cluster/skyn3t-staging" = "shared"
    "kubernetes.io/role/elb"               = "1"
  }
  
  private_subnet_tags = {
    "kubernetes.io/cluster/skyn3t-staging" = "shared"
    "kubernetes.io/role/internal-elb"      = "1"
  }
}

# EKS Cluster
module "eks" {
  source = "terraform-aws-modules/eks/aws"
  
  cluster_name    = "skyn3t-staging"
  cluster_version = "1.28"
  
  vpc_id                         = module.vpc.vpc_id
  subnet_ids                     = module.vpc.private_subnets
  cluster_endpoint_public_access = true
  
  # Cluster access
  manage_aws_auth_configmap = true
  aws_auth_roles = [
    {
      rolearn  = aws_iam_role.staging_admin.arn
      username = "staging-admin"
      groups   = ["system:masters"]
    }
  ]
  
  # Node groups
  eks_managed_node_groups = {
    general = {
      name           = "general"
      instance_types = ["t3.medium"]
      
      min_size     = 2
      max_size     = 6
      desired_size = 3
      
      k8s_labels = {
        Environment = "staging"
        NodeType    = "general"
      }
      
      update_config = {
        max_unavailable_percentage = 25
      }
    }
    
    services = {
      name           = "services"
      instance_types = ["t3.large"]
      
      min_size     = 1
      max_size     = 4
      desired_size = 2
      
      k8s_labels = {
        Environment = "staging"
        NodeType    = "services"
      }
      
      taints = {
        services = {
          key    = "workload"
          value  = "services"
          effect = "NO_SCHEDULE"
        }
      }
    }
  }
  
  # Add-ons
  cluster_addons = {
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent = true
    }
    aws-ebs-csi-driver = {
      most_recent = true
    }
  }
}

# RDS Database
resource "aws_db_subnet_group" "staging" {
  name       = "skyn3t-staging"
  subnet_ids = module.vpc.private_subnets
  
  tags = {
    Name = "SKYN3T Staging DB subnet group"
  }
}

resource "aws_db_instance" "staging" {
  identifier = "skyn3t-staging"
  
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = "db.t3.micro"
  
  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true
  
  db_name  = "skyn3t_staging"
  username = "postgres"
  password = var.database_password
  
  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.staging.name
  
  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"
  
  skip_final_snapshot = true
  deletion_protection = false
  
  performance_insights_enabled = true
  monitoring_interval          = 60
  
  tags = {
    Name = "SKYN3T Staging Database"
  }
}

# ElastiCache Redis
resource "aws_elasticache_subnet_group" "staging" {
  name       = "skyn3t-staging-cache-subnet"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_elasticache_replication_group" "staging" {
  replication_group_id       = "skyn3t-staging"
  description                = "Redis cluster for SKYN3T staging"
  
  port               = 6379
  parameter_group_name = "default.redis7"
  node_type          = "cache.t3.micro"
  num_cache_clusters = 2
  
  subnet_group_name = aws_elasticache_subnet_group.staging.name
  security_group_ids = [aws_security_group.redis.id]
  
  at_rest_encryption_enabled = true
  transit_encryption_enabled = false  # Simplified for staging
  
  automatic_failover_enabled = true
  multi_az_enabled          = true
  
  snapshot_retention_limit = 3
  snapshot_window         = "03:00-05:00"
  
  tags = {
    Name = "SKYN3T Staging Redis"
  }
}

# S3 Buckets
resource "aws_s3_bucket" "staging_assets" {
  bucket = "skyn3t-staging-assets-${random_id.bucket_suffix.hex}"
}

resource "aws_s3_bucket_versioning" "staging_assets" {
  bucket = aws_s3_bucket.staging_assets.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_encryption" "staging_assets" {
  bucket = aws_s3_bucket.staging_assets.id
  
  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }
}

# Security Groups
resource "aws_security_group" "rds" {
  name_prefix = "skyn3t-staging-rds-"
  vpc_id      = module.vpc.vpc_id
  
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [module.vpc.vpc_cidr_block]
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "redis" {
  name_prefix = "skyn3t-staging-redis-"
  vpc_id      = module.vpc.vpc_id
  
  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [module.vpc.vpc_cidr_block]
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Random ID for unique resource names
resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# Outputs
output "cluster_endpoint" {
  description = "Endpoint for EKS control plane"
  value       = module.eks.cluster_endpoint
}

output "cluster_name" {
  description = "Kubernetes Cluster Name"
  value       = module.eks.cluster_name
}

output "database_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.staging.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = aws_elasticache_replication_group.staging.primary_endpoint_address
  sensitive   = true
}
```

### Kubernetes Staging Deployment

#### Staging Values for Helm Chart
```yaml
# helm/skyn3t/values-staging.yaml

global:
  environment: staging
  imageRegistry: ghcr.io/peterh4ck
  imageTag: staging-latest
  domain: staging-api.skyn3t.com

# Replica configuration
replicaCount: 2

image:
  repository: skyn3t-control
  tag: staging-latest
  pullPolicy: Always

# Update strategy
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0

# Service configuration
service:
  type: ClusterIP
  port: 8000
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"

# Ingress with Let's Encrypt
ingress:
  enabled: true
  className: "nginx"
  annotations:
    kubernetes.io/ingress.class: "nginx"
    cert-manager.io/cluster-issuer: "letsencrypt-staging"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/rate-limit: "200"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
  hosts:
    - host: staging-api.skyn3t.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: staging-tls
      hosts:
        - staging-api.skyn3t.com

# Resource allocation
resources:
  limits:
    cpu: 1000m
    memory: 2Gi
  requests:
    cpu: 250m
    memory: 512Mi

# Auto-scaling
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 8
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

# Pod disruption budget
podDisruptionBudget:
  enabled: true
  minAvailable: 1

# Health checks
livenessProbe:
  httpGet:
    path: /health/live
    port: 8000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health/ready
    port: 8000
  initialDelaySeconds: 10
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3

# Security context
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000

# Node affinity (prefer services nodes)
nodeAffinity:
  preferredDuringSchedulingIgnoredDuringExecution:
  - weight: 100
    preference:
      matchExpressions:
      - key: NodeType
        operator: In
        values: ["services"]

# Environment variables
env:
  NODE_ENV: staging
  LOG_LEVEL: info
  ENABLE_SWAGGER: true
  ENABLE_DEBUG: false
  ENABLE_METRICS: true

# External services (managed by Terraform)
postgresql:
  enabled: false
  external:
    host: "{{ .Values.postgresql.external.host }}"
    port: 5432
    database: skyn3t_staging
    username: postgres

redis:
  enabled: false
  external:
    host: "{{ .Values.redis.external.host }}"
    port: 6379

# Monitoring
serviceMonitor:
  enabled: true
  namespace: monitoring
  interval: 30s
  scrapeTimeout: 10s

# ConfigMap for application configuration
configMap:
  enabled: true
  data:
    app.json: |
      {
        "name": "SKYN3T Access Control",
        "version": "2.8.0",
        "environment": "staging",
        "features": {
          "facial_recognition": true,
          "ocr_processing": true,
          "ml_analytics": true,
          "payment_processing": true
        },
        "limits": {
          "max_communities": 10,
          "max_users_per_community": 500,
          "max_devices_per_community": 50
        }
      }

# Secrets (will be created by CI/CD)
secrets:
  databasePassword: ""
  jwtSecret: ""
  redisPassword: ""
  
# Microservices configuration
microservices:
  authService:
    enabled: true
    replicaCount: 2
    resources:
      limits:
        cpu: 500m
        memory: 1Gi
      requests:
        cpu: 100m
        memory: 256Mi
    
  userService:
    enabled: true
    replicaCount: 2
    resources:
      limits:
        cpu: 500m
        memory: 1Gi
      requests:
        cpu: 100m
        memory: 256Mi
  
  deviceService:
    enabled: true
    replicaCount: 2
    resources:
      limits:
        cpu: 500m
        memory: 1Gi
      requests:
        cpu: 100m
        memory: 256Mi
  
  ocrService:
    enabled: true
    replicaCount: 1
    resources:
      limits:
        cpu: 1000m
        memory: 2Gi
      requests:
        cpu: 250m
        memory: 512Mi
```

### CI/CD Pipeline for Staging

#### GitHub Actions Staging Workflow
```yaml
# .github/workflows/deploy-staging.yml

name: Deploy to Staging

on:
  push:
    branches: [develop, staging]
  pull_request:
    branches: [main]

concurrency:
  group: staging-deployment
  cancel-in-progress: true

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}
  AWS_REGION: us-east-1
  EKS_CLUSTER_NAME: skyn3t-staging

jobs:
  # ====================
  # Quality Assurance
  # ====================
  
  quality-check:
    name: Quality Assurance
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      with:
        fetch-depth: 0
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'
        cache-dependency-path: '**/package-lock.json'
    
    - name: Install dependencies
      run: |
        cd backend && npm ci
        cd ../frontend && npm ci
    
    - name: Run linting
      run: |
        cd backend && npm run lint
        cd ../frontend && npm run lint
    
    - name: Run type checking
      run: |
        cd backend && npm run type-check
        cd ../frontend && npm run type-check
    
    - name: Run unit tests
      run: |
        cd backend && npm test -- --coverage
        cd ../frontend && npm test -- --coverage --watchAll=false
    
    - name: Upload coverage reports
      uses: codecov/codecov-action@v3
      with:
        files: ./backend/coverage/lcov.info,./frontend/coverage/lcov.info

  # ====================
  # Security Scanning
  # ====================
  
  security-scan:
    name: Security Scanning
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Run Trivy vulnerability scanner
      uses: aquasecurity/trivy-action@master
      with:
        scan-type: 'fs'
        scan-ref: '.'
        format: 'sarif'
        output: 'trivy-results.sarif'
    
    - name: Upload Trivy scan results
      uses: github/codeql-action/upload-sarif@v2
      with:
        sarif_file: 'trivy-results.sarif'
    
    - name: Run Snyk security scan
      uses: snyk/actions/node@master
      env:
        SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
      with:
        args: --severity-threshold=high

  # ====================
  # Build and Push Images
  # ====================
  
  build-images:
    name: Build and Push Images
    runs-on: ubuntu-latest
    needs: [quality-check, security-scan]
    
    strategy:
      matrix:
        service: [backend, frontend, ocr-service]
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3
    
    - name: Log in to Container Registry
      uses: docker/login-action@v3
      with:
        registry: ${{ env.REGISTRY }}
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}
    
    - name: Extract metadata
      id: meta
      uses: docker/metadata-action@v5
      with:
        images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}-${{ matrix.service }}
        tags: |
          type=ref,event=branch,suffix=-{{sha}}
          type=ref,event=pr,suffix=-{{sha}}
          type=raw,value=staging-latest,enable={{is_default_branch}}
    
    - name: Build and push Docker image
      uses: docker/build-push-action@v5
      with:
        context: ./${{ matrix.service }}
        push: true
        tags: ${{ steps.meta.outputs.tags }}
        labels: ${{ steps.meta.outputs.labels }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
        platforms: linux/amd64,linux/arm64

  # ====================
  # Integration Tests
  # ====================
  
  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: [build-images]
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: skyn3t_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
      
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'
        cache-dependency-path: backend/package-lock.json
    
    - name: Install dependencies
      run: |
        cd backend && npm ci
    
    - name: Wait for services
      run: |
        timeout 30 bash -c 'until pg_isready -h localhost -p 5432; do sleep 1; done'
        timeout 30 bash -c 'until redis-cli -h localhost -p 6379 ping; do sleep 1; done'
    
    - name: Setup test database
      run: |
        cd backend && npm run db:migrate:test
    
    - name: Run integration tests
      run: |
        cd backend && npm run test:integration
      env:
        NODE_ENV: test
        DATABASE_URL: postgresql://postgres:postgres@localhost:5432/skyn3t_test
        REDIS_URL: redis://localhost:6379/0

  # ====================
  # Deploy to Staging
  # ====================
  
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    needs: [build-images, integration-tests]
    if: github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/staging'
    environment: staging
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: ${{ env.AWS_REGION }}
    
    - name: Update kubeconfig
      run: |
        aws eks update-kubeconfig --name ${{ env.EKS_CLUSTER_NAME }}
    
    - name: Setup Helm
      uses: azure/setup-helm@v3
      with:
        version: '3.12.0'
    
    - name: Add Helm repositories
      run: |
        helm repo add bitnami https://charts.bitnami.com/bitnami
        helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
        helm repo add cert-manager https://charts.jetstack.io
        helm repo update
    
    - name: Deploy infrastructure components
      run: |
        # Deploy cert-manager if not exists
        kubectl get namespace cert-manager || \
          helm install cert-manager cert-manager/cert-manager \
            --namespace cert-manager \
            --create-namespace \
            --set installCRDs=true
        
        # Deploy nginx ingress if not exists
        kubectl get namespace ingress-nginx || \
          helm install ingress-nginx ingress-nginx/ingress-nginx \
            --namespace ingress-nginx \
            --create-namespace
    
    - name: Get external service endpoints
      id: endpoints
      run: |
        # Get RDS endpoint
        DB_ENDPOINT=$(aws rds describe-db-instances \
          --db-instance-identifier skyn3t-staging \
          --query 'DBInstances[0].Endpoint.Address' \
          --output text)
        echo "db_endpoint=$DB_ENDPOINT" >> $GITHUB_OUTPUT
        
        # Get Redis endpoint
        REDIS_ENDPOINT=$(aws elasticache describe-replication-groups \
          --replication-group-id skyn3t-staging \
          --query 'ReplicationGroups[0].NodeGroups[0].PrimaryEndpoint.Address' \
          --output text)
        echo "redis_endpoint=$REDIS_ENDPOINT" >> $GITHUB_OUTPUT
    
    - name: Deploy application
      run: |
        helm upgrade --install skyn3t ./helm/skyn3t \
          --namespace staging \
          --create-namespace \
          --values ./helm/skyn3t/values-staging.yaml \
          --set image.tag=staging-latest \
          --set postgresql.external.host=${{ steps.endpoints.outputs.db_endpoint }} \
          --set redis.external.host=${{ steps.endpoints.outputs.redis_endpoint }} \
          --set secrets.databasePassword=${{ secrets.STAGING_DB_PASSWORD }} \
          --set secrets.jwtSecret=${{ secrets.STAGING_JWT_SECRET }} \
          --wait \
          --timeout=10m
    
    - name: Run post-deployment tests
      run: |
        # Wait for pods to be ready
        kubectl wait --for=condition=ready pod -l app=skyn3t -n staging --timeout=300s
        
        # Run health checks
        kubectl get pods -n staging
        
        # Test API endpoints
        INGRESS_IP=$(kubectl get ingress skyn3t-ingress -n staging -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
        
        # Health check
        curl -f "https://staging-api.skyn3t.com/health" || exit 1
        
        # API version check
        curl -f "https://staging-api.skyn3t.com/api/v1/health" || exit 1
    
    - name: Run smoke tests
      run: |
        cd tests && npm ci
        npm run test:smoke:staging
      env:
        API_BASE_URL: https://staging-api.skyn3t.com
        TEST_USERNAME: ${{ secrets.STAGING_TEST_USERNAME }}
        TEST_PASSWORD: ${{ secrets.STAGING_TEST_PASSWORD }}
    
    - name: Notify deployment status
      uses: 8398a7/action-slack@v3
      with:
        status: ${{ job.status }}
        channel: '#deployments'
        webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
        fields: repo,message,commit,author,action,eventName,ref,workflow
        text: |
          🚀 Staging Deployment ${{ job.status }}
          Environment: Staging
          Version: staging-latest
          URL: https://staging-api.skyn3t.com
      if: always()

  # ====================
  # Performance Testing
  # ====================
  
  performance-tests:
    name: Performance Tests
    runs-on: ubuntu-latest
    needs: [deploy-staging]
    if: github.ref == 'refs/heads/develop'
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Setup k6
      run: |
        sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
        echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
        sudo apt-get update
        sudo apt-get install k6
    
    - name: Run load tests
      run: |
        cd tests/performance
        k6 run --env API_BASE_URL=https://staging-api.skyn3t.com staging-load-test.js
    
    - name: Upload performance results
      uses: actions/upload-artifact@v3
      with:
        name: performance-results
        path: tests/performance/results/
```

---

## 🚀 Production Deployment

### Production Infrastructure (AWS Multi-Region)

#### Production Terraform Configuration
```hcl
# infrastructure/production/main.tf

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  
  backend "s3" {
    bucket         = "skyn3t-terraform-state-prod"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks-prod"
    encrypt        = true
  }
}

# Multi-region setup
provider "aws" {
  alias  = "primary"
  region = "us-east-1"
  
  default_tags {
    tags = {
      Environment = "production"
      Project     = "skyn3t"
      Region      = "primary"
      ManagedBy   = "terraform"
    }
  }
}

provider "aws" {
  alias  = "dr"
  region = "us-west-2"
  
  default_tags {
    tags = {
      Environment = "production"
      Project     = "skyn3t"
      Region      = "disaster-recovery"
      ManagedBy   = "terraform"
    }
  }
}

# Primary region infrastructure
module "primary_infrastructure" {
  source = "./modules/infrastructure"
  
  providers = {
    aws = aws.primary
  }
  
  environment = "production"
  region_name = "primary"
  vpc_cidr    = "10.0.0.0/16"
  
  # High availability configuration
  availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]
  
  # EKS configuration
  eks_cluster_version = "1.28"
  eks_node_groups = {
    general = {
      instance_types = ["m5.xlarge"]
      min_size       = 3
      max_size       = 20
      desired_size   = 6
    }
    services = {
      instance_types = ["c5.xlarge"]
      min_size       = 2
      max_size       = 10
      desired_size   = 4
    }
    ml_workloads = {
      instance_types = ["p3.2xlarge"]
      min_size       = 0
      max_size       = 5
      desired_size   = 1
    }
  }
  
  # Database configuration
  rds_instance_class        = "db.r6g.xlarge"
  rds_allocated_storage     = 500
  rds_max_allocated_storage = 2000
  rds_backup_retention      = 30
  rds_multi_az              = true
  
  # Redis configuration
  redis_node_type        = "cache.r6g.large"
  redis_num_cache_nodes  = 6
  redis_automatic_failover = true
  redis_multi_az         = true
  
  # S3 configuration
  enable_s3_replication = true
  s3_replication_region = "us-west-2"
}

# Disaster recovery region infrastructure
module "dr_infrastructure" {
  source = "./modules/infrastructure"
  
  providers = {
    aws = aws.dr
  }
  
  environment = "production"
  region_name = "disaster-recovery"
  vpc_cidr    = "10.1.0.0/16"
  
  # Reduced capacity for DR
  availability_zones = ["us-west-2a", "us-west-2b"]
  
  # EKS configuration (smaller for DR)
  eks_cluster_version = "1.28"
  eks_node_groups = {
    general = {
      instance_types = ["m5.large"]
      min_size       = 2
      max_size       = 10
      desired_size   = 3
    }
  }
  
  # Database configuration (read replica)
  rds_instance_class    = "db.r6g.large"
  rds_allocated_storage = 500
  rds_backup_retention  = 7
  rds_multi_az          = false
  
  # Redis configuration (smaller)
  redis_node_type       = "cache.r6g.medium"
  redis_num_cache_nodes = 3
  redis_multi_az        = false
}

# Global resources
resource "aws_route53_zone" "main" {
  provider = aws.primary
  name     = "skyn3t.com"
  
  tags = {
    Name = "SKYN3T Production DNS Zone"
  }
}

resource "aws_route53_record" "api" {
  provider = aws.primary
  zone_id  = aws_route53_zone.main.zone_id
  name     = "api.skyn3t.com"
  type     = "A"
  
  failover_routing_policy {
    type = "PRIMARY"
  }
  
  alias {
    name                   = module.primary_infrastructure.alb_dns_name
    zone_id                = module.primary_infrastructure.alb_zone_id
    evaluate_target_health = true
  }
  
  health_check_id = aws_route53_health_check.api_primary.id
  set_identifier  = "primary"
}

resource "aws_route53_record" "api_dr" {
  provider = aws.primary
  zone_id  = aws_route53_zone.main.zone_id
  name     = "api.skyn3t.com"
  type     = "A"
  
  failover_routing_policy {
    type = "SECONDARY"
  }
  
  alias {
    name                   = module.dr_infrastructure.alb_dns_name
    zone_id                = module.dr_infrastructure.alb_zone_id
    evaluate_target_health = true
  }
  
  set_identifier = "disaster-recovery"
}

# Health checks
resource "aws_route53_health_check" "api_primary" {
  provider                        = aws.primary
  fqdn                           = module.primary_infrastructure.alb_dns_name
  port                           = 443
  type                           = "HTTPS"
  resource_path                  = "/health"
  failure_threshold              = 3
  request_interval               = 30
  
  tags = {
    Name = "SKYN3T API Primary Health Check"
  }
}

# CloudFront distribution for global CDN
resource "aws_cloudfront_distribution" "main" {
  provider = aws.primary
  
  origin {
    domain_name = "api.skyn3t.com"
    origin_id   = "api-origin"
    
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }
  
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "SKYN3T API Global Distribution"
  default_root_object = "index.html"
  
  # Cache behaviors
  default_cache_behavior {
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "api-origin"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"
    
    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Origin", "Access-Control-Request-Headers", "Access-Control-Request-Method"]
      
      cookies {
        forward = "none"
      }
    }
    
    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }
  
  # Static assets cache behavior
  ordered_cache_behavior {
    path_pattern           = "/static/*"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "api-origin"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"
    
    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
    
    min_ttl     = 86400
    default_ttl = 86400
    max_ttl     = 31536000
  }
  
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
  
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.main.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
  
  web_acl_id = aws_wafv2_web_acl.main.arn
  
  tags = {
    Name = "SKYN3T API Distribution"
  }
}

# SSL Certificate
resource "aws_acm_certificate" "main" {
  provider          = aws.primary
  domain_name       = "skyn3t.com"
  subject_alternative_names = [
    "*.skyn3t.com",
    "api.skyn3t.com",
    "www.skyn3t.com"
  ]
  validation_method = "DNS"
  
  lifecycle {
    create_before_destroy = true
  }
  
  tags = {
    Name = "SKYN3T Production Certificate"
  }
}

# WAF for DDoS protection
resource "aws_wafv2_web_acl" "main" {
  provider = aws.primary
  name     = "skyn3t-production-waf"
  scope    = "CLOUDFRONT"
  
  default_action {
    allow {}
  }
  
  # Rate limiting rule
  rule {
    name     = "RateLimitRule"
    priority = 1
    
    action {
      block {}
    }
    
    statement {
      rate_based_statement {
        limit              = 10000
        aggregate_key_type = "IP"
      }
    }
    
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                 = "RateLimitRule"
      sampled_requests_enabled    = true
    }
  }
  
  # AWS Managed Core Rule Set
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 2
    
    override_action {
      none {}
    }
    
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                 = "AWSManagedRulesCommonRuleSetMetric"
      sampled_requests_enabled    = true
    }
  }
  
  tags = {
    Name = "SKYN3T Production WAF"
  }
}

# Outputs
output "primary_cluster_endpoint" {
  value = module.primary_infrastructure.cluster_endpoint
}

output "dr_cluster_endpoint" {
  value = module.dr_infrastructure.cluster_endpoint
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.main.domain_name
}

output "primary_database_endpoint" {
  value     = module.primary_infrastructure.database_endpoint
  sensitive = true
}

output "dr_database_endpoint" {
  value     = module.dr_infrastructure.database_endpoint
  sensitive = true
}
```

### Production Kubernetes Configuration

#### Production Helm Values
```yaml
# helm/skyn3t/values-production.yaml

global:
  environment: production
  imageRegistry: ghcr.io/peterh4ck
  imageTag: v2.8.0
  domain: api.skyn3t.com

# High availability replica configuration
replicaCount: 8

image:
  repository: skyn3t-control
  tag: v2.8.0
  pullPolicy: IfNotPresent

# Blue-green deployment strategy
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 4
    maxUnavailable: 2

# Service configuration
service:
  type: ClusterIP
  port: 8000
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
    service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled: "true"
    service.beta.kubernetes.io/aws-load-balancer-backend-protocol: "tcp"

# Ingress with production SSL
ingress:
  enabled: true
  className: "nginx"
  annotations:
    kubernetes.io/ingress.class: "nginx"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    nginx.ingress.kubernetes.io/rate-limit: "1000"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
    nginx.ingress.kubernetes.io/rate-limit-burst: "2000"
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "300"
  hosts:
    - host: api.skyn3t.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: production-tls
      hosts:
        - api.skyn3t.com

# Production resource allocation
resources:
  limits:
    cpu: 2000m
    memory: 4Gi
  requests:
    cpu: 500m
    memory: 1Gi

# Horizontal Pod Autoscaler
autoscaling:
  enabled: true
  minReplicas: 8
  maxReplicas: 50
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 25
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60

# Vertical Pod Autoscaler
verticalPodAutoscaler:
  enabled: true
  updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
    - containerName: skyn3t
      maxAllowed:
        cpu: 4000m
        memory: 8Gi
      minAllowed:
        cpu: 100m
        memory: 256Mi

# Pod disruption budget
podDisruptionBudget:
  enabled: true
  minAvailable: 6

# Node affinity and anti-affinity
nodeAffinity:
  requiredDuringSchedulingIgnoredDuringExecution:
    nodeSelectorTerms:
    - matchExpressions:
      - key: kubernetes.io/arch
        operator: In
        values: ["amd64"]
      - key: node.kubernetes.io/instance-type
        operator: NotIn
        values: ["t2.micro", "t2.small", "t3.micro", "t3.small"]

podAntiAffinity:
  preferredDuringSchedulingIgnoredDuringExecution:
  - weight: 100
    podAffinityTerm:
      labelSelector:
        matchExpressions:
        - key: app
          operator: In
          values: ["skyn3t"]
      topologyKey: kubernetes.io/hostname
  - weight: 50
    podAffinityTerm:
      labelSelector:
        matchExpressions:
        - key: app
          operator: In
          values: ["skyn3t"]
      topologyKey: topology.kubernetes.io/zone

# Production health checks
livenessProbe:
  httpGet:
    path: /health/live
    port: 8000
    scheme: HTTP
  initialDelaySeconds: 60
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
  successThreshold: 1

readinessProbe:
  httpGet:
    path: /health/ready
    port: 8000
    scheme: HTTP
  initialDelaySeconds: 30
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
  successThreshold: 1

startupProbe:
  httpGet:
    path: /health/startup
    port: 8000
    scheme: HTTP
  initialDelaySeconds: 10
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 30
  successThreshold: 1

# Security context
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  runAsGroup: 1000
  fsGroup: 1000
  fsGroupChangePolicy: "OnRootMismatch"
  seccompProfile:
    type: RuntimeDefault
  capabilities:
    drop:
      - ALL
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true

# Production environment variables
env:
  NODE_ENV: production
  LOG_LEVEL: info
  ENABLE_SWAGGER: false
  ENABLE_DEBUG: false
  ENABLE_METRICS: true
  ENABLE_TRACING: true
  CLUSTER_MODE: true
  WORKER_PROCESSES: auto

# External managed services
postgresql:
  enabled: false
  external:
    host: "{{ .Values.postgresql.external.host }}"
    port: 5432
    database: skyn3t_production
    username: postgres
    ssl_mode: require
    pool_size: 20
    pool_timeout: 30000

redis:
  enabled: false
  external:
    host: "{{ .Values.redis.external.host }}"
    port: 6379
    cluster_mode: true
    max_retries: 3
    retry_delay: 100

# Service mesh (Istio) configuration
istio:
  enabled: true
  injection: enabled
  
  virtualService:
    enabled: true
    gateways:
      - istio-system/skyn3t-gateway
    http:
      - match:
        - uri:
            prefix: /api/v1/
        route:
        - destination:
            host: skyn3t
            port:
              number: 8000
        timeout: 30s
        retries:
          attempts: 3
          perTryTimeout: 10s
  
  destinationRule:
    enabled: true
    trafficPolicy:
      loadBalancer:
        simple: LEAST_CONN
      connectionPool:
        tcp:
          maxConnections: 100
        http:
          http1MaxPendingRequests: 50
          maxRequestsPerConnection: 2
      circuitBreaker:
        consecutiveGatewayErrors: 5
        interval: 30s
        baseEjectionTime: 30s
        maxEjectionPercent: 50

# Monitoring configuration
serviceMonitor:
  enabled: true
  namespace: monitoring
  interval: 15s
  scrapeTimeout: 10s
  path: /metrics
  labels:
    app: skyn3t
    environment: production

# Network policies
networkPolicy:
  enabled: true
  policyTypes:
    - Ingress
    - Egress
  
  ingress:
    - from:
      - namespaceSelector:
          matchLabels:
            name: istio-system
      - namespaceSelector:
          matchLabels:
            name: ingress-nginx
      ports:
      - protocol: TCP
        port: 8000
  
  egress:
    - to:
      - namespaceSelector:
          matchLabels:
            name: kube-system
      ports:
      - protocol: TCP
        port: 53
      - protocol: UDP
        port: 53
    - to: []
      ports:
      - protocol: TCP
        port: 443
      - protocol: TCP
        port: 5432
      - protocol: TCP
        port: 6379

# Microservices configuration
microservices:
  authService:
    enabled: true
    replicaCount: 4
    resources:
      limits:
        cpu: 1000m
        memory: 2Gi
      requests:
        cpu: 200m
        memory: 512Mi
    autoscaling:
      enabled: true
      minReplicas: 4
      maxReplicas: 20
      targetCPUUtilizationPercentage: 70
    
  userService:
    enabled: true
    replicaCount: 4
    resources:
      limits:
        cpu: 1000m
        memory: 2Gi
      requests:
        cpu: 200m
        memory: 512Mi
    autoscaling:
      enabled: true
      minReplicas: 4
      maxReplicas: 20
      targetCPUUtilizationPercentage: 70
  
  deviceService:
    enabled: true
    replicaCount: 4
    resources:
      limits:
        cpu: 1000m
        memory: 2Gi
      requests:
        cpu: 200m
        memory: 512Mi
    autoscaling:
      enabled: true
      minReplicas: 4
      maxReplicas: 15
      targetCPUUtilizationPercentage: 70
  
  paymentService:
    enabled: true
    replicaCount: 3
    resources:
      limits:
        cpu: 1000m
        memory: 2Gi
      requests:
        cpu: 200m
        memory: 512Mi
    autoscaling:
      enabled: true
      minReplicas: 3
      maxReplicas: 12
      targetCPUUtilizationPercentage: 70
  
  notificationService:
    enabled: true
    replicaCount: 3
    resources:
      limits:
        cpu: 500m
        memory: 1Gi
      requests:
        cpu: 100m
        memory: 256Mi
    autoscaling:
      enabled: true
      minReplicas: 3
      maxReplicas: 10
      targetCPUUtilizationPercentage: 70
  
  analyticsService:
    enabled: true
    replicaCount: 2
    resources:
      limits:
        cpu: 2000m
        memory: 4Gi
      requests:
        cpu: 500m
        memory: 1Gi
    autoscaling:
      enabled: true
      minReplicas: 2
      maxReplicas: 8
      targetCPUUtilizationPercentage: 70
  
  ocrService:
    enabled: true
    replicaCount: 2
    resources:
      limits:
        cpu: 2000m
        memory: 4Gi
        nvidia.com/gpu: 1
      requests:
        cpu: 500m
        memory: 1Gi
    nodeSelector:
      accelerator: nvidia-tesla-t4
    tolerations:
    - key: nvidia.com/gpu
      operator: Exists
      effect: NoSchedule
```

### Production CI/CD Pipeline

#### GitHub Actions Production Workflow
```yaml
# .github/workflows/deploy-production.yml

name: Deploy to Production

on:
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to deploy'
        required: true
        default: 'latest'
      environment:
        description: 'Target environment'
        required: true
        default: 'production'
        type: choice
        options:
        - production
        - production-dr

concurrency:
  group: production-deployment-${{ github.event.inputs.environment || 'production' }}
  cancel-in-progress: false

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}
  AWS_REGION: us-east-1
  EKS_CLUSTER_NAME: skyn3t-production

jobs:
  # ====================
  # Pre-deployment Checks
  # ====================
  
  pre-deployment-checks:
    name: Pre-deployment Checks
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      with:
        ref: ${{ github.event.release.tag_name || github.sha }}
    
    - name: Validate release tag
      if: github.event_name == 'release'
      run: |
        if [[ ! "${{ github.event.release.tag_name }}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
          echo "Invalid release tag format. Expected: vX.Y.Z"
          exit 1
        fi
    
    - name: Check for breaking changes
      run: |
        # Check if this is a major version change
        if [[ "${{ github.event.release.tag_name }}" =~ ^v[0-9]+\.0\.0$ ]]; then
          echo "::warning::Major version release detected. Manual approval required."
          echo "breaking_change=true" >> $GITHUB_OUTPUT
        fi
    
    - name: Security scan
      uses: aquasecurity/trivy-action@master
      with:
        scan-type: 'fs'
        scan-ref: '.'
        format: 'sarif'
        output: 'trivy-results.sarif'
        severity: 'CRITICAL,HIGH'
        exit-code: '1'

  # ====================
  # Database Backup
  # ====================
  
  database-backup:
    name: Database Backup
    runs-on: ubuntu-latest
    needs: [pre-deployment-checks]
    environment: production
    
    steps:
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: ${{ env.AWS_REGION }}
    
    - name: Create database snapshot
      run: |
        SNAPSHOT_ID="skyn3t-pre-deploy-$(date +%Y%m%d-%H%M%S)"
        
        aws rds create-db-snapshot \
          --db-instance-identifier skyn3t-production \
          --db-snapshot-identifier $SNAPSHOT_ID
        
        echo "Created snapshot: $SNAPSHOT_ID"
        echo "snapshot_id=$SNAPSHOT_ID" >> $GITHUB_OUTPUT
      id: backup
    
    - name: Wait for snapshot completion
      run: |
        aws rds wait db-snapshot-completed \
          --db-snapshot-identifier ${{ steps.backup.outputs.snapshot_id }}
        
        echo "✅ Database snapshot completed successfully"

  # ====================
  # Canary Deployment
  # ====================
  
  canary-deployment:
    name: Canary Deployment
    runs-on: ubuntu-latest
    needs: [database-backup]
    environment: production
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: ${{ env.AWS_REGION }}
    
    - name: Update kubeconfig
      run: |
        aws eks update-kubeconfig --name ${{ env.EKS_CLUSTER_NAME }}
    
    - name: Setup Helm
      uses: azure/setup-helm@v3
      with:
        version: '3.12.0'
    
    - name: Deploy canary version
      run: |
        VERSION="${{ github.event.release.tag_name || github.event.inputs.version }}"
        
        # Deploy canary with 10% traffic
        helm upgrade --install skyn3t-canary ./helm/skyn3t \
          --namespace production \
          --values ./helm/skyn3t/values-production.yaml \
          --set image.tag=${VERSION} \
          --set canary.enabled=true \
          --set canary.weight=10 \
          --set canary.replicas=2 \
          --set nameOverride="skyn3t-canary" \
          --wait \
          --timeout=10m
    
    - name: Run canary tests
      run: |
        # Wait for canary pods to be ready
        kubectl wait --for=condition=ready pod -l app=skyn3t-canary -n production --timeout=300s
        
        # Run health checks
        kubectl get pods -l app=skyn3t-canary -n production
        
        # Test canary endpoints
        ./scripts/test-canary.sh
      env:
        CANARY_URL: https://api.skyn3t.com
    
    - name: Monitor canary metrics
      run: |
        echo "Monitoring canary for 10 minutes..."
        ./scripts/monitor-canary.sh 600  # 10 minutes
      env:
        PROMETHEUS_URL: ${{ secrets.PROMETHEUS_URL }}

  # ====================
  # Production Deployment
  # ====================
  
  production-deployment:
    name: Production Deployment
    runs-on: ubuntu-latest
    needs: [canary-deployment]
    environment: production
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: ${{ env.AWS_REGION }}
    
    - name: Update kubeconfig
      run: |
        aws eks update-kubeconfig --name ${{ env.EKS_CLUSTER_NAME }}
    
    - name: Setup Helm
      uses: azure/setup-helm@v3
      with:
        version: '3.12.0'
    
    - name: Get external service endpoints
      id: endpoints
      run: |
        # Get RDS endpoint
        DB_ENDPOINT=$(aws rds describe-db-instances \
          --db-instance-identifier skyn3t-production \
          --query 'DBInstances[0].Endpoint.Address' \
          --output text)
        echo "db_endpoint=$DB_ENDPOINT" >> $GITHUB_OUTPUT
        
        # Get Redis endpoint
        REDIS_ENDPOINT=$(aws elasticache describe-replication-groups \
          --replication-group-id skyn3t-production \
          --query 'ReplicationGroups[0].NodeGroups[0].PrimaryEndpoint.Address' \
          --output text)
        echo "redis_endpoint=$REDIS_ENDPOINT" >> $GITHUB_OUTPUT
    
    - name: Deploy to production
      run: |
        VERSION="${{ github.event.release.tag_name || github.event.inputs.version }}"
        
        # Blue-green deployment
        helm upgrade --install skyn3t ./helm/skyn3t \
          --namespace production \
          --values ./helm/skyn3t/values-production.yaml \
          --set image.tag=${VERSION} \
          --set postgresql.external.host=${{ steps.endpoints.outputs.db_endpoint }} \
          --set redis.external.host=${{ steps.endpoints.outputs.redis_endpoint }} \
          --set secrets.databasePassword=${{ secrets.PROD_DB_PASSWORD }} \
          --set secrets.jwtSecret=${{ secrets.PROD_JWT_SECRET }} \
          --set secrets.redisPassword=${{ secrets.PROD_REDIS_PASSWORD }} \
          --set secrets.stripeSecretKey=${{ secrets.STRIPE_SECRET_KEY }} \
          --wait \
          --timeout=15m
    
    - name: Run database migrations
      run: |
        # Run migrations using a job
        kubectl apply -f - <<EOF
        apiVersion: batch/v1
        kind: Job
        metadata:
          name: db-migration-$(date +%s)
          namespace: production
        spec:
          template:
            spec:
              containers:
              - name: migration
                image: ghcr.io/peterh4ck/skyn3t-control:${{ github.event.release.tag_name || github.event.inputs.version }}
                command: ["npm", "run", "db:migrate"]
                env:
                - name: DATABASE_URL
                  valueFrom:
                    secretKeyRef:
                      name: skyn3t-secrets
                      key: database-url
              restartPolicy: Never
          backoffLimit: 3
        EOF
        
        # Wait for migration to complete
        kubectl wait --for=condition=complete job -l app=db-migration -n production --timeout=600s
    
    - name: Cleanup canary deployment
      run: |
        helm uninstall skyn3t-canary --namespace production || true
    
    - name: Post-deployment tests
      run: |
        # Wait for all pods to be ready
        kubectl wait --for=condition=ready pod -l app=skyn3t -n production --timeout=600s
        
        # Run comprehensive health checks
        ./scripts/production-health-check.sh
        
        # Run API tests
        ./scripts/api-tests.sh https://api.skyn3t.com
        
        # Run performance validation
        ./scripts/performance-validation.sh
      env:
        API_TOKEN: ${{ secrets.PROD_API_TOKEN }}
    
    - name: Update monitoring dashboards
      run: |
        # Update Grafana dashboards with new version info
        ./scripts/update-grafana-dashboards.sh ${{ github.event.release.tag_name || github.event.inputs.version }}
    
    - name: Notify deployment success
      uses: 8398a7/action-slack@v3
      with:
        status: success
        channel: '#deployments'
        webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
        fields: repo,message,commit,author,action,eventName,ref,workflow
        text: |
          🚀 Production Deployment Successful!
          Version: ${{ github.event.release.tag_name || github.event.inputs.version }}
          Environment: ${{ github.event.inputs.environment || 'production' }}
          URL: https://api.skyn3t.com
          Deployed by: ${{ github.actor }}

  # ====================
  # Disaster Recovery Sync
  # ====================
  
  dr-sync:
    name: Disaster Recovery Sync
    runs-on: ubuntu-latest
    needs: [production-deployment]
    if: success()
    
    steps:
    - name: Sync to DR region
      run: |
        # Sync database to DR region
        aws rds create-db-snapshot \
          --db-instance-identifier skyn3t-production \
          --db-snapshot-identifier "dr-sync-$(date +%Y%m%d-%H%M%S)"
        
        # Sync S3 buckets
        aws s3 sync s3://skyn3t-production-assets s3://skyn3t-dr-assets
        
        # Update DR cluster with new version
        aws eks update-kubeconfig --name skyn3t-production-dr --region us-west-2
        
        helm upgrade --install skyn3t ./helm/skyn3t \
          --namespace production \
          --values ./helm/skyn3t/values-production-dr.yaml \
          --set image.tag=${{ github.event.release.tag_name || github.event.inputs.version }} \
          --wait \
          --timeout=10m

# ====================
# Rollback Job
# ====================

  rollback:
    name: Emergency Rollback
    runs-on: ubuntu-latest
    if: failure()
    needs: [production-deployment]
    environment: production
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: ${{ env.AWS_REGION }}
    
    - name: Update kubeconfig
      run: |
        aws eks update-kubeconfig --name ${{ env.EKS_CLUSTER_NAME }}
    
    - name: Setup Helm
      uses: azure/setup-helm@v3
      with:
        version: '3.12.0'
    
    - name: Rollback to previous version
      run: |
        echo "🚨 EMERGENCY ROLLBACK INITIATED"
        
        # Get previous revision
        PREVIOUS_REVISION=$(helm history skyn3t -n production --max 2 -o json | jq -r '.[0].revision')
        
        # Rollback
        helm rollback skyn3t $PREVIOUS_REVISION -n production --wait --timeout=10m
        
        echo "✅ Rollback completed to revision $PREVIOUS_REVISION"
    
    - name: Verify rollback
      run: |
        kubectl wait --for=condition=ready pod -l app=skyn3t -n production --timeout=300s
        ./scripts/production-health-check.sh
    
    - name: Notify rollback
      uses: 8398a7/action-slack@v3
      with:
        status: failure
        channel: '#critical-alerts'
        webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
        text: |
          🚨 EMERGENCY ROLLBACK EXECUTED
          Deployment failed and was automatically rolled back
          Please investigate immediately
```

---

## 📊 Monitoring & Observability in Production

### Prometheus Configuration for Production

#### Enhanced Prometheus Rules
```yaml
# monitoring/prometheus/rules/skyn3t-production.yml

groups:
- name: skyn3t-api.critical
  interval: 15s
  rules:
  - alert: APIHighErrorRate
    expr: |
      (
        sum(rate(http_requests_total{job="skyn3t-api",status=~"5.."}[5m])) by (service)
        /
        sum(rate(http_requests_total{job="skyn3t-api"}[5m])) by (service)
      ) > 0.05
    for: 2m
    labels:
      severity: critical
      service: "{{ $labels.service }}"
      environment: production
    annotations:
      summary: "High error rate on {{ $labels.service }}"
      description: "{{ $labels.service }} has error rate of {{ $value | humanizePercentage }} for the last 5 minutes"
      runbook_url: "https://runbooks.skyn3t.com/high-error-rate"
      dashboard_url: "https://grafana.skyn3t.com/d/api-overview"

  - alert: APIHighLatency
    expr: |
      histogram_quantile(0.95, 
        sum(rate(http_request_duration_seconds_bucket{job="skyn3t-api"}[5m])) by (le, service)
      ) > 2
    for: 5m
    labels:
      severity: warning
      service: "{{ $labels.service }}"
    annotations:
      summary: "High latency on {{ $labels.service }}"
      description: "{{ $labels.service }} 95th percentile latency is {{ $value }}s"

  - alert: DatabaseConnectionsHigh
    expr: |
      (
        sum(pg_stat_database_numbackends{datname="skyn3t_production"})
        /
        sum(pg_settings_max_connections)
      ) > 0.8
    for: 3m
    labels:
      severity: warning
    annotations:
      summary: "Database connection usage high"
      description: "Database connection usage is {{ $value | humanizePercentage }}"

  - alert: RedisMemoryUsageHigh
    expr: redis_memory_used_bytes / redis_memory_max_bytes > 0.9
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "Redis memory usage critical"
      description: "Redis memory usage is {{ $value | humanizePercentage }}"

  - alert: KubernetesPodCrashLooping
    expr: rate(kube_pod_container_status_restarts_total{namespace="production"}[15m]) > 0
    for: 0m
    labels:
      severity: critical
      pod: "{{ $labels.pod }}"
      container: "{{ $labels.container }}"
    annotations:
      summary: "Pod {{ $labels.pod }} is crash looping"
      description: "Pod {{ $labels.pod }} in namespace {{ $labels.namespace }} is restarting frequently"

- name: skyn3t-business.rules
  interval: 30s
  rules:
  - alert: LowAccessSuccessRate
    expr: |
      (
        sum(rate(access_events_total{status="granted"}[10m]))
        /
        sum(rate(access_events_total[10m]))
      ) < 0.95
    for: 5m
    labels:
      severity: warning
      component: access-control
    annotations:
      summary: "Access success rate below threshold"
      description: "Access success rate is {{ $value | humanizePercentage }}"

  - alert: PaymentFailureRateHigh
    expr: |
      (
        sum(rate(payment_events_total{status="failed"}[10m]))
        /
        sum(rate(payment_events_total[10m]))
      ) > 0.1
    for: 3m
    labels:
      severity: critical
      component: payments
    annotations:
      summary: "Payment failure rate high"
      description: "Payment failure rate is {{ $value | humanizePercentage }}"

- name: skyn3t-infrastructure.rules
  interval: 30s
  rules:
  - alert: NodeHighCPU
    expr: 100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
    for: 10m
    labels:
      severity: warning
      node: "{{ $labels.instance }}"
    annotations:
      summary: "Node {{ $labels.instance }} high CPU usage"
      description: "Node {{ $labels.instance }} CPU usage is {{ $value }}%"

  - alert: NodeHighMemory
    expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) > 0.85
    for: 10m
    labels:
      severity: warning
      node: "{{ $labels.instance }}"
    annotations:
      summary: "Node {{ $labels.instance }} high memory usage"
      description: "Node {{ $labels.instance }} memory usage is {{ $value | humanizePercentage }}"

  - alert: NodeDiskSpaceLow
    expr: (1 - (node_filesystem_avail_bytes / node_filesystem_size_bytes)) > 0.85
    for: 5m
    labels:
      severity: warning
      node: "{{ $labels.instance }}"
      mountpoint: "{{ $labels.mountpoint }}"
    annotations:
      summary: "Node {{ $labels.instance }} low disk space"
      description: "Node {{ $labels.instance }} disk usage on {{ $labels.mountpoint }} is {{ $value | humanizePercentage }}"

# Custom metrics for business KPIs
- name: skyn3t-kpis.rules
  interval: 60s
  rules:
  - record: skyn3t:daily_active_users
    expr: count(count by (user_id) (increase(user_login_total[24h])))
  
  - record: skyn3t:daily_transactions_total
    expr: sum(increase(payment_events_total{status="completed"}[24h]))
  
  - record: skyn3t:avg_response_time_5m
    expr: |
      histogram_quantile(0.5,
        sum(rate(http_request_duration_seconds_bucket{job="skyn3t-api"}[5m])) by (le, service)
      )
  
  - record: skyn3t:api_availability_5m
    expr: |
      (
        sum(rate(http_requests_total{job="skyn3t-api",status!~"5.."}[5m]))
        /
        sum(rate(http_requests_total{job="skyn3t-api"}[5m]))
      )
```

### Grafana Dashboards

#### Production API Dashboard
```json
{
  "dashboard": {
    "id": null,
    "title": "SKYN3T API - Production Overview",
    "tags": ["skyn3t", "production", "api"],
    "timezone": "UTC",
    "refresh": "30s",
    "time": {
      "from": "now-6h",
      "to": "now"
    },
    "panels": [
      {
        "id": 1,
        "title": "API Request Rate",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total{job=\"skyn3t-api\"}[5m]))",
            "legendFormat": "Requests/sec"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "reqps",
            "thresholds": {
              "steps": [
                {"color": "green", "value": null},
                {"color": "yellow", "value": 100},
                {"color": "red", "value": 500}
              ]
            }
          }
        },
        "gridPos": {"h": 8, "w": 6, "x": 0, "y": 0}
      },
      {
        "id": 2,
        "title": "Error Rate",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total{job=\"skyn3t-api\",status=~\"5..\"}[5m])) / sum(rate(http_requests_total{job=\"skyn3t-api\"}[5m]))",
            "legendFormat": "Error Rate"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "percentunit",
            "thresholds": {
              "steps": [
                {"color": "green", "value": null},
                {"color": "yellow", "value": 0.01},
                {"color": "red", "value": 0.05}
              ]
            }
          }
        },
        "gridPos": {"h": 8, "w": 6, "x": 6, "y": 0}
      },
      {
        "id": 3,
        "title": "Response Time P95",
        "type": "stat",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job=\"skyn3t-api\"}[5m])) by (le))",
            "legendFormat": "P95 Latency"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "s",
            "thresholds": {
              "steps": [
                {"color": "green", "value": null},
                {"color": "yellow", "value": 1},
                {"color": "red", "value": 2}
              ]
            }
          }
        },
        "gridPos": {"h": 8, "w": 6, "x": 12, "y": 0}
      },
      {
        "id": 4,
        "title": "Active Pods",
        "type": "stat",
        "targets": [
          {
            "expr": "count(up{job=\"skyn3t-api\"} == 1)",
            "legendFormat": "Healthy Pods"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "short",
            "thresholds": {
              "steps": [
                {"color": "red", "value": null},
                {"color": "yellow", "value": 4},
                {"color": "green", "value": 8}
              ]
            }
          }
        },
        "gridPos": {"h": 8, "w": 6, "x": 18, "y": 0}
      },
      {
        "id": 5,
        "title": "Request Rate by Service",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total{job=\"skyn3t-api\"}[5m])) by (service)",
            "legendFormat": "{{ service }}"
          }
        ],
        "yAxes": [
          {
            "label": "Requests/sec",
            "min": 0
          }
        ],
        "gridPos": {"h": 9, "w": 12, "x": 0, "y": 8}
      },
      {
        "id": 6,
        "title": "Response Time Distribution",
        "type": "heatmap",
        "targets": [
          {
            "expr": "sum(rate(http_request_duration_seconds_bucket{job=\"skyn3t-api\"}[5m])) by (le)",
            "format": "heatmap",
            "legendFormat": "{{ le }}"
          }
        ],
        "gridPos": {"h": 9, "w": 12, "x": 12, "y": 8}
      }
    ]
  }
}
```

### Alertmanager Configuration

#### Production Alert Routing
```yaml
# monitoring/alertmanager/alertmanager.yml

global:
  smtp_smarthost: 'smtp.sendgrid.net:587'
  smtp_from: 'alerts@skyn3t.com'
  smtp_auth_username: 'apikey'
  smtp_auth_password: '{{ .Values.smtp.password }}'

route:
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 12h
  receiver: 'default'
  
  routes:
  # Critical alerts - immediate notification
  - match:
      severity: critical
    receiver: 'critical-alerts'
    group_wait: 10s
    repeat_interval: 5m
    
  # Database alerts
  - match:
      component: database
    receiver: 'database-team'
    
  # Payment alerts
  - match:
      component: payments
    receiver: 'payments-team'
    
  # Infrastructure alerts
  - match_re:
      alertname: '^(Node|Kubernetes).*'
    receiver: 'infrastructure-team'

receivers:
- name: 'default'
  slack_configs:
  - api_url: '{{ .Values.slack.webhook_url }}'
    channel: '#alerts'
    title: 'SKYN3T Alert'
    text: |
      {{ range .Alerts }}
      *Alert:* {{ .Annotations.summary }}
      *Description:* {{ .Annotations.description }}
      *Severity:* {{ .Labels.severity }}
      {{ end }}

- name: 'critical-alerts'
  slack_configs:
  - api_url: '{{ .Values.slack.webhook_url }}'
    channel: '#critical-alerts'
    title: '🚨 CRITICAL ALERT'
    text: |
      {{ range .Alerts }}
      *Alert:* {{ .Annotations.summary }}
      *Description:* {{ .Annotations.description }}
      *Runbook:* {{ .Annotations.runbook_url }}
      {{ end }}
  
  pagerduty_configs:
  - routing_key: '{{ .Values.pagerduty.routing_key }}'
    description: '{{ .GroupLabels.alertname }}: {{ .Annotations.summary }}'
  
  email_configs:
  - to: 'oncall@skyn3t.com'
    subject: 'CRITICAL: {{ .GroupLabels.alertname }}'
    body: |
      {{ range .Alerts }}
      Alert: {{ .Annotations.summary }}
      Description: {{ .Annotations.description }}
      Severity: {{ .Labels.severity }}
      Time: {{ .StartsAt }}
      {{ end }}

- name: 'database-team'
  slack_configs:
  - api_url: '{{ .Values.slack.webhook_url }}'
    channel: '#database-alerts'
    title: 'Database Alert'

- name: 'payments-team'
  slack_configs:
  - api_url: '{{ .Values.slack.webhook_url }}'
    channel: '#payments-alerts'
    title: 'Payment System Alert'

- name: 'infrastructure-team'
  slack_configs:
  - api_url: '{{ .Values.slack.webhook_url }}'
    channel: '#infrastructure-alerts'
    title: 'Infrastructure Alert'

inhibit_rules:
# Inhibit any warning-level alerts if the same alert is already critical
- source_match:
    severity: 'critical'
  target_match:
    severity: 'warning'
  equal: ['alertname', 'cluster', 'service']
```

---

## 🔄 Disaster Recovery & Business Continuity

### RTO/RPO Targets

#### Recovery Objectives
```yaml
Service Level Objectives:
  RTO (Recovery Time Objective): 
    Critical Services: 15 minutes
    Non-Critical Services: 1 hour
    Complete System: 4 hours
  
  RPO (Recovery Point Objective):
    Database: 5 minutes
    File Storage: 15 minutes
    Logs: 1 hour
    Metrics: 5 minutes

Disaster Scenarios:
  Single AZ Failure:
    - Automatic failover via Kubernetes
    - RTO: 2 minutes
    - RPO: 0 minutes (no data loss)
  
  Region Failure:
    - Manual failover to DR region
    - RTO: 15 minutes
    - RPO: 5 minutes
  
  Complete Infrastructure Loss:
    - Rebuild from infrastructure as code
    - RTO: 4 hours
    - RPO: 15 minutes
```

### Disaster Recovery Procedures

#### DR Runbook
```bash
#!/bin/bash
# scripts/disaster-recovery.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

# Configuration
PRIMARY_REGION="us-east-1"
DR_REGION="us-west-2"
PRIMARY_CLUSTER="skyn3t-production"
DR_CLUSTER="skyn3t-production-dr"

# Logging
log_info() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1"
}

log_error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
}

log_warning() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1" >&2
}

# Health check functions
check_primary_region() {
    log_info "Checking primary region health..."
    
    # Check EKS cluster
    if aws eks describe-cluster --name $PRIMARY_CLUSTER --region $PRIMARY_REGION >/dev/null 2>&1; then
        log_info "Primary EKS cluster is accessible"
        return 0
    else
        log_error "Primary EKS cluster is not accessible"
        return 1
    fi
}

check_database_replication() {
    log_info "Checking database replication lag..."
    
    # Get replication lag
    LAG=$(aws rds describe-db-instances \
        --db-instance-identifier skyn3t-production-replica \
        --region $DR_REGION \
        --query 'DBInstances[0].StatusInfos[?StatusType==`read replication`].Message' \
        --output text)
    
    if [[ -n "$LAG" ]]; then
        log_info "Replication lag: $LAG"
        return 0
    else
        log_error "Cannot determine replication lag"
        return 1
    fi
}

# Failover procedures
initiate_dns_failover() {
    log_info "Initiating DNS failover..."
    
    # Update Route 53 to point to DR region
    aws route53 change-resource-record-sets \
        --hosted-zone-id $HOSTED_ZONE_ID \
        --change-batch '{
            "Comment": "Failover to DR region",
            "Changes": [{
                "Action": "UPSERT",
                "ResourceRecordSet": {
                    "Name": "api.skyn3t.com",
                    "Type": "A",
                    "SetIdentifier": "DR-Failover",
                    "Failover": {
                        "Type": "PRIMARY"
                    },
                    "AliasTarget": {
                        "DNSName": "'$DR_ALB_DNS'",
                        "EvaluateTargetHealth": true,
                        "HostedZoneId": "'$DR_ALB_ZONE_ID'"
                    }
                }
            }]
        }'
    
    log_info "DNS failover initiated"
}

promote_read_replica() {
    log_info "Promoting read replica to master..."
    
    # Promote read replica
    aws rds promote-read-replica \
        --db-instance-identifier skyn3t-production-replica \
        --region $DR_REGION
    
    # Wait for promotion to complete
    log_info "Waiting for database promotion to complete..."
    aws rds wait db-instance-available \
        --db-instance-identifier skyn3t-production-replica \
        --region $DR_REGION
    
    log_info "Database promotion completed"
}

scale_dr_services() {
    log_info "Scaling DR services to production capacity..."
    
    # Update kubeconfig for DR cluster
    aws eks update-kubeconfig --name $DR_CLUSTER --region $DR_REGION
    
    # Scale up DR deployment
    kubectl scale deployment skyn3t --replicas=8 -n production
    
    # Wait for pods to be ready
    kubectl wait --for=condition=ready pod -l app=skyn3t -n production --timeout=600s
    
    log_info "DR services scaled successfully"
}

verify_dr_health() {
    log_info "Verifying DR environment health..."
    
    # Health checks
    local health_check_url="https://api.skyn3t.com/health"
    
    for i in {1..10}; do
        if curl -sf "$health_check_url" >/dev/null; then
            log_info "Health check passed"
            return 0
        else
            log_warning "Health check attempt $i failed, retrying..."
            sleep 30
        fi
    done
    
    log_error "Health checks failed after 10 attempts"
    return 1
}

# Main disaster recovery workflow
main() {
    local action="${1:-status}"
    
    case "$action" in
        "status")
            log_info "Checking disaster recovery status..."
            check_primary_region
            check_database_replication
            ;;
            
        "failover")
            log_info "🚨 INITIATING DISASTER RECOVERY FAILOVER"
            
            # Confirm this is not a drill
            read -p "This will initiate disaster recovery failover. Type 'CONFIRM' to proceed: " confirm
            if [[ "$confirm" != "CONFIRM" ]]; then
                log_error "Failover cancelled"
                exit 1
            fi
            
            # Failover steps
            promote_read_replica
            scale_dr_services
            initiate_dns_failover
            verify_dr_health
            
            log_info "✅ Disaster recovery failover completed"
            log_info "🔍 Please verify system functionality and notify stakeholders"
            ;;
            
        "failback")
            log_info "🔄 INITIATING FAILBACK TO PRIMARY REGION"
            
            # Confirm primary region is ready
            if ! check_primary_region; then
                log_error "Primary region is not ready for failback"
                exit 1
            fi
            
            # Failback steps
            # ... (implementation details)
            
            log_info "✅ Failback to primary region completed"
            ;;
            
        "test")
            log_info "🧪 RUNNING DISASTER RECOVERY TEST"
            
            # Test procedures without affecting production
            # ... (implementation details)
            
            log_info "✅ Disaster recovery test completed"
            ;;
            
        *)
            echo "Usage: $0 {status|failover|failback|test}"
            echo ""
            echo "Commands:"
            echo "  status   - Check DR readiness status"
            echo "  failover - Initiate failover to DR region"
            echo "  failback - Failback to primary region"
            echo "  test     - Run DR test procedures"
            exit 1
            ;;
    esac
}

# Execute main function
main "$@"
```

### Backup Strategy

#### Automated Backup Scripts
```bash
#!/bin/bash
# scripts/backup-production.sh

set -e

# Configuration
BACKUP_BUCKET="skyn3t-production-backups"
RETENTION_DAYS=90
DATE=$(date +%Y%m%d_%H%M%S)

log_info() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1"
}

log_error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
}

# Database backup
backup_database() {
    log_info "Starting database backup..."
    
    local backup_file="database_backup_${DATE}.sql"
    local s3_path="s3://${BACKUP_BUCKET}/database/${backup_file}"
    
    # Create snapshot first
    local snapshot_id="skyn3t-backup-${DATE}"
    aws rds create-db-snapshot \
        --db-instance-identifier skyn3t-production \
        --db-snapshot-identifier $snapshot_id
    
    # Wait for snapshot
    aws rds wait db-snapshot-completed \
        --db-snapshot-identifier $snapshot_id
    
    # Export to S3
    aws rds start-export-task \
        --export-task-identifier export-${DATE} \
        --source-arn "arn:aws:rds:us-east-1:$(aws sts get-caller-identity --query Account --output text):snapshot:${snapshot_id}" \
        --s3-bucket-name $BACKUP_BUCKET \
        --s3-prefix "database/exports/" \
        --iam-role-arn "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/rds-s3-export-role"
    
    log_info "Database backup initiated: $snapshot_id"
}

# Application data backup
backup_application_data() {
    log_info "Starting application data backup..."
    
    # Backup Redis data
    kubectl exec -n production deployment/redis -- redis-cli BGSAVE
    
    # Wait for background save to complete
    sleep 30
    
    # Copy Redis dump to S3
    kubectl cp production/redis-0:/data/dump.rdb /tmp/redis_backup_${DATE}.rdb
    aws s3 cp /tmp/redis_backup_${DATE}.rdb s3://${BACKUP_BUCKET}/redis/
    rm /tmp/redis_backup_${DATE}.rdb
    
    log_info "Application data backup completed"
}

# Kubernetes resources backup
backup_kubernetes_resources() {
    log_info "Starting Kubernetes resources backup..."
    
    local backup_dir="/tmp/k8s_backup_${DATE}"
    mkdir -p $backup_dir
    
    # Backup namespaces
    kubectl get namespaces -o yaml > $backup_dir/namespaces.yaml
    
    # Backup each namespace
    for namespace in production staging monitoring; do
        mkdir -p $backup_dir/$namespace
        
        # Backup deployments
        kubectl get deployments -n $namespace -o yaml > $backup_dir/$namespace/deployments.yaml
        
        # Backup services
        kubectl get services -n $namespace -o yaml > $backup_dir/$namespace/services.yaml
        
        # Backup configmaps
        kubectl get configmaps -n $namespace -o yaml > $backup_dir/$namespace/configmaps.yaml
        
        # Backup secrets (names only, not values)
        kubectl get secrets -n $namespace --no-headers | awk '{print $1}' > $backup_dir/$namespace/secrets-list.txt
        
        # Backup ingresses
        kubectl get ingresses -n $namespace -o yaml > $backup_dir/$namespace/ingresses.yaml
        
        # Backup persistent volume claims
        kubectl get pvc -n $namespace -o yaml > $backup_dir/$namespace/pvcs.yaml
    done
    
    # Create archive and upload
    tar -czf k8s_backup_${DATE}.tar.gz -C /tmp k8s_backup_${DATE}
    aws s3 cp k8s_backup_${DATE}.tar.gz s3://${BACKUP_BUCKET}/kubernetes/
    
    # Cleanup
    rm -rf $backup_dir k8s_backup_${DATE}.tar.gz
    
    log_info "Kubernetes resources backup completed"
}

# File storage backup
backup_file_storage() {
    log_info "Starting file storage backup..."
    
    # Sync S3 buckets to backup bucket
    aws s3 sync s3://skyn3t-production-assets s3://${BACKUP_BUCKET}/file-storage/assets/
    aws s3 sync s3://skyn3t-production-uploads s3://${BACKUP_BUCKET}/file-storage/uploads/
    
    log_info "File storage backup completed"
}

# Cleanup old backups
cleanup_old_backups() {
    log_info "Cleaning up backups older than $RETENTION_DAYS days..."
    
    # Database snapshots
    aws rds describe-db-snapshots \
        --db-instance-identifier skyn3t-production \
        --query "DBSnapshots[?SnapshotCreateTime<=\`$(date -d "$RETENTION_DAYS days ago" --iso-8601)\`].DBSnapshotIdentifier" \
        --output text | xargs -I {} aws rds delete-db-snapshot --db-snapshot-identifier {}
    
    # S3 backups (lifecycle policy handles this automatically)
    
    log_info "Cleanup completed"
}

# Verify backup integrity
verify_backup_integrity() {
    log_info "Verifying backup integrity..."
    
    # Check if latest snapshot exists
    local latest_snapshot=$(aws rds describe-db-snapshots \
        --db-instance-identifier skyn3t-production \
        --query 'DBSnapshots | sort_by(@, &SnapshotCreateTime) | [-1].DBSnapshotIdentifier' \
        --output text)
    
    if [[ -n "$latest_snapshot" ]]; then
        log_info "Latest database snapshot: $latest_snapshot"
    else
        log_error "No recent database snapshot found"
        return 1
    fi
    
    # Check S3 backup files
    local backup_count=$(aws s3 ls s3://${BACKUP_BUCKET}/kubernetes/ --recursive | wc -l)
    if [[ $backup_count -gt 0 ]]; then
        log_info "Found $backup_count Kubernetes backup files"
    else
        log_error "No Kubernetes backup files found"
        return 1
    fi
    
    log_info "Backup integrity verification completed"
}

# Main backup workflow
main() {
    local action="${1:-full}"
    
    case "$action" in
        "full")
            log_info "🔄 Starting full production backup..."
            backup_database
            backup_application_data
            backup_kubernetes_resources
            backup_file_storage
            verify_backup_integrity
            cleanup_old_backups
            log_info "✅ Full production backup completed"
            ;;
            
        "database")
            backup_database
            ;;
            
        "kubernetes")
            backup_kubernetes_resources
            ;;
            
        "files")
            backup_file_storage
            ;;
            
        "verify")
            verify_backup_integrity
            ;;
            
        "cleanup")
            cleanup_old_backups
            ;;
            
        *)
            echo "Usage: $0 {full|database|kubernetes|files|verify|cleanup}"
            exit 1
            ;;
    esac
}

# Execute main function
main "$@"
```

---

## 🔧 Operations & Maintenance

### Maintenance Windows

#### Scheduled Maintenance Script
```bash
#!/bin/bash
# scripts/maintenance-window.sh

set -e

MAINTENANCE_PAGE_URL="https://raw.githubusercontent.com/PeterH4ck/SKYN3T-Control_/main/maintenance/maintenance.html"
MAINTENANCE_NAMESPACE="maintenance"

log_info() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1"
}

enable_maintenance_mode() {
    log_info "🔧 Enabling maintenance mode..."
    
    # Create maintenance namespace
    kubectl create namespace $MAINTENANCE_NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
    
    # Deploy maintenance page
    kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: maintenance-page
  namespace: $MAINTENANCE_NAMESPACE
  labels:
    app: maintenance-page
spec:
  replicas: 3
  selector:
    matchLabels:
      app: maintenance-page
  template:
    metadata:
      labels:
        app: maintenance-page
    spec:
      containers:
      - name: nginx
        image: nginx:alpine
        ports:
        - containerPort: 80
        volumeMounts:
        - name: maintenance-content
          mountPath: /usr/share/nginx/html
        resources:
          requests:
            memory: "64Mi"
            cpu: "50m"
          limits:
            memory: "128Mi"
            cpu: "100m"
      volumes:
      - name: maintenance-content
        configMap:
          name: maintenance-content
---
apiVersion: v1
kind: Service
metadata:
  name: maintenance-page
  namespace: $MAINTENANCE_NAMESPACE
spec:
  selector:
    app: maintenance-page
  ports:
  - port: 80
    targetPort: 80
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: maintenance-content
  namespace: $MAINTENANCE_NAMESPACE
data:
  index.html: |
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>SKYN3T - Mantenimiento Programado</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
            }
            .container {
                text-align: center;
                max-width: 600px;
                padding: 2rem;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 20px;
                backdrop-filter: blur(10px);
                box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
            }
            .logo { font-size: 3rem; margin-bottom: 1rem; }
            h1 { font-size: 2.5rem; margin-bottom: 1rem; }
            p { font-size: 1.2rem; margin-bottom: 2rem; line-height: 1.6; }
            .status { 
                background: rgba(255, 255, 255, 0.2);
                padding: 1rem;
                border-radius: 10px;
                margin: 2rem 0;
            }
            .spinner {
                border: 4px solid rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                border-top: 4px solid #fff;
                width: 40px;
                height: 40px;
                animation: spin 2s linear infinite;
                margin: 0 auto 1rem;
            }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">🏢</div>
            <h1>SKYN3T</h1>
            <p>Estamos realizando mantenimiento programado para mejorar nuestros servicios.</p>
            <div class="status">
                <div class="spinner"></div>
                <p><strong>Mantenimiento en Progreso</strong></p>
                <p>Tiempo estimado: 30 minutos</p>
                <p>Inicio: $(date '+%H:%M %Z')</p>
            </div>
            <p>Gracias por su paciencia. Estaremos de vuelta pronto.</p>
            <p><strong>Soporte:</strong> soporte@skyn3t.com</p>
        </div>
        <script>
            // Auto-refresh every 2 minutes
            setTimeout(() => location.reload(), 120000);
        </script>
    </body>
    </html>
EOF
    
    # Update ingress to point to maintenance page
    kubectl patch ingress skyn3t-ingress -n production --type='json' \
        -p='[{
            "op": "replace", 
            "path": "/spec/rules/0/http/paths/0/backend/service/name", 
            "value": "maintenance-page"
        }, {
            "op": "replace", 
            "path": "/spec/rules/0/http/paths/0/backend/service/port/number", 
            "value": 80
        }]'
    
    # Scale down production services
    kubectl scale deployment skyn3t --replicas=0 -n production
    
    log_info "✅ Maintenance mode enabled"
    log_info "🌐 Maintenance page is now live at https://api.skyn3t.com"
}

disable_maintenance_mode() {
    log_info "🔧 Disabling maintenance mode..."
    
    # Scale up production services
    kubectl scale deployment skyn3t --replicas=8 -n production
    
    # Wait for pods to be ready
    log_info "⏳ Waiting for production services to be ready..."
    kubectl wait --for=condition=ready pod -l app=skyn3t -n production --timeout=600s
    
    # Restore ingress
    kubectl patch ingress skyn3t-ingress -n production --type='json' \
        -p='[{
            "op": "replace", 
            "path": "/spec/rules/0/http/paths/0/backend/service/name", 
            "value": "skyn3t"
        }, {
            "op": "replace", 
            "path": "/spec/rules/0/http/paths/0/backend/service/port/number", 
            "value": 8000
        }]'
    
    # Clean up maintenance resources
    kubectl delete namespace $MAINTENANCE_NAMESPACE --ignore-not-found=true
    
    # Verify services
    sleep 30
    if curl -sf "https://api.skyn3t.com/health" >/dev/null; then
        log_info "✅ Maintenance mode disabled - Services are healthy"
    else
        log_error "❌ Services may not be fully ready - Please verify manually"
    fi
}

perform_database_maintenance() {
    log_info "🗄️ Performing database maintenance..."
    
    # Connect to database and run maintenance tasks
    kubectl exec -n production deployment/postgres -- psql -U postgres -d skyn3t_production -c "
        -- Analyze tables for better query planning
        ANALYZE;
        
        -- Vacuum to reclaim space
        VACUUM (VERBOSE, ANALYZE);
        
        -- Update statistics
        SELECT pg_stat_reset();
        
        -- Check for long-running queries
        SELECT pid, now() - pg_stat_activity.query_start AS duration, query 
        FROM pg_stat_activity 
        WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
          AND state = 'active';
        
        -- Reindex if needed
        REINDEX DATABASE skyn3t_production;
    "
    
    log_info "✅ Database maintenance completed"
}

update_ssl_certificates() {
    log_info "🔒 Updating SSL certificates..."
    
    # Force certificate renewal
    kubectl delete certificate production-tls -n production --ignore-not-found=true
    
    # Wait for cert-manager to recreate the certificate
    sleep 60
    
    # Verify certificate status
    kubectl get certificate production-tls -n production
    
    log_info "✅ SSL certificates updated"
}

cleanup_old_resources() {
    log_info "🧹 Cleaning up old resources..."
    
    # Clean up old pods
    kubectl delete pods --field-selector status.phase=Succeeded -n production
    kubectl delete pods --field-selector status.phase=Failed -n production
    
    # Clean up old replica sets
    kubectl delete replicasets --cascade=orphan -n production $(kubectl get rs -n production -o jsonpath='{.items[?(@.spec.replicas==0)].metadata.name}')
    
    # Clean up old jobs
    kubectl delete jobs --field-selector status.conditions[0].type=Complete -n production
    
    # Clean up Docker images on nodes
    kubectl get nodes -o name | xargs -I {} kubectl debug {} -it --image=alpine -- sh -c "
        docker system prune -af --filter 'until=72h'
        docker volume prune -f
    "
    
    log_info "✅ Resource cleanup completed"
}

# Main maintenance workflow
main() {
    local action="${1:-}"
    
    case "$action" in
        "enable")
            enable_maintenance_mode
            ;;
            
        "disable")
            disable_maintenance_mode
            ;;
            
        "full")
            log_info "🔧 Starting full maintenance window..."
            
            # Confirm maintenance window
            read -p "This will start a maintenance window. Type 'CONFIRM' to proceed: " confirm
            if [[ "$confirm" != "CONFIRM" ]]; then
                log_error "Maintenance cancelled"
                exit 1
            fi
            
            enable_maintenance_mode
            sleep 60  # Allow traffic to drain
            
            # Maintenance tasks
            perform_database_maintenance
            update_ssl_certificates
            cleanup_old_resources
            
            # Additional maintenance tasks can be added here
            
            disable_maintenance_mode
            
            log_info "✅ Full maintenance window completed"
            ;;
            
        "database")
            perform_database_maintenance
            ;;
            
        "certificates")
            update_ssl_certificates
            ;;
            
        "cleanup")
            cleanup_old_resources
            ;;
            
        *)
            echo "Usage: $0 {enable|disable|full|database|certificates|cleanup}"
            echo ""
            echo "Commands:"
            echo "  enable      - Enable maintenance mode"
            echo "  disable     - Disable maintenance mode"
            echo "  full        - Complete maintenance window"
            echo "  database    - Database maintenance only"
            echo "  certificates - Update SSL certificates"
            echo "  cleanup     - Clean up old resources"
            exit 1
            ;;
    esac
}

# Execute main function
main "$@"
```

---

## 🔍 Troubleshooting Guide

### Common Issues and Solutions

#### Performance Issues
```bash
#!/bin/bash
# scripts/troubleshoot-performance.sh

check_api_performance() {
    echo "🔍 Checking API performance..."
    
    # Check response times
    echo "Response time metrics (last 5 minutes):"
    kubectl exec -n monitoring deployment/prometheus -- promtool query instant \
        'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="skyn3t-api"}[5m])) by (le, service))'
    
    # Check error rates
    echo "Error rate metrics:"
    kubectl exec -n monitoring deployment/prometheus -- promtool query instant \
        'sum(rate(http_requests_total{job="skyn3t-api",status=~"5.."}[5m])) / sum(rate(http_requests_total{job="skyn3t-api"}[5m]))'
    
    # Check CPU and memory usage
    echo "Resource utilization:"
    kubectl top pods -n production --sort-by=cpu
    kubectl top pods -n production --sort-by=memory
}

check_database_performance() {
    echo "🗄️ Checking database performance..."
    
    # Check active connections
    kubectl exec -n production deployment/postgres -- psql -U postgres -d skyn3t_production -c "
        SELECT count(*) as active_connections FROM pg_stat_activity WHERE state = 'active';
        
        SELECT query, state, query_start, now() - query_start as duration 
        FROM pg_stat_activity 
        WHERE state != 'idle' 
        ORDER BY duration DESC 
        LIMIT 10;
    "
    
    # Check slow queries
    kubectl exec -n production deployment/postgres -- psql -U postgres -d skyn3t_production -c "
        SELECT query, mean_time, calls, total_time
        FROM pg_stat_statements 
        ORDER BY mean_time DESC 
        LIMIT 10;
    "
    
    # Check database size
    kubectl exec -n production deployment/postgres -- psql -U postgres -d skyn3t_production -c "
        SELECT pg_size_pretty(pg_database_size('skyn3t_production')) as database_size;
        
        SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
        FROM pg_tables 
        WHERE schemaname = 'public' 
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC 
        LIMIT 10;
    "
}

check_redis_performance() {
    echo "💾 Checking Redis performance..."
    
    # Redis info
    kubectl exec -n production deployment/redis -- redis-cli INFO memory
    kubectl exec -n production deployment/redis -- redis-cli INFO stats
    
    # Check slow queries
    kubectl exec -n production deployment/redis -- redis-cli SLOWLOG GET 10
    
    # Check memory usage
    kubectl exec -n production deployment/redis -- redis-cli --latency-history -i 1
}

# Network troubleshooting
check_network_connectivity() {
    echo "🌐 Checking network connectivity..."
    
    # Check DNS resolution
    nslookup api.skyn3t.com
    
    # Check ingress status
    kubectl get ingress -n production
    kubectl describe ingress skyn3t-ingress -n production
    
    # Check service endpoints
    kubectl get endpoints -n production
    
    # Check network policies
    kubectl get networkpolicies -n production
}

# Main troubleshooting function
main() {
    local issue="${1:-all}"
    
    case "$issue" in
        "performance"|"perf")
            check_api_performance
            ;;
        "database"|"db")
            check_database_performance
            ;;
        "redis"|"cache")
            check_redis_performance
            ;;
        "network"|"net")
            check_network_connectivity
            ;;
        "all")
            echo "🔍 Running complete system diagnostics..."
            check_api_performance
            echo -e "\n" && check_database_performance
            echo -e "\n" && check_redis_performance
            echo -e "\n" && check_network_connectivity
            ;;
        *)
            echo "Usage: $0 {performance|database|redis|network|all}"
            exit 1
            ;;
    esac
}

main "$@"
```

### Emergency Procedures

#### Emergency Scaling
```bash
#!/bin/bash
# scripts/emergency-scale.sh

set -e

NAMESPACE="production"

log_info() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1"
}

log_error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
}

emergency_scale_up() {
    local service="$1"
    local replicas="$2"
    
    log_info "🚨 Emergency scaling $service to $replicas replicas"
    
    # Scale the deployment
    kubectl scale deployment $service --replicas=$replicas -n $NAMESPACE
    
    # Wait for pods to be ready
    log_info "⏳ Waiting for pods to be ready..."
    kubectl wait --for=condition=ready pod -l app=$service -n $NAMESPACE --timeout=600s
    
    # Verify scaling
    local current_replicas=$(kubectl get deployment $service -n $NAMESPACE -o jsonpath='{.status.readyReplicas}')
    log_info "✅ $service scaled to $current_replicas/$replicas replicas"
    
    # Check resource usage
    kubectl top pods -l app=$service -n $NAMESPACE
}

emergency_scale_cluster() {
    local node_count="$1"
    
    log_info "🚨 Emergency cluster scaling to $node_count nodes"
    
    # Get current node group
    local nodegroup=$(aws eks list-nodegroups --cluster-name skyn3t-production --query 'nodegroups[0]' --output text)
    
    # Scale node group
    aws eks update-nodegroup-config \
        --cluster-name skyn3t-production \
        --nodegroup-name $nodegroup \
        --scaling-config minSize=3,maxSize=$node_count,desiredSize=$node_count
    
    log_info "⏳ Waiting for nodes to be ready..."
    
    # Wait for nodes
    while [[ $(kubectl get nodes --no-headers | grep Ready | wc -l) -lt $node_count ]]; do
        sleep 30
        echo "Current ready nodes: $(kubectl get nodes --no-headers | grep Ready | wc -l)/$node_count"
    done
    
    log_info "✅ Cluster scaled to $node_count nodes"
}

main() {
    local action="$1"
    local target="${2:-skyn3t}"
    local replicas="${3:-20}"
    
    case "$action" in
        "service")
            if [[ -z "$replicas" ]]; then
                echo "Usage: $0 service <service-name> <replica-count>"
                exit 1
            fi
            emergency_scale_up "$target" "$replicas"
            ;;
            
        "cluster")
            if [[ -z "$replicas" ]]; then
                echo "Usage: $0 cluster <node-count>"
                exit 1
            fi
            emergency_scale_cluster "$replicas"
            ;;
            
        "full")
            log_info "🚨 FULL EMERGENCY SCALING ACTIVATED"
            
            # Scale all critical services
            emergency_scale_up "skyn3t" 20
            emergency_scale_up "auth-service" 8
            emergency_scale_up "user-service" 8
            emergency_scale_up "device-service" 6
            
            # Scale cluster if needed
            emergency_scale_cluster 15
            
            log_info "✅ Full emergency scaling completed"
            ;;
            
        *)
            echo "Usage: $0 {service|cluster|full} [options]"
            echo ""
            echo "Examples:"
            echo "  $0 service skyn3t 20      # Scale skyn3t service to 20 replicas"
            echo "  $0 cluster 15             # Scale cluster to 15 nodes"
            echo "  $0 full                   # Emergency scale everything"
            exit 1
            ;;
    esac
}

main "$@"
```

---

## 📈 Performance Monitoring & Optimization

### Performance Benchmarks

#### Load Testing Script
```bash
#!/bin/bash
# scripts/load-test-production.sh

set -e

API_URL="${1:-https://api.skyn3t.com}"
DURATION="${2:-5m}"
VUS="${3:-100}"

if [[ ! -f "./k6-script.js" ]]; then
    cat > k6-script.js << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

export let options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 200 },  // Ramp up to 200
    { duration: '5m', target: 200 },  // Stay at 200
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.1'],
    errors: ['rate<0.1'],
  },
};

const BASE_URL = __ENV.API_URL || 'https://api.skyn3t.com';

export function setup() {
  // Login to get token
  const loginResponse = http.post(`${BASE_URL}/api/v1/auth/login`, JSON.stringify({
    username: 'loadtest@example.com',
    password: 'LoadTest123!'
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  return {
    token: loginResponse.json('data.access_token')
  };
}

export default function(data) {
  const headers = {
    'Authorization': `Bearer ${data.token}`,
    'Content-Type': 'application/json'
  };
  
  // Test various endpoints
  const tests = [
    () => testHealthCheck(),
    () => testUsersList(headers),
    () => testDevicesList(headers),
    () => testAccessLogs(headers),
  ];
  
  const test = tests[Math.floor(Math.random() * tests.length)];
  test();
  
  sleep(1);
}

function testHealthCheck() {
  const response = http.get(`${BASE_URL}/health`);
  check(response, {
    'health check status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);
}

function testUsersList(headers) {
  const response = http.get(`${BASE_URL}/api/v1/users?page=1&limit=20`, { headers });
  check(response, {
    'users list status is 200': (r) => r.status === 200,
    'users list has data': (r) => r.json('data.users').length > 0,
  }) || errorRate.add(1);
}

function testDevicesList(headers) {
  const response = http.get(`${BASE_URL}/api/v1/devices`, { headers });
  check(response, {
    'devices list status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);
}

function testAccessLogs(headers) {
  const response = http.get(`${BASE_URL}/api/v1/access/logs?limit=10`, { headers });
  check(response, {
    'access logs status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);
}

export function teardown(data) {
  // Logout
  http.post(`${BASE_URL}/api/v1/auth/logout`, null, {
    headers: { 'Authorization': `Bearer ${data.token}` }
  });
}
EOF
fi

echo "🚀 Running load test against $API_URL"
echo "Duration: $DURATION, Virtual Users: $VUS"

k6 run --duration $DURATION --vus $VUS --env API_URL=$API_URL k6-script.js

echo "✅ Load test completed"
```

---

**Deployment Guide Version**: 2.8.0  
**Last Updated**: 2025-06-26  
**Next Review**: 2025-09-24  
**Operations Team**: devops@skyn3t.com  
**Emergency Contact**: +1-800-SKYN3T-911
