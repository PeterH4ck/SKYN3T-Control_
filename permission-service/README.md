# 🔐 Permission Service - SKYN3T Access Control

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Redis](https://img.shields.io/badge/Redis-7+-red.svg)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)

Motor de permisos granulares independiente para el sistema SKYN3T Access Control. Maneja la verificación, propagación y cache distribuido de permisos con alta performance y escalabilidad.

## 📋 Características Principales

### 🚀 Performance
- **Cache distribuido** con Redis para respuestas sub-milisegundo
- **Operaciones masivas** con procesamiento en lotes optimizado
- **Conexión pool** a base de datos con balanceeo de carga
- **Rate limiting** inteligente por usuario y operación

### 🔧 Funcionalidades Core
- **RBAC Avanzado**: Control de acceso basado en roles con jerarquías
- **Permisos Granulares**: Sistema de permisos específicos por módulo/acción
- **Cache Inteligente**: Invalidación automática y propagación de cambios
- **Verificación Contextual**: Validación con contexto temporal, geográfico y condicional
- **Operaciones Bulk**: Procesamientos masivos con control de progreso

### 🌐 Integración
- **Event-Driven**: Comunicación asíncrona via RabbitMQ
- **API RESTful**: Endpoints para integración con otros microservicios
- **Health Monitoring**: Métricas Prometheus y health checks
- **Multi-tenant**: Soporte para múltiples comunidades aisladas

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────┐
│           PERMISSION SERVICE            │
├─────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────────────┐ │
│  │    API      │ │   Permission Engine │ │
│  │ Controller  │ │                     │ │
│  └─────────────┘ └─────────────────────┘ │
│  ┌─────────────┐ ┌─────────────────────┐ │
│  │    Cache    │ │     Propagator      │ │
│  │   Service   │ │                     │ │
│  └─────────────┘ └─────────────────────┘ │
├─────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────────────┐ │
│  │    Redis    │ │     PostgreSQL      │ │
│  │   Cache     │ │     Database        │ │
│  └─────────────┘ └─────────────────────┘ │
└─────────────────────────────────────────┘
```

## 🚀 Inicio Rápido

### Prerequisitos

- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- RabbitMQ 3.12+

### Instalación

```bash
# Clonar el repositorio
git clone https://github.com/your-org/skyn3t-access-control.git
cd skyn3t-access-control/permission-service

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus configuraciones

# Compilar TypeScript
npm run build

# Ejecutar migraciones de base de datos
npm run migrate

# Iniciar el servicio
npm start
```

### Desarrollo

```bash
# Modo desarrollo con hot reload
npm run dev

# Ejecutar tests
npm test

# Tests con coverage
npm run test:coverage

# Linting
npm run lint
npm run lint:fix
```

## 📡 API Endpoints

### Verificación de Permisos

#### `POST /api/v1/permissions/check`
Verificar permisos de un usuario específico.

```json
{
  "userId": "uuid",
  "permissions": ["users.create", "admin.view"],
  "communityId": "uuid",
  "context": {
    "timeRestricted": true,
    "validFrom": "2024-01-01T00:00:00Z",
    "validUntil": "2024-12-31T23:59:59Z"
  }
}
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "granted": true,
    "permissions": ["users.create", "users.view", "admin.view"],
    "missing": [],
    "reason": "Permission granted",
    "cached": true,
    "calculationTime": 15
  }
}
```

#### `POST /api/v1/permissions/check/bulk`
Verificar permisos masivos para múltiples usuarios.

```json
{
  "checks": [
    {
      "userId": "uuid1",
      "permissions": ["users.create"],
      "communityId": "uuid"
    },
    {
      "userId": "uuid2", 
      "permissions": ["devices.control"],
      "communityId": "uuid"
    }
  ]
}
```

### Gestión de Cache

#### `POST /api/v1/permissions/cache/users/{userId}/invalidate`
Invalidar cache de permisos de usuario específico.

#### `POST /api/v1/permissions/cache/roles/{roleId}/invalidate`
Invalidar cache de permisos de rol específico.

#### `POST /api/v1/permissions/cache/clear`
Limpiar todo el cache de permisos (solo administradores).

### Propagación de Cambios

#### `POST /api/v1/permissions/propagate/roles/{roleId}`
Propagar cambios de permisos de rol.

```json
{
  "changes": {
    "added": ["users.delete"],
    "removed": ["admin.system"],
    "modified": ["devices.configure"]
  },
  "communityId": "uuid",
  "reason": "Role permissions updated"
}
```

#### `POST /api/v1/permissions/propagate/bulk`
Iniciar propagación masiva de cambios.

```json
{
  "targets": ["uuid1", "uuid2", "uuid3"],
  "type": "role_permissions",
  "changes": {
    "operation": "invalidate_cache"
  }
}
```

### Monitoreo

#### `GET /api/v1/permissions/stats`
Obtener estadísticas del motor de permisos.

#### `GET /api/v1/permissions/health`
Health check del servicio.

#### `GET /metrics`
Métricas Prometheus.

## 🔧 Configuración

### Variables de Entorno Principales

```bash
# Servicio
NODE_ENV=production
PORT=3002

