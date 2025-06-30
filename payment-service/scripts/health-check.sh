#!/bin/bash

# SKYN3T Payment Service Health Check Script
# Verifica el estado de todos los componentes del servicio

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# URLs de servicios
PAYMENT_SERVICE_URL="${PAYMENT_SERVICE_URL:-http://localhost:3005}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
RABBITMQ_HOST="${RABBITMQ_HOST:-localhost}"
RABBITMQ_PORT="${RABBITMQ_PORT:-5672}"
RABBITMQ_MGMT_PORT="${RABBITMQ_MGMT_PORT:-15672}"

# Función para imprimir con color
print_status() {
    local status=$1
    local message=$2
    
    case $status in
        "ok")
            echo -e "${GREEN}✓${NC} $message"
            ;;
        "error")
            echo -e "${RED}✗${NC} $message"
            ;;
        "warning")
            echo -e "${YELLOW}⚠${NC} $message"
            ;;
        "info")
            echo -e "${BLUE}ℹ${NC} $message"
            ;;
    esac
}

# Función para verificar conexión TCP
check_tcp_connection() {
    local host=$1
    local port=$2
    local service=$3
    
    if nc -z -w5 "$host" "$port" 2>/dev/null; then
        print_status "ok" "$service is accessible at $host:$port"
        return 0
    else
        print_status "error" "$service is not accessible at $host:$port"
        return 1
    fi
}

# Función para verificar endpoint HTTP
check_http_endpoint() {
    local url=$1
    local service=$2
    local expected_status=${3:-200}
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    
    if [ "$response" = "$expected_status" ]; then
        print_status "ok" "$service is responding at $url"
        return 0
    else
        print_status "error" "$service returned status $response at $url"
        return 1
    fi
}

# Función para verificar PostgreSQL
check_postgres() {
    if command -v pg_isready &> /dev/null; then
        if pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" &> /dev/null; then
            print_status "ok" "PostgreSQL is ready"
            
            # Verificar conexión con credenciales si están disponibles
            if [ -n "$POSTGRES_USER" ] && [ -n "$POSTGRES_PASSWORD" ]; then
                export PGPASSWORD="$POSTGRES_PASSWORD"
                if psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1" &> /dev/null; then
                    print_status "ok" "PostgreSQL authentication successful"
                else
                    print_status "warning" "PostgreSQL authentication failed"
                fi
                unset PGPASSWORD
            fi
        else
            print_status "error" "PostgreSQL is not ready"
            return 1
        fi
    else
        check_tcp_connection "$POSTGRES_HOST" "$POSTGRES_PORT" "PostgreSQL"
    fi
}

# Función para verificar Redis
check_redis() {
    if command -v redis-cli &> /dev/null; then
        if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping &> /dev/null; then
            print_status "ok" "Redis is responding to PING"
            
            # Verificar memoria disponible
            used_memory=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" INFO memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
            if [ -n "$used_memory" ]; then
                print_status "info" "Redis memory usage: $used_memory"
            fi
        else
            print_status "error" "Redis is not responding"
            return 1
        fi
    else
        check_tcp_connection "$REDIS_HOST" "$REDIS_PORT" "Redis"
    fi
}

# Función para verificar RabbitMQ
check_rabbitmq() {
    # Verificar puerto AMQP
    check_tcp_connection "$RABBITMQ_HOST" "$RABBITMQ_PORT" "RabbitMQ AMQP"
    
    # Verificar Management API si está disponible
    if check_http_endpoint "http://$RABBITMQ_HOST:$RABBITMQ_MGMT_PORT/api/overview" "RabbitMQ Management" 401; then
        print_status "info" "RabbitMQ Management UI available at http://$RABBITMQ_HOST:$RABBITMQ_MGMT_PORT"
    fi
}

