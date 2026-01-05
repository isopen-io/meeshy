# Makefile pour Meeshy - Développement Local et Docker
# Supporte: Bun (défaut), pnpm, Docker Compose

.PHONY: help install generate build dev dev-web dev-gateway dev-translator \
        start stop restart logs status clean reset health test urls \
        docker-start docker-stop docker-logs docker-build docker-pull \
        build-gateway build-translator build-frontend build-all

# Couleurs
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
CYAN := \033[0;36m
NC := \033[0m

# Runtime JavaScript (bun par défaut, pnpm en fallback)
JS_RUNTIME := $(shell command -v bun >/dev/null 2>&1 && echo "bun" || echo "pnpm")

# Variables
COMPOSE_DIR := infrastructure/docker/compose
COMPOSE_FILE := $(COMPOSE_DIR)/docker-compose.dev.yml
COMPOSE_LOCAL := $(COMPOSE_DIR)/docker-compose.local.yml
ENV_FILE := infrastructure/envs/.env.example

# Paths
WEB_DIR := apps/web
GATEWAY_DIR := services/gateway
TRANSLATOR_DIR := services/translator
SHARED_DIR := packages/shared
INFRA_DIR := infrastructure

# =============================================================================
# AIDE
# =============================================================================

help: ## Afficher cette aide
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║          MEESHY - Commandes de Développement                ║$(NC)"
	@echo "$(CYAN)║          Runtime: $(JS_RUNTIME)                                        ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(BLUE)DÉVELOPPEMENT NATIF:$(NC)"
	@grep -E '^(install|generate|build|dev|dev-web|dev-gateway|dev-translator):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BLUE)DOCKER COMPOSE:$(NC)"
	@grep -E '^(docker-start|docker-stop|docker-logs|docker-infra):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BLUE)BUILD IMAGES:$(NC)"
	@grep -E '^(build-gateway|build-translator|build-frontend|build-all):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BLUE)UTILITAIRES:$(NC)"
	@grep -E '^(clean|reset|health|status|urls):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""

# =============================================================================
# DÉVELOPPEMENT NATIF (Bun/pnpm + Python)
# =============================================================================

install: ## Installer toutes les dépendances (JS + Python)
	@echo "$(BLUE)📦 Installation des dépendances JavaScript avec $(JS_RUNTIME)...$(NC)"
	@$(JS_RUNTIME) install --ignore-scripts
	@echo ""
	@echo "$(BLUE)📦 Installation des dépendances Python...$(NC)"
	@cd $(TRANSLATOR_DIR) && \
		python3 -m venv .venv 2>/dev/null || true && \
		. .venv/bin/activate && \
		pip install -q --upgrade pip && \
		pip install -q -r requirements.txt
	@echo ""
	@echo "$(GREEN)✅ Toutes les dépendances installées$(NC)"

install-js: ## Installer uniquement les dépendances JavaScript
	@echo "$(BLUE)📦 Installation des dépendances JavaScript avec $(JS_RUNTIME)...$(NC)"
	@$(JS_RUNTIME) install --ignore-scripts
	@echo "$(GREEN)✅ Dépendances JavaScript installées$(NC)"

install-python: ## Installer uniquement les dépendances Python
	@echo "$(BLUE)📦 Installation des dépendances Python...$(NC)"
	@cd $(TRANSLATOR_DIR) && \
		python3 -m venv .venv 2>/dev/null || true && \
		. .venv/bin/activate && \
		pip install -q --upgrade pip && \
		pip install -q -r requirements.txt
	@echo "$(GREEN)✅ Dépendances Python installées$(NC)"

generate: ## Générer les clients Prisma (JS + Python) et builder shared
	@echo "$(BLUE)🔧 Génération des clients Prisma...$(NC)"
	@cd $(SHARED_DIR) && $(JS_RUNTIME) run generate
	@echo "$(BLUE)🔧 Génération du client Prisma Python...$(NC)"
	@cd $(TRANSLATOR_DIR) && . .venv/bin/activate 2>/dev/null && prisma generate 2>/dev/null || true
	@echo "$(BLUE)🔨 Build du package shared...$(NC)"
	@cd $(SHARED_DIR) && $(JS_RUNTIME) run build
	@echo "$(GREEN)✅ Clients Prisma générés et shared buildé$(NC)"

build: ## Builder tous les services (TypeScript)
	@echo "$(BLUE)🔨 Build de tous les services...$(NC)"
	@cd $(SHARED_DIR) && $(JS_RUNTIME) run build 2>/dev/null || true
	@cd $(GATEWAY_DIR) && $(JS_RUNTIME) run build
	@cd $(WEB_DIR) && $(JS_RUNTIME) run build
	@echo "$(GREEN)✅ Build terminé$(NC)"

build-web: ## Builder uniquement le frontend
	@echo "$(BLUE)🔨 Build du frontend...$(NC)"
	@cd $(WEB_DIR) && $(JS_RUNTIME) run build
	@echo "$(GREEN)✅ Frontend buildé$(NC)"

build-gateway-ts: ## Builder uniquement le gateway
	@echo "$(BLUE)🔨 Build du gateway...$(NC)"
	@cd $(GATEWAY_DIR) && $(JS_RUNTIME) run build
	@echo "$(GREEN)✅ Gateway buildé$(NC)"

# =============================================================================
# LANCEMENT EN MODE DÉVELOPPEMENT
# =============================================================================

dev: ## Lancer tous les services en mode dev (nécessite tmux ou 3 terminaux)
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║          MEESHY - Mode Développement Natif                  ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(YELLOW)⚠️  Prérequis: MongoDB et Redis doivent être démarrés$(NC)"
	@echo "$(BLUE)   Lancez: make docker-infra$(NC)"
	@echo ""
	@echo "$(BLUE)Ouvrez 3 terminaux et lancez:$(NC)"
	@echo "  $(GREEN)Terminal 1:$(NC) make dev-translator"
	@echo "  $(GREEN)Terminal 2:$(NC) make dev-gateway"
	@echo "  $(GREEN)Terminal 3:$(NC) make dev-web"
	@echo ""
	@echo "$(BLUE)Ou utilisez tmux:$(NC) make dev-tmux"
	@echo ""
	@$(MAKE) urls

dev-web: ## Lancer le frontend en mode dev (port 3100)
	@echo "$(CYAN)🎨 Démarrage du Frontend (port 3100)...$(NC)"
	@cd $(WEB_DIR) && $(JS_RUNTIME) run dev

dev-gateway: ## Lancer le gateway en mode dev (port 3000)
	@echo "$(CYAN)🚀 Démarrage du Gateway (port 3000)...$(NC)"
	@cd $(GATEWAY_DIR) && $(JS_RUNTIME) run dev

dev-translator: ## Lancer le translator en mode dev (port 8000)
	@echo "$(CYAN)🔤 Démarrage du Translator (port 8000)...$(NC)"
	@cd $(TRANSLATOR_DIR) && \
		. .venv/bin/activate 2>/dev/null || true && \
		python3 src/main.py

dev-tmux: ## Lancer tous les services dans tmux
	@echo "$(BLUE)🖥️  Démarrage des services dans tmux...$(NC)"
	@command -v docker >/dev/null 2>&1 && $(MAKE) docker-infra || echo "$(YELLOW)⚠️  Docker non disponible, services sans MongoDB/Redis$(NC)"
	@tmux kill-session -t meeshy 2>/dev/null || true
	@tmux new-session -d -s meeshy -n translator "cd $(CURDIR)/$(TRANSLATOR_DIR) && . .venv/bin/activate 2>/dev/null; python3 src/main.py; read"
	@sleep 2
	@tmux new-window -t meeshy -n gateway "cd $(CURDIR)/$(GATEWAY_DIR) && $(JS_RUNTIME) run dev; read"
	@sleep 2
	@tmux new-window -t meeshy -n web "cd $(CURDIR)/$(WEB_DIR) && $(JS_RUNTIME) run dev; read"
	@tmux attach-session -t meeshy
	@echo "$(GREEN)✅ Services lancés dans tmux (session: meeshy)$(NC)"

dev-parallel: ## Lancer tous les services en parallèle (logs combinés)
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║          MEESHY - Démarrage Parallèle                       ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@$(MAKE) -j3 _dev-translator _dev-gateway _dev-web

_dev-translator:
	@cd $(TRANSLATOR_DIR) && . .venv/bin/activate 2>/dev/null || true && python3 src/main.py

_dev-gateway:
	@sleep 3 && cd $(GATEWAY_DIR) && $(JS_RUNTIME) run dev

_dev-web:
	@sleep 5 && cd $(WEB_DIR) && $(JS_RUNTIME) run dev

# =============================================================================
# DOCKER COMPOSE
# =============================================================================

docker-infra: ## Démarrer uniquement MongoDB et Redis (pour dev natif)
	@echo "$(BLUE)🐳 Démarrage de l'infrastructure (MongoDB + Redis)...$(NC)"
	@docker compose -f $(COMPOSE_LOCAL) up -d
	@echo "$(GREEN)✅ Infrastructure démarrée$(NC)"
	@echo ""
	@echo "$(BLUE)📍 Services:$(NC)"
	@echo "   - MongoDB: mongodb://localhost:27017"
	@echo "   - Redis:   redis://localhost:6379"

docker-start: ## Démarrer tous les services via Docker Compose
	@echo "$(BLUE)🐳 Démarrage de tous les services Meeshy...$(NC)"
	@docker compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) up -d
	@echo "$(GREEN)✅ Services démarrés$(NC)"
	@$(MAKE) urls

docker-stop: ## Arrêter tous les services Docker
	@echo "$(YELLOW)⏹️  Arrêt des services Docker...$(NC)"
	@docker compose -f $(COMPOSE_FILE) down 2>/dev/null || true
	@docker compose -f $(COMPOSE_LOCAL) down 2>/dev/null || true
	@echo "$(GREEN)✅ Services arrêtés$(NC)"

docker-logs: ## Afficher les logs Docker (SERVICE=nom pour filtrer)
	@if [ -z "$(SERVICE)" ]; then \
		docker compose -f $(COMPOSE_FILE) logs -f; \
	else \
		docker compose -f $(COMPOSE_FILE) logs -f $(SERVICE); \
	fi

docker-pull: ## Télécharger les dernières images Docker
	@echo "$(BLUE)📥 Téléchargement des images...$(NC)"
	@docker compose -f $(COMPOSE_FILE) pull
	@echo "$(GREEN)✅ Images mises à jour$(NC)"

docker-build: ## Builder toutes les images Docker localement
	@$(MAKE) build-all

# =============================================================================
# BUILD IMAGES DOCKER
# =============================================================================

build-gateway: ## Builder l'image Gateway
	@echo "$(BLUE)🔨 Build de l'image Gateway...$(NC)"
	@docker build -t isopen/meeshy-gateway:latest -f $(INFRA_DIR)/docker/images/gateway/Dockerfile .
	@echo "$(GREEN)✅ Image Gateway buildée$(NC)"

build-translator: ## Builder l'image Translator
	@echo "$(BLUE)🔨 Build de l'image Translator...$(NC)"
	@docker build -t isopen/meeshy-translator:latest -f $(INFRA_DIR)/docker/images/translator/Dockerfile .
	@echo "$(GREEN)✅ Image Translator buildée$(NC)"

build-frontend: ## Builder l'image Frontend
	@echo "$(BLUE)🔨 Build de l'image Frontend...$(NC)"
	@docker build -t isopen/meeshy-frontend:latest -f $(INFRA_DIR)/docker/images/web/Dockerfile .
	@echo "$(GREEN)✅ Image Frontend buildée$(NC)"

build-all: build-gateway build-translator build-frontend ## Builder toutes les images
	@echo "$(GREEN)✅ Toutes les images buildées$(NC)"

# =============================================================================
# UTILITAIRES
# =============================================================================

urls: ## Afficher les URLs d'accès
	@echo "$(BLUE)📍 URLs d'accès:$(NC)"
	@echo "   - Frontend:        $(GREEN)http://localhost:3100$(NC)"
	@echo "   - Gateway API:     $(GREEN)http://localhost:3000$(NC)"
	@echo "   - Translator API:  $(GREEN)http://localhost:8000$(NC)"
	@echo "   - MongoDB:         $(GREEN)mongodb://localhost:27017$(NC)"
	@echo "   - Redis:           $(GREEN)redis://localhost:6379$(NC)"
	@echo ""

status: ## Afficher le statut des services
	@echo "$(BLUE)📊 Statut des services:$(NC)"
	@echo ""
	@echo "$(CYAN)Docker:$(NC)"
	@docker compose -f $(COMPOSE_FILE) ps 2>/dev/null || echo "  Aucun conteneur actif"
	@echo ""
	@echo "$(CYAN)Processus locaux:$(NC)"
	@echo "  Gateway (3000):    $$(lsof -ti:3000 >/dev/null 2>&1 && echo '$(GREEN)Running$(NC)' || echo '$(RED)Stopped$(NC)')"
	@echo "  Frontend (3100):   $$(lsof -ti:3100 >/dev/null 2>&1 && echo '$(GREEN)Running$(NC)' || echo '$(RED)Stopped$(NC)')"
	@echo "  Translator (8000): $$(lsof -ti:8000 >/dev/null 2>&1 && echo '$(GREEN)Running$(NC)' || echo '$(RED)Stopped$(NC)')"
	@echo "  MongoDB (27017):   $$(lsof -ti:27017 >/dev/null 2>&1 && echo '$(GREEN)Running$(NC)' || echo '$(RED)Stopped$(NC)')"
	@echo "  Redis (6379):      $$(lsof -ti:6379 >/dev/null 2>&1 && echo '$(GREEN)Running$(NC)' || echo '$(RED)Stopped$(NC)')"

health: ## Vérifier la santé des services
	@echo "$(BLUE)🏥 Vérification de la santé...$(NC)"
	@echo ""
	@echo -n "  Gateway:    " && curl -sf http://localhost:3000/health >/dev/null 2>&1 && echo "$(GREEN)✅ OK$(NC)" || echo "$(RED)❌ Down$(NC)"
	@echo -n "  Frontend:   " && curl -sf http://localhost:3100 >/dev/null 2>&1 && echo "$(GREEN)✅ OK$(NC)" || echo "$(RED)❌ Down$(NC)"
	@echo -n "  Translator: " && curl -sf http://localhost:8000/health >/dev/null 2>&1 && echo "$(GREEN)✅ OK$(NC)" || echo "$(RED)❌ Down$(NC)"
	@echo ""

clean: ## Nettoyer les fichiers générés et node_modules
	@echo "$(YELLOW)🧹 Nettoyage...$(NC)"
	@rm -rf node_modules $(WEB_DIR)/node_modules $(GATEWAY_DIR)/node_modules $(SHARED_DIR)/node_modules
	@rm -rf $(WEB_DIR)/.next $(GATEWAY_DIR)/dist $(SHARED_DIR)/dist
	@rm -rf $(TRANSLATOR_DIR)/.venv $(TRANSLATOR_DIR)/__pycache__
	@echo "$(GREEN)✅ Nettoyage terminé$(NC)"

clean-docker: ## Supprimer les conteneurs et volumes Docker
	@echo "$(RED)⚠️  Suppression des conteneurs et volumes...$(NC)"
	@docker compose -f $(COMPOSE_FILE) down -v 2>/dev/null || true
	@docker compose -f $(COMPOSE_LOCAL) down -v 2>/dev/null || true
	@echo "$(GREEN)✅ Conteneurs et volumes supprimés$(NC)"

reset: clean install generate ## Réinitialiser complètement le projet
	@echo "$(GREEN)✅ Projet réinitialisé$(NC)"

kill: ## Tuer tous les processus sur les ports de dev
	@echo "$(YELLOW)💀 Arrêt des processus...$(NC)"
	@lsof -ti:3000 | xargs kill -9 2>/dev/null || true
	@lsof -ti:3100 | xargs kill -9 2>/dev/null || true
	@lsof -ti:8000 | xargs kill -9 2>/dev/null || true
	@echo "$(GREEN)✅ Processus arrêtés$(NC)"

# =============================================================================
# TESTS
# =============================================================================

test: ## Lancer tous les tests
	@echo "$(BLUE)🧪 Lancement des tests...$(NC)"
	@cd $(GATEWAY_DIR) && $(JS_RUNTIME) run test
	@cd $(WEB_DIR) && $(JS_RUNTIME) run test
	@echo "$(GREEN)✅ Tests terminés$(NC)"

test-gateway: ## Lancer les tests du gateway
	@cd $(GATEWAY_DIR) && $(JS_RUNTIME) run test

test-web: ## Lancer les tests du frontend
	@cd $(WEB_DIR) && $(JS_RUNTIME) run test

lint: ## Lancer le linter sur tout le projet
	@echo "$(BLUE)🔍 Vérification du code...$(NC)"
	@cd $(GATEWAY_DIR) && $(JS_RUNTIME) run lint
	@cd $(WEB_DIR) && $(JS_RUNTIME) run lint
	@echo "$(GREEN)✅ Lint terminé$(NC)"

type-check: ## Vérifier les types TypeScript
	@echo "$(BLUE)📝 Vérification des types...$(NC)"
	@cd $(GATEWAY_DIR) && $(JS_RUNTIME) run type-check
	@cd $(WEB_DIR) && $(JS_RUNTIME) run type-check
	@echo "$(GREEN)✅ Type check terminé$(NC)"

# =============================================================================
# ALIAS
# =============================================================================

i: install
g: generate
b: build
d: dev
s: status
h: health
u: urls
up: docker-start
down: docker-stop
ps: status

.DEFAULT_GOAL := help
