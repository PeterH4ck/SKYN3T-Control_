# 🚀 Implementación Completa SKYN3T - Arquitectura Híbrida

## 📊 **ARQUITECTURA FINAL**

```
┌─────────────────────────────────────────────────────┐
│                 CLOUDFLARE                          │
│  ┌─────────────────────────────────────────────────┐│
│  │           Frontend (Público)                    ││
│  │  • skyn3t.cl (GitHub → Cloudflare Pages)        ││
│  │  • Homepage estática                            ││
│  │  • CDN global, DDoS protection                  ││
│  │  • SSL automático                               ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────┬───────────────────────────────┘
                      │ HTTPS API calls
                      ▼
┌─────────────────────────────────────────────────────┐
│              TU SERVIDOR UBUNTU 22.04              │
│  ┌─────────────────────────────────────────────────┐│
│  │         Backend SKYN3T (api.skyn3t.cl)         ││
│  │  • Apache2 Virtual Host (Puerto 443)           ││
│  │  • APIs PHP (login, session, logout)           ││
│  │  • MariaDB (Base de datos)                     ││
│  │  • SSL/HTTPS seguro                            ││
│  └─────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────┐│
│  │         PBX Asterisk (INTACTO)                  ││
│  │  • Puertos: 5060, 4569, 5038, 8089             ││
│  │  • Servicios VoIP funcionando                  ││
│  │  • Sin modificaciones                          ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

---

## 🎯 **ESTADO ACTUAL CONFIRMADO**

### **✅ Servidor Ubuntu 22.04.5 LTS**
- **RAM**: 15GB total, 14GB disponible
- **Disco**: 469GB total, 419GB libres  
- **Apache2**: ✅ Funcionando (Puerto 443)
- **MariaDB**: ✅ Instalado (Puerto 3306)
- **Asterisk**: ✅ Funcionando perfectamente (Puertos 5060,4569,5038,8089)
- **Firewall UFW**: ✅ Configurado correctamente

### **✅ Infraestructura Actual**
- **Frontend**: GitHub → Cloudflare Pages → `skyn3t.cl`
- **Backend**: Por configurar en tu servidor
- **Separación**: Asterisk aislado y protegido

---

## 🛠️ **IMPLEMENTACIÓN PASO A PASO**

### **FASE 1: CONFIGURACIÓN DNS Y SUBDOMINIOS**

#### **1.1 Configurar Subdominio en Cloudflare**

**Ve a tu panel de Cloudflare:**

1. **Dashboard Cloudflare** → **Dominio skyn3t.cl** → **DNS**

2. **Agregar registro A para API:**
```
Tipo: A
Nombre: api
IPv4: [TU-IP-PUBLICA-DEL-SERVIDOR]
Proxy: 🟠 DNS only (sin proxy inicialmente)
TTL: Auto
```

3. **Verificar DNS:**
```bash
# Desde tu computadora local
nslookup api.skyn3t.cl
dig api.skyn3t.cl
```

#### **1.2 Preparar Servidor - Firewall**

**En tu servidor, ejecuta:**

```bash
# 1. Abrir puerto 80 para HTTP→HTTPS redirect
sudo ufw allow 80/tcp comment "HTTP SKYN3T redirect"
sudo ufw reload

# 2. Verificar estado
sudo ufw status numbered

# 3. Verificar que Asterisk sigue funcionando
systemctl status asterisk
sudo ss -tulpn | grep asterisk
```

### **FASE 2: CONFIGURACIÓN BASE DE DATOS**

#### **2.1 Crear Base de Datos SKYN3T**

```bash
# Conectar a MariaDB
sudo mysql -u root -p
```

```sql
-- Crear base de datos y usuario
CREATE DATABASE skyn3t_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'skyn3t_app'@'localhost' IDENTIFIED BY 'Skyn3t2025!SecurePass';
GRANT ALL PRIVILEGES ON skyn3t_db.* TO 'skyn3t_app'@'localhost';
FLUSH PRIVILEGES;

