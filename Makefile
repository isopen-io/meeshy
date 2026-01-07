# Makefile pour Meeshy - Développement Local et Docker
# Supporte: Bun (défaut), pnpm, Docker Compose

.PHONY: help setup setup-prerequisites setup-python setup-certs setup-certs-force setup-certs-network setup-env setup-network setup-dns \
        _generate-certs _copy-certs-to-docker \
        install generate build dev dev-web dev-gateway dev-translator \
        start stop restart start-network share-cert network-info \
        _generate-env-local _dev-tmux-domain _dev-bg-domain _show-domain-urls \
        dev-tmux-network dev-bg-network _generate-env-network \
        logs status clean reset health urls docker-infra docker-infra-simple \
        docker-start docker-start-network docker-stop docker-logs docker-build docker-pull docker-login docker-images \
        docker-test docker-test-dev docker-test-local docker-test-prod \
        build-gateway build-translator build-frontend build-all-docker \
        push-gateway push-translator push-frontend push-all release \
        dev-tmux dev-bg dev-fg check verify _preflight-check \
        test test-js test-python test-python-fast test-ios test-ios-ui \
        test-gateway test-web test-shared test-translator lint type-check

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

# Variables
COMPOSE_DIR := infrastructure/docker/compose
COMPOSE_DEV := $(COMPOSE_DIR)/docker-compose.dev.yml
COMPOSE_LOCAL := $(COMPOSE_DIR)/docker-compose.local.yml
COMPOSE_PROD := $(COMPOSE_DIR)/docker-compose.prod.yml
COMPOSE_FILE := $(COMPOSE_DEV)
COMPOSE_SCRIPTS := $(COMPOSE_DIR)/scripts
CERTS_DIR := $(COMPOSE_DIR)/certs
ENV_FILE := infrastructure/envs/.env.example

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

# Paths
WEB_DIR := apps/web
IOS_DIR := apps/ios
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
	@grep -E '^(docker-infra|docker-infra-simple|docker-start|docker-start-network|docker-stop):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-22s$(NC) %s\n", $$1, $$2}'
	@grep -E '^(docker-test|docker-test-dev|docker-test-local|docker-test-prod):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-22s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BLUE)📦 BUILD & PUSH IMAGES:$(NC)"
	@grep -E '^(build-gateway|build-translator|build-frontend|build-all-docker):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-18s$(NC) %s\n", $$1, $$2}'
	@grep -E '^(push-gateway|push-translator|push-frontend|push-all|release):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-18s$(NC) %s\n", $$1, $$2}'
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
	@$(MAKE) setup-dns
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
	@echo "   Frontend:     $(GREEN)https://$(LOCAL_DOMAIN)$(NC)"
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

_generate-backend-env: ## Generate backend .env (gateway + translator)
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
	@echo "CORS_ORIGINS=http://localhost:3100,http://localhost:3000,http://127.0.0.1:3100" >> $(GATEWAY_DIR)/.env
	@echo "ALLOWED_ORIGINS=http://localhost:3100,http://localhost:3000" >> $(GATEWAY_DIR)/.env
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
	@echo "EMAIL_FROM_NAME=Meeshy" >> $(GATEWAY_DIR)/.env
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
	@echo "  $(YELLOW)→ Génération des certificats pour: *.$(LOCAL_DOMAIN), $(LOCAL_DOMAIN), localhost$(NC)"
	@# Générer pour le frontend (Next.js)
	@cd $(WEB_DIR)/.cert && mkcert \
		-key-file localhost-key.pem \
		-cert-file localhost.pem \
		"*.$(LOCAL_DOMAIN)" \
		"$(LOCAL_DOMAIN)" \
		localhost \
		127.0.0.1 \
		::1 \
		$(HOST_IP)
	@# Copier pour Docker/Traefik
	@cp $(WEB_DIR)/.cert/localhost.pem $(CERTS_DIR)/cert.pem
	@cp $(WEB_DIR)/.cert/localhost-key.pem $(CERTS_DIR)/key.pem
	@echo "  $(GREEN)✓ Certificats générés et copiés$(NC)"
	@echo ""
	@echo "$(BOLD)📍 Fichiers créés:$(NC)"
	@echo "    $(WEB_DIR)/.cert/localhost.pem      (Next.js)"
	@echo "    $(WEB_DIR)/.cert/localhost-key.pem  (Next.js)"
	@echo "    $(CERTS_DIR)/cert.pem               (Docker/Traefik)"
	@echo "    $(CERTS_DIR)/key.pem                (Docker/Traefik)"
	@echo ""
	@echo "$(BOLD)🌐 Domaines couverts:$(NC)"
	@echo "    *.$(LOCAL_DOMAIN) (wildcard)"
	@echo "    $(LOCAL_DOMAIN)"
	@echo "    localhost, 127.0.0.1, $(HOST_IP)"

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

