# 🏢 SKYN3T ACCESS CONTROL SYSTEM

![SKYN3T Banner](https://via.placeholder.com/1200x300/1a1a2e/ffffff?text=SKYN3T+ACCESS+CONTROL+SYSTEM)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-blue.svg)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-24.x-blue.svg)](https://www.docker.com/)
[![Development Status](https://img.shields.io/badge/Status-25%25%20Complete-orange.svg)](#desarrollo)

## 📋 Descripción

**SKYN3T Access Control System** es una plataforma integral de gestión de accesos y seguridad para comunidades residenciales, condominios y edificios comerciales. Implementa una arquitectura de microservicios moderna con características avanzadas de IoT, gestión financiera, comunicaciones multicanal y análisis predictivo.

### 🎯 Características Principales

- **🔐 Control de Acceso Multi-método**: QR dinámicos, reconocimiento facial, biometría, RFID, placas vehiculares
- **🏢 Multi-tenant Avanzado**: Gestión independiente por comunidades con aislamiento completo de datos
- **👥 Sistema de Permisos Jerárquico**: 22 roles (11 sistema + 11 comunidad) con herencia granular
- **💰 Gestión Financiera Completa**: Integración con bancos chilenos, pasarelas de pago internacionales
- **📱 Invitaciones Inteligentes**: QR dinámicos, validación GPS, reconocimiento vehicular automático
- **🔌 IoT & Dispositivos en Tiempo Real**: Control MQTT, WebSocket, comandos bidireccionales
- **📊 Analytics & ML**: Predicción de comportamientos, detección de anomalías, reportes avanzados
- **💬 Comunicaciones Omnicanal**: Email, SMS, WhatsApp Business, notificaciones push, in-app
- **🌍 Multi-región**: Soporte inicial Chile, expansible a LATAM y mundial

## 🚀 Estado Actual del Proyecto

### ✅ ETAPAS COMPLETADAS (25%)

#### Etapa 1: Infraestructura y Base
- ✅ **Arquitectura Docker Completa**: 27 servicios orquestados
- ✅ **Base de Datos PostgreSQL**: Esquema completo con 150+ tablas
- ✅ **Sistema Multi-tenant**: Aislamiento por comunidades con RLS
- ✅ **Autenticación JWT**: Tokens, refresh, 2FA, rate limiting
- ✅ **Cache Distribuido**: Redis Master/Slave con Sentinel

#### Etapa 2: Permisos y Seguridad
- ✅ **Sistema de Permisos Avanzado**: 22 roles jerárquicos con herencia
- ✅ **RBAC + ABAC**: Role y Attribute-Based Access Control
- ✅ **Middleware de Seguridad**: Autenticación, autorización, validación
- ✅ **WebSocket en Tiempo Real**: Comunicación bidireccional
- ✅ **Layout Principal Backend**: Estructura modular completa

### 🚧 ETAPA ACTUAL (3): MODELOS Y CONTROLADORES
- 🔄 **Controladores CRUD**: 60% completado
- 🔄 **Modelos Sequelize**: 80% completado  
- 🔄 **Servicios Especializados**: Payment, Device, OCR en desarrollo
- 🔄 **APIs RESTful**: Documentación Swagger en progreso

### 📋 PRÓXIMAS ETAPAS

**Etapa 4 (Frontend React)**: Sistema de gestión visual completo
**Etapa 5 (Gestión Comunidades)**: Dashboard administrativo avanzado
**Etapa 6 (Sistema IoT)**: Control dispositivos en tiempo real
**Etapa 7 (Sistema Financiero)**: Integración bancaria completa

## 🛠️ Arquitectura Técnica

### Stack Tecnológico

#### Backend (Microservicios)
```typescript
Core Services:
├── auth-service (3001)        # Autenticación y seguridad
├── permission-service (3002)  # Motor de permisos RBAC/ABAC
├── user-service (3003)        # Gestión de usuarios y perfiles
├── device-service (3004)      # Control IoT y dispositivos
├── payment-service (3005)     # Procesamiento de pagos
├── notification-service (3006) # Comunicaciones omnicanal
└── analytics-service (3007)   # Business Intelligence y ML
```

#### Infraestructura
```yaml
Data Layer:
  - PostgreSQL 15+ (Master/Replica)
  - Redis 7 (Master/Slave/Sentinel)
  - InfluxDB 2.7 (Métricas IoT)
  - Elasticsearch 8.11 (Logs y búsqueda)

Message Layer:
  - RabbitMQ 3.12 (Event bus)
  - MQTT Mosquitto (IoT devices)

Storage & Monitoring:
  - MinIO (S3-compatible storage)
  - Prometheus + Grafana (Métricas)
  - Jaeger (Distributed tracing)
```

#### Frontend (Planificado - Etapa 4)
```javascript
Technology Stack:
  - React 18 + TypeScript
  - Material-UI v5 (Glassmorphism theme)
  - Redux Toolkit + RTK Query
  - Recharts + D3.js (Visualizaciones)
  - Socket.io Client (Real-time)
```

### Características de Arquitectura

- **🔧 Microservicios**: 7 servicios independientes especializados
- **📡 Event-Driven**: Comunicación asíncrona mediante RabbitMQ
- **🔐 Security-by-Design**: Seguridad integrada en cada capa
- **📊 Observability**: Monitoreo, logging y tracing distribuido
- **🚀 Cloud-Native**: Containerización completa con Docker
- **⚡ High Performance**: Cache multinivel, conexión pooling
- **🔄 Real-time**: WebSocket para actualizaciones instantáneas

## 📦 Instalación y Configuración

### Prerrequisitos del Sistema
```bash
Mínimo:
  - CPU: 4 cores
  - RAM: 8 GB (16 GB recomendado)
  - Disco: 50 GB libres
  - Red: Conexión estable

Software:
  - Docker Engine 24.0+
  - Docker Compose 2.20+
  - Git
  - Make (opcional)
```

### Instalación Rápida

```bash
# 1. Clonar repositorio
git clone https://github.com/PeterH4ck/SKYN3T-Control_.git
cd SKYN3T-Control_

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con configuraciones específicas

# 3. Instalación automática
make install

# O instalación manual:
docker-compose build
docker-compose up -d

# 4. Verificar servicios
make status
```

### Acceso al Sistema

**URLs de Servicios:**
```bash
Core Services:
├── API Gateway: http://localhost:8000
├── Auth Service: http://localhost:3001  
├── Permission Service: http://localhost:3002
├── User Service: http://localhost:3003
└── Device Service: http://localhost:3004

Monitoring & Management:
├── Grafana: http://localhost:3000/grafana (admin/grafana123)
├── Kibana: http://localhost:5601
├── RabbitMQ: http://localhost:15672 (admin/rabbitmq123)
├── MinIO Console: http://localhost:9001 (minioadmin/minioadmin123)
└── Prometheus: http://localhost:9090
```

**Credenciales Predeterminadas:**
- **Admin System**: admin@system.local / admin
- **Grafana**: admin / grafana123
- **RabbitMQ**: admin / rabbitmq123
- **MinIO**: minioadmin / minioadmin123

## 🔐 Sistema de Permisos Avanzado

### Jerarquía de Roles (22 Niveles)

#### Roles del Sistema (11 niveles)
```typescript
System Roles:
1. SUPER_ADMIN          # Control total del sistema
2. SYSTEM_ADMIN         # Administración general
3. FINANCIAL_ADMIN      # Gestión financiera
4. HARDWARE_ADMIN       # Administración de hardware
5. SECURITY_ADMIN       # Gestión de seguridad
6. AUDIT_ADMIN          # Administración de auditoría
7. OPERATIONS_MANAGER   # Gestión de operaciones
8. COMMUNITY_MANAGER    # Gestión de comunidades
9. SUPPORT_SUPERVISOR   # Supervisión de soporte
10. SUPPORT_AGENT       # Agente de soporte
11. REPORT_VIEWER       # Visualización de reportes
```

#### Roles de Comunidad (11 niveles)
```typescript
Community Roles:
1. COMMUNITY_ADMIN      # Administrador de comunidad
2. BOARD_PRESIDENT      # Presidente del directorio
3. TREASURER            # Tesorero
4. BOARD_MEMBER         # Miembro del directorio
5. SECURITY_CHIEF       # Jefe de seguridad
6. SECURITY_GUARD       # Guardia de seguridad
7. MAINTENANCE_CHIEF    # Jefe de mantenimiento
8. STAFF                # Personal
9. OWNER                # Propietario
10. TENANT              # Arrendatario
11. AUTHORIZED_PERSON   # Persona autorizada
```

### Motor de Permisos Granulares

```typescript
Permission Structure:
  - Module-based: access, users, financial, devices
  - Action-based: create, read, update, delete, execute
  - Risk levels: low, medium, high, critical
  - Context-aware: community, building, unit specific
  - Time-based: temporary permissions with expiration
```

## 🌐 Estructura del Proyecto

```
skyn3t-access-control/
├── 📁 backend/                     # API Principal (Node.js/TypeScript)
│   ├── src/
│   │   ├── controllers/            # ✅ Controladores REST (60%)
│   │   ├── models/                 # ✅ Modelos Sequelize (80%)
│   │   ├── middleware/             # ✅ Middleware completo
│   │   ├── services/               # 🔄 Servicios de negocio (70%)
│   │   ├── routes/                 # ✅ Rutas API
│   │   └── utils/                  # ✅ Utilidades
│   └── database/
│       ├── schema.sql              # ✅ Esquema completo (150+ tablas)
│       ├── migrations/             # ✅ Migraciones
│       └── seeds/                  # ✅ Datos iniciales
│
├── 📁 permission-service/          # ✅ Microservicio de permisos completo
│   ├── src/
│   │   ├── core/                   # ✅ Motor de permisos RBAC/ABAC
│   │   ├── controllers/            # ✅ API de permisos
│   │   ├── services/               # ✅ Cache y propagación
│   │   └── validators/             # ✅ Validaciones
│
├── 📁 payment-service/            # 🔄 Microservicio de pagos (en desarrollo)
├── 📁 notification-service/       # 🔄 Microservicio de notificaciones
├── 📁 analytics-service/          # 🔄 Microservicio de analytics
├── 📁 ocr-service/               # 📋 Microservicio OCR (Python)
├── 📁 ml-service/                # 📋 Microservicio ML (Python)
│
├── 📁 frontend/                   # 📋 React App (Etapa 4)
│
├── 📁 nginx/                      # ✅ Proxy y balanceador
├── 📁 config/                     # ✅ Configuraciones servicios
├── 📁 scripts/                    # ✅ Scripts de automatización
├── 📁 docs/                       # ✅ Documentación completa
│
├── 📄 docker-compose.yml          # ✅ Orquestación de 27 servicios
├── 📄 Makefile                    # ✅ Comandos de automatización
└── 📄 .env.example                # ✅ Variables de entorno
```

## 🔌 APIs y Integraciones

### APIs RESTful Principales

#### Authentication API
```http
POST /api/v1/auth/login           # Login con 2FA
POST /api/v1/auth/refresh         # Renovar tokens
POST /api/v1/auth/2fa/enable      # Habilitar 2FA
GET  /api/v1/auth/session         # Información de sesión
```

#### Permissions API
```http
GET  /api/v1/permissions/user/{id}      # Permisos de usuario
POST /api/v1/permissions/check          # Verificar permisos
PUT  /api/v1/permissions/grant          # Otorgar permisos
DEL  /api/v1/permissions/revoke         # Revocar permisos
```

#### WebSocket Events
```javascript
// Eventos en tiempo real
socket.on('access.granted', (data) => {
  console.log('Acceso autorizado:', data);
});

socket.on('device.status.changed', (data) => {
  console.log('Estado dispositivo:', data);
});

socket.on('permission.updated', (data) => {
  console.log('Permisos actualizados:', data);
});
```

### Integraciones Bancarias (Chile)

```typescript
Bancos Soportados:
├── Banco Estado        # API nativa + Open Banking
├── Santander Chile     # Open Banking API
├── Banco de Chile      # API corporativa
├── BCI                 # Transbank integration
└── Scotiabank         # API comercial

Pasarelas Internacionales:
├── PayPal             # Global payments
├── MercadoPago        # LATAM payments  
└── Stripe             # Tarjetas de crédito
```

## 📊 Monitoreo y Analytics

### Dashboards Disponibles

#### Dashboard del Sistema
- CPU, memoria, disco, red por servicio
- Performance de base de datos
- Métricas de cache y cola de mensajes
- Health checks automatizados

#### Dashboard de Accesos
- Accesos en tiempo real por comunidad
- Estadísticas de métodos de acceso
- Detección de anomalías
- Reportes de seguridad

#### Dashboard Financiero  
- Transacciones por comunidad
- Estado de pagos y cobranzas
- Análisis de morosidad
- Integración bancaria en tiempo real

### Métricas Clave (SLOs)

```yaml
Availability: 99.9% uptime
Performance:
  - API response time: <200ms (p95)
  - Real-time updates: <100ms
  - Database queries: <50ms (p90)

Error Rates:
  - Critical endpoints: <0.1%
  - Non-critical: <1%

Capacity:
  - 10,000 concurrent users
  - 1M API requests/hour
  - 100GB data per community
```

## 🧪 Testing y Calidad

### Estrategia de Testing
```bash
# Backend tests
cd backend && npm test              # Unit tests (>80% coverage)
cd permission-service && npm test  # Permission service tests

# Integration tests
make test-integration              # API integration tests

# E2E tests (cuando frontend esté listo)
make test-e2e                     # End-to-end tests
```

### Métricas de Calidad
- **Code Coverage**: >80% para servicios críticos
- **TypeScript**: Strict mode habilitado
- **ESLint**: Configuración estricta
- **Security**: Dependencias auditadas semanalmente

## 🔧 Comandos de Desarrollo

### Gestión de Servicios
```bash
# Desarrollo
make dev                    # Modo desarrollo con hot reload
make logs                   # Ver logs de todos los servicios
make logs-service SERVICE=auth-service  # Logs específicos

# Base de datos
make db-migrate            # Ejecutar migraciones
make db-seed              # Cargar datos de prueba
make db-backup            # Backup de base de datos
make db-shell             # Acceso a PostgreSQL

# Cache y cola
make redis-cli            # Acceso a Redis
make cache-clear          # Limpiar cache
make rabbitmq-shell       # Acceso a RabbitMQ

# Monitoreo
make status               # Estado de todos los servicios
make health-check         # Health check completo
make metrics              # Métricas del sistema
```

### Gestión de Permisos
```bash
# Permission service específicos
make permissions-sync     # Sincronizar permisos
make permissions-cache-clear  # Limpiar cache de permisos
make permissions-audit    # Auditoría de permisos
```

## 🌍 Soporte Multi-región

### Regiones Implementadas

#### 🇨🇱 Chile (Completo)
```yaml
Banks: Banco Estado, Santander, BCI, Banco de Chile
Currency: CLP
Timezone: America/Santiago
Language: Spanish (es_CL)
Regulations: SII integration, local banking APIs
```

### Regiones Planificadas
- **🇲🇽 México**: Q2 2024 (BBVA, Santander México)
- **🇦🇷 Argentina**: Q3 2024 (Banco Nación, Galicia)
- **🇨🇴 Colombia**: Q4 2024 (Bancolombia, Davivienda)
- **🇺🇸 Estados Unidos**: 2025 (Chase, Bank of America)

## 🔮 Roadmap 2024

### Q1 2024 - Core Platform ✅
- [x] Arquitectura de microservicios
- [x] Sistema de permisos avanzado
- [x] Base de datos completa
- [x] Infraestructura Docker

### Q2 2024 - User Interface 🚧
- [ ] Frontend React completo (Etapa 4)
- [ ] Sistema de gestión visual
- [ ] Dashboard de comunidades
- [ ] Módulo de dispositivos IoT

### Q3 2024 - Advanced Features
- [ ] Apps móviles (iOS/Android)
- [ ] Machine Learning predictivo
- [ ] OCR avanzado para placas
- [ ] Integraciones bancarias completas

### Q4 2024 - Scale & Expansion
- [ ] Multi-región LATAM
- [ ] Enterprise features
- [ ] Marketplace de integraciones
- [ ] Certificaciones de seguridad

## 🚨 Issues Conocidos y Limitaciones

### En Desarrollo
- **Frontend**: 0% implementado (Etapa 4)
- **Controladores CRUD**: 40% restante por completar
- **Apps Móviles**: No iniciadas
- **OCR Service**: En desarrollo (Python)
- **ML Service**: Algoritmos básicos pendientes

### Bugs Conocidos
- WebSocket reconnection en alta carga
- Cache invalidation en cluster Redis
- Rate limiting por IP en balanceador

Ver [Issues Completos](https://github.com/PeterH4ck/SKYN3T-Control_/issues) para detalles.

## 🤝 Contribución

### Configuración de Desarrollo
```bash
# Setup completo
git clone https://github.com/PeterH4ck/SKYN3T-Control_.git
cd SKYN3T-Control_
cp .env.example .env
make dev-setup

# Instalar pre-commit hooks
npm run prepare
```

### Estándares de Código
- **TypeScript**: Strict mode + ESLint
- **Commits**: Conventional commits
- **Tests**: Mínimo 80% coverage
- **Documentation**: JSDoc para APIs

## 🎯 Casos de Uso Principales

### Comunidades Residenciales
- Control de acceso de residentes y visitas
- Gestión de gastos comunes
- Comunicación con vecinos
- Reserva de espacios comunes

### Edificios Comerciales
- Control de empleados y visitantes
- Gestión de proveedores
- Facturación de servicios
- Seguridad y monitoreo

### Condominios Mixtos
- Múltiples tipos de usuarios
- Zonificación de accesos
- Facturación diferenciada
- Reportes por administración

## 📄 Licencia y Soporte

**Licencia**: MIT License  
**Desarrollador**: PETERH4CK  
**Soporte**: GitHub Issues y Discussions  
**Documentación**: [Docs completos](./docs/)

## 🙏 Agradecimientos

- **Claude AI** por asistencia en desarrollo
- **Docker Community** por containerización
- **PostgreSQL Team** por la robustez de datos
- **Material-UI** por componentes de interfaz
- **Sequelize Team** por el excelente ORM

---

<div align="center">

**[🏠 Proyecto](https://github.com/PeterH4ck/SKYN3T-Control_) • [📚 Documentación](./docs/) • [🐛 Issues](https://github.com/PeterH4ck/SKYN3T-Control_/issues) • [💬 Discussions](https://github.com/PeterH4ck/SKYN3T-Control_/discussions)**

**Construido con ❤️ para el futuro del control de acceso**

![Footer](https://via.placeholder.com/1200x100/1a1a2e/ffffff?text=SKYN3T+Access+Control+System+-+The+Future+of+Community+Management)

</div>