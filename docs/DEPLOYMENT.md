# 🚀 DEPLOYMENT GUIDE - SKYN3T ACCESS CONTROL

![Deployment Status](https://img.shields.io/badge/Deployment-Production%20Ready-green.svg)
![Environments](https://img.shields.io/badge/Environments-3-blue.svg)
![Uptime](https://img.shields.io/badge/Uptime-99.9%25-brightgreen.svg)

## 📋 Descripción General

Esta guía proporciona instrucciones completas para el deployment de SKYN3T Access Control en diferentes entornos, desde desarrollo local hasta producción en Kubernetes con alta disponibilidad.

### Entornos Soportados

- **🏠 Local Development**: Docker Compose
- **🧪 Staging**: Docker Swarm / Kubernetes
- **🚀 Production**: Kubernetes con Istio Service Mesh
- **☁️ Cloud Providers**: AWS, Azure, GCP

---

## 🏗️ Arquitectura de Deployment

### Multi-Environment Strategy

```
┌─────────────────────────────────────────┐
│            ENVIRONMENTS                 │
├─────────────────────────────────────────┤
│ Development                             │
│  ├─ Docker Compose                      │
│  ├─ Local services                      │
│  ├─ Mock integrations                   │
│  └─ Hot reload enabled                  │
│                                         │
│ Staging                                 │
│  ├─ Kubernetes (single node)            │
│  ├─ Production-like config              │
│  ├─ Real integrations (sandbox)         │
│  └─ Automated testing                   │
│                                         │
│ Production                              │
│  ├─ Kubernetes (multi-node HA)          │
│  ├─ Service mesh (Istio)                │
│  ├─ Auto-scaling enabled                │
│  ├─ Full monitoring stack               │
│  └─ Disaster recovery                   │
└─────────────────────────────────────────┘
```

---

## 🏠 Local Development

### Prerequisites

```bash
# Required software
- Docker 24.0+
- Docker Compose 2.20+
- Node.js 20.x
- Git
- Make (optional)

# Verify installations
docker --version
docker-compose --version
node --version
git --version
```

### Quick Start

```bash
# 1. Clone repository
git clone https://github.com/PeterH4ck/SKYN3T-Control_.git
cd SKYN3T-Control_

# 2. Setup environment
cp .env.example .env
# Edit .env with your local configuration

# 3. Start all services
make dev
# OR
docker-compose -f docker-compose.dev.yml up -d

# 4. Initialize database
make db-migrate
make db-seed

# 5. Verify installation
make health-check
```

### Development Configuration

#### docker-compose.dev.yml
```yaml
version: '3.8'

services:
  # Database with development settings
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: skyn3t_dev
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_INITDB_ARGS: "--auth-host=trust"
    ports:
      - "5432:5432"
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data
      - ./backend/database/schema.sql:/docker-entrypoint-initdb.d/schema.sql
      - ./backend/database/seeds:/docker-entrypoint-initdb.d/seeds
    command: |
      postgres 
      -c log_statement=all 
      -c log_duration=on
      -c log_min_duration_statement=0
      -c max_connections=200

  # Redis for caching
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes

  # Development API server with hot reload
  api-dev:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/skyn3t_dev
      REDIS_URL: redis://redis:6379
      JWT_SECRET: dev-secret-key
    ports:
      - "8000:8000"
      - "9229:9229"  # Debug port
    volumes:
      - ./backend/src:/app/src
      - ./backend/package.json:/app/package.json
    depends_on:
      - postgres
      - redis
    command: npm run dev:debug

  # Frontend development server
  frontend-dev:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    environment:
      REACT_APP_API_URL: http://localhost:8000/api/v1
      REACT_APP_WS_URL: ws://localhost:8000
    ports:
      - "3000:3000"
    volumes:
      - ./frontend/src:/app/src
      - ./frontend/public:/app/public
    command: npm start

volumes:
  postgres_dev_data:
```

### Development Commands

```bash
# Start development environment
make dev                    # Start all services
make dev-api               # Start only API
make dev-frontend          # Start only frontend

# Database operations
make db-reset              # Reset database
make db-backup             # Backup development data
make db-restore FILE=dump  # Restore from backup

# Development utilities
make logs                  # View all logs
make logs-api             # View API logs only
make shell-api            # SSH into API container
make shell-db             # SSH into database

# Testing
make test                 # Run all tests
make test-unit            # Unit tests only
make test-integration     # Integration tests
make test-e2e            # End-to-end tests

# Code quality
make lint                 # Run linting
make format               # Format code
make type-check           # TypeScript checking
```

### Hot Reload Configuration

#### Backend (Node.js + TypeScript)
```json
// package.json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/server.ts",
    "dev:debug": "nodemon --exec ts-node --inspect=0.0.0.0:9229 src/server.ts"
  },
  "nodemonConfig": {
    "watch": ["src"],
    "ext": "ts,js,json",
    "ignore": ["src/**/*.test.ts"],
    "exec": "ts-node src/server.ts"
  }
}
```

#### Frontend (React)
```json
// package.json
{
  "scripts": {
    "start": "react-scripts start",
    "dev": "BROWSER=none npm start"
  }
}
```

---

## 🧪 Staging Environment

### Infrastructure Setup

#### AWS Infrastructure (Terraform)
```hcl
# infrastructure/staging/main.tf
provider "aws" {
  region = "us-east-1"
}

# EKS Cluster for staging
module "eks" {
  source = "terraform-aws-modules/eks/aws"
  
  cluster_name    = "skyn3t-staging"
  cluster_version = "1.28"
  
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets
  
  node_groups = {
    main = {
      instance_types = ["t3.medium"]
      min_capacity   = 2
      max_capacity   = 5
      desired_capacity = 3
    }
  }
  
  tags = {
    Environment = "staging"
    Project     = "skyn3t"
  }
}

# RDS for staging database
resource "aws_db_instance" "staging" {
  identifier = "skyn3t-staging"
  
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = "db.t3.micro"
  
  allocated_storage     = 20
  max_allocated_storage = 100
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
  
  tags = {
    Environment = "staging"
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
  transit_encryption_enabled = true
}
```

### Kubernetes Deployment

#### Helm Chart Structure
```
helm/skyn3t/
├── Chart.yaml
├── values.yaml
├── values-staging.yaml
├── values-production.yaml
│
├── templates/
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── hpa.yaml
│   └── servicemonitor.yaml
│
└── charts/
    ├── postgresql/
    ├── redis/
    └── rabbitmq/
```

#### values-staging.yaml
```yaml
# Staging configuration
global:
  environment: staging
  imageRegistry: your-registry.com
  imageTag: "latest"

replicaCount: 2

image:
  repository: skyn3t/api
  tag: "staging-latest"
  pullPolicy: Always

service:
  type: ClusterIP
  port: 8000

ingress:
  enabled: true
  annotations:
    kubernetes.io/ingress.class: "nginx"
    cert-manager.io/cluster-issuer: "letsencrypt-staging"
    nginx.ingress.kubernetes.io/rate-limit: "100"
  hosts:
    - host: staging-api.skyn3t.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: staging-tls
      hosts:
        - staging-api.skyn3t.com

resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 200m
    memory: 256Mi

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 5
  targetCPUUtilizationPercentage: 70

# Database configuration
postgresql:
  enabled: false  # Using external RDS
  external:
    host: skyn3t-staging.cluster-xxx.us-east-1.rds.amazonaws.com
    port: 5432
    database: skyn3t_staging
    username: postgres

# Redis configuration  
redis:
  enabled: false  # Using external ElastiCache
  external:
    host: skyn3t-staging.xxx.cache.amazonaws.com
    port: 6379

# Environment-specific settings
config:
  nodeEnv: staging
  logLevel: debug
  enableSwagger: true
  enableMetrics: true
  
secrets:
  databasePassword: ""  # Will be injected by CI/CD
  jwtSecret: ""
  redisPassword: ""
```

### Staging Deployment Pipeline

#### GitHub Actions (.github/workflows/staging.yml)
```yaml
name: Deploy to Staging

on:
  push:
    branches: [develop]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'
        cache-dependency-path: backend/package-lock.json
    
    - name: Install dependencies
      run: |
        cd backend
        npm ci
    
    - name: Run linting
      run: |
        cd backend
        npm run lint
    
    - name: Run tests
      run: |
        cd backend
        npm test
      env:
        DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
        REDIS_URL: redis://localhost:6379
    
    - name: Run integration tests
      run: |
        cd backend
        npm run test:integration

  build:
    needs: test
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
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
        images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
        tags: |
          type=ref,event=branch
          type=ref,event=pr
          type=sha,prefix=staging-
    
    - name: Build and push Docker image
      uses: docker/build-push-action@v5
      with:
        context: ./backend
        push: true
        tags: ${{ steps.meta.outputs.tags }}
        labels: ${{ steps.meta.outputs.labels }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: us-east-1
    
    - name: Update kubeconfig
      run: |
        aws eks update-kubeconfig --name skyn3t-staging
    
    - name: Setup Helm
      uses: azure/setup-helm@v3
      with:
        version: '3.12.0'
    
    - name: Deploy to staging
      run: |
        helm upgrade --install skyn3t ./helm/skyn3t \
          --namespace staging \
          --create-namespace \
          --values ./helm/skyn3t/values-staging.yaml \
          --set image.tag=staging-${{ github.sha }} \
          --set secrets.databasePassword=${{ secrets.STAGING_DB_PASSWORD }} \
          --set secrets.jwtSecret=${{ secrets.STAGING_JWT_SECRET }} \
          --wait \
          --timeout=10m
    
    - name: Run smoke tests
      run: |
        kubectl wait --for=condition=ready pod -l app=skyn3t -n staging --timeout=300s
        ./scripts/smoke-tests.sh staging-api.skyn3t.com
    
    - name: Notify deployment status
      uses: 8398a7/action-slack@v3
      with:
        status: ${{ job.status }}
        channel: '#deployments'
        webhook_url: ${{ secrets.SLACK_WEBHOOK }}
      if: always()
```

---

## 🚀 Production Deployment

### Infrastructure Requirements

#### Minimum System Requirements
```yaml
Kubernetes Cluster:
  Nodes: 6+ (3 master, 3+ worker)
  CPU: 16+ cores per worker node
  Memory: 32+ GB per worker node
  Storage: 500+ GB SSD per node
  Network: 10+ Gbps bandwidth

Database:
  PostgreSQL 15+
  CPU: 8+ cores
  Memory: 32+ GB
  Storage: 1+ TB SSD
  IOPS: 10,000+
  Backup: Point-in-time recovery

Cache:
  Redis Cluster
  Memory: 16+ GB
  Nodes: 3+ (master + replicas)
  Persistence: AOF + RDB

Load Balancer:
  Type: Application Load Balancer
  Health checks: Enabled
  SSL termination: Yes
  DDoS protection: Enabled
```

### Production Infrastructure (Terraform)

#### AWS Production Setup
```hcl
# infrastructure/production/main.tf

# EKS Cluster with multiple node groups
module "eks" {
  source = "terraform-aws-modules/eks/aws"
  
  cluster_name    = "skyn3t-production"
  cluster_version = "1.28"
  
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets
  
  # Multiple node groups for different workloads
  node_groups = {
    # General workloads
    general = {
      instance_types = ["m5.xlarge"]
      min_capacity   = 3
      max_capacity   = 10
      desired_capacity = 5
      
      k8s_labels = {
        workload = "general"
      }
    }
    
    # Database-intensive workloads
    database = {
      instance_types = ["r5.large"]
      min_capacity   = 2
      max_capacity   = 5
      desired_capacity = 3
      
      k8s_labels = {
        workload = "database"
      }
      
      taints = {
        database = {
          key    = "workload"
          value  = "database"
          effect = "NO_SCHEDULE"
        }
      }
    }
    
    # Monitoring workloads
    monitoring = {
      instance_types = ["m5.large"]
      min_capacity   = 2
      max_capacity   = 3
      desired_capacity = 2
      
      k8s_labels = {
        workload = "monitoring"
      }
    }
  }
}

# RDS with Multi-AZ and read replicas
resource "aws_db_instance" "production" {
  identifier = "skyn3t-production"
  
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = "db.r5.xlarge"
  
  allocated_storage     = 500
  max_allocated_storage = 2000
  storage_encrypted     = true
  storage_type          = "gp3"
  iops                  = 12000
  
  db_name  = "skyn3t_production"
  username = "postgres"
  password = random_password.db_password.result
  
  # High availability
  multi_az = true
  
  # Security
  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.production.name
  
  # Backup and maintenance
  backup_retention_period = 30
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:06:00"
  
  # Monitoring
  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_monitoring.arn
  
  # Performance insights
  performance_insights_enabled = true
  
  deletion_protection = true
  
  tags = {
    Environment = "production"
  }
}

# Read replica for analytics
resource "aws_db_instance" "production_replica" {
  identifier = "skyn3t-production-replica"
  
  replicate_source_db = aws_db_instance.production.id
  instance_class      = "db.r5.large"
  
  publicly_accessible = false
  
  tags = {
    Environment = "production"
    Purpose     = "analytics"
  }
}

# ElastiCache Redis Cluster
resource "aws_elasticache_replication_group" "production" {
  replication_group_id       = "skyn3t-production"
  description                = "Redis cluster for SKYN3T production"
  
  port               = 6379
  parameter_group_name = "default.redis7.cluster.on"
  node_type          = "cache.r6g.large"
  
  num_cache_clusters         = 6
  automatic_failover_enabled = true
  multi_az_enabled          = true
  
  subnet_group_name = aws_elasticache_subnet_group.production.name
  security_group_ids = [aws_security_group.redis.id]
  
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth.result
  
  # Backup
  snapshot_retention_limit = 7
  snapshot_window         = "03:00-05:00"
  
  tags = {
    Environment = "production"
  }
}
```

### Production Kubernetes Configuration

#### values-production.yaml
```yaml
global:
  environment: production
  imageRegistry: your-registry.com
  domain: api.skyn3t.com

# High availability configuration
replicaCount: 5

image:
  repository: skyn3t/api
  tag: "v1.0.0"
  pullPolicy: IfNotPresent

strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 2
    maxUnavailable: 1

# Service configuration
service:
  type: ClusterIP
  port: 8000
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"

# Ingress with SSL
ingress:
  enabled: true
  className: "nginx"
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    nginx.ingress.kubernetes.io/rate-limit: "1000"
    nginx.ingress.kubernetes.io/rate-limit-burst: "2000"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
  hosts:
    - host: api.skyn3t.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: skyn3t-tls
      hosts:
        - api.skyn3t.com

# Resource allocation
resources:
  limits:
    cpu: 2000m
    memory: 4Gi
  requests:
    cpu: 500m
    memory: 1Gi

# Auto-scaling
autoscaling:
  enabled: true
  minReplicas: 5
  maxReplicas: 20
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

# Pod disruption budget
podDisruptionBudget:
  enabled: true
  minAvailable: 3

# Node affinity
nodeAffinity:
  requiredDuringSchedulingIgnoredDuringExecution:
    nodeSelectorTerms:
    - matchExpressions:
      - key: workload
        operator: In
        values: ["general"]

# Pod anti-affinity (spread across nodes)
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

# Health checks
livenessProbe:
  httpGet:
    path: /health
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
  capabilities:
    drop:
      - ALL

# Production environment variables
env:
  NODE_ENV: production
  LOG_LEVEL: info
  ENABLE_SWAGGER: false
  ENABLE_DEBUG: false
  
# External services (RDS, ElastiCache)
postgresql:
  enabled: false
  external:
    host: skyn3t-production.cluster-xxx.us-east-1.rds.amazonaws.com
    port: 5432
    database: skyn3t_production
    username: postgres

redis:
  enabled: false
  external:
    host: skyn3t-production.xxx.cache.amazonaws.com
    port: 6379
```

### Production Deployment Pipeline

#### GitHub Actions (.github/workflows/production.yml)
```yaml
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

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  security-scan:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
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

  load-test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Run load tests
      run: |
        ./scripts/load-test.sh staging-api.skyn3t.com

  deploy-production:
    needs: [security-scan, load-test]
    runs-on: ubuntu-latest
    environment: production
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: us-east-1
    
    - name: Update kubeconfig
      run: |
        aws eks update-kubeconfig --name skyn3t-production
    
    - name: Setup Helm
      uses: azure/setup-helm@v3
      with:
        version: '3.12.0'
    
    - name: Create database backup
      run: |
        ./scripts/backup-production-db.sh
    
    - name: Deploy to production
      run: |
        helm upgrade --install skyn3t ./helm/skyn3t \
          --namespace production \
          --create-namespace \
          --values ./helm/skyn3t/values-production.yaml \
          --set image.tag=${{ github.event.release.tag_name || github.event.inputs.version }} \
          --set secrets.databasePassword=${{ secrets.PROD_DB_PASSWORD }} \
          --set secrets.jwtSecret=${{ secrets.PROD_JWT_SECRET }} \
          --wait \
          --timeout=15m
    
    - name: Run post-deployment tests
      run: |
        kubectl wait --for=condition=ready pod -l app=skyn3t -n production --timeout=600s
        ./scripts/production-health-check.sh
        ./scripts/api-tests.sh api.skyn3t.com
    
    - name: Update monitoring dashboards
      run: |
        ./scripts/update-grafana-dashboards.sh
    
    - name: Notify deployment
      uses: 8398a7/action-slack@v3
      with:
        status: ${{ job.status }}
        channel: '#deployments'
        webhook_url: ${{ secrets.SLACK_WEBHOOK }}
        text: |
          🚀 Production deployment ${{ job.status }}
          Version: ${{ github.event.release.tag_name || github.event.inputs.version }}
          Environment: Production
      if: always()
```

---

## 🔍 Monitoring & Observability

### Monitoring Stack

#### Prometheus Configuration
```yaml
# prometheus/values.yaml
prometheus:
  prometheusSpec:
    retention: 15d
    resources:
      requests:
        memory: 2Gi
        cpu: 1000m
      limits:
        memory: 4Gi
        cpu: 2000m
    
    storageSpec:
      volumeClaimTemplate:
        spec:
          storageClassName: fast-ssd
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 100Gi
    
    # Service monitoring
    serviceMonitorSelectorNilUsesHelmValues: false
    serviceMonitorSelector: {}
    
    # Rule evaluation
    ruleSelector: {}
    
    # External labels
    externalLabels:
      cluster: skyn3t-production
      environment: production

# ServiceMonitor for SKYN3T API
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: skyn3t-api
spec:
  selector:
    matchLabels:
      app: skyn3t
  endpoints:
  - port: metrics
    path: /metrics
    interval: 30s
```

#### Grafana Dashboards
```json
{
  "dashboard": {
    "title": "SKYN3T - API Performance",
    "tags": ["skyn3t", "api"],
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total{job=\"skyn3t-api\"}[5m])",
            "legendFormat": "{{method}} {{status}}"
          }
        ]
      },
      {
        "title": "Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job=\"skyn3t-api\"}[5m]))",
            "legendFormat": "95th percentile"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "singlestat",
        "targets": [
          {
            "expr": "rate(http_requests_total{job=\"skyn3t-api\",status=~\"5..\"}[5m]) / rate(http_requests_total{job=\"skyn3t-api\"}[5m])",
            "legendFormat": "Error Rate"
          }
        ]
      }
    ]
  }
}
```

### Alerting Rules

#### Prometheus Alerts
```yaml
# alerts/skyn3t-rules.yaml
groups:
- name: skyn3t-api
  rules:
  - alert: HighErrorRate
    expr: |
      (
        rate(http_requests_total{job="skyn3t-api",status=~"5.."}[5m])
        /
        rate(http_requests_total{job="skyn3t-api"}[5m])
      ) > 0.05
    for: 5m
    labels:
      severity: critical
      service: skyn3t-api
    annotations:
      summary: "High error rate detected"
      description: "Error rate is {{ $value | humanizePercentage }} for the last 5 minutes"
  
  - alert: HighResponseTime
    expr: |
      histogram_quantile(0.95, 
        rate(http_request_duration_seconds_bucket{job="skyn3t-api"}[5m])
      ) > 1
    for: 5m
    labels:
      severity: warning
      service: skyn3t-api
    annotations:
      summary: "High response time detected"
      description: "95th percentile response time is {{ $value }}s"
  
  - alert: PodCrashLooping
    expr: |
      rate(kube_pod_container_status_restarts_total{pod=~"skyn3t-.*"}[15m]) > 0
    for: 0m
    labels:
      severity: critical
      service: skyn3t
    annotations:
      summary: "Pod is crash looping"
      description: "Pod {{ $labels.pod }} is restarting frequently"

- name: skyn3t-database
  rules:
  - alert: DatabaseConnectionsHigh
    expr: |
      pg_stat_database_numbackends{datname="skyn3t_production"} > 80
    for: 5m
    labels:
      severity: warning
      service: postgresql
    annotations:
      summary: "High number of database connections"
      description: "{{ $value }} connections to PostgreSQL"
  
  - alert: DatabaseReplicationLag
    expr: |
      pg_replication_lag > 30
    for: 5m
    labels:
      severity: critical
      service: postgresql
    annotations:
      summary: "High replication lag"
      description: "Replication lag is {{ $value }} seconds"
```

### Logging Strategy

#### Structured Logging
```typescript
// Backend logging configuration
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'skyn3t-api',
    version: process.env.npm_package_version,
    environment: process.env.NODE_ENV
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({
      filename: '/var/log/skyn3t/error.log',
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: '/var/log/skyn3t/combined.log',
      maxsize: 10485760,
      maxFiles: 10
    })
  ]
});

// Structured log format
interface LogContext {
  userId?: string;
  communityId?: string;
  requestId?: string;
  action?: string;
  duration?: number;
  metadata?: any;
}

export function logInfo(message: string, context?: LogContext) {
  logger.info(message, context);
}

export function logError(message: string, error: Error, context?: LogContext) {
  logger.error(message, {
    ...context,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    }
  });
}
```

#### ELK Stack Configuration
```yaml
# elasticsearch/values.yaml
elasticsearch:
  clusterName: "skyn3t-logging"
  nodeGroup: "master"
  
  masterService: "skyn3t-elasticsearch"
  
  resources:
    requests:
      cpu: "1000m"
      memory: "2Gi"
    limits:
      cpu: "2000m"
      memory: "4Gi"
  
  volumeClaimTemplate:
    accessModes: [ "ReadWriteOnce" ]
    storageClassName: "fast-ssd"
    resources:
      requests:
        storage: 100Gi

# logstash/pipeline.conf
input {
  beats {
    port => 5044
  }
}

filter {
  if [fields][service] == "skyn3t-api" {
    json {
      source => "message"
    }
    
    mutate {
      add_field => { "[@metadata][target_index]" => "skyn3t-api-%{+YYYY.MM.dd}" }
    }
  }
}

output {
  elasticsearch {
    hosts => ["skyn3t-elasticsearch:9200"]
    index => "%{[@metadata][target_index]}"
  }
}

# kibana/values.yaml
kibana:
  elasticsearchHosts: "http://skyn3t-elasticsearch:9200"
  
  resources:
    requests:
      cpu: "500m"
      memory: "1Gi"
    limits:
      cpu: "1000m"
      memory: "2Gi"
```

---

## 🔐 Security & Compliance

### SSL/TLS Configuration

#### Certificate Management
```yaml
# cert-manager ClusterIssuer
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@skyn3t.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
    - dns01:
        route53:
          region: us-east-1
          accessKeyID: AKIA...
          secretAccessKeySecretRef:
            name: route53-credentials
            key: secret-access-key
```

### Secret Management

#### External Secrets Operator
```yaml
# external-secrets/secret-store.yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets-manager
  namespace: production
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets-sa

---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: skyn3t-secrets
  namespace: production
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: skyn3t-secrets
    creationPolicy: Owner
  data:
  - secretKey: database-password
    remoteRef:
      key: skyn3t/production/database
      property: password
  - secretKey: jwt-secret
    remoteRef:
      key: skyn3t/production/jwt
      property: secret
```

### Network Policies

#### Kubernetes Network Policies
```yaml
# Network policy for API pods
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: skyn3t-api-netpol
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: skyn3t
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: nginx-ingress
    - namespaceSelector:
        matchLabels:
          name: istio-system
    ports:
    - protocol: TCP
      port: 8000
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgresql
    ports:
    - protocol: TCP
      port: 5432
  - to:
    - podSelector:
        matchLabels:
          app: redis
    ports:
    - protocol: TCP
      port: 6379
  - to: []
    ports:
    - protocol: TCP
      port: 443
    - protocol: TCP
      port: 80
```

---

## 🔄 Backup & Disaster Recovery

### Database Backup Strategy

#### Automated PostgreSQL Backups
```bash
#!/bin/bash
# scripts/backup-production-db.sh

set -e

# Configuration
DB_HOST="skyn3t-production.cluster-xxx.us-east-1.rds.amazonaws.com"
DB_NAME="skyn3t_production"
DB_USER="postgres"
BACKUP_BUCKET="skyn3t-backups"
RETENTION_DAYS=30

# Generate backup filename
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="skyn3t_production_${TIMESTAMP}.sql"

echo "Starting backup of ${DB_NAME}..."

# Create backup
pg_dump -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} \
  --verbose \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file=${BACKUP_FILE}

# Compress backup
gzip ${BACKUP_FILE}
COMPRESSED_FILE="${BACKUP_FILE}.gz"

# Upload to S3
aws s3 cp ${COMPRESSED_FILE} s3://${BACKUP_BUCKET}/postgresql/production/

# Verify upload
if aws s3api head-object --bucket ${BACKUP_BUCKET} --key postgresql/production/${COMPRESSED_FILE} > /dev/null 2>&1; then
  echo "Backup uploaded successfully"
  rm ${COMPRESSED_FILE}
else
  echo "Backup upload failed"
  exit 1
fi

# Cleanup old backups
aws s3api list-objects --bucket ${BACKUP_BUCKET} --prefix postgresql/production/ \
  --query "Contents[?LastModified<='$(date -d "${RETENTION_DAYS} days ago" --iso-8601)'].Key" \
  --output text | xargs -I {} aws s3 rm s3://${BACKUP_BUCKET}/{}

echo "Backup completed: ${COMPRESSED_FILE}"
```

#### Point-in-Time Recovery
```bash
#!/bin/bash
# scripts/restore-production-db.sh

RESTORE_POINT="2024-01-01 12:00:00"
BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file>"
  exit 1
fi

# Download backup from S3
aws s3 cp s3://skyn3t-backups/postgresql/production/${BACKUP_FILE} ./

# Extract backup
gunzip ${BACKUP_FILE}
EXTRACTED_FILE=${BACKUP_FILE%.gz}

# Restore database
pg_restore -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} \
  --verbose \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  ${EXTRACTED_FILE}

echo "Database restored from ${BACKUP_FILE}"
```

### Application State Backup

#### Kubernetes Resources Backup
```bash
#!/bin/bash
# scripts/backup-k8s-resources.sh

NAMESPACE="production"
BACKUP_DIR="k8s-backups/$(date +%Y%m%d_%H%M%S)"

mkdir -p ${BACKUP_DIR}

# Backup deployments
kubectl get deployments -n ${NAMESPACE} -o yaml > ${BACKUP_DIR}/deployments.yaml

# Backup services
kubectl get services -n ${NAMESPACE} -o yaml > ${BACKUP_DIR}/services.yaml

# Backup configmaps
kubectl get configmaps -n ${NAMESPACE} -o yaml > ${BACKUP_DIR}/configmaps.yaml

# Backup ingresses
kubectl get ingresses -n ${NAMESPACE} -o yaml > ${BACKUP_DIR}/ingresses.yaml

# Backup secrets (names only, not values)
kubectl get secrets -n ${NAMESPACE} --no-headers | awk '{print $1}' > ${BACKUP_DIR}/secrets-list.txt

# Create tar archive
tar -czf k8s-backup-$(date +%Y%m%d_%H%M%S).tar.gz ${BACKUP_DIR}

# Upload to S3
aws s3 cp k8s-backup-*.tar.gz s3://skyn3t-backups/kubernetes/

echo "Kubernetes resources backed up"
```

### Disaster Recovery Plan

#### RTO/RPO Targets
```yaml
Recovery Objectives:
  RTO (Recovery Time Objective): 4 hours
  RPO (Recovery Point Objective): 15 minutes
  
Scenarios:
  Database Failure:
    - Primary: Automatic failover to read replica
    - RTO: 5 minutes
    - RPO: < 1 minute
  
  Region Failure:
    - Manual failover to secondary region
    - RTO: 2 hours
    - RPO: 15 minutes
  
  Complete Infrastructure Loss:
    - Rebuild from backups
    - RTO: 4 hours
    - RPO: 1 hour
```

#### DR Runbook
```markdown
# Disaster Recovery Runbook

## 1. Assessment Phase (15 minutes)
- [ ] Identify scope of outage
- [ ] Notify incident response team
- [ ] Document start time and initial assessment

## 2. Database Recovery (30 minutes)
- [ ] Check RDS failover status
- [ ] Verify read replica promotion
- [ ] Test database connectivity
- [ ] Validate data integrity

## 3. Application Recovery (45 minutes)
- [ ] Deploy to DR region (if needed)
- [ ] Update DNS records
- [ ] Verify application startup
- [ ] Run health checks

## 4. Verification Phase (30 minutes)
- [ ] End-to-end functionality test
- [ ] Performance validation
- [ ] Monitor error rates
- [ ] User acceptance testing

## 5. Communication (Ongoing)
- [ ] Update status page
- [ ] Notify stakeholders
- [ ] Document lessons learned
- [ ] Schedule post-mortem
```

---

## 🧪 Testing in Production

### Smoke Tests

#### Post-Deployment Validation
```bash
#!/bin/bash
# scripts/production-health-check.sh

API_URL="https://api.skyn3t.com"
TIMEOUT=30

echo "Running production health checks..."

# Basic health check
echo "1. Checking API health..."
HEALTH_RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null --max-time ${TIMEOUT} ${API_URL}/health)
if [ "$HEALTH_RESPONSE" != "200" ]; then
  echo "❌ Health check failed (HTTP ${HEALTH_RESPONSE})"
  exit 1
fi
echo "✅ API health check passed"

# Database connectivity
echo "2. Checking database connectivity..."
DB_RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null --max-time ${TIMEOUT} ${API_URL}/health/db)
if [ "$DB_RESPONSE" != "200" ]; then
  echo "❌ Database check failed (HTTP ${DB_RESPONSE})"
  exit 1
fi
echo "✅ Database connectivity check passed"

# Cache connectivity
echo "3. Checking cache connectivity..."
CACHE_RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null --max-time ${TIMEOUT} ${API_URL}/health/cache)
if [ "$CACHE_RESPONSE" != "200" ]; then
  echo "❌ Cache check failed (HTTP ${CACHE_RESPONSE})"
  exit 1
fi
echo "✅ Cache connectivity check passed"

# Authentication flow
echo "4. Testing authentication..."
AUTH_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"healthcheck","password":"'"${HEALTHCHECK_PASSWORD}"'"}' \
  --max-time ${TIMEOUT} \
  ${API_URL}/api/v1/auth/login)

if ! echo "$AUTH_RESPONSE" | grep -q "access_token"; then
  echo "❌ Authentication test failed"
  exit 1
fi
echo "✅ Authentication test passed"

# WebSocket connectivity
echo "5. Testing WebSocket..."
# Add WebSocket test here

echo "🎉 All health checks passed!"
```

### Load Testing

#### Production Load Test
```bash
#!/bin/bash
# scripts/load-test.sh

API_URL="$1"
DURATION="5m"
VUS=100

if [ -z "$API_URL" ]; then
  echo "Usage: $0 <api_url>"
  exit 1
fi

echo "Running load test against ${API_URL}..."

k6 run --duration ${DURATION} --vus ${VUS} - <<EOF
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '1m', target: 20 },
    { duration: '3m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.1'],
  },
};

export default function() {
  // Test login endpoint
  let loginResponse = http.post('${API_URL}/api/v1/auth/login', JSON.stringify({
    username: 'loadtest@example.com',
    password: 'loadtest123'
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  check(loginResponse, {
    'login status is 200': (r) => r.status === 200,
    'login has token': (r) => r.json('data.access_token') !== '',
  });
  
  if (loginResponse.status === 200) {
    let token = loginResponse.json('data.access_token');
    
    // Test protected endpoint
    let usersResponse = http.get('${API_URL}/api/v1/users', {
      headers: { 'Authorization': \`Bearer \${token}\` },
    });
    
    check(usersResponse, {
      'users status is 200': (r) => r.status === 200,
    });
  }
  
  sleep(1);
}
EOF

echo "Load test completed"
```

---

## 📞 Operations & Maintenance

### Maintenance Windows

#### Scheduled Maintenance
```bash
#!/bin/bash
# scripts/maintenance-mode.sh

MODE="$1"  # enable|disable
MAINTENANCE_PAGE="maintenance.html"

case "$MODE" in
  enable)
    echo "Enabling maintenance mode..."
    
    # Scale down application
    kubectl scale deployment skyn3t --replicas=0 -n production
    
    # Deploy maintenance page
    kubectl create configmap maintenance-page \
      --from-file=${MAINTENANCE_PAGE} \
      -n production
    
    kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: maintenance-page
  namespace: production
spec:
  replicas: 2
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
        - name: maintenance-page
          mountPath: /usr/share/nginx/html
        resources:
          requests:
            memory: "64Mi"
            cpu: "50m"
          limits:
            memory: "128Mi"
            cpu: "100m"
      volumes:
      - name: maintenance-page
        configMap:
          name: maintenance-page
---
apiVersion: v1
kind: Service
metadata:
  name: maintenance-page
  namespace: production
spec:
  selector:
    app: maintenance-page
  ports:
  - port: 80
    targetPort: 80
EOF
    
    # Update ingress to point to maintenance page
    kubectl patch ingress skyn3t-ingress -n production --type='json' \
      -p='[{"op": "replace", "path": "/spec/rules/0/http/paths/0/backend/service/name", "value": "maintenance-page"}]'
    
    echo "✅ Maintenance mode enabled"
    ;;
    
  disable)
    echo "Disabling maintenance mode..."
    
    # Scale up application
    kubectl scale deployment skyn3t --replicas=5 -n production
    
    # Wait for pods to be ready
    kubectl wait --for=condition=ready pod -l app=skyn3t -n production --timeout=300s
    
    # Restore ingress
    kubectl patch ingress skyn3t-ingress -n production --type='json' \
      -p='[{"op": "replace", "path": "/spec/rules/0/http/paths/0/backend/service/name", "value": "skyn3t"}]'
    
    # Clean up maintenance resources
    kubectl delete deployment maintenance-page -n production
    kubectl delete service maintenance-page -n production
    kubectl delete configmap maintenance-page -n production
    
    echo "✅ Maintenance mode disabled"
    ;;
    
  *)
    echo "Usage: $0 {enable|disable}"
    exit 1
    ;;
esac
```

### Database Maintenance

#### PostgreSQL Maintenance Tasks
```bash
#!/bin/bash
# scripts/db-maintenance.sh

DB_HOST="skyn3t-production.cluster-xxx.us-east-1.rds.amazonaws.com"
DB_NAME="skyn3t_production"
DB_USER="postgres"

echo "Starting database maintenance..."

# Analyze tables
echo "1. Analyzing tables..."
psql -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} -c "
  SELECT schemaname, tablename 
  FROM pg_tables 
  WHERE schemaname = 'public'
" | tail -n +3 | while read schema table; do
  if [ ! -z "$table" ]; then
    echo "Analyzing ${schema}.${table}..."
    psql -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} -c "ANALYZE ${schema}.${table};"
  fi
done

# Vacuum tables (excluding large log tables during business hours)
echo "2. Vacuuming tables..."
HOUR=$(date +%H)
if [ $HOUR -ge 2 ] && [ $HOUR -le 6 ]; then
  # Full vacuum during maintenance window
  psql -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} -c "VACUUM VERBOSE;"
else
  # Light vacuum during business hours
  psql -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} -c "VACUUM (VERBOSE, ANALYZE);"
fi

# Update statistics
echo "3. Updating statistics..."
psql -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} -c "
  SELECT pg_stat_reset();
  SELECT pg_stat_reset_shared('bgwriter');
"

# Check for long-running queries
echo "4. Checking for long-running queries..."
psql -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} -c "
  SELECT pid, now() - pg_stat_activity.query_start AS duration, query 
  FROM pg_stat_activity 
  WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
    AND state = 'active';
"

echo "Database maintenance completed"
```

### Certificate Renewal

#### Automated SSL Certificate Renewal
```bash
#!/bin/bash
# scripts/renew-certificates.sh

NAMESPACE="production"

echo "Checking certificate status..."

# Check certificate expiration
kubectl get certificates -n ${NAMESPACE} -o json | jq -r '.items[] | select(.status.conditions[]?.type == "Ready") | "\(.metadata.name): \(.status.notAfter)"'

# Force renewal if needed
CERT_NAME="skyn3t-tls"
DAYS_UNTIL_EXPIRY=$(kubectl get certificate ${CERT_NAME} -n ${NAMESPACE} -o jsonpath='{.status.notAfter}' | xargs -I {} date -d {} +%s)
CURRENT_DATE=$(date +%s)
DAYS_LEFT=$(( (DAYS_UNTIL_EXPIRY - CURRENT_DATE) / 86400 ))

if [ $DAYS_LEFT -lt 30 ]; then
  echo "Certificate expires in ${DAYS_LEFT} days, forcing renewal..."
  
  # Delete and recreate certificate to force renewal
  kubectl delete certificate ${CERT_NAME} -n ${NAMESPACE}
  
  # Wait and check if cert-manager recreates it
  sleep 30
  kubectl get certificate ${CERT_NAME} -n ${NAMESPACE}
  
  echo "Certificate renewal initiated"
else
  echo "Certificate is valid for ${DAYS_LEFT} more days"
fi
```

---

## 🔧 Troubleshooting

### Common Issues

#### Application Won't Start
```bash
# Check pod status
kubectl get pods -n production -l app=skyn3t

# Check pod logs
kubectl logs -n production deployment/skyn3t --tail=50

# Check events
kubectl get events -n production --sort-by='.lastTimestamp'

# Check resource constraints
kubectl describe pods -n production -l app=skyn3t
```

#### Database Connection Issues
```bash
# Test database connectivity
kubectl run -it --rm debug --image=postgres:15 --restart=Never -- \
  psql -h skyn3t-production.cluster-xxx.us-east-1.rds.amazonaws.com \
       -U postgres \
       -d skyn3t_production \
       -c "SELECT 1;"

# Check database metrics
aws rds describe-db-instances --db-instance-identifier skyn3t-production

# Check connection pool
kubectl exec -it deployment/skyn3t -n production -- \
  curl localhost:8000/metrics | grep db_connections
```

#### High Memory Usage
```bash
# Check memory usage by pod
kubectl top pods -n production

# Check memory limits
kubectl describe deployment skyn3t -n production | grep -A 5 -B 5 memory

# Analyze heap dump (if Node.js)
kubectl exec -it deployment/skyn3t -n production -- \
  node --inspect --max-old-space-size=4096
```

### Performance Issues

#### Slow API Responses
```bash
# Check response times in Grafana
# URL: https://grafana.skyn3t.com/d/api-performance

# Check database slow queries
kubectl run -it --rm debug --image=postgres:15 --restart=Never -- \
  psql -h skyn3t-production.cluster-xxx.us-east-1.rds.amazonaws.com \
       -U postgres \
       -d skyn3t_production \
       -c "SELECT query, mean_time, calls FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"

# Check Redis performance
kubectl exec -it deployment/skyn3t -n production -- \
  redis-cli --latency-history
```

### Emergency Procedures

#### Emergency Rollback
```bash
#!/bin/bash
# scripts/emergency-rollback.sh

PREVIOUS_VERSION="$1"

if [ -z "$PREVIOUS_VERSION" ]; then
  echo "Usage: $0 <previous_version>"
  echo "Available versions:"
  helm history skyn3t -n production
  exit 1
fi

echo "⚠️  EMERGENCY ROLLBACK INITIATED"
echo "Rolling back to version: ${PREVIOUS_VERSION}"

# Rollback using Helm
helm rollback skyn3t ${PREVIOUS_VERSION} -n production --wait --timeout=10m

# Verify rollback
kubectl wait --for=condition=ready pod -l app=skyn3t -n production --timeout=300s

# Run health check
./scripts/production-health-check.sh

echo "✅ Emergency rollback completed"
echo "🔍 Please investigate the issue and update monitoring"
```

#### Scale for Emergency Traffic
```bash
#!/bin/bash
# scripts/emergency-scale.sh

REPLICAS="$1"

if [ -z "$REPLICAS" ]; then
  echo "Usage: $0 <number_of_replicas>"
  exit 1
fi

echo "🚨 EMERGENCY SCALING TO ${REPLICAS} REPLICAS"

# Scale deployment
kubectl scale deployment skyn3t --replicas=${REPLICAS} -n production

# Wait for pods to be ready
kubectl wait --for=condition=ready pod -l app=skyn3t -n production --timeout=600s

# Check status
kubectl get pods -n production -l app=skyn3t

echo "✅ Emergency scaling completed"
```

---

**Deployment Guide Version**: 2.5.0  
**Last Updated**: 2025-06-23  
**Next Review**: 2024-04-01  
**Emergency Contact**: devops@skyn3t.com