install: ## Installer toutes les dépendances (JS + Python)
	@echo "$(BLUE)📦 Installation des dépendances JavaScript avec $(JS_RUNTIME)...$(NC)"
	@$(JS_RUNTIME) install
	@echo ""
	@echo "$(BLUE)📦 Installation des dépendances Python (via pyenv Python 3.11)...$(NC)"
	@cd $(TRANSLATOR_DIR) && \
		if [ -f .python-version ]; then \
			PYENV_VERSION=$$(cat .python-version) && \
			echo "  Utilisation de Python $$PYENV_VERSION (pyenv)" && \
			~/.pyenv/versions/$$PYENV_VERSION/bin/python -m venv .venv 2>/dev/null || python3 -m venv .venv; \
		else \
			python3 -m venv .venv; \
		fi && \
		. .venv/bin/activate && \
		pip install -q --upgrade pip && \
		pip install -r requirements.txt
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

install-python: ## Installer uniquement les dépendances Python
	@echo "$(BLUE)📦 Installation des dépendances Python (via pyenv Python 3.11)...$(NC)"
	@cd $(TRANSLATOR_DIR) && \
		if [ -f .python-version ]; then \
			PYENV_VERSION=$$(cat .python-version) && \
			echo "  Utilisation de Python $$PYENV_VERSION (pyenv)" && \
			~/.pyenv/versions/$$PYENV_VERSION/bin/python -m venv .venv 2>/dev/null || python3 -m venv .venv; \
		else \
			python3 -m venv .venv; \
		fi && \
		. .venv/bin/activate && \
		pip install -q --upgrade pip && \
		pip install -q -r requirements.txt
	@echo "$(GREEN)✅ Dépendances Python installées$(NC)"

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
	@echo "CORS_ORIGINS=https://$(LOCAL_DOMAIN),https://app.$(LOCAL_DOMAIN),https://gate.$(LOCAL_DOMAIN),https://api.$(LOCAL_DOMAIN)" >> $(GATEWAY_DIR)/.env
	@# Translator .env
	@echo "ENVIRONMENT=development" > $(TRANSLATOR_DIR)/.env
	@echo "DATABASE_URL=mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true" >> $(TRANSLATOR_DIR)/.env
	@echo "REDIS_URL=redis://localhost:6379" >> $(TRANSLATOR_DIR)/.env
	@echo "PORT=8000" >> $(TRANSLATOR_DIR)/.env
	@echo "HOST=0.0.0.0" >> $(TRANSLATOR_DIR)/.env
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
	@tmux new-window -t meeshy -n web \
		"cd $(CURDIR)/$(WEB_DIR) && echo '🎨 Web HTTPS ($(LOCAL_DOMAIN) -> :3100)'; $(JS_RUNTIME) run dev:https; read"
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
	@echo "   Frontend:     $(GREEN)https://$(LOCAL_DOMAIN)$(NC)"
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
	@if [ -f "$(WEB_PID)" ]; then kill $$(cat $(WEB_PID)) 2>/dev/null || true; rm -f $(WEB_PID); fi
	@# Tuer par port en fallback
	@lsof -ti:3000 | xargs kill -9 2>/dev/null || true
	@lsof -ti:3100 | xargs kill -9 2>/dev/null || true
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