-- Verificar creación
SHOW DATABASES;
SELECT User, Host FROM mysql.user WHERE User = 'skyn3t_app';
EXIT;
```

#### **2.2 Crear Schema de Tablas**

```bash
# Crear archivo de schema
sudo nano /tmp/skyn3t_schema.sql
```

```sql
-- /tmp/skyn3t_schema.sql
USE skyn3t_db;

-- Tabla de usuarios
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(100),
    role ENUM('SuperUser', 'Admin', 'SupportAdmin', 'User') DEFAULT 'User',
    active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    login_attempts INT DEFAULT 0,
    locked_until TIMESTAMP NULL
);

-- Tabla de sesiones
CREATE TABLE sessions (
    id VARCHAR(128) PRIMARY KEY,
    user_id INT NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    active TINYINT(1) DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Tabla de logs de acceso
CREATE TABLE access_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50),
    action VARCHAR(50),
    details TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('success', 'failed', 'blocked') DEFAULT 'failed'
);

-- Insertar usuario administrador inicial
INSERT INTO users (username, password, email, role) VALUES 
('admin', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin@skyn3t.cl', 'SuperUser'),
('peterh4ck', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'peter@skyn3t.cl', 'Admin');

-- Crear índices para rendimiento
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_active ON users(active);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_access_log_timestamp ON access_log(timestamp);
CREATE INDEX idx_access_log_username ON access_log(username);
```

```bash
# Ejecutar schema
sudo mysql -u root -p skyn3t_db < /tmp/skyn3t_schema.sql

# Verificar tablas creadas
sudo mysql -u root -p -e "USE skyn3t_db; SHOW TABLES; SELECT username, role FROM users;"
```

### **FASE 3: CONFIGURACIÓN APACHE Y SSL**

#### **3.1 Crear Estructura de Directorios**

```bash
# Crear estructura para SKYN3T
sudo mkdir -p /var/www/skyn3t/{api,dashboard,includes,logs,uploads}
sudo mkdir -p /var/www/skyn3t/api/{v1,auth}

# Permisos correctos
sudo chown -R www-data:www-data /var/www/skyn3t
sudo chmod -R 755 /var/www/skyn3t
sudo chmod -R 755 /var/www/skyn3t/logs

# Estructura final
tree /var/www/skyn3t
```

#### **3.2 Obtener Certificado SSL para api.skyn3t.cl**

```bash
# Instalar Certbot si no está instalado
sudo apt update
sudo apt install -y certbot python3-certbot-apache

# Obtener certificado SSL para el subdominio
sudo certbot --apache -d api.skyn3t.cl

# Verificar certificados
sudo certbot certificates

# Configurar renovación automática
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

#### **3.3 Configurar Virtual Host Apache**

```bash
# Crear virtual host para SKYN3T API
sudo nano /etc/apache2/sites-available/skyn3t-api.conf
```

```apache
# /etc/apache2/sites-available/skyn3t-api.conf

# HTTP Virtual Host - Redirect to HTTPS
<VirtualHost *:80>
    ServerName api.skyn3t.cl
    DocumentRoot /var/www/skyn3t
    
    # Security headers
    Header always set X-Frame-Options "DENY"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-XSS-Protection "1; mode=block"
    
    # Redirect all HTTP to HTTPS
    RewriteEngine On
    RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
    
    # Logs
    ErrorLog ${APACHE_LOG_DIR}/skyn3t-api-error.log
    CustomLog ${APACHE_LOG_DIR}/skyn3t-api-access.log combined
</VirtualHost>

# HTTPS Virtual Host - Main API
<VirtualHost *:443>
    ServerName api.skyn3t.cl
    DocumentRoot /var/www/skyn3t
    
    # SSL Configuration (Certbot will modify this)
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/api.skyn3t.cl/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/api.skyn3t.cl/privkey.pem
    Include /etc/letsencrypt/options-ssl-apache.conf
    SSLCertificateChainFile /etc/letsencrypt/live/api.skyn3t.cl/chain.pem
    
    # Security Headers
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Frame-Options "DENY"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
    
    # CORS Configuration for Cloudflare
    Header always set Access-Control-Allow-Origin "https://skyn3t.cl"
    Header always set Access-Control-Allow-Methods "GET, POST, OPTIONS, PUT, DELETE"
    Header always set Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With, X-CF-Origin"
    Header always set Access-Control-Allow-Credentials "true"
    
    # API Directory Configuration
    <Directory "/var/www/skyn3t">
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
        
        # PHP Configuration
        php_value upload_max_filesize "10M"
        php_value post_max_size "10M"
        php_value max_execution_time "30"
        php_value memory_limit "128M"
    </Directory>
    
    # API Endpoints
    Alias /api /var/www/skyn3t/api
    <Directory "/var/www/skyn3t/api">
        Options -Indexes
        AllowOverride All
        Require all granted
        
        # Rate limiting (if mod_qos is available)
        # QS_SrvMaxConnPerIP 20
    </Directory>
    
    # Dashboard Directory
    Alias /dashboard /var/www/skyn3t/dashboard
    <Directory "/var/www/skyn3t/dashboard">
        Options -Indexes
        AllowOverride All
        Require all granted
    </Directory>
    
    # Logs Directory - Block access
    <Directory "/var/www/skyn3t/logs">
        Require all denied
    </Directory>
    
    # Includes Directory - Block access  
    <Directory "/var/www/skyn3t/includes">
        Require all denied
    </Directory>
    
    # Error and Access Logs
    ErrorLog ${APACHE_LOG_DIR}/skyn3t-api-ssl-error.log
    CustomLog ${APACHE_LOG_DIR}/skyn3t-api-ssl-access.log combined
    
    # Optional: Custom error pages
    ErrorDocument 404 /api/error.php?code=404
    ErrorDocument 500 /api/error.php?code=500
</VirtualHost>
```

#### **3.4 Habilitar Configuración**

```bash
# Habilitar módulos necesarios
sudo a2enmod ssl rewrite headers
sudo a2enmod http2  # HTTP/2 para mejor rendimiento

# Habilitar sitio SKYN3T
sudo a2ensite skyn3t-api.conf

# Verificar configuración
sudo apache2ctl configtest

# Si todo está OK, recargar Apache
sudo systemctl reload apache2

# Verificar que está funcionando
sudo systemctl status apache2
sudo ss -tulpn | grep :443
```

### **FASE 4: APIS BACKEND PHP**

#### **4.1 Archivo de Configuración**

```bash
# Crear configuración principal
sudo nano /var/www/skyn3t/includes/config.php
```

```php
<?php
/**
 * SKYN3T API - Configuración Principal
 * Archivo: /var/www/skyn3t/includes/config.php
 */

// Configuración de la base de datos
define('DB_HOST', 'localhost');
define('DB_NAME', 'skyn3t_db');
define('DB_USER', 'skyn3t_app');
define('DB_PASS', 'Skyn3t2025!SecurePass');
define('DB_CHARSET', 'utf8mb4');

// Configuración de la aplicación
define('APP_NAME', 'SKYN3T Control System');
define('APP_VERSION', '1.0.0');
define('APP_ENV', 'production'); // development, production

// Configuración de seguridad
define('SESSION_LIFETIME', 3600 * 8); // 8 horas
define('MAX_LOGIN_ATTEMPTS', 5);
define('LOCKOUT_DURATION', 300); // 5 minutos
define('CSRF_TOKEN_LIFETIME', 3600); // 1 hora

// Dominios permitidos para CORS
define('ALLOWED_ORIGINS', [
    'https://skyn3t.cl',
    'https://www.skyn3t.cl'
]);

// Configuración de logs
define('LOG_PATH', '/var/www/skyn3t/logs/');
define('LOG_LEVEL', 'INFO'); // DEBUG, INFO, WARN, ERROR

// Configuración de sesiones
ini_set('session.cookie_httponly', 1);
ini_set('session.cookie_secure', 1);
ini_set('session.cookie_samesite', 'Strict');
ini_set('session.use_only_cookies', 1);
ini_set('session.gc_maxlifetime', SESSION_LIFETIME);

// Timezone
date_default_timezone_set('America/Santiago');

// Error reporting para producción
if (APP_ENV === 'production') {
    error_reporting(0);
    ini_set('display_errors', 0);
    ini_set('log_errors', 1);
    ini_set('error_log', LOG_PATH . 'php_errors.log');
} else {
    error_reporting(E_ALL);
    ini_set('display_errors', 1);
}
?>
```

#### **4.2 Clase de Base de Datos**

```bash
sudo nano /var/www/skyn3t/includes/Database.php
```

```php
<?php
/**
 * SKYN3T API - Clase Database
 * Archivo: /var/www/skyn3t/includes/Database.php
 */

class Database {
    private static $instance = null;
    private $pdo;
    
    private function __construct() {
        try {
            $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;
            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_PERSISTENT => false,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES " . DB_CHARSET
            ];
            
            $this->pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            error_log("Database connection failed: " . $e->getMessage());
            throw new Exception("Database connection failed");
        }
    }
    
    public static function getInstance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    public function getConnection() {
        return $this->pdo;
    }
    
    public function query($sql, $params = []) {
        try {
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt;
        } catch (PDOException $e) {
            error_log("Database query failed: " . $e->getMessage());
            throw new Exception("Database query failed");
        }
    }
    
    public function fetch($sql, $params = []) {
        return $this->query($sql, $params)->fetch();
    }
    
    public function fetchAll($sql, $params = []) {
        return $this->query($sql, $params)->fetchAll();
    }
    
    public function lastInsertId() {
        return $this->pdo->lastInsertId();
    }
    
    public function beginTransaction() {
        return $this->pdo->beginTransaction();
    }
    
    public function commit() {
        return $this->pdo->commit();
    }
    
    public function rollback() {
        return $this->pdo->rollback();
    }
}
?>
```

#### **4.3 API de Login**

```bash
sudo nano /var/www/skyn3t/api/auth/login.php
```

```php
<?php
/**
 * SKYN3T API - Login Endpoint
 * Archivo: /var/www/skyn3t/api/auth/login.php
 */

require_once '../../includes/config.php';
require_once '../../includes/Database.php';

// Headers de seguridad y CORS
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

// Verificar origen permitido
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, ALLOWED_ORIGINS)) {
    header("Access-Control-Allow-Origin: $origin");
} else {
    header('Access-Control-Allow-Origin: https://skyn3t.cl');
}

header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With, X-CF-Origin');

// Manejar preflight OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Solo aceptar POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// Verificar header de origen Cloudflare
$cfOrigin = $_SERVER['HTTP_X_CF_ORIGIN'] ?? '';
if ($cfOrigin !== 'skyn3t-cloudflare') {
    error_log("Unauthorized access attempt from: " . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
}

// Iniciar sesión
session_start();

try {
    // Obtener datos del request
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input) {
        $input = $_POST;
    }
    
    $username = trim($input['username'] ?? '');
    $password = $input['password'] ?? '';
    $remember = ($input['remember'] ?? false) == true;
    
    // Validaciones básicas
    if (empty($username) || empty($password)) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'Username and password are required'
        ]);
        exit;
    }
    
    if (strlen($username) > 50 || strlen($password) > 255) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'Invalid input length'
        ]);
        exit;
    }
    
    // Conectar a la base de datos
    $db = Database::getInstance();
    
    // Verificar intentos de login fallidos
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    $lockoutCheck = $db->fetch(
        "SELECT COUNT(*) as attempts FROM access_log 
         WHERE ip_address = ? AND action = 'login_failed' 
         AND timestamp > DATE_SUB(NOW(), INTERVAL 15 MINUTE)",
        [$ip]
    );
    
    if ($lockoutCheck['attempts'] >= MAX_LOGIN_ATTEMPTS) {
        logAccess($db, $username, 'login_blocked', 'IP blocked due to too many attempts', $ip);
        
        http_response_code(429);
        echo json_encode([
            'success' => false,
            'error' => 'Too many failed attempts. Please try again later.'
        ]);
        exit;
    }
    
    // Buscar usuario
    $user = $db->fetch(
        "SELECT id, username, password, email, role, active, login_attempts, locked_until 
         FROM users WHERE username = ? LIMIT 1",
        [$username]
    );
    
    if (!$user) {
        logAccess($db, $username, 'login_failed', 'User not found', $ip);
        
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'error' => 'Invalid credentials'
        ]);
        exit;
    }
    
    // Verificar si la cuenta está activa
    if (!$user['active']) {
        logAccess($db, $username, 'login_failed', 'Account inactive', $ip);
        
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error' => 'Account is inactive'
        ]);
        exit;
    }
    
    // Verificar si la cuenta está bloqueada temporalmente
    if ($user['locked_until'] && new DateTime($user['locked_until']) > new DateTime()) {
        logAccess($db, $username, 'login_failed', 'Account temporarily locked', $ip);
        
        http_response_code(423);
        echo json_encode([
            'success' => false,
            'error' => 'Account temporarily locked. Please try again later.'
        ]);
        exit;
    }
    
    // Verificar contraseña
    if (!password_verify($password, $user['password'])) {
        // Incrementar intentos fallidos
        $db->query(
            "UPDATE users SET login_attempts = login_attempts + 1, 
             locked_until = IF(login_attempts >= ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE), NULL)
             WHERE id = ?",
            [MAX_LOGIN_ATTEMPTS - 1, $user['id']]
        );
        
        logAccess($db, $username, 'login_failed', 'Invalid password', $ip);
        
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'error' => 'Invalid credentials'
        ]);
        exit;
    }
    
    // Login exitoso - Limpiar intentos fallidos y crear sesión
    $db->beginTransaction();
    
    try {
        // Resetear intentos de login
        $db->query(
            "UPDATE users SET login_attempts = 0, locked_until = NULL, last_login = NOW() 
             WHERE id = ?",
            [$user['id']]
        );
        
        // Crear sesión
        $sessionId = bin2hex(random_bytes(32));
        $expiresAt = date('Y-m-d H:i:s', time() + SESSION_LIFETIME);
        
        // Limpiar sesiones antiguas del usuario
        $db->query(
            "UPDATE sessions SET active = 0 WHERE user_id = ?",
            [$user['id']]
        );
        
        // Insertar nueva sesión
        $db->query(
            "INSERT INTO sessions (id, user_id, ip_address, user_agent, expires_at) 
             VALUES (?, ?, ?, ?, ?)",
            [
                $sessionId,
                $user['id'],
                $ip,
                $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown',
                $expiresAt
            ]
        );
        
        $db->commit();
        
        // Configurar sesión PHP
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['username'] = $user['username'];
        $_SESSION['role'] = $user['role'];
        $_SESSION['session_id'] = $sessionId;
        $_SESSION['login_time'] = time();
        
        // Configurar cookie si "recordar"
        if ($remember) {
            $cookieExpire = time() + (30 * 24 * 60 * 60); // 30 días
            setcookie('skyn3t_remember', $sessionId, $cookieExpire, '/', '.skyn3t.cl', true, true);
        }
        
        // Log exitoso
        logAccess($db, $username, 'login_success', 'Login successful', $ip);
        
        // Determinar redirección según rol
        $redirectUrl = getRedirectByRole($user['role']);
        
        // Respuesta exitosa
        echo json_encode([
            'success' => true,
            'message' => 'Login successful',
            'user' => [
                'id' => $user['id'],
                'username' => $user['username'],
                'role' => $user['role'],
                'email' => $user['email']
            ],
            'session_id' => $sessionId,
            'expires_at' => $expiresAt,
            'redirect' => $redirectUrl
        ]);
        
    } catch (Exception $e) {
        $db->rollback();
        throw $e;
    }
    
} catch (Exception $e) {
    error_log("Login error: " . $e->getMessage());
    
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Internal server error'
    ]);
}

/**
 * Funciones auxiliares
 */
function logAccess($db, $username, $action, $details, $ip) {
    try {
        $db->query(
            "INSERT INTO access_log (username, action, details, ip_address, user_agent, status) 
             VALUES (?, ?, ?, ?, ?, ?)",
            [
                $username,
                $action,
                $details,
                $ip,
                $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown',
                strpos($action, 'success') !== false ? 'success' : 'failed'
            ]
        );
    } catch (Exception $e) {
        error_log("Failed to log access: " . $e->getMessage());
    }
}

function getRedirectByRole($role) {
    switch ($role) {
        case 'SuperUser':
        case 'Admin':
            return 'https://api.skyn3t.cl/dashboard/admin.html';
        case 'SupportAdmin':
            return 'https://api.skyn3t.cl/dashboard/support.html';
        case 'User':
        default:
            return 'https://api.skyn3t.cl/dashboard/user.html';
    }
}
?>
```

### **FASE 5: MODIFICAR FRONTEND (CLOUDFLARE)**

#### **5.1 Actualizar index.html en GitHub**

En tu repositorio de GitHub, modifica el botón de login:

```html
<!-- Cambiar esto -->
<a href="frontend/public/login/index_login.html" class="floating-login">
    <i class="fas fa-sign-in-alt"></i>
    Acceso Clientes
</a>

<!-- Por esto -->
<a href="https://api.skyn3t.cl/login/" class="floating-login">
    <i class="fas fa-sign-in-alt"></i>
    Acceso Clientes
</a>
```

#### **5.2 Crear Página de Login en Servidor**

```bash
sudo nano /var/www/skyn3t/login/index.html
```

```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SKYN3T - Acceso al Sistema</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <!-- Incluir aquí los estilos del login que ya tienes -->
</head>
<body>
    <!-- Botón de retorno -->
    <a href="https://skyn3t.cl" class="back-to-home">
        <i class="fas fa-arrow-left"></i> Volver al Inicio
    </a>

    <!-- Formulario de login -->
    <div class="container">
        <div class="login-box">
            <!-- Tu formulario actual aquí -->
        </div>
    </div>

    <script>
        // Modificar la URL del API
        function startLoginProcess(username, password, remember) {
            // ... código anterior ...
            
            // Cambiar URL del fetch
            fetch('https://api.skyn3t.cl/api/auth/login.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CF-Origin': 'skyn3t-cloudflare'
                },
                credentials: 'include',
                body: JSON.stringify({username, password, remember})
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    window.location.href = data.redirect;
                } else {
                    showMessage(data.error, 'error');
                }
            })
            .catch(error => {
                showMessage('Error de conexión', 'error');
            });
        }
    </script>
</body>
</html>
```

### **FASE 6: TESTING Y VALIDACIÓN**

#### **6.1 Verificar Configuración**

```bash
# 1. Verificar Apache
sudo apache2ctl configtest
sudo systemctl status apache2

# 2. Verificar SSL
curl -I https://api.skyn3t.cl

# 3. Verificar API
curl -X POST https://api.skyn3t.cl/api/auth/login.php \
  -H "Content-Type: application/json" \
  -H "X-CF-Origin: skyn3t-cloudflare" \
  -d '{"username":"admin","password":"password"}'

# 4. Verificar logs
sudo tail -f /var/log/apache2/skyn3t-api-ssl-access.log
sudo tail -f /var/log/apache2/skyn3t-api-ssl-error.log
```

#### **6.2 Checklist Final**

- ✅ DNS `api.skyn3t.cl` resuelve correctamente
- ✅ SSL certificado válido
- ✅ Apache virtual host funcionando
- ✅ Base de datos accesible
- ✅ API de login responde
- ✅ CORS configurado para skyn3t.cl
- ✅ Logs funcionando
- ✅ Asterisk intacto y funcionando

---

## 🚀 **SIGUIENTE PASO**

**¿Empezamos con la FASE 1 (DNS y Firewall)?**

Ejecuta estos comandos para empezar:

```bash
# 1. Firewall
sudo ufw allow 80/tcp comment "HTTP SKYN3T"
sudo ufw reload && sudo ufw status

# 2. Verificar Apache
sudo apache2ctl -M | grep -E "rewrite|ssl|headers"
```

**Una vez completemos la configuración DNS en Cloudflare, continuamos con las siguientes fases.**

¿Listo para empezar? 🎯