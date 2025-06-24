# 🌐 API DOCUMENTATION - SKYN3T ACCESS CONTROL

![API Version](https://img.shields.io/badge/API%20Version-v1-blue.svg)
![OpenAPI](https://img.shields.io/badge/OpenAPI-3.0.3-green.svg)
![Status](https://img.shields.io/badge/Status-In%20Development-orange.svg)

## 📋 Descripción General

La API de SKYN3T Access Control es una API RESTful que proporciona acceso completo a todas las funcionalidades del sistema de control de acceso. Implementa autenticación JWT, autorización basada en roles y permisos granulares.

### Base URL
```
Desarrollo: http://localhost:8000/api/v1
Producción: https://api.skyn3t.com/v1
```

### Características
- **RESTful**: Sigue principios REST estándar
- **JWT Authentication**: Tokens seguros con refresh
- **Rate Limiting**: Protección contra abuso
- **Multi-tenant**: Isolación por comunidad
- **Real-time**: WebSocket para actualizaciones
- **Versionado**: API versionada para compatibilidad

---

## 🔐 Autenticación

### JWT Bearer Token
Todas las rutas protegidas requieren un token JWT en el header Authorization.

```http
Authorization: Bearer {access_token}
```

### Headers Requeridos
```http
Content-Type: application/json
Authorization: Bearer {token}
X-Community-ID: {community_id}  # Opcional para operaciones multi-tenant
```

### Rate Limiting
```http
X-RateLimit-Limit: 100          # Requests por ventana
X-RateLimit-Remaining: 95       # Requests restantes
X-RateLimit-Reset: 1640995200   # Reset timestamp
```

---

## 📚 Endpoints

### 🔑 Authentication

#### POST /auth/login
Autenticar usuario en el sistema.

**Request:**
```json
{
  "username": "admin@example.com",
  "password": "password123",
  "remember": true,
  "two_factor_code": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login exitoso",
  "data": {
    "user": {
      "id": "uuid",
      "username": "admin",
      "email": "admin@example.com",
      "full_name": "Admin User",
      "avatar_url": "https://...",
      "email_verified": true
    },
    "roles": [
      {
        "code": "COMMUNITY_ADMIN",
        "name": "Community Administrator",
        "level": 1
      }
    ],
    "permissions": ["users.create", "users.update", "devices.control"],
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 900,
    "redirect": "/dashboard"
  }
}
```

**Error Responses:**
```json
// 401 - Credenciales inválidas
{
  "success": false,
  "error": "INVALID_CREDENTIALS",
  "message": "Credenciales inválidas"
}

// 423 - Cuenta bloqueada
{
  "success": false,
  "error": "ACCOUNT_LOCKED",
  "message": "Cuenta bloqueada temporalmente",
  "data": {
    "locked_until": "2024-01-01T10:30:00Z"
  }
}
```

#### POST /auth/logout
Cerrar sesión actual.

**Headers:**
```http
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "message": "Logout exitoso",
  "redirect": "/login"
}
```

#### POST /auth/refresh
Refrescar token de acceso.

**Request:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 900
  }
}
```

#### GET /auth/session
Verificar sesión actual.

**Response:**
```json
{
  "authenticated": true,
  "user": {
    "id": "uuid",
    "username": "admin",
    "email": "admin@example.com",
    "full_name": "Admin User",
    "roles": ["COMMUNITY_ADMIN"],
    "permissions": ["users.create", "users.update"]
  }
}
```

#### POST /auth/2fa/enable
Habilitar autenticación de dos factores.

**Response:**
```json
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "qr_code": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
  }
}
```

#### POST /auth/2fa/confirm
Confirmar configuración 2FA.

**Request:**
```json
{
  "code": "123456"
}
```

#### POST /auth/password/reset-request
Solicitar reset de contraseña.

**Request:**
```json
{
  "email": "user@example.com"
}
```

#### POST /auth/password/reset
Resetear contraseña con token.

**Request:**
```json
{
  "token": "reset_token_here",
  "password": "new_password"
}
```

---

### 👥 Users

#### GET /users
Listar usuarios con paginación y filtros.

**Query Parameters:**
```
page=1              # Página (default: 1)
limit=20            # Items por página (default: 20, max: 100)
search=john         # Búsqueda en nombre/email
status=active       # Filtrar por estado
role=OWNER          # Filtrar por rol
community_id=uuid   # Filtrar por comunidad
sort=created_at     # Campo ordenamiento
order=desc          # Dirección ordenamiento (asc/desc)
```

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "uuid",
        "username": "john_doe",
        "email": "john@example.com",
        "first_name": "John",
        "last_name": "Doe",
        "full_name": "John Doe",
        "phone": "+56912345678",
        "status": "active",
        "avatar_url": "https://...",
        "last_login": "2024-01-01T10:00:00Z",
        "email_verified": true,
        "created_at": "2024-01-01T00:00:00Z",
        "roles": ["OWNER"],
        "communities": ["Community Name"]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "pages": 8,
      "has_next": true,
      "has_prev": false
    }
  }
}
```

