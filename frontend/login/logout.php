<?php
/**
 * SKYN3T - Logout Simple
 * Versión: 2.1.0 EMERGENCY FIX
 */

session_start();

// Destruir todas las variables de sesión
$_SESSION = array();

// Destruir la cookie de sesión
if (ini_get("session.use_cookies")) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000,
        $params["path"], $params["domain"],
        $params["secure"], $params["httponly"]
    );
}

// Destruir la sesión
session_destroy();

header('Content-Type: application/json');
echo json_encode([
    'success' => true,
    'message' => 'Logged out successfully',
    'redirect' => '/login/index_login.html'
]);
?>