setup-network: ## 🔧 Configurer le réseau (DNS + certificats)
	@echo "$(BLUE)🔧 Configuration du réseau pour $(HOST)...$(NC)"
	@$(MAKE) setup-dns HOST=$(HOST) LOCAL_DOMAIN=$(LOCAL_DOMAIN)
	@$(MAKE) setup-certs-network HOST=$(HOST) LOCAL_DOMAIN=$(LOCAL_DOMAIN)

setup-dns: ## 🌐 Configurer /etc/hosts pour *.meeshy.local (cross-platform)
	@echo "$(BLUE)🌐 Configuration DNS pour $(LOCAL_DOMAIN)...$(NC)"
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
	@# Générer aussi la config dnsmasq pour le DNS réseau (optionnel)
	@mkdir -p $(COMPOSE_DIR)/config
	@if [ -f "$(COMPOSE_DIR)/config/dnsmasq.conf.template" ]; then \
		sed -e 's/__HOST_IP__/$(HOST_IP)/g' \
			-e 's/__LOCAL_DOMAIN__/$(LOCAL_DOMAIN)/g' \
			$(COMPOSE_DIR)/config/dnsmasq.conf.template > $(COMPOSE_DIR)/config/dnsmasq.conf 2>/dev/null || true; \
		echo "  $(GREEN)✓ Config dnsmasq générée (pour accès réseau)$(NC)"; \
	fi
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
	@mkcert -install 2>/dev/null || true
	@mkdir -p $(WEB_DIR)/.cert $(CERTS_DIR)
	@echo "  $(YELLOW)Génération des certificats pour: localhost, $(HOST_IP), $(HOST), *.$(LOCAL_DOMAIN)$(NC)"
	@cd $(WEB_DIR)/.cert && mkcert \
		-key-file localhost-key.pem \
		-cert-file localhost.pem \
		localhost \
		127.0.0.1 \
		::1 \
		$(HOST_IP) \
		$(HOST) \
		"*.$(LOCAL_DOMAIN)" \
		$(LOCAL_DOMAIN)
	@ln -sf ../../../../$(WEB_DIR)/.cert/localhost.pem $(CERTS_DIR)/cert.pem 2>/dev/null || true
	@ln -sf ../../../../$(WEB_DIR)/.cert/localhost-key.pem $(CERTS_DIR)/key.pem 2>/dev/null || true
	@echo "  $(GREEN)✓ Certificats générés$(NC)"

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
	@echo "CORS_ORIGINS=https://localhost:3100,https://$(HOST_IP):3100,https://$(HOST):3100,https://$(LOCAL_DOMAIN):3100" >> $(GATEWAY_DIR)/.env
	@# Translator .env
	@echo "ENVIRONMENT=development" > $(TRANSLATOR_DIR)/.env
	@echo "DATABASE_URL=mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true" >> $(TRANSLATOR_DIR)/.env
	@echo "REDIS_URL=redis://localhost:6379" >> $(TRANSLATOR_DIR)/.env
	@echo "PORT=8000" >> $(TRANSLATOR_DIR)/.env
	@echo "HOST=0.0.0.0" >> $(TRANSLATOR_DIR)/.env
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
	@tmux new-window -t meeshy -n web \
		"cd $(CURDIR)/$(WEB_DIR) && echo '🎨 Web HTTPS ($(HOST):3100)'; $(JS_RUNTIME) run dev:https; read"
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
	@echo "   Frontend:      $(GREEN)https://$(HOST):3100$(NC)"
	@echo "   Gateway API:   $(GREEN)https://$(HOST):3000$(NC)"
	@echo "   Translator:    $(GREEN)http://$(HOST):8000$(NC)"
	@echo ""
	@echo "$(BOLD)🔧 Via domaine local:$(NC)"
	@echo "   Frontend:      $(GREEN)https://$(LOCAL_DOMAIN):3100$(NC)"
	@echo ""
	@echo "$(BOLD)📡 Serveur DNS local:$(NC)"
	@echo "   $(CYAN)$(HOST_IP):53$(NC) (configurez vos appareils pour l'utiliser)"
	@echo ""
	@echo "$(BOLD)📋 Ou ajoutez dans /etc/hosts des autres machines:$(NC)"
	@echo "   $(CYAN)$(HOST_IP)    $(HOST) $(LOCAL_DOMAIN)$(NC)"

