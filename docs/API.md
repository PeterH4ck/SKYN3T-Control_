# 🌐 API DOCUMENTATION - SKYN3T ACCESS CONTROL

![API Version](https://img.shields.io/badge/API%20Version-v2.8.0-blue.svg)
![OpenAPI](https://img.shields.io/badge/OpenAPI-3.1.0-green.svg)
![Status](https://img.shields.io/badge/Status-Production%20Ready-brightgreen.svg)
![Services](https://img.shields.io/badge/Microservices-8%20Services-orange.svg)

## 📋 Descripción General

La API de SKYN3T Access Control es una suite completa de APIs RESTful distribuidas en múltiples microservicios, diseñada para proporcionar control de acceso integral para comunidades residenciales y corporativas. Implementa autenticación JWT, autorización granular basada en roles, comunicación IoT en tiempo real y procesamiento inteligente con ML/OCR.

### URLs Base
```
Desarrollo: http://localhost:8000/api/v1
Staging: https://staging-api.skyn3t.com/v1
Producción: https://api.skyn3t.com/v1
```

### Microservicios Disponibles
- **🔐 Auth Service** (Puerto 3001) - Autenticación y autorización
- **👥 User Service** (Puerto 3003) - Gestión de usuarios  
- **🔑 Permission Service** (Puerto 3002) - Motor de permisos granulares
- **🔌 Device Service** (Puerto 3004) - Control de dispositivos IoT
- **💰 Payment Service** (Puerto 3005) - Procesamiento de pagos
- **📧 Notification Service** (Puerto 3006) - Comunicaciones omnicanal
- **📊 Analytics Service** (Puerto 3007) - Business Intelligence y ML
- **🔍 OCR Service** (Puerto 5000) - Reconocimiento óptico de caracteres

### Características Principales
- **RESTful**: Arquitectura REST estándar con HATEOAS
- **JWT Authentication**: Tokens seguros con refresh automático
- **Multi-tenant**: Aislamiento completo por comunidad
- **Real-time**: WebSocket para actualizaciones instantáneas
- **Rate Limiting**: Protección avanzada contra abuso
- **ML/AI Integration**: Reconocimiento facial y OCR
- **Event-Driven**: Arquitectura basada en eventos
- **Auto-scaling**: Escalado automático bajo demanda

---

## 🔐 Autenticación y Autorización

### JWT Bearer Token con Refresh
Todas las rutas protegidas requieren un token JWT válido.

```http
Authorization: Bearer {access_token}
Content-Type: application/json
X-Community-ID: {community_id}  # Requerido para operaciones multi-tenant
X-Request-ID: {uuid}            # Opcional para tracking
X-Client-Version: 2.8.0         # Recomendado para compatibilidad
```

### Headers de Rate Limiting
```http
X-RateLimit-Limit: 1000         # Requests por ventana
X-RateLimit-Remaining: 995      # Requests restantes  
X-RateLimit-Reset: 1640995200   # Reset timestamp
X-RateLimit-Retry-After: 60     # Segundos para retry (si limitado)
```

### Niveles de Autorización

#### Jerarquía de Roles (11 niveles)
```
1. SYSTEM_ADMIN      - Administrador del sistema
2. PLATFORM_ADMIN    - Administrador de plataforma
3. COMMUNITY_ADMIN   - Administrador de comunidad
4. BUILDING_ADMIN    - Administrador de edificio
5. SECURITY_MANAGER  - Gerente de seguridad
6. PROPERTY_MANAGER  - Administrador de propiedades
7. OWNER            - Propietario
8. TENANT           - Arrendatario
9. RESIDENT         - Residente
10. VISITOR         - Visitante
11. GUEST          - Invitado
```

---

## 📚 Endpoints por Microservicio

### 🔐 Auth Service

#### POST /auth/login
Autenticar usuario con soporte multi-factor.

**Request:**
```json
{
  "username": "admin@example.com",
  "password": "securePassword123!",
  "remember": true,
  "two_factor_code": "123456",
  "device_fingerprint": "fp_1234567890abcdef",
  "community_code": "TORRES_SOL"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login exitoso",
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "admin",
      "email": "admin@example.com",
      "full_name": "Administrator User",
      "avatar_url": "https://cdn.skyn3t.com/avatars/admin.jpg",
      "email_verified": true,
      "last_login": "2024-06-24T10:30:00Z",
      "preferences": {
        "language": "es",
        "timezone": "America/Santiago",
        "theme": "dark"
      }
    },
    "roles": [
      {
        "id": "role_001",
        "code": "COMMUNITY_ADMIN",
        "name": "Community Administrator",
        "level": 3,
        "community_id": "comm_001"
      }
    ],
    "permissions": [
      "users.create", "users.update", "users.delete",
      "devices.control", "financial.view", "reports.generate"
    ],
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 900,
    "refresh_expires_in": 2592000,
    "session_id": "sess_1234567890",
    "redirect": "/dashboard"
  }
}
```

#### POST /auth/2fa/setup
Configurar autenticación de dos factores.

**Response:**
```json
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "qr_code": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "backup_codes": [
      "12345678", "87654321", "11223344", "44332211", "99887766"
    ],
    "setup_url": "otpauth://totp/SKYN3T:admin@example.com?secret=JBSWY3DPEHPK3PXP&issuer=SKYN3T"
  }
}
```

#### GET /auth/session
Verificar sesión actual con permisos efectivos.

**Response:**
```json
{
  "authenticated": true,
  "session": {
    "id": "sess_1234567890",
    "created_at": "2024-06-24T10:30:00Z",
    "expires_at": "2024-06-24T11:45:00Z",
    "ip_address": "192.168.1.100",
    "user_agent": "Mozilla/5.0...",
    "device_fingerprint": "fp_1234567890abcdef"
  },
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "admin",
    "effective_permissions": {
      "community_001": [
        "users.create", "users.update", "devices.control"
      ]
    },
    "active_community": "community_001"
  }
}
```

---

### 👥 User Service

#### GET /users
Listar usuarios con filtros avanzados y paginación.

**Query Parameters:**
```
page=1                    # Página (default: 1)
limit=20                  # Items por página (default: 20, max: 100)
search=john               # Búsqueda en nombre/email/documento
status=active,inactive    # Filtrar por estado (multiple)
role=OWNER,TENANT        # Filtrar por rol (multiple)
community_id=uuid        # Filtrar por comunidad
building_id=uuid         # Filtrar por edificio
unit_number=101          # Filtrar por unidad
created_after=2024-01-01 # Filtrar por fecha de creación
sort=created_at          # Campo ordenamiento
order=desc               # Dirección ordenamiento (asc/desc)
include=roles,permissions,communities # Incluir relaciones
```

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "user_001",
        "username": "john_doe",
        "email": "john@example.com",
        "first_name": "John",
        "last_name": "Doe",
        "full_name": "John Doe",
        "phone": "+56912345678",
        "document_type": "rut",
        "document_number": "12345678-9",
        "birth_date": "1990-01-01",
        "gender": "male",
        "status": "active",
        "avatar_url": "https://cdn.skyn3t.com/avatars/john.jpg",
        "email_verified": true,
        "phone_verified": true,
        "last_login": "2024-06-24T09:15:00Z",
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-06-24T10:30:00Z",
        "metadata": {
          "emergency_contact": {
            "name": "Jane Doe",
            "phone": "+56987654321",
            "relationship": "spouse"
          },
          "preferences": {
            "notifications": {
              "email": true,
              "sms": false,
              "push": true
            }
          }
        },
        "roles": [
          {
            "id": "role_002",
            "code": "OWNER",
            "name": "Property Owner",
            "community": {
              "id": "comm_001",
              "name": "Torres del Sol"
            }
          }
        ],
        "permissions": ["access.doors.open", "financial.view"],
        "communities": [
          {
            "id": "comm_001",
            "name": "Torres del Sol",
            "member_type": "owner",
            "unit": {
              "id": "unit_001",
              "number": "101",
              "building": "Torre A",
              "floor": 1
            },
            "move_in_date": "2024-01-01",
            "is_primary_resident": true
          }
        ]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "pages": 8,
      "has_next": true,
      "has_prev": false
    },
    "filters_applied": {
      "status": ["active"],
      "community_id": "comm_001"
    }
  }
}
```

#### POST /users
Crear nuevo usuario con validaciones avanzadas.

**Request:**
```json
{
  "username": "new_user",
  "email": "newuser@example.com",
  "password": "SecureP@ssw0rd123!",
  "first_name": "New",
  "last_name": "User",
  "phone": "+56912345678",
  "document_type": "rut",
  "document_number": "87654321-0",
  "birth_date": "1985-05-15",
  "gender": "female",
  "roles": ["TENANT"],
  "community_assignments": [
    {
      "community_id": "comm_001",
      "unit_id": "unit_002",
      "member_type": "tenant",
      "move_in_date": "2024-07-01",
      "lease_end_date": "2025-07-01",
      "is_primary_resident": true
    }
  ],
  "emergency_contact": {
    "name": "Emergency Contact",
    "phone": "+56987654321",
    "relationship": "family"
  },
  "preferences": {
    "language": "es",
    "timezone": "America/Santiago",
    "notifications": {
      "email": true,
      "sms": false,
      "push": true
    }
  }
}
```

#### GET /users/{id}/activity
Obtener actividad y logs del usuario.

**Query Parameters:**
```
from=2024-06-01T00:00:00Z    # Fecha inicio
to=2024-06-24T23:59:59Z      # Fecha fin
type=login,access,permission # Tipos de actividad
limit=50                     # Límite de resultados
```

**Response:**
```json
{
  "success": true,
  "data": {
    "activities": [
      {
        "id": "activity_001",
        "type": "access",
        "action": "door_opened",
        "timestamp": "2024-06-24T08:30:00Z",
        "details": {
          "access_point": "Puerta Principal Torre A",
          "method": "facial_recognition",
          "granted": true,
          "response_time_ms": 150
        },
        "metadata": {
          "ip_address": "192.168.1.100",
          "user_agent": "SKYN3T Mobile v2.8.0"
        }
      },
      {
        "id": "activity_002", 
        "type": "login",
        "action": "user_login",
        "timestamp": "2024-06-24T08:00:00Z",
        "details": {
          "method": "password_2fa",
          "success": true,
          "session_duration": 3600
        }
      }
    ],
    "summary": {
      "total_activities": 45,
      "by_type": {
        "access": 30,
        "login": 10,
        "permission": 5
      },
      "success_rate": 98.5
    }
  }
}
```

---

### 🔑 Permission Service

#### GET /permissions/user/{user_id}/effective
Obtener permisos efectivos con herencia calculada.

**Query Parameters:**
```
community_id=uuid           # Permisos para comunidad específica
include_inherited=true      # Incluir permisos heredados
include_temporary=true      # Incluir permisos temporales
expand_details=true         # Expandir detalles de permisos
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user_id": "user_001",
    "community_id": "comm_001",
    "calculated_at": "2024-06-24T10:30:00Z",
    "effective_permissions": [
      {
        "code": "access.doors.open",
        "name": "Open Access Doors",
        "module": "access",
        "action": "doors.open",
        "risk_level": "low",
        "source": "role",
        "source_details": {
          "role_code": "OWNER",
          "role_name": "Property Owner",
          "inherited": false
        },
        "conditions": {
          "time_restrictions": null,
          "location_restrictions": ["building_001"],
          "device_restrictions": null
        },
        "expires_at": null
      },
      {
        "code": "financial.approve.expenses",
        "name": "Approve Expenses", 
        "module": "financial",
        "action": "approve.expenses",
        "risk_level": "high",
        "source": "direct",
        "source_details": {
          "granted_by": "user_admin",
          "granted_at": "2024-06-01T00:00:00Z",
          "reason": "Temporary treasurer duties"
        },
        "conditions": {
          "amount_limit": 50000,
          "approval_required": true
        },
        "expires_at": "2024-12-31T23:59:59Z"
      }
    ],
    "permission_matrix": {
      "access": {
        "doors": ["open", "schedule"],
        "gates": ["open"],
        "elevators": ["use"]
      },
      "financial": {
        "view": ["own_statements", "community_summary"],
        "approve": ["expenses"]
      },
      "users": {
        "view": ["basic_info"],
        "manage": []
      }
    },
    "restrictions": {
      "time_based": [],
      "location_based": ["building_001"],
      "device_based": [],
      "amount_based": {"max_expense_approval": 50000}
    }
  }
}
```

#### POST /permissions/bulk-assign
Asignar permisos masivamente con validaciones.

**Request:**
```json
{
  "assignments": [
    {
      "user_id": "user_001",
      "permission_code": "financial.view.statements",
      "community_id": "comm_001",
      "granted": true,
      "conditions": {
        "time_restrictions": {
          "start_time": "08:00",
          "end_time": "18:00",
          "days_of_week": ["monday", "tuesday", "wednesday", "thursday", "friday"]
        }
      },
      "expires_at": "2024-12-31T23:59:59Z",
      "reason": "Temporary access for audit"
    }
  ],
  "options": {
    "validate_conflicts": true,
    "notify_users": true,
    "effective_immediately": true
  }
}
```

#### GET /permissions/audit-trail
Auditoría completa de cambios de permisos.

**Query Parameters:**
```
from=2024-06-01              # Fecha inicio
to=2024-06-24                # Fecha fin
user_id=user_001             # Usuario específico
permission_code=access.*     # Permiso específico (wildcards soportados)
action=granted,revoked       # Tipos de acción
community_id=comm_001        # Comunidad específica
page=1                       # Paginación
limit=50
```

**Response:**
```json
{
  "success": true,
  "data": {
    "audit_entries": [
      {
        "id": "audit_001",
        "timestamp": "2024-06-24T09:15:00Z",
        "action": "permission_granted",
        "user_id": "user_001",
        "permission_code": "financial.approve.expenses",
        "community_id": "comm_001",
        "granted_by": {
          "user_id": "admin_001",
          "username": "admin",
          "full_name": "System Administrator"
        },
        "previous_state": {
          "granted": false
        },
        "new_state": {
          "granted": true,
          "conditions": {"amount_limit": 50000},
          "expires_at": "2024-12-31T23:59:59Z"
        },
        "reason": "Temporary treasurer duties",
        "metadata": {
          "ip_address": "192.168.1.50",
          "user_agent": "Mozilla/5.0...",
          "session_id": "sess_admin_001"
        }
      }
    ],
    "summary": {
      "total_changes": 156,
      "by_action": {
        "granted": 89,
        "revoked": 45,
        "modified": 22
      },
      "by_user": {
        "admin_001": 78,
        "manager_001": 45,
        "system": 33
      }
    }
  }
}
```

---

### 🔌 Device Service

#### GET /devices
Listar dispositivos IoT con estado en tiempo real.

**Query Parameters:**
```
community_id=uuid          # Filtrar por comunidad
building_id=uuid          # Filtrar por edificio
type=door,gate,elevator   # Tipo de dispositivo
status=online,offline     # Estado de conectividad
location=entrance         # Filtrar por ubicación
capabilities=facial_recognition # Filtrar por capacidades
include_metrics=true      # Incluir métricas de rendimiento
```

**Response:**
```json
{
  "success": true,
  "data": {
    "devices": [
      {
        "id": "device_001",
        "serial_number": "SKYN3T-AC-001",
        "name": "Puerta Principal Torre A",
        "type": "access_control",
        "model": "SmartDoor Pro v3",
        "manufacturer": "SKYN3T",
        "firmware_version": "3.2.1",
        "hardware_version": "1.0",
        "location": {
          "building_id": "building_001",
          "building_name": "Torre A",
          "floor": 0,
          "zone": "entrance",
          "coordinates": {
            "latitude": -33.4489,
            "longitude": -70.6693
          }
        },
        "network": {
          "ip_address": "192.168.1.100",
          "mac_address": "00:1B:44:11:3A:B7",
          "wifi_ssid": "SKYN3T-IoT",
          "signal_strength": -45
        },
        "status": {
          "connectivity": "online",
          "operational": "normal",
          "last_heartbeat": "2024-06-24T10:29:45Z",
          "uptime_seconds": 86400,
          "last_reboot": "2024-06-23T10:30:00Z"
        },
        "capabilities": [
          {
            "name": "door_control",
            "status": "operational",
            "last_used": "2024-06-24T08:30:00Z"
          },
          {
            "name": "card_reader",
            "status": "operational", 
            "last_used": "2024-06-24T07:45:00Z"
          },
          {
            "name": "facial_recognition",
            "status": "calibrating",
            "confidence_threshold": 0.85,
            "last_training": "2024-06-24T06:00:00Z"
          },
          {
            "name": "qr_scanner",
            "status": "operational",
            "last_used": "2024-06-24T09:15:00Z"
          }
        ],
        "metrics": {
          "cpu_usage": 25.5,
          "memory_usage": 45.2,
          "temperature": 35.0,
          "storage_used": 67.8,
          "commands_processed_today": 145,
          "avg_response_time_ms": 120
        },
        "configuration": {
          "auto_lock_delay": 5,
          "max_unlock_duration": 10,
          "emergency_unlock": true,
          "facial_recognition_enabled": true,
          "motion_detection": true
        },
        "maintenance": {
          "last_maintenance": "2024-06-01T00:00:00Z",
          "next_maintenance": "2024-09-01T00:00:00Z",
          "maintenance_alerts": [],
          "warranty_expires": "2025-06-01T00:00:00Z"
        }
      }
    ],
    "summary": {
      "total_devices": 15,
      "by_status": {
        "online": 14,
        "offline": 1
      },
      "by_type": {
        "access_control": 8,
        "camera": 4,
        "sensor": 3
      }
    }
  }
}
```

#### POST /devices/{id}/commands
Enviar comandos a dispositivos con cola de prioridades.

**Request:**
```json
{
  "command": "open_door",
  "parameters": {
    "duration": 5,
    "force": false,
    "reason": "authorized_access",
    "user_id": "user_001"
  },
  "priority": 1,
  "timeout": 30,
  "retry_attempts": 3,
  "callback_url": "https://api.skyn3t.com/webhooks/device-command-result"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "command_id": "cmd_1234567890",
    "status": "queued",
    "estimated_execution": "2024-06-24T10:30:05Z",
    "queue_position": 1,
    "expires_at": "2024-06-24T10:31:00Z"
  }
}
```

#### GET /devices/{id}/status/real-time
Stream de estado en tiempo real via WebSocket.

**WebSocket Connection:**
```javascript
const socket = io('wss://api.skyn3t.com/devices/device_001/status', {
  auth: { token: 'jwt_token' }
});