# Base de datos
DB_HOST=localhost
DB_PORT=5432
DB_NAME=master_db
DB_USER=postgres
DB_PASSWORD=secure_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=secure_password
REDIS_DB=1

# RabbitMQ
RABBITMQ_URL=amqp://user:pass@localhost:5672/skyn3t

# JWT
JWT_SECRET=your-super-secure-jwt-secret

# Cache TTL (segundos)
CACHE_TTL_SHORT=60
CACHE_TTL_MEDIUM=300
CACHE_TTL_LONG=3600

# Performance
PERMISSION_CALC_TIMEOUT=5000
MAX_PERMISSION_DEPTH=10
BATCH_SIZE=100
```

### Configuración de Cache

El servicio utiliza un sistema de cache multinivel:

- **L1 Cache**: Redis distribuido para permisos calculados
- **L2 Cache**: Cache local en memoria para datos frecuentes
- **TTL Inteligente**: Diferentes TTL según el tipo de datos

### Rate Limiting

Configuración de rate limiting por tipo de operación:

```typescript
// Verificación de permisos: 100 req/min por usuario
checkPermissions: 100/min

// Operaciones masivas: 5 req/5min por usuario  
bulkOperations: 5/5min

// Operaciones de cache: 20 req/min por usuario
cacheOperations: 20/min

// Operaciones administrativas: 5 req/10min
adminOperations: 5/10min
```

## 🧪 Testing

### Ejecutar Tests

```bash
# Todos los tests
npm test

# Tests específicos
npm test -- --testNamePattern="PermissionEngine"

# Tests con coverage
npm run test:coverage

# Tests en modo watch
npm run test:watch
```

### Estructura de Tests

```
tests/
├── unit/
│   ├── core/
│   │   ├── permissionEngine.test.ts
│   │   └── permissionPropagator.test.ts
│   ├── services/
│   │   ├── cacheService.test.ts
│   │   └── metricsService.test.ts
│   └── controllers/
│       └── permissionController.test.ts
├── integration/
│   ├── api/
│   │   └── permissions.test.ts
│   └── database/
│       └── queries.test.ts
└── e2e/
    └── permission-flow.test.ts
```

## 📊 Monitoreo y Métricas

### Métricas Disponibles

- `permission_calculations_total`: Total de cálculos de permisos
- `permission_checks_granted_total`: Verificaciones exitosas
- `permission_checks_denied_total`: Verificaciones denegadas
- `cache_hits_total` / `cache_misses_total`: Estadísticas de cache
- `permission_calculation_duration_seconds`: Tiempo de cálculo
- `http_request_duration_seconds`: Tiempo de respuesta HTTP

### Dashboard Grafana

El servicio incluye dashboards preconfigurados para Grafana:

- **Permission Performance**: Métricas de rendimiento y latencia
- **Cache Efficiency**: Estadísticas de hit/miss rate del cache  
- **Error Monitoring**: Seguimiento de errores y fallos
- **System Health**: Estado general del servicio

### Alertas Recomendadas

```yaml
# Alta tasa de errores
- alert: HighPermissionErrorRate
  expr: rate(permission_errors_total[5m]) > 0.01
  