share-cert: ## 📱 Partager le certificat CA pour mobiles
	@echo "$(BLUE)📱 Partage du certificat CA pour appareils mobiles...$(NC)"
	@CA_ROOT=$$(mkcert -CAROOT 2>/dev/null); \
	if [ -n "$$CA_ROOT" ] && [ -f "$$CA_ROOT/rootCA.pem" ]; then \
		echo ""; \
		echo "$(BOLD)📍 Certificat CA:$(NC)"; \
		echo "   $(CYAN)$$CA_ROOT/rootCA.pem$(NC)"; \
		echo ""; \
		echo "$(BOLD)🔧 Options pour installer sur mobile:$(NC)"; \
		echo ""; \
		echo "  $(YELLOW)Option 1: Serveur HTTP temporaire$(NC)"; \
		echo "   Exécutez: cd $$CA_ROOT && python3 -m http.server 8888"; \
		echo "   Puis ouvrez: http://$(HOST_IP):8888/rootCA.pem sur votre mobile"; \
		echo ""; \
		echo "  $(YELLOW)Option 2: AirDrop (macOS -> iPhone)$(NC)"; \
		echo "   Fichier: $$CA_ROOT/rootCA.pem"; \
		echo ""; \
		echo "  $(YELLOW)Option 3: Email$(NC)"; \
		echo "   Envoyez rootCA.pem par email et ouvrez sur mobile"; \
		echo ""; \
		echo "$(BOLD)📲 Après transfert sur iPhone:$(NC)"; \
		echo "   1. Ouvrez le fichier -> Profil téléchargé"; \
		echo "   2. Réglages -> Général -> VPN et gestion -> Installer le profil"; \
		echo "   3. Réglages -> Général -> Informations -> Réglages des certificats"; \
		echo "   4. Activer la confiance pour le certificat"; \
	else \
		echo "$(RED)❌ CA root non trouvé. Exécutez d'abord: mkcert -install$(NC)"; \
	fi

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
	@echo "   Frontend:      $(GREEN)https://$(LOCAL_DOMAIN)$(NC)  ou  $(GREEN)https://app.$(LOCAL_DOMAIN)$(NC)"
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

docker-infra: ## Démarrer l'infrastructure avec Traefik HTTPS (MongoDB + Redis)
	@if [ "$(HAS_DOCKER)" != "yes" ]; then \
		echo "$(RED)❌ Docker non disponible$(NC)"; \
		exit 1; \
	fi
	@# Vérifier les certificats
	@if [ ! -f "$(CERTS_DIR)/cert.pem" ]; then \
		echo "$(YELLOW)⚠️  Certificats manquants, exécution de 'make setup-certs'...$(NC)"; \
		$(MAKE) setup-certs; \
	fi
	@echo "$(BLUE)🐳 Démarrage de l'infrastructure avec HTTPS (Traefik + MongoDB + Redis)...$(NC)"
	@docker compose -f $(COMPOSE_LOCAL) up -d
	@echo "$(GREEN)✅ Infrastructure démarrée$(NC)"
	@echo ""
	@echo "$(BLUE)📍 Services:$(NC)"
	@echo "   - Traefik:  $(GREEN)https://localhost$(NC) (reverse proxy)"
	@echo "   - Dashboard: $(GREEN)http://localhost:8080$(NC) (Traefik UI)"
	@echo "   - MongoDB:  mongodb://localhost:27017"
	@echo "   - Redis:    redis://localhost:6379"

