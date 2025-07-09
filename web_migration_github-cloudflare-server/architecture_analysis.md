# 🏗️ Análisis de Arquitectura y Plan de Migración - SKYN3T

## 📊 **SITUACIÓN ACTUAL**

### **Frontend (GitHub + Cloudflare)**
```
GitHub Repository
    ↓ (Auto Deploy)
Cloudflare Pages
    ↓ (CDN Global)
skyn3t.cl (Página Principal)
```

### **Servidor Dedicado**
```
Servidor Principal
├── PBX Asterisk ✅ (Funcionando)
├── Sistema Operativo: ?
├── Firewall: ?
├── Puertos disponibles: ?
└── Recursos libres: ?
```

---

## 🎯 **ARQUITECTURA OBJETIVO**

### **Arquitectura Híbrida Propuesta**
```
┌─────────────────────────────────────┐
│           CLOUDFLARE                │
│  ┌─────────────────────────────────┐│
│  │     Frontend (Público)          ││
│  │  • Homepage (index.html)        ││  
│  │  • Páginas estáticas            ││
│  │  • CDN global                   ││
│  │  • SSL/DDoS protection          ││
│  └─────────────────────────────────┘│
└─────────────────┬───────────────────┘
                  │ HTTPS/API calls
                  ▼
┌─────────────────────────────────────┐
│         TU SERVIDOR DEDICADO        │
│  ┌─────────────────────────────────┐│
│  │     Backend (Privado)           ││
│  │  • APIs de autenticación        ││
│  │  • Base de datos MySQL          ││
│  │  • Lógica de negocio            ││
│  │  • Sistema de archivos          ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │     PBX Asterisk (Intacto)      ││
│  │  • Servicios VoIP               ││
│  │  • Configuración actual         ││
│  │  • Puertos separados            ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

---

## 🔍 **ANÁLISIS TÉCNICO REQUERIDO**

### **1. Información del Servidor**
**Necesitamos conocer:**

#### **Sistema Operativo y Recursos**
- SO: ¿Ubuntu/CentOS/Debian?
- RAM disponible (para BD y app)
- Espacio en disco
- CPU libre (sin afectar Asterisk)

#### **Configuración de Red**
- IP pública del servidor
- Puertos actualmente en uso por Asterisk
- Configuración de NAT/Firewall
- Ancho de banda disponible

### **2. Asterisk - Análisis de Compatibilidad**

#### **Puertos Utilizados por Asterisk**
```bash
# Verificar puertos en uso
sudo netstat -tulpn | grep asterisk
sudo ss -tulpn | grep asterisk

# Puertos típicos de Asterisk:
# 5060 (SIP UDP)
# 5061 (SIP TLS) 
# 10000-20000 (RTP)
# 4569 (IAX2)
# 8088 (HTTP Manager)
```

#### **Recursos del Sistema**
```bash
# Verificar uso actual
top
htop
free -h
df -h

# Procesos de Asterisk
ps aux | grep asterisk
systemctl status asterisk
```

### **3. Configuración de Firewall**

#### **Puertos para SKYN3T (Nuevos)**
```bash
# HTTP/HTTPS para web
80/tcp    # HTTP (redirect a HTTPS)
443/tcp   # HTTPS principal

# Base de datos (interno)
3306/tcp  # MySQL (solo localhost)

# APIs backend
8080/tcp  # API principal (opcional)
8443/tcp  # API HTTPS (opcional)

# SSH (gestión)
22/tcp    # SSH (con restricciones IP)
```

#### **Separación de Servicios**
```
Asterisk (Existente):
├── Puertos: 5060, 5061, 4569, 8088, 10000-20000
├── IPs: Configuración actual
└── Firewall: Reglas existentes (NO TOCAR)

SKYN3T (Nuevo):
├── Puertos: 80, 443, 3306 (local), 8080
├── IPs: Misma IP pública, diferentes puertos
└── Firewall: Nuevas reglas específicas
```

---

## 🛡️ **CONSIDERACIONES DE SEGURIDAD**

### **1. Comunicación Cloudflare ↔ Servidor**

#### **Autenticación de Requests**
```php
// Verificar que requests vienen de Cloudflare
$cloudflare_ips = [
    // IPs de Cloudflare
    '173.245.48.0/20',
    '103.21.244.0/22',
    // ... etc
];

function isCloudflareRequest() {
    $client_ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'];
    // Verificar IP está en rangos de Cloudflare
}
```

#### **Headers de Seguridad**
```php
// Headers obligatorios
header('X-CF-Secret: YOUR_SECRET_KEY');
header('X-SKYN3T-Origin: cloudflare');

// CORS específico
header('Access-Control-Allow-Origin: https://skyn3t.cl');
```

### **2. Aislamiento de Servicios**

#### **Usuarios del Sistema**
```bash
# Usuario dedicado para SKYN3T
sudo useradd -r -s /bin/false skyn3t-app
sudo usermod -a -G www-data skyn3t-app

