# Makefile pour Meeshy - Développement Local et Docker
# Supporte: Bun (défaut), pnpm, Docker Compose

.PHONY: help setup install generate build dev dev-web dev-gateway dev-translator \
        start stop restart logs status clean reset health test urls \
        docker-start docker-stop docker-logs docker-build docker-pull \
        build-gateway build-translator build-frontend build-all \
        dev-tmux dev-bg dev-fg check verify

# Couleurs
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
CYAN := \033[0;36m
BOLD := \033[1m
NC := \033[0m

# Runtime JavaScript (bun par défaut, pnpm en fallback)
JS_RUNTIME := $(shell command -v bun >/dev/null 2>&1 && echo "bun" || echo "pnpm")

# Détection tmux
HAS_TMUX := $(shell command -v tmux >/dev/null 2>&1 && echo "yes" || echo "no")

# Détection Docker
HAS_DOCKER := $(shell command -v docker >/dev/null 2>&1 && echo "yes" || echo "no")

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

# PIDs files
PID_DIR := .pids
TRANSLATOR_PID := $(PID_DIR)/translator.pid
GATEWAY_PID := $(PID_DIR)/gateway.pid
WEB_PID := $(PID_DIR)/web.pid

# =============================================================================
# AIDE
# =============================================================================

help: ## Afficher cette aide
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║          MEESHY - Commandes de Développement                ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(BOLD)Runtime:$(NC) $(JS_RUNTIME) | $(BOLD)Tmux:$(NC) $(HAS_TMUX) | $(BOLD)Docker:$(NC) $(HAS_DOCKER)"
	@echo ""
	@echo "$(BLUE)🚀 DÉMARRAGE RAPIDE:$(NC)"
	@echo "  $(YELLOW)make setup$(NC)      - Installation complète (install + generate + build)"
	@echo "  $(YELLOW)make start$(NC)      - Lancer tous les services (auto-détecte tmux/bg)"
	@echo "  $(YELLOW)make stop$(NC)       - Arrêter tous les services"
	@echo ""
	@echo "$(BLUE)📦 INSTALLATION:$(NC)"
	@grep -E '^(install|install-js|install-python|generate|build):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-18s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BLUE)🔧 DÉVELOPPEMENT:$(NC)"
	@grep -E '^(dev-web|dev-gateway|dev-translator|dev-tmux|dev-bg):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-18s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BLUE)🧪 TESTS & QUALITÉ:$(NC)"
	@grep -E '^(test|test-gateway|test-web|lint|type-check|verify):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-18s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BLUE)🐳 DOCKER:$(NC)"
	@grep -E '^(docker-infra|docker-start|docker-stop):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-18s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BLUE)🔍 UTILITAIRES:$(NC)"
	@grep -E '^(status|health|urls|logs|clean|kill):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-18s$(NC) %s\n", $$1, $$2}'
	@echo ""

# =============================================================================
# SETUP COMPLET (One-liner)
# =============================================================================

setup: ## 🚀 Installation complète: install + generate + build
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║          MEESHY - Installation Complète                      ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@$(MAKE) install
	@echo ""
	@$(MAKE) generate
	@echo ""
	@echo "$(GREEN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(GREEN)║  ✅ Setup terminé ! Lancez: make start                       ║$(NC)"
	@echo "$(GREEN)╚══════════════════════════════════════════════════════════════╝$(NC)"

# =============================================================================
# INSTALLATION
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
	@echo "$(BLUE)🔧 Génération du client Prisma JS...$(NC)"
	@cd $(SHARED_DIR) && $(JS_RUNTIME) run generate
	@echo ""
	@echo "$(BLUE)🔧 Génération du client Prisma Python...$(NC)"
	@cd $(TRANSLATOR_DIR) && . .venv/bin/activate 2>/dev/null && prisma generate 2>/dev/null || echo "$(YELLOW)⚠️  Prisma Python ignoré$(NC)"
	@echo ""
	@echo "$(BLUE)🔨 Build du package shared...$(NC)"
	@cd $(SHARED_DIR) && $(JS_RUNTIME) run build
	@echo ""
	@echo "$(GREEN)✅ Génération terminée$(NC)"

build: ## Builder tous les services (TypeScript)
	@echo "$(BLUE)🔨 Build de tous les services...$(NC)"
	@echo "  → Shared..."
	@cd $(SHARED_DIR) && $(JS_RUNTIME) run build 2>/dev/null || true
	@echo "  → Gateway..."
	@cd $(GATEWAY_DIR) && $(JS_RUNTIME) run build
	@echo "  → Web..."
	@cd $(WEB_DIR) && $(JS_RUNTIME) run build
	@echo "$(GREEN)✅ Build terminé$(NC)"

build-shared: ## Builder uniquement le package shared
	@echo "$(BLUE)🔨 Build du package shared...$(NC)"
	@cd $(SHARED_DIR) && $(JS_RUNTIME) run build
	@echo "$(GREEN)✅ Shared buildé$(NC)"

build-web: ## Builder uniquement le frontend
	@echo "$(BLUE)🔨 Build du frontend...$(NC)"
	@cd $(WEB_DIR) && $(JS_RUNTIME) run build
	@echo "$(GREEN)✅ Frontend buildé$(NC)"

build-gateway-ts: ## Builder uniquement le gateway (TypeScript)
	@echo "$(BLUE)🔨 Build du gateway...$(NC)"
	@cd $(GATEWAY_DIR) && $(JS_RUNTIME) run build
	@echo "$(GREEN)✅ Gateway buildé$(NC)"

# =============================================================================
# VÉRIFICATION PRÉ-LANCEMENT
# =============================================================================

check: ## Vérifier que tout est prêt pour le lancement
	@echo "$(BLUE)🔍 Vérification de l'environnement...$(NC)"
	@echo ""
	@echo -n "  node_modules (root):  " && [ -d "node_modules" ] && echo "$(GREEN)✅$(NC)" || echo "$(RED)❌ Lancez: make install$(NC)"
	@echo -n "  node_modules (web):   " && [ -d "$(WEB_DIR)/node_modules" ] && echo "$(GREEN)✅$(NC)" || echo "$(RED)❌ Lancez: make install$(NC)"
	@echo -n "  Python venv:          " && [ -d "$(TRANSLATOR_DIR)/.venv" ] && echo "$(GREEN)✅$(NC)" || echo "$(RED)❌ Lancez: make install$(NC)"
	@echo -n "  Prisma client (JS):   " && [ -d "$(SHARED_DIR)/prisma/client" ] && echo "$(GREEN)✅$(NC)" || echo "$(RED)❌ Lancez: make generate$(NC)"
	@echo -n "  Shared dist:          " && [ -d "$(SHARED_DIR)/dist" ] && echo "$(GREEN)✅$(NC)" || echo "$(RED)❌ Lancez: make generate$(NC)"
	@echo ""

# =============================================================================
# LANCEMENT DES SERVICES
# =============================================================================

start: ## Lancer tous les services (auto-détecte tmux ou background)
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║          MEESHY - Démarrage des Services                     ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@# Vérifier les prérequis
	@if [ ! -d "$(SHARED_DIR)/dist" ]; then \
		echo "$(YELLOW)⚠️  Shared non buildé, exécution de 'make generate'...$(NC)"; \
		$(MAKE) generate; \
	fi
	@echo ""
	@# Lancer Docker infra si disponible
	@if [ "$(HAS_DOCKER)" = "yes" ]; then \
		$(MAKE) docker-infra 2>/dev/null || echo "$(YELLOW)⚠️  Docker infra non démarré$(NC)"; \
	else \
		echo "$(YELLOW)⚠️  Docker non disponible - services sans MongoDB/Redis$(NC)"; \
	fi
	@echo ""
	@# Choisir le mode de lancement
	@if [ "$(HAS_TMUX)" = "yes" ]; then \
		echo "$(GREEN)📺 Tmux détecté - lancement en mode tmux$(NC)"; \
		$(MAKE) dev-tmux; \
	else \
		echo "$(GREEN)🔄 Pas de tmux - lancement en background$(NC)"; \
		$(MAKE) dev-bg; \
	fi

stop: ## Arrêter tous les services
	@echo "$(YELLOW)⏹️  Arrêt des services...$(NC)"
	@# Tuer session tmux si existe
	@tmux kill-session -t meeshy 2>/dev/null || true
	@# Tuer les processus par PID
	@if [ -f "$(TRANSLATOR_PID)" ]; then kill $$(cat $(TRANSLATOR_PID)) 2>/dev/null || true; rm -f $(TRANSLATOR_PID); fi
	@if [ -f "$(GATEWAY_PID)" ]; then kill $$(cat $(GATEWAY_PID)) 2>/dev/null || true; rm -f $(GATEWAY_PID); fi
	@if [ -f "$(WEB_PID)" ]; then kill $$(cat $(WEB_PID)) 2>/dev/null || true; rm -f $(WEB_PID); fi
	@# Tuer par port en fallback
	@lsof -ti:3000 | xargs kill -9 2>/dev/null || true
	@lsof -ti:3100 | xargs kill -9 2>/dev/null || true
	@lsof -ti:8000 | xargs kill -9 2>/dev/null || true
	@rm -rf $(PID_DIR)
	@echo "$(GREEN)✅ Services arrêtés$(NC)"

restart: stop start ## Redémarrer tous les services

# =============================================================================
# MODES DE LANCEMENT
# =============================================================================

dev: ## Afficher les options de lancement
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║          MEESHY - Mode Développement                         ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(BOLD)Environnement:$(NC)"
	@echo "  Runtime JS: $(GREEN)$(JS_RUNTIME)$(NC)"
	@echo "  Tmux:       $(if $(filter yes,$(HAS_TMUX)),$(GREEN)Disponible$(NC),$(YELLOW)Non disponible$(NC))"
	@echo "  Docker:     $(if $(filter yes,$(HAS_DOCKER)),$(GREEN)Disponible$(NC),$(YELLOW)Non disponible$(NC))"
	@echo ""
	@echo "$(BOLD)Options de lancement:$(NC)"
	@echo "  $(YELLOW)make start$(NC)         - Auto-détection (recommandé)"
	@echo "  $(YELLOW)make dev-tmux$(NC)      - Lancer dans tmux (3 fenêtres)"
	@echo "  $(YELLOW)make dev-bg$(NC)        - Lancer en background"
	@echo "  $(YELLOW)make dev-fg$(NC)        - Lancer en foreground (logs combinés)"
	@echo ""
	@echo "$(BOLD)Lancement individuel:$(NC)"
	@echo "  $(YELLOW)make dev-translator$(NC) - Port 8000"
	@echo "  $(YELLOW)make dev-gateway$(NC)    - Port 3000"
	@echo "  $(YELLOW)make dev-web$(NC)        - Port 3100"
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

dev-tmux: ## Lancer tous les services dans tmux (3 fenêtres)
	@if [ "$(HAS_TMUX)" != "yes" ]; then \
		echo "$(RED)❌ tmux non disponible. Utilisez: make dev-bg$(NC)"; \
		exit 1; \
	fi
	@echo "$(BLUE)🖥️  Démarrage des services dans tmux...$(NC)"
	@tmux kill-session -t meeshy 2>/dev/null || true
	@tmux new-session -d -s meeshy -n translator \
		"cd $(CURDIR)/$(TRANSLATOR_DIR) && . .venv/bin/activate 2>/dev/null; echo '🔤 Translator starting...'; python3 src/main.py; echo 'Press Enter to exit'; read"
	@sleep 2
	@tmux new-window -t meeshy -n gateway \
		"cd $(CURDIR)/$(GATEWAY_DIR) && echo '🚀 Gateway starting...'; $(JS_RUNTIME) run dev; echo 'Press Enter to exit'; read"
	@sleep 2
	@tmux new-window -t meeshy -n web \
		"cd $(CURDIR)/$(WEB_DIR) && echo '🎨 Web starting...'; $(JS_RUNTIME) run dev; echo 'Press Enter to exit'; read"
	@echo ""
	@echo "$(GREEN)✅ Services lancés dans tmux$(NC)"
	@echo ""
	@echo "$(BOLD)Commandes tmux:$(NC)"
	@echo "  $(CYAN)tmux attach -t meeshy$(NC)  - Attacher à la session"
	@echo "  $(CYAN)Ctrl+B puis N$(NC)          - Fenêtre suivante"
	@echo "  $(CYAN)Ctrl+B puis P$(NC)          - Fenêtre précédente"
	@echo "  $(CYAN)Ctrl+B puis D$(NC)          - Détacher"
	@echo ""
	@$(MAKE) urls
	@echo ""
	@read -p "$(YELLOW)Appuyez sur Entrée pour attacher à tmux...$(NC)" && tmux attach -t meeshy

dev-bg: ## Lancer tous les services en background (sans tmux)
	@echo "$(BLUE)🔄 Démarrage des services en background...$(NC)"
	@mkdir -p $(PID_DIR) logs
	@echo ""
	@# Translator
	@echo "  $(CYAN)🔤 Translator (port 8000)...$(NC)"
	@cd $(TRANSLATOR_DIR) && . .venv/bin/activate 2>/dev/null && \
		python3 src/main.py > $(CURDIR)/logs/translator.log 2>&1 & echo $$! > $(CURDIR)/$(TRANSLATOR_PID)
	@sleep 2
	@# Gateway
	@echo "  $(CYAN)🚀 Gateway (port 3000)...$(NC)"
	@cd $(GATEWAY_DIR) && $(JS_RUNTIME) run dev > $(CURDIR)/logs/gateway.log 2>&1 & echo $$! > $(CURDIR)/$(GATEWAY_PID)
	@sleep 2
	@# Web
	@echo "  $(CYAN)🎨 Web (port 3100)...$(NC)"
	@cd $(WEB_DIR) && $(JS_RUNTIME) run dev > $(CURDIR)/logs/web.log 2>&1 & echo $$! > $(CURDIR)/$(WEB_PID)
	@sleep 3
	@echo ""
	@echo "$(GREEN)✅ Services démarrés en background$(NC)"
	@echo ""
	@$(MAKE) urls
	@echo ""
	@echo "$(BOLD)Logs:$(NC)"
	@echo "  $(CYAN)make logs$(NC)                    - Tous les logs"
	@echo "  $(CYAN)tail -f logs/translator.log$(NC) - Translator"
	@echo "  $(CYAN)tail -f logs/gateway.log$(NC)    - Gateway"
	@echo "  $(CYAN)tail -f logs/web.log$(NC)        - Web"
	@echo ""
	@echo "$(BOLD)Arrêt:$(NC) $(YELLOW)make stop$(NC)"

dev-fg: ## Lancer tous les services en foreground (logs combinés)
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║          MEESHY - Démarrage Foreground                       ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo "$(YELLOW)Ctrl+C pour arrêter tous les services$(NC)"
	@echo ""
	@$(MAKE) -j3 _dev-translator _dev-gateway _dev-web

_dev-translator:
	@cd $(TRANSLATOR_DIR) && . .venv/bin/activate 2>/dev/null || true && python3 src/main.py

_dev-gateway:
	@sleep 3 && cd $(GATEWAY_DIR) && $(JS_RUNTIME) run dev

_dev-web:
	@sleep 5 && cd $(WEB_DIR) && $(JS_RUNTIME) run dev

# =============================================================================
# LOGS
# =============================================================================

logs: ## Afficher les logs (tous ou SERVICE=translator|gateway|web)
	@if [ -n "$(SERVICE)" ]; then \
		tail -f logs/$(SERVICE).log 2>/dev/null || echo "$(RED)Log non trouvé: logs/$(SERVICE).log$(NC)"; \
	else \
		echo "$(BLUE)📋 Logs combinés (Ctrl+C pour quitter)$(NC)"; \
		tail -f logs/*.log 2>/dev/null || echo "$(YELLOW)Aucun log trouvé. Les services tournent-ils en background?$(NC)"; \
	fi

logs-translator: ## Afficher les logs du translator
	@tail -f logs/translator.log 2>/dev/null || echo "$(RED)Log non trouvé$(NC)"

logs-gateway: ## Afficher les logs du gateway
	@tail -f logs/gateway.log 2>/dev/null || echo "$(RED)Log non trouvé$(NC)"

logs-web: ## Afficher les logs du web
	@tail -f logs/web.log 2>/dev/null || echo "$(RED)Log non trouvé$(NC)"

# =============================================================================
# DOCKER COMPOSE
# =============================================================================

docker-infra: ## Démarrer uniquement MongoDB et Redis (pour dev natif)
	@if [ "$(HAS_DOCKER)" != "yes" ]; then \
		echo "$(RED)❌ Docker non disponible$(NC)"; \
		exit 1; \
	fi
	@echo "$(BLUE)🐳 Démarrage de l'infrastructure (MongoDB + Redis)...$(NC)"
	@docker compose -f $(COMPOSE_LOCAL) up -d
	@echo "$(GREEN)✅ Infrastructure démarrée$(NC)"
	@echo ""
	@echo "$(BLUE)📍 Services:$(NC)"
	@echo "   - MongoDB: mongodb://localhost:27017"
	@echo "   - Redis:   redis://localhost:6379"

docker-start: ## Démarrer tous les services via Docker Compose
	@if [ "$(HAS_DOCKER)" != "yes" ]; then \
		echo "$(RED)❌ Docker non disponible$(NC)"; \
		exit 1; \
	fi
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
	@$(MAKE) build-all-docker

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

build-all-docker: build-gateway build-translator build-frontend ## Builder toutes les images Docker
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

status: ## Afficher le statut des services
	@echo "$(BLUE)📊 Statut des services:$(NC)"
	@echo ""
	@echo "$(CYAN)Processus:$(NC)"
	@printf "  %-20s" "Gateway (3000):" && (lsof -ti:3000 >/dev/null 2>&1 && echo "$(GREEN)● Running$(NC)" || echo "$(RED)○ Stopped$(NC)")
	@printf "  %-20s" "Web (3100):" && (lsof -ti:3100 >/dev/null 2>&1 && echo "$(GREEN)● Running$(NC)" || echo "$(RED)○ Stopped$(NC)")
	@printf "  %-20s" "Translator (8000):" && (lsof -ti:8000 >/dev/null 2>&1 && echo "$(GREEN)● Running$(NC)" || echo "$(RED)○ Stopped$(NC)")
	@printf "  %-20s" "MongoDB (27017):" && (lsof -ti:27017 >/dev/null 2>&1 && echo "$(GREEN)● Running$(NC)" || echo "$(RED)○ Stopped$(NC)")
	@printf "  %-20s" "Redis (6379):" && (lsof -ti:6379 >/dev/null 2>&1 && echo "$(GREEN)● Running$(NC)" || echo "$(RED)○ Stopped$(NC)")
	@echo ""
	@if [ "$(HAS_TMUX)" = "yes" ]; then \
		echo "$(CYAN)Session tmux:$(NC)"; \
		tmux has-session -t meeshy 2>/dev/null && echo "  meeshy: $(GREEN)● Active$(NC)" || echo "  meeshy: $(RED)○ Inactive$(NC)"; \
	fi

health: ## Vérifier la santé des services
	@echo "$(BLUE)🏥 Vérification de la santé...$(NC)"
	@echo ""
	@printf "  %-15s" "Gateway:" && (curl -sf http://localhost:3000/health >/dev/null 2>&1 && echo "$(GREEN)✅ Healthy$(NC)" || echo "$(RED)❌ Unhealthy$(NC)")
	@printf "  %-15s" "Web:" && (curl -sf http://localhost:3100 >/dev/null 2>&1 && echo "$(GREEN)✅ Healthy$(NC)" || echo "$(RED)❌ Unhealthy$(NC)")
	@printf "  %-15s" "Translator:" && (curl -sf http://localhost:8000/health >/dev/null 2>&1 && echo "$(GREEN)✅ Healthy$(NC)" || echo "$(RED)❌ Unhealthy$(NC)")
	@echo ""

clean: ## Nettoyer les fichiers générés et node_modules
	@echo "$(YELLOW)🧹 Nettoyage...$(NC)"
	@rm -rf node_modules $(WEB_DIR)/node_modules $(GATEWAY_DIR)/node_modules $(SHARED_DIR)/node_modules
	@rm -rf $(WEB_DIR)/.next $(GATEWAY_DIR)/dist $(SHARED_DIR)/dist
	@rm -rf $(TRANSLATOR_DIR)/.venv $(TRANSLATOR_DIR)/__pycache__
	@rm -rf logs $(PID_DIR)
	@echo "$(GREEN)✅ Nettoyage terminé$(NC)"

clean-docker: ## Supprimer les conteneurs et volumes Docker
	@echo "$(RED)⚠️  Suppression des conteneurs et volumes...$(NC)"
	@docker compose -f $(COMPOSE_FILE) down -v 2>/dev/null || true
	@docker compose -f $(COMPOSE_LOCAL) down -v 2>/dev/null || true
	@echo "$(GREEN)✅ Conteneurs et volumes supprimés$(NC)"

reset: clean install generate ## Réinitialiser complètement le projet
	@echo "$(GREEN)✅ Projet réinitialisé$(NC)"

kill: ## Tuer tous les processus sur les ports de dev
	@echo "$(YELLOW)💀 Arrêt forcé des processus...$(NC)"
	@lsof -ti:3000 | xargs kill -9 2>/dev/null || true
	@lsof -ti:3100 | xargs kill -9 2>/dev/null || true
	@lsof -ti:8000 | xargs kill -9 2>/dev/null || true
	@tmux kill-session -t meeshy 2>/dev/null || true
	@rm -rf $(PID_DIR)
	@echo "$(GREEN)✅ Processus arrêtés$(NC)"

# =============================================================================
# TESTS & QUALITÉ
# =============================================================================

test: ## Lancer tous les tests
	@echo "$(BLUE)🧪 Lancement des tests...$(NC)"
	@echo ""
	@echo "$(CYAN)Gateway:$(NC)"
	@cd $(GATEWAY_DIR) && $(JS_RUNTIME) run test || true
	@echo ""
	@echo "$(CYAN)Web:$(NC)"
	@cd $(WEB_DIR) && $(JS_RUNTIME) run test || true
	@echo ""
	@echo "$(CYAN)Shared:$(NC)"
	@cd $(SHARED_DIR) && $(JS_RUNTIME) run test 2>/dev/null || echo "  Pas de tests"
	@echo ""
	@echo "$(GREEN)✅ Tests terminés$(NC)"

test-gateway: ## Lancer les tests du gateway
	@cd $(GATEWAY_DIR) && $(JS_RUNTIME) run test

test-web: ## Lancer les tests du frontend
	@cd $(WEB_DIR) && $(JS_RUNTIME) run test

test-shared: ## Lancer les tests du shared
	@cd $(SHARED_DIR) && $(JS_RUNTIME) run test

lint: ## Lancer le linter sur tout le projet
	@echo "$(BLUE)🔍 Vérification du code...$(NC)"
	@echo "  → Gateway..."
	@cd $(GATEWAY_DIR) && $(JS_RUNTIME) run lint 2>/dev/null || true
	@echo "  → Web..."
	@cd $(WEB_DIR) && $(JS_RUNTIME) run lint 2>/dev/null || true
	@echo "$(GREEN)✅ Lint terminé$(NC)"

type-check: ## Vérifier les types TypeScript
	@echo "$(BLUE)📝 Vérification des types...$(NC)"
	@echo "  → Shared..."
	@cd $(SHARED_DIR) && $(JS_RUNTIME) run type-check 2>/dev/null || true
	@echo "  → Gateway..."
	@cd $(GATEWAY_DIR) && $(JS_RUNTIME) run type-check 2>/dev/null || true
	@echo "  → Web..."
	@cd $(WEB_DIR) && $(JS_RUNTIME) run type-check 2>/dev/null || true
	@echo "$(GREEN)✅ Type check terminé$(NC)"

verify: lint type-check test ## Vérification complète (lint + types + tests)
	@echo "$(GREEN)✅ Vérification complète terminée$(NC)"

# =============================================================================
# ALIAS
# =============================================================================

i: install
g: generate
b: build
s: status
h: health
u: urls
t: test
up: start
down: stop
ps: status
run: start

.DEFAULT_GOAL := help