docker-infra-simple: ## Démarrer infrastructure simple sans HTTPS (MongoDB + Redis uniquement)
	@if [ "$(HAS_DOCKER)" != "yes" ]; then \
		echo "$(RED)❌ Docker non disponible$(NC)"; \
		exit 1; \
	fi
	@echo "$(BLUE)🐳 Démarrage de l'infrastructure simple (MongoDB + Redis)...$(NC)"
	@docker compose -f $(COMPOSE_DEV) up -d
	@echo "$(GREEN)✅ Infrastructure démarrée$(NC)"
	@echo ""
	@echo "$(BLUE)📍 Services:$(NC)"
	@echo "   - MongoDB: mongodb://localhost:27017"
	@echo "   - Redis:   redis://localhost:6379"

docker-start: ## Démarrer tous les services via Docker Compose (localhost)
	@if [ "$(HAS_DOCKER)" != "yes" ]; then \
		echo "$(RED)❌ Docker non disponible$(NC)"; \
		exit 1; \
	fi
	@echo "$(BLUE)🐳 Démarrage de tous les services Meeshy...$(NC)"
	@docker compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) up -d
	@echo "$(GREEN)✅ Services démarrés$(NC)"
	@$(MAKE) urls

docker-start-network: ## 🌐 Démarrer tous les services Docker avec accès réseau
	@if [ "$(HAS_DOCKER)" != "yes" ]; then \
		echo "$(RED)❌ Docker non disponible$(NC)"; \
		exit 1; \
	fi
	@echo "$(CYAN)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(CYAN)║   MEESHY - Docker 100% avec Accès Réseau (Mobile/Devices)   ║$(NC)"
	@echo "$(CYAN)╚══════════════════════════════════════════════════════════════╝$(NC)"
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
	@echo "NEXT_PUBLIC_API_URL=https://$(LOCAL_DOMAIN)/api" >> $(COMPOSE_DIR)/.env.network
	@echo "NEXT_PUBLIC_WS_URL=wss://$(LOCAL_DOMAIN)" >> $(COMPOSE_DIR)/.env.network
	@echo "NEXT_PUBLIC_BACKEND_URL=https://$(LOCAL_DOMAIN)" >> $(COMPOSE_DIR)/.env.network
	@echo "FRONTEND_URL=https://$(LOCAL_DOMAIN)" >> $(COMPOSE_DIR)/.env.network
	@echo "  $(GREEN)✓ .env.network généré$(NC)"
	@echo ""
	@# Démarrer avec le profil full (tous les services)
	@echo "$(BLUE)🐳 Démarrage de tous les services Docker...$(NC)"
	@docker compose -f $(COMPOSE_LOCAL) --env-file $(COMPOSE_DIR)/.env.network --profile full up -d
	@echo ""
	@echo "$(GREEN)✅ Services démarrés avec accès réseau$(NC)"
	@echo ""
	@echo "$(BOLD)📱 Accès par sous-domaine:$(NC)"
	@echo "   Frontend:     $(GREEN)https://$(LOCAL_DOMAIN)$(NC)  ou  $(GREEN)https://app.$(LOCAL_DOMAIN)$(NC)"
	@echo "   Gateway API:  $(GREEN)https://gate.$(LOCAL_DOMAIN)$(NC)  ou  $(GREEN)https://api.$(LOCAL_DOMAIN)$(NC)"
	@echo "   Translator:   $(GREEN)https://ml.$(LOCAL_DOMAIN)$(NC)  ou  $(GREEN)https://translate.$(LOCAL_DOMAIN)$(NC)"
	@echo "   MongoDB UI:   $(GREEN)https://mongo.$(LOCAL_DOMAIN)$(NC)  (admin/admin)"
	@echo "   Redis UI:     $(GREEN)https://redis.$(LOCAL_DOMAIN)$(NC)"
	@echo "   Traefik UI:   $(GREEN)http://$(HOST):8080$(NC)"
	@echo ""
	@echo "$(BOLD)📡 Configuration DNS:$(NC)"
	@echo "   Serveur DNS:  $(GREEN)$(HOST_IP):53$(NC)"
	@echo "   Résout:       $(CYAN)*.$(LOCAL_DOMAIN) -> $(HOST_IP)$(NC)"
	@echo ""
	@echo "$(YELLOW)💡 Pour les mobiles: make share-cert$(NC)"