#### GET /users/{id}
Obtener usuario específico.

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "john_doe",
      "email": "john@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "phone": "+56912345678",
      "status": "active",
      "avatar_url": "https://...",
      "document_type": "id",
      "document_number": "12345678-9",
      "birth_date": "1990-01-01",
      "created_at": "2024-01-01T00:00:00Z",
      "roles": [
        {
          "id": "uuid",
          "code": "OWNER",
          "name": "Property Owner",
          "community_id": "uuid"
        }
      ],
      "permissions": ["access.doors.open", "financial.view"],
      "communities": [
        {
          "id": "uuid",
          "name": "Torres del Sol",
          "member_type": "owner",
          "unit_number": "101"
        }
      ]
    }
  }
}
```

#### POST /users
Crear nuevo usuario.

**Required Permission:** `users.create`

**Request:**
```json
{
  "username": "new_user",
  "email": "newuser@example.com",
  "password": "secure_password",
  "first_name": "New",
  "last_name": "User",
  "phone": "+56912345678",
  "document_type": "id",
  "document_number": "87654321-0",
  "birth_date": "1985-05-15",
  "roles": ["TENANT"],
  "community_id": "uuid",
  "unit_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Usuario creado exitosamente",
  "data": {
    "user": {
      "id": "uuid",
      "username": "new_user",
      "email": "newuser@example.com",
      "first_name": "New",
      "last_name": "User",
      "status": "active",
      "created_at": "2024-01-01T10:00:00Z"
    }
  }
}
```

#### PUT /users/{id}
Actualizar usuario existente.

**Required Permission:** `users.update`

**Request:**
```json
{
  "first_name": "Updated",
  "last_name": "Name",
  "phone": "+56987654321",
  "status": "active"
}
```

#### DELETE /users/{id}
Eliminar usuario (soft delete).

**Required Permission:** `users.delete`

**Response:**
```json
{
  "success": true,
  "message": "Usuario eliminado exitosamente"
}
```

#### PUT /users/{id}/password
Cambiar contraseña de usuario.

**Request:**
```json
{
  "current_password": "old_password",
  "new_password": "new_secure_password"
}
```

#### POST /users/{id}/avatar
Subir avatar de usuario.

**Content-Type:** `multipart/form-data`

**Request:**
```
file: [image file]
```

#### GET /users/{id}/permissions
Obtener permisos efectivos del usuario.

**Query Parameters:**
```
community_id=uuid   # Permisos para comunidad específica
```

**Response:**
```json
{
  "success": true,
  "data": {
    "permissions": [
      {
        "code": "access.doors.open",
        "name": "Open Doors",
        "module": "access",
        "action": "doors.open",
        "risk_level": "low",
        "source": "role"
      }
    ],
    "roles": ["OWNER"],
    "community_id": "uuid"
  }
}
```

---

### 🔐 Permissions

#### GET /permissions
Listar todos los permisos disponibles.

**Query Parameters:**
```
module=access       # Filtrar por módulo
risk_level=high     # Filtrar por nivel de riesgo
search=door         # Búsqueda en nombre/descripción
```

**Response:**
```json
{
  "success": true,
  "data": {
    "permissions": [
      {
        "id": "uuid",
        "code": "access.doors.open",
        "module": "access",
        "action": "doors.open",
        "name": "Open Doors",
        "description": "Allow user to open doors",
        "risk_level": "low",
        "ui_elements": ["door_control_button"],
        "api_endpoints": ["/devices/door/open"],
        "dependencies": [],
        "is_active": true
      }
    ],
    "modules": ["access", "users", "financial", "devices"],
    "risk_levels": ["low", "medium", "high", "critical"]
  }
}
```

#### POST /permissions/{permission_id}/assign
Asignar permiso a usuario.

**Required Permission:** `users.permissions.manage`

**Request:**
```json
{
  "user_id": "uuid",
  "community_id": "uuid",
  "granted": true,
  "reason": "Special access required",
  "expires_at": "2024-12-31T23:59:59Z"
}
```

#### DELETE /permissions/{permission_id}/revoke
Revocar permiso de usuario.

**Request:**
```json
{
  "user_id": "uuid",
  "community_id": "uuid",
  "reason": "Access no longer needed"
}
```

#### GET /permissions/user/{user_id}
Ver permisos de un usuario específico.

**Response:**
```json
{
  "success": true,
  "data": {
    "user_id": "uuid",
    "community_id": "uuid",
    "effective_permissions": [
      {
        "code": "access.doors.open",
        "source": "role",
        "role": "OWNER"
      }
    ],
    "direct_permissions": [
      {
        "code": "financial.approve",
        "granted": true,
        "expires_at": "2024-12-31T23:59:59Z"
      }
    ]
  }
}
```

---

### 🏢 Communities

#### GET /communities
Listar comunidades.

**Query Parameters:**
```
page=1
limit=20
search=torres
country=CL
type=residential
status=active
```

**Response:**
```json
{
  "success": true,
  "data": {
    "communities": [
      {
        "id": "uuid",
        "code": "TORRES_SOL",
        "name": "Torres del Sol",
        "type": "condominium",
        "address": "Av. Principal 123",
        "city": "Santiago",
        "country": "Chile",
        "timezone": "America/Santiago",
        "logo_url": "https://...",
        "subscription_status": "active",
        "subscription_expires_at": "2024-12-31T23:59:59Z",
        "members_count": 150,
        "buildings_count": 2,
        "units_count": 120,
        "devices_count": 15,
        "is_active": true,
        "created_at": "2024-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 5,
      "pages": 1
    }
  }
}
```

#### GET /communities/{id}
Obtener comunidad específica.

**Response:**
```json
{
  "success": true,
  "data": {
    "community": {
      "id": "uuid",
      "code": "TORRES_SOL",
      "name": "Torres del Sol",
      "type": "condominium",
      "address": "Av. Principal 123",
      "city": "Santiago",
      "state": "Metropolitana",
      "postal_code": "7500000",
      "country": "Chile",
      "latitude": -33.4489,
      "longitude": -70.6693,
      "timezone": "America/Santiago",
      "contact_name": "Juan Pérez",
      "contact_email": "admin@torressol.cl",
      "contact_phone": "+56912345678",
      "logo_url": "https://...",
      "settings": {
        "access": {
          "max_failed_attempts": 5,
          "lockout_duration": 30
        },
        "financial": {
          "currency": "CLP",
          "payment_due_day": 5
        }
      },
      "subscription": {
        "plan": "premium",
        "status": "active",
        "expires_at": "2024-12-31T23:59:59Z"
      },
      "stats": {
        "members_count": 150,
        "buildings_count": 2,
        "units_count": 120,
        "devices_count": 15,
        "occupancy_rate": 85.5
      },
      "features": [
        {
          "code": "facial_recognition",
          "name": "Facial Recognition",
          "enabled": true
        }
      ]
    }
  }
}
```

#### POST /communities
Crear nueva comunidad.

**Required Permission:** `communities.create`

**Request:**
```json
{
  "code": "NEW_COMMUNITY",
  "name": "New Community",
  "type": "condominium",
  "address": "New Address 456",
  "city": "Santiago",
  "country_id": "uuid",
  "timezone": "America/Santiago",
  "contact_name": "Admin User",
  "contact_email": "admin@newcommunity.cl",
  "contact_phone": "+56987654321"
}
```

#### PUT /communities/{id}
Actualizar comunidad.

**Required Permission:** `communities.update`

#### GET /communities/{id}/members
Listar miembros de la comunidad.

**Response:**
```json
{
  "success": true,
  "data": {
    "members": [
      {
        "id": "uuid",
        "user": {
          "id": "uuid",
          "full_name": "John Doe",
          "email": "john@example.com"
        },
        "member_type": "owner",
        "unit": {
          "id": "uuid",
          "unit_number": "101",
          "building_name": "Torre A"
        },
        "move_in_date": "2024-01-01",
        "is_primary_resident": true,
        "is_active": true
      }
    ]
  }
}
```

#### GET /communities/{id}/features
Obtener features habilitadas.

**Response:**
```json
{
  "success": true,
  "data": {
    "features": [
      {
        "code": "facial_recognition",
        "name": "Facial Recognition",
        "enabled": true,
        "custom_settings": {
          "confidence_threshold": 0.85
        }
      }
    ]
  }
}
```

#### PUT /communities/{id}/features/{feature_code}
Configurar feature específica.

**Request:**
```json
{
  "enabled": true,
  "custom_settings": {
    "confidence_threshold": 0.90
  }
}
```

---

### 🔌 Devices

#### GET /devices
Listar dispositivos.

**Query Parameters:**
```
community_id=uuid
building_id=uuid
status=online
type=door
```

**Response:**
```json
{
  "success": true,
  "data": {
    "devices": [
      {
        "id": "uuid",
        "serial_number": "DEV001",
        "name": "Puerta Principal",
        "type": "access_control",
        "location": "Entrada Torre A",
        "ip_address": "192.168.1.100",
        "status": "online",
        "last_heartbeat": "2024-01-01T10:00:00Z",
        "firmware_version": "1.2.3",
        "building": {
          "id": "uuid",
          "name": "Torre A"
        },
        "capabilities": ["door_control", "card_reader", "facial_recognition"]
      }
    ]
  }
}
```

#### GET /devices/{id}
Obtener dispositivo específico.

#### POST /devices/{id}/command
Enviar comando a dispositivo.

**Required Permission:** `devices.control`

**Request:**
```json
{
  "command": "open_door",
  "parameters": {
    "duration": 5
  },
  "priority": 1
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "command_id": "uuid",
    "status": "queued",
    "estimated_execution": "2024-01-01T10:00:05Z"
  }
}
```

#### GET /devices/{id}/status
Obtener estado actual del dispositivo.

**Response:**
```json
{
  "success": true,
  "data": {
    "device_id": "uuid",
    "status": "online",
    "last_heartbeat": "2024-01-01T10:00:00Z",
    "metrics": {
      "cpu_usage": 25.5,
      "memory_usage": 45.2,
      "temperature": 35.0,
      "uptime_seconds": 86400
    },
    "capabilities_status": {
      "door_control": "operational",
      "card_reader": "operational",
      "facial_recognition": "calibrating"
    }
  }
}
```

---

### 🚪 Access Control

#### GET /access/logs
Obtener logs de acceso.

**Query Parameters:**
```
page=1
limit=50
from=2024-01-01T00:00:00Z
to=2024-01-01T23:59:59Z
user_id=uuid
access_point_id=uuid
granted=true
method=card
```

**Response:**
```json
{
  "success": true,
  "data": {
    "access_logs": [
      {
        "id": "uuid",
        "access_time": "2024-01-01T10:00:00Z",
        "user": {
          "id": "uuid",
          "full_name": "John Doe",
          "avatar_url": "https://..."
        },
        "access_point": {
          "id": "uuid",
          "name": "Puerta Principal",
          "location": "Entrada Torre A"
        },
        "access_method": "card",
        "direction": "in",
        "granted": true,
        "photo_url": "https://...",
        "facial_match_score": 0.95,
        "vehicle_plate": "AB1234",
        "response_time_ms": 150
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 1250
    },
    "summary": {
      "total_accesses": 1250,
      "granted": 1200,
      "denied": 50,
      "success_rate": 96.0
    }
  }
}
```

#### GET /access/points
Listar puntos de acceso.

**Response:**
```json
{
  "success": true,
  "data": {
    "access_points": [
      {
        "id": "uuid",
        "name": "Puerta Principal",
        "type": "door",
        "location": "Entrada Torre A",
        "direction": "both",
        "device": {
          "id": "uuid",
          "name": "Controller-001",
          "status": "online"
        },
        "is_emergency_exit": false,
        "anti_passback_enabled": true,
        "is_active": true
      }
    ]
  }
}
```

#### POST /access/authorize
Autorizar acceso manual.

**Required Permission:** `access.manual.authorize`

**Request:**
```json
{
  "access_point_id": "uuid",
  "user_id": "uuid",
  "reason": "Emergency access",
  "duration_seconds": 30
}
```

---

### 💰 Financial

#### GET /financial/transactions
Listar transacciones financieras.

**Query Parameters:**
```
page=1
limit=20
from=2024-01-01
to=2024-01-31
status=completed
amount_min=1000
amount_max=50000
```

#### GET /financial/expenses
Obtener gastos comunes.

#### POST /financial/expenses
Crear nuevos gastos comunes.

#### GET /financial/payments
Historial de pagos.

#### POST /financial/payments
Procesar nuevo pago.

---

### 📧 Notifications

#### GET /notifications
Obtener notificaciones del usuario.

#### POST /notifications/send
Enviar notificación.

#### PUT /notifications/{id}/read
Marcar notificación como leída.

---

### 📊 Reports

#### GET /reports/dashboard
Obtener datos del dashboard.

#### POST /reports/generate
Generar reporte personalizado.

#### GET /reports/{id}/download
Descargar reporte generado.

---

## 🔌 WebSocket Events

### Conexión
```javascript
const socket = io('ws://localhost:8000', {
  auth: {
    token: 'your_jwt_token'
  },
  query: {
    communityId: 'uuid'
  }
});
```

### Eventos del Cliente
```javascript
// Unirse a comunidad
socket.emit('join:community', 'community-uuid');

// Suscribirse a entidad específica
socket.emit('subscribe:entity', {
  type: 'device',
  id: 'device-uuid'
});

// Heartbeat
socket.emit('ping');
```

### Eventos del Servidor
```javascript
// Nuevo acceso
socket.on('access.new', (data) => {
  console.log('Nuevo acceso:', data);
});

// Actualización de permisos
socket.on('permissions.updated', (data) => {
  console.log('Permisos actualizados:', data);
});

// Alerta de dispositivo
socket.on('device.alert', (data) => {
  console.log('Alerta dispositivo:', data);
});

// Toggle de feature
socket.on('feature.toggled', (data) => {
  console.log('Feature cambiada:', data);
});

// Estado de dispositivo
socket.on('device.status', (data) => {
  console.log('Estado dispositivo:', data);
});
```

---

## 📝 Esquemas de Datos

### User Schema
```json
{
  "type": "object",
  "properties": {
    "id": {"type": "string", "format": "uuid"},
    "username": {"type": "string", "minLength": 3, "maxLength": 50},
    "email": {"type": "string", "format": "email"},
    "first_name": {"type": "string", "maxLength": 100},
    "last_name": {"type": "string", "maxLength": 100},
    "phone": {"type": "string", "pattern": "^\\+[1-9]\\d{1,14}$"},
    "status": {"type": "string", "enum": ["active", "inactive", "suspended"]},
    "created_at": {"type": "string", "format": "date-time"},
    "updated_at": {"type": "string", "format": "date-time"}
  },
  "required": ["username", "email", "first_name", "last_name"]
}
```

### Permission Schema
```json
{
  "type": "object",
  "properties": {
    "id": {"type": "string", "format": "uuid"},
    "code": {"type": "string", "pattern": "^[a-z]+\\.[a-z_]+\\.[a-z_]+$"},
    "module": {"type": "string"},
    "action": {"type": "string"},
    "name": {"type": "string"},
    "description": {"type": "string"},
    "risk_level": {"type": "string", "enum": ["low", "medium", "high", "critical"]},
    "is_active": {"type": "boolean"}
  },
  "required": ["code", "module", "action", "name"]
}
```

### Community Schema
```json
{
  "type": "object",
  "properties": {
    "id": {"type": "string", "format": "uuid"},
    "code": {"type": "string", "pattern": "^[A-Z0-9_]+$"},
    "name": {"type": "string", "maxLength": 200},
    "type": {"type": "string", "enum": ["building", "condominium", "office"]},
    "address": {"type": "string"},
    "city": {"type": "string"},
    "country": {"type": "string"},
    "timezone": {"type": "string"},
    "is_active": {"type": "boolean"}
  },
  "required": ["code", "name", "type", "address"]
}
```

---

## ⚠️ Códigos de Error

### Códigos de Estado HTTP
- `200` - OK
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `422` - Unprocessable Entity
- `429` - Too Many Requests
- `500` - Internal Server Error

### Códigos de Error Personalizados
```json
{
  "INVALID_CREDENTIALS": "Credenciales inválidas",
  "ACCOUNT_LOCKED": "Cuenta bloqueada temporalmente",
  "INSUFFICIENT_PERMISSIONS": "Permisos insuficientes",
  "COMMUNITY_NOT_FOUND": "Comunidad no encontrada",
  "USER_ALREADY_EXISTS": "Usuario ya existe",
  "DEVICE_OFFLINE": "Dispositivo no disponible",
  "FEATURE_NOT_ENABLED": "Funcionalidad no habilitada",
  "RATE_LIMIT_EXCEEDED": "Límite de requests excedido",
  "VALIDATION_ERROR": "Error de validación",
  "PAYMENT_FAILED": "Pago fallido",
  "OCR_PROCESSING_ERROR": "Error procesando OCR"
}
```

### Formato de Error Estándar
```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Descripción legible del error",
  "data": {
    "field": "Campo específico del error",
    "validation_errors": [
      {
        "field": "email",
        "message": "Email no válido",
        "code": "INVALID_FORMAT"
      }
    ]
  },
  "timestamp": "2024-01-01T10:00:00Z",
  "request_id": "uuid"
}
```

---

## 📖 Ejemplos de Uso

### Flujo Completo de Autenticación
```javascript
// 1. Login
const loginResponse = await fetch('/api/v1/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    username: 'admin@example.com',
    password: 'password123'
  })
});

