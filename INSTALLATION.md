# 🚀 GUÍA DE INSTALACIÓN COMPLETA - SKYN3T ACCESS CONTROL SYSTEM

![Installation Status](https://img.shields.io/badge/Status-Production%20Ready-green.svg)
![Docker Version](https://img.shields.io/badge/Docker-24.0+-blue.svg)
![Node Version](https://img.shields.io/badge/Node.js-20.x-green.svg)
![Platform](https://img.shields.io/badge/Platform-Linux%20|%20macOS%20|%20Windows-lightgrey.svg)

---

## 📋 Tabla de Contenidos

1. [Requisitos del Sistema](#requisitos-del-sistema)
2. [Instalación Rápida](#instalación-rápida)
3. [Instalación Manual Detallada](#instalación-manual-detallada)
4. [Configuración de Variables](#configuración-de-variables)
5. [Verificación del Sistema](#verificación-del-sistema)
6. [Acceso a Servicios](#acceso-a-servicios)
7. [Configuración Inicial](#configuración-inicial)
8. [Comandos Útiles](#comandos-útiles)
9. [Troubleshooting](#troubleshooting)
10. [Seguridad Post-Instalación](#seguridad-post-instalación)
11. [Instalación en Producción](#instalación-en-producción)

---

## 📋 Requisitos del Sistema

### 🖥️ Hardware Mínimo

| Componente | Desarrollo | Producción | Recomendado |
|------------|------------|------------|-------------|
| **CPU** | 4 cores | 8 cores | 16 cores |
| **RAM** | 8 GB | 16 GB | 32 GB |
| **Disco** | 50 GB SSD | 500 GB SSD | 1 TB NVMe |
| **Red** | 100 Mbps | 1 Gbps | 10 Gbps |

### 💻 Software Requerido

#### Obligatorio
```bash
# Docker & Docker Compose
Docker Engine: 24.0+ 
Docker Compose: 2.20+

# Control de versiones
Git: 2.30+

# Opcional pero recomendado
Make: 4.0+
```

#### Sistema Operativo Soportado
- **Linux**: Ubuntu 22.04+, CentOS 8+, RHEL 8+
- **macOS**: 12.0+ (Monterey)
- **Windows**: 10/11 con WSL2

### 🌐 Conectividad

#### Puertos Utilizados
```yaml
Core Services:
  - 80, 443: HTTP/HTTPS (Nginx)
  - 8000: API Gateway (Kong)
  - 3001-3009: Microservicios

Databases:
  - 5432: PostgreSQL
  - 6379: Redis
  - 8086: InfluxDB
  - 9200: Elasticsearch

Monitoring:
  - 3000: Grafana
  - 9090: Prometheus
  - 5601: Kibana

Message Queue:
  - 5672: RabbitMQ AMQP
  - 15672: RabbitMQ Management
  - 1883: MQTT (Mosquitto)

Storage:
  - 9000: MinIO API
  - 9001: MinIO Console
```

---

## 🚀 Instalación Rápida

### Método 1: Un Solo Comando (Recomendado)

```bash
# Clonar e instalar automáticamente
curl -fsSL https://raw.githubusercontent.com/PeterH4ck/SKYN3T-Control_/main/scripts/install.sh | bash
```

### Método 2: Manual Rápido

```bash
# 1. Clonar repositorio
git clone https://github.com/PeterH4ck/SKYN3T-Control_.git
cd SKYN3T-Control_

# 2. Configurar entorno
cp .env.example .env

# 3. Instalación automática
make install
```

### ⏱️ Tiempo Estimado
- **Primera instalación**: 15-20 minutos
- **Instalaciones posteriores**: 5-10 minutos
- **Solo actualización**: 2-3 minutos

---

## 🔧 Instalación Manual Detallada

### Paso 1: Verificar Prerrequisitos

```bash
# Verificar Docker
docker --version
# Debe mostrar: Docker version 24.0.0+

# Verificar Docker Compose
docker-compose --version
# Debe mostrar: Docker Compose version 2.20.0+

# Verificar Git
git --version
# Debe mostrar: git version 2.30.0+

# Verificar Make (opcional)
make --version
# Debe mostrar: GNU Make 4.0+
```

### Paso 2: Clonar el Repositorio

```bash
# Opción 1: HTTPS
git clone https://github.com/PeterH4ck/SKYN3T-Control_.git

# Opción 2: SSH (si tienes configurado)
git clone git@github.com:PeterH4ck/SKYN3T-Control_.git

# Entrar al directorio
cd SKYN3T-Control_

# Verificar estructura
ls -la
```

### Paso 3: Configurar Variables de Entorno

```bash
# Copiar archivo de ejemplo
cp .env.example .env

# Editar con tu editor favorito
nano .env  # o vim, code, etc.
```

#### ⚙️ Variables Críticas a Configurar

```bash
# Seguridad (CAMBIAR OBLIGATORIAMENTE)
JWT_SECRET=tu-clave-jwt-super-secreta-aqui
SESSION_SECRET=tu-clave-session-aqui
ENCRYPTION_KEY=tu-clave-encriptacion-32-chars!!

# Base de datos
POSTGRES_PASSWORD=tu-password-postgresql-seguro
REDIS_PASSWORD=tu-password-redis-seguro
RABBITMQ_PASSWORD=tu-password-rabbitmq-seguro

# Storage
MINIO_ROOT_PASSWORD=tu-password-minio-seguro

# Monitoreo
GRAFANA_PASSWORD=tu-password-grafana-seguro
INFLUXDB_PASSWORD=tu-password-influxdb-seguro
```

### Paso 4: Instalación con Make (Recomendado)

```bash
# Instalación completa automática
make install

# Lo que hace internamente:
# 1. Validar dependencias
# 2. Construir imágenes Docker
# 3. Iniciar servicios
# 4. Esperar inicialización completa
# 5. Ejecutar migraciones
# 6. Cargar datos iniciales
# 7. Verificar estado de servicios
```

### Paso 5: Instalación Manual (Sin Make)

```bash
# 1. Construir imágenes Docker
docker-compose build --no-cache

# 2. Iniciar servicios de infraestructura primero
docker-compose up -d postgres redis-master rabbitmq minio

# 3. Esperar a que estén listos (importante)
sleep 60

# 4. Iniciar servicios de aplicación
docker-compose up -d

# 5. Verificar que todos estén ejecutándose
docker-compose ps

# 6. Ejecutar migraciones de base de datos
docker-compose exec auth-service npm run db:migrate

# 7. Cargar datos iniciales
docker-compose exec auth-service npm run db:seed
```

---

## ⚙️ Configuración de Variables

### 🔐 Variables de Seguridad

```bash
# JWT Configuration (CRÍTICO)
JWT_SECRET=clave-de-al-menos-32-caracteres-super-segura
JWT_EXPIRE=7d
REFRESH_TOKEN_EXPIRE=30d

# Encryption (CRÍTICO)
ENCRYPTION_KEY=exactamente-32-caracteres-aqui!!
ENCRYPTION_ALGORITHM=aes-256-gcm

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutos
RATE_LIMIT_MAX_REQUESTS=100
```

### 📧 Configuración de Email

```bash
# SMTP para notificaciones
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu-email@gmail.com
SMTP_PASS=tu-app-password-de-gmail
SMTP_FROM="SKYN3T Access Control <noreply@tudominio.com>"
```

### 📱 Configuración de SMS

```bash
# Twilio para SMS
TWILIO_ACCOUNT_SID=tu-account-sid-de-twilio
TWILIO_AUTH_TOKEN=tu-auth-token-de-twilio
TWILIO_PHONE_NUMBER=+1234567890
```

### 💳 Configuración de Bancos (Chile)

```bash
# Banco Estado
BANCO_ESTADO_API_KEY=tu-api-key
BANCO_ESTADO_API_SECRET=tu-api-secret
BANCO_ESTADO_API_URL=https://api.bancoestado.cl/v1

# Santander Chile
SANTANDER_CLIENT_ID=tu-client-id
SANTANDER_CLIENT_SECRET=tu-client-secret

# BCI
BCI_API_TOKEN=tu-api-token
BCI_API_SECRET=tu-api-secret

# PayPal
PAYPAL_CLIENT_ID=tu-paypal-client-id
PAYPAL_CLIENT_SECRET=tu-paypal-client-secret
PAYPAL_MODE=sandbox  # o 'live' para producción
```

### 🌍 Configuración Regional

```bash
# Configuración para Chile
DEFAULT_COUNTRY=CL
DEFAULT_LANGUAGE=es
DEFAULT_TIMEZONE=America/Santiago
DEFAULT_CURRENCY=CLP
DEFAULT_DATE_FORMAT=DD/MM/YYYY
DEFAULT_TIME_FORMAT=HH:mm
```

---

## ✅ Verificación del Sistema

### 🏥 Health Check Completo

```bash
# Verificar estado de todos los servicios
make status

# Resultado esperado:
# ✅ postgres: healthy
# ✅ redis-master: healthy
# ✅ rabbitmq: healthy
# ✅ auth-service: healthy
# ✅ permission-service: healthy
# ... (todos los servicios)
```

### 🔍 Verificación Manual por Servicio

#### Base de Datos
```bash
# PostgreSQL
docker-compose exec postgres pg_isready -U postgres
# Resultado: postgres:5432 - accepting connections

# Verificar esquema de BD
docker-compose exec postgres psql -U postgres -d master_db -c "\dt"
# Debe mostrar 150+ tablas
```

#### Cache y Cola de Mensajes
```bash
# Redis
docker-compose exec redis-master redis-cli -a redis123 ping
# Resultado: PONG

# RabbitMQ
docker-compose exec rabbitmq rabbitmq-diagnostics ping
# Resultado: Ping succeeded
```

#### Servicios de Aplicación
```bash
# Verificar APIs
curl -s http://localhost:3001/health | jq
curl -s http://localhost:3002/health | jq
curl -s http://localhost:3003/health | jq

# Verificar API Gateway
curl -s http://localhost:8000/health | jq
```

### 📊 Verificación de Monitoreo

```bash
# Prometheus métricas
curl -s http://localhost:9090/api/v1/targets

# Grafana (debe cargar la interfaz)
curl -s http://localhost:3000/api/health

# Elasticsearch
curl -s http://localhost:9200/_cluster/health | jq
```

---

## 🌐 Acceso a Servicios

### 🖥️ Interfaces Web

| Servicio | URL | Credenciales | Descripción |
|----------|-----|--------------|-------------|
| **Frontend** | [http://localhost:3000](http://localhost:3000) | admin / admin | Interfaz principal |
| **API Gateway** | [http://localhost:8000](http://localhost:8000) | - | APIs REST |
| **Grafana** | [http://localhost:3000/grafana](http://localhost:3000/grafana) | admin / grafana123 | Dashboards |
| **Kibana** | [http://localhost:5601](http://localhost:5601) | - | Logs y búsqueda |
| **RabbitMQ** | [http://localhost:15672](http://localhost:15672) | admin / rabbitmq123 | Cola mensajes |
| **MinIO** | [http://localhost:9001](http://localhost:9001) | minioadmin / minioadmin123 | Storage |
| **Prometheus** | [http://localhost:9090](http://localhost:9090) | - | Métricas |

### 🔗 APIs Principales

#### Authentication API
```bash
# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'

# Session info
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/v1/auth/session
```

#### Users API
```bash
# Listar usuarios
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/v1/users

# Crear usuario
curl -X POST http://localhost:8000/api/v1/users \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","firstName":"Test","lastName":"User"}'
```

#### Permissions API
```bash
# Permisos de usuario
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/v1/permissions/user/USER_ID

# Verificar permiso
curl -X POST http://localhost:8000/api/v1/permissions/check \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"permission":"users.create","context":{"communityId":"abc123"}}'
```

---

## 🎯 Configuración Inicial

### 👤 1. Configurar Usuario Administrador

```bash
# El sistema crea automáticamente:
# Email: admin@system.local
# Password: admin
# Rol: SUPER_ADMIN

# ⚠️ CAMBIAR PASSWORD INMEDIATAMENTE
```

#### Cambiar Password Vía API
```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | jq -r '.data.accessToken')

# 2. Cambiar password
curl -X PUT http://localhost:8000/api/v1/auth/password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"admin","newPassword":"tu-nuevo-password-seguro"}'
```

### 🏢 2. Crear Primera Comunidad

```bash
# Crear comunidad de ejemplo
curl -X POST http://localhost:8000/api/v1/communities \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "TORRES_SOL",
    "name": "Torres del Sol",
    "type": "residential",
    "address": "Av. Principal 123, Santiago",
    "country": "CL",
    "timezone": "America/Santiago"
  }'
```

### 📧 3. Configurar Notificaciones

#### Verificar Email
```bash
# Test de envío
curl -X POST http://localhost:8000/api/v1/notifications/test-email \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to":"tu-email@test.com","subject":"Test SKYN3T"}'
```

#### Verificar SMS
```bash
# Test de SMS
curl -X POST http://localhost:8000/api/v1/notifications/test-sms \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to":"+56912345678","message":"Test SKYN3T SMS"}'
```

### 🔌 4. Configurar Dispositivos IoT

```bash
# Registrar dispositivo de prueba
curl -X POST http://localhost:8000/api/v1/devices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "serialNumber": "DEV001",
    "name": "Puerta Principal",
    "type": "access_control",
    "location": "Entrada principal",
    "ipAddress": "192.168.1.100"
  }'
```

### 💳 5. Configurar Métodos de Pago

```bash
# Verificar configuración PayPal
curl -X GET http://localhost:8000/api/v1/payments/gateways \
  -H "Authorization: Bearer $TOKEN"

# Test de conexión bancaria
curl -X POST http://localhost:8000/api/v1/payments/banks/test \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bankCode":"BANCO_ESTADO"}'
```

---

## 🛠️ Comandos Útiles

### 🐳 Docker & Servicios

```bash
# Ver logs de todos los servicios
make logs

# Ver logs de un servicio específico
make logs-service SERVICE=auth-service
make logs-service SERVICE=permission-service

# Reiniciar todos los servicios
make restart

# Reiniciar un servicio específico
make restart-service SERVICE=user-service

# Parar todos los servicios
make down

# Limpiar todo (¡CUIDADO! Elimina datos)
make clean
```

### 🗃️ Base de Datos

```bash
# Acceder a PostgreSQL CLI
make db-shell

# Backup completo
make db-backup
# Crea: backups/backup_YYYYMMDD_HHMMSS.sql

# Restaurar backup
make db-restore FILE=backups/backup_20240101_120000.sql

# Ejecutar migraciones
make db-migrate

# Cargar datos de prueba
make db-seed

# Reset completo de BD (¡CUIDADO!)
make db-reset
```

### 🗄️ Cache y Cola

```bash
# Acceder a Redis CLI
make redis-cli

# Limpiar todo el cache
make cache-clear

# Ver estadísticas Redis
make redis-stats

# Acceder a RabbitMQ Management
make rabbitmq-shell

# Ver colas RabbitMQ
make rabbitmq-queues
```

### 📊 Monitoreo

```bash
# Estado general del sistema
make status

# Health check completo
make health-check

# Ver métricas del sistema
make metrics

# Ver uso de recursos
make resources

# Generar reporte de estado
make status-report
```

### 🔧 Desarrollo

```bash
# Modo desarrollo (hot reload)
make dev

# Ejecutar tests
make test

# Ejecutar tests con coverage
make test-coverage

# Linting de código
make lint

# Formatear código
make format
```

---

## 🚨 Troubleshooting

### ❌ Problemas Comunes

#### 1. Servicios No Inician
```bash
# Problema: "Cannot connect to database"
# Solución:
docker-compose down
docker system prune -f
make install

# Verificar logs específicos
make logs-service SERVICE=postgres
```

#### 2. Permisos de Archivos
```bash
# Problema: Permission denied
# Solución (Linux/macOS):
sudo chown -R $USER:$USER .
sudo chmod -R 755 .

# En Linux, agregar usuario al grupo docker
sudo usermod -aG docker $USER
newgrp docker
```

#### 3. Puerto en Uso
```bash
# Problema: "Port already in use"
# Verificar qué usa el puerto
sudo lsof -i :3000

# Cambiar puerto en docker-compose.yml
# o detener el servicio que lo usa
sudo systemctl stop nombre-servicio
```

#### 4. Memoria Insuficiente
```bash
# Problema: OOM killed
# Verificar memoria disponible
free -h

# Aumentar límites Docker (Docker Desktop)
# Settings → Resources → Memory: 8GB+

# Para Linux, verificar swap
sudo swapon --show
```

#### 5. Redis Connection Failed
```bash
# Problema: Redis connection timeout
# Verificar estado Redis
docker-compose logs redis-master

# Restart Redis cluster
docker-compose restart redis-master redis-slave redis-sentinel

# Limpiar cache corrupto
docker-compose exec redis-master redis-cli -a redis123 FLUSHALL
```

#### 6. PostgreSQL Initialization Error
```bash
# Problema: Database initialization failed
# Limpiar volúmenes PostgreSQL
docker-compose down -v
docker volume rm skyn3t-control_postgres_data
make install
```

### 🔍 Logs de Depuración

```bash
# Logs detallados por servicio
docker-compose logs -f postgres
docker-compose logs -f redis-master
docker-compose logs -f auth-service
docker-compose logs -f permission-service

# Logs del sistema completo
make logs | grep ERROR
make logs | grep WARNING

# Verificar conectividad de red
docker network ls
docker network inspect skyn3t-control_skyn3t-network
```

### 📊 Verificación de Performance

```bash
# Verificar uso de CPU/Memoria por container
docker stats

# Verificar conexiones a base de datos
docker-compose exec postgres psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# Verificar performance Redis
docker-compose exec redis-master redis-cli -a redis123 INFO stats

# Test de carga API
curl -o /dev/null -s -w "%{time_total}s\n" http://localhost:8000/api/v1/health
```

---

## 🔒 Seguridad Post-Instalación

### 🔑 1. Cambiar TODAS las Contraseñas

```bash
# Editar .env y cambiar:
nano .env

# Variables críticas:
POSTGRES_PASSWORD=nueva-password-postgresql
REDIS_PASSWORD=nueva-password-redis
RABBITMQ_PASSWORD=nueva-password-rabbitmq
MINIO_ROOT_PASSWORD=nueva-password-minio
JWT_SECRET=nueva-clave-jwt-super-segura
GRAFANA_PASSWORD=nueva-password-grafana
```

```bash
# Aplicar cambios
docker-compose down
docker-compose up -d
```

### 🔥 2. Configurar Firewall

#### Ubuntu/Debian
```bash
# Instalar UFW
sudo apt install ufw

# Configurar reglas básicas
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Permitir SSH
sudo ufw allow ssh

# Permitir solo puertos necesarios
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS

# Activar firewall
sudo ufw enable

# Ver estado
sudo ufw status
```

#### CentOS/RHEL
```bash
# Configurar firewalld
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 🔐 3. Habilitar SSL/TLS

```bash
# Generar certificados (Let's Encrypt recomendado)
sudo apt install certbot

# Obtener certificados
sudo certbot certonly --standalone -d tu-dominio.com

# Configurar Nginx SSL
cp nginx/ssl/cert.pem.example nginx/ssl/cert.pem
cp nginx/ssl/key.pem.example nginx/ssl/key.pem

# Descomentar configuración HTTPS en nginx/nginx.conf
nano nginx/nginx.conf

# Reiniciar Nginx
docker-compose restart nginx
```

### 🛡️ 4. Configurar Backup Automático

```bash
# Agregar a crontab del sistema
sudo crontab -e

# Backup diario a las 3 AM
0 3 * * * cd /ruta/a/skyn3t && make backup-all

# Backup semanal completo
0 3 * * 0 cd /ruta/a/skyn3t && make backup-full

# Limpieza de backups antiguos (>30 días)
0 4 * * * find /ruta/a/skyn3t/backups -name "*.sql" -mtime +30 -delete
```

### 🔍 5. Configurar Monitoreo de Seguridad

```bash
# Instalar fail2ban
sudo apt install fail2ban

# Configurar para Docker
sudo nano /etc/fail2ban/jail.local

# [DEFAULT]
# bantime = 3600
# findtime = 600
# maxretry = 3
# 
# [nginx-http-auth]
# enabled = true
# port = http,https
# logpath = /var/log/nginx/error.log

# Reiniciar fail2ban
sudo systemctl restart fail2ban
```

### 📋 6. Auditoría de Seguridad

```bash
# Verificar configuración de seguridad
make security-check

# Escanear vulnerabilidades en containers
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image skyn3t-backend:latest

# Verificar puertos abiertos
nmap -sT -O localhost

# Verificar logs de acceso
make logs | grep "Failed login"
make logs | grep "403\|401"
```

---

## 🏭 Instalación en Producción

### 🚀 Configuración para Producción

#### 1. Variables de Entorno Seguras
```bash
# Generar secretos seguros
JWT_SECRET=$(openssl rand -base64 64)
ENCRYPTION_KEY=$(openssl rand -base64 32)
SESSION_SECRET=$(openssl rand -base64 64)

# Passwords complejos
POSTGRES_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
RABBITMQ_PASSWORD=$(openssl rand -base64 32)
```

#### 2. Configuración Docker para Producción
```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  nginx:
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
  
  postgres:
    restart: always
    environment:
      - POSTGRES_SHARED_BUFFERS=256MB
      - POSTGRES_EFFECTIVE_CACHE_SIZE=1GB
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

#### 3. Configuración de Red
```bash
# Crear red personalizada
docker network create --driver bridge \
  --subnet=172.20.0.0/16 \
  --opt com.docker.network.bridge.name=skyn3t-br \
  skyn3t-production

# Configurar en docker-compose.prod.yml
networks:
  default:
    external:
      name: skyn3t-production
```

### 📊 4. Monitoreo Avanzado

```bash
# Configurar alertas Grafana
# Editar: config/grafana/alerting/rules.yml

# Configurar notificaciones
# Slack, Email, PagerDuty, etc.

# Configurar retention policies
# InfluxDB: 90 días para raw data, 1 año para aggregated
# Elasticsearch: 30 días para logs
```

### 🔄 5. Backup y Recuperación

```bash
# Estrategia 3-2-1
# 3 copias: Local, Remote, Cloud
# 2 medios diferentes: Disk, Tape/Cloud
# 1 copia offsite: AWS S3, Google Cloud

# Configurar backup remoto
aws configure
make backup-s3

# Test de recuperación mensual
make restore-test
```

### 📈 6. Escalabilidad

```bash
# Para múltiples instancias:
# 1. Load balancer (HAProxy/Nginx)
# 2. Database clustering (PostgreSQL streaming replication)
# 3. Redis Sentinel para HA
# 4. RabbitMQ cluster
# 5. Shared storage (NFS/GlusterFS)

# Kubernetes deployment
kubectl apply -f k8s/
```

### 🚨 7. Plan de Contingencia

```bash
# Crear runbook de emergencia
cp docs/runbook-template.md docs/production-runbook.md

# Procedimientos documentados:
# - Recovery time objective (RTO): 4 horas
# - Recovery point objective (RPO): 1 hora
# - Escalation matrix
# - Emergency contacts
# - Rollback procedures
```

---

## 📞 Soporte y Recursos

### 📚 Documentación Adicional
- [Arquitectura del Sistema](./docs/ARCHITECTURE.md)
- [API Documentation](http://localhost:8000/api-docs)
- [Guía de Desarrollo](./docs/DEVELOPMENT.md)
- [Plan de Etapas](./ETAPAS.md)

### 🐛 Reportar Problemas
- [GitHub Issues](https://github.com/PeterH4ck/SKYN3T-Control_/issues)
- [GitHub Discussions](https://github.com/PeterH4ck/SKYN3T-Control_/discussions)

### 💬 Comunidad
- **Desarrollador Principal**: PETERH4CK
- **Repositorio**: [SKYN3T-Control_](https://github.com/PeterH4ck/SKYN3T-Control_)
- **Licencia**: MIT

### 📋 Información del Sistema

```bash
# Generar reporte completo del sistema
make system-info

# Generar bundle de soporte para issues
make support-bundle

# Ver versiones de todos los componentes
make versions
```

---

## ✅ Checklist Post-Instalación

### 🔒 Seguridad
- [ ] Contraseñas por defecto cambiadas
- [ ] Firewall configurado
- [ ] SSL/TLS habilitado
- [ ] Backup automático configurado
- [ ] Monitoreo de seguridad activo

### 🚀 Funcionalidad
- [ ] Todos los servicios ejecutándose
- [ ] APIs respondiendo correctamente
- [ ] Base de datos con datos iniciales
- [ ] WebSocket funcionando
- [ ] Notificaciones configuradas

### 📊 Monitoreo
- [ ] Grafana dashboards funcionando
- [ ] Alertas configuradas
- [ ] Logs centralizados
- [ ] Métricas de performance

### 🎯 Configuración
- [ ] Primera comunidad creada
- [ ] Usuario admin configurado
- [ ] Dispositivos de prueba registrados
- [ ] Métodos de pago configurados

---

**✨ ¡Felicitaciones! Tu instalación de SKYN3T está lista.**

**📧 Soporte**: [GitHub Issues](https://github.com/PeterH4ck/SKYN3T-Control_/issues)  
**📚 Docs**: [./docs/](./docs/)  
**🎯 Next Steps**: [ETAPAS.md](./ETAPAS.md)