docker-stop: ## Arrêter tous les services Docker
	@echo "$(YELLOW)⏹️  Arrêt des services Docker...$(NC)"
	@docker compose -f $(COMPOSE_DEV) down 2>/dev/null || true
	@docker compose -f $(COMPOSE_LOCAL) down 2>/dev/null || true
	@docker compose -f $(COMPOSE_PROD) down 2>/dev/null || true
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
# DOCKER HEALTH TESTS
# =============================================================================

docker-test: ## Tester les services Docker (MODE=dev|local|prod)
	@echo "$(BLUE)🧪 Test des services Docker...$(NC)"
	@python3 $(COMPOSE_SCRIPTS)/test-services.py --mode $(or $(MODE),local)

docker-test-dev: ## Tester les services localhost (HTTP)
	@echo "$(BLUE)🧪 Test des services localhost...$(NC)"
	@python3 $(COMPOSE_SCRIPTS)/test-services.py --mode dev

docker-test-local: ## Tester les services *.meeshy.local (HTTPS)
	@echo "$(BLUE)🧪 Test des services meeshy.local...$(NC)"
	@python3 $(COMPOSE_SCRIPTS)/test-services.py --mode local

docker-test-prod: ## Tester les services *.meeshy.me (HTTPS)
	@echo "$(BLUE)🧪 Test des services meeshy.me...$(NC)"
	@python3 $(COMPOSE_SCRIPTS)/test-services.py --mode prod

# =============================================================================
# BUILD IMAGES DOCKER
# =============================================================================
# Variables pour le versioning (peut être surchargé: make push-all TAG=v1.2.3)
DOCKER_REGISTRY ?= isopen
TAG ?= latest

# Préparation des dépendances partagées avant build Docker
_prepare-docker-build:
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

build-gateway: _prepare-docker-build ## Builder l'image Gateway
	@echo "$(BLUE)🔨 Build de l'image Gateway ($(DOCKER_REGISTRY)/meeshy-gateway:$(TAG))...$(NC)"
	@docker build -t $(DOCKER_REGISTRY)/meeshy-gateway:$(TAG) -f $(INFRA_DIR)/docker/images/gateway/Dockerfile .
	@if [ "$(TAG)" != "latest" ]; then \
		docker tag $(DOCKER_REGISTRY)/meeshy-gateway:$(TAG) $(DOCKER_REGISTRY)/meeshy-gateway:latest; \
	fi
	@echo "$(GREEN)✅ Image Gateway buildée$(NC)"

build-translator: _prepare-docker-build ## Builder l'image Translator
	@echo "$(BLUE)🔨 Build de l'image Translator ($(DOCKER_REGISTRY)/meeshy-translator:$(TAG))...$(NC)"
	@docker build -t $(DOCKER_REGISTRY)/meeshy-translator:$(TAG) -f $(INFRA_DIR)/docker/images/translator/Dockerfile .
	@if [ "$(TAG)" != "latest" ]; then \
		docker tag $(DOCKER_REGISTRY)/meeshy-translator:$(TAG) $(DOCKER_REGISTRY)/meeshy-translator:latest; \
	fi
	@echo "$(GREEN)✅ Image Translator buildée$(NC)"

build-frontend: _prepare-docker-build ## Builder l'image Frontend
	@echo "$(BLUE)🔨 Build de l'image Frontend ($(DOCKER_REGISTRY)/meeshy-frontend:$(TAG))...$(NC)"
	@docker build -t $(DOCKER_REGISTRY)/meeshy-frontend:$(TAG) -f $(INFRA_DIR)/docker/images/web/Dockerfile .
	@if [ "$(TAG)" != "latest" ]; then \
		docker tag $(DOCKER_REGISTRY)/meeshy-frontend:$(TAG) $(DOCKER_REGISTRY)/meeshy-frontend:latest; \
	fi
	@echo "$(GREEN)✅ Image Frontend buildée$(NC)"