# Función para verificar Payment Service
check_payment_service() {
    # Health endpoint
    if check_http_endpoint "$PAYMENT_SERVICE_URL/health" "Payment Service Health"; then
        # Obtener detalles del health check
        health_response=$(curl -s "$PAYMENT_SERVICE_URL/health" 2>/dev/null)
        if [ -n "$health_response" ]; then
            status=$(echo "$health_response" | jq -r '.status' 2>/dev/null || echo "unknown")
            if [ "$status" = "healthy" ]; then
                print_status "ok" "Payment Service is healthy"
                
                # Mostrar estado de servicios internos
                services=$(echo "$health_response" | jq -r '.services' 2>/dev/null)
                if [ -n "$services" ] && [ "$services" != "null" ]; then
                    print_status "info" "Internal services status:"
                    echo "$services" | jq -r 'to_entries[] | "  - \(.key): \(.value)"' 2>/dev/null || true
                fi
                
                # Mostrar proveedores activos
                providers=$(echo "$health_response" | jq -r '.providers' 2>/dev/null)
                if [ -n "$providers" ] && [ "$providers" != "null" ]; then
                    print_status "info" "Payment providers status:"
                    echo "$providers" | jq -r 'to_entries[] | "  - \(.key): \(.value)"' 2>/dev/null || true
                fi
            else
                print_status "warning" "Payment Service status: $status"
            fi
        fi
    fi
    
    # Metrics endpoint
    check_http_endpoint "$PAYMENT_SERVICE_URL/metrics" "Payment Service Metrics"
    
    # API docs
    check_http_endpoint "$PAYMENT_SERVICE_URL/api-docs" "Payment Service API Docs"
}

# Función para verificar proveedores de pago
check_payment_providers() {
    print_status "info" "Checking payment provider connectivity..."
    
    # Stripe
    if curl -s -H "Authorization: Bearer $STRIPE_SECRET_KEY" https://api.stripe.com/v1/charges -o /dev/null; then
        print_status "ok" "Stripe API is accessible"
    else
        print_status "warning" "Stripe API not accessible or not configured"
    fi
    
    # PayPal
    if curl -s https://api.paypal.com/v1/oauth2/token -o /dev/null; then
        print_status "ok" "PayPal API is accessible"
    else
        print_status "warning" "PayPal API not accessible"
    fi
    
    # MercadoPago
    if curl -s https://api.mercadopago.com/users/me -o /dev/null; then
        print_status "ok" "MercadoPago API is accessible"
    else
        print_status "warning" "MercadoPago API not accessible"
    fi
}

# Función para verificar espacio en disco
check_disk_space() {
    local threshold=80
    local usage=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
    
    if [ "$usage" -lt "$threshold" ]; then
        print_status "ok" "Disk usage: ${usage}%"
    else
        print_status "warning" "Disk usage high: ${usage}%"
    fi
}

# Función para verificar memoria
check_memory() {
    if command -v free &> /dev/null; then
        local total=$(free -m | awk 'NR==2 {print $2}')
        local used=$(free -m | awk 'NR==2 {print $3}')
        local percent=$((used * 100 / total))
        
        if [ "$percent" -lt 80 ]; then
            print_status "ok" "Memory usage: ${percent}% (${used}MB/${total}MB)"
        else
            print_status "warning" "Memory usage high: ${percent}% (${used}MB/${total}MB)"
        fi
    fi
}

# Función principal
main() {
    echo "======================================"
    echo "SKYN3T Payment Service Health Check"
    echo "======================================"
    echo ""
    
    local errors=0
    
    echo "🔍 Checking system resources..."
    check_disk_space || ((errors++))
    check_memory || ((errors++))
    echo ""
    
    echo "🗄️ Checking databases..."
    check_postgres || ((errors++))
    check_redis || ((errors++))
    echo ""
    
    echo "📨 Checking message queue..."
    check_rabbitmq || ((errors++))
    echo ""
    
    echo "💳 Checking payment service..."
    check_payment_service || ((errors++))
    echo ""
    
    echo "🌐 Checking external providers..."
    check_payment_providers
    echo ""
    
    echo "======================================"
    if [ "$errors" -eq 0 ]; then
        print_status "ok" "All core services are healthy!"
        exit 0
    else
        print_status "error" "Found $errors issues with core services"
        exit 1
    fi
}

# Manejar argumentos
case "${1:-}" in
    --json)
        # Output en formato JSON
        echo '{"error": "JSON output not implemented yet"}'
        exit 1
        ;;
    --help|-h)
        echo "Usage: $0 [--json]"
        echo ""
        echo "Options:"
        echo "  --json    Output results in JSON format"
        echo "  --help    Show this help message"
        exit 0
        ;;
    *)
        main
        ;;
esac