socket.on('status_update', (data) => {
  console.log('Device status:', data);
  // {
  //   "device_id": "device_001",
  //   "timestamp": "2024-06-24T10:30:00Z",
  //   "status": "online",
  //   "metrics": {
  //     "cpu_usage": 26.1,
  //     "memory_usage": 45.8,
  //     "temperature": 35.2
  //   }
  // }
});
```

---

### 💰 Payment Service

#### GET /payments/transactions
Historial de transacciones con filtros avanzados.

**Query Parameters:**
```
from=2024-06-01              # Fecha inicio
to=2024-06-24                # Fecha fin
status=completed,pending     # Estado de transacción
type=expense,payment,fee     # Tipo de transacción
amount_min=1000              # Monto mínimo
amount_max=50000             # Monto máximo
currency=CLP,USD             # Moneda
payment_method=bank,card     # Método de pago
community_id=comm_001        # Comunidad específica
user_id=user_001             # Usuario específico
include_fees=true            # Incluir comisiones
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "txn_001",
        "type": "payment",
        "status": "completed",
        "amount": {
          "value": 125000,
          "currency": "CLP",
          "formatted": "$125.000"
        },
        "description": "Gastos comunes Junio 2024",
        "payment_method": {
          "type": "bank_transfer",
          "bank": "Banco Estado",
          "account_last_digits": "1234",
          "reference": "TRF123456789"
        },
        "parties": {
          "payer": {
            "user_id": "user_001",
            "name": "John Doe",
            "email": "john@example.com"
          },
          "payee": {
            "community_id": "comm_001",
            "name": "Torres del Sol",
            "tax_id": "76123456-7"
          }
        },
        "timestamps": {
          "created_at": "2024-06-01T09:00:00Z",
          "processed_at": "2024-06-01T09:05:32Z",
          "completed_at": "2024-06-01T09:06:15Z"
        },
        "fees": {
          "processing_fee": {
            "amount": 2500,
            "currency": "CLP",
            "percentage": 2.0
          },
          "bank_fee": {
            "amount": 0,
            "currency": "CLP"
          }
        },
        "metadata": {
          "period": "2024-06",
          "invoice_id": "INV-2024-06-001",
          "due_date": "2024-06-05",
          "paid_late": false,
          "late_fee": 0
        },
        "reconciliation": {
          "bank_statement_id": "stmt_001",
          "reconciled_at": "2024-06-01T10:00:00Z",
          "reconciled_by": "system"
        }
      }
    ],
    "summary": {
      "total_transactions": 89,
      "total_amount": {
        "value": 5675000,
        "currency": "CLP"
      },
      "by_status": {
        "completed": 85,
        "pending": 3,
        "failed": 1
      },
      "by_type": {
        "payment": 75,
        "expense": 10,
        "fee": 4
      }
    },
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 89,
      "pages": 5
    }
  }
}
```

#### POST /payments/process
Procesar nuevo pago con múltiples métodos.

**Request:**
```json
{
  "amount": {
    "value": 125000,
    "currency": "CLP"
  },
  "payment_method": {
    "type": "bank_transfer",
    "bank_code": "001",  // Banco Estado
    "account_type": "checking",
    "save_method": true
  },
  "description": "Gastos comunes Julio 2024",
  "items": [
    {
      "description": "Cuota administración",
      "amount": 85000,
      "category": "administration"
    },
    {
      "description": "Fondo reserva",
      "amount": 25000,
      "category": "reserve"
    },
    {
      "description": "Agua común",
      "amount": 15000,
      "category": "utilities"
    }
  ],
  "community_id": "comm_001",
  "due_date": "2024-07-05",
  "notification_preferences": {
    "email": true,
    "sms": false,
    "push": true
  },
  "metadata": {
    "period": "2024-07",
    "unit_id": "unit_001"
  }
}
```

#### GET /payments/methods
Métodos de pago disponibles por región.

**Response:**
```json
{
  "success": true,
  "data": {
    "payment_methods": [
      {
        "type": "bank_transfer",
        "name": "Transferencia Bancaria",
        "supported_banks": [
          {
            "code": "001",
            "name": "Banco Estado",
            "icon": "https://cdn.skyn3t.com/banks/banco-estado.png",
            "processing_time": "immediate",
            "fees": {
              "fixed": 0,
              "percentage": 0
            }
          },
          {
            "code": "012",
            "name": "Banco Santander",
            "icon": "https://cdn.skyn3t.com/banks/santander.png", 
            "processing_time": "immediate",
            "fees": {
              "fixed": 0,
              "percentage": 0
            }
          }
        ],
        "limits": {
          "min_amount": 1000,
          "max_amount": 5000000,
          "daily_limit": 2000000
        }
      },
      {
        "type": "credit_card",
        "name": "Tarjeta de Crédito",
        "supported_networks": ["visa", "mastercard", "amex"],
        "fees": {
          "fixed": 0,
          "percentage": 2.9
        },
        "limits": {
          "min_amount": 1000,
          "max_amount": 1000000
        }
      },
      {
        "type": "digital_wallet",
        "name": "Billetera Digital",
        "providers": [
          {
            "name": "PayPal",
            "icon": "https://cdn.skyn3t.com/wallets/paypal.png",
            "fees": {"percentage": 3.4}
          },
          {
            "name": "MercadoPago",
            "icon": "https://cdn.skyn3t.com/wallets/mercadopago.png",
            "fees": {"percentage": 2.99}
          }
        ]
      }
    ]
  }
}
```

---

### 📧 Notification Service

#### POST /notifications/send
Enviar notificación omnicanal.

**Request:**
```json
{
  "recipients": [
    {
      "user_id": "user_001",
      "channels": ["email", "push"],
      "preferences": {
        "language": "es",
        "timezone": "America/Santiago"
      }
    }
  ],
  "template": {
    "id": "access_granted",
    "variables": {
      "user_name": "John Doe",
      "access_point": "Puerta Principal",
      "timestamp": "2024-06-24T08:30:00Z",
      "photo_url": "https://cdn.skyn3t.com/access-photos/photo_001.jpg"
    }
  },
  "channels": {
    "email": {
      "subject": "Acceso autorizado - {{access_point}}",
      "priority": "normal",
      "track_opens": true,
      "track_clicks": true
    },
    "push": {
      "title": "Acceso autorizado",
      "body": "Acceso exitoso en {{access_point}}",
      "icon": "access_granted",
      "action_buttons": [
        {
          "title": "Ver detalles",
          "action": "open_app",
          "url": "/access-logs/latest"
        }
      ]
    },
    "sms": {
      "message": "Acceso autorizado en {{access_point}} a las {{timestamp}}",
      "sender_id": "SKYN3T"
    }
  },
  "scheduling": {
    "send_at": "immediate",
    "timezone": "America/Santiago"
  },
  "options": {
    "respect_user_preferences": true,
    "fallback_to_email": true,
    "track_delivery": true
  }
}
```

#### GET /notifications/templates
Plantillas de notificación disponibles.

**Response:**
```json
{
  "success": true,
  "data": {
    "templates": [
      {
        "id": "access_granted",
        "name": "Acceso Autorizado",
        "category": "security",
        "description": "Notificación cuando se autoriza acceso",
        "supported_channels": ["email", "sms", "push"],
        "variables": [
          {
            "name": "user_name",
            "type": "string",
            "required": true,
            "description": "Nombre del usuario"
          },
          {
            "name": "access_point",
            "type": "string",
            "required": true,
            "description": "Punto de acceso"
          },
          {
            "name": "timestamp",
            "type": "datetime",
            "required": true,
            "description": "Fecha y hora del acceso"
          }
        ],
        "preview": {
          "email": {
            "subject": "Acceso autorizado - Puerta Principal",
            "html": "<html>...</html>"
          },
          "push": {
            "title": "Acceso autorizado",
            "body": "Acceso exitoso en Puerta Principal"
          }
        }
      }
    ]
  }
}
```

---

### 📊 Analytics Service

#### GET /analytics/dashboard
Dashboard principal con métricas clave.

**Query Parameters:**
```
period=1d,7d,30d,90d        # Período de análisis
community_id=comm_001       # Comunidad específica
include_predictions=true    # Incluir predicciones ML
refresh_cache=false         # Forzar recálculo
```

**Response:**
```json
{
  "success": true,
  "data": {
    "period": {
      "start": "2024-05-25T00:00:00Z",
      "end": "2024-06-24T23:59:59Z",
      "days": 30
    },
    "metrics": {
      "access_control": {
        "total_accesses": 2847,
        "successful_accesses": 2789,
        "failed_accesses": 58,
        "success_rate": 97.96,
        "average_response_time": 145,
        "peak_hour": "08:00",
        "trend": "increasing",
        "change_percentage": 12.5
      },
      "user_activity": {
        "active_users": 156,
        "new_registrations": 8,
        "login_frequency": 4.2,
        "most_active_day": "monday",
        "engagement_score": 8.7
      },
      "financial": {
        "total_transactions": 89,
        "total_amount": 5675000,
        "payment_success_rate": 96.6,
        "average_payment_time": "2.3 days",
        "late_payments": 3,
        "collection_efficiency": 94.2
      },
      "device_performance": {
        "total_devices": 15,
        "online_devices": 14,
        "average_uptime": 99.2,
        "alerts_generated": 5,
        "maintenance_due": 2
      }
    },
    "charts": {
      "access_trends": {
        "labels": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        "datasets": [
          {
            "label": "Accesos exitosos",
            "data": [145, 132, 158, 167, 143, 89, 76],
            "color": "#4CAF50"
          },
          {
            "label": "Accesos fallidos", 
            "data": [3, 2, 4, 5, 2, 1, 1],
            "color": "#F44336"
          }
        ]
      },
      "financial_trends": {
        "labels": ["Ene", "Feb", "Mar", "Abr", "May", "Jun"],
        "datasets": [
          {
            "label": "Ingresos",
            "data": [5200000, 5350000, 5180000, 5425000, 5675000, 5890000],
            "color": "#2196F3"
          }
        ]
      }
    },
    "alerts": [
      {
        "id": "alert_001",
        "type": "device_offline",
        "severity": "warning",
        "message": "Cámara entrada trasera desconectada",
        "timestamp": "2024-06-24T09:15:00Z",
        "device_id": "device_008"
      }
    ],
    "predictions": {
      "access_volume": {
        "next_hour": 45,
        "next_day": 187,
        "confidence": 0.87
      },
      "payment_collection": {
        "expected_this_month": 5890000,
        "risk_late_payments": 0.15,
        "confidence": 0.92
      }
    }
  }
}
```

#### POST /analytics/reports/generate
Generar reportes personalizados.

**Request:**
```json
{
  "report_type": "access_summary",
  "period": {
    "start": "2024-06-01T00:00:00Z",
    "end": "2024-06-24T23:59:59Z"
  },
  "filters": {
    "community_id": "comm_001",
    "building_ids": ["building_001", "building_002"],
    "user_roles": ["OWNER", "TENANT"]
  },
  "metrics": [
    "total_accesses",
    "success_rate",
    "peak_hours",
    "device_performance",
    "user_activity"
  ],
  "grouping": {
    "by": "day",
    "secondary": "building"
  },
  "format": "pdf",
  "delivery": {
    "email": "admin@example.com",
    "notify_when_ready": true
  },
  "options": {
    "include_charts": true,
    "include_raw_data": false,
    "watermark": true
  }
}
```

---

### 🔍 OCR Service

#### POST /ocr/process/receipt
Procesar recibo o factura con OCR.

**Content-Type:** `multipart/form-data`

**Request:**
```
file: [image/pdf file]
type: receipt|invoice|contract
enhance_image: true
extract_tables: true
confidence_threshold: 0.85
language: es
```

**Response:**
```json
{
  "success": true,
  "data": {
    "document_id": "doc_001",
    "processing_time_ms": 2350,
    "confidence_score": 0.92,
    "document_type": "receipt",
    "extracted_data": {
      "vendor": {
        "name": "Ferretería Central",
        "address": "Av. Principal 456, Santiago",
        "phone": "+56212345678",
        "tax_id": "76123456-7"
      },
      "transaction": {
        "number": "R-2024-001234",
        "date": "2024-06-24",
        "time": "14:30:00",
        "total_amount": 45750,
        "currency": "CLP",
        "payment_method": "Efectivo"
      },
      "items": [
        {
          "description": "Tubo PVC 110mm x 3m",
          "quantity": 2,
          "unit_price": 15900,
          "total": 31800,
          "category": "materiales"
        },
        {
          "description": "Pegamento PVC 250ml",
          "quantity": 1,
          "unit_price": 8950,
          "total": 8950,
          "category": "herramientas"
        }
      ],
      "taxes": {
        "iva": {
          "rate": 19,
          "amount": 7308
        }
      }
    },
    "metadata": {
      "image_quality": "good",
      "text_regions": 15,
      "processing_method": "tesseract_5",
      "language_detected": "es"
    },
    "validation": {
      "total_verified": true,
      "tax_calculation_verified": true,
      "format_valid": true,
      "suspicious_patterns": []
    }
  }
}
```

#### POST /ocr/process/license-plate
Reconocimiento de patentes vehiculares.

**Response:**
```json
{
  "success": true,
  "data": {
    "processing_time_ms": 450,
    "confidence_score": 0.96,
    "license_plate": {
      "text": "AB1234",
      "format": "chilean_standard",
      "country": "Chile",
      "region": "Metropolitana"
    },
    "vehicle_detection": {
      "type": "automobile",
      "color": "blanco",
      "brand_detected": "Toyota",
      "confidence": 0.78
    },
    "image_analysis": {
      "quality": "excellent",
      "lighting": "good",
      "angle": "frontal",
      "occlusions": "none"
    },
    "coordinates": {
      "plate_location": {
        "x": 145,
        "y": 289,
        "width": 180,
        "height": 45
      }
    }
  }
}
```

---

## 🔌 WebSocket Real-time Events

### Conexión y Autenticación
```javascript
const socket = io('wss://api.skyn3t.com', {
  auth: {
    token: 'your_jwt_token'
  },
  query: {
    communityId: 'comm_001',
    userId: 'user_001'
  },
  transports: ['websocket']
});

