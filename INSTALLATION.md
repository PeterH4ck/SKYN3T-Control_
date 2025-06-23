# 🚀 GUÍA DE INSTALACIÓN - SKYN3T ACCESS CONTROL SYSTEM

## 📋 Requisitos Previos

### Hardware Mínimo
- **CPU**: 4 cores
- **RAM**: 8 GB (16 GB recomendado)
- **Disco**: 50 GB libres
- **Red**: Conexión estable a Internet

### Software Requerido
- Docker Engine 24.0+
- Docker Compose 2.20+
- Git
- Make (opcional pero recomendado)

## 🔧 Instalación Paso a Paso

### 1. Clonar el Repositorio

```bash
git clone https://github.com/your-org/skyn3t-access-control.git
cd skyn3t-access-control
```

### 2. Configurar Variables de Entorno

```bash
# Copiar archivo de ejemplo
cp .env.example .env

# Editar con tu editor favorito
nano .env  # o vim, code, etc.
```

**Variables importantes a cambiar:**
- `JWT_SECRET`: Generar una clave segura
- `POSTGRES_PASSWORD`: Cambiar contraseña de PostgreSQL
- `REDIS_PASSWORD`: Cambiar contraseña de Redis
- Configurar servicios de notificación (SMTP, Twilio, etc.)
- Configurar APIs de bancos (si se van a usar)

### 3. Instalación Rápida con Make

```bash
# Instalar todo automáticamente
make install
```

Esto ejecutará:
1. Construcción de imágenes Docker
2. Inicio de todos los servicios
3. Migración de base de datos
4. Carga de datos iniciales

### 4. Instalación Manual (sin Make)

```bash
# Crear archivo .env
cp .env.example .env

# Construir imágenes
docker-compose build

# Iniciar servicios
docker-compose up -d

# Esperar 30 segundos para que los servicios inicien
sleep 30

# Ejecutar migraciones (cuando tengamos el frontend)
docker-compose exec auth-service npm run migrate

# Cargar datos de prueba
docker-compose exec auth-service npm run seed
```

## 🖥️ Acceso al Sistema

Una vez instalado, accede a:

- **Frontend**: http://localhost:3000
  - Usuario: `admin`
  - Contraseña: `admin`
  
- **API Gateway**: http://localhost:8000
- **Grafana**: http://localhost:3000/grafana
  - Usuario: `admin`
  - Contraseña: `grafana123`
  
- **Kibana**: http://localhost:3000/kibana
- **RabbitMQ**: http://localhost:15672
  - Usuario: `admin`
  - Contraseña: `rabbitmq123`
  
- **MinIO Console**: http://localhost:9001
  - Usuario: `minioadmin`
  - Contraseña: `minioadmin123`

## 📱 Configuración Inicial

### 1. Cambiar Contraseña de Admin

Al primer login, el sistema forzará el cambio de contraseña.

### 2. Crear Primera Comunidad

1. Ir a **Comunidades** → **Nueva Comunidad**
2. Completar datos:
   - Nombre: "Torres del Sol" (ejemplo)
   - Tipo: Residencial
   - País: Chile
   - Plan: Premium (trial 30 días)

### 3. Configurar Dispositivos IoT

Los dispositivos se auto-descubren si están en la misma red.

1. Ir a **Dispositivos** → **Descubrir**
2. Seleccionar dispositivos encontrados
3. Asignar a puntos de acceso

### 4. Configurar Métodos de Pago

1. Ir a **Configuración** → **Pagos**
2. Activar bancos chilenos necesarios
3. Ingresar credenciales de API

## 🔍 Verificación de la Instalación

### Verificar Estado de Servicios

```bash
# Con Make
make status

# Manual
docker-compose ps
```

Todos los servicios deben estar en estado "Up".

### Verificar Conectividad

```bash
# PostgreSQL
docker-compose exec postgres pg_isready

# Redis
docker-compose exec redis-master redis-cli ping

# RabbitMQ
docker-compose exec rabbitmq rabbitmq-diagnostics ping
```

### Verificar Logs

```bash
# Ver todos los logs
make logs

# Ver logs de un servicio específico
make logs-service SERVICE=permission-service
```

## 🛠️ Comandos Útiles

### Gestión de Servicios

```bash
# Detener todo
make down

# Reiniciar todo
make restart

# Reiniciar un servicio
make restart-service SERVICE=auth-service
```

### Base de Datos