# Baja eficiencia de cache
- alert: LowCacheHitRate  
  expr: cache_hit_rate < 0.8

# Alta latencia
- alert: HighPermissionLatency
  expr: permission_calculation_duration_p95 > 1.0
```

## 🔐 Seguridad

### Autenticación
- JWT tokens para autenticación de servicios
- Validación de tokens en cada request
- Refresh token automático

### Autorización  
- Rate limiting por usuario/IP
- Validación de permisos para operaciones administrativas
- Audit logging completo

### Encriptación
- TLS 1.3 para comunicaciones
- Encriptación de datos sensibles en cache
- Hashing seguro de identificadores

## 🐳 Deployment con Docker

### Build de la Imagen

```bash
# Build
docker build -t skyn3t/permission-service:latest .

# Run
docker run -d \
  --name permission-service \
  -p 3002:3002 \
  -e NODE_ENV=production \
  -e DB_HOST=host.docker.internal \
  -e REDIS_HOST=host.docker.internal \
  skyn3t/permission-service:latest
```

### Docker Compose

```yaml
version: '3.8'
services:
  permission-service:
    build: .
    ports:
      - "3002:3002"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - REDIS_HOST=redis
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
```

## 🔄 Integración con otros Servicios

### Auth Service
- Validación de JWT tokens
- Sincronización de cambios de usuario

### User Service  
- Notificación de cambios de roles
- Sincronización de membresías

### Device Service
- Verificación de permisos de dispositivos
- Control de acceso IoT

### Ejemplo de Integración

```typescript
// En otro microservicio
import { PermissionClient } from '@skyn3t/permission-client';

const permClient = new PermissionClient('http://permission-service:3002');

// Verificar permisos
const hasPermission = await permClient.checkPermission(
  userId, 
  'devices.control',
  communityId
);

if (hasPermission.granted) {
  // Permitir operación
  await controlDevice(deviceId);
}
```

## 📈 Performance

### Benchmarks

- **Verificación simple**: < 10ms (con cache)
- **Verificación compleja**: < 50ms (con jerarquías)
- **Operaciones bulk**: 1000 permisos/segundo
- **Cache hit rate**: > 95% en condiciones normales

### Escalabilidad

- **Horizontal**: Múltiples instancias con cache distribuido
- **Vertical**: Optimizado para multi-core
- **Database**: Read replicas para consultas
- **Cache**: Redis Cluster para high availability

## 🤝 Contribuir

1. Fork el proyecto
2. Crear feature branch (`git checkout -b feature/nueva-funcionalidad`)
3. Commit cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push al branch (`git push origin feature/nueva-funcionalidad`)
5. Crear Pull Request

### Estándares de Código

- TypeScript estricto
- ESLint + Prettier para formatting
- Tests obligatorios para nuevas funcionalidades
- Documentación de APIs con JSDoc

## 📝 Changelog

### v1.0.0 (2024-01-01)
- ✨ Implementación inicial del motor de permisos
- 🚀 Sistema de cache distribuido con Redis
- 📡 API RESTful completa
- 🔄 Propagación de cambios en tiempo real
- 📊 Métricas y monitoreo integrado

## 📄 Licencia

MIT License - ver [LICENSE.md](LICENSE.md) para detalles.

## 🆘 Soporte

- **Documentación**: [docs.skyn3t.com](https://docs.skyn3t.com)
- **Issues**: [GitHub Issues](https://github.com/your-org/skyn3t-access-control/issues)
- **Email**: support@skyn3t.com
- **Slack**: #skyn3t-support

---

**SKYN3T Permission Service** - Motor de permisos granulares de alta performance 🚀