// Manejo de conexión
socket.on('connect', () => {
  console.log('Conectado:', socket.id);
});

socket.on('authenticated', (data) => {
  console.log('Autenticado:', data.user);
});
```

### Eventos del Cliente
```javascript
// Unirse a canales específicos
socket.emit('join:community', 'comm_001');
socket.emit('join:building', 'building_001');
socket.emit('subscribe:device', 'device_001');

// Heartbeat personalizado
socket.emit('ping', { timestamp: Date.now() });

// Solicitar estado actual
socket.emit('request:device_status', 'device_001');
```

### Eventos del Servidor

#### Eventos de Acceso
```javascript
socket.on('access.granted', (data) => {
  // {
  //   "event_id": "evt_001",
  //   "timestamp": "2024-06-24T10:30:00Z",
  //   "access_point_id": "device_001",
  //   "access_point_name": "Puerta Principal",
  //   "user": {
  //     "id": "user_001",
  //     "name": "John Doe",
  //     "avatar_url": "https://..."
  //   },
  //   "method": "facial_recognition",
  //   "confidence": 0.96,
  //   "response_time_ms": 150,
  //   "photo_url": "https://cdn.skyn3t.com/access-photos/001.jpg"
  // }
});

socket.on('access.denied', (data) => {
  // Similar structure with denial reason
});
```

#### Eventos de Dispositivos
```javascript
socket.on('device.status_changed', (data) => {
  // {
  //   "device_id": "device_001",
  //   "previous_status": "online",
  //   "current_status": "offline",
  //   "timestamp": "2024-06-24T10:30:00Z",
  //   "reason": "network_timeout"
  // }
});