```bash
# Acceder a PostgreSQL
make db-shell

# Backup de base de datos
make db-backup

# Restaurar backup
make db-restore FILE=backups/backup_20240101_120000.sql
```

### Cache

```bash
# Acceder a Redis CLI
make redis-cli

# Limpiar todo el cache
make cache-clear
```

## 🚨 Solución de Problemas

### Error: "Cannot connect to database"

```bash
# Verificar que PostgreSQL esté corriendo
docker-compose ps postgres

# Ver logs de PostgreSQL
docker-compose logs postgres

# Reiniciar PostgreSQL
docker-compose restart postgres
```

### Error: "Permission denied"

```bash
# Dar permisos a volúmenes
sudo chown -R $USER:$USER .

# En Linux, agregar usuario al grupo docker
sudo usermod -aG docker $USER
```

### Error: "Port already in use"

```bash
# Ver qué está usando el puerto
sudo lsof -i :3000

# Cambiar puerto en docker-compose.yml
# o detener el servicio que usa el puerto
```

### Servicios no inician

```bash
# Ver logs detallados
docker-compose logs -f [service-name]

# Reconstruir imágenes
docker-compose build --no-cache [service-name]

# Eliminar volúmenes y reiniciar
docker-compose down -v
docker-compose up -d
```

## 🔐 Seguridad Post-Instalación

### 1. Cambiar TODAS las Contraseñas por Defecto

```bash
# Editar .env y cambiar:
- POSTGRES_PASSWORD
- REDIS_PASSWORD
- RABBITMQ_PASSWORD
- MINIO_ROOT_PASSWORD
- JWT_SECRET
- Todas las API keys
```

### 2. Configurar Firewall

```bash
# Solo permitir puertos necesarios
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

### 3. Habilitar SSL/TLS

1. Obtener certificados SSL
2. Descomentar configuración HTTPS en `nginx/nginx.conf`
3. Reiniciar Nginx

### 4. Configurar Backups Automáticos

```bash
# Agregar a crontab
0 3 * * * cd /path/to/skyn3t && make backup-all
```

## 📊 Monitoreo

### Acceder a Dashboards

- **Grafana**: http://localhost:3000/grafana
  - Dashboard de Sistema
  - Dashboard de Accesos
  - Dashboard Financiero
  
- **Kibana**: http://localhost:3000/kibana
  - Logs centralizados
  - Búsqueda avanzada

### Métricas Importantes

1. **CPU/Memory**: No debe exceder 80%
2. **Database Connections**: Verificar pool no saturado
3. **API Response Time**: < 200ms promedio
4. **Error Rate**: < 1%

## 🔄 Actualizaciones

### Actualizar Sistema

```bash
# Pull últimos cambios
git pull origin main

# Reconstruir y reiniciar
make build
make restart

# Ejecutar migraciones si hay
make db-migrate
```

### Backup Antes de Actualizar

```bash
# Backup completo
make backup-all
```

## 📞 Soporte

### Logs para Soporte

```bash
# Generar bundle de soporte
./scripts/support-bundle.sh
```

### Información del Sistema

```bash
# Ver versiones
docker-compose exec auth-service npm version
docker --version
docker-compose --version
```

## 🎯 Próximos Pasos

1. **Configurar Comunidad**: Crear edificios, unidades, residentes
2. **Configurar Permisos**: Asignar roles y permisos
3. **Configurar Dispositivos**: Conectar hardware de acceso
4. **Configurar Pagos**: Activar módulo financiero
5. **Personalizar**: Logo, colores, notificaciones

## ⚡ Tips de Performance

1. **Asignar más recursos a Docker**:
   - Docker Desktop → Settings → Resources
   - Mínimo 4 CPU, 8GB RAM

2. **Optimizar PostgreSQL**:
   ```sql
   -- En postgresql.conf
   shared_buffers = 256MB
   effective_cache_size = 1GB
   ```

3. **Configurar Redis para persistencia**:
   ```redis
   save 900 1
   save 300 10
   save 60 10000
   ```

## 🔴 Instalación en Producción

Para producción, revisar:
- [ ] Certificados SSL configurados
- [ ] Contraseñas seguras en .env
- [ ] Firewall configurado
- [ ] Backups automáticos
- [ ] Monitoreo 24/7
- [ ] Alta disponibilidad
- [ ] Plan de recuperación

---

**¿Necesitas ayuda?** Revisa los logs con `make logs` o contacta soporte.