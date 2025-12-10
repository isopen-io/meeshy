# =============================================================================
# Meeshy Monorepo - Makefile
# =============================================================================
# Native-first development with optional Docker support
#
# Quick Start:
#   make install    - Install all dependencies
#   make dev        - Start native development (recommended)
#   make dev-docker - Start with Docker containers (MongoDB/Redis)
#   make dev-memory - Start in memory mode (no external DB)
# =============================================================================

.PHONY: help dev dev-docker dev-memory dev-secure install build test clean \
        docker-up docker-down docker-logs docker-build prod-up prod-down \
        status stop ps up down

# Colors
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
CYAN := \033[0;36m
NC := \033[0m

# Paths
COMPOSE_DIR := infrastructure/docker/compose
SCRIPTS_DIR := scripts

# =============================================================================
# Help
# =============================================================================

help: ## Show this help message
	@echo "$(BLUE)╔══════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(BLUE)║              MEESHY MONOREPO - COMMANDS                 ║$(NC)"
	@echo "$(BLUE)╚══════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(CYAN)Development (Native):$(NC)"
	@grep -E '^dev.*:.*##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(CYAN)Project Management:$(NC)"
	@grep -E '^(install|build|test|clean):.*##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(CYAN)Docker:$(NC)"
	@grep -E '^docker-.*:.*##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(CYAN)Production:$(NC)"
	@grep -E '^prod-.*:.*##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(GREEN)Examples:$(NC)"
	@echo "  make dev               # Native development (HTTP)"
	@echo "  make dev-docker        # With MongoDB/Redis containers"
	@echo "  make dev-memory        # No external database"
	@echo "  make docker-logs       # View all container logs"
	@echo ""

# =============================================================================
# Native Development
# =============================================================================

dev: ## Start native development (HTTP, uses existing DB/Redis)
	@echo "$(GREEN)🚀 Starting native development...$(NC)"
	@./$(SCRIPTS_DIR)/dev.sh

dev-docker: ## Start with Docker containers (MongoDB + Redis)
	@echo "$(GREEN)🚀 Starting development with containers...$(NC)"
	@./$(SCRIPTS_DIR)/dev.sh --with-containers

dev-memory: ## Start in memory mode (no external DB)
	@echo "$(GREEN)🚀 Starting development in memory mode...$(NC)"
	@./$(SCRIPTS_DIR)/dev.sh --memory

dev-secure: ## Start with HTTPS (mkcert)
	@echo "$(GREEN)🚀 Starting secure development (HTTPS)...$(NC)"
	@./$(SCRIPTS_DIR)/dev.sh --secure

stop: ## Stop all development services
	@echo "$(YELLOW)⏹️  Stopping all services...$(NC)"
	@./$(SCRIPTS_DIR)/dev.sh stop

status: ## Show service status
	@./$(SCRIPTS_DIR)/dev.sh status

# =============================================================================
# Project Management
# =============================================================================

install: ## Install all dependencies
	@echo "$(BLUE)📦 Installing dependencies...$(NC)"
	@if command -v pnpm &> /dev/null; then \
		pnpm install; \
	elif command -v bun &> /dev/null; then \
		bun install; \
	else \
		npm install; \
	fi
	@echo "$(BLUE)📦 Installing Python dependencies for translator...$(NC)"
	@cd services/translator && \
		python3 -m venv .venv && \
		.venv/bin/pip install -r requirements.txt
	@echo "$(GREEN)✓ All dependencies installed$(NC)"

build: ## Build all packages
	@echo "$(BLUE)🔨 Building all packages...$(NC)"
	@if command -v pnpm &> /dev/null; then \
		pnpm run build; \
	elif command -v bun &> /dev/null; then \
		bun run build; \
	else \
		npm run build; \
	fi
	@echo "$(GREEN)✓ Build complete$(NC)"

test: ## Run all tests
	@echo "$(BLUE)🧪 Running tests...$(NC)"
	@if command -v pnpm &> /dev/null; then \
		pnpm run test; \
	elif command -v bun &> /dev/null; then \
		bun run test; \
	else \
		npm run test; \
	fi

clean: ## Clean build artifacts and dependencies
	@echo "$(YELLOW)🧹 Cleaning...$(NC)"
	@if command -v pnpm &> /dev/null; then \
		pnpm run clean || true; \
	elif command -v bun &> /dev/null; then \
		bun run clean || true; \
	else \
		npm run clean || true; \
	fi
	@rm -rf node_modules .turbo
	@find . -name "node_modules" -type d -prune -exec rm -rf '{}' +
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

# =============================================================================
# Docker Development
# =============================================================================

docker-up: ## Start Docker development environment
	@echo "$(BLUE)🐳 Starting Docker development environment...$(NC)"
	@docker compose -f $(COMPOSE_DIR)/docker-compose.yml \
	                -f $(COMPOSE_DIR)/docker-compose.dev.yml up -d
	@echo "$(GREEN)✓ Docker environment started$(NC)"
	@$(MAKE) docker-urls

docker-down: ## Stop Docker environment
	@echo "$(YELLOW)⏹️  Stopping Docker environment...$(NC)"
	@docker compose -f $(COMPOSE_DIR)/docker-compose.yml down
	@echo "$(GREEN)✓ Docker environment stopped$(NC)"

docker-logs: ## Show Docker logs (SERVICE=name for specific service)
	@if [ -z "$(SERVICE)" ]; then \
		docker compose -f $(COMPOSE_DIR)/docker-compose.yml logs -f; \
	else \
		docker compose -f $(COMPOSE_DIR)/docker-compose.yml logs -f $(SERVICE); \
	fi

docker-build: ## Build Docker images locally
	@echo "$(BLUE)🔨 Building Docker images...$(NC)"
	@docker compose -f $(COMPOSE_DIR)/docker-compose.yml \
	                -f $(COMPOSE_DIR)/docker-compose.dev.yml build
	@echo "$(GREEN)✓ Docker images built$(NC)"

docker-clean: ## Remove Docker containers and volumes
	@echo "$(RED)⚠️  WARNING: This will remove all containers and volumes!$(NC)"
	@read -p "Are you sure? (yes/no): " confirm && [ "$$confirm" = "yes" ] || (echo "Cancelled" && exit 1)
	@docker compose -f $(COMPOSE_DIR)/docker-compose.yml down -v
	@echo "$(GREEN)✓ Docker cleanup complete$(NC)"

docker-urls: ## Show Docker service URLs
	@echo ""
	@echo "$(CYAN)📍 Service URLs:$(NC)"
	@echo "   Frontend:    $(GREEN)http://localhost:3100$(NC)"
	@echo "   Gateway:     $(GREEN)http://localhost:3000$(NC)"
	@echo "   Translator:  $(GREEN)http://localhost:8000$(NC)"
	@echo "   MongoDB:     $(GREEN)mongodb://localhost:27017$(NC)"
	@echo "   Redis:       $(GREEN)redis://localhost:6379$(NC)"
	@echo ""

# =============================================================================
# Production
# =============================================================================

prod-up: ## Start production environment with Traefik
	@echo "$(BLUE)🚀 Starting production environment...$(NC)"
	@docker compose -f $(COMPOSE_DIR)/docker-compose.yml \
	                -f $(COMPOSE_DIR)/docker-compose.prod.yml up -d
	@echo "$(GREEN)✓ Production environment started$(NC)"

prod-down: ## Stop production environment
	@echo "$(YELLOW)⏹️  Stopping production environment...$(NC)"
	@docker compose -f $(COMPOSE_DIR)/docker-compose.yml \
	                -f $(COMPOSE_DIR)/docker-compose.prod.yml down
	@echo "$(GREEN)✓ Production environment stopped$(NC)"

# =============================================================================
# Aliases
# =============================================================================

ps: status ## Alias for status
up: docker-up ## Alias for docker-up
down: docker-down ## Alias for docker-down

.DEFAULT_GOAL := help