socket.on('device.alert', (data) => {
  // {
  //   "device_id": "device_001",
  //   "alert_type": "maintenance_required",
  //   "severity": "warning",
  //   "message": "Door sensor calibration needed",
  //   "timestamp": "2024-06-24T10:30:00Z"
  // }
});
```

#### Eventos de Notificaciones
```javascript
socket.on('notification.new', (data) => {
  // {
  //   "id": "notif_001",
  //   "type": "payment_reminder",
  //   "title": "Pago pendiente",
  //   "message": "Tienes un pago pendiente por $125.000",
  //   "priority": "normal",
  //   "actions": [
  //     {
  //       "label": "Pagar ahora",
  //       "action": "payment",
  //       "url": "/payments/pending"
  //     }
  //   ],
  //   "expires_at": "2024-06-30T23:59:59Z"
  // }
});
```

---

## 📝 Esquemas de Datos y Validaciones

### Esquemas de Request/Response

#### User Creation Schema
```typescript
interface CreateUserRequest {
  username: string; // 3-50 chars, alphanumeric + underscore
  email: string; // Valid email format
  password: string; // Min 8 chars, must include uppercase, lowercase, number, special char
  first_name: string; // Max 100 chars
  last_name: string; // Max 100 chars
  phone?: string; // E.164 format: +56912345678
  document_type: 'rut' | 'dni' | 'passport' | 'id';
  document_number: string; // Format depends on document_type
  birth_date?: string; // ISO 8601 date
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  roles: Array<'SYSTEM_ADMIN' | 'COMMUNITY_ADMIN' | 'OWNER' | 'TENANT' | 'VISITOR'>;
  community_assignments?: Array<CommunityAssignment>;
  emergency_contact?: EmergencyContact;
  preferences?: UserPreferences;
}