const { data } = await loginResponse.json();
const { access_token, refresh_token } = data;

// 2. Usar token en requests
const usersResponse = await fetch('/api/v1/users', {
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  }
});

// 3. Refrescar token cuando expire
const refreshResponse = await fetch('/api/v1/auth/refresh', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    refresh_token: refresh_token
  })
});
```

### Gestión de Permisos Multi-tenant
```javascript
// Obtener permisos de usuario en comunidad específica
const permissions = await fetch('/api/v1/users/uuid/permissions', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'X-Community-ID': 'community-uuid'
  }
});

// Asignar permiso específico
await fetch('/api/v1/permissions/permission-uuid/assign', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    user_id: 'user-uuid',
    community_id: 'community-uuid',
    granted: true,
    expires_at: '2024-12-31T23:59:59Z'
  })
});
```

### Control de Dispositivos IoT
```javascript
// Obtener estado de dispositivo
const deviceStatus = await fetch('/api/v1/devices/device-uuid/status', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Enviar comando
await fetch('/api/v1/devices/device-uuid/command', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    command: 'open_door',
    parameters: { duration: 5 },
    priority: 1
  })
});
```

---

## 🧪 Testing

### Colección Postman
Una colección completa de Postman está disponible con todos los endpoints y ejemplos.

### Variables de Entorno
```json
{
  "base_url": "http://localhost:8000/api/v1",
  "access_token": "{{access_token}}",
  "community_id": "{{community_id}}"
}
```

### Scripts de Testing
```bash
# Ejecutar tests de API
npm run test:api

# Ejecutar tests de integración
npm run test:integration

# Ejecutar tests de carga
npm run test:load
```

---

## 📚 Recursos Adicionales

- **OpenAPI Spec**: `/api/v1/docs/openapi.json`
- **Swagger UI**: `/api/v1/docs`
- **Postman Collection**: `./docs/postman/SKYN3T-API.json`
- **SDK JavaScript**: `@skyn3t/api-client`
- **Ejemplos de Código**: `./examples/`

---

**API Version**: 2.5.0  
**Última Actualización**: 2025-06-06  
**Soporte**: api-support@skyn3t.com