# SKYN3T Access Control System - Makefile
# =====================================================

# Variables
DOCKER_COMPOSE = docker-compose
DOCKER = docker
PROJECT_NAME = skyn3t

# Colors for output
GREEN = \033[0;32m
YELLOW = \033[0;33m
RED = \033[0;31m
NC = \033[0m # No Color

.DEFAULT_GOAL := help

# =====================================================
# MAIN COMMANDS
# =====================================================

.PHONY: help
help: ## Show this help message
	@echo "$(GREEN)SKYN3T Access Control System - Docker Commands$(NC)"
	@echo "================================================="
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "$(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'

.PHONY: up
up: ## Start all services
	@echo "$(GREEN)Starting all services...$(NC)"
	$(DOCKER_COMPOSE) up -d
	@echo "$(GREEN)Services started! Access the system at:$(NC)"
	@echo "  - Frontend: http://localhost:3000"
	@echo "  - API: http://localhost:8000"
	@echo "  - Grafana: http://localhost:3000/grafana (admin/grafana123)"
	@echo "  - Kibana: http://localhost:3000/kibana"
	@echo "  - RabbitMQ: http://localhost:15672 (admin/rabbitmq123)"

.PHONY: down
down: ## Stop all services
	@echo "$(YELLOW)Stopping all services...$(NC)"
	$(DOCKER_COMPOSE) down

.PHONY: restart
restart: down up ## Restart all services

.PHONY: clean
clean: ## Stop services and remove volumes (WARNING: Deletes all data!)
	@echo "$(RED)WARNING: This will delete all data!$(NC)"
	@echo "Press Ctrl+C to cancel, or Enter to continue..."
	@read confirm
	$(DOCKER_COMPOSE) down -v

# =====================================================
# SERVICE MANAGEMENT
# =====================================================

.PHONY: ps
ps: ## Show running services
	$(DOCKER_COMPOSE) ps

.PHONY: logs
logs: ## Show logs for all services
	$(DOCKER_COMPOSE) logs -f

.PHONY: logs-service
logs-service: ## Show logs for specific service (usage: make logs-service SERVICE=auth-service)
	$(DOCKER_COMPOSE) logs -f $(SERVICE)

.PHONY: restart-service
restart-service: ## Restart specific service (usage: make restart-service SERVICE=auth-service)
	$(DOCKER_COMPOSE) restart $(SERVICE)

.PHONY: exec
exec: ## Execute command in service (usage: make exec SERVICE=postgres CMD=psql)
	$(DOCKER_COMPOSE) exec $(SERVICE) $(CMD)

# =====================================================
# DATABASE COMMANDS
# =====================================================

.PHONY: db-shell
db-shell: ## Access PostgreSQL shell
	$(DOCKER_COMPOSE) exec postgres psql -U postgres -d master_db

.PHONY: db-backup
db-backup: ## Backup database
	@echo "$(GREEN)Creating database backup...$(NC)"
	@mkdir -p backups
	$(DOCKER_COMPOSE) exec postgres pg_dump -U postgres master_db > backups/backup_$(shell date +%Y%m%d_%H%M%S).sql
	@echo "$(GREEN)Backup created in backups/ directory$(NC)"

.PHONY: db-restore
db-restore: ## Restore database (usage: make db-restore FILE=backup.sql)
	@echo "$(YELLOW)Restoring database from $(FILE)...$(NC)"
	$(DOCKER_COMPOSE) exec -T postgres psql -U postgres master_db < $(FILE)
	@echo "$(GREEN)Database restored$(NC)"

.PHONY: db-migrate
db-migrate: ## Run database migrations
	@echo "$(GREEN)Running database migrations...$(NC)"
	$(DOCKER_COMPOSE) exec auth-service npm run migrate

.PHONY: db-seed
db-seed: ## Seed database with test data
	@echo "$(GREEN)Seeding database...$(NC)"
	$(DOCKER_COMPOSE) exec auth-service npm run seed

# =====================================================
# DEVELOPMENT COMMANDS
# =====================================================

.PHONY: dev
dev: ## Start services in development mode
	@echo "$(GREEN)Starting in development mode...$(NC)"
	NODE_ENV=development $(DOCKER_COMPOSE) up

.PHONY: build
build: ## Build all services
	@echo "$(GREEN)Building all services...$(NC)"
	$(DOCKER_COMPOSE) build

.PHONY: build-service
build-service: ## Build specific service (usage: make build-service SERVICE=auth-service)
	$(DOCKER_COMPOSE) build $(SERVICE)

.PHONY: pull
pull: ## Pull latest images
	$(DOCKER_COMPOSE) pull

# =====================================================
# MONITORING COMMANDS
# =====================================================

.PHONY: status
status: ## Check system status
	@echo "$(GREEN)System Status:$(NC)"
	@echo "=============="
	@$(DOCKER_COMPOSE) ps
	@echo ""
	@echo "$(GREEN)Database Status:$(NC)"
	@$(DOCKER_COMPOSE) exec postgres pg_isready -U postgres || echo "$(RED)Database not ready$(NC)"
	@echo ""
	@echo "$(GREEN)Redis Status:$(NC)"
	@$(DOCKER_COMPOSE) exec redis-master redis-cli ping || echo "$(RED)Redis not ready$(NC)"
	@echo ""
	@echo "$(GREEN)RabbitMQ Status:$(NC)"
	@$(DOCKER_COMPOSE) exec rabbitmq rabbitmq-diagnostics ping || echo "$(RED)RabbitMQ not ready$(NC)"

.PHONY: monitor
monitor: ## Open monitoring dashboards
	@echo "$(GREEN)Opening monitoring dashboards...$(NC)"
	@echo "Grafana: http://localhost:3000/grafana"
	@echo "Kibana: http://localhost:3000/kibana"
	@echo "RabbitMQ: http://localhost:15672"

# =====================================================
# CACHE COMMANDS
# =====================================================

.PHONY: redis-cli
redis-cli: ## Access Redis CLI
	$(DOCKER_COMPOSE) exec redis-master redis-cli -a redis123

.PHONY: cache-clear
cache-clear: ## Clear all cache
	@echo "$(YELLOW)Clearing all cache...$(NC)"
	$(DOCKER_COMPOSE) exec redis-master redis-cli -a redis123 FLUSHALL
	@echo "$(GREEN)Cache cleared$(NC)"

# =====================================================
# BACKUP & RESTORE
# =====================================================

.PHONY: backup-all
backup-all: ## Backup entire system
	@echo "$(GREEN)Creating full system backup...$(NC)"
	@mkdir -p backups/$(shell date +%Y%m%d_%H%M%S)
	@make db-backup
	@$(DOCKER_COMPOSE) exec minio mc mirror minio/documents backups/$(shell date +%Y%m%d_%H%M%S)/minio
	@echo "$(GREEN)Full backup completed$(NC)"

# =====================================================
# TESTING COMMANDS
# =====================================================

.PHONY: test
test: ## Run all tests
	@echo "$(GREEN)Running tests...$(NC)"
	$(DOCKER_COMPOSE) exec auth-service npm test
	$(DOCKER_COMPOSE) exec permission-service npm test

.PHONY: test-service
test-service: ## Run tests for specific service (usage: make test-service SERVICE=auth-service)
	$(DOCKER_COMPOSE) exec $(SERVICE) npm test

# =====================================================
# SECURITY COMMANDS
# =====================================================

.PHONY: security-scan
security-scan: ## Run security scan on containers
	@echo "$(GREEN)Running security scan...$(NC)"
	@for service in $$($(DOCKER_COMPOSE) ps --services); do \
		echo "Scanning $$service..."; \
		$(DOCKER) scan $(PROJECT_NAME)_$$service || true; \
	done

.PHONY: update-passwords
update-passwords: ## Update all default passwords
	@echo "$(RED)Remember to update all passwords in .env file!$(NC)"
	@echo "Default passwords to change:"
	@echo "  - PostgreSQL: postgres123"
	@echo "  - Redis: redis123"
	@echo "  - RabbitMQ: rabbitmq123"
	@echo "  - MinIO: minioadmin123"
	@echo "  - Grafana: grafana123"
	@echo "  - JWT Secret"

# =====================================================
# UTILITY COMMANDS
# =====================================================

.PHONY: ports
ports: ## Show used ports
	@echo "$(GREEN)Used ports:$(NC)"
	@echo "  - 80: Nginx (HTTP)"
	@echo "  - 443: Nginx (HTTPS)"
	@echo "  - 3000: Frontend/Grafana"
	@echo "  - 3001-3009: Microservices"
	@echo "  - 5432: PostgreSQL"
	@echo "  - 6379: Redis"
	@echo "  - 5672: RabbitMQ"
	@echo "  - 15672: RabbitMQ Management"
	@echo "  - 9000: MinIO"
	@echo "  - 9001: MinIO Console"
	@echo "  - 9200: ElasticSearch"
	@echo "  - 5601: Kibana"
	@echo "  - 8086: InfluxDB"
	@echo "  - 1883: MQTT"

.PHONY: env-setup
env-setup: ## Create .env file from example
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "$(GREEN).env file created from .env.example$(NC)"; \
		echo "$(YELLOW)Please update the values in .env file$(NC)"; \
	else \
		echo "$(YELLOW).env file already exists$(NC)"; \
	fi

# =====================================================
# QUICK START
# =====================================================

.PHONY: install
install: env-setup ## Initial setup
	@echo "$(GREEN)Setting up SKYN3T Access Control System...$(NC)"
	@make build
	@make up
	@sleep 30 # Wait for services to start
	@make db-migrate
	@make db-seed
	@echo "$(GREEN)Installation complete!$(NC)"
	@echo "Access the system at http://localhost:3000"
	@echo "Default credentials: admin/admin"

.PHONY: uninstall
uninstall: clean ## Remove everything
	@echo "$(RED)Removing all images...$(NC)"
	$(DOCKER_COMPOSE) down --rmi all
	@echo "$(GREEN)Uninstall complete$(NC)"