interface CommunityAssignment {
  community_id: string; // UUID
  unit_id?: string; // UUID
  member_type: 'owner' | 'tenant' | 'visitor' | 'worker';
  move_in_date?: string; // ISO 8601 date
  lease_end_date?: string; // ISO 8601 date
  is_primary_resident: boolean;
}
```

#### Device Command Schema
```typescript
interface DeviceCommand {
  command: 'open_door' | 'close_door' | 'lock_door' | 'unlock_door' | 
           'restart_device' | 'update_firmware' | 'calibrate_sensor';
  parameters?: {
    duration?: number; // seconds, 1-300
    force?: boolean;
    reason?: string; // Max 255 chars
    user_id?: string; // UUID
    [key: string]: any;
  };
  priority: 1 | 2 | 3 | 4 | 5; // 1=highest, 5=lowest
  timeout?: number; // seconds, default 30
  retry_attempts?: number; // 0-5, default 3
  callback_url?: string; // Valid URL for webhook
}
```

### Validation Rules

#### Password Policy
```json
{
  "min_length": 8,
  "max_length": 128,
  "require_uppercase": true,
  "require_lowercase": true,
  "require_numbers": true,
  "require_special_chars": true,
  "forbidden_patterns": [
    "123456", "password", "qwerty", "admin"
  ],
  "max_repeated_chars": 3,
  "history_check": 5
}
```

#### Rate Limiting Rules
```json
{
  "auth_endpoints": {
    "login": {
      "requests": 5,
      "window": "15m",
      "block_duration": "30m"
    },
    "password_reset": {
      "requests": 3,
      "window": "1h",
      "block_duration": "1h"
    }
  },
  "api_endpoints": {
    "general": {
      "requests": 1000,
      "window": "1h"
    },
    "device_commands": {
      "requests": 100,
      "window": "1h"
    }
  }
}
```

---

## ⚠️ Códigos de Error Expandidos

### HTTP Status Codes
- `200` - OK
- `201` - Created
- `202` - Accepted (async processing)
- `204` - No Content
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `422` - Unprocessable Entity
- `429` - Too Many Requests
- `500` - Internal Server Error
- `502` - Bad Gateway
- `503` - Service Unavailable
- `504` - Gateway Timeout

### Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Los datos enviados no son válidos",
    "details": {
      "field_errors": [
        {
          "field": "email",
          "message": "Email no válido",
          "code": "INVALID_FORMAT",
          "value": "invalid-email"
        },
        {
          "field": "password",
          "message": "Contraseña debe tener al menos 8 caracteres",
          "code": "MIN_LENGTH",
          "value": "***"
        }
      ]
    }
  },
  "metadata": {
    "timestamp": "2024-06-24T10:30:00Z",
    "request_id": "req_1234567890",
    "service": "user-service",
    "version": "2.8.0"
  }
}
```