build-all-docker: build-gateway build-translator build-frontend ## Builder toutes les images Docker
	@echo "$(GREEN)✅ Toutes les images buildées$(NC)"
	@echo ""
	@echo "$(BLUE)📦 Images créées:$(NC)"
	@docker images | grep "$(DOCKER_REGISTRY)/meeshy" | head -10

# =============================================================================
# PUSH IMAGES DOCKER HUB
# =============================================================================

push-gateway: ## Push l'image Gateway vers Docker Hub
	@echo "$(BLUE)📤 Push de l'image Gateway...$(NC)"
	@docker push $(DOCKER_REGISTRY)/meeshy-gateway:$(TAG)
	@if [ "$(TAG)" != "latest" ]; then \
		docker push $(DOCKER_REGISTRY)/meeshy-gateway:latest; \
	fi
	@echo "$(GREEN)✅ Gateway pushée$(NC)"

push-translator: ## Push l'image Translator vers Docker Hub
	@echo "$(BLUE)📤 Push de l'image Translator...$(NC)"
	@docker push $(DOCKER_REGISTRY)/meeshy-translator:$(TAG)
	@if [ "$(TAG)" != "latest" ]; then \
		docker push $(DOCKER_REGISTRY)/meeshy-translator:latest; \
	fi
	@echo "$(GREEN)✅ Translator pushée$(NC)"

push-frontend: ## Push l'image Frontend vers Docker Hub
	@echo "$(BLUE)📤 Push de l'image Frontend...$(NC)"
	@docker push $(DOCKER_REGISTRY)/meeshy-frontend:$(TAG)
	@if [ "$(TAG)" != "latest" ]; then \
		docker push $(DOCKER_REGISTRY)/meeshy-frontend:latest; \
	fi
	@echo "$(GREEN)✅ Frontend pushée$(NC)"

push-all: push-gateway push-translator push-frontend ## Push toutes les images vers Docker Hub
	@echo ""
	@echo "$(GREEN)✅ Toutes les images pushées vers $(DOCKER_REGISTRY)$(NC)"
	@echo "   - $(DOCKER_REGISTRY)/meeshy-gateway:$(TAG)"
	@echo "   - $(DOCKER_REGISTRY)/meeshy-translator:$(TAG)"
	@echo "   - $(DOCKER_REGISTRY)/meeshy-frontend:$(TAG)"

# Build + Push en une commande
release: build-all-docker push-all ## Builder et pusher toutes les images (TAG=v1.0.0)
	@echo ""
	@echo "$(GREEN)🚀 Release $(TAG) publiée!$(NC)"

# Vérifier l'authentification Docker Hub
docker-login: ## Se connecter à Docker Hub
	@echo "$(BLUE)🔐 Connexion à Docker Hub...$(NC)"
	@docker login
	@echo "$(GREEN)✅ Connecté$(NC)"

docker-images: ## Lister les images Meeshy locales
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
			. .venv/bin/activate && python -m pytest tests/ -v --tb=short 2>&1 || ERRORS=$$((ERRORS+1)); \
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
	@cd $(TRANSLATOR_DIR) && \
		if [ -d .venv ]; then \
			. .venv/bin/activate && python -m pytest tests/ -v --tb=short; \
		else \
			echo "$(RED)❌ venv non trouvé. Lancez: make install$(NC)"; \
			exit 1; \
		fi

test-python-fast: ## Lancer les tests Python rapides (sans modèles ML)
	@echo "$(BLUE)🧪 Tests Python rapides (sans ML)...$(NC)"
	@cd $(TRANSLATOR_DIR) && \
		if [ -d .venv ]; then \
			. .venv/bin/activate && python -m pytest tests/ -v --tb=short -m "not slow" -k "not model"; \
		else \
			echo "$(RED)❌ venv non trouvé. Lancez: make install$(NC)"; \
			exit 1; \
		fi

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
