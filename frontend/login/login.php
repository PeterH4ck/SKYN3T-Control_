<?php
/**
 * SKYN3T - Login con Redirección por Roles
 * Versión: 2.3.0
 * Redirección correcta según rol de usuario
 */

// Iniciar sesión
session_start();

// Configuración de base de datos
define('DB_HOST', 'localhost');
define('DB_NAME', 'skyn3t_db');
define('DB_USER', 'skyn3t_app');
define('DB_PASS', 'Skyn3t2025!');

// Si es GET, devolver estado
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    header('Content-Type: application/json');
    echo json_encode(['status' => 'ready', 'message' => 'Login endpoint ready']);
    exit;
}

// Solo aceptar POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// Configurar headers
header('Content-Type: application/json');
header('Cache-Control: no-cache, no-store, must-revalidate');

// Obtener datos JSON
$input = json_decode(file_get_contents('php://input'), true);

// Si no hay JSON, intentar con POST normal
if (!$input) {
    $input = $_POST;
}

// Validar entrada
if (!isset($input['username']) || !isset($input['password'])) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Username and password required'
    ]);
    exit;
}

$username = trim($input['username']);
$password = trim($input['password']);

// Validación básica
if (empty($username) || empty($password)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Username and password cannot be empty'
    ]);
    exit;
}

try {
    // Conectar a la base de datos
    $pdo = new PDO(
        "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4",
        DB_USER,
        DB_PASS,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]
    );

    // Buscar usuario
    $stmt = $pdo->prepare("
        SELECT id, username, password, role, active 
        FROM users 
        WHERE username = ? 
        LIMIT 1
    ");
    
    $stmt->execute([$username]);
    $user = $stmt->fetch();
    
    // Verificar si existe el usuario
    if (!$user) {
        logAttempt($pdo, $username, 'login_failed', 'User not found');
        
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'error' => 'Invalid username or password'
        ]);
        exit;
    }
    
    // Verificar si está activo
    if ($user['active'] != 1) {
        logAttempt($pdo, $username, 'login_failed', 'User inactive');
        
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error' => 'Account is inactive'
        ]);
        exit;
    }
    
    // Verificar contraseña
    $password_valid = false;
    
    // Primero intentar con password_verify
    if (password_verify($password, $user['password'])) {
        $password_valid = true;
    } 
    // Para desarrollo: permitir admin/admin y peterh4ck/admin
    else if (($username === 'admin' || $username === 'peterh4ck') && $password === 'admin') {
        $password_valid = true;
        // Actualizar el hash en la DB
        $new_hash = password_hash('admin', PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("UPDATE users SET password = ? WHERE id = ?");
        $stmt->execute([$new_hash, $user['id']]);
    }
    
    if (!$password_valid) {
        logAttempt($pdo, $username, 'login_failed', 'Invalid password');
        
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'error' => 'Invalid username or password'
        ]);
        exit;
    }
    
    // Login exitoso - Crear sesión
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['role'] = $user['role'];
    $_SESSION['login_time'] = time();
    $_SESSION['session_token'] = bin2hex(random_bytes(32));
    $_SESSION['authenticated'] = true;
    
    // Actualizar último login
    $stmt = $pdo->prepare("UPDATE users SET last_login = NOW() WHERE id = ?");
    $stmt->execute([$user['id']]);
    
    // Log exitoso
    logAttempt($pdo, $username, 'login_success', 'Login successful');
    
    // Determinar redirección según rol - ACTUALIZADO
    $redirect = '/rele/index_rele.html'; // Por defecto
    
    switch ($user['role']) {
        case 'SuperUser':
        case 'Admin':
        case 'SupportAdmin':
            // Roles administrativos van al dashboard
            $redirect = '/dashboard/dashboard.html';
            break;
            
        case 'User':
            // Usuarios básicos van al formulario de input
            $redirect = '/input_data/input.html';
            break;
            
        default:
            // Por defecto al panel de control básico
            $redirect = '/rele/index_rele.html';
            break;
    }
    
    // Respuesta exitosa
    echo json_encode([
        'success' => true,
        'message' => 'Login successful',
        'user' => [
            'id' => $user['id'],
            'username' => $user['username'],
            'role' => $user['role']
        ],
        'session_token' => $_SESSION['session_token'],
        'redirect' => $redirect,
        'debug' => [
            'role' => $user['role'],
            'redirect_path' => $redirect
        ]
    ]);
    
} catch (PDOException $e) {
    error_log("Login database error: " . $e->getMessage());
    
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Database connection error',
        'details' => 'Please check database configuration'
    ]);
} catch (Exception $e) {
    error_log("Login general error: " . $e->getMessage());
    
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'System error occurred'
    ]);
}

/**
 * Función simple para registrar intentos
 */
function logAttempt($pdo, $username, $action, $details) {
    try {
        $stmt = $pdo->prepare("
            INSERT INTO access_log (username, action, details, ip_address, user_agent, timestamp) 
            VALUES (?, ?, ?, ?, ?, NOW())
        ");
        
        $stmt->execute([
            $username,
            $action,
            $details,
            $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0',
            $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown'
        ]);
    } catch (Exception $e) {
        error_log("Failed to log attempt: " . $e->getMessage());
    }
}
?>