### Custom Error Codes
```json
{
  "AUTH_ERRORS": {
    "INVALID_CREDENTIALS": "Credenciales inválidas",
    "ACCOUNT_LOCKED": "Cuenta bloqueada temporalmente",
    "TOKEN_EXPIRED": "Token expirado",
    "TOKEN_INVALID": "Token inválido",
    "2FA_REQUIRED": "Autenticación de dos factores requerida",
    "2FA_INVALID": "Código 2FA inválido"
  },
  "PERMISSION_ERRORS": {
    "INSUFFICIENT_PERMISSIONS": "Permisos insuficientes",
    "PERMISSION_EXPIRED": "Permiso expirado",
    "ROLE_NOT_FOUND": "Rol no encontrado",
    "COMMUNITY_ACCESS_DENIED": "Acceso a comunidad denegado"
  },
  "DEVICE_ERRORS": {
    "DEVICE_OFFLINE": "Dispositivo no disponible",
    "COMMAND_TIMEOUT": "Comando agotó tiempo de espera",
    "DEVICE_BUSY": "Dispositivo ocupado",
    "UNSUPPORTED_COMMAND": "Comando no soportado",
    "FIRMWARE_UPDATE_REQUIRED": "Actualización de firmware requerida"
  },
  "PAYMENT_ERRORS": {
    "PAYMENT_FAILED": "Pago fallido",
    "INSUFFICIENT_FUNDS": "Fondos insuficientes",
    "BANK_ERROR": "Error del banco",
    "PAYMENT_EXPIRED": "Pago expirado"
  }
}
```

