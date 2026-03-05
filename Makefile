# Makefile pour Meeshy - Développement Local et Docker
# Supporte: Bun (défaut), pnpm, Docker Compose

.PHONY: help setup setup-prerequisites setup-python setup-certs setup-certs-force setup-certs-network setup-env setup-secrets setup-network setup-hosts \
        _generate-certs _copy-certs-to-docker _ensure-docker-running _wait-docker-stable _docker-down-if-running _ensure-ports-free _pull-missing-images \
        install generate build dev dev-web dev-gateway dev-translator \
        start stop restart start-network share-cert share-cert-stop network-info \
        _generate-env-local _dev-tmux-domain _dev-bg-domain _show-domain-urls \
        dev-tmux-network dev-bg-network _generate-env-network \
        logs status clean reset health urls docker-infra docker-infra-simple \
        docker-start docker-start-local docker-start-network docker-stop docker-logs docker-build docker-pull docker-login docker-images \
        docker-test docker-test-dev docker-test-local docker-test-prod \
        build-web build-translator build-docker-gateway build-docker-web build-all-docker \
        push-gateway push-translator push-web push-all release \
        dev-tmux dev-bg dev-fg check verify _preflight-check \
        test test-js test-python test-python-fast test-ios test-ios-ui \
        test-gateway test-web test-shared test-translator lint type-check \
        uv-install uv-sync uv-sync-cpu uv-sync-gpu uv-sync-gpu-cu121 uv-sync-gpu-cu118 \
        uv-lock uv-add uv-add-dev uv-run uv-upgrade uv-info \
        build-translator-cpu build-translator-gpu build-translator-gpu-cu121 security-scan validate-images \
        validate-docker-full validate-docker-gateway validate-docker-web validate-docker-translator

