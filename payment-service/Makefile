# SKYN3T Payment Service Makefile
# Automatización de tareas comunes de desarrollo y deployment

.PHONY: help
help: ## Mostrar esta ayuda
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

# Variables
DOCKER_COMPOSE = docker-compose -f docker-compose.dev.yml
DOCKER_COMPOSE_PROD = docker-compose -f docker-compose.yml
NPM = npm
SERVICE_NAME = payment-service
DB_CONTAINER = payment-postgres-dev

# Colores para output
RED = \033[0;31m
GREEN = \033[0;32m
YELLOW = \033[0;33m
NC = \033[0m # No Color

# Desarrollo
.PHONY: install
install: ## Instalar dependencias
	@echo "$(GREEN)Installing dependencies...$(NC)"
	$(NPM) install
	@echo "$(GREEN)Dependencies installed successfully!$(NC)"

.PHONY: dev
dev: ## Iniciar entorno de desarrollo
	@echo "$(GREEN)Starting development environment...$(NC)"
	$(DOCKER_COMPOSE) up -d
	@echo "$(GREEN)Development environment is running!$(NC)"
	@echo "$(YELLOW)Services:$(NC)"
	@echo "  - Payment Service: http://localhost:3005"
	@echo "  - PostgreSQL: localhost:5432"
	@echo "  - Redis: localhost:6379"
	@echo "  - RabbitMQ: http://localhost:15672 (guest/guest)"
	@echo "  - pgAdmin: http://localhost:5050"
	@echo "  - Redis Commander: http://localhost:8081"
	@echo "  - Mailhog: http://localhost:8025"
	@echo "  - MinIO: http://localhost:9001"
	@echo "  - Prometheus: http://localhost:9090"
	@echo "  - Grafana: http://localhost:3030 (admin/admin123)"
	@echo "  - Jaeger: http://localhost:16686"
	@echo "  - Swagger UI: http://localhost:8080"

.PHONY: dev-logs
dev-logs: ## Ver logs del entorno de desarrollo
	$(DOCKER_COMPOSE) logs -f $(SERVICE_NAME)

.PHONY: dev-logs-all
dev-logs-all: ## Ver logs de todos los servicios
	$(DOCKER_COMPOSE) logs -f

.PHONY: dev-stop
dev-stop: ## Detener entorno de desarrollo
	@echo "$(YELLOW)Stopping development environment...$(NC)"
	$(DOCKER_COMPOSE) stop
	@echo "$(GREEN)Development environment stopped!$(NC)"

.PHONY: dev-down
dev-down: ## Detener y eliminar contenedores de desarrollo
	@echo "$(RED)Removing development environment...$(NC)"
	$(DOCKER_COMPOSE) down
	@echo "$(GREEN)Development environment removed!$(NC)"

.PHONY: dev-clean
dev-clean: ## Limpiar todo el entorno de desarrollo (¡CUIDADO! Elimina volúmenes)
	@echo "$(RED)WARNING: This will delete all data!$(NC)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		$(DOCKER_COMPOSE) down -v; \
		echo "$(GREEN)Development environment cleaned!$(NC)"; \
	else \
		echo "$(YELLOW)Operation cancelled$(NC)"; \
	fi

# Base de datos
.PHONY: db-migrate
db-migrate: ## Ejecutar migraciones de base de datos
	@echo "$(GREEN)Running database migrations...$(NC)"
	$(DOCKER_COMPOSE) exec $(SERVICE_NAME) npm run db:migrate
	@echo "$(GREEN)Migrations completed!$(NC)"

.PHONY: db-seed
db-seed: ## Cargar datos de prueba
	@echo "$(GREEN)Seeding database...$(NC)"
	$(DOCKER_COMPOSE) exec $(SERVICE_NAME) npm run db:seed
	@echo "$(GREEN)Database seeded!$(NC)"

.PHONY: db-reset
db-reset: ## Resetear base de datos (¡CUIDADO!)
	@echo "$(RED)WARNING: This will delete all data!$(NC)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		$(DOCKER_COMPOSE) exec $(SERVICE_NAME) npm run db:reset; \
		echo "$(GREEN)Database reset completed!$(NC)"; \
	else \
		echo "$(YELLOW)Operation cancelled$(NC)"; \
	fi

.PHONY: db-backup
db-backup: ## Crear backup de la base de datos
	@echo "$(GREEN)Creating database backup...$(NC)"
	@mkdir -p backups
	@TIMESTAMP=$$(date +%Y%m%d_%H%M%S); \
	$(DOCKER_COMPOSE) exec -T $(DB_CONTAINER) pg_dump -U payment_user payment_db > backups/backup_$$TIMESTAMP.sql && \
	echo "$(GREEN)Backup saved to backups/backup_$$TIMESTAMP.sql$(NC)"

.PHONY: db-restore
db-restore: ## Restaurar base de datos desde backup (usage: make db-restore FILE=backups/backup_20240101_120000.sql)
	@if [ -z "$(FILE)" ]; then \
		echo "$(RED)ERROR: Please specify FILE parameter$(NC)"; \
		echo "Usage: make db-restore FILE=backups/backup_20240101_120000.sql"; \
		exit 1; \
	fi
	@echo "$(YELLOW)Restoring database from $(FILE)...$(NC)"
	@cat $(FILE) | $(DOCKER_COMPOSE) exec -T $(DB_CONTAINER) psql -U payment_user payment_db
	@echo "$(GREEN)Database restored!$(NC)"

.PHONY: db-shell
db-shell: ## Acceder a la consola de PostgreSQL
	$(DOCKER_COMPOSE) exec $(DB_CONTAINER) psql -U payment_user payment_db

# Testing
.PHONY: test
test: ## Ejecutar todos los tests
	@echo "$(GREEN)Running all tests...$(NC)"
	$(NPM) test

.PHONY: test-unit
test-unit: ## Ejecutar tests unitarios
	@echo "$(GREEN)Running unit tests...$(NC)"
	$(NPM) run test:unit

.PHONY: test-integration
test-integration: ## Ejecutar tests de integración
	@echo "$(GREEN)Running integration tests...$(NC)"
	$(NPM) run test:integration

.PHONY: test-e2e
test-e2e: ## Ejecutar tests end-to-end
	@echo "$(GREEN)Running E2E tests...$(NC)"
	$(NPM) run test:e2e

.PHONY: test-coverage
test-coverage: ## Ejecutar tests con cobertura
	@echo "$(GREEN)Running tests with coverage...$(NC)"
	$(NPM) run test:coverage

.PHONY: test-watch
test-watch: ## Ejecutar tests en modo watch
	$(NPM) run test:watch

# Calidad de código
.PHONY: lint
lint: ## Ejecutar linter
	@echo "$(GREEN)Running linter...$(NC)"
	$(NPM) run lint

.PHONY: lint-fix
lint-fix: ## Ejecutar linter y corregir automáticamente
	@echo "$(GREEN)Running linter with auto-fix...$(NC)"
	$(NPM) run lint:fix

.PHONY: format
format: ## Formatear código con Prettier
	@echo "$(GREEN)Formatting code...$(NC)"
	$(NPM) run format

.PHONY: format-check
format-check: ## Verificar formato del código
	@echo "$(GREEN)Checking code format...$(NC)"
	$(NPM) run format:check

.PHONY: type-check
type-check: ## Verificar tipos con TypeScript
	@echo "$(GREEN)Checking TypeScript types...$(NC)"
	$(NPM) run type-check

.PHONY: audit
audit: ## Auditar dependencias por vulnerabilidades
	@echo "$(GREEN)Auditing dependencies...$(NC)"
	$(NPM) audit

.PHONY: audit-fix
audit-fix: ## Corregir vulnerabilidades automáticamente
	@echo "$(GREEN)Fixing vulnerabilities...$(NC)"
	$(NPM) audit fix

# Build y Deploy
.PHONY: build
build: ## Construir para producción
	@echo "$(GREEN)Building for production...$(NC)"
	$(NPM) run build

.PHONY: docker-build
docker-build: ## Construir imagen Docker
	@echo "$(GREEN)Building Docker image...$(NC)"
	docker build -t skyn3t/$(SERVICE_NAME):latest .

.PHONY: docker-push
docker-push: ## Subir imagen Docker a registry
	@echo "$(GREEN)Pushing Docker image...$(NC)"
	docker push skyn3t/$(SERVICE_NAME):latest

.PHONY: deploy-staging
deploy-staging: ## Deploy a staging
	@echo "$(GREEN)Deploying to staging...$(NC)"
	./scripts/deploy-staging.sh

.PHONY: deploy-production
deploy-production: ## Deploy a producción
	@echo "$(RED)Deploying to PRODUCTION!$(NC)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		./scripts/deploy-production.sh; \
	else \
		echo "$(YELLOW)Deployment cancelled$(NC)"; \
	fi

# Monitoreo y Logs
.PHONY: logs
logs: ## Ver logs del servicio principal
	$(DOCKER_COMPOSE) logs -f $(SERVICE_NAME)

.PHONY: logs-tail
logs-tail: ## Ver últimas 100 líneas de logs
	$(DOCKER_COMPOSE) logs --tail=100 $(SERVICE_NAME)

.PHONY: health
health: ## Verificar salud del servicio
	@echo "$(GREEN)Checking service health...$(NC)"
	@curl -s http://localhost:3005/health | jq . || echo "$(RED)Service is not responding$(NC)"

.PHONY: metrics
metrics: ## Ver métricas del servicio
	@echo "$(GREEN)Fetching metrics...$(NC)"
	@curl -s http://localhost:3005/metrics | head -50

.PHONY: status
status: ## Ver estado de todos los contenedores
	@echo "$(GREEN)Container status:$(NC)"
	@$(DOCKER_COMPOSE) ps

# Utilidades
.PHONY: shell
shell: ## Acceder al shell del contenedor principal
	$(DOCKER_COMPOSE) exec $(SERVICE_NAME) /bin/sh

.PHONY: redis-cli
redis-cli: ## Acceder a Redis CLI
	$(DOCKER_COMPOSE) exec redis redis-cli

.PHONY: rabbitmq-cli
rabbitmq-cli: ## Acceder a RabbitMQ CLI
	$(DOCKER_COMPOSE) exec rabbitmq rabbitmqctl

.PHONY: clean-cache
clean-cache: ## Limpiar cache de Redis
	@echo "$(YELLOW)Clearing Redis cache...$(NC)"
	$(DOCKER_COMPOSE) exec redis redis-cli FLUSHDB
	@echo "$(GREEN)Cache cleared!$(NC)"

.PHONY: performance-test
performance-test: ## Ejecutar tests de performance con k6
	@echo "$(GREEN)Running performance tests...$(NC)"
	k6 run tests/performance/load-test.js

.PHONY: generate-docs
generate-docs: ## Generar documentación
	@echo "$(GREEN)Generating documentation...$(NC)"
	$(NPM) run docs:generate

.PHONY: update-deps
update-deps: ## Actualizar dependencias
	@echo "$(GREEN)Updating dependencies...$(NC)"
	$(NPM) update
	$(NPM) audit fix

# Comandos compuestos
.PHONY: fresh
fresh: dev-clean install dev db-migrate db-seed ## Instalación completa desde cero
	@echo "$(GREEN)Fresh installation completed!$(NC)"

.PHONY: check
check: lint type-check test ## Ejecutar todas las verificaciones
	@echo "$(GREEN)All checks passed!$(NC)"

.PHONY: release
release: check build docker-build ## Preparar release
	@echo "$(GREEN)Release preparation completed!$(NC)"

# Git hooks
.PHONY: install-hooks
install-hooks: ## Instalar git hooks
	@echo "$(GREEN)Installing git hooks...$(NC)"
	$(NPM) run prepare
	@echo "$(GREEN)Git hooks installed!$(NC)"

# Default target
.DEFAULT_GOAL := help