---

## 🧪 Testing y Sandbox

### Sandbox Environment
```
Base URL: https://sandbox-api.skyn3t.com/v1
API Key: sk_test_1234567890abcdef
WebSocket: wss://sandbox-api.skyn3t.com
```

### Test Data
```json
{
  "test_users": [
    {
      "username": "test_admin",
      "password": "TestPass123!",
      "role": "COMMUNITY_ADMIN",
      "email": "test.admin@example.com"
    },
    {
      "username": "test_owner",
      "password": "TestPass123!",
      "role": "OWNER",
      "email": "test.owner@example.com"
    }
  ],
  "test_devices": [
    {
      "id": "test_device_001",
      "name": "Test Door",
      "type": "access_control",
      "status": "online"
    }
  ],
  "test_payments": {
    "bank_accounts": [
      {
        "bank": "test_bank",
        "account": "1234567890",
        "always_succeeds": true
      }
    ]
  }
}
```

### SDK Examples

#### JavaScript/TypeScript SDK
```typescript
import { SKYN3TApi } from '@skyn3t/api-client';

const client = new SKYN3TApi({
  baseUrl: 'https://api.skyn3t.com/v1',
  apiKey: 'your_api_key',
  timeout: 30000
});

// Authentication
const auth = await client.auth.login({
  username: 'user@example.com',
  password: 'password123'
});

// Set community context
client.setCommunity('comm_001');

// Use services
const users = await client.users.list({ page: 1, limit: 20 });
const deviceStatus = await client.devices.getStatus('device_001');
```

