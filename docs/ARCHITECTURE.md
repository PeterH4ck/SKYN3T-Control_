# 🏗️ ARCHITECTURE DOCUMENTATION - SKYN3T ACCESS CONTROL

![Architecture Status](https://img.shields.io/badge/Architecture-Production%20Ready-brightgreen.svg)
![Microservices](https://img.shields.io/badge/Microservices-8%20Services-blue.svg)
![Scale](https://img.shields.io/badge/Scale-Multi--tenant-orange.svg)
![ML/AI](https://img.shields.io/badge/ML%2FAI-Enabled-purple.svg)

## 📋 Visión General

SKYN3T Access Control implementa una **arquitectura de microservicios distribuida híbrida** diseñada para escalar horizontalmente con capacidades de Machine Learning, procesamiento de imágenes OCR, y comunicación IoT en tiempo real. La plataforma soporta múltiples comunidades con aislamiento completo de datos y configuraciones personalizables.

### Principios Arquitectónicos Fundamentales

- **🔧 Microservices-First**: Servicios independientes con responsabilidades específicas
- **🏢 Multi-tenant by Design**: Aislamiento por comunidades con configuraciones independientes
- **📡 Event-Driven Architecture**: Comunicación asíncrona mediante eventos y mensajería
- **🔌 API-First Development**: Diseño orientado a APIs RESTful con OpenAPI 3.1
- **🚀 Cloud-Native Ready**: Contenedorización y orquestación con Kubernetes
- **🔐 Security-by-Design**: Seguridad integrada en cada capa de la aplicación
- **📊 Observability-Driven**: Monitoreo, logging, métricas y tracing distribuido
- **🤖 AI/ML Integration**: Machine Learning integrado para análisis predictivo
- **⚡ Real-time Capabilities**: WebSocket y MQTT para comunicación instantánea

---

## 🏛️ Arquitectura de Alto Nivel

```mermaid
graph TB
    subgraph "Client Layer"
        WEB[Web Application]
        MOBILE[Mobile Apps]
        IOT[IoT Devices]
        ADMIN[Admin Panel]
    end
    
    subgraph "Edge & Security Layer"
        CF[CloudFront CDN]
        WAF[Web Application Firewall]
        LB[Application Load Balancer]
        VPN[VPN Gateway]
    end
    
    subgraph "API Gateway Layer"
        NGINX[Nginx Reverse Proxy]
        KONG[Kong API Gateway]
        ISTIO[Istio Service Mesh]
    end
    
    subgraph "Authentication Layer"
        AUTH[Auth Service]
        PERM[Permission Service]
        VAULT[HashiCorp Vault]
    end
    
    subgraph "Core Business Services"
        USER[User Service]
        COMM[Community Service]
        DEV[Device Service]
        ACCESS[Access Control]
    end
    
    subgraph "Financial Services"
        PAY[Payment Service]
        BILLING[Billing Service]
        BANK[Banking Adapters]
    end
    
    subgraph "Communication Services"
        NOTIF[Notification Service]
        EMAIL[Email Service]
        SMS[SMS Gateway]
        PUSH[Push Notifications]
    end
    
    subgraph "Intelligence Services"
        ANALYTICS[Analytics Service]
        OCR[OCR Service]
        ML[ML Service]
        SCHEDULER[Scheduler Service]
    end
    
    subgraph "Data Layer"
        PG_CLUSTER[PostgreSQL Cluster]
        PG_M[Master DB]
        PG_R1[Read Replica 1]
        PG_R2[Read Replica 2]
        
        REDIS_CLUSTER[Redis Cluster]
        REDIS_M1[Redis Master 1]
        REDIS_M2[Redis Master 2]
        REDIS_M3[Redis Master 3]
        
        INFLUX[InfluxDB Cluster]
        ELASTIC[Elasticsearch]
    end
    
    subgraph "Message & Event Layer"
        RABBIT[RabbitMQ Cluster]
        MQTT[MQTT Broker]
        KAFKA[Apache Kafka]
    end
    
    subgraph "Storage Layer"
        MINIO[MinIO Object Storage]
        S3[AWS S3 Backup]
        NFS[Network File System]
    end
    
    subgraph "Monitoring & Observability"
        PROM[Prometheus]
        GRAFANA[Grafana]
        JAEGER[Jaeger Tracing]
        KIBANA[Kibana]
        ALERT[AlertManager]
    end
    
    subgraph "External Integrations"
        BANKS[Banking APIs]
        TWILIO[Twilio SMS]
        FCM[Firebase FCM]
        SMTP[SMTP Providers]
    end
    
    %% Client connections
    WEB --> CF
    MOBILE --> CF
    IOT --> MQTT
    ADMIN --> CF
    
    %% Security and routing
    CF --> WAF
    WAF --> LB
    LB --> NGINX
    NGINX --> KONG
    KONG --> ISTIO
    
    %% Service mesh routing
    ISTIO --> AUTH
    ISTIO --> USER
    ISTIO --> DEV
    ISTIO --> PAY
    ISTIO --> NOTIF
    ISTIO --> ANALYTICS
    ISTIO --> OCR
    
    %% Authentication flow
    AUTH --> VAULT
    AUTH --> PERM
    
    %% Data connections
    USER --> PG_M
    AUTH --> REDIS_M1
    DEV --> INFLUX
    ANALYTICS --> ELASTIC
    
    %% Message routing
    RABBIT --> AUTH
    RABBIT --> USER
    RABBIT --> NOTIF
    KAFKA --> ANALYTICS
    MQTT --> DEV
    
    %% Storage connections
    MINIO --> OCR
    MINIO --> USER
    S3 --> MINIO
    
    %% External integrations
    PAY --> BANKS
    NOTIF --> TWILIO
    NOTIF --> FCM
    NOTIF --> SMTP
    
    %% Monitoring
    PROM --> GRAFANA
    JAEGER --> GRAFANA
    ELASTIC --> KIBANA
```

---

## 🎯 Arquitectura de Microservicios Detallada

### 1. 🔐 Auth Service (Node.js/TypeScript)
**Puerto**: 3001 | **Base Path**: `/auth`

#### Responsabilidades Principales
- **Autenticación Multi-Factor**: JWT + TOTP/SMS/Email
- **Gestión de Sesiones**: Sesiones distribuidas con Redis
- **OAuth 2.0/OIDC**: Integración con proveedores externos
- **Políticas de Contraseñas**: Validación y rotación automática
- **Audit Logging**: Registro detallado de eventos de seguridad

#### Stack Tecnológico
```yaml
Runtime: Node.js 20.x LTS
Framework: Express.js + TypeScript
Authentication: JWT + Passport.js
2FA: Speakeasy (TOTP) + Twilio (SMS)
Session Storage: Redis Cluster
Rate Limiting: express-rate-limit + Redis
Security: helmet, cors, bcrypt, argon2
Monitoring: Prometheus metrics
```

#### Patrones Implementados
- **JWT with Refresh Tokens**: Tokens de acceso cortos + refresh de larga duración
- **Circuit Breaker**: Para servicios externos (SMS, Email)
- **Rate Limiting**: Por IP, usuario y endpoint
- **Audit Trail**: Todos los eventos de autenticación registrados

```typescript
// Ejemplo de arquitectura interna
interface AuthService {
  // Core authentication
  authenticate(credentials: LoginCredentials): Promise<AuthResult>;
  refresh(refreshToken: string): Promise<AccessToken>;
  logout(sessionId: string): Promise<void>;
  
  // Multi-factor authentication
  setup2FA(userId: string): Promise<TwoFactorSetup>;
  verify2FA(userId: string, code: string): Promise<boolean>;
  
  // Session management
  validateSession(token: string): Promise<Session>;
  revokeSession(sessionId: string): Promise<void>;
  listActiveSessions(userId: string): Promise<Session[]>;
}
```

### 2. 👥 User Service (Node.js/TypeScript)
**Puerto**: 3003 | **Base Path**: `/users`

#### Responsabilidades Principales
- **Gestión CRUD**: Usuarios completos con metadatos
- **Perfiles Avanzados**: Avatares, preferencias, configuraciones
- **Relaciones Familiares**: Vínculos entre usuarios
- **Importación Masiva**: CSV/Excel con validaciones
- **Integración LDAP/AD**: Sincronización empresarial

#### Arquitectura de Datos
```yaml
Primary Storage: PostgreSQL (ACID compliance)
Cache Layer: Redis (user sessions, frequently accessed data)
File Storage: MinIO (avatars, documents)
Search Engine: Elasticsearch (advanced user search)
```

#### Modelo de Datos
```sql
-- Core user table with Row Level Security
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    phone_verified BOOLEAN DEFAULT FALSE,
    document_type VARCHAR(20),
    document_number VARCHAR(50),
    birth_date DATE,
    gender VARCHAR(20),
    status user_status DEFAULT 'active',
    avatar_url TEXT,
    preferences JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

-- Row Level Security for multi-tenancy
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_isolation ON users
    FOR ALL TO application_role
    USING (
        id = current_setting('app.current_user_id')::UUID OR
        EXISTS (
            SELECT 1 FROM user_communities uc 
            WHERE uc.user_id = users.id 
            AND uc.community_id = current_setting('app.current_community_id')::UUID
        )
    );
```

### 3. 🔑 Permission Service (Node.js/TypeScript)
**Puerto**: 3002 | **Base Path**: `/permissions`

#### Motor de Permisos Granulares
- **RBAC + ABAC Híbrido**: Role-Based + Attribute-Based Access Control
- **Jerarquía de Roles**: 11 niveles con herencia automática
- **Permisos Temporales**: Con expiración automática
- **Cache Distribuido**: Permisos en Redis para performance
- **Propagación en Tiempo Real**: Cambios instantáneos vía eventos

#### Estructura de Permisos
```typescript
interface Permission {
  code: string; // "module.resource.action" (e.g., "access.doors.open")
  module: string; // Módulo del sistema
  resource: string; // Recurso específico
  action: string; // Acción permitida
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  conditions?: PermissionConditions;
  ui_elements?: string[]; // Elementos UI habilitados
  api_endpoints?: string[]; // Endpoints API permitidos
}

interface PermissionConditions {
  time_restrictions?: TimeRestriction;
  location_restrictions?: string[];
  device_restrictions?: string[];
  amount_limits?: number;
  approval_required?: boolean;
  audit_required?: boolean;
}

interface RoleHierarchy {
  level: number; // 1-11 (1 = highest authority)
  code: string;
  name: string;
  inherits_from?: string[];
  default_permissions: string[];
  max_permission_level: 'low' | 'medium' | 'high' | 'critical';
}
```

#### Motor de Evaluación de Permisos
```typescript
class PermissionEngine {
  async evaluatePermission(
    userId: string,
    permissionCode: string,
    context: EvaluationContext
  ): Promise<PermissionEvaluation> {
    // 1. Obtener permisos efectivos del usuario
    const userPermissions = await this.getUserEffectivePermissions(userId, context.communityId);
    
    // 2. Verificar permiso directo
    const directPermission = userPermissions.direct.find(p => p.code === permissionCode);
    
    // 3. Verificar permisos heredados por rol
    const inheritedPermission = this.checkInheritedPermissions(
      userPermissions.roles, 
      permissionCode
    );
    
    // 4. Evaluar condiciones contextuales
    const contextualCheck = await this.evaluateConditions(
      directPermission || inheritedPermission,
      context
    );
    
    // 5. Verificar restricciones temporales
    const temporalCheck = this.checkTemporalRestrictions(
      directPermission || inheritedPermission,
      context.timestamp
    );
    
    return {
      granted: contextualCheck && temporalCheck,
      source: directPermission ? 'direct' : 'inherited',
      conditions_met: contextualCheck,
      temporal_valid: temporalCheck,
      expires_at: directPermission?.expires_at,
      audit_required: directPermission?.conditions?.audit_required
    };
  }
}
```

### 4. 🔌 Device Service (Node.js/TypeScript)
**Puerto**: 3004 | **Base Path**: `/devices`

#### Control IoT Avanzado
- **Comunicación MQTT**: Bidireccional con QoS garantizado
- **Cola de Comandos**: Priorizada con retry automático
- **Monitoreo en Tiempo Real**: Métricas de performance
- **Firmware Updates**: OTA (Over-The-Air) updates
- **Protocolos Múltiples**: MQTT, HTTP/REST, Modbus, Wiegand

#### Arquitectura IoT
```yaml
Message Broker: MQTT (Eclipse Mosquitto)
Command Queue: Redis Lists con prioridades
Time Series DB: InfluxDB para métricas
Real-time Updates: WebSocket para clientes
Device Registry: PostgreSQL con estado
File Storage: MinIO para firmware updates
```

#### Manejo de Dispositivos
```typescript
interface Device {
  id: string;
  serial_number: string;
  type: DeviceType;
  capabilities: DeviceCapability[];
  network_config: NetworkConfig;
  status: DeviceStatus;
  metrics: DeviceMetrics;
  firmware: FirmwareInfo;
  maintenance: MaintenanceInfo;
}

class DeviceController {
  async sendCommand(
    deviceId: string, 
    command: DeviceCommand,
    options: CommandOptions = {}
  ): Promise<CommandResult> {
    // 1. Validar dispositivo y comando
    const device = await this.deviceRegistry.get(deviceId);
    this.validateCommand(device, command);
    
    // 2. Encolar comando con prioridad
    const commandId = await this.commandQueue.enqueue({
      id: uuid(),
      device_id: deviceId,
      command: command.type,
      parameters: command.parameters,
      priority: options.priority || 3,
      timeout: options.timeout || 30,
      retry_attempts: options.retryAttempts || 3,
      created_at: new Date()
    });
    
    // 3. Publicar vía MQTT
    await this.mqttClient.publish(
      `devices/${deviceId}/commands`,
      JSON.stringify({ command_id: commandId, ...command }),
      { qos: 2, retain: false }
    );
    
    // 4. Configurar timeout y callback
    this.setupCommandTimeout(commandId, options.timeout);
    
    return {
      command_id: commandId,
      status: 'queued',
      estimated_execution: this.estimateExecutionTime(deviceId)
    };
  }
}
```

### 5. 💰 Payment Service (Node.js/TypeScript)
**Puerto**: 3005 | **Base Path**: `/payments`

#### Procesamiento de Pagos Multi-Canal
- **Bancos Chilenos**: Banco Estado, Santander, BCI, Banco de Chile
- **Pasarelas Internacionales**: PayPal, Stripe, MercadoPago
- **Conciliación Automática**: Matching de transacciones
- **Webhooks**: Notificaciones en tiempo real
- **Compliance**: PCI DSS y normativas locales

#### Arquitectura de Pagos
```typescript
interface PaymentProcessor {
  // Core payment processing
  processPayment(request: PaymentRequest): Promise<PaymentResult>;
  refundPayment(transactionId: string, amount?: number): Promise<RefundResult>;
  
  // Multi-bank integration
  getBankMethods(country: string): Promise<BankMethod[]>;
  initiateTransfer(bankTransfer: BankTransferRequest): Promise<TransferResult>;
  
  // Reconciliation
  reconcileTransactions(date: Date): Promise<ReconciliationReport>;
  matchStatements(bankStatements: BankStatement[]): Promise<MatchingResult>;
}

// Adapter pattern for different payment providers
abstract class PaymentAdapter {
  abstract processPayment(request: PaymentRequest): Promise<PaymentResult>;
  abstract handleWebhook(payload: any): Promise<WebhookResult>;
  abstract getTransactionStatus(transactionId: string): Promise<TransactionStatus>;
}

class BancoEstadoAdapter extends PaymentAdapter {
  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    // Banco Estado specific implementation
    const apiResponse = await this.bancoEstadoApi.transfer({
      amount: request.amount,
      source_account: request.source_account,
      destination_account: request.destination_account,
      reference: request.reference
    });
    
    return this.mapResponse(apiResponse);
  }
}
```

### 6. 📧 Notification Service (Node.js/TypeScript)
**Puerto**: 3006 | **Base Path**: `/notifications`

#### Comunicación Omnicanal
- **Email**: SMTP con plantillas dinámicas y seguimiento
- **SMS**: Twilio con soporte internacional
- **WhatsApp Business**: Mensajes rich media
- **Push Notifications**: Firebase FCM + APNs
- **In-App**: Notificaciones en tiempo real vía WebSocket

#### Sistema de Plantillas
```typescript
interface NotificationTemplate {
  id: string;
  name: string;
  channels: NotificationChannel[];
  variables: TemplateVariable[];
  localization: Record<string, LocalizedTemplate>;
  scheduling: SchedulingOptions;
}

class NotificationOrchestrator {
  async sendNotification(request: NotificationRequest): Promise<NotificationResult> {
    const template = await this.templateService.get(request.template_id);
    const recipients = await this.resolveRecipients(request.recipients);
    
    const jobs = recipients.map(async (recipient) => {
      // Resolver preferencias del usuario
      const preferences = await this.getUserPreferences(recipient.user_id);
      
      // Determinar canales a usar
      const channels = this.selectChannels(
        request.channels,
        preferences,
        template.channels
      );
      
      // Enviar por cada canal
      return Promise.all(
        channels.map(channel => this.sendViaChannel(channel, recipient, template, request.data))
      );
    });
    
    const results = await Promise.allSettled(jobs);
    
    return {
      sent: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
      details: results
    };
  }
}
```

### 7. 📊 Analytics Service (Node.js/TypeScript)
**Puerto**: 3007 | **Base Path**: `/analytics`

#### Business Intelligence y Machine Learning
- **Real-time Analytics**: Dashboards en tiempo real
- **Predictive Analytics**: ML para predicciones de patrones
- **Anomaly Detection**: Detección automática de anomalías
- **Custom Reports**: Generación automática de reportes
- **Data Mining**: Extracción de insights de datos

#### Stack de ML/AI
```yaml
ML Framework: TensorFlow.js + Python bridge
Time Series: Prophet for forecasting
Anomaly Detection: Isolation Forest
Data Processing: Apache Spark (when needed)
Storage: InfluxDB + PostgreSQL + Elasticsearch
Visualization: Chart.js + D3.js
```

#### Servicios de Analytics
```typescript
class AnalyticsEngine {
  // Real-time metrics
  async getRealtimeMetrics(communityId: string): Promise<RealtimeMetrics> {
    const [accessMetrics, deviceMetrics, userMetrics] = await Promise.all([
      this.accessAnalytics.getRealtime(communityId),
      this.deviceAnalytics.getRealtime(communityId),
      this.userAnalytics.getRealtime(communityId)
    ]);
    
    return {
      access: accessMetrics,
      devices: deviceMetrics,
      users: userMetrics,
      timestamp: new Date()
    };
  }
  
  // Predictive analytics
  async predictAccessVolume(
    communityId: string, 
    forecastHours: number
  ): Promise<AccessForecast> {
    const historicalData = await this.getHistoricalAccessData(communityId, 30);
    const model = await this.loadTimeSeriesModel('access_volume');
    
    const prediction = await model.predict(historicalData, forecastHours);
    
    return {
      forecast: prediction.values,
      confidence_interval: prediction.confidence,
      model_accuracy: prediction.accuracy,
      factors: prediction.influencing_factors
    };
  }
  
  // Anomaly detection
  async detectAnomalies(
    communityId: string, 
    timeRange: TimeRange
  ): Promise<AnomalyReport> {
    const data = await this.getTimeSeriesData(communityId, timeRange);
    const anomalies = await this.anomalyDetector.detect(data);
    
    return {
      anomalies: anomalies.map(a => ({
        timestamp: a.timestamp,
        metric: a.metric,
        actual_value: a.actual,
        expected_value: a.expected,
        severity: a.severity,
        description: a.description
      })),
      summary: {
        total_anomalies: anomalies.length,
        by_severity: this.groupBySeverity(anomalies),
        affected_metrics: [...new Set(anomalies.map(a => a.metric))]
      }
    };
  }
}
```

### 8. 🔍 OCR Service (Python/FastAPI)
**Puerto**: 5000 | **Base Path**: `/ocr`

#### Reconocimiento Óptico Avanzado
- **Documentos Financieros**: Facturas, recibos, contratos
- **Patentes Vehiculares**: Reconocimiento específico para Chile
- **Documentos de Identidad**: RUT, cédulas, pasaportes
- **Procesamiento de Imágenes**: Mejora automática de calidad
- **ML Training**: Modelos personalizados por región

#### Stack OCR
```yaml
Runtime: Python 3.11
Framework: FastAPI + Uvicorn
OCR Engine: Tesseract 5.x + OpenCV
ML Framework: PyTorch + scikit-learn
Image Processing: Pillow + OpenCV
Document Processing: PyPDF2 + pdfplumber
Storage: MinIO for processed images
```

#### Procesamiento OCR
```python
class OCRProcessor:
    def __init__(self):
        self.tesseract = TesseractEngine()
        self.image_processor = ImageProcessor()
        self.ml_models = ModelLoader()
    
    async def process_receipt(
        self, 
        image_data: bytes, 
        enhance: bool = True
    ) -> ReceiptData:
        # 1. Mejorar calidad de imagen
        if enhance:
            image_data = await self.image_processor.enhance(image_data)
        
        # 2. Detectar regiones de texto
        text_regions = await self.detect_text_regions(image_data)
        
        # 3. Extraer texto con OCR
        raw_text = await self.tesseract.extract_text(
            image_data, 
            language='spa',
            config='--psm 6'
        )
        
        # 4. Procesar con ML para estructurar datos
        structured_data = await self.ml_models.receipt_parser.parse(
            raw_text, 
            text_regions
        )
        
        # 5. Validar datos extraídos
        validation_result = await self.validate_receipt_data(structured_data)
        
        return ReceiptData(
            raw_text=raw_text,
            structured_data=structured_data,
            confidence=validation_result.confidence,
            validation_errors=validation_result.errors,
            processing_time=validation_result.processing_time
        )
    
    async def process_license_plate(
        self, 
        image_data: bytes
    ) -> LicensePlateData:
        # Modelo específico para patentes chilenas
        plate_model = await self.ml_models.load('chilean_plates')
        
        # Detectar y reconocer patente
        detection = await plate_model.detect_and_recognize(image_data)
        
        return LicensePlateData(
            plate_text=detection.text,
            confidence=detection.confidence,
            format_valid=self.validate_chilean_plate_format(detection.text),
            coordinates=detection.bounding_box
        )
```

---

## 🗄️ Arquitectura de Datos Avanzada

### Estrategia Multi-tenant Evolucionada

#### Database-per-Tenant con Shared Infrastructure
```sql
-- Esquema de aislamiento mejorado
CREATE SCHEMA tenant_commons; -- Shared data (countries, currencies, etc.)
CREATE SCHEMA tenant_{{community_id}}; -- Per-tenant data

-- Row Level Security avanzado
CREATE POLICY advanced_tenant_isolation ON users
    FOR ALL TO application_role
    USING (
        -- Current user can see their own data
        id = current_setting('app.current_user_id')::UUID 
        OR
        -- Admin can see users in their communities
        EXISTS (
            SELECT 1 FROM user_communities uc
            JOIN user_roles ur ON ur.user_id = current_setting('app.current_user_id')::UUID
            WHERE uc.user_id = users.id
            AND uc.community_id = ur.community_id
            AND ur.role_code IN ('COMMUNITY_ADMIN', 'BUILDING_ADMIN')
        )
        OR
        -- System admin can see all (with audit)
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = current_setting('app.current_user_id')::UUID
            AND ur.role_code = 'SYSTEM_ADMIN'
        )
    );

-- Audit trigger for compliance
CREATE OR REPLACE FUNCTION audit_data_access()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_log (
        table_name,
        operation,
        user_id,
        community_id,
        old_values,
        new_values,
        timestamp,
        ip_address
    ) VALUES (
        TG_TABLE_NAME,
        TG_OP,
        current_setting('app.current_user_id')::UUID,
        current_setting('app.current_community_id')::UUID,
        row_to_json(OLD),
        row_to_json(NEW),
        NOW(),
        current_setting('app.client_ip')
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
```

### PostgreSQL Cluster con Alta Disponibilidad

#### Master-Replica Configuration con Failover Automático
```yaml
PostgreSQL Cluster:
  Primary (Master):
    Instance Type: r5.2xlarge
    Storage: 2TB gp3 SSD (20,000 IOPS)
    Connections: 500 max
    Extensions: 
      - uuid-ossp
      - pg_stat_statements
      - pg_trgm
      - postgis (for geo data)
    
  Read Replicas:
    Analytics Replica:
      Instance Type: r5.xlarge
      Purpose: Reporting and analytics
      Lag Tolerance: < 30 seconds
    
    Backup Replica:
      Instance Type: r5.large
      Purpose: Point-in-time recovery
      Cross-AZ: Yes
      
  Connection Pooling (PgBouncer):
    Pool Size: 100 connections per service
    Pool Mode: Transaction
    Max Client Connections: 2000
    
  Backup Strategy:
    Continuous WAL Archiving: S3
    Full Backups: Daily to S3
    Point-in-time Recovery: 35 days
    Cross-region Replication: Yes
```

#### Partitioning Strategy Avanzada
```sql
-- Particionado híbrido para logs de acceso
CREATE TABLE access_logs (
    id UUID DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL,
    access_time TIMESTAMP NOT NULL,
    user_id UUID,
    access_point_id UUID,
    granted BOOLEAN,
    method access_method,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
) PARTITION BY RANGE (access_time);

-- Auto-creación de particiones mensuales
CREATE OR REPLACE FUNCTION create_monthly_partition(table_name text, start_date date)
RETURNS void AS $$
DECLARE
    partition_name text;
    end_date date;
BEGIN
    partition_name := table_name || '_' || to_char(start_date, 'YYYY_MM');
    end_date := start_date + interval '1 month';
    
    EXECUTE format('CREATE TABLE %I PARTITION OF %I 
                    FOR VALUES FROM (%L) TO (%L)',
                   partition_name, table_name, start_date, end_date);
                   
    -- Crear índices en la partición
    EXECUTE format('CREATE INDEX %I ON %I (community_id, access_time)',
                   partition_name || '_community_time_idx', partition_name);
    EXECUTE format('CREATE INDEX %I ON %I (user_id, access_time)',
                   partition_name || '_user_time_idx', partition_name);
END;
$$ LANGUAGE plpgsql;

-- Job automático para crear particiones futuras
SELECT cron.schedule(
    'create-partitions',
    '0 0 25 * *', -- 25th of each month
    $$SELECT create_monthly_partition('access_logs', date_trunc('month', CURRENT_DATE + interval '1 month'));$$
);
```

### Redis Cluster Distribuido

#### Redis Cluster con Sentinel para Alta Disponibilidad
```yaml
Redis Cluster Architecture:
  Cluster Nodes: 6 (3 masters + 3 replicas)
  Node Configuration:
    Memory: 16GB per node
    Persistence: AOF + RDB
    Max Memory Policy: allkeys-lru
    
  Master Nodes:
    redis-master-1: Slots 0-5460 (Auth & Sessions)
    redis-master-2: Slots 5461-10922 (User Cache)
    redis-master-3: Slots 10923-16383 (Device State)
    
  Replica Configuration:
    Automatic Failover: Enabled
    Min Replicas to Write: 1
    Replica Priority: Auto-calculated
    
  Sentinel Configuration:
    Sentinel Nodes: 3
    Quorum: 2
    Down After: 30 seconds
    Failover Timeout: 180 seconds
```

#### Cache Patterns Avanzados
```typescript
class CacheManager {
  // Write-through pattern for critical data
  async writeThrough<T>(key: string, data: T, ttl: number = 300): Promise<void> {
    // 1. Write to database first
    await this.database.save(key, data);
    
    // 2. Write to cache
    await this.redis.setex(key, ttl, JSON.stringify(data));
    
    // 3. Invalidate related cache entries
    await this.invalidateRelated(key);
  }
  
  // Write-behind pattern for performance
  async writeBehind<T>(key: string, data: T, ttl: number = 300): Promise<void> {
    // 1. Write to cache immediately
    await this.redis.setex(key, ttl, JSON.stringify(data));
    
    // 2. Queue database write
    await this.writeQueue.add('db-write', { key, data }, {
      delay: 1000, // Write after 1 second
      attempts: 3,
      backoff: 'exponential'
    });
  }
  
  // Cache-aside with distributed locking
  async cacheAside<T>(
    key: string, 
    factory: () => Promise<T>,
    ttl: number = 300
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Distributed lock to prevent cache stampede
    const lockKey = `lock:${key}`;
    const lock = await this.redis.set(lockKey, '1', 'PX', 5000, 'NX');
    
    if (lock) {
      try {
        // Generate data
        const data = await factory();
        
        // Cache the result
        await this.redis.setex(key, ttl, JSON.stringify(data));
        
        return data;
      } finally {
        // Release lock
        await this.redis.del(lockKey);
      }
    } else {
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, 100));
      return this.cacheAside(key, factory, ttl);
    }
  }
}
```

### Time Series Database (InfluxDB)

#### Schema Optimizado para IoT
```sql
-- Métricas de dispositivos IoT
CREATE MEASUREMENT device_metrics (
  time TIMESTAMP,
  device_id TAG,
  community_id TAG,
  device_type TAG,
  location TAG,
  building_id TAG,
  
  -- Métricas de hardware
  cpu_usage FLOAT,
  memory_usage FLOAT,
  temperature FLOAT,
  disk_usage FLOAT,
  network_latency FLOAT,
  
  -- Métricas de aplicación
  commands_processed INT,
  errors_count INT,
  response_time_avg FLOAT,
  uptime_seconds INT
);

-- Retención policy automática
CREATE RETENTION POLICY "realtime" ON "skyn3t" 
  DURATION 7d REPLICATION 1 DEFAULT;

CREATE RETENTION POLICY "historical" ON "skyn3t" 
  DURATION 365d REPLICATION 1;

-- Continuous queries para agregaciones
CREATE CONTINUOUS QUERY "device_hourly_avg" ON "skyn3t"
BEGIN
  SELECT mean(cpu_usage) as cpu_avg,
         mean(memory_usage) as memory_avg,
         mean(temperature) as temp_avg,
         sum(commands_processed) as commands_total
  INTO "historical"."device_metrics_hourly"
  FROM "device_metrics"
  GROUP BY time(1h), device_id, community_id
END;
```

---

## 🔄 Comunicación Entre Servicios

### Event-Driven Architecture con Apache Kafka

#### Event Streaming Platform
```yaml
Kafka Cluster:
  Brokers: 3 (minimum for production)
  Replication Factor: 3
  Min In-Sync Replicas: 2
  Topics:
    - auth.events (24 partitions)
    - user.events (12 partitions)
    - device.events (24 partitions)
    - payment.events (12 partitions)
    - access.events (36 partitions)
    
Kafka Connect:
  Database Source: PostgreSQL -> Kafka
  Search Sink: Kafka -> Elasticsearch
  Analytics Sink: Kafka -> InfluxDB
  
Schema Registry:
  Avro Schemas: Versioned event schemas
  Evolution: Backward/Forward compatibility
```

#### Event Schema Design
```typescript
// Base event interface
interface BaseEvent {
  event_id: string;
  event_type: string;
  event_version: string;
  source_service: string;
  correlation_id: string;
  causation_id?: string;
  timestamp: Date;
  user_id?: string;
  community_id?: string;
  metadata: Record<string, any>;
}

// Domain-specific events
interface AccessGrantedEvent extends BaseEvent {
  event_type: 'access.granted';
  data: {
    access_point_id: string;
    access_point_name: string;
    user_id: string;
    method: 'card' | 'facial' | 'qr' | 'pin' | 'manual';
    confidence_score?: number;
    response_time_ms: number;
    photo_url?: string;
    vehicle_plate?: string;
  };
}

interface PaymentProcessedEvent extends BaseEvent {
  event_type: 'payment.processed';
  data: {
    transaction_id: string;
    amount: number;
    currency: string;
    payment_method: string;
    status: 'completed' | 'failed' | 'pending';
    bank_reference?: string;
    fees: number;
  };
}
```

#### Event Handling Patterns
```typescript
class EventProcessor {
  // Saga pattern for distributed transactions
  async processPaymentSaga(event: PaymentInitiatedEvent): Promise<void> {
    const saga = new PaymentSaga(event.correlation_id);
    
    try {
      // Step 1: Reserve funds
      await saga.execute('reserve_funds', event.data.amount);
      
      // Step 2: Process payment
      const paymentResult = await saga.execute('process_payment', event.data);
      
      // Step 3: Update account
      await saga.execute('update_account', paymentResult);
      
      // Step 4: Send notification
      await saga.execute('send_notification', {
        user_id: event.user_id,
        type: 'payment_success'
      });
      
      await saga.complete();
      
    } catch (error) {
      await saga.compensate();
      throw error;
    }
  }
  
  // CQRS pattern for read models
  async updateUserReadModel(event: UserUpdatedEvent): Promise<void> {
    const projection = {
      user_id: event.data.user_id,
      full_name: `${event.data.first_name} ${event.data.last_name}`,
      email: event.data.email,
      communities: await this.getUserCommunities(event.data.user_id),
      permissions: await this.getUserPermissions(event.data.user_id),
      last_updated: event.timestamp
    };
    
    await this.userReadModelStore.upsert(projection);
    
    // Update search index
    await this.searchService.indexUser(projection);
  }
}
```

### Service Mesh con Istio

#### Istio Configuration
```yaml
# Service Mesh configuration
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
metadata:
  name: skyn3t-control-plane
spec:
  components:
    pilot:
      k8s:
        resources:
          requests:
            cpu: 500m
            memory: 2048Mi
    
    ingressGateways:
    - name: istio-ingressgateway
      enabled: true
      k8s:
        service:
          type: LoadBalancer
          ports:
          - port: 80
            targetPort: 8080
            name: http2
          - port: 443
            targetPort: 8443
            name: https
  
  values:
    global:
      meshID: skyn3t-mesh
      network: skyn3t-network
    
    # mTLS configuration
    security:
      mtls:
        mode: STRICT
```

#### Traffic Management
```yaml
# Virtual Service for API routing
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: skyn3t-api
spec:
  hosts:
  - api.skyn3t.com
  gateways:
  - skyn3t-gateway
  http:
  - match:
    - uri:
        prefix: /auth/
    route:
    - destination:
        host: auth-service
        port:
          number: 3001
    fault:
      delay:
        percentage:
          value: 0.1
        fixedDelay: 5s
  - match:
    - uri:
        prefix: /users/
    route:
    - destination:
        host: user-service
        port:
          number: 3003
    retries:
      attempts: 3
      perTryTimeout: 2s

# Destination Rule for load balancing
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: user-service-dr
spec:
  host: user-service
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
```

---

## 🔐 Arquitectura de Seguridad Multicapa

### Zero Trust Security Model

#### Security Layers Implementation
```yaml
Layer 1 - Network Security:
  VPC: Isolated Virtual Private Cloud
  Subnets: Private/Public separation
  NACLs: Network Access Control Lists
  Security Groups: Stateful firewall rules
  VPN: Site-to-site and client VPN
  
Layer 2 - Infrastructure Security:
  Container Security: Distroless images
  Image Scanning: Trivy + Snyk
  Runtime Security: Falco monitoring
  RBAC: Kubernetes role-based access
  
Layer 3 - Application Security:
  mTLS: Service-to-service encryption
  JWT: Stateless authentication
  OAuth 2.0: Third-party integrations
  Rate Limiting: DDoS protection
  
Layer 4 - Data Security:
  Encryption at Rest: AES-256
  Encryption in Transit: TLS 1.3
  Key Management: HashiCorp Vault
  Data Classification: PII protection
```

#### HashiCorp Vault Integration
```hcl
# Vault configuration for secret management
storage "postgresql" {
  connection_url = "postgres://vault:vault@postgres:5432/vault?sslmode=disable"
  table         = "vault_kv_store"
  max_parallel  = 128
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_cert_file = "/vault/tls/tls.crt"
  tls_key_file  = "/vault/tls/tls.key"
}

# Enable secret engines
path "secret/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "database/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Policy for microservices
path "secret/data/skyn3t/*" {
  capabilities = ["read"]
}
```

### Encryption Strategy Avanzada

#### Multi-layer Encryption
```typescript
class EncryptionService {
  private readonly fieldEncryption: FieldEncryption;
  private readonly fileEncryption: FileEncryption;
  private readonly keyRotation: KeyRotationService;
  
  // Field-level encryption for PII
  async encryptPII(data: any, schema: EncryptionSchema): Promise<any> {
    const encrypted = { ...data };
    
    for (const field of schema.encryptedFields) {
      if (encrypted[field]) {
        const keyId = await this.keyRotation.getCurrentKeyId('pii');
        encrypted[field] = await this.fieldEncryption.encrypt(
          encrypted[field],
          keyId,
          field
        );
        encrypted[`${field}_key_id`] = keyId;
      }
    }
    
    return encrypted;
  }
  
  // Envelope encryption for files
  async encryptFile(fileData: Buffer): Promise<EncryptedFile> {
    // Generate data encryption key (DEK)
    const dek = crypto.randomBytes(32);
    
    // Encrypt file with DEK
    const cipher = crypto.createCipher('aes-256-gcm', dek);
    const encryptedData = Buffer.concat([
      cipher.update(fileData),
      cipher.final()
    ]);
    
    // Encrypt DEK with key encryption key (KEK)
    const kekId = await this.keyRotation.getCurrentKeyId('file');
    const encryptedDEK = await this.vault.encrypt(dek, kekId);
    
    return {
      data: encryptedData,
      encrypted_key: encryptedDEK,
      key_id: kekId,
      iv: cipher.getAuthTag(),
      algorithm: 'aes-256-gcm'
    };
  }
}
```

---

## 📊 Monitoring & Observability

### The Four Pillars of Observability

#### 1. Metrics (Prometheus + Grafana)
```yaml
Prometheus Configuration:
  Global:
    scrape_interval: 15s
    evaluation_interval: 15s
    external_labels:
      cluster: 'skyn3t-production'
      environment: 'production'
  
  Rule Files:
    - "/etc/prometheus/rules/*.yml"
  
  Scrape Configs:
    - job_name: 'kubernetes-pods'
      kubernetes_sd_configs:
      - role: pod
      relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
    
    - job_name: 'skyn3t-services'
      static_configs:
      - targets:
        - 'auth-service:3001'
        - 'user-service:3003'
        - 'device-service:3004'
      metrics_path: '/metrics'
      scrape_interval: 10s

Alerting Rules:
  groups:
  - name: skyn3t-api.rules
    rules:
    - alert: HighErrorRate
      expr: |
        (
          sum(rate(http_requests_total{status=~"5.."}[5m])) by (service)
          /
          sum(rate(http_requests_total[5m])) by (service)
        ) > 0.05
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "High error rate on {{ $labels.service }}"
```

#### 2. Logging (ELK Stack)
```yaml
Filebeat Configuration:
  filebeat.inputs:
  - type: container
    paths:
    - '/var/lib/docker/containers/*/*.log'
    processors:
    - add_kubernetes_metadata:
        host: ${NODE_NAME}
        matchers:
        - logs_path:
            logs_path: "/var/lib/docker/containers/"
    
  output.logstash:
    hosts: ["logstash:5044"]
    
  setup.template.settings:
    index.number_of_shards: 3
    index.codec: best_compression

Logstash Pipeline:
  input {
    beats {
      port => 5044
    }
  }
  
  filter {
    if [kubernetes][labels][app] == "skyn3t" {
      json {
        source => "message"
      }
      
      date {
        match => [ "timestamp", "ISO8601" ]
        target => "@timestamp"
      }
      
      mutate {
        add_field => {
          "[@metadata][target_index]" => "skyn3t-logs-%{+YYYY.MM.dd}"
        }
      }
    }
  }
  
  output {
    elasticsearch {
      hosts => ["elasticsearch:9200"]
      index => "%{[@metadata][target_index]}"
    }
  }
```

#### 3. Tracing (Jaeger)
```typescript
// OpenTelemetry setup for distributed tracing
import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'auth-service',
    [SemanticResourceAttributes.SERVICE_VERSION]: '2.8.0',
  }),
  
  traceExporter: new JaegerExporter({
    endpoint: 'http://jaeger-collector:14268/api/traces',
  }),
  
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new PostgreSQLInstrumentation(),
    new RedisInstrumentation(),
  ],
});

// Custom span creation
async function authenticateUser(credentials: LoginCredentials): Promise<AuthResult> {
  const span = trace.getActiveSpan() || tracer.startSpan('authenticate_user');
  
  span.setAttributes({
    'user.email': credentials.email,
    'auth.method': credentials.two_factor_code ? '2fa' : 'password',
    'community.id': credentials.community_code
  });
  
  try {
    const result = await this.performAuthentication(credentials);
    
    span.addEvent('authentication_successful', {
      'user.id': result.user.id,
      'session.id': result.session_id
    });
    
    return result;
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw error;
  } finally {
    span.end();
  }
}
```

#### 4. Uptime Monitoring (Blackbox Exporter + StatusPage)
```yaml
Blackbox Exporter Config:
  modules:
    http_2xx:
      prober: http
      timeout: 5s
      http:
        valid_http_versions: ["HTTP/1.1", "HTTP/2.0"]
        valid_status_codes: [200, 201, 202]
        method: GET
        headers:
          Host: api.skyn3t.com
          User-Agent: "Prometheus Blackbox Exporter"
    
    api_health:
      prober: http
      timeout: 5s
      http:
        valid_status_codes: [200]
        method: GET
        body: '{"status": "healthy"}'
        
Prometheus Targets:
  - job_name: 'blackbox'
    metrics_path: /probe
    params:
      module: [http_2xx]
    static_configs:
    - targets:
      - https://api.skyn3t.com/health
      - https://api.skyn3t.com/auth/health
      - https://api.skyn3t.com/users/health
    relabel_configs:
    - source_labels: [__address__]
      target_label: __param_target
    - source_labels: [__param_target]
      target_label: instance
    - target_label: __address__
      replacement: blackbox-exporter:9115
```

---

## 🚀 Deployment Architecture

### Kubernetes-Native Deployment

#### Namespace Organization
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: skyn3t-production
  labels:
    environment: production
    app: skyn3t
---
apiVersion: v1
kind: Namespace
metadata:
  name: skyn3t-staging
  labels:
    environment: staging
    app: skyn3t
---
apiVersion: v1
kind: Namespace
metadata:
  name: skyn3t-monitoring
  labels:
    app: monitoring
```

#### Helm Chart Structure
```
helm/skyn3t/
├── Chart.yaml
├── values.yaml
├── values-production.yaml
├── values-staging.yaml
├── templates/
│   ├── _helpers.tpl
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── hpa.yaml
│   ├── pdb.yaml
│   ├── networkpolicy.yaml
│   ├── servicemonitor.yaml
│   └── tests/
│       └── test-connection.yaml
├── charts/
│   ├── postgresql/
│   ├── redis/
│   ├── rabbitmq/
│   └── istio-base/
└── crds/
    └── custom-resources.yaml
```

#### GitOps with ArgoCD
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: skyn3t-production
  namespace: argocd
spec:
  project: default
  
  source:
    repoURL: https://github.com/PeterH4ck/SKYN3T-Control_
    targetRevision: main
    path: helm/skyn3t
    helm:
      valueFiles:
      - values-production.yaml
      parameters:
      - name: image.tag
        value: v2.8.0
  
  destination:
    server: https://kubernetes.default.svc
    namespace: skyn3t-production
  
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
    - CreateNamespace=true
    - PrunePropagationPolicy=foreground
    
  revisionHistoryLimit: 10
```

---

## 🔮 Future Architecture Roadmap

### Phase 1: Advanced Event Sourcing (Q3 2024)
```typescript
// Event Store implementation
interface EventStore {
  append(streamId: string, events: Event[], expectedVersion?: number): Promise<void>;
  readStream(streamId: string, fromVersion?: number): Promise<Event[]>;
  subscribeToStream(streamId: string, handler: EventHandler): Promise<Subscription>;
  createProjection(name: string, query: ProjectionQuery): Promise<void>;
}

// Aggregate with event sourcing
abstract class Aggregate {
  private uncommittedEvents: Event[] = [];
  protected version: number = 0;
  
  protected apply(event: Event): void {
    this.uncommittedEvents.push(event);
    this.when(event);
    this.version++;
  }
  
  abstract when(event: Event): void;
  
  getUncommittedEvents(): Event[] {
    return [...this.uncommittedEvents];
  }
  
  markEventsAsCommitted(): void {
    this.uncommittedEvents = [];
  }
}
```

### Phase 2: Multi-Region Deployment (Q4 2024)
```yaml
Global Architecture:
  Primary Region: us-east-1
  Secondary Regions:
    - eu-west-1 (Europe)
    - ap-southeast-1 (Asia Pacific)
    - sa-east-1 (South America)
  
  Data Strategy:
    Primary: Active-Active PostgreSQL
    Cache: Redis Global Replication
    Files: S3 Cross-Region Replication
    
  Traffic Routing:
    DNS: Route 53 with health checks
    Load Balancing: Geographic routing
    Failover: Automatic with 99.99% SLA
```

### Phase 3: Advanced ML/AI Integration (Q1 2025)
```python
# Predictive Analytics Pipeline
class PredictiveAnalytics:
    def __init__(self):
        self.models = {
            'access_prediction': AccessPredictionModel(),
            'anomaly_detection': AnomalyDetectionModel(),
            'payment_prediction': PaymentPredictionModel(),
            'maintenance_prediction': MaintenancePredictionModel()
        }
    
    async def predict_access_patterns(
        self, 
        community_id: str, 
        time_horizon: int
    ) -> AccessPrediction:
        # Use time series forecasting with LSTM
        historical_data = await self.get_historical_access_data(community_id)
        weather_data = await self.get_weather_forecast()
        calendar_events = await self.get_calendar_events()
        
        features = self.feature_engineer(historical_data, weather_data, calendar_events)
        prediction = await self.models['access_prediction'].predict(features)
        
        return AccessPrediction(
            predicted_volume=prediction.volume,
            peak_hours=prediction.peaks,
            confidence_interval=prediction.confidence,
            influencing_factors=prediction.factors
        )
```

### Phase 4: Blockchain Integration (Q2 2025)
```solidity
// Smart Contract for Access Control
pragma solidity ^0.8.19;

contract AccessControl {
    struct AccessPermission {
        address user;
        bytes32 communityId;
        uint256 expiresAt;
        bool isActive;
    }
    
    mapping(bytes32 => AccessPermission) public permissions;
    mapping(address => bytes32[]) public userPermissions;
    
    event PermissionGranted(
        address indexed user,
        bytes32 indexed communityId,
        uint256 expiresAt
    );
    
    function grantAccess(
        address user,
        bytes32 communityId,
        uint256 duration
    ) external onlyAuthorized {
        bytes32 permissionId = keccak256(abi.encodePacked(user, communityId));
        
        permissions[permissionId] = AccessPermission({
            user: user,
            communityId: communityId,
            expiresAt: block.timestamp + duration,
            isActive: true
        });
        
        userPermissions[user].push(permissionId);
        
        emit PermissionGranted(user, communityId, block.timestamp + duration);
    }
    
    function verifyAccess(
        address user,
        bytes32 communityId
    ) external view returns (bool) {
        bytes32 permissionId = keccak256(abi.encodePacked(user, communityId));
        AccessPermission memory permission = permissions[permissionId];
        
        return permission.isActive && 
               permission.expiresAt > block.timestamp;
    }
}
```

---

## 📚 Architecture Decision Records (ADRs)

### ADR-001: Event-Driven Architecture with Kafka
**Status**: Accepted  
**Date**: 2024-06-24  
**Decision**: Implement Apache Kafka as primary event streaming platform  

**Context**: Need for real-time data processing, audit trails, and loose coupling between services.

**Rationale**:
- High throughput and low latency
- Fault tolerance and durability
- Stream processing capabilities
- Schema evolution support

**Consequences**:
- **Positive**: Better scalability, eventual consistency, audit capabilities
- **Negative**: Increased complexity, eventual consistency challenges
- **Neutral**: Learning curve for team, operational overhead

### ADR-002: Multi-tenant Data Isolation Strategy
**Status**: Accepted  
**Date**: 2024-06-24  
**Decision**: Hybrid approach with Row-Level Security + Schema-per-tenant  

**Rationale**:
- Compliance requirements (GDPR, local data protection)
- Performance isolation
- Cost optimization
- Easier backup and recovery per tenant

### ADR-003: Microservices Communication Patterns
**Status**: Accepted  
**Date**: 2024-06-24  
**Decision**: Async messaging for non-critical operations, sync calls for critical paths  

**Patterns**:
- **Synchronous**: Authentication, payment processing, real-time device control
- **Asynchronous**: Notifications, analytics updates, audit logging
- **Event Sourcing**: User actions, access logs, financial transactions

---

## 📈 Performance Benchmarks

### Service Performance Targets
```yaml
Authentication Service:
  Throughput: 10,000 logins/minute
  Response Time:
    p50: < 100ms
    p95: < 300ms
    p99: < 500ms
  Availability: 99.95%

Device Service:
  Command Processing: < 200ms
  MQTT Message Rate: 100,000 msg/sec
  Concurrent Connections: 50,000
  Availability: 99.9%

Payment Service:
  Transaction Processing: < 2s
  Throughput: 1,000 transactions/minute
  Success Rate: > 99.5%
  Availability: 99.99%

OCR Service:
  Image Processing: < 3s per document
  Accuracy Rate: > 95%
  Concurrent Processing: 100 documents
  Availability: 99.5%
```

### Infrastructure Scaling Metrics
```yaml
Auto-scaling Triggers:
  CPU Utilization: > 70%
  Memory Utilization: > 80%
  Request Rate: > 1000 req/min per instance
  Response Time: > 1000ms p95
  
Scaling Limits:
  Min Replicas: 2 per service
  Max Replicas: 50 per service
  Scale Up: +50% capacity in 2 minutes
  Scale Down: -25% capacity in 5 minutes
```

---

## 🛡️ Security Compliance

### Standards Compliance
```yaml
Compliance Frameworks:
  - SOC 2 Type II
  - ISO 27001
  - GDPR (EU General Data Protection Regulation)
  - PCI DSS (for payment processing)
  - LGPD (Brazil Data Protection Law)
  
Security Certifications:
  - OWASP Top 10 Coverage
  - CVE Scanning (daily)
  - Penetration Testing (quarterly)
  - Security Audit (annually)
```

### Data Protection Strategy
```yaml
Data Classification:
  Public: Marketing materials, public documentation
  Internal: Business processes, internal communications
  Confidential: Customer data, financial records
  Restricted: Authentication credentials, encryption keys

Protection Controls:
  Public: Basic access controls
  Internal: Authentication required
  Confidential: Encryption + access logging
  Restricted: Multi-factor authentication + encryption + audit trail
```

---

**Architecture Version**: 2.8.0  
**Last Updated**: 2024-06-24  
**Next Review**: 2024-09-24  
**Architecture Owner**: engineering-team@skyn3t.com