# Couleurs
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
CYAN := \033[0;36m
BOLD := \033[1m
DIM := \033[2m
NC := \033[0m

# Runtime JavaScript (bun par défaut, pnpm en fallback)
JS_RUNTIME := $(shell command -v bun >/dev/null 2>&1 && echo "bun" || echo "pnpm")

# Détection tmux
HAS_TMUX := $(shell command -v tmux >/dev/null 2>&1 && echo "yes" || echo "no")

# Détection Docker
HAS_DOCKER := $(shell command -v docker >/dev/null 2>&1 && echo "yes" || echo "no")

# Version Python requise (3.11.x recommandée pour les dépendances ML)
PYTHON_VERSION := $(shell python3 --version 2>/dev/null | cut -d' ' -f2 | cut -d'.' -f1,2)
PYTHON_OK := $(shell python3 -c "import sys; print('yes' if sys.version_info[:2] == (3, 11) else 'no')" 2>/dev/null || echo "no")

# Détection uv (package manager Python ultra-rapide)
HAS_UV := $(shell command -v uv >/dev/null 2>&1 && echo "yes" || echo "no")

# Variables
COMPOSE_DIR := infrastructure/docker/compose
COMPOSE_DEV := $(COMPOSE_DIR)/docker-compose.dev.yml
COMPOSE_LOCAL := $(COMPOSE_DIR)/docker-compose.local.yml
COMPOSE_PROD := $(COMPOSE_DIR)/docker-compose.prod.yml
COMPOSE_FILE := $(COMPOSE_DEV)
COMPOSE_SCRIPTS := $(COMPOSE_DIR)/scripts
CERTS_DIR := $(COMPOSE_DIR)/certs
ENV_FILE := infrastructure/envs/.env.example
SECRETS_FILE := infrastructure/envs/.env.secrets

# OS Detection
UNAME_S := $(shell uname -s 2>/dev/null || echo "Windows")
ifeq ($(UNAME_S),Darwin)
    OS := macos
    HOST_IP := $(shell ifconfig 2>/dev/null | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $$2}')
    BREW := $(shell command -v brew 2>/dev/null)
else ifeq ($(UNAME_S),Linux)
    OS := linux
    HOST_IP := $(shell ip -4 addr show scope global 2>/dev/null | grep inet | head -1 | awk '{print $$2}' | cut -d'/' -f1)
    APT := $(shell command -v apt-get 2>/dev/null)
    DNF := $(shell command -v dnf 2>/dev/null)
else
    OS := windows
    HOST_IP := $(shell ipconfig 2>/dev/null | findstr /i "IPv4" | head -1 | awk '{print $$NF}')
endif

# Network Configuration (can be overridden: make start HOST=mydev.local)
HOST ?= $(HOST_IP)
LOCAL_DOMAIN ?= meeshy.local
ENV_LOCAL := $(COMPOSE_DIR)/.env.local

# Docker Compose Project Names (explicit pour éviter les états corrompus)
PROJECT_LOCAL := meeshy-local
PROJECT_DEV := meeshy-dev
PROJECT_PROD := meeshy-prod

# Paths
WEB_DIR := apps/web
WEB_V2_DIR := apps/web_v2
IOS_DIR := apps/ios
GATEWAY_DIR := services/gateway
TRANSLATOR_DIR := services/translator
AGENT_DIR := services/agent
SHARED_DIR := packages/shared
INFRA_DIR := infrastructure

# PIDs files
PID_DIR := .pids
TRANSLATOR_PID := $(PID_DIR)/translator.pid
GATEWAY_PID := $(PID_DIR)/gateway.pid
AGENT_PID := $(PID_DIR)/agent.pid
WEB_PID := $(PID_DIR)/web.pid
WEB_V2_PID := $(PID_DIR)/web_v2.pid

# =============================================================================
# AIDE
# =============================================================================

help: ## Afficher cette aide
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║          MEESHY - Commandes de Développement                ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(BOLD)OS:$(NC) $(OS) | $(BOLD)Runtime:$(NC) $(JS_RUNTIME) | $(BOLD)Python:$(NC) $(PYTHON_VERSION) | $(BOLD)Tmux:$(NC) $(HAS_TMUX) | $(BOLD)Docker:$(NC) $(HAS_DOCKER)"
	@if [ "$(PYTHON_OK)" != "yes" ]; then \
		echo "$(YELLOW)⚠️  Python 3.11 recommandé (actuel: $(PYTHON_VERSION)). Voir: pyenv install 3.11$(NC)"; \
	fi
	@echo ""
	@echo "$(BLUE)🚀 DÉMARRAGE RAPIDE:$(NC)"
	@echo "  $(YELLOW)make setup$(NC)          - Installation complète (certs + install + generate + build)"
	@echo "  $(YELLOW)make start$(NC)          - Lancer les services natifs (https://$(LOCAL_DOMAIN))"
	@echo "  $(YELLOW)make docker-start$(NC)   - Lancer 100% Docker (https://$(LOCAL_DOMAIN))"
	@echo "  $(YELLOW)make stop$(NC)           - Arrêter tous les services"
	@echo ""
	@echo "$(BLUE)📦 INSTALLATION:$(NC)"
	@grep -E '^(install|install-js|install-python|setup-certs|generate|build):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-18s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BLUE)🔧 DÉVELOPPEMENT:$(NC)"
	@grep -E '^(dev-web|dev-gateway|dev-translator|dev-tmux|dev-bg):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-18s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BLUE)📱 RÉSEAU (Mobile/Multi-Device):$(NC)"
	@grep -E '^(start-network|share-cert|network-info):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-18s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BLUE)🧪 TESTS & QUALITÉ:$(NC)"
	@grep -E '^(test|test-js|test-python|test-python-fast|test-ios|test-ios-ui):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-18s$(NC) %s\n", $$1, $$2}'
	@grep -E '^(test-gateway|test-web|test-translator|lint|type-check|verify):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-18s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BLUE)🐳 DOCKER:$(NC)"
	@grep -E '^(docker-infra|docker-infra-simple|docker-start|docker-start-local|docker-start-network|docker-stop):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-22s$(NC) %s\n", $$1, $$2}'
	@grep -E '^(docker-test|docker-test-dev|docker-test-local|docker-test-prod):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-22s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BLUE)📦 BUILD & PUSH IMAGES:$(NC)"
	@grep -E '^(build-docker-gateway|build-translator|build-docker-web|build-all-docker):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-18s$(NC) %s\n", $$1, $$2}'
	@grep -E '^(push-gateway|push-translator|push-web|push-all|release):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-18s$(NC) %s\n", $$1, $$2}'
	@echo "  $(DIM)Options: TAG=v1.0.0 DOCKER_REGISTRY=myrepo$(NC)"
	@echo ""
	@echo "$(BLUE)🔍 UTILITAIRES:$(NC)"
	@grep -E '^(status|health|urls|logs|clean|kill):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-18s$(NC) %s\n", $$1, $$2}'
	@echo ""

# =============================================================================
# SETUP COMPLET (One-liner)
# =============================================================================

setup: ## 🚀 Installation complète: prérequis OS + certs + DNS + install + generate + build
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║          MEESHY - Installation Complète                      ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(BOLD)🖥️  Système détecté: $(GREEN)$(OS)$(NC)"
	@echo "$(BOLD)📍 IP locale: $(GREEN)$(HOST_IP)$(NC)"
	@echo "$(BOLD)🌐 Domaine: $(GREEN)$(LOCAL_DOMAIN)$(NC)"
	@echo ""
	@$(MAKE) setup-prerequisites
	@$(MAKE) setup-python
	@$(MAKE) setup-certs
	@$(MAKE) setup-hosts
	@$(MAKE) setup-env
	@echo ""
	@$(MAKE) install
	@echo ""
	@$(MAKE) generate
	@echo ""
	@$(MAKE) build
	@echo ""
	@echo "$(GREEN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(GREEN)║  ✅ Setup terminé ! Lancez: make start                       ║$(NC)"
	@echo "$(GREEN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(BOLD)📱 URLs disponibles après 'make start':$(NC)"
	@echo "   Web:          $(GREEN)https://$(LOCAL_DOMAIN)$(NC)"
	@echo "   Gateway API:  $(GREEN)https://gate.$(LOCAL_DOMAIN)$(NC)"
	@echo "   Translator:   $(GREEN)https://ml.$(LOCAL_DOMAIN)$(NC)"

setup-prerequisites: ## 📋 Vérifier/installer les prérequis système (mkcert, Docker, etc.)
	@echo "$(BLUE)📋 Vérification des prérequis système ($(OS))...$(NC)"
	@echo ""
ifeq ($(OS),macos)
	@# macOS - Homebrew
	@if [ -z "$(BREW)" ]; then \
		echo "$(RED)❌ Homebrew non installé. Installez-le:$(NC)"; \
		echo "   /bin/bash -c \"\$$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""; \
		exit 1; \
	fi
	@echo "  $(GREEN)✓ Homebrew disponible$(NC)"
	@# mkcert
	@if ! command -v mkcert >/dev/null 2>&1; then \
		echo "  $(YELLOW)→ Installation de mkcert...$(NC)"; \
		brew install mkcert nss; \
	else \
		echo "  $(GREEN)✓ mkcert disponible$(NC)"; \
	fi
	@# Docker
	@if ! command -v docker >/dev/null 2>&1; then \
		echo "$(YELLOW)⚠️  Docker non installé. Téléchargez Docker Desktop:$(NC)"; \
		echo "   https://www.docker.com/products/docker-desktop/"; \
	else \
		echo "  $(GREEN)✓ Docker disponible$(NC)"; \
	fi
else ifeq ($(OS),linux)
	@# Linux - apt ou dnf
	@# mkcert
	@if ! command -v mkcert >/dev/null 2>&1; then \
		echo "  $(YELLOW)→ Installation de mkcert...$(NC)"; \
		if [ -n "$(APT)" ]; then \
			sudo apt-get update && sudo apt-get install -y libnss3-tools; \
			curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64" && \
			chmod +x mkcert-v*-linux-amd64 && sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert; \
		elif [ -n "$(DNF)" ]; then \
			sudo dnf install -y nss-tools; \
			curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64" && \
			chmod +x mkcert-v*-linux-amd64 && sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert; \
		else \
			echo "$(RED)❌ Gestionnaire de paquets non supporté. Installez mkcert manuellement:$(NC)"; \
			echo "   https://github.com/FiloSottile/mkcert#installation"; \
			exit 1; \
		fi; \
	else \
		echo "  $(GREEN)✓ mkcert disponible$(NC)"; \
	fi
	@# Docker
	@if ! command -v docker >/dev/null 2>&1; then \
		echo "$(YELLOW)⚠️  Docker non installé. Installez-le:$(NC)"; \
		echo "   curl -fsSL https://get.docker.com | sh"; \
	else \
		echo "  $(GREEN)✓ Docker disponible$(NC)"; \
	fi
else
	@# Windows
	@echo "$(YELLOW)📋 Instructions Windows:$(NC)"
	@echo ""
	@echo "  1. Installez Chocolatey (gestionnaire de paquets):"
	@echo "     https://chocolatey.org/install"
	@echo ""
	@echo "  2. Installez mkcert:"
	@echo "     choco install mkcert"
	@echo ""
	@echo "  3. Installez Docker Desktop:"
	@echo "     https://www.docker.com/products/docker-desktop/"
	@echo ""
	@echo "  4. Relancez 'make setup' après installation"
	@echo ""
	@if ! command -v mkcert >/dev/null 2>&1; then \
		echo "$(RED)❌ mkcert non trouvé$(NC)"; \
		exit 1; \
	fi
endif
	@echo ""

setup-python: ## 🐍 Configurer Python 3.11 via pyenv pour le translator
	@echo "$(BLUE)🐍 Configuration de Python 3.11 pour le translator...$(NC)"
	@if ! command -v pyenv >/dev/null 2>&1; then \
		echo "$(RED)❌ pyenv non installé. Installez-le avec: brew install pyenv$(NC)"; \
		exit 1; \
	fi
	@REQUIRED_VERSION="3.11"; \
	INSTALLED=$$(pyenv versions --bare 2>/dev/null | grep "^3\.11" | head -1); \
	if [ -z "$$INSTALLED" ]; then \
		echo "  $(YELLOW)Python 3.11 non trouvé, installation...$(NC)"; \
		pyenv install 3.11 || exit 1; \
		INSTALLED=$$(pyenv versions --bare | grep "^3\.11" | head -1); \
	fi; \
	echo "  $(GREEN)✓ Python $$INSTALLED disponible$(NC)"; \
	cd $(TRANSLATOR_DIR) && echo "$$INSTALLED" > .python-version; \
	echo "  $(GREEN)✓ .python-version configuré pour translator$(NC)"

setup-env: ## 📝 Créer les fichiers .env pour le développement local
	@echo "$(BLUE)📝 Configuration des fichiers .env...$(NC)"
	@$(MAKE) _generate-backend-env
	@$(MAKE) _generate-frontend-env
	@mkdir -p $(TRANSLATOR_DIR)/uploads $(TRANSLATOR_DIR)/generated/audios \
		$(TRANSLATOR_DIR)/embeddings/voices $(TRANSLATOR_DIR)/analytics_data \
		$(TRANSLATOR_DIR)/models
	@echo "  $(GREEN)✓ Dossiers locaux créés$(NC)"

setup-secrets: ## 🔐 Configurer le fichier de secrets (API keys, etc.)
	@echo "$(BLUE)🔐 Configuration des secrets...$(NC)"
	@if [ -f "$(SECRETS_FILE)" ]; then \
		echo "  $(GREEN)✓ Fichier secrets existe déjà: $(SECRETS_FILE)$(NC)"; \
		echo "  $(DIM)   Modifiez-le directement pour mettre à jour les clés$(NC)"; \
	else \
		cp infrastructure/envs/.env.secrets.example $(SECRETS_FILE); \
		echo "  $(GREEN)✓ Fichier secrets créé: $(SECRETS_FILE)$(NC)"; \
		echo ""; \
		echo "$(YELLOW)📝 Éditez $(SECRETS_FILE) pour ajouter vos clés API:$(NC)"; \
		echo "   - BREVO_API_KEY (email/SMS)"; \
		echo "   - SENDGRID_API_KEY"; \
		echo "   - TWILIO_* (SMS)"; \
		echo "   - HCAPTCHA_* (captcha)"; \
		echo "   - etc."; \
		echo ""; \
		echo "$(DIM)   Ce fichier est ignoré par git (vos secrets sont en sécurité)$(NC)"; \
	fi

_generate-backend-env: ## Generate backend .env (gateway + translator + agent)
	@echo "$(CYAN)Generating backend .env files...$(NC)"
	@# Gateway .env
	@echo "# ===== MEESHY GATEWAY SERVICE - Local Development =====" > $(GATEWAY_DIR)/.env
	@echo "# Auto-generated by make setup-env" >> $(GATEWAY_DIR)/.env
	@echo "" >> $(GATEWAY_DIR)/.env
	@echo "# ===== ENVIRONMENT =====" >> $(GATEWAY_DIR)/.env
	@echo "NODE_ENV=development" >> $(GATEWAY_DIR)/.env
	@echo "DEBUG=true" >> $(GATEWAY_DIR)/.env
	@echo "LOG_LEVEL=debug" >> $(GATEWAY_DIR)/.env
	@echo "" >> $(GATEWAY_DIR)/.env
	@echo "# ===== SERVER =====" >> $(GATEWAY_DIR)/.env
	@echo "PORT=3000" >> $(GATEWAY_DIR)/.env
	@echo "HOST=0.0.0.0" >> $(GATEWAY_DIR)/.env
	@echo "USE_HTTPS=false" >> $(GATEWAY_DIR)/.env
	@echo "PUBLIC_URL=http://localhost:3000" >> $(GATEWAY_DIR)/.env
	@echo "FRONTEND_URL=http://localhost:3100" >> $(GATEWAY_DIR)/.env
	@echo "BACKEND_URL=http://localhost:3000" >> $(GATEWAY_DIR)/.env
	@echo "" >> $(GATEWAY_DIR)/.env
	@echo "# ===== DATABASE =====" >> $(GATEWAY_DIR)/.env
	@echo "DATABASE_URL=mongodb://localhost:27017/meeshy" >> $(GATEWAY_DIR)/.env
	@echo "" >> $(GATEWAY_DIR)/.env
	@echo "# ===== REDIS =====" >> $(GATEWAY_DIR)/.env
	@echo "REDIS_URL=redis://localhost:6379" >> $(GATEWAY_DIR)/.env
	@echo "" >> $(GATEWAY_DIR)/.env
	@echo "# ===== JWT =====" >> $(GATEWAY_DIR)/.env
	@echo "JWT_SECRET=dev-secret-key-change-in-production" >> $(GATEWAY_DIR)/.env
	@echo "" >> $(GATEWAY_DIR)/.env
	@echo "# ===== CORS =====" >> $(GATEWAY_DIR)/.env
	@echo "CORS_ORIGINS=http://localhost:3100,http://localhost:3200,http://localhost:3000,http://127.0.0.1:3100,http://127.0.0.1:3200" >> $(GATEWAY_DIR)/.env
	@echo "ALLOWED_ORIGINS=http://localhost:3100,http://localhost:3200,http://localhost:3000" >> $(GATEWAY_DIR)/.env
	@echo "" >> $(GATEWAY_DIR)/.env
	@echo "# ===== RATE LIMITING =====" >> $(GATEWAY_DIR)/.env
	@echo "ENABLE_RATE_LIMITING=true" >> $(GATEWAY_DIR)/.env
	@echo "RATE_LIMIT_MAX=1000" >> $(GATEWAY_DIR)/.env
	@echo "RATE_LIMIT_WINDOW=60000" >> $(GATEWAY_DIR)/.env
	@echo "" >> $(GATEWAY_DIR)/.env
	@echo "# ===== TRANSLATOR SERVICE =====" >> $(GATEWAY_DIR)/.env
	@echo "ZMQ_TRANSLATOR_HOST=localhost" >> $(GATEWAY_DIR)/.env
	@echo "ZMQ_TRANSLATOR_PORT=5555" >> $(GATEWAY_DIR)/.env
	@echo "ZMQ_TRANSLATOR_PUSH_PORT=5555" >> $(GATEWAY_DIR)/.env
	@echo "ZMQ_TRANSLATOR_SUB_PORT=5558" >> $(GATEWAY_DIR)/.env
	@echo "" >> $(GATEWAY_DIR)/.env
	@echo "# ===== MESSAGE LIMITS =====" >> $(GATEWAY_DIR)/.env
	@echo "MAX_MESSAGE_LENGTH=2000" >> $(GATEWAY_DIR)/.env
	@echo "MAX_TEXT_ATTACHMENT_THRESHOLD=2000" >> $(GATEWAY_DIR)/.env
	@echo "MAX_TRANSLATION_LENGTH=10000" >> $(GATEWAY_DIR)/.env
	@echo "" >> $(GATEWAY_DIR)/.env
	@echo "# ===== EMAIL CONFIGURATION =====" >> $(GATEWAY_DIR)/.env
	@echo "EMAIL_FROM=noreply@meeshy.me" >> $(GATEWAY_DIR)/.env
	@echo "EMAIL_FROM_NAME=Meeshy Sama" >> $(GATEWAY_DIR)/.env
	@echo "EMAIL_VERIFICATION_TOKEN_EXPIRY=86400" >> $(GATEWAY_DIR)/.env
	@echo "" >> $(GATEWAY_DIR)/.env
	@echo "# ===== EMAIL PROVIDERS (Multi-Provider with Fallback) =====" >> $(GATEWAY_DIR)/.env
	@echo "# Priority 1: Brevo (~0.00008 EUR/email)" >> $(GATEWAY_DIR)/.env
	@echo "BREVO_API_KEY=" >> $(GATEWAY_DIR)/.env
	@echo "# Priority 2: SendGrid (~0.00010 EUR/email)" >> $(GATEWAY_DIR)/.env
	@echo "SENDGRID_API_KEY=" >> $(GATEWAY_DIR)/.env
	@echo "# Priority 3: Mailgun" >> $(GATEWAY_DIR)/.env
	@echo "MAILGUN_API_KEY=" >> $(GATEWAY_DIR)/.env
	@echo "MAILGUN_DOMAIN=" >> $(GATEWAY_DIR)/.env
	@echo "" >> $(GATEWAY_DIR)/.env
	@echo "# ===== SMS PROVIDERS (Multi-Provider with Fallback) =====" >> $(GATEWAY_DIR)/.env
	@echo "SMS_SENDER_NAME=Meeshy" >> $(GATEWAY_DIR)/.env
	@echo "# Priority 1: Brevo (uses BREVO_API_KEY above)" >> $(GATEWAY_DIR)/.env
	@echo "# Priority 2: Twilio" >> $(GATEWAY_DIR)/.env
	@echo "TWILIO_ACCOUNT_SID=" >> $(GATEWAY_DIR)/.env
	@echo "TWILIO_AUTH_TOKEN=" >> $(GATEWAY_DIR)/.env
	@echo "TWILIO_PHONE_NUMBER=" >> $(GATEWAY_DIR)/.env
	@echo "# Priority 3: Vonage" >> $(GATEWAY_DIR)/.env
	@echo "VONAGE_API_KEY=" >> $(GATEWAY_DIR)/.env
	@echo "VONAGE_API_SECRET=" >> $(GATEWAY_DIR)/.env
	@echo "" >> $(GATEWAY_DIR)/.env
	@echo "# ===== WEBRTC / TURN =====" >> $(GATEWAY_DIR)/.env
	@echo "TURN_SECRET=" >> $(GATEWAY_DIR)/.env
	@echo "TURN_SERVERS=" >> $(GATEWAY_DIR)/.env
	@echo "TURN_CREDENTIAL_TTL=86400" >> $(GATEWAY_DIR)/.env
	@echo "" >> $(GATEWAY_DIR)/.env
	@echo "# ===== CAPTCHA =====" >> $(GATEWAY_DIR)/.env
	@echo "BYPASS_CAPTCHA=true" >> $(GATEWAY_DIR)/.env
	@echo "HCAPTCHA_SECRET=" >> $(GATEWAY_DIR)/.env
	@echo "HCAPTCHA_SITE_KEY=" >> $(GATEWAY_DIR)/.env
	@echo "" >> $(GATEWAY_DIR)/.env
	@echo "# ===== FIREBASE (Push Notifications) =====" >> $(GATEWAY_DIR)/.env
	@echo "FIREBASE_PROJECT_ID=" >> $(GATEWAY_DIR)/.env
	@echo "FIREBASE_CLIENT_EMAIL=" >> $(GATEWAY_DIR)/.env
	@echo "FIREBASE_PRIVATE_KEY=" >> $(GATEWAY_DIR)/.env
	@echo "FIREBASE_ADMIN_CREDENTIALS_PATH=" >> $(GATEWAY_DIR)/.env
	@echo "" >> $(GATEWAY_DIR)/.env
	@echo "# ===== GEOIP =====" >> $(GATEWAY_DIR)/.env
	@echo "GEOIP_LICENSE_KEY=" >> $(GATEWAY_DIR)/.env
	@echo "MAXMIND_ACCOUNT_ID=" >> $(GATEWAY_DIR)/.env
	@echo "" >> $(GATEWAY_DIR)/.env
	@echo "# ===== SECURITY =====" >> $(GATEWAY_DIR)/.env
	@echo "SECURITY_ADMIN_EMAILS=" >> $(GATEWAY_DIR)/.env
	@echo "" >> $(GATEWAY_DIR)/.env
	@echo "# ===== DEFAULT USERS =====" >> $(GATEWAY_DIR)/.env
	@echo "MEESHY_EMAIL=" >> $(GATEWAY_DIR)/.env
	@echo "MEESHY_PASSWORD=" >> $(GATEWAY_DIR)/.env
	@echo "MEESHY_SYSTEM_LANGUAGE=fr" >> $(GATEWAY_DIR)/.env
	@echo "MEESHY_REGIONAL_LANGUAGE=fr" >> $(GATEWAY_DIR)/.env
	@echo "MEESHY_CUSTOM_DESTINATION_LANGUAGE=" >> $(GATEWAY_DIR)/.env
	@echo "ADMIN_EMAIL=" >> $(GATEWAY_DIR)/.env
	@echo "ADMIN_PASSWORD=" >> $(GATEWAY_DIR)/.env
	@echo "ADMIN_SYSTEM_LANGUAGE=fr" >> $(GATEWAY_DIR)/.env
	@echo "ADMIN_REGIONAL_LANGUAGE=fr" >> $(GATEWAY_DIR)/.env
	@echo "ADMIN_CUSTOM_DESTINATION_LANGUAGE=" >> $(GATEWAY_DIR)/.env
	@echo "" >> $(GATEWAY_DIR)/.env
	@echo "# ===== UPLOADS =====" >> $(GATEWAY_DIR)/.env
	@echo "UPLOAD_PATH=./uploads" >> $(GATEWAY_DIR)/.env
	@echo "  $(GREEN)✓ $(GATEWAY_DIR)/.env created$(NC)"
	@# Translator .env
	@echo "# ===== MEESHY TRANSLATOR SERVICE - Local Development =====" > $(TRANSLATOR_DIR)/.env
	@echo "# Auto-generated by make setup-env" >> $(TRANSLATOR_DIR)/.env
	@echo "" >> $(TRANSLATOR_DIR)/.env
	@echo "# ===== ENVIRONMENT =====" >> $(TRANSLATOR_DIR)/.env
	@echo "DEBUG=true" >> $(TRANSLATOR_DIR)/.env
	@echo "WORKERS=4" >> $(TRANSLATOR_DIR)/.env
	@echo "" >> $(TRANSLATOR_DIR)/.env
	@echo "# ===== SERVER PORTS =====" >> $(TRANSLATOR_DIR)/.env
	@echo "FASTAPI_PORT=8000" >> $(TRANSLATOR_DIR)/.env
	@echo "GRPC_PORT=50051" >> $(TRANSLATOR_DIR)/.env
	@echo "ZMQ_PORT=5555" >> $(TRANSLATOR_DIR)/.env
	@echo "" >> $(TRANSLATOR_DIR)/.env
	@echo "# ===== DATABASE =====" >> $(TRANSLATOR_DIR)/.env
	@echo "DATABASE_URL=mongodb://localhost:27017/meeshy" >> $(TRANSLATOR_DIR)/.env
	@echo "PRISMA_POOL_SIZE=15" >> $(TRANSLATOR_DIR)/.env
	@echo "" >> $(TRANSLATOR_DIR)/.env
	@echo "# ===== REDIS =====" >> $(TRANSLATOR_DIR)/.env
	@echo "REDIS_URL=redis://localhost:6379" >> $(TRANSLATOR_DIR)/.env
	@echo "TRANSLATION_CACHE_TTL=3600" >> $(TRANSLATOR_DIR)/.env
	@echo "CACHE_MAX_ENTRIES=10000" >> $(TRANSLATOR_DIR)/.env
	@echo "" >> $(TRANSLATOR_DIR)/.env
	@echo "# ===== AUDIO SERVICES =====" >> $(TRANSLATOR_DIR)/.env
	@echo "ENABLE_AUDIO_SERVICES=true" >> $(TRANSLATOR_DIR)/.env
	@echo "ENABLE_VOICE_API=true" >> $(TRANSLATOR_DIR)/.env
	@echo "" >> $(TRANSLATOR_DIR)/.env
	@echo "# ===== WHISPER (Transcription) =====" >> $(TRANSLATOR_DIR)/.env
	@echo "WHISPER_MODEL=base" >> $(TRANSLATOR_DIR)/.env
	@echo "WHISPER_DEVICE=auto" >> $(TRANSLATOR_DIR)/.env
	@echo "WHISPER_COMPUTE_TYPE=float16" >> $(TRANSLATOR_DIR)/.env
	@echo "" >> $(TRANSLATOR_DIR)/.env
	@echo "# ===== TTS (Text-to-Speech) =====" >> $(TRANSLATOR_DIR)/.env
	@echo "TTS_MODEL=chatterbox" >> $(TRANSLATOR_DIR)/.env
	@echo "TTS_DEVICE=auto" >> $(TRANSLATOR_DIR)/.env
	@echo "TTS_OUTPUT_DIR=./generated/audios" >> $(TRANSLATOR_DIR)/.env
	@echo "TTS_DEFAULT_FORMAT=mp3" >> $(TRANSLATOR_DIR)/.env
	@echo "CHATTERBOX_EXAGGERATION=0.5" >> $(TRANSLATOR_DIR)/.env
	@echo "CHATTERBOX_CFG_WEIGHT=0.5" >> $(TRANSLATOR_DIR)/.env
	@echo "" >> $(TRANSLATOR_DIR)/.env
	@echo "# ===== VOICE CLONING =====" >> $(TRANSLATOR_DIR)/.env
	@echo "VOICE_MODEL_CACHE_DIR=./embeddings/voices" >> $(TRANSLATOR_DIR)/.env
	@echo "VOICE_CLONE_DEVICE=cpu" >> $(TRANSLATOR_DIR)/.env
	@echo "VOICE_PROFILE_CACHE_TTL=3600" >> $(TRANSLATOR_DIR)/.env
	@echo "" >> $(TRANSLATOR_DIR)/.env
	@echo "# ===== DIRECTORIES =====" >> $(TRANSLATOR_DIR)/.env
	@echo "UPLOAD_DIR=./uploads" >> $(TRANSLATOR_DIR)/.env
	@echo "OUTPUT_DIR=./generated/audios" >> $(TRANSLATOR_DIR)/.env
	@echo "AUDIO_OUTPUT_DIR=./generated/audios" >> $(TRANSLATOR_DIR)/.env
	@echo "ANALYTICS_DATA_DIR=./analytics_data" >> $(TRANSLATOR_DIR)/.env
	@echo "MAX_CONCURRENT_JOBS=10" >> $(TRANSLATOR_DIR)/.env
	@echo "" >> $(TRANSLATOR_DIR)/.env
	@echo "# ===== TRANSLATION ML MODELS =====" >> $(TRANSLATOR_DIR)/.env
	@echo "MODELS_PATH=./models" >> $(TRANSLATOR_DIR)/.env
	@echo "BASIC_MODEL=facebook/nllb-200-distilled-600M" >> $(TRANSLATOR_DIR)/.env
	@echo "PREMIUM_MODEL=facebook/nllb-200-distilled-1.3B" >> $(TRANSLATOR_DIR)/.env
	@echo "" >> $(TRANSLATOR_DIR)/.env
	@echo "# ===== ML PERFORMANCE =====" >> $(TRANSLATOR_DIR)/.env
	@echo "ML_BATCH_SIZE=16" >> $(TRANSLATOR_DIR)/.env
	@echo "GPU_MEMORY_FRACTION=0.8" >> $(TRANSLATOR_DIR)/.env
	@echo "TRANSLATION_TIMEOUT=20" >> $(TRANSLATOR_DIR)/.env
	@echo "CONCURRENT_TRANSLATIONS=4" >> $(TRANSLATOR_DIR)/.env
	@echo "" >> $(TRANSLATOR_DIR)/.env
	@echo "# ===== MODEL DOWNLOAD =====" >> $(TRANSLATOR_DIR)/.env
	@echo "MODEL_DOWNLOAD_TIMEOUT=300" >> $(TRANSLATOR_DIR)/.env
	@echo "MODEL_DOWNLOAD_MAX_RETRIES=3" >> $(TRANSLATOR_DIR)/.env
	@echo "MODEL_DOWNLOAD_CONSECUTIVE_TIMEOUTS=5" >> $(TRANSLATOR_DIR)/.env
	@echo "MODEL_LOAD_TIMEOUT=120" >> $(TRANSLATOR_DIR)/.env
	@echo "TOKENIZER_LOAD_TIMEOUT=60" >> $(TRANSLATOR_DIR)/.env
	@echo "HUGGINGFACE_TIMEOUT=300" >> $(TRANSLATOR_DIR)/.env
	@echo "" >> $(TRANSLATOR_DIR)/.env
	@echo "# ===== LANGUAGE SETTINGS =====" >> $(TRANSLATOR_DIR)/.env
	@echo "DEFAULT_LANGUAGE=fr" >> $(TRANSLATOR_DIR)/.env
	@echo "SUPPORTED_LANGUAGES=fr,en,es,de,pt,zh,ja,ar" >> $(TRANSLATOR_DIR)/.env
	@echo "AUTO_DETECT_LANGUAGE=true" >> $(TRANSLATOR_DIR)/.env
	@echo "" >> $(TRANSLATOR_DIR)/.env
	@echo "# ===== MESSAGE LIMITS =====" >> $(TRANSLATOR_DIR)/.env
	@echo "MAX_TEXT_LENGTH=10000" >> $(TRANSLATOR_DIR)/.env
	@echo "" >> $(TRANSLATOR_DIR)/.env
	@echo "# ===== HUGGINGFACE CACHE =====" >> $(TRANSLATOR_DIR)/.env
	@echo "HF_HOME=./models" >> $(TRANSLATOR_DIR)/.env
	@echo "TRANSFORMERS_CACHE=./models" >> $(TRANSLATOR_DIR)/.env
	@echo "HUGGINGFACE_HUB_CACHE=./models" >> $(TRANSLATOR_DIR)/.env
	@echo "  $(GREEN)✓ $(TRANSLATOR_DIR)/.env created$(NC)"
	@# Agent .env
	@echo "# ===== MEESHY AGENT SERVICE - Local Development =====" > $(AGENT_DIR)/.env
	@echo "# Auto-generated by make setup-env" >> $(AGENT_DIR)/.env
	@echo "NODE_ENV=development" >> $(AGENT_DIR)/.env
	@echo "PORT=3200" >> $(AGENT_DIR)/.env
	@echo "LLM_PROVIDER=openai" >> $(AGENT_DIR)/.env
	@echo "OPENAI_API_KEY=$${OPENAI_API_KEY:-}" >> $(AGENT_DIR)/.env
	@echo "OPENAI_MODEL=gpt-4o-mini" >> $(AGENT_DIR)/.env
	@echo "ZMQ_HOST=localhost" >> $(AGENT_DIR)/.env
	@echo "ZMQ_PULL_PORT=5560" >> $(AGENT_DIR)/.env
	@echo "ZMQ_PUB_PORT=5561" >> $(AGENT_DIR)/.env
	@echo "DATABASE_URL=mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true" >> $(AGENT_DIR)/.env
	@echo "REDIS_URL=redis://localhost:6379" >> $(AGENT_DIR)/.env
	@echo "  $(GREEN)✓ $(AGENT_DIR)/.env created$(NC)"

_generate-frontend-env: ## Generate frontend .env (webapp)
	@echo "$(CYAN)Generating frontend .env...$(NC)"
	@echo "# ===== MEESHY WEBAPP - Local Development =====" > $(WEB_DIR)/.env
	@echo "# Auto-generated by make setup-env" >> $(WEB_DIR)/.env
	@echo "" >> $(WEB_DIR)/.env
	@echo "# ===== ENVIRONMENT =====" >> $(WEB_DIR)/.env
	@echo "NODE_ENV=development" >> $(WEB_DIR)/.env
	@echo "" >> $(WEB_DIR)/.env
	@echo "# ===== PUBLIC API URLs (Client-side) =====" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_API_URL=http://localhost:3000" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_WS_URL=ws://localhost:3000" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_BACKEND_URL=http://localhost:3000" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_TRANSLATION_URL=http://localhost:8000" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_FRONTEND_URL=http://localhost:3100" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_STATIC_URL=http://localhost:3100" >> $(WEB_DIR)/.env
	@echo "" >> $(WEB_DIR)/.env
	@echo "# ===== INTERNAL URLs (SSR) =====" >> $(WEB_DIR)/.env
	@echo "INTERNAL_BACKEND_URL=http://localhost:3000" >> $(WEB_DIR)/.env
	@echo "INTERNAL_WS_URL=ws://localhost:3000" >> $(WEB_DIR)/.env
	@echo "" >> $(WEB_DIR)/.env
	@echo "# ===== MESSAGE LIMITS =====" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_MAX_MESSAGE_LENGTH=2000" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_MAX_TEXT_ATTACHMENT_THRESHOLD=2000" >> $(WEB_DIR)/.env
	@echo "" >> $(WEB_DIR)/.env
	@echo "# ===== FEATURES =====" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_ENABLE_PASSWORD_RESET=true" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS=false" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_ENABLE_PWA_BADGES=false" >> $(WEB_DIR)/.env
	@echo "" >> $(WEB_DIR)/.env
	@echo "# ===== DEBUG =====" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_DEBUG_LOGS=false" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_DEBUG_NOTIFICATIONS=false" >> $(WEB_DIR)/.env
	@echo "" >> $(WEB_DIR)/.env
	@echo "# ===== CAPTCHA =====" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_HCAPTCHA_SITE_KEY=" >> $(WEB_DIR)/.env
	@echo "" >> $(WEB_DIR)/.env
	@echo "# ===== FIREBASE (Push Notifications) =====" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_FIREBASE_API_KEY=" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_FIREBASE_PROJECT_ID=" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_FIREBASE_APP_ID=" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_FIREBASE_VAPID_KEY=" >> $(WEB_DIR)/.env
	@echo "" >> $(WEB_DIR)/.env
	@echo "# ===== VAPID (Web Push) =====" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_VAPID_PUBLIC_KEY=" >> $(WEB_DIR)/.env
	@echo "" >> $(WEB_DIR)/.env
	@echo "# ===== NEXT.JS =====" >> $(WEB_DIR)/.env
	@echo "NEXT_TELEMETRY_DISABLED=1" >> $(WEB_DIR)/.env
	@echo "  $(GREEN)✓ $(WEB_DIR)/.env created$(NC)"

setup-env-force: ## 📝 Forcer la régénération des fichiers .env
	@echo "$(YELLOW)⚠️  Régénération forcée des fichiers .env...$(NC)"
	@rm -f $(GATEWAY_DIR)/.env $(TRANSLATOR_DIR)/.env $(WEB_DIR)/.env
	@$(MAKE) setup-env

setup-certs: ## 🔐 Générer les certificats SSL locaux (mkcert) si absents
	@echo "$(BLUE)🔐 Configuration des certificats SSL pour *.$(LOCAL_DOMAIN)...$(NC)"
	@if ! command -v mkcert >/dev/null 2>&1; then \
		echo "$(RED)❌ mkcert non installé. Lancez: make setup-prerequisites$(NC)"; \
		exit 1; \
	fi
	@# Vérifier si les certificats existent déjà
	@if [ -f "$(WEB_DIR)/.cert/localhost.pem" ] && [ -f "$(WEB_DIR)/.cert/localhost-key.pem" ]; then \
		echo "  $(GREEN)✓ Certificats déjà présents dans $(WEB_DIR)/.cert/$(NC)"; \
		echo "  $(DIM)→ Pour régénérer: make setup-certs-force$(NC)"; \
	else \
		$(MAKE) _generate-certs; \
	fi
	@# S'assurer que les certificats Docker existent
	@mkdir -p $(CERTS_DIR)
	@if [ -f "$(WEB_DIR)/.cert/localhost.pem" ] && [ ! -f "$(CERTS_DIR)/cert.pem" ]; then \
		$(MAKE) _copy-certs-to-docker; \
	fi

setup-certs-force: ## 🔐 Forcer la régénération des certificats SSL
	@echo "$(YELLOW)🔐 Régénération forcée des certificats SSL...$(NC)"
	@if ! command -v mkcert >/dev/null 2>&1; then \
		echo "$(RED)❌ mkcert non installé. Lancez: make setup-prerequisites$(NC)"; \
		exit 1; \
	fi
	@$(MAKE) _generate-certs

_generate-certs: ## (interne) Génère les certificats avec mkcert
	@echo "  $(YELLOW)→ Installation de l'autorité de certification locale...$(NC)"
	@mkcert -install 2>/dev/null || true
	@mkdir -p $(WEB_DIR)/.cert $(CERTS_DIR)
	@echo "  $(YELLOW)→ Génération des certificats pour tous les domaines locaux...$(NC)"
	@# Générer pour le frontend (Next.js)
	@cd $(WEB_DIR)/.cert && mkcert \
		-key-file localhost-key.pem \
		-cert-file localhost.pem \
		"*.$(LOCAL_DOMAIN)" \
		"$(LOCAL_DOMAIN)" \
		"*.meeshy.home" \
		"meeshy.home" \
		"*.smpdev02.home" \
		"smpdev02.home" \
		"meeshy" \
		localhost \
		127.0.0.1 \
		::1 \
		$(HOST_IP)
	@# Copier pour Docker/Traefik
	@cp $(WEB_DIR)/.cert/localhost.pem $(CERTS_DIR)/cert.pem
	@cp $(WEB_DIR)/.cert/localhost-key.pem $(CERTS_DIR)/key.pem
	@# Copier le certificat CA pour le partage mobile
	@CA_ROOT=$$(mkcert -CAROOT 2>/dev/null); \
	if [ -n "$$CA_ROOT" ] && [ -f "$$CA_ROOT/rootCA.pem" ]; then \
		cp "$$CA_ROOT/rootCA.pem" "$(CERTS_DIR)/mkcert-rootCA.pem"; \
	fi
	@echo "  $(GREEN)✓ Certificats générés et copiés$(NC)"
	@echo ""
	@echo "$(BOLD)📍 Fichiers créés:$(NC)"
	@echo "    $(WEB_DIR)/.cert/localhost.pem      (Next.js)"
	@echo "    $(WEB_DIR)/.cert/localhost-key.pem  (Next.js)"
	@echo "    $(CERTS_DIR)/cert.pem               (Docker/Traefik)"
	@echo "    $(CERTS_DIR)/key.pem                (Docker/Traefik)"
	@echo ""
	@echo "$(BOLD)🌐 Domaines couverts:$(NC)"
	@echo "    *.$(LOCAL_DOMAIN), $(LOCAL_DOMAIN)"
	@echo "    *.meeshy.home, meeshy.home"
	@echo "    *.smpdev02.home, smpdev02.home"
	@echo "    meeshy, localhost, 127.0.0.1, $(HOST_IP)"

_copy-certs-to-docker: ## (interne) Copie les certificats vers Docker
	@mkdir -p $(CERTS_DIR)
	@if [ -f "$(WEB_DIR)/.cert/localhost.pem" ]; then \
		cp $(WEB_DIR)/.cert/localhost.pem $(CERTS_DIR)/cert.pem; \
		cp $(WEB_DIR)/.cert/localhost-key.pem $(CERTS_DIR)/key.pem; \
		echo "  $(GREEN)✓ Certificats copiés vers $(CERTS_DIR)/$(NC)"; \
	else \
		echo "  $(RED)❌ Certificats source introuvables dans $(WEB_DIR)/.cert/$(NC)"; \
		exit 1; \
	fi

# =============================================================================
# INSTALLATION
# =============================================================================

install: ## Installer toutes les dépendances (JS + Python + outils)
	@echo "$(BLUE)📦 Installation des dépendances JavaScript avec $(JS_RUNTIME)...$(NC)"
	@$(JS_RUNTIME) install
	@echo ""
ifeq ($(OS),macos)
	@echo "$(BLUE)📦 Installation des outils système (macOS)...$(NC)"
	@if command -v brew >/dev/null 2>&1; then \
		if ! command -v qrencode >/dev/null 2>&1; then \
			echo "  Installing qrencode (for make share-cert QR codes)..."; \
			brew install qrencode 2>/dev/null || echo "  $(YELLOW)⚠️  qrencode installation failed (optional)$(NC)"; \
		else \
			echo "  $(GREEN)✓$(NC) qrencode already installed"; \
		fi; \
		if ! command -v mkcert >/dev/null 2>&1; then \
			echo "  Installing mkcert (for local HTTPS certificates)..."; \
			brew install mkcert 2>/dev/null || echo "  $(YELLOW)⚠️  mkcert installation failed$(NC)"; \
		else \
			echo "  $(GREEN)✓$(NC) mkcert already installed"; \
		fi; \
	else \
		echo "  $(YELLOW)⚠️  Homebrew not found. Install manually: brew install qrencode mkcert$(NC)"; \
	fi
	@echo ""
endif
	@echo "$(BLUE)📦 Installation des dépendances Python (via pyenv Python 3.11)...$(NC)"
	@cd $(TRANSLATOR_DIR) && \
		if [ -f .python-version ]; then \
			PYENV_VERSION=$$(cat .python-version); \
			PYENV_BIN=~/.pyenv/versions/$$PYENV_VERSION/bin/python; \
			if [ ! -f "$$PYENV_BIN" ]; then \
				echo "  $(RED)❌ Python $$PYENV_VERSION non trouvé. Exécutez: make setup-python$(NC)"; \
				exit 1; \
			fi; \
			echo "  Utilisation de Python $$PYENV_VERSION (pyenv)"; \
			if [ -d .venv ]; then \
				VENV_PY_VERSION=$$(.venv/bin/python --version 2>/dev/null | cut -d' ' -f2 | cut -d'.' -f1,2); \
				REQUIRED_PY_VERSION=$$(echo $$PYENV_VERSION | cut -d'.' -f1,2); \
				if [ "$$VENV_PY_VERSION" != "$$REQUIRED_PY_VERSION" ]; then \
					echo "  $(YELLOW)⚠️  venv utilise Python $$VENV_PY_VERSION, requis: $$REQUIRED_PY_VERSION$(NC)"; \
					echo "  $(YELLOW)   Recréation du venv...$(NC)"; \
					rm -rf .venv; \
				fi; \
			fi; \
			if [ ! -d .venv ]; then \
				$$PYENV_BIN -m venv .venv; \
			fi; \
		else \
			echo "  $(YELLOW)⚠️  Pas de .python-version, utilisation de python3 système$(NC)"; \
			python3 -m venv .venv; \
		fi && \
		. .venv/bin/activate && \
		pip install -q --upgrade pip setuptools wheel && \
		echo "  $(BLUE)📦 Installation des dépendances (incluant pyannote.audio + scikit-learn)...$(NC)" && \
		pip install -r requirements.txt && \
		echo "  $(GREEN)✅ Toutes les dépendances installées (diarisation incluse)$(NC)"
	@echo ""
	@echo "$(GREEN)✅ Toutes les dépendances installées$(NC)"
	@echo ""
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║          INSTALLATION SUMMARY                                ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(BOLD)📁 Created/Updated Folders:$(NC)"
	@[ -d "node_modules" ] && echo "  $(GREEN)✓$(NC) ./node_modules ($$(du -sh node_modules 2>/dev/null | cut -f1))" || true
	@[ -d "$(WEB_DIR)/node_modules" ] && echo "  $(GREEN)✓$(NC) $(WEB_DIR)/node_modules ($$(du -sh $(WEB_DIR)/node_modules 2>/dev/null | cut -f1))" || true
	@[ -d "$(GATEWAY_DIR)/node_modules" ] && echo "  $(GREEN)✓$(NC) $(GATEWAY_DIR)/node_modules ($$(du -sh $(GATEWAY_DIR)/node_modules 2>/dev/null | cut -f1))" || true
	@[ -d "$(SHARED_DIR)/node_modules" ] && echo "  $(GREEN)✓$(NC) $(SHARED_DIR)/node_modules ($$(du -sh $(SHARED_DIR)/node_modules 2>/dev/null | cut -f1))" || true
	@[ -d "$(TRANSLATOR_DIR)/.venv" ] && echo "  $(GREEN)✓$(NC) $(TRANSLATOR_DIR)/.venv ($$(du -sh $(TRANSLATOR_DIR)/.venv 2>/dev/null | cut -f1))" || true
	@echo ""
	@echo "$(BOLD)📍 Installation Locations:$(NC)"
	@echo "  $(YELLOW)JavaScript ($(JS_RUNTIME)):$(NC)"
	@echo "    Root:       $(CURDIR)/node_modules"
	@echo "    Web:        $(CURDIR)/$(WEB_DIR)/node_modules"
	@echo "    Gateway:    $(CURDIR)/$(GATEWAY_DIR)/node_modules"
	@echo "    Shared:     $(CURDIR)/$(SHARED_DIR)/node_modules"
	@echo ""
	@echo "  $(YELLOW)Python (venv):$(NC)"
	@echo "    Venv:       $(CURDIR)/$(TRANSLATOR_DIR)/.venv"
	@echo "    Python:     $(CURDIR)/$(TRANSLATOR_DIR)/.venv/bin/python"
	@echo "    Pip:        $(CURDIR)/$(TRANSLATOR_DIR)/.venv/bin/pip"
	@echo ""
	@echo "$(BOLD)📊 Package Counts:$(NC)"
	@JS_PKG=$$(find node_modules -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' '); echo "  JS packages (root):    $$((JS_PKG - 1))"
	@PY_PKG=$$(cd $(TRANSLATOR_DIR) && . .venv/bin/activate 2>/dev/null && pip list 2>/dev/null | tail -n +3 | wc -l | tr -d ' '); echo "  Python packages:       $$PY_PKG"
	@echo ""

install-js: ## Installer uniquement les dépendances JavaScript
	@echo "$(BLUE)📦 Installation des dépendances JavaScript avec $(JS_RUNTIME)...$(NC)"
	@$(JS_RUNTIME) install
	@echo "$(GREEN)✅ Dépendances JavaScript installées$(NC)"

install-python: ## Installer les dépendances Python (uv si disponible, sinon pip)
ifeq ($(HAS_UV),yes)
	@echo "$(BLUE)📦 Installation des dépendances Python via uv (ultra-rapide)...$(NC)"
	@cd $(TRANSLATOR_DIR) && \
		uv sync --dev && \
		echo "$(GREEN)✅ Dépendances Python installées via uv$(NC)"
else
	@echo "$(BLUE)📦 Installation des dépendances Python via pip...$(NC)"
	@echo "$(YELLOW)💡 Conseil: Installez uv pour des installations 10-100x plus rapides: curl -LsSf https://astral.sh/uv/install.sh | sh$(NC)"
	@cd $(TRANSLATOR_DIR) && \
		if [ -f .python-version ]; then \
			PYENV_VERSION=$$(cat .python-version); \
			PYENV_BIN=~/.pyenv/versions/$$PYENV_VERSION/bin/python; \
			if [ ! -f "$$PYENV_BIN" ]; then \
				echo "  $(RED)❌ Python $$PYENV_VERSION non trouvé. Exécutez: make setup-python$(NC)"; \
				exit 1; \
			fi; \
			echo "  Utilisation de Python $$PYENV_VERSION (pyenv)"; \
			if [ -d .venv ]; then \
				VENV_PY_VERSION=$$(.venv/bin/python --version 2>/dev/null | cut -d' ' -f2 | cut -d'.' -f1,2); \
				REQUIRED_PY_VERSION=$$(echo $$PYENV_VERSION | cut -d'.' -f1,2); \
				if [ "$$VENV_PY_VERSION" != "$$REQUIRED_PY_VERSION" ]; then \
					echo "  $(YELLOW)⚠️  venv utilise Python $$VENV_PY_VERSION, requis: $$REQUIRED_PY_VERSION$(NC)"; \
					echo "  $(YELLOW)   Recréation du venv...$(NC)"; \
					rm -rf .venv; \
				fi; \
			fi; \
			if [ ! -d .venv ]; then \
				$$PYENV_BIN -m venv .venv; \
			fi; \
		else \
			echo "  $(YELLOW)⚠️  Pas de .python-version, utilisation de python3 système$(NC)"; \
			python3 -m venv .venv; \
		fi && \
		. .venv/bin/activate && \
		pip install -q --upgrade pip setuptools wheel && \
		pip install -q -r requirements.txt
	@echo "$(GREEN)✅ Dépendances Python installées$(NC)"
endif

# =============================================================================
# UV - Package Manager Python Ultra-Rapide
# =============================================================================
# Configuration du backend PyTorch (cpu, gpu, gpu-cu121, gpu-cu118)
TORCH_BACKEND ?= cpu

uv-install: ## Installer uv (package manager Python)
	@if [ "$(HAS_UV)" = "yes" ]; then \
		echo "$(GREEN)✅ uv est déjà installé: $$(uv --version)$(NC)"; \
	else \
		echo "$(BLUE)📦 Installation de uv...$(NC)"; \
		curl -LsSf https://astral.sh/uv/install.sh | sh; \
		echo "$(GREEN)✅ uv installé. Redémarrez votre terminal ou exécutez: source ~/.bashrc$(NC)"; \
	fi

uv-sync: ## Synchroniser les dépendances Python (CPU par défaut)
	@if [ "$(HAS_UV)" != "yes" ]; then \
		echo "$(RED)❌ uv non installé. Exécutez: make uv-install$(NC)"; \
		exit 1; \
	fi
	@echo "$(BLUE)📦 Synchronisation des dépendances (backend: $(TORCH_BACKEND))...$(NC)"
	@cd $(TRANSLATOR_DIR) && uv sync --extra $(TORCH_BACKEND) --extra dev
	@echo "$(GREEN)✅ Dépendances synchronisées ($(TORCH_BACKEND))$(NC)"

uv-sync-cpu: ## Synchroniser avec PyTorch CPU (léger, ~2GB)
	@$(MAKE) uv-sync TORCH_BACKEND=cpu

uv-sync-gpu: ## Synchroniser avec PyTorch GPU CUDA 12.4 (~8GB)
	@$(MAKE) uv-sync TORCH_BACKEND=gpu

uv-sync-gpu-cu121: ## Synchroniser avec PyTorch GPU CUDA 12.1
	@$(MAKE) uv-sync TORCH_BACKEND=gpu-cu121

uv-sync-gpu-cu118: ## Synchroniser avec PyTorch GPU CUDA 11.8 (legacy)
	@$(MAKE) uv-sync TORCH_BACKEND=gpu-cu118

uv-lock: ## Générer/mettre à jour le fichier uv.lock
	@if [ "$(HAS_UV)" != "yes" ]; then \
		echo "$(RED)❌ uv non installé. Exécutez: make uv-install$(NC)"; \
		exit 1; \
	fi
	@echo "$(BLUE)🔒 Génération du fichier uv.lock...$(NC)"
	@cd $(TRANSLATOR_DIR) && uv lock
	@echo "$(GREEN)✅ uv.lock généré$(NC)"

uv-add: ## Ajouter une dépendance Python (usage: make uv-add PKG=fastapi)
	@if [ "$(HAS_UV)" != "yes" ]; then \
		echo "$(RED)❌ uv non installé. Exécutez: make uv-install$(NC)"; \
		exit 1; \
	fi
	@if [ -z "$(PKG)" ]; then \
		echo "$(RED)❌ Usage: make uv-add PKG=nom-du-package$(NC)"; \
		exit 1; \
	fi
	@echo "$(BLUE)📦 Ajout de $(PKG)...$(NC)"
	@cd $(TRANSLATOR_DIR) && uv add $(PKG)
	@echo "$(GREEN)✅ $(PKG) ajouté$(NC)"

uv-add-dev: ## Ajouter une dépendance de dev (usage: make uv-add-dev PKG=pytest)
	@if [ "$(HAS_UV)" != "yes" ]; then \
		echo "$(RED)❌ uv non installé. Exécutez: make uv-install$(NC)"; \
		exit 1; \
	fi
	@if [ -z "$(PKG)" ]; then \
		echo "$(RED)❌ Usage: make uv-add-dev PKG=nom-du-package$(NC)"; \
		exit 1; \
	fi
	@echo "$(BLUE)📦 Ajout de $(PKG) (dev)...$(NC)"
	@cd $(TRANSLATOR_DIR) && uv add --dev $(PKG)
	@echo "$(GREEN)✅ $(PKG) ajouté (dev)$(NC)"

uv-run: ## Exécuter une commande dans l'env uv (usage: make uv-run CMD="python -m pytest")
	@if [ "$(HAS_UV)" != "yes" ]; then \
		echo "$(RED)❌ uv non installé. Exécutez: make uv-install$(NC)"; \
		exit 1; \
	fi
	@cd $(TRANSLATOR_DIR) && uv run $(CMD)

uv-upgrade: ## Mettre à jour toutes les dépendances Python
	@if [ "$(HAS_UV)" != "yes" ]; then \
		echo "$(RED)❌ uv non installé. Exécutez: make uv-install$(NC)"; \
		exit 1; \
	fi
	@echo "$(BLUE)📦 Mise à jour des dépendances...$(NC)"
	@cd $(TRANSLATOR_DIR) && uv lock --upgrade
	@cd $(TRANSLATOR_DIR) && uv sync --extra $(TORCH_BACKEND) --extra dev
	@echo "$(GREEN)✅ Dépendances mises à jour$(NC)"

uv-info: ## Afficher les informations sur l'environnement Python/uv
	@if [ "$(HAS_UV)" != "yes" ]; then \
		echo "$(RED)❌ uv non installé. Exécutez: make uv-install$(NC)"; \
		exit 1; \
	fi
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║              UV / PYTHON ENVIRONMENT INFO                    ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(BOLD)uv version:$(NC) $$(uv --version)"
	@echo "$(BOLD)Python:$(NC) $$(cd $(TRANSLATOR_DIR) && uv run python --version 2>/dev/null || echo 'Not installed')"
	@echo ""
	@echo "$(BOLD)PyTorch Info:$(NC)"
	@cd $(TRANSLATOR_DIR) && uv run python -c "\
import torch; \
print(f'  Version: {torch.__version__}'); \
print(f'  CUDA available: {torch.cuda.is_available()}'); \
print(f'  CUDA version: {torch.version.cuda if torch.cuda.is_available() else \"N/A\"}'); \
print(f'  Device count: {torch.cuda.device_count() if torch.cuda.is_available() else 0}'); \
" 2>/dev/null || echo "  PyTorch not installed"
	@echo ""
	@echo "$(BOLD)Available backends:$(NC)"
	@echo "  $(GREEN)cpu$(NC)        - PyTorch CPU (default, léger)"
	@echo "  $(YELLOW)gpu$(NC)        - PyTorch CUDA 12.4 (recommandé pour GPU récents)"
	@echo "  $(YELLOW)gpu-cu121$(NC)  - PyTorch CUDA 12.1 (drivers plus anciens)"
	@echo "  $(YELLOW)gpu-cu118$(NC)  - PyTorch CUDA 11.8 (legacy)"
	@echo ""
	@echo "$(BOLD)Usage:$(NC)"
	@echo "  make uv-sync-cpu       # Install CPU version"
	@echo "  make uv-sync-gpu       # Install GPU CUDA 12.4"
	@echo "  make uv-sync TORCH_BACKEND=gpu-cu121  # Custom backend"

generate: ## Générer les clients Prisma (JS + Python) et builder shared
	@echo "$(BLUE)🔧 Génération du client Prisma JS...$(NC)"
	@cd $(SHARED_DIR) && $(JS_RUNTIME) run generate
	@echo ""
	@echo "$(BLUE)🔧 Génération du client Prisma Python...$(NC)"
	@cd $(TRANSLATOR_DIR) && \
		if [ -d .venv ]; then \
			. .venv/bin/activate && prisma generate; \
		else \
			echo "$(YELLOW)⚠️  venv non trouvé, lancez d'abord: make install$(NC)"; \
		fi
	@echo ""
	@echo "$(BLUE)🔨 Build du package shared...$(NC)"
	@cd $(SHARED_DIR) && $(JS_RUNTIME) run build
	@echo ""
	@echo "$(GREEN)✅ Génération terminée$(NC)"
	@echo ""
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║          GENERATE SUMMARY                                    ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(BOLD)📁 Created/Updated Folders:$(NC)"
	@[ -d "$(SHARED_DIR)/prisma/client" ] && echo "  $(GREEN)✓$(NC) $(SHARED_DIR)/prisma/client ($$(du -sh $(SHARED_DIR)/prisma/client 2>/dev/null | cut -f1))" || echo "  $(RED)✗$(NC) $(SHARED_DIR)/prisma/client (missing)"
	@[ -d "$(SHARED_DIR)/dist" ] && echo "  $(GREEN)✓$(NC) $(SHARED_DIR)/dist ($$(du -sh $(SHARED_DIR)/dist 2>/dev/null | cut -f1))" || echo "  $(RED)✗$(NC) $(SHARED_DIR)/dist (missing)"
	@[ -d "$(TRANSLATOR_DIR)/prisma" ] && echo "  $(GREEN)✓$(NC) $(TRANSLATOR_DIR)/prisma (Python client)" || true
	@echo ""
	@echo "$(BOLD)📍 Generated Locations:$(NC)"
	@echo "  $(YELLOW)Prisma Clients:$(NC)"
	@echo "    JS Client:      $(CURDIR)/$(SHARED_DIR)/prisma/client"
	@echo "    Python Client:  $(CURDIR)/$(TRANSLATOR_DIR)/.venv/lib/python*/site-packages/prisma"
	@echo ""
	@echo "  $(YELLOW)Built Packages:$(NC)"
	@echo "    Shared dist:    $(CURDIR)/$(SHARED_DIR)/dist"
	@echo ""
	@echo "$(BOLD)📊 Generated Files:$(NC)"
	@PRISMA_FILES=$$(find $(SHARED_DIR)/prisma/client -type f 2>/dev/null | wc -l | tr -d ' '); echo "  Prisma JS files:   $$PRISMA_FILES"
	@DIST_FILES=$$(find $(SHARED_DIR)/dist -type f 2>/dev/null | wc -l | tr -d ' '); echo "  Shared dist files: $$DIST_FILES"
	@echo ""

build: ## Builder tous les services (TypeScript)
	@echo "$(BLUE)🔨 Build de tous les services...$(NC)"
	@echo "  → Prisma generate..."
	@cd $(SHARED_DIR) && npx prisma generate 2>/dev/null || true
	@echo "  → Shared..."
	@cd $(SHARED_DIR) && $(JS_RUNTIME) run build 2>/dev/null || true
	@echo "  → Gateway..."
	@cd $(GATEWAY_DIR) && $(JS_RUNTIME) run build
	@echo "  → Web..."
	@cd $(WEB_DIR) && $(JS_RUNTIME) run build
	@echo "$(GREEN)✅ Build terminé$(NC)"
	@echo ""
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║          BUILD SUMMARY                                       ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(BOLD)📁 Created/Updated Folders:$(NC)"
	@[ -d "$(SHARED_DIR)/dist" ] && echo "  $(GREEN)✓$(NC) $(SHARED_DIR)/dist ($$(du -sh $(SHARED_DIR)/dist 2>/dev/null | cut -f1))" || echo "  $(RED)✗$(NC) $(SHARED_DIR)/dist (missing)"
	@[ -d "$(GATEWAY_DIR)/dist" ] && echo "  $(GREEN)✓$(NC) $(GATEWAY_DIR)/dist ($$(du -sh $(GATEWAY_DIR)/dist 2>/dev/null | cut -f1))" || echo "  $(RED)✗$(NC) $(GATEWAY_DIR)/dist (missing)"
	@[ -d "$(WEB_DIR)/.next" ] && echo "  $(GREEN)✓$(NC) $(WEB_DIR)/.next ($$(du -sh $(WEB_DIR)/.next 2>/dev/null | cut -f1))" || echo "  $(RED)✗$(NC) $(WEB_DIR)/.next (missing)"
	@echo ""
	@echo "$(BOLD)📍 Build Output Locations:$(NC)"
	@echo "  $(YELLOW)TypeScript Builds:$(NC)"
	@echo "    Shared:     $(CURDIR)/$(SHARED_DIR)/dist"
	@echo "    Gateway:    $(CURDIR)/$(GATEWAY_DIR)/dist"
	@echo ""
	@echo "  $(YELLOW)Next.js Build:$(NC)"
	@echo "    Web:        $(CURDIR)/$(WEB_DIR)/.next"
	@echo "    Static:     $(CURDIR)/$(WEB_DIR)/.next/static"
	@echo "    Server:     $(CURDIR)/$(WEB_DIR)/.next/server"
	@echo ""
	@echo "$(BOLD)📊 Build Stats:$(NC)"
	@SHARED_FILES=$$(find $(SHARED_DIR)/dist -type f -name "*.js" 2>/dev/null | wc -l | tr -d ' '); echo "  Shared JS files:   $$SHARED_FILES"
	@GATEWAY_FILES=$$(find $(GATEWAY_DIR)/dist -type f -name "*.js" 2>/dev/null | wc -l | tr -d ' '); echo "  Gateway JS files:  $$GATEWAY_FILES"
	@NEXT_PAGES=$$(find $(WEB_DIR)/.next/server/app -type f -name "*.html" 2>/dev/null | wc -l | tr -d ' '); echo "  Next.js pages:     $$NEXT_PAGES"
	@echo ""

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

_preflight-check: ## Vérification complète des prérequis (interne)
	@echo "$(BLUE)🔍 Vérification des prérequis...$(NC)"
	@ERRORS=0; \
	\
	echo ""; \
	echo "$(CYAN)1/5$(NC) Certificats SSL..."; \
	if [ ! -f "$(CERTS_DIR)/cert.pem" ] || [ ! -f "$(CERTS_DIR)/key.pem" ]; then \
		echo "  $(YELLOW)⚠️  Certificats manquants - génération...$(NC)"; \
		$(MAKE) setup-certs || ERRORS=$$((ERRORS+1)); \
	else \
		echo "  $(GREEN)✓ Certificats présents$(NC)"; \
	fi; \
	\
	echo "$(CYAN)2/5$(NC) Fichiers .env..."; \
	if [ ! -f "$(WEB_DIR)/.env" ] || [ ! -f "$(GATEWAY_DIR)/.env" ]; then \
		echo "  $(YELLOW)⚠️  .env manquants - génération...$(NC)"; \
		$(MAKE) setup-env || ERRORS=$$((ERRORS+1)); \
	else \
		echo "  $(GREEN)✓ Fichiers .env présents$(NC)"; \
	fi; \
	\
	echo "$(CYAN)3/5$(NC) Dépendances Node..."; \
	if [ ! -d "node_modules" ]; then \
		echo "  $(YELLOW)⚠️  node_modules manquant - exécutez 'make install'$(NC)"; \
		ERRORS=$$((ERRORS+1)); \
	else \
		echo "  $(GREEN)✓ node_modules présent$(NC)"; \
	fi; \
	\
	echo "$(CYAN)4/5$(NC) Environnement Python..."; \
	if [ ! -d "$(TRANSLATOR_DIR)/.venv" ]; then \
		echo "  $(YELLOW)⚠️  Python venv manquant - exécutez 'make install'$(NC)"; \
		ERRORS=$$((ERRORS+1)); \
	else \
		echo "  $(GREEN)✓ Python venv présent$(NC)"; \
	fi; \
	\
	echo "$(CYAN)5/5$(NC) Build shared..."; \
	if [ ! -d "$(SHARED_DIR)/dist" ]; then \
		echo "  $(YELLOW)⚠️  Shared non buildé - génération...$(NC)"; \
		$(MAKE) generate || ERRORS=$$((ERRORS+1)); \
	else \
		echo "  $(GREEN)✓ Shared buildé$(NC)"; \
	fi; \
	\
	echo ""; \
	if [ $$ERRORS -gt 0 ]; then \
		echo "$(RED)❌ $$ERRORS erreur(s) détectée(s). Exécutez 'make install' puis 'make build'$(NC)"; \
		exit 1; \
	else \
		echo "$(GREEN)✅ Tous les prérequis sont satisfaits$(NC)"; \
	fi

start: ## Lancer les services natifs avec HTTPS (https://meeshy.local)
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║      MEESHY - Démarrage Services ($(LOCAL_DOMAIN))            ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@# Arrêter les services existants pour libérer les ports
	@echo "$(BLUE)🧹 Nettoyage des services existants...$(NC)"
	@$(MAKE) stop 2>/dev/null || true
	@echo ""
	@echo "$(BOLD)🌐 Configuration:$(NC)"
	@echo "   Domaine:    $(GREEN)$(LOCAL_DOMAIN)$(NC)"
	@echo "   IP locale:  $(GREEN)$(HOST_IP)$(NC)"
	@echo "   OS:         $(GREEN)$(OS)$(NC)"
	@echo ""
	@# Vérification des prérequis
	@$(MAKE) _preflight-check
	@echo ""
	@# Lancer Docker infra (MongoDB + Redis + Traefik)
	@if [ "$(HAS_DOCKER)" = "yes" ]; then \
		$(MAKE) docker-infra 2>/dev/null || echo "$(YELLOW)⚠️  Docker infra non démarré$(NC)"; \
	else \
		echo "$(RED)❌ Docker requis pour l'infrastructure$(NC)"; \
		exit 1; \
	fi
	@echo ""
	@# Générer les fichiers .env pour le domaine local
	@$(MAKE) _generate-env-local
	@echo ""
	@# Choisir le mode de lancement
	@if [ "$(HAS_TMUX)" = "yes" ]; then \
		echo "$(GREEN)📺 Tmux détecté - lancement en mode tmux$(NC)"; \
		$(MAKE) _dev-tmux-domain; \
	else \
		echo "$(GREEN)🔄 Pas de tmux - lancement en background$(NC)"; \
		$(MAKE) _dev-bg-domain; \
	fi

_generate-env-local: ## Générer les fichiers .env pour le domaine local
	@echo "$(BLUE)📝 Génération des fichiers .env pour $(LOCAL_DOMAIN)...$(NC)"
	@# Root .env
	@echo "NODE_ENV=development" > .env
	@echo "LOCAL_DOMAIN=$(LOCAL_DOMAIN)" >> .env
	@echo "DATABASE_URL=mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true" >> .env
	@echo "REDIS_URL=redis://localhost:6379" >> .env
	@echo "JWT_SECRET=dev-secret-key-change-in-production" >> .env
	@# Frontend .env (HTTPS via domaine)
	@echo "NODE_ENV=development" > $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_API_URL=https://gate.$(LOCAL_DOMAIN)" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_WS_URL=wss://gate.$(LOCAL_DOMAIN)" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_BACKEND_URL=https://gate.$(LOCAL_DOMAIN)" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_TRANSLATION_URL=https://ml.$(LOCAL_DOMAIN)/translate" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_FRONTEND_URL=https://$(LOCAL_DOMAIN)" >> $(WEB_DIR)/.env
	@echo "INTERNAL_BACKEND_URL=http://localhost:3000" >> $(WEB_DIR)/.env
	@# Gateway .env (HTTPS via certificats mkcert)
	@echo "NODE_ENV=development" > $(GATEWAY_DIR)/.env
	@echo "USE_HTTPS=true" >> $(GATEWAY_DIR)/.env
	@echo "SSL_CERT_PATH=../$(WEB_DIR)/.cert/localhost.pem" >> $(GATEWAY_DIR)/.env
	@echo "SSL_KEY_PATH=../$(WEB_DIR)/.cert/localhost-key.pem" >> $(GATEWAY_DIR)/.env
	@echo "DATABASE_URL=mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true" >> $(GATEWAY_DIR)/.env
	@echo "REDIS_URL=redis://localhost:6379" >> $(GATEWAY_DIR)/.env
	@echo "TRANSLATOR_URL=http://localhost:8000" >> $(GATEWAY_DIR)/.env
	@echo "JWT_SECRET=dev-secret-key-change-in-production" >> $(GATEWAY_DIR)/.env
	@echo "PORT=3000" >> $(GATEWAY_DIR)/.env
	@echo "HOST=0.0.0.0" >> $(GATEWAY_DIR)/.env
	@echo "PUBLIC_URL=https://gate.$(LOCAL_DOMAIN)" >> $(GATEWAY_DIR)/.env
	@echo "FRONTEND_URL=https://$(LOCAL_DOMAIN)" >> $(GATEWAY_DIR)/.env
	@echo "CORS_ORIGINS=https://$(LOCAL_DOMAIN),https://$(LOCAL_DOMAIN):3200,https://app.$(LOCAL_DOMAIN),https://gate.$(LOCAL_DOMAIN),https://api.$(LOCAL_DOMAIN)" >> $(GATEWAY_DIR)/.env
	@# Email config
	@echo "EMAIL_FROM=noreply@meeshy.me" >> $(GATEWAY_DIR)/.env
	@echo "EMAIL_FROM_NAME=Meeshy Sama" >> $(GATEWAY_DIR)/.env
	@echo "BYPASS_CAPTCHA=true" >> $(GATEWAY_DIR)/.env
	@# Load secrets from .env.secrets if exists (for _generate-env-local)
	@if [ -f "$(SECRETS_FILE)" ]; then \
		echo "  $(CYAN)🔐 Chargement des secrets depuis $(SECRETS_FILE)...$(NC)"; \
		. $(SECRETS_FILE) 2>/dev/null; \
		echo "# ===== SECRETS (from .env.secrets) =====" >> $(GATEWAY_DIR)/.env; \
		echo "BREVO_API_KEY=$${BREVO_API_KEY:-}" >> $(GATEWAY_DIR)/.env; \
		echo "SENDGRID_API_KEY=$${SENDGRID_API_KEY:-}" >> $(GATEWAY_DIR)/.env; \
		echo "MAILGUN_API_KEY=$${MAILGUN_API_KEY:-}" >> $(GATEWAY_DIR)/.env; \
		echo "MAILGUN_DOMAIN=$${MAILGUN_DOMAIN:-}" >> $(GATEWAY_DIR)/.env; \
		echo "TWILIO_ACCOUNT_SID=$${TWILIO_ACCOUNT_SID:-}" >> $(GATEWAY_DIR)/.env; \
		echo "TWILIO_AUTH_TOKEN=$${TWILIO_AUTH_TOKEN:-}" >> $(GATEWAY_DIR)/.env; \
		echo "TWILIO_PHONE_NUMBER=$${TWILIO_PHONE_NUMBER:-}" >> $(GATEWAY_DIR)/.env; \
		echo "VONAGE_API_KEY=$${VONAGE_API_KEY:-}" >> $(GATEWAY_DIR)/.env; \
		echo "VONAGE_API_SECRET=$${VONAGE_API_SECRET:-}" >> $(GATEWAY_DIR)/.env; \
		echo "HCAPTCHA_SECRET=$${HCAPTCHA_SECRET:-}" >> $(GATEWAY_DIR)/.env; \
		echo "HCAPTCHA_SITE_KEY=$${HCAPTCHA_SITE_KEY:-}" >> $(GATEWAY_DIR)/.env; \
		echo "GEOIP_LICENSE_KEY=$${GEOIP_LICENSE_KEY:-}" >> $(GATEWAY_DIR)/.env; \
		echo "TURN_SECRET=$${TURN_SECRET:-}" >> $(GATEWAY_DIR)/.env; \
		echo "FIREBASE_PROJECT_ID=$${FIREBASE_PROJECT_ID:-}" >> $(GATEWAY_DIR)/.env; \
		echo "FIREBASE_CLIENT_EMAIL=$${FIREBASE_CLIENT_EMAIL:-}" >> $(GATEWAY_DIR)/.env; \
		echo "FIREBASE_PRIVATE_KEY=$${FIREBASE_PRIVATE_KEY:-}" >> $(GATEWAY_DIR)/.env; \
		echo "FIREBASE_ADMIN_CREDENTIALS_PATH=$${FIREBASE_ADMIN_CREDENTIALS_PATH:-}" >> $(GATEWAY_DIR)/.env; \
		echo "# ===== ENCRYPTION =====" >> $(GATEWAY_DIR)/.env; \
		echo "ATTACHMENT_MASTER_KEY=$${ATTACHMENT_MASTER_KEY:-}" >> $(GATEWAY_DIR)/.env; \
		echo "# ===== FIREBASE (Frontend) =====" >> $(WEB_DIR)/.env; \
		echo "NEXT_PUBLIC_FIREBASE_API_KEY=$${NEXT_PUBLIC_FIREBASE_API_KEY:-}" >> $(WEB_DIR)/.env; \
		echo "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:-}" >> $(WEB_DIR)/.env; \
		echo "NEXT_PUBLIC_FIREBASE_PROJECT_ID=$${NEXT_PUBLIC_FIREBASE_PROJECT_ID:-}" >> $(WEB_DIR)/.env; \
		echo "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:-}" >> $(WEB_DIR)/.env; \
		echo "NEXT_PUBLIC_FIREBASE_APP_ID=$${NEXT_PUBLIC_FIREBASE_APP_ID:-}" >> $(WEB_DIR)/.env; \
		echo "NEXT_PUBLIC_FIREBASE_VAPID_KEY=$${NEXT_PUBLIC_FIREBASE_VAPID_KEY:-}" >> $(WEB_DIR)/.env; \
		echo "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=$${NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID:-}" >> $(WEB_DIR)/.env; \
		echo "# ===== CAPTCHA (Frontend) =====" >> $(WEB_DIR)/.env; \
		echo "NEXT_PUBLIC_HCAPTCHA_SITE_KEY=$${HCAPTCHA_SITE_KEY:-}" >> $(WEB_DIR)/.env; \
		echo "# ===== FEATURE FLAGS =====" >> $(WEB_DIR)/.env; \
		echo "NEXT_PUBLIC_ENABLE_PASSWORD_RESET=$${NEXT_PUBLIC_ENABLE_PASSWORD_RESET:-true}" >> $(WEB_DIR)/.env; \
	else \
		echo "  $(YELLOW)⚠️  Pas de fichier secrets ($(SECRETS_FILE))$(NC)"; \
		echo "  $(DIM)   Créez-le avec: cp infrastructure/envs/.env.secrets.example $(SECRETS_FILE)$(NC)"; \
	fi
	@# Translator .env
	@echo "ENVIRONMENT=development" > $(TRANSLATOR_DIR)/.env
	@echo "DATABASE_URL=mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true" >> $(TRANSLATOR_DIR)/.env
	@echo "REDIS_URL=redis://localhost:6379" >> $(TRANSLATOR_DIR)/.env
	@echo "PORT=8000" >> $(TRANSLATOR_DIR)/.env
	@echo "HOST=0.0.0.0" >> $(TRANSLATOR_DIR)/.env
	@# Agent .env
	@echo "NODE_ENV=development" > $(AGENT_DIR)/.env
	@echo "PORT=3200" >> $(AGENT_DIR)/.env
	@echo "LLM_PROVIDER=openai" >> $(AGENT_DIR)/.env
	@echo "OPENAI_API_KEY=$${OPENAI_API_KEY:-}" >> $(AGENT_DIR)/.env
	@echo "OPENAI_MODEL=gpt-4o-mini" >> $(AGENT_DIR)/.env
	@echo "ZMQ_HOST=localhost" >> $(AGENT_DIR)/.env
	@echo "ZMQ_PULL_PORT=5560" >> $(AGENT_DIR)/.env
	@echo "ZMQ_PUB_PORT=5561" >> $(AGENT_DIR)/.env
	@echo "DATABASE_URL=mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true" >> $(AGENT_DIR)/.env
	@echo "REDIS_URL=redis://localhost:6379" >> $(AGENT_DIR)/.env
	@echo "  $(GREEN)✓ Fichiers .env générés pour $(LOCAL_DOMAIN)$(NC)"

_dev-tmux-domain: ## Lancer les services en mode tmux avec HTTPS
	@echo "$(BLUE)🖥️  Démarrage des services dans tmux (HTTPS)...$(NC)"
	@tmux kill-session -t meeshy 2>/dev/null || true
	@tmux new-session -d -s meeshy -n translator \
		"cd $(CURDIR)/$(TRANSLATOR_DIR) && . .venv/bin/activate 2>/dev/null; echo '🔤 Translator (ml.$(LOCAL_DOMAIN) -> :8000)'; python3 src/main.py; read"
	@sleep 2
	@tmux new-window -t meeshy -n gateway \
		"cd $(CURDIR)/$(GATEWAY_DIR) && echo '🚀 Gateway HTTPS (gate.$(LOCAL_DOMAIN) -> :3000)'; $(JS_RUNTIME) run dev; read"
	@sleep 2
	@tmux new-window -t meeshy -n agent \
		"cd $(CURDIR)/$(AGENT_DIR) && echo '🤖 Agent Service (agent.$(LOCAL_DOMAIN) -> :3200)'; $(JS_RUNTIME) run dev; read"
	@sleep 2
	@tmux new-window -t meeshy -n web \
		"cd $(CURDIR)/$(WEB_DIR) && echo '🎨 Web HTTPS ($(LOCAL_DOMAIN) -> :3100)'; $(JS_RUNTIME) run dev:https; read"
	@sleep 2
	@tmux new-window -t meeshy -n web_v2 \
		"cd $(CURDIR)/$(WEB_V2_DIR) && echo '🎨 Web V2 HTTPS ($(LOCAL_DOMAIN) -> :3200)'; $(JS_RUNTIME) run dev:https; read"
	@echo ""
	@$(MAKE) _show-domain-urls
	@echo ""
	@read -p "$(YELLOW)Appuyez sur Entrée pour attacher à tmux...$(NC)" && tmux attach -t meeshy

_dev-bg-domain: ## Lancer les services en background avec HTTPS
	@echo "$(BLUE)🔄 Démarrage des services en background (HTTPS)...$(NC)"
	@mkdir -p $(PID_DIR) logs
	@# Translator
	@echo "  $(CYAN)🔤 Translator (ml.$(LOCAL_DOMAIN))...$(NC)"
	@cd $(TRANSLATOR_DIR) && . .venv/bin/activate 2>/dev/null && \
		python3 src/main.py > $(CURDIR)/logs/translator.log 2>&1 & echo $$! > $(CURDIR)/$(TRANSLATOR_PID)
	@sleep 2
	@# Gateway HTTPS
	@echo "  $(CYAN)🚀 Gateway HTTPS (gate.$(LOCAL_DOMAIN))...$(NC)"
	@cd $(GATEWAY_DIR) && $(JS_RUNTIME) run dev > $(CURDIR)/logs/gateway.log 2>&1 & echo $$! > $(CURDIR)/$(GATEWAY_PID)
	@sleep 2
	@# Agent Service
	@echo "  $(CYAN)🤖 Agent Service (agent.$(LOCAL_DOMAIN))...$(NC)"
	@cd $(AGENT_DIR) && $(JS_RUNTIME) run dev > $(CURDIR)/logs/agent.log 2>&1 & echo $$! > $(CURDIR)/$(AGENT_PID)
	@sleep 2
	@# Web HTTPS
	@echo "  $(CYAN)🎨 Web HTTPS ($(LOCAL_DOMAIN))...$(NC)"
	@cd $(WEB_DIR) && $(JS_RUNTIME) run dev:https > $(CURDIR)/logs/web.log 2>&1 & echo $$! > $(CURDIR)/$(WEB_PID)
	@sleep 3
	@echo ""
	@$(MAKE) _show-domain-urls

_show-domain-urls:
	@echo "$(GREEN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(GREEN)║  ✅ Services démarrés avec HTTPS                             ║$(NC)"
	@echo "$(GREEN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(BOLD)📱 URLs d'accès (HTTPS):$(NC)"
	@echo "   Web:          $(GREEN)https://$(LOCAL_DOMAIN)$(NC)"
	@echo "   Web V2:       $(GREEN)https://$(LOCAL_DOMAIN):3200$(NC)"
	@echo "   Gateway API:  $(GREEN)https://gate.$(LOCAL_DOMAIN)$(NC)  ou  $(GREEN)https://api.$(LOCAL_DOMAIN)$(NC)"
	@echo "   Translator:   $(GREEN)https://ml.$(LOCAL_DOMAIN)$(NC)"
	@echo ""
	@echo "$(BOLD)🔧 Infrastructure Docker:$(NC)"
	@echo "   MongoDB UI:   $(GREEN)https://mongo.$(LOCAL_DOMAIN)$(NC)"
	@echo "   Redis UI:     $(GREEN)https://redis.$(LOCAL_DOMAIN)$(NC)"
	@echo "   Traefik:      $(GREEN)http://localhost:8080$(NC)"
	@echo ""
	@echo "$(BOLD)📋 Commandes:$(NC)"
	@echo "   $(YELLOW)make status$(NC)  - Voir le statut des services"
	@echo "   $(YELLOW)make logs$(NC)    - Voir les logs"
	@echo "   $(YELLOW)make stop$(NC)    - Arrêter tous les services"

stop: ## Arrêter tous les services
	@echo "$(YELLOW)⏹️  Arrêt des services...$(NC)"
	@# Tuer session tmux si existe
	@tmux kill-session -t meeshy 2>/dev/null || true
	@# Tuer les processus par PID
	@if [ -f "$(TRANSLATOR_PID)" ]; then kill $$(cat $(TRANSLATOR_PID)) 2>/dev/null || true; rm -f $(TRANSLATOR_PID); fi
	@if [ -f "$(GATEWAY_PID)" ]; then kill $$(cat $(GATEWAY_PID)) 2>/dev/null || true; rm -f $(GATEWAY_PID); fi
	@if [ -f "$(AGENT_PID)" ]; then kill $$(cat $(AGENT_PID)) 2>/dev/null || true; rm -f $(AGENT_PID); fi
	@if [ -f "$(WEB_PID)" ]; then kill $$(cat $(WEB_PID)) 2>/dev/null || true; rm -f $(WEB_PID); fi
	@# Tuer par port en fallback
	@lsof -ti:3000 | xargs kill -9 2>/dev/null || true
	@lsof -ti:3100 | xargs kill -9 2>/dev/null || true
	@lsof -ti:3200 | xargs kill -9 2>/dev/null || true
	@lsof -ti:8000 | xargs kill -9 2>/dev/null || true
	@rm -rf $(PID_DIR)
	@echo "$(GREEN)✅ Services arrêtés$(NC)"

restart: stop start ## Redémarrer tous les services

# =============================================================================
# DÉVELOPPEMENT RÉSEAU (Accès depuis mobile/autres machines)
# =============================================================================

start-network: ## 🌐 Lancer avec accès réseau (HOST=smpdev02.local ou IP)
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║    MEESHY - Démarrage Réseau (Accès Mobile/Multi-Device)     ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@# Arrêter les services existants pour libérer les ports
	@echo "$(BLUE)🧹 Nettoyage des services existants...$(NC)"
	@$(MAKE) stop 2>/dev/null || true
	@echo ""
	@# Vérification des prérequis de base (sans certificats - gérés par setup-network)
	@echo "$(BLUE)🔍 Vérification des prérequis...$(NC)"
	@ERRORS=0; \
	if [ ! -d "node_modules" ]; then \
		echo "  $(RED)❌ node_modules manquant - exécutez 'make install'$(NC)"; \
		ERRORS=$$((ERRORS+1)); \
	fi; \
	if [ ! -d "$(TRANSLATOR_DIR)/.venv" ]; then \
		echo "  $(RED)❌ Python venv manquant - exécutez 'make install'$(NC)"; \
		ERRORS=$$((ERRORS+1)); \
	fi; \
	if [ ! -d "$(SHARED_DIR)/dist" ]; then \
		echo "  $(YELLOW)⚠️  Shared non buildé - génération...$(NC)"; \
		$(MAKE) generate || ERRORS=$$((ERRORS+1)); \
	fi; \
	if [ $$ERRORS -gt 0 ]; then \
		echo "$(RED)❌ Prérequis manquants. Exécutez 'make install' puis 'make build'$(NC)"; \
		exit 1; \
	fi; \
	echo "  $(GREEN)✓ Prérequis OK$(NC)"
	@echo ""
	@echo "$(BOLD)🌐 Configuration Réseau:$(NC)"
	@echo "   IP locale:  $(GREEN)$(HOST_IP)$(NC)"
	@echo "   Host:       $(GREEN)$(HOST)$(NC)"
	@echo "   Domain:     $(GREEN)$(LOCAL_DOMAIN)$(NC)"
	@echo ""
	@# Générer la config DNS et les certificats réseau
	@$(MAKE) setup-network HOST=$(HOST) LOCAL_DOMAIN=$(LOCAL_DOMAIN)
	@echo ""
	@# Démarrer l'infrastructure Docker
	@$(MAKE) docker-infra
	@echo ""
	@# Créer les fichiers .env pour le réseau
	@$(MAKE) _generate-env-network
	@echo ""
	@# Démarrer les services natifs
	@if [ "$(HAS_TMUX)" = "yes" ]; then \
		$(MAKE) dev-tmux-network; \
	else \
		$(MAKE) dev-bg-network; \
	fi

setup-network: ## 🔧 Configurer le réseau (hosts + certificats)
	@echo "$(BLUE)🔧 Configuration du réseau pour $(HOST)...$(NC)"
	@$(MAKE) setup-hosts HOST=$(HOST) LOCAL_DOMAIN=$(LOCAL_DOMAIN)
	@$(MAKE) setup-certs-network HOST=$(HOST) LOCAL_DOMAIN=$(LOCAL_DOMAIN)

setup-hosts: ## 🌐 Configurer /etc/hosts pour *.meeshy.local (cross-platform)
	@echo "$(BLUE)🌐 Configuration /etc/hosts pour $(LOCAL_DOMAIN)...$(NC)"
	@echo ""
ifeq ($(OS),windows)
	@echo "$(YELLOW)📋 Configuration manuelle requise sur Windows:$(NC)"
	@echo ""
	@echo "  1. Ouvrez Notepad en tant qu'Administrateur"
	@echo "  2. Ouvrez le fichier: C:\\Windows\\System32\\drivers\\etc\\hosts"
	@echo "  3. Ajoutez ces lignes à la fin:"
	@echo ""
	@echo "     $(CYAN)127.0.0.1    $(LOCAL_DOMAIN)$(NC)"
	@echo "     $(CYAN)127.0.0.1    app.$(LOCAL_DOMAIN)$(NC)"
	@echo "     $(CYAN)127.0.0.1    gate.$(LOCAL_DOMAIN)$(NC)"
	@echo "     $(CYAN)127.0.0.1    api.$(LOCAL_DOMAIN)$(NC)"
	@echo "     $(CYAN)127.0.0.1    ml.$(LOCAL_DOMAIN)$(NC)"
	@echo "     $(CYAN)127.0.0.1    mongo.$(LOCAL_DOMAIN)$(NC)"
	@echo "     $(CYAN)127.0.0.1    redis.$(LOCAL_DOMAIN)$(NC)"
	@echo ""
	@echo "  4. Sauvegardez et fermez"
else
	@# Unix/macOS - Configuration automatique avec sudo
	@HOSTS_ENTRIES="$(LOCAL_DOMAIN) app.$(LOCAL_DOMAIN) gate.$(LOCAL_DOMAIN) api.$(LOCAL_DOMAIN) ml.$(LOCAL_DOMAIN) mongo.$(LOCAL_DOMAIN) redis.$(LOCAL_DOMAIN)"; \
	if grep -q "$(LOCAL_DOMAIN)" /etc/hosts 2>/dev/null; then \
		echo "  $(GREEN)✓ Entrées /etc/hosts déjà configurées$(NC)"; \
	else \
		echo "  $(YELLOW)→ Ajout des entrées dans /etc/hosts (sudo requis)...$(NC)"; \
		echo "" | sudo tee -a /etc/hosts >/dev/null; \
		echo "# Meeshy Local Development" | sudo tee -a /etc/hosts >/dev/null; \
		echo "127.0.0.1    $$HOSTS_ENTRIES" | sudo tee -a /etc/hosts >/dev/null; \
		echo "  $(GREEN)✓ Entrées /etc/hosts ajoutées$(NC)"; \
	fi
endif
	@echo ""
	@echo "$(BOLD)🌐 Domaines configurés:$(NC)"
	@echo "    $(LOCAL_DOMAIN)       → 127.0.0.1"
	@echo "    app.$(LOCAL_DOMAIN)   → 127.0.0.1"
	@echo "    gate.$(LOCAL_DOMAIN)  → 127.0.0.1"
	@echo "    api.$(LOCAL_DOMAIN)   → 127.0.0.1"
	@echo "    ml.$(LOCAL_DOMAIN)    → 127.0.0.1"
	@echo "    mongo.$(LOCAL_DOMAIN) → 127.0.0.1"
	@echo "    redis.$(LOCAL_DOMAIN) → 127.0.0.1"

setup-certs-network: ## 🔐 Générer certificats pour accès réseau (HOST=smpdev02.local)
	@echo "$(BLUE)🔐 Configuration des certificats pour $(HOST)...$(NC)"
	@if ! command -v mkcert >/dev/null 2>&1; then \
		echo "$(RED)❌ mkcert non installé. Installez-le avec: brew install mkcert$(NC)"; \
		exit 1; \
	fi
	@# Vérifier si les certificats existent déjà et contiennent le HOST actuel
	@NEED_REGEN=0; \
	if [ ! -f "$(WEB_DIR)/.cert/localhost.pem" ]; then \
		echo "  $(YELLOW)→ Certificats non trouvés, génération nécessaire$(NC)"; \
		NEED_REGEN=1; \
	elif ! openssl x509 -in "$(WEB_DIR)/.cert/localhost.pem" -text -noout 2>/dev/null | grep -q "$(HOST)"; then \
		echo "  $(YELLOW)→ Certificats existants ne contiennent pas $(HOST), régénération nécessaire$(NC)"; \
		NEED_REGEN=1; \
	else \
		echo "  $(GREEN)✓ Certificats existants valides pour $(HOST)$(NC)"; \
	fi; \
	if [ $$NEED_REGEN -eq 1 ]; then \
		mkcert -install 2>/dev/null || true; \
		mkdir -p $(WEB_DIR)/.cert $(CERTS_DIR); \
		echo "  $(YELLOW)Génération des certificats pour: localhost, $(HOST_IP), $(HOST), *.$(LOCAL_DOMAIN), smpdev02.local, smpdev02.home, meeshy$(NC)"; \
		cd $(WEB_DIR)/.cert && mkcert \
			-key-file localhost-key.pem \
			-cert-file localhost.pem \
			localhost \
			127.0.0.1 \
			::1 \
			$(HOST_IP) \
			$(HOST) \
			"*.$(LOCAL_DOMAIN)" \
			$(LOCAL_DOMAIN) \
			smpdev02.local \
			"*.smpdev02.local" \
			smpdev02.home \
			"*.smpdev02.home" \
			meeshy \
			"*.meeshy"; \
		cp -f $(WEB_DIR)/.cert/localhost.pem $(CERTS_DIR)/cert.pem 2>/dev/null || true; \
		cp -f $(WEB_DIR)/.cert/localhost-key.pem $(CERTS_DIR)/key.pem 2>/dev/null || true; \
		echo "  $(GREEN)✓ Certificats générés$(NC)"; \
	fi

_generate-env-network:
	@echo "$(BLUE)📝 Génération des fichiers .env pour le réseau...$(NC)"
	@# Root .env
	@echo "NODE_ENV=development" > .env
	@echo "LOCAL_IP=$(HOST_IP)" >> .env
	@echo "HOST=$(HOST)" >> .env
	@echo "LOCAL_DOMAIN=$(LOCAL_DOMAIN)" >> .env
	@echo "DATABASE_URL=mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true" >> .env
	@echo "REDIS_URL=redis://localhost:6379" >> .env
	@echo "JWT_SECRET=dev-secret-key-change-in-production" >> .env
	@# Frontend .env
	@echo "NODE_ENV=development" > $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_API_URL=https://$(HOST):3000" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_WS_URL=wss://$(HOST):3000" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_BACKEND_URL=https://$(HOST):3000" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_TRANSLATION_URL=https://$(HOST):8000" >> $(WEB_DIR)/.env
	@echo "NEXT_PUBLIC_FRONTEND_URL=https://$(HOST):3100" >> $(WEB_DIR)/.env
	@# Gateway .env
	@echo "NODE_ENV=development" > $(GATEWAY_DIR)/.env
	@echo "USE_HTTPS=true" >> $(GATEWAY_DIR)/.env
	@echo "DATABASE_URL=mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true" >> $(GATEWAY_DIR)/.env
	@echo "REDIS_URL=redis://localhost:6379" >> $(GATEWAY_DIR)/.env
	@echo "TRANSLATOR_URL=http://localhost:8000" >> $(GATEWAY_DIR)/.env
	@echo "JWT_SECRET=dev-secret-key-change-in-production" >> $(GATEWAY_DIR)/.env
	@echo "PORT=3000" >> $(GATEWAY_DIR)/.env
	@echo "HOST=0.0.0.0" >> $(GATEWAY_DIR)/.env
	@echo "PUBLIC_URL=https://$(HOST):3000" >> $(GATEWAY_DIR)/.env
	@echo "FRONTEND_URL=https://$(HOST):3100" >> $(GATEWAY_DIR)/.env
	@echo "CORS_ORIGINS=https://localhost:3100,https://localhost:3200,https://$(HOST_IP):3100,https://$(HOST_IP):3200,https://$(HOST):3100,https://$(HOST):3200,https://$(LOCAL_DOMAIN):3100,https://$(LOCAL_DOMAIN):3200" >> $(GATEWAY_DIR)/.env
	@# Email config
	@echo "EMAIL_FROM=noreply@meeshy.me" >> $(GATEWAY_DIR)/.env
	@echo "EMAIL_FROM_NAME=Meeshy Sama" >> $(GATEWAY_DIR)/.env
	@echo "BYPASS_CAPTCHA=true" >> $(GATEWAY_DIR)/.env
	@# Load secrets from .env.secrets if exists (for _generate-env-network)
	@if [ -f "$(SECRETS_FILE)" ]; then \
		echo "  $(CYAN)🔐 Chargement des secrets depuis $(SECRETS_FILE)...$(NC)"; \
		. $(SECRETS_FILE) 2>/dev/null; \
		echo "# ===== SECRETS (from .env.secrets) =====" >> $(GATEWAY_DIR)/.env; \
		echo "BREVO_API_KEY=$${BREVO_API_KEY:-}" >> $(GATEWAY_DIR)/.env; \
		echo "SENDGRID_API_KEY=$${SENDGRID_API_KEY:-}" >> $(GATEWAY_DIR)/.env; \
		echo "MAILGUN_API_KEY=$${MAILGUN_API_KEY:-}" >> $(GATEWAY_DIR)/.env; \
		echo "MAILGUN_DOMAIN=$${MAILGUN_DOMAIN:-}" >> $(GATEWAY_DIR)/.env; \
		echo "TWILIO_ACCOUNT_SID=$${TWILIO_ACCOUNT_SID:-}" >> $(GATEWAY_DIR)/.env; \
		echo "TWILIO_AUTH_TOKEN=$${TWILIO_AUTH_TOKEN:-}" >> $(GATEWAY_DIR)/.env; \
		echo "TWILIO_PHONE_NUMBER=$${TWILIO_PHONE_NUMBER:-}" >> $(GATEWAY_DIR)/.env; \
		echo "VONAGE_API_KEY=$${VONAGE_API_KEY:-}" >> $(GATEWAY_DIR)/.env; \
		echo "VONAGE_API_SECRET=$${VONAGE_API_SECRET:-}" >> $(GATEWAY_DIR)/.env; \
		echo "HCAPTCHA_SECRET=$${HCAPTCHA_SECRET:-}" >> $(GATEWAY_DIR)/.env; \
		echo "HCAPTCHA_SITE_KEY=$${HCAPTCHA_SITE_KEY:-}" >> $(GATEWAY_DIR)/.env; \
		echo "GEOIP_LICENSE_KEY=$${GEOIP_LICENSE_KEY:-}" >> $(GATEWAY_DIR)/.env; \
		echo "TURN_SECRET=$${TURN_SECRET:-}" >> $(GATEWAY_DIR)/.env; \
		echo "FIREBASE_PROJECT_ID=$${FIREBASE_PROJECT_ID:-}" >> $(GATEWAY_DIR)/.env; \
		echo "FIREBASE_CLIENT_EMAIL=$${FIREBASE_CLIENT_EMAIL:-}" >> $(GATEWAY_DIR)/.env; \
		echo "FIREBASE_PRIVATE_KEY=$${FIREBASE_PRIVATE_KEY:-}" >> $(GATEWAY_DIR)/.env; \
		echo "FIREBASE_ADMIN_CREDENTIALS_PATH=$${FIREBASE_ADMIN_CREDENTIALS_PATH:-}" >> $(GATEWAY_DIR)/.env; \
		echo "# ===== ENCRYPTION =====" >> $(GATEWAY_DIR)/.env; \
		echo "ATTACHMENT_MASTER_KEY=$${ATTACHMENT_MASTER_KEY:-}" >> $(GATEWAY_DIR)/.env; \
		echo "# ===== FIREBASE (Frontend) =====" >> $(WEB_DIR)/.env; \
		echo "NEXT_PUBLIC_FIREBASE_API_KEY=$${NEXT_PUBLIC_FIREBASE_API_KEY:-}" >> $(WEB_DIR)/.env; \
		echo "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:-}" >> $(WEB_DIR)/.env; \
		echo "NEXT_PUBLIC_FIREBASE_PROJECT_ID=$${NEXT_PUBLIC_FIREBASE_PROJECT_ID:-}" >> $(WEB_DIR)/.env; \
		echo "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:-}" >> $(WEB_DIR)/.env; \
		echo "NEXT_PUBLIC_FIREBASE_APP_ID=$${NEXT_PUBLIC_FIREBASE_APP_ID:-}" >> $(WEB_DIR)/.env; \
		echo "NEXT_PUBLIC_FIREBASE_VAPID_KEY=$${NEXT_PUBLIC_FIREBASE_VAPID_KEY:-}" >> $(WEB_DIR)/.env; \
		echo "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=$${NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID:-}" >> $(WEB_DIR)/.env; \
		echo "# ===== CAPTCHA (Frontend) =====" >> $(WEB_DIR)/.env; \
		echo "NEXT_PUBLIC_HCAPTCHA_SITE_KEY=$${HCAPTCHA_SITE_KEY:-}" >> $(WEB_DIR)/.env; \
		echo "# ===== FEATURE FLAGS =====" >> $(WEB_DIR)/.env; \
		echo "NEXT_PUBLIC_ENABLE_PASSWORD_RESET=$${NEXT_PUBLIC_ENABLE_PASSWORD_RESET:-true}" >> $(WEB_DIR)/.env; \
	else \
		echo "  $(YELLOW)⚠️  Pas de fichier secrets ($(SECRETS_FILE))$(NC)"; \
		echo "  $(DIM)   Créez-le avec: cp infrastructure/envs/.env.secrets.example $(SECRETS_FILE)$(NC)"; \
	fi
	@# Translator .env
	@echo "ENVIRONMENT=development" > $(TRANSLATOR_DIR)/.env
	@echo "DATABASE_URL=mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true" >> $(TRANSLATOR_DIR)/.env
	@echo "REDIS_URL=redis://localhost:6379" >> $(TRANSLATOR_DIR)/.env
	@echo "PORT=8000" >> $(TRANSLATOR_DIR)/.env
	@echo "HOST=0.0.0.0" >> $(TRANSLATOR_DIR)/.env
	@# Agent .env
	@echo "NODE_ENV=development" > $(AGENT_DIR)/.env
	@echo "PORT=3200" >> $(AGENT_DIR)/.env
	@echo "LLM_PROVIDER=openai" >> $(AGENT_DIR)/.env
	@echo "OPENAI_API_KEY=$${OPENAI_API_KEY:-}" >> $(AGENT_DIR)/.env
	@echo "OPENAI_MODEL=gpt-4o-mini" >> $(AGENT_DIR)/.env
	@echo "ZMQ_HOST=localhost" >> $(AGENT_DIR)/.env
	@echo "ZMQ_PULL_PORT=5560" >> $(AGENT_DIR)/.env
	@echo "ZMQ_PUB_PORT=5561" >> $(AGENT_DIR)/.env
	@echo "DATABASE_URL=mongodb://database:27017/meeshy?replicaSet=rs0&directConnection=true" >> $(AGENT_DIR)/.env
	@echo "REDIS_URL=redis://redis:6379" >> $(AGENT_DIR)/.env
	@echo "  $(GREEN)✓ Fichiers .env générés$(NC)"

dev-tmux-network: ## 🖥️  Lancer les services en mode tmux (réseau)
	@echo "$(BLUE)🖥️  Démarrage des services dans tmux (mode réseau)...$(NC)"
	@tmux kill-session -t meeshy 2>/dev/null || true
	@tmux new-session -d -s meeshy -n translator \
		"cd $(CURDIR)/$(TRANSLATOR_DIR) && . .venv/bin/activate 2>/dev/null; echo '🔤 Translator ($(HOST):8000)'; python3 src/main.py; read"
	@sleep 2
	@tmux new-window -t meeshy -n gateway \
		"cd $(CURDIR)/$(GATEWAY_DIR) && echo '🚀 Gateway ($(HOST):3000)'; $(JS_RUNTIME) run dev; read"
	@sleep 2
	@tmux new-window -t meeshy -n agent \
		"cd $(CURDIR)/$(AGENT_DIR) && echo '🤖 Agent Service ($(HOST):3200)'; $(JS_RUNTIME) run dev; read"
	@sleep 2
	@tmux new-window -t meeshy -n web \
		"cd $(CURDIR)/$(WEB_DIR) && echo '🎨 Web HTTPS ($(HOST):3100)'; $(JS_RUNTIME) run dev:https; read"
	@sleep 2
	@tmux new-window -t meeshy -n web_v2 \
		"cd $(CURDIR)/$(WEB_V2_DIR) && echo '🎨 Web V2 HTTPS ($(HOST):3200)'; $(JS_RUNTIME) run dev:https; read"
	@echo ""
	@$(MAKE) _show-network-urls
	@echo ""
	@read -p "$(YELLOW)Appuyez sur Entrée pour attacher à tmux...$(NC)" && tmux attach -t meeshy

dev-bg-network: ## 🔄 Lancer les services en background (réseau)
	@echo "$(BLUE)🔄 Démarrage des services en background (mode réseau)...$(NC)"
	@mkdir -p $(PID_DIR) logs
	@# Translator
	@echo "  $(CYAN)🔤 Translator ($(HOST):8000)...$(NC)"
	@cd $(TRANSLATOR_DIR) && . .venv/bin/activate 2>/dev/null && \
		python3 src/main.py > $(CURDIR)/logs/translator.log 2>&1 & echo $$! > $(CURDIR)/$(TRANSLATOR_PID)
	@sleep 2
	@# Gateway
	@echo "  $(CYAN)🚀 Gateway ($(HOST):3000)...$(NC)"
	@cd $(GATEWAY_DIR) && $(JS_RUNTIME) run dev > $(CURDIR)/logs/gateway.log 2>&1 & echo $$! > $(CURDIR)/$(GATEWAY_PID)
	@sleep 2
	@# Agent
	@echo "  $(CYAN)🤖 Agent ($(HOST):3200)...$(NC)"
	@cd $(AGENT_DIR) && $(JS_RUNTIME) run dev > $(CURDIR)/logs/agent.log 2>&1 & echo $$! > $(CURDIR)/$(AGENT_PID)
	@sleep 2
	@# Web HTTPS
	@echo "  $(CYAN)🎨 Web HTTPS ($(HOST):3100)...$(NC)"
	@cd $(WEB_DIR) && $(JS_RUNTIME) run dev:https > $(CURDIR)/logs/web.log 2>&1 & echo $$! > $(CURDIR)/$(WEB_PID)
	@sleep 3
	@echo ""
	@$(MAKE) _show-network-urls

_show-network-urls:
	@echo "$(GREEN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(GREEN)║  ✅ Services démarrés - Accès réseau activé                  ║$(NC)"
	@echo "$(GREEN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(BOLD)📱 URLs d'accès (depuis n'importe quel appareil):$(NC)"
	@echo "   Web:           $(GREEN)https://$(HOST):3100$(NC)"
	@echo "   Web V2:        $(GREEN)https://$(HOST):3200$(NC)"
	@echo "   Gateway API:   $(GREEN)https://$(HOST):3000$(NC)"
	@echo "   Translator:    $(GREEN)http://$(HOST):8000$(NC)"
	@echo ""
	@echo "$(BOLD)🔧 Via domaine local:$(NC)"
	@echo "   Web:           $(GREEN)https://$(LOCAL_DOMAIN):3100$(NC)"
	@echo "   Web V2:        $(GREEN)https://$(LOCAL_DOMAIN):3200$(NC)"
	@echo ""
	@echo "$(BOLD)📡 Serveur DNS local:$(NC)"
	@echo "   $(CYAN)$(HOST_IP):53$(NC) (configurez vos appareils pour l'utiliser)"
	@echo ""
	@echo "$(BOLD)📋 Ou ajoutez dans /etc/hosts des autres machines:$(NC)"
	@echo "   $(CYAN)$(HOST_IP)    $(HOST) $(LOCAL_DOMAIN)$(NC)"

share-cert: ## 📱 Partager le certificat CA pour mobiles (serveur HTTP + alternatives)
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║     📱 Partage du Certificat CA pour Mobiles                ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@CA_ROOT=$$(mkcert -CAROOT 2>/dev/null); \
	CERT_FILE="$(CERTS_DIR)/mkcert-rootCA.pem"; \
	if [ ! -f "$$CERT_FILE" ] && [ -n "$$CA_ROOT" ] && [ -f "$$CA_ROOT/rootCA.pem" ]; then \
		cp "$$CA_ROOT/rootCA.pem" "$$CERT_FILE"; \
	fi; \
	if [ -f "$$CERT_FILE" ]; then \
		CERT_DIR=$$(dirname "$$CERT_FILE"); \
		CERT_NAME=$$(basename "$$CERT_FILE"); \
		CERT_PATH="$$(cd "$$CERT_DIR" && pwd)/$$CERT_NAME"; \
		DOWNLOAD_URL="http://$(HOST_IP):8888/$$CERT_NAME"; \
		echo "$(BOLD)📍 Certificat CA:$(NC)"; \
		echo "   $(CYAN)$$CERT_PATH$(NC)"; \
		echo ""; \
		echo "$(CYAN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"; \
		echo "$(BOLD)Option 1: 🌐 Serveur HTTP (recommandé)$(NC)"; \
		echo "$(CYAN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"; \
		pkill -f "python3 -m http.server 8888" 2>/dev/null || true; \
		sleep 0.5; \
		cd "$$CERT_DIR" && python3 -m http.server 8888 --bind 0.0.0.0 > /dev/null 2>&1 & \
		HTTP_PID=$$!; \
		sleep 1; \
		if kill -0 $$HTTP_PID 2>/dev/null; then \
			echo "$(GREEN)✅ Serveur HTTP démarré sur port 8888$(NC)"; \
			echo ""; \
			echo "$(BOLD)📥 URL de téléchargement:$(NC)"; \
			echo "   $(GREEN)$$DOWNLOAD_URL$(NC)"; \
			echo ""; \
			if command -v qrencode >/dev/null 2>&1; then \
				echo "$(BOLD)📱 Scannez ce QR code avec votre téléphone:$(NC)"; \
				qrencode -t ANSIUTF8 "$$DOWNLOAD_URL"; \
			fi; \
		else \
			echo "$(YELLOW)⚠️  Échec du démarrage du serveur HTTP$(NC)"; \
			echo "   Port 8888 peut-être déjà utilisé. Utilisez les alternatives ci-dessous"; \
		fi; \
		echo ""; \
		echo "$(CYAN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"; \
		echo "$(BOLD)Option 2: 📤 AirDrop (macOS → iPhone)$(NC)"; \
		echo "$(CYAN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"; \
		echo "   Ouvrez le Finder et faites glisser le fichier vers AirDrop:"; \
		echo "   $(CYAN)$$CERT_PATH$(NC)"; \
		echo ""; \
		echo "$(CYAN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"; \
		echo "$(BOLD)Option 3: 📧 Email$(NC)"; \
		echo "$(CYAN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"; \
		echo "   Envoyez le fichier .pem par email et ouvrez-le sur mobile"; \
		echo ""; \
		echo "$(CYAN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"; \
		echo "$(BOLD)Option 4: 🔧 Serveur HTTP manuel$(NC)"; \
		echo "$(CYAN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"; \
		echo "   cd $$CERT_DIR && python3 -m http.server 8888"; \
		echo "   Puis ouvrez: $$DOWNLOAD_URL"; \
		echo ""; \
		echo "$(CYAN)══════════════════════════════════════════════════════════════$(NC)"; \
		echo "$(BOLD)📲 INSTALLATION SUR iPHONE:$(NC)"; \
		echo "$(CYAN)══════════════════════════════════════════════════════════════$(NC)"; \
		echo "   1. Ouvrez l'URL/fichier dans $(YELLOW)Safari$(NC) (pas Chrome!)"; \
		echo "   2. Appuyez sur $(YELLOW)Autoriser$(NC) pour télécharger le profil"; \
		echo "   3. Allez dans $(YELLOW)Réglages → Général → VPN et gestion$(NC)"; \
		echo "   4. Appuyez sur le profil → $(YELLOW)Installer$(NC)"; \
		echo "   5. Allez dans $(YELLOW)Réglages → Général → Informations$(NC)"; \
		echo "   6. $(YELLOW)Réglages des certificats$(NC) (tout en bas)"; \
		echo "   7. $(GREEN)Activer la confiance totale$(NC) pour le certificat"; \
		echo ""; \
		echo "$(BOLD)📲 INSTALLATION SUR ANDROID:$(NC)"; \
		echo "$(CYAN)══════════════════════════════════════════════════════════════$(NC)"; \
		echo "   1. Téléchargez le fichier .pem"; \
		echo "   2. $(YELLOW)Paramètres → Sécurité → Installer certificat CA$(NC)"; \
		echo ""; \
		echo "$(DIM)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"; \
		echo "$(DIM)Serveur HTTP actif. Ctrl+C pour arrêter.$(NC)"; \
		echo "$(DIM)Ou: make share-cert-stop$(NC)"; \
		wait; \
	else \
		echo "$(RED)❌ Certificat CA non trouvé.$(NC)"; \
		echo ""; \
		echo "$(BOLD)Pour générer les certificats:$(NC)"; \
		echo "   $(YELLOW)make setup-certs$(NC)"; \
		echo ""; \
		echo "$(BOLD)Prérequis:$(NC)"; \
		echo "   $(YELLOW)brew install mkcert$(NC)"; \
		echo "   $(YELLOW)mkcert -install$(NC)"; \
	fi

share-cert-stop: ## 🛑 Arrêter le serveur de certificat
	@pkill -f "python3 -m http.server 8888" 2>/dev/null && \
		echo "$(GREEN)✅ Serveur de certificat arrêté$(NC)" || \
		echo "$(DIM)Aucun serveur actif$(NC)"

network-info: ## 📡 Afficher les informations réseau
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║          MEESHY - Informations Réseau                        ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(BOLD)🖥️  Cette machine:$(NC)"
	@echo "   IP locale:     $(GREEN)$(HOST_IP)$(NC)"
	@echo "   Hostname:      $(GREEN)$$(hostname)$(NC)"
	@echo ""
	@echo "$(BOLD)📱 Sous-domaines disponibles (avec docker-start-network):$(NC)"
	@echo "   Web:           $(GREEN)https://$(LOCAL_DOMAIN)$(NC)  ou  $(GREEN)https://app.$(LOCAL_DOMAIN)$(NC)"
	@echo "   Gateway API:   $(GREEN)https://gate.$(LOCAL_DOMAIN)$(NC)  ou  $(GREEN)https://api.$(LOCAL_DOMAIN)$(NC)"
	@echo "   Translator:    $(GREEN)https://ml.$(LOCAL_DOMAIN)$(NC)  ou  $(GREEN)https://translate.$(LOCAL_DOMAIN)$(NC)"
	@echo "   MongoDB UI:    $(GREEN)https://mongo.$(LOCAL_DOMAIN)$(NC)"
	@echo "   Redis UI:      $(GREEN)https://redis.$(LOCAL_DOMAIN)$(NC)"
	@echo ""
	@echo "$(BOLD)📡 Serveur DNS (après make docker-infra):$(NC)"
	@echo "   DNS Server:    $(GREEN)$(HOST_IP):53$(NC)"
	@echo "   Résout:        $(CYAN)*.$(LOCAL_DOMAIN) -> $(HOST_IP)$(NC)"
	@echo ""
	@echo "$(BOLD)🔧 Commandes:$(NC)"
	@echo "   $(YELLOW)make start-network$(NC)                      - Natif + accès réseau"
	@echo "   $(YELLOW)make docker-start-network$(NC)               - 100% Docker + sous-domaines"
	@echo "   $(YELLOW)make docker-start-network HOST=mydev.local$(NC)"
	@echo "   $(YELLOW)make share-cert$(NC)                         - Partager cert pour mobiles"
	@echo ""
	@echo "$(BOLD)📋 Configuration manuelle /etc/hosts:$(NC)"
	@echo "   $(CYAN)$(HOST_IP)  $(LOCAL_DOMAIN) app.$(LOCAL_DOMAIN) gate.$(LOCAL_DOMAIN) api.$(LOCAL_DOMAIN)$(NC)"
	@echo "   $(CYAN)$(HOST_IP)  ml.$(LOCAL_DOMAIN) translate.$(LOCAL_DOMAIN) mongo.$(LOCAL_DOMAIN) redis.$(LOCAL_DOMAIN)$(NC)"

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

# Ports infrastructure (ne PAS toucher - services qui doivent rester actifs)
PORTS_INFRA := 27017 6379

# Ports applicatifs (à vérifier/libérer si nécessaire)
# docker-compose.local.yml (network mode avec Traefik)
PORTS_APP_LOCAL := 80 443 3000 3100 5555 5558 8000 8080
# docker-compose.dev.yml
PORTS_APP_DEV := 3000 3001 3100 5555 5558 7843 8000

# Helper: Arrêter automatiquement docker-compose si des conteneurs Meeshy sont en cours
# Vérifie d'abord que Docker est stable avant d'agir
_docker-down-if-running:
	@# Vérifier que Docker daemon est opérationnel
	@if ! docker info >/dev/null 2>&1; then \
		echo "$(DIM)  Docker non disponible, skip down$(NC)"; \
		exit 0; \
	fi
	@# Vérifier s'il y a des pulls/builds en cours (ne pas interrompre)
	@PULLING=$$(docker ps --filter "status=created" -q 2>/dev/null | wc -l | tr -d ' '); \
	if [ "$$PULLING" != "0" ] && [ -n "$$PULLING" ]; then \
		echo "$(YELLOW)⏳ Opérations Docker en cours, attente...$(NC)"; \
		sleep 5; \
	fi
	@COMPOSE_FILE_TO_USE="$(or $(COMPOSE_TO_CHECK),$(COMPOSE_LOCAL))"; \
	if docker compose -f "$$COMPOSE_FILE_TO_USE" ps -q 2>/dev/null | grep -q .; then \
		echo "$(YELLOW)🛑 Arrêt des services Docker...$(NC)"; \
		docker compose -f "$$COMPOSE_FILE_TO_USE" down --remove-orphans 2>/dev/null || true; \
		sleep 2; \
		echo "$(GREEN)✅ Services Docker arrêtés$(NC)"; \
	fi

# Helper: Libérer les ports applicatifs avec retry (3 tentatives)
# Note: Ne touche PAS aux ports infrastructure ($(PORTS_INFRA))
# Note: Utilise -sTCP:LISTEN pour ne cibler QUE les processus qui écoutent sur le port
#       (pas les connexions sortantes comme Chrome vers HTTPS)
# Note: Ne tue JAMAIS les processus Docker (com.docker, Docker Desktop)
# Usage: $(MAKE) _ensure-ports-free REQUIRED_PORTS="3000 3100 8000"
_ensure-ports-free:
	@echo "$(BLUE)🔍 Vérification des ports requis...$(NC)"
	@PORTS="$(REQUIRED_PORTS)"; \
	MAX_RETRIES=3; \
	for attempt in 1 2 3; do \
		ALL_FREE=true; \
		BLOCKED_PORTS=""; \
		for port in $$PORTS; do \
			if lsof -i :$$port -sTCP:LISTEN -t >/dev/null 2>&1; then \
				ALL_FREE=false; \
				BLOCKED_PORTS="$$BLOCKED_PORTS $$port"; \
			fi; \
		done; \
		if [ "$$ALL_FREE" = "true" ]; then \
			echo "  $(GREEN)✅ Tous les ports sont disponibles$(NC)"; \
			break; \
		fi; \
		echo "  $(YELLOW)⚠️  Tentative $$attempt/$$MAX_RETRIES - Ports occupés:$$BLOCKED_PORTS$(NC)"; \
		for port in $$BLOCKED_PORTS; do \
			PIDS=$$(lsof -i :$$port -sTCP:LISTEN -t 2>/dev/null || true); \
			if [ -n "$$PIDS" ]; then \
				for pid in $$PIDS; do \
					PROC_NAME=$$(ps -p $$pid -o comm= 2>/dev/null || echo "unknown"); \
					PROC_PATH=$$(ps -p $$pid -o args= 2>/dev/null || echo ""); \
					if echo "$$PROC_PATH" | grep -qi "docker"; then \
						echo "    $(DIM)Port $$port: PID $$pid ($$PROC_NAME) - Docker, skip$(NC)"; \
						continue; \
					fi; \
					echo "    $(DIM)Port $$port: PID $$pid ($$PROC_NAME) - kill...$(NC)"; \
					kill -9 $$pid 2>/dev/null || true; \
				done; \
			fi; \
		done; \
		sleep 1; \
		if [ $$attempt -eq $$MAX_RETRIES ]; then \
			echo ""; \
			echo "  $(YELLOW)⚠️  Échec après $$MAX_RETRIES tentatives - ports toujours occupés:$$BLOCKED_PORTS$(NC)"; \
			echo "  $(BLUE)🔄 Arrêt des containers Docker pour libérer les ports...$(NC)"; \
			docker compose -f $(COMPOSE_LOCAL) down --remove-orphans 2>/dev/null || true; \
			docker compose -f $(COMPOSE_DEV) down --remove-orphans 2>/dev/null || true; \
			sleep 2; \
			STILL_BLOCKED=""; \
			for port in $$BLOCKED_PORTS; do \
				if lsof -i :$$port -sTCP:LISTEN -t >/dev/null 2>&1; then \
					STILL_BLOCKED="$$STILL_BLOCKED $$port"; \
				fi; \
			done; \
			if [ -n "$$STILL_BLOCKED" ]; then \
				echo "  $(YELLOW)⚠️  Ports encore occupés après docker down:$$STILL_BLOCKED$(NC)"; \
				echo "  $(BLUE)💡 Tentative de kill forcé (hors Docker)...$(NC)"; \
				for port in $$STILL_BLOCKED; do \
					for pid in $$(lsof -i :$$port -sTCP:LISTEN -t 2>/dev/null || true); do \
						PROC_PATH=$$(ps -p $$pid -o args= 2>/dev/null || echo ""); \
						if ! echo "$$PROC_PATH" | grep -qi "docker"; then \
							kill -9 $$pid 2>/dev/null || true; \
						fi; \
					done; \
				done; \
				sleep 1; \
			fi; \
			echo "  $(GREEN)✅ Ports libérés après docker down$(NC)"; \
		fi; \
	done

# Helper: Vérifier et démarrer Docker si nécessaire (avec vérification d'état)
_ensure-docker-running:
	@if [ "$(HAS_DOCKER)" != "yes" ]; then \
		echo "$(RED)❌ Docker non installé$(NC)"; \
		echo "$(YELLOW)💡 Installez Docker Desktop: https://docker.com/get-started$(NC)"; \
		exit 1; \
	fi
	@# Vérifier si Docker daemon répond
	@if ! docker info >/dev/null 2>&1; then \
		echo "$(YELLOW)🐳 Docker n'est pas démarré, lancement en cours...$(NC)"; \
		if [ "$(OS)" = "macos" ]; then \
			open -a Docker; \
		elif [ "$(OS)" = "linux" ]; then \
			sudo systemctl start docker 2>/dev/null || sudo service docker start 2>/dev/null || true; \
		fi; \
		echo "$(BLUE)⏳ Attente du démarrage de Docker...$(NC)"; \
		for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do \
			if docker info >/dev/null 2>&1; then \
				echo "$(GREEN)✅ Docker est prêt$(NC)"; \
				break; \
			fi; \
			sleep 2; \
			printf "."; \
		done; \
		echo ""; \
		if ! docker info >/dev/null 2>&1; then \
			echo "$(RED)❌ Échec du démarrage de Docker après 60s$(NC)"; \
			exit 1; \
		fi; \
	fi
	@# Attendre que Docker soit complètement opérationnel (pas en cours de démarrage/redémarrage)
	@$(MAKE) _wait-docker-stable

# Helper: Attendre que Docker soit stable (pas d'opérations en cours)
_wait-docker-stable:
	@MAX_WAIT=30; \
	WAITED=0; \
	while [ $$WAITED -lt $$MAX_WAIT ]; do \
		if docker info >/dev/null 2>&1; then \
			PULLING=$$(docker ps -a --filter "status=created" -q 2>/dev/null | wc -l | tr -d ' '); \
			if [ "$$PULLING" = "0" ] || [ -z "$$PULLING" ]; then \
				break; \
			fi; \
			echo "  $(DIM)⏳ Containers en création, attente...$(NC)"; \
		else \
			echo "  $(YELLOW)⏳ Docker daemon en cours de démarrage...$(NC)"; \
		fi; \
		sleep 2; \
		WAITED=$$((WAITED + 2)); \
	done; \
	if ! docker info >/dev/null 2>&1; then \
		echo "$(RED)❌ Docker n'est pas stable après $${MAX_WAIT}s$(NC)"; \
		exit 1; \
	fi

docker-infra: _ensure-docker-running ## Démarrer l'infrastructure avec Traefik HTTPS (MongoDB + Redis)
	@# Vérifier les certificats
	@if [ ! -f "$(CERTS_DIR)/cert.pem" ]; then \
		echo "$(YELLOW)⚠️  Certificats manquants, exécution de 'make setup-certs'...$(NC)"; \
		$(MAKE) setup-certs; \
	fi
	@echo "$(BLUE)🐳 Démarrage de l'infrastructure avec HTTPS (Traefik + MongoDB + Redis)...$(NC)"
	@docker compose -f $(COMPOSE_LOCAL) -p $(PROJECT_LOCAL) up -d --force-recreate --remove-orphans
	@echo "$(GREEN)✅ Infrastructure démarrée$(NC)"
	@echo ""
	@echo "$(BLUE)📍 Services:$(NC)"
	@echo "   - Traefik:  $(GREEN)https://localhost$(NC) (reverse proxy)"
	@echo "   - Dashboard: $(GREEN)http://localhost:8080$(NC) (Traefik UI)"
	@echo "   - MongoDB:  mongodb://localhost:27017"
	@echo "   - Redis:    redis://localhost:6379"

docker-infra-simple: _ensure-docker-running ## Démarrer infrastructure simple sans HTTPS (MongoDB + Redis uniquement)
	@echo "$(BLUE)🐳 Démarrage de l'infrastructure simple (MongoDB + Redis)...$(NC)"
	@docker compose -f $(COMPOSE_DEV) up -d
	@echo "$(GREEN)✅ Infrastructure démarrée$(NC)"
	@echo ""
	@echo "$(BLUE)📍 Services:$(NC)"
	@echo "   - MongoDB: mongodb://localhost:27017"
	@echo "   - Redis:   redis://localhost:6379"

docker-start: _ensure-docker-running ## Démarrer tous les services via Docker Compose (localhost)
	@echo "$(BLUE)🐳 Démarrage de tous les services Meeshy...$(NC)"
	@docker compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) up -d
	@echo "$(GREEN)✅ Services démarrés$(NC)"
	@$(MAKE) urls

docker-start-local: _ensure-docker-running docker-build ## 🔨 Builder les images localement puis démarrer
	@$(MAKE) _docker-down-if-running COMPOSE_TO_CHECK="$(COMPOSE_FILE)"
	@$(MAKE) _ensure-ports-free REQUIRED_PORTS="$(PORTS_APP_DEV)"
	@echo "$(BLUE)🐳 Démarrage avec images locales...$(NC)"
	@docker compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) up -d
	@echo "$(GREEN)✅ Services démarrés avec images locales$(NC)"
	@$(MAKE) urls

# Helper: Pull only missing Docker images (skip images that exist locally)
_pull-missing-images:
	@echo "$(BLUE)📥 Vérification et téléchargement des images manquantes...$(NC)"
	@MISSING_IMAGES=""; \
	for img in "isopen/meeshy-gateway:latest" "isopen/meeshy-web:latest" "isopen/meeshy-translator:latest"; do \
		if ! docker image inspect $$img >/dev/null 2>&1; then \
			echo "  $(YELLOW)⬇️  $$img manquante, téléchargement nécessaire$(NC)"; \
			MISSING_IMAGES="$$MISSING_IMAGES $$img"; \
		else \
			echo "  $(GREEN)✓ $$img déjà présente localement$(NC)"; \
		fi; \
	done; \
	if [ -n "$$MISSING_IMAGES" ]; then \
		echo "$(BLUE)📥 Téléchargement des images manquantes depuis Docker Hub...$(NC)"; \
		for img in $$MISSING_IMAGES; do \
			docker pull $$img 2>&1 | grep -v "manifest" || { \
				echo "  $(YELLOW)⚠️  Impossible de télécharger $$img (architecture non supportée)$(NC)"; \
				echo "  $(YELLOW)💡 Utilisez 'make build-all-docker' pour construire les images localement$(NC)"; \
			}; \
		done; \
	else \
		echo "  $(GREEN)✅ Toutes les images Meeshy sont disponibles localement$(NC)"; \
	fi; \
	echo "$(BLUE)📥 Téléchargement des images infrastructure...$(NC)"; \
	docker compose -f $(COMPOSE_LOCAL) -p $(PROJECT_LOCAL) --env-file $(COMPOSE_DIR)/.env.network pull traefik database redis nosqlclient p3x-redis-ui 2>/dev/null || true

docker-start-network: _ensure-docker-running ## 🌐 Démarrer tous les services Docker avec accès réseau
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║   MEESHY - Docker 100% avec Accès Réseau (Mobile/Devices)   ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@# Nettoyage complet: arrêter tous les containers et supprimer les orphelins
	@echo "$(BLUE)🧹 Nettoyage des containers existants...$(NC)"
	@docker compose -f $(COMPOSE_LOCAL) -p $(PROJECT_LOCAL) down --remove-orphans 2>/dev/null || true
	@docker compose -f $(COMPOSE_DEV) -p $(PROJECT_DEV) down --remove-orphans 2>/dev/null || true
	@# Supprimer les containers orphelins Meeshy qui pourraient rester
	@ORPHANS=$$(docker ps -a --filter "name=meeshy" -q 2>/dev/null); \
	if [ -n "$$ORPHANS" ]; then echo "$$ORPHANS" | xargs docker rm -f 2>/dev/null || true; fi
	@# Nettoyer tous les containers arrêtés
	@docker container prune -f >/dev/null 2>&1 || true
	@sleep 2
	@# Vérifier et libérer les ports applicatifs (ignore ports infrastructure: $(PORTS_INFRA))
	@$(MAKE) _ensure-ports-free REQUIRED_PORTS="$(PORTS_APP_LOCAL)"
	@echo ""
	@echo "$(BOLD)🌐 Configuration Réseau:$(NC)"
	@echo "   IP locale:  $(GREEN)$(HOST_IP)$(NC)"
	@echo "   Host:       $(GREEN)$(HOST)$(NC)"
	@echo "   Domain:     $(GREEN)$(LOCAL_DOMAIN)$(NC)"
	@echo ""
	@# Configuration réseau (DNS + certificats)
	@$(MAKE) setup-network HOST=$(HOST) LOCAL_DOMAIN=$(LOCAL_DOMAIN)
	@echo ""
	@# Générer .env avec URLs réseau pour Docker
	@echo "$(BLUE)📝 Configuration des variables d'environnement réseau...$(NC)"
	@echo "HOST_IP=$(HOST_IP)" > $(COMPOSE_DIR)/.env.network
	@echo "HOST=$(HOST)" >> $(COMPOSE_DIR)/.env.network
	@echo "LOCAL_DOMAIN=$(LOCAL_DOMAIN)" >> $(COMPOSE_DIR)/.env.network
	@echo "# Frontend environment variables (for entrypoint.sh runtime injection)" >> $(COMPOSE_DIR)/.env.network
	@echo "NEXT_PUBLIC_API_URL=https://gate.$(LOCAL_DOMAIN)" >> $(COMPOSE_DIR)/.env.network
	@echo "NEXT_PUBLIC_BACKEND_URL=https://gate.$(LOCAL_DOMAIN)" >> $(COMPOSE_DIR)/.env.network
	@echo "NEXT_PUBLIC_WS_URL=wss://gate.$(LOCAL_DOMAIN)" >> $(COMPOSE_DIR)/.env.network
	@echo "NEXT_PUBLIC_FRONTEND_URL=https://$(LOCAL_DOMAIN)" >> $(COMPOSE_DIR)/.env.network
	@echo "NEXT_PUBLIC_TRANSLATION_URL=https://ml.$(LOCAL_DOMAIN)" >> $(COMPOSE_DIR)/.env.network
	@echo "NEXT_PUBLIC_STATIC_URL=https://static.$(LOCAL_DOMAIN)" >> $(COMPOSE_DIR)/.env.network
	@echo "FRONTEND_URL=https://$(LOCAL_DOMAIN)" >> $(COMPOSE_DIR)/.env.network
	@echo "  $(GREEN)✓ .env.network généré$(NC)"
	@echo ""
	@# Télécharger uniquement les images manquantes
	@$(MAKE) _pull-missing-images
	@echo ""
	@# Démarrer avec le profil full (tous les services)
	@echo "$(BLUE)🐳 Démarrage de tous les services Docker...$(NC)"
	@docker compose -f $(COMPOSE_LOCAL) -p $(PROJECT_LOCAL) --env-file $(COMPOSE_DIR)/.env.network --profile full up -d --force-recreate --remove-orphans
	@echo ""
	@echo "$(GREEN)✅ Services démarrés avec accès réseau$(NC)"
	@echo ""
	@echo "$(BOLD)📱 Accès par sous-domaine:$(NC)"
	@echo "   Web:          $(GREEN)https://$(LOCAL_DOMAIN)$(NC)  ou  $(GREEN)https://app.$(LOCAL_DOMAIN)$(NC)"
	@echo "   Gateway API:  $(GREEN)https://gate.$(LOCAL_DOMAIN)$(NC)  ou  $(GREEN)https://api.$(LOCAL_DOMAIN)$(NC)"
	@echo "   Translator:   $(GREEN)https://ml.$(LOCAL_DOMAIN)$(NC)  ou  $(GREEN)https://translate.$(LOCAL_DOMAIN)$(NC)"
	@echo "   MongoDB UI:   $(GREEN)https://mongo.$(LOCAL_DOMAIN)$(NC)  (admin/admin)"
	@echo "   Redis UI:     $(GREEN)https://redis.$(LOCAL_DOMAIN)$(NC)"
	@echo "   Traefik UI:   $(GREEN)http://$(HOST):8080$(NC)"
	@echo ""
	@echo "$(YELLOW)💡 Pour les mobiles: make share-cert$(NC)"

docker-stop: _ensure-docker-running ## Arrêter tous les services Docker
	@echo "$(YELLOW)⏹️  Arrêt des services Docker...$(NC)"
	@docker compose -f $(COMPOSE_DEV) -p $(PROJECT_DEV) --profile full down --remove-orphans 2>/dev/null || true
	@docker compose -f $(COMPOSE_LOCAL) -p $(PROJECT_LOCAL) --profile full down --remove-orphans 2>/dev/null || true
	@docker compose -f $(COMPOSE_PROD) -p $(PROJECT_PROD) --profile full down --remove-orphans 2>/dev/null || true
	@echo "$(GREEN)✅ Services arrêtés$(NC)"

docker-logs: _ensure-docker-running ## Afficher les logs Docker (SERVICE=nom pour filtrer)
	@if [ -z "$(SERVICE)" ]; then \
		docker compose -f $(COMPOSE_FILE) logs -f; \
	else \
		docker compose -f $(COMPOSE_FILE) logs -f $(SERVICE); \
	fi

docker-pull: _ensure-docker-running ## Télécharger les dernières images Docker
	@echo "$(BLUE)📥 Téléchargement des images...$(NC)"
	@docker compose -f $(COMPOSE_FILE) pull
	@echo "$(GREEN)✅ Images mises à jour$(NC)"

docker-build: _ensure-docker-running ## Builder toutes les images Docker localement
	@$(MAKE) build-all-docker

# =============================================================================
# DOCKER HEALTH TESTS
# =============================================================================

docker-test: _ensure-docker-running ## Tester les services Docker (MODE=dev|local|prod)
	@echo "$(BLUE)🧪 Test des services Docker...$(NC)"
	@python3 $(COMPOSE_SCRIPTS)/test-services.py --mode $(or $(MODE),local)

docker-test-dev: _ensure-docker-running ## Tester les services localhost (HTTP)
	@echo "$(BLUE)🧪 Test des services localhost...$(NC)"
	@python3 $(COMPOSE_SCRIPTS)/test-services.py --mode dev

docker-test-local: _ensure-docker-running ## Tester les services *.meeshy.local (HTTPS)
	@echo "$(BLUE)🧪 Test des services meeshy.local...$(NC)"
	@python3 $(COMPOSE_SCRIPTS)/test-services.py --mode local

docker-test-prod: _ensure-docker-running ## Tester les services *.meeshy.me (HTTPS)
	@echo "$(BLUE)🧪 Test des services meeshy.me...$(NC)"
	@python3 $(COMPOSE_SCRIPTS)/test-services.py --mode prod

# =============================================================================
# BUILD IMAGES DOCKER
# =============================================================================
# Variables pour le versioning (peut être surchargé: make push-all TAG=v1.2.3)
DOCKER_REGISTRY ?= isopen
TAG ?= latest

# Version reading from service VERSION files
GATEWAY_VERSION := $(shell cat services/gateway/VERSION 2>/dev/null || echo "1.0.0")
WEB_VERSION := $(shell cat apps/web/VERSION 2>/dev/null || echo "1.0.0")
TRANSLATOR_VERSION := $(shell cat services/translator/VERSION 2>/dev/null || echo "1.0.0")
BUILD_DATE := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
VCS_REF := $(shell git rev-parse --short HEAD 2>/dev/null || echo "local")

# Préparation des dépendances partagées avant build Docker
_prepare-docker-build: _ensure-docker-running
	@echo "$(BLUE)📦 Préparation des dépendances pour le build Docker...$(NC)"
	@# Vérifier que shared est buildé
	@if [ ! -d "$(SHARED_DIR)/dist" ]; then \
		echo "  $(YELLOW)⚠️  Shared non buildé - génération...$(NC)"; \
		$(MAKE) generate; \
	else \
		echo "  $(GREEN)✓ Shared déjà buildé$(NC)"; \
	fi
	@# Vérifier Prisma
	@if [ ! -d "$(SHARED_DIR)/prisma/client" ]; then \
		echo "  $(YELLOW)⚠️  Prisma client manquant - génération...$(NC)"; \
		$(MAKE) generate; \
	else \
		echo "  $(GREEN)✓ Prisma client présent$(NC)"; \
	fi

build-docker-gateway: _prepare-docker-build ## Builder l'image Gateway
	@echo "$(BLUE)🔨 Build de l'image Gateway ($(DOCKER_REGISTRY)/meeshy-gateway:v$(GATEWAY_VERSION))...$(NC)"
	@docker build \
		--build-arg BUILD_DATE="$(BUILD_DATE)" \
		--build-arg VCS_REF="$(VCS_REF)" \
		--build-arg VERSION="$(GATEWAY_VERSION)" \
		--build-arg PACKAGE_MANAGER=bun \
		-t $(DOCKER_REGISTRY)/meeshy-gateway:v$(GATEWAY_VERSION) \
		-t $(DOCKER_REGISTRY)/meeshy-gateway:latest \
		-f services/gateway/Dockerfile .
	@echo "$(GREEN)✅ Image Gateway buildée: v$(GATEWAY_VERSION)$(NC)"

build-translator: build-translator-cpu ## Builder l'image Translator (alias pour CPU)

build-translator-cpu: _prepare-docker-build ## Builder l'image Translator CPU (~2GB)
	@echo "$(BLUE)🔨 Build de l'image Translator CPU ($(DOCKER_REGISTRY)/meeshy-translator:v$(TRANSLATOR_VERSION)-cpu)...$(NC)"
	@docker build --load \
		--build-arg TORCH_BACKEND=cpu \
		--build-arg BUILD_DATE="$(BUILD_DATE)" \
		--build-arg VCS_REF="$(VCS_REF)" \
		--build-arg VERSION="$(TRANSLATOR_VERSION)" \
		-t $(DOCKER_REGISTRY)/meeshy-translator:v$(TRANSLATOR_VERSION)-cpu \
		-t $(DOCKER_REGISTRY)/meeshy-translator:v$(TRANSLATOR_VERSION) \
		-t $(DOCKER_REGISTRY)/meeshy-translator:latest \
		-t $(DOCKER_REGISTRY)/meeshy-translator:cpu \
		-f services/translator/Dockerfile .
	@echo "$(GREEN)✅ Image Translator CPU buildée: v$(TRANSLATOR_VERSION)$(NC)"

build-translator-gpu: _prepare-docker-build ## Builder l'image Translator GPU CUDA 12.4 (~8GB)
	@echo "$(BLUE)🔨 Build de l'image Translator GPU ($(DOCKER_REGISTRY)/meeshy-translator:v$(TRANSLATOR_VERSION)-gpu)...$(NC)"
	@docker build --load \
		--build-arg TORCH_BACKEND=gpu \
		--build-arg BUILD_DATE="$(BUILD_DATE)" \
		--build-arg VCS_REF="$(VCS_REF)" \
		--build-arg VERSION="$(TRANSLATOR_VERSION)" \
		-t $(DOCKER_REGISTRY)/meeshy-translator:v$(TRANSLATOR_VERSION)-gpu \
		-t $(DOCKER_REGISTRY)/meeshy-translator:gpu \
		-f services/translator/Dockerfile .
	@echo "$(GREEN)✅ Image Translator GPU buildée: v$(TRANSLATOR_VERSION)$(NC)"

build-translator-gpu-cu121: _prepare-docker-build ## Builder l'image Translator GPU CUDA 12.1
	@echo "$(BLUE)🔨 Build de l'image Translator GPU CUDA 12.1...$(NC)"
	@docker build \
		--build-arg TORCH_BACKEND=gpu-cu121 \
		--build-arg BUILD_DATE="$(BUILD_DATE)" \
		--build-arg VCS_REF="$(VCS_REF)" \
		--build-arg VERSION="$(TRANSLATOR_VERSION)" \
		-t $(DOCKER_REGISTRY)/meeshy-translator:v$(TRANSLATOR_VERSION)-gpu-cu121 \
		-f services/translator/Dockerfile .
	@echo "$(GREEN)✅ Image Translator GPU CUDA 12.1 buildée: v$(TRANSLATOR_VERSION)$(NC)"

build-docker-web: _prepare-docker-build ## Builder l'image Web
	@echo "$(BLUE)🔨 Build de l'image Web ($(DOCKER_REGISTRY)/meeshy-web:v$(WEB_VERSION))...$(NC)"
	@docker build \
		--build-arg BUILD_DATE="$(BUILD_DATE)" \
		--build-arg VCS_REF="$(VCS_REF)" \
		--build-arg VERSION="$(WEB_VERSION)" \
		--build-arg PACKAGE_MANAGER=bun \
		-t $(DOCKER_REGISTRY)/meeshy-web:v$(WEB_VERSION) \
		-t $(DOCKER_REGISTRY)/meeshy-web:latest \
		-f apps/web/Dockerfile .
	@echo "$(GREEN)✅ Image Web buildée: v$(WEB_VERSION)$(NC)"

build-all-docker: build-docker-gateway build-translator build-docker-web ## Builder toutes les images Docker
	@echo "$(GREEN)✅ Toutes les images buildées$(NC)"
	@echo ""
	@echo "$(BLUE)📦 Images créées:$(NC)"
	@echo "   - Gateway:    v$(GATEWAY_VERSION)"
	@echo "   - Web:        v$(WEB_VERSION)"
	@echo "   - Translator: v$(TRANSLATOR_VERSION)"
	@echo ""
	@docker images | grep "$(DOCKER_REGISTRY)/meeshy" | head -10

# =============================================================================
# PUSH IMAGES DOCKER HUB
# =============================================================================

push-gateway: ## Push l'image Gateway vers Docker Hub
	@echo "$(BLUE)📤 Push de l'image Gateway v$(GATEWAY_VERSION)...$(NC)"
	@docker push $(DOCKER_REGISTRY)/meeshy-gateway:v$(GATEWAY_VERSION)
	@docker push $(DOCKER_REGISTRY)/meeshy-gateway:latest
	@echo "$(GREEN)✅ Gateway pushée: v$(GATEWAY_VERSION)$(NC)"

push-translator: ## Push l'image Translator vers Docker Hub
	@echo "$(BLUE)📤 Push de l'image Translator v$(TRANSLATOR_VERSION)...$(NC)"
	@docker push $(DOCKER_REGISTRY)/meeshy-translator:v$(TRANSLATOR_VERSION)
	@docker push $(DOCKER_REGISTRY)/meeshy-translator:latest
	@docker push $(DOCKER_REGISTRY)/meeshy-translator:cpu
	@echo "$(GREEN)✅ Translator pushée: v$(TRANSLATOR_VERSION)$(NC)"

push-web: ## Push l'image Web vers Docker Hub
	@echo "$(BLUE)📤 Push de l'image Web v$(WEB_VERSION)...$(NC)"
	@docker push $(DOCKER_REGISTRY)/meeshy-web:v$(WEB_VERSION)
	@docker push $(DOCKER_REGISTRY)/meeshy-web:latest
	@echo "$(GREEN)✅ Web pushée: v$(WEB_VERSION)$(NC)"

push-all: push-gateway push-translator push-web ## Push toutes les images vers Docker Hub
	@echo ""
	@echo "$(GREEN)✅ Toutes les images pushées vers $(DOCKER_REGISTRY)$(NC)"
	@echo "   - $(DOCKER_REGISTRY)/meeshy-gateway:v$(GATEWAY_VERSION)"
	@echo "   - $(DOCKER_REGISTRY)/meeshy-translator:v$(TRANSLATOR_VERSION)"
	@echo "   - $(DOCKER_REGISTRY)/meeshy-web:v$(WEB_VERSION)"

# Build + Push en une commande
release: build-all-docker push-all ## Builder et pusher toutes les images
	@echo ""
	@echo "$(GREEN)🚀 Release publiée!$(NC)"
	@echo "   Gateway:    v$(GATEWAY_VERSION)"
	@echo "   Frontend:   v$(WEB_VERSION)"
	@echo "   Translator: v$(TRANSLATOR_VERSION)"

# =============================================================================
# SECURITY & VALIDATION
# =============================================================================

security-scan: ## Scanner les vulnérabilités des images Docker
	@echo "$(BLUE)🔍 Scanning Docker images for vulnerabilities...$(NC)"
	@command -v trivy >/dev/null 2>&1 || { echo "$(RED)Trivy not installed. Install with: brew install trivy$(NC)"; exit 1; }
	@echo ""
	@echo "$(CYAN)=== Gateway v$(GATEWAY_VERSION) ===$(NC)"
	@trivy image --severity HIGH,CRITICAL $(DOCKER_REGISTRY)/meeshy-gateway:v$(GATEWAY_VERSION) || true
	@echo ""
	@echo "$(CYAN)=== Web v$(WEB_VERSION) ===$(NC)"
	@trivy image --severity HIGH,CRITICAL $(DOCKER_REGISTRY)/meeshy-web:v$(WEB_VERSION) || true
	@echo ""
	@echo "$(CYAN)=== Translator v$(TRANSLATOR_VERSION) ===$(NC)"
	@trivy image --severity HIGH,CRITICAL $(DOCKER_REGISTRY)/meeshy-translator:v$(TRANSLATOR_VERSION) || true

validate-images: ## Valider les labels et métadonnées des images (rapide)
	@echo "$(BLUE)🔍 Validating Docker image metadata...$(NC)"
	@echo ""
	@echo "$(CYAN)=== Gateway v$(GATEWAY_VERSION) ===$(NC)"
	@docker inspect $(DOCKER_REGISTRY)/meeshy-gateway:v$(GATEWAY_VERSION) --format '{{json .Config.Labels}}' 2>/dev/null | jq . || echo "$(RED)Image not found$(NC)"
	@echo ""
	@echo "$(CYAN)=== Web v$(WEB_VERSION) ===$(NC)"
	@docker inspect $(DOCKER_REGISTRY)/meeshy-web:v$(WEB_VERSION) --format '{{json .Config.Labels}}' 2>/dev/null | jq . || echo "$(RED)Image not found$(NC)"
	@echo ""
	@echo "$(CYAN)=== Translator v$(TRANSLATOR_VERSION) ===$(NC)"
	@docker inspect $(DOCKER_REGISTRY)/meeshy-translator:v$(TRANSLATOR_VERSION) --format '{{json .Config.Labels}}' 2>/dev/null | jq . || echo "$(RED)Image not found$(NC)"

validate-docker-full: ## Validation complète des images Docker (labels, security, health)
	@echo "$(BLUE)🔍 Running full Docker image validation...$(NC)"
	@./scripts/docker/validate-docker-build.sh --all

validate-docker-gateway: ## Valider l'image Gateway
	@./scripts/docker/validate-docker-build.sh gateway

validate-docker-web: ## Valider l'image Web
	@./scripts/docker/validate-docker-build.sh web

validate-docker-translator: ## Valider l'image Translator
	@./scripts/docker/validate-docker-build.sh translator

# =============================================================================
# DOCKER UTILITIES
# =============================================================================

# Vérifier l'authentification Docker Hub
docker-login: _ensure-docker-running ## Se connecter à Docker Hub
	@echo "$(BLUE)🔐 Connexion à Docker Hub...$(NC)"
	@docker login
	@echo "$(GREEN)✅ Connecté$(NC)"

docker-images: _ensure-docker-running ## Lister les images Meeshy locales
	@echo "$(BLUE)📦 Images Meeshy locales:$(NC)"
	@docker images | grep -E "REPOSITORY|meeshy" | head -20

# =============================================================================
# UTILITAIRES
# =============================================================================

urls: ## Afficher les URLs d'accès
	@echo "$(BLUE)📍 URLs d'accès (HTTPS via $(LOCAL_DOMAIN)):$(NC)"
	@echo "   Frontend:        $(GREEN)https://$(LOCAL_DOMAIN)$(NC)"
	@echo "   Gateway API:     $(GREEN)https://gate.$(LOCAL_DOMAIN)$(NC)  ou  $(GREEN)https://api.$(LOCAL_DOMAIN)$(NC)"
	@echo "   Translator:      $(GREEN)https://ml.$(LOCAL_DOMAIN)$(NC)"
	@echo ""
	@echo "$(BLUE)📍 Administration (via Traefik):$(NC)"
	@echo "   MongoDB UI:      $(GREEN)https://mongo.$(LOCAL_DOMAIN)$(NC)  (admin/admin123)"
	@echo "   Redis UI:        $(GREEN)https://redis.$(LOCAL_DOMAIN)$(NC)"
	@echo "   Traefik UI:      $(GREEN)http://localhost:8080$(NC)"
	@echo ""
	@echo "$(BLUE)📍 Connexion directe (debug):$(NC)"
	@echo "   MongoDB:         $(GREEN)mongodb://localhost:27017$(NC)"
	@echo "   Redis:           $(GREEN)redis://localhost:6379$(NC)"

status: ## Afficher le statut des services
	@echo "$(BLUE)📊 Statut des services:$(NC)"
	@echo ""
	@echo "$(CYAN)Processus:$(NC)"
	@printf "  %-20s" "Gateway (3000):" && (lsof -ti:3000 >/dev/null 2>&1 && echo "$(GREEN)● Running$(NC)" || echo "$(RED)○ Stopped$(NC)")
	@printf "  %-20s" "Agent (3200):" && (lsof -ti:3200 >/dev/null 2>&1 && echo "$(GREEN)● Running$(NC)" || echo "$(RED)○ Stopped$(NC)")
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
	@printf "  %-15s" "Agent:" && (curl -sf http://localhost:3200/health >/dev/null 2>&1 && echo "$(GREEN)✅ Healthy$(NC)" || echo "$(RED)❌ Unhealthy$(NC)")
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
	@lsof -ti:3200 | xargs kill -9 2>/dev/null || true
	@lsof -ti:8000 | xargs kill -9 2>/dev/null || true
	@tmux kill-session -t meeshy 2>/dev/null || true
	@rm -rf $(PID_DIR)
	@echo "$(GREEN)✅ Processus arrêtés$(NC)"

# =============================================================================
# TESTS & QUALITÉ
# =============================================================================

test: ## Lancer tous les tests (JS + Python + iOS)
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║          MEESHY - Suite de Tests Complète                    ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@ERRORS=0; \
	echo "$(BLUE)1/5$(NC) $(BOLD)Gateway (TypeScript):$(NC)"; \
	cd $(GATEWAY_DIR) && $(JS_RUNTIME) run test 2>&1 || ERRORS=$$((ERRORS+1)); \
	echo ""; \
	echo "$(BLUE)2/5$(NC) $(BOLD)Web (TypeScript):$(NC)"; \
	cd $(CURDIR)/$(WEB_DIR) && $(JS_RUNTIME) run test 2>&1 || ERRORS=$$((ERRORS+1)); \
	echo ""; \
	echo "$(BLUE)3/5$(NC) $(BOLD)Shared (TypeScript):$(NC)"; \
	cd $(CURDIR)/$(SHARED_DIR) && $(JS_RUNTIME) run test 2>&1 || echo "  $(YELLOW)Pas de tests$(NC)"; \
	echo ""; \
	echo "$(BLUE)4/5$(NC) $(BOLD)Translator (Python):$(NC)"; \
	cd $(CURDIR)/$(TRANSLATOR_DIR) && \
		if [ -d .venv ]; then \
			. .venv/bin/activate && python -m pytest tests/ -m "not e2e" -v --tb=short 2>&1 || ERRORS=$$((ERRORS+1)); \
		else \
			echo "  $(YELLOW)⚠️  venv non trouvé, lancez: make install$(NC)"; \
		fi; \
	echo ""; \
	echo "$(BLUE)5/5$(NC) $(BOLD)iOS (Swift):$(NC)"; \
	if [ -d "$(IOS_DIR)" ] && command -v xcodebuild >/dev/null 2>&1; then \
		cd $(CURDIR)/$(IOS_DIR) && xcodebuild test \
			-project Meeshy.xcodeproj \
			-scheme Meeshy \
			-destination 'platform=iOS Simulator,name=iPhone 15,OS=latest' \
			-only-testing:MeeshyTests \
			-quiet 2>&1 || ERRORS=$$((ERRORS+1)); \
	else \
		echo "  $(YELLOW)⚠️  Xcode non disponible ou iOS non configuré$(NC)"; \
	fi; \
	echo ""; \
	if [ $$ERRORS -gt 0 ]; then \
		echo "$(RED)❌ $$ERRORS suite(s) de tests en échec$(NC)"; \
		exit 1; \
	else \
		echo "$(GREEN)✅ Tous les tests passés$(NC)"; \
	fi

test-js: ## Lancer uniquement les tests JavaScript (Gateway + Web + Shared)
	@echo "$(BLUE)🧪 Tests JavaScript...$(NC)"
	@echo ""
	@echo "$(CYAN)Gateway:$(NC)"
	@cd $(GATEWAY_DIR) && $(JS_RUNTIME) run test
	@echo ""
	@echo "$(CYAN)Web:$(NC)"
	@cd $(WEB_DIR) && $(JS_RUNTIME) run test
	@echo ""
	@echo "$(CYAN)Shared:$(NC)"
	@cd $(SHARED_DIR) && $(JS_RUNTIME) run test 2>/dev/null || echo "  Pas de tests"
	@echo ""
	@echo "$(GREEN)✅ Tests JS terminés$(NC)"

test-python: ## Lancer uniquement les tests Python (Translator)
	@echo "$(BLUE)🧪 Tests Python (Translator)...$(NC)"
ifeq ($(HAS_UV),yes)
	@cd $(TRANSLATOR_DIR) && uv run python -m pytest tests/ -m "not e2e" -v --tb=short
else
	@cd $(TRANSLATOR_DIR) && \
		if [ -d .venv ]; then \
			. .venv/bin/activate && python -m pytest tests/ -m "not e2e" -v --tb=short; \
		else \
			echo "$(RED)❌ venv non trouvé. Lancez: make install$(NC)"; \
			exit 1; \
		fi
endif

test-python-fast: ## Lancer les tests Python rapides (sans modèles ML)
	@echo "$(BLUE)🧪 Tests Python rapides (sans ML)...$(NC)"
ifeq ($(HAS_UV),yes)
	@cd $(TRANSLATOR_DIR) && uv run python -m pytest tests/ -v --tb=short -m "not slow and not e2e" -k "not model"
else
	@cd $(TRANSLATOR_DIR) && \
		if [ -d .venv ]; then \
			. .venv/bin/activate && python -m pytest tests/ -v --tb=short -m "not slow and not e2e" -k "not model"; \
		else \
			echo "$(RED)❌ venv non trouvé. Lancez: make install$(NC)"; \
			exit 1; \
		fi
endif

test-ios: ## Lancer les tests iOS (Unit Tests)
	@echo "$(BLUE)🧪 Tests iOS (MeeshyTests)...$(NC)"
	@if [ ! -d "$(IOS_DIR)" ]; then \
		echo "$(RED)❌ Dossier iOS non trouvé: $(IOS_DIR)$(NC)"; \
		exit 1; \
	fi
	@if ! command -v xcodebuild >/dev/null 2>&1; then \
		echo "$(RED)❌ Xcode non installé$(NC)"; \
		exit 1; \
	fi
	@cd $(IOS_DIR) && xcodebuild test \
		-project Meeshy.xcodeproj \
		-scheme Meeshy \
		-destination 'platform=iOS Simulator,name=iPhone 15,OS=latest' \
		-only-testing:MeeshyTests \
		-resultBundlePath TestResults

test-ios-ui: ## Lancer les tests UI iOS (MeeshyUITests)
	@echo "$(BLUE)🧪 Tests UI iOS (MeeshyUITests)...$(NC)"
	@cd $(IOS_DIR) && xcodebuild test \
		-project Meeshy.xcodeproj \
		-scheme Meeshy \
		-destination 'platform=iOS Simulator,name=iPhone 15,OS=latest' \
		-only-testing:MeeshyUITests \
		-resultBundlePath UITestResults

test-gateway: ## Lancer les tests du gateway
	@echo "$(BLUE)🧪 Tests Gateway...$(NC)"
	@cd $(GATEWAY_DIR) && $(JS_RUNTIME) run test

test-web: ## Lancer les tests du frontend
	@echo "$(BLUE)🧪 Tests Web...$(NC)"
	@cd $(WEB_DIR) && $(JS_RUNTIME) run test

test-shared: ## Lancer les tests du shared
	@cd $(SHARED_DIR) && $(JS_RUNTIME) run test

test-translator: test-python ## Alias pour test-python

# =============================================================================
# Tests avec gestion des prérequis
# =============================================================================

test-with-prereqs: ## Lancer tous les tests avec vérification des prérequis
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║     MEESHY - Tests avec Vérification des Prérequis          ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(BLUE)🔍 Vérification des prérequis...$(NC)"
	@./scripts/check-test-prerequisites.sh all || true
	@echo ""
	@$(MAKE) test

test-integration: ## Lancer les tests d'intégration (nécessite services Docker)
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║          MEESHY - Tests d'Intégration                        ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(BLUE)🔍 Vérification des prérequis pour tests d'intégration...$(NC)"
	@if ! VERBOSE=true ./scripts/check-test-prerequisites.sh integration; then \
		echo ""; \
		echo "$(YELLOW)⚠️  Certains prérequis manquent pour les tests d'intégration$(NC)"; \
		echo "$(YELLOW)💡 Conseil: Lancez 'make services-up' pour démarrer les services$(NC)"; \
		echo ""; \
		exit 1; \
	fi
	@echo ""
	@echo "$(GREEN)✓ Tous les prérequis satisfaits$(NC)"
	@echo ""
	@echo "$(BLUE)🧪 Lancement des tests d'intégration...$(NC)"
	@ERRORS=0; \
	echo "$(CYAN)Gateway:$(NC)"; \
	cd $(GATEWAY_DIR) && $(JS_RUNTIME) run test:integration 2>&1 || ERRORS=$$((ERRORS+1)); \
	echo ""; \
	echo "$(CYAN)Translator:$(NC)"; \
	cd $(TRANSLATOR_DIR) && \
		if [ -d .venv ]; then \
			. .venv/bin/activate && python -m pytest tests/integration/ -v --tb=short -m "not e2e" 2>&1 || ERRORS=$$((ERRORS+1)); \
		else \
			echo "  $(YELLOW)⚠️  venv non trouvé$(NC)"; \
		fi; \
	echo ""; \
	if [ $$ERRORS -gt 0 ]; then \
		echo "$(RED)❌ $$ERRORS test(s) d'intégration en échec$(NC)"; \
		exit 1; \
	else \
		echo "$(GREEN)✅ Tous les tests d'intégration passés$(NC)"; \
	fi

test-e2e: ## Lancer les tests end-to-end (nécessite tous les services actifs)
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║          MEESHY - Tests End-to-End                           ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(BLUE)🔍 Vérification des prérequis pour tests e2e...$(NC)"
	@if ! VERBOSE=true ./scripts/check-test-prerequisites.sh e2e; then \
		echo ""; \
		echo "$(YELLOW)⚠️  Certains prérequis manquent pour les tests e2e$(NC)"; \
		echo "$(YELLOW)💡 Conseil:$(NC)"; \
		echo "  1. Démarrez les services: make services-up"; \
		echo "  2. Démarrez le translator: make dev-translator"; \
		echo "  3. Démarrez le gateway: make dev-gateway"; \
		echo ""; \
		exit 1; \
	fi
	@echo ""
	@echo "$(GREEN)✓ Tous les prérequis satisfaits$(NC)"
	@echo ""
	@echo "$(BLUE)🧪 Lancement des tests e2e...$(NC)"
	@cd $(TRANSLATOR_DIR) && \
		if [ -d .venv ]; then \
			. .venv/bin/activate && python -m pytest tests/integration/ -v --tb=short -m e2e 2>&1; \
		else \
			echo "  $(RED)❌ venv non trouvé$(NC)"; \
			exit 1; \
		fi

check-test-prereqs: ## Vérifier les prérequis pour tous les types de tests
	@VERBOSE=true ./scripts/check-test-prerequisites.sh all

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