# Directorios separados
/opt/skyn3t/          # Aplicación
/var/www/skyn3t/      # Web files
/var/log/skyn3t/      # Logs
/etc/skyn3t/          # Configuración
```

#### **Base de Datos Aislada**
```sql
-- Usuario específico para SKYN3T
CREATE USER 'skyn3t_app'@'localhost' IDENTIFIED BY 'StrongPassword123!';
CREATE DATABASE skyn3t_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON skyn3t_db.* TO 'skyn3t_app'@'localhost';
```

---

## 📋 **PLAN DE MIGRACIÓN POR FASES**

### **FASE 1: ANÁLISIS Y PREPARACIÓN (Días 1-2)**

#### **1.1 Auditoría del Servidor**
```bash
# Script de auditoría
#!/bin/bash
echo "=== AUDITORÍA SERVIDOR SKYN3T ==="
echo "Fecha: $(date)"
echo "--- Sistema ---"
uname -a
cat /etc/os-release
echo "--- Memoria ---"
free -h
echo "--- Disco ---"
df -h
echo "--- Asterisk ---"
systemctl status asterisk
ss -tulpn | grep asterisk
echo "--- Firewall ---"
sudo ufw status numbered
echo "--- Procesos ---"
ps aux --sort=-%cpu | head -10
```

#### **1.2 Documentar Configuración Asterisk**
```bash
# Backup completo de Asterisk
sudo tar -czf asterisk_backup_$(date +%Y%m%d).tar.gz /etc/asterisk/
sudo cp /etc/asterisk/sip.conf /backup/
sudo cp /etc/asterisk/extensions.conf /backup/
```

### **FASE 2: PREPARACIÓN SERVIDOR (Días 3-4)**

#### **2.1 Instalación de Componentes**
```bash
# Stack LAMP sin afectar Asterisk
sudo apt update
sudo apt install -y nginx mysql-server php8.2-fpm php8.2-mysql php8.2-json

# Configurar Nginx (no Apache para evitar conflictos)
sudo systemctl stop apache2   # Si existe
sudo systemctl disable apache2
sudo systemctl enable nginx
```

#### **2.2 Configuración de Firewall**
```bash
# Backup reglas actuales
sudo ufw --dry-run reset

# Nuevas reglas SIN tocar Asterisk
sudo ufw allow 80/tcp    comment "HTTP SKYN3T"
sudo ufw allow 443/tcp   comment "HTTPS SKYN3T"
sudo ufw allow ssh       comment "SSH gestión"

# Verificar que Asterisk sigue funcionando
sudo ufw status
systemctl status asterisk
```

### **FASE 3: IMPLEMENTACIÓN BACKEND (Días 5-6)**

#### **3.1 Estructura de Archivos**
```
/opt/skyn3t/
├── config/
│   ├── database.php
│   └── security.php
├── api/
│   ├── login.php
│   ├── check_session.php
│   └── logout.php
├── includes/
│   └── functions.php
└── logs/
    └── app.log
```

#### **3.2 Base de Datos**
```sql
-- Crear estructura inicial
USE skyn3t_db;
SOURCE /opt/skyn3t/database/schema.sql;
INSERT INTO users (username, password, role) VALUES 
('admin', '$2y$10$...', 'SuperUser');
```

### **FASE 4: INTEGRACIÓN FRONTEND (Días 7-8)**

#### **4.1 Modificar Homepage (Cloudflare)**
```html
<!-- En index.html, cambiar botón de login -->
<a href="https://tu-servidor.com/login/" class="floating-login">
    <i class="fas fa-sign-in-alt"></i>
    Acceso Clientes
</a>
```

#### **4.2 API Endpoints**
```
Frontend (Cloudflare):
https://skyn3t.cl/

API Backend (Tu Servidor):
https://tu-servidor.com/api/login
https://tu-servidor.com/api/check_session
https://tu-servidor.com/api/logout
```

### **FASE 5: PRUEBAS Y VALIDACIÓN (Días 9-10)**

#### **5.1 Testing Checklist**
- ✅ Asterisk funciona normalmente
- ✅ Login desde Cloudflare funciona
- ✅ Redirecciones correctas
- ✅ Base de datos accesible
- ✅ Logs sin errores
- ✅ Firewall seguro

---

## ⚠️ **RIESGOS Y MITIGACIONES**

### **Riesgo Alto: Afectar Asterisk**
**Mitigación:**
- Backup completo antes de empezar
- No tocar puertos/servicios de Asterisk
- Usuario separado para SKYN3T
- Monitoreo constante durante migración

### **Riesgo Medio: Problemas de Conectividad**
**Mitigación:**
- Rollback plan preparado
- DNS con TTL bajo durante migración
- Testing en entorno staging primero

### **Riesgo Bajo: Rendimiento**
**Mitigación:**
- Monitoreo de recursos
- Optimización de MySQL
- Nginx optimizado

---

## 🚀 **PRÓXIMOS PASOS INMEDIATOS**

### **Información que necesitamos de ti:**

1. **¿Qué SO usa tu servidor?** (Ubuntu/CentOS/etc.)
2. **¿Cuál es la IP pública de tu servidor?**
3. **¿Qué puertos usa actualmente Asterisk?**
4. **¿Tienes acceso SSH root al servidor?**
5. **¿Hay algún firewall configurado?** (ufw/iptables)
6. **¿Cuánta RAM/CPU tiene disponible?**

### **Scripts que puedes ejecutar para obtener info:**

```bash
# Información básica del sistema
uname -a && cat /etc/os-release

# Puertos en uso
sudo ss -tulpn | sort

# Recursos disponibles  
free -h && df -h

# Estado de Asterisk
systemctl status asterisk

# Firewall actual
sudo ufw status numbered 2>/dev/null || sudo iptables -L
```

**¿Puedes ejecutar estos comandos y compartir la salida?** Así podré diseñar el plan específico para tu entorno sin riesgo de afectar tu PBX. 🎯