#### Python SDK
```python
from skyn3t_client import SKYN3TClient

client = SKYN3TClient(
    base_url='https://api.skyn3t.com/v1',
    api_key='your_api_key'
)

# Authentication
auth_result = client.auth.login(
    username='user@example.com',
    password='password123'
)

# Set access token
client.set_token(auth_result['access_token'])

# Use services
users = client.users.list(page=1, limit=20)
device_status = client.devices.get_status('device_001')
```

---

## 📊 Performance and Monitoring

### Response Time SLAs
```json
{
  "authentication": {
    "target_p95": "< 500ms",
    "target_p99": "< 1000ms"
  },
  "api_endpoints": {
    "target_p95": "< 800ms",
    "target_p99": "< 2000ms"
  },
  "device_commands": {
    "target_p95": "< 200ms",
    "target_p99": "< 500ms"
  },
  "real_time_events": {
    "target_latency": "< 100ms"
  }
}
```

### Health Check Endpoints
```http
GET /health
GET /health/ready
GET /health/live
GET /metrics
```

---

## 📚 Recursos Adicionales

### Documentación Técnica
- **OpenAPI Specification**: `/api/v1/docs/openapi.json`
- **Interactive API Docs**: `/api/v1/docs`
- **Postman Collection**: `./docs/postman/SKYN3T-API-v2.8.0.json`
- **SDK Documentation**: `https://docs.skyn3t.com/sdks`

### Support Resources
- **Developer Portal**: `https://developers.skyn3t.com`
- **Community Forum**: `https://community.skyn3t.com`
- **Status Page**: `https://status.skyn3t.com`
- **Support**: `api-support@skyn3t.com`

---

**API Version**: 2.8.0  
**Última Actualización**: 2024-06-24  
**Próxima Revisión**: 2024-09-24  
**Soporte Técnico**: api-support@skyn3t.com