#!/bin/bash

# Script de génération des configurations de production sécurisées pour Meeshy
# Ce script génère de nouvelles clés JWT, mots de passe sécurisés et configurations
# pour le déploiement en production sur Digital Ocean

set -e

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
SECRETS_DIR="$PROJECT_ROOT/secrets"
CONFIG_DIR="$PROJECT_ROOT/config"

# Fonctions utilitaires
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Fonction pour générer une chaîne aléatoire sécurisée
generate_random_string() {
    local length=${1:-32}
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -base64 $length | tr -d "=+/\n\r" | cut -c1-$length
    else
        # Fallback si openssl n'est pas disponible
        cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w $length | head -n 1
    fi
}

# Fonction pour générer un mot de passe sécurisé
generate_secure_password() {
    local length=${1:-16}
    # Génère un mot de passe avec majuscules, minuscules, chiffres et symboles
    if command -v openssl >/dev/null 2>&1; then
        # Utiliser openssl pour générer un mot de passe sécurisé
        openssl rand -base64 $length | tr -d "=+/\n\r" | cut -c1-$length
    else
        # Fallback
        cat /dev/urandom | tr -dc 'a-zA-Z0-9!@#$%^&*' | fold -w $length | head -n 1
    fi
}

# Fonction pour générer un hash bcrypt
generate_bcrypt_hash() {
    local password="$1"
    local username="$2"
    
    # Utiliser htpasswd si disponible
    if command -v htpasswd >/dev/null 2>&1; then
        # Utiliser htpasswd avec l'option -nb pour non-interactif
        local hash=$(htpasswd -nbB "$username" "$password" | cut -d: -f2)
        echo "$hash"
    else
        # Fallback: générer un hash simple (moins sécurisé)
        log_warning "htpasswd non disponible, génération d'un hash simple"
        local hash=$(echo -n "$password" | openssl dgst -sha256 -binary | base64)
        echo "$hash"
    fi
}

# Fonction pour créer le répertoire secrets
create_secrets_directory() {
    log_info "Création du répertoire secrets..."
    
    if [ ! -d "$SECRETS_DIR" ]; then
        mkdir -p "$SECRETS_DIR"
        log_success "Répertoire secrets créé: $SECRETS_DIR"
    else
        log_info "Répertoire secrets existe déjà: $SECRETS_DIR"
    fi
    
    # Sécuriser le répertoire
    chmod 700 "$SECRETS_DIR"
    log_success "Permissions sécurisées appliquées au répertoire secrets"
}

# Fonction pour générer les secrets
generate_secrets() {
    log_info "Génération des secrets sécurisés..."
    
    # JWT Secret (64 caractères)
    JWT_SECRET=$(generate_random_string 64)
    
    # Mots de passe sécurisés
    ADMIN_PASSWORD=$(generate_secure_password 20)
    MEESHY_PASSWORD=$(generate_secure_password 20)
    ATABETH_PASSWORD=$(generate_secure_password 20)
    MONGODB_PASSWORD=$(generate_secure_password 24)
    REDIS_PASSWORD=$(generate_secure_password 20)
    
    # Emails de production
    ADMIN_EMAIL="admin@meeshy.me"
    MEESHY_EMAIL="meeshy@meeshy.me"
    ATABETH_EMAIL="atabeth@meeshy.me"
    SUPPORT_EMAIL="support@meeshy.me"
    FEEDBACK_EMAIL="feedback@meeshy.me"
    
    # Domaine de production
    DOMAIN="meeshy.me"
    
    # Générer les hashes bcrypt complets pour les authentifications
    TRAEFIK_USERS="admin:$(generate_bcrypt_hash "$ADMIN_PASSWORD" "admin")"
    API_USERS="admin:$(generate_bcrypt_hash "$ADMIN_PASSWORD" "admin")"
    MONGO_USERS="admin:$(generate_bcrypt_hash "$ADMIN_PASSWORD" "admin")"
    REDIS_USERS="admin:$(generate_bcrypt_hash "$ADMIN_PASSWORD" "admin")"
    
    log_success "Secrets générés avec succès"
}

# Fonction pour créer le fichier des mots de passe en clair
create_clear_passwords_file() {
    log_info "Création du fichier des mots de passe en clair..."
    
    local clear_file="$SECRETS_DIR/clear.txt"
    
    cat > "$clear_file" << EOF
# ===== MEESHY - MOTS DE PASSE EN CLAIR =====
# Fichier généré automatiquement - NE PAS COMMITER
# Date de génération: $(date)
# 
# ⚠️  ATTENTION: Ce fichier contient les mots de passe en clair
# ⚠️  Ne jamais le commiter dans Git ou le partager
# ⚠️  Ne JAMAIS déployer ce fichier sur le serveur de production
# ⚠️  Conserver ce fichier dans un endroit sécurisé EN LOCAL UNIQUEMENT

# ===== UTILISATEURS DE L'APPLICATION =====
# Mots de passe pour se connecter à l'application Meeshy
ADMIN_PASSWORD_CLEAR="$ADMIN_PASSWORD"
MEESHY_PASSWORD_CLEAR="$MEESHY_PASSWORD"
ATABETH_PASSWORD_CLEAR="$ATABETH_PASSWORD"

# ===== SERVICES D'ADMINISTRATION =====
# Mots de passe pour les services d'administration
TRAEFIK_PASSWORD_CLEAR="$ADMIN_PASSWORD"
API_PASSWORD_CLEAR="$ADMIN_PASSWORD"
MONGO_PASSWORD_CLEAR="$ADMIN_PASSWORD"
REDIS_PASSWORD_CLEAR="$ADMIN_PASSWORD"

# ===== SERVICES DE BASE DE DONNÉES =====
# Mots de passe pour les services de base de données
MONGODB_PASSWORD_CLEAR="$MONGODB_PASSWORD"
REDIS_PASSWORD_CLEAR="$REDIS_PASSWORD"

# ===== INSTRUCTIONS D'UTILISATION =====
# 
# 🌐 Traefik Dashboard:
#    URL: https://traefik.meeshy.me
#    Utilisateur: admin
#    Mot de passe: $ADMIN_PASSWORD
#
# 🏠 Application Meeshy:
#    URL: https://meeshy.me
#    Utilisateur Admin: admin / $ADMIN_PASSWORD
#    Utilisateur Meeshy: meeshy / $MEESHY_PASSWORD
#    Utilisateur Atabeth: atabeth / $ATABETH_PASSWORD
#
# 🗄️ MongoDB (NoSQLClient):
#    URL: https://mongo.meeshy.me
#    Connexion: mongodb://meeshy:$MONGODB_PASSWORD@meeshy-database:27017/meeshy
#
# 🔴 Redis (P3X Redis UI):
#    URL: https://redis.meeshy.me
#    Mot de passe: $REDIS_PASSWORD
#
# ===== HASHES BCRYPT GÉNÉRÉS =====
# Ces hashes sont utilisés dans docker-compose.yml
TRAEFIK_USERS_HASH="admin:$(generate_bcrypt_hash "$ADMIN_PASSWORD" "admin")"
API_USERS_HASH="admin:$(generate_bcrypt_hash "$ADMIN_PASSWORD" "admin")"
MONGO_USERS_HASH="admin:$(generate_bcrypt_hash "$ADMIN_PASSWORD" "admin")"
REDIS_USERS_HASH="admin:$(generate_bcrypt_hash "$ADMIN_PASSWORD" "admin")"
EOF

    # Sécuriser le fichier
    chmod 600 "$clear_file"
    log_success "Fichier des mots de passe en clair créé: $clear_file"
}

# Fonction pour créer le fichier de secrets
create_secrets_file() {
    log_info "Création du fichier de secrets..."
    
    local secrets_file="$SECRETS_DIR/production-secrets.env"
    
    cat > "$secrets_file" << EOF
# ===== MEESHY PRODUCTION SECRETS =====
# Fichier généré automatiquement - NE PAS COMMITER
# Date de génération: $(date)
# 
# ⚠️  ATTENTION: Ce fichier contient des informations sensibles
# ⚠️  Ne jamais le commiter dans Git ou le partager
# ⚠️  Conserver ce fichier dans un endroit sécurisé

# ===== JWT AUTHENTICATION =====
JWT_SECRET="$JWT_SECRET"
JWT_EXPIRES_IN="7d"

# ===== MOTS DE PASSE UTILISATEURS =====
# Mots de passe pour les utilisateurs par défaut (cryptés avec bcrypt)
ADMIN_PASSWORD="$ADMIN_PASSWORD"
MEESHY_PASSWORD="$MEESHY_PASSWORD"
ATABETH_PASSWORD="$ATABETH_PASSWORD"

# ===== MOTS DE PASSE EN CLAIR (pour référence) =====
# Mots de passe en clair pour connexion à l'application
ADMIN_PASSWORD_CLEAR="$ADMIN_PASSWORD"
MEESHY_PASSWORD_CLEAR="$MEESHY_PASSWORD"
ATABETH_PASSWORD_CLEAR="$ATABETH_PASSWORD"

# ===== MOTS DE PASSE SERVICES =====
# Mots de passe pour les services
MONGODB_PASSWORD="$MONGODB_PASSWORD"
REDIS_PASSWORD="$REDIS_PASSWORD"

# ===== EMAILS DE PRODUCTION =====
ADMIN_EMAIL="$ADMIN_EMAIL"
MEESHY_EMAIL="$MEESHY_EMAIL"
ATABETH_EMAIL="$ATABETH_EMAIL"
SUPPORT_EMAIL="$SUPPORT_EMAIL"
FEEDBACK_EMAIL="$FEEDBACK_EMAIL"

# ===== DOMAINE DE PRODUCTION =====
DOMAIN="$DOMAIN"

# ===== HASHES D'AUTHENTIFICATION =====
# Hashes bcrypt pour les authentifications (générés avec htpasswd)
TRAEFIK_USERS="$TRAEFIK_USERS"
API_USERS="$API_USERS"
MONGO_USERS="$MONGO_USERS"
REDIS_USERS="$REDIS_USERS"

# ===== CONFIGURATION UTILISATEURS DÉTAILLÉE =====
# Configuration utilisateur Meeshy (BIGBOSS)
MEESHY_USERNAME="meeshy"
MEESHY_FIRST_NAME="Meeshy"
MEESHY_LAST_NAME="Sama"
MEESHY_ROLE="BIGBOSS"
MEESHY_SYSTEM_LANGUAGE="en"
MEESHY_REGIONAL_LANGUAGE="fr"
MEESHY_CUSTOM_DESTINATION_LANGUAGE="pt"

# Configuration utilisateur Admin
ADMIN_USERNAME="admin"
ADMIN_FIRST_NAME="Admin"
ADMIN_LAST_NAME="Manager"
ADMIN_ROLE="ADMIN"
ADMIN_SYSTEM_LANGUAGE="es"
ADMIN_REGIONAL_LANGUAGE="de"
ADMIN_CUSTOM_DESTINATION_LANGUAGE="zh"

# Configuration utilisateur André Tabeth (entièrement configurable)
ATABETH_USERNAME="atabeth"
ATABETH_FIRST_NAME="André"
ATABETH_LAST_NAME="Tabeth"
ATABETH_ROLE="USER"
ATABETH_SYSTEM_LANGUAGE="fr"
ATABETH_REGIONAL_LANGUAGE="fr"
ATABETH_CUSTOM_DESTINATION_LANGUAGE="en"

# ===== CONFIGURATION BASE DE DONNÉES =====
# Forcer la réinitialisation pour la production
FORCE_DB_RESET="false"

# ===== INFORMATIONS DE DÉPLOIEMENT =====
# Informations pour le déploiement
DEPLOYMENT_DATE="$(date)"
DEPLOYMENT_VERSION="1.0.0-production"
DEPLOYMENT_ENV="production"
EOF

    # Sécuriser le fichier
    chmod 600 "$secrets_file"
    log_success "Fichier de secrets créé: $secrets_file"
    
    # Créer le fichier des mots de passe en clair
    create_clear_passwords_file
}

# Fonction pour créer le fichier de configuration de production
create_production_config() {
    log_info "Création du fichier de configuration de production..."
    
    local config_file="$CONFIG_DIR/production.env"
    
    # Créer le répertoire config s'il n'existe pas
    mkdir -p "$CONFIG_DIR"
    
    cat > "$config_file" << EOF
# ===== MEESHY PRODUCTION CONFIGURATION =====
# Configuration de production générée automatiquement
# Date de génération: $(date)
# 
# Ce fichier contient la configuration de production
# Les secrets sont dans le fichier séparé: secrets/production-secrets.env

# ===== DEPLOYMENT ENVIRONMENT =====
NODE_ENV=production
DEBUG=false
LOG_LEVEL=info
DEPLOYMENT_ENV=digitalocean
DEPLOYMENT_REGION=nyc3

# ===== DOMAIN CONFIGURATION =====
DOMAIN=$DOMAIN
CERTBOT_EMAIL=$ADMIN_EMAIL

# ===== DATABASE CONFIGURATION =====
DATABASE_TYPE=MONGODB
DATABASE_URL="mongodb://meeshy-database:27017/meeshy?replicaSet=rs0"
MONGODB_DATABASE=meeshy
MONGODB_USER=meeshy
MONGODB_PORT=27017

# ===== REDIS CONFIGURATION =====
REDIS_URL=redis://redis:6379
REDIS_PORT=6379

# ===== SERVICE PORTS =====
GATEWAY_PORT=3000
PORT=3000
TRANSLATOR_HTTP_PORT=8000
TRANSLATOR_GRPC_PORT=50051
FASTAPI_PORT=8000
GRPC_PORT=50051
FRONTEND_PORT=3100
HTTP_PORT=80
HTTPS_PORT=443

# ===== ZMQ CONFIGURATION =====
ZMQ_PORT=5555
ZMQ_TRANSLATOR_HOST=translator
ZMQ_TRANSLATOR_PUSH_PORT=5555
ZMQ_TRANSLATOR_SUB_PORT=5558
ZMQ_TRANSLATOR_PULL_PORT=5555
ZMQ_TRANSLATOR_PUB_PORT=5558
ZMQ_TIMEOUT=10000

# ===== TRANSLATION CONFIGURATION =====
SUPPORTED_LANGUAGES=fr,en,es,de,pt,zh,ja,ar
DEFAULT_LANGUAGE=fr
AUTO_DETECT_LANGUAGE=true
TRANSLATION_TIMEOUT=60
MAX_TEXT_LENGTH=5000
CONCURRENT_TRANSLATIONS=10
TRANSLATION_WORKERS=20

# ===== ML MODEL CONFIGURATION =====
BASIC_MODEL=Helsinki-NLP/opus-mt-en-fr
MEDIUM_MODEL=facebook/nllb-200-distilled-600M
PREMIUM_MODEL=facebook/nllb-200-distilled-600M
DEVICE=cpu
ML_BATCH_SIZE=8
GPU_MEMORY_FRACTION=0.8
QUANTIZATION_LEVEL=float16

# ===== MODEL MANAGEMENT =====
MODELS_PATH=/workspace/models
TORCH_HOME=/workspace/models
HF_HOME=/workspace/models
MODEL_CACHE_DIR=/workspace/models
AUTO_CLEANUP_CORRUPTED_MODELS=true
FORCE_MODEL_REDOWNLOAD=false
MODEL_DOWNLOAD_MAX_RETRIES=5
MODEL_DOWNLOAD_TIMEOUT=600
MODEL_DOWNLOAD_CONSECUTIVE_TIMEOUTS=5

# ===== WEBSOCKET CONFIGURATION =====
WS_MAX_CONNECTIONS=50000
WS_PING_INTERVAL=30000
WS_PING_TIMEOUT=10000

# ===== CORS CONFIGURATION =====
FRONTEND_URL=https://$DOMAIN
CORS_ORIGINS=https://$DOMAIN,https://www.$DOMAIN,https://gate.$DOMAIN,https://ml.$DOMAIN,https://traefik.$DOMAIN,https://mongo.$DOMAIN,https://redis.$DOMAIN
CORS_ORIGIN=\${CORS_ORIGINS}
ALLOWED_ORIGINS=https://$DOMAIN,https://www.$DOMAIN,https://gate.$DOMAIN,https://ml.$DOMAIN,https://traefik.$DOMAIN,https://mongo.$DOMAIN,https://redis.$DOMAIN

# ===== RATE LIMITING =====
RATE_LIMIT_MAX=5000
RATE_LIMIT_WINDOW=60000

# ===== FRONTEND CONFIGURATION =====
NEXT_PUBLIC_API_URL=https://gate.$DOMAIN
NEXT_PUBLIC_WS_URL=wss://gate.$DOMAIN
NEXT_PUBLIC_BACKEND_URL=https://gate.$DOMAIN
NEXT_PUBLIC_TRANSLATION_URL=https://ml.$DOMAIN
TRANSLATOR_URL=http://translator:8000
NEXT_PUBLIC_FRONTEND_URL=https://$DOMAIN

# ===== NEXT.JS CONFIGURATION =====
NEXT_TELEMETRY_DISABLED=1
NEXT_PUBLIC_DISABLE_CLIENT_TRANSLATION=true
NEXT_PUBLIC_USE_API_TRANSLATION_ONLY=true
NEXT_PUBLIC_DEBUG_LOGS=false

# ===== INTERNAL URLs =====
INTERNAL_BACKEND_URL=https://gate.meeshy.me
INTERNAL_WS_URL=ws://gateway:3000

# ===== DOCKER CONFIGURATION =====
DOCKER_BUILDKIT=1
DOCKER_DEFAULT_PLATFORM=linux/amd64
TRANSLATOR_IMAGE=isopen/meeshy-translator:latest
GATEWAY_IMAGE=isopen/meeshy-gateway:latest
FRONTEND_IMAGE=isopen/meeshy-web:latest

# ===== PERFORMANCE OPTIMIZATION =====
PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:256
OMP_NUM_THREADS=8
MKL_NUM_THREADS=8
NUMEXPR_NUM_THREADS=8
PYTHONUNBUFFERED=1

# ===== WORKER CONFIGURATION =====
WORKERS=8
NORMAL_WORKERS=4
ANY_WORKERS=2
NORMAL_WORKERS_DEFAULT=20
ANY_WORKERS_DEFAULT=8
NORMAL_WORKERS_MIN=4
ANY_WORKERS_MIN=2
NORMAL_WORKERS_MAX=100
ANY_WORKERS_MAX=50
NORMAL_WORKERS_SCALING_MAX=100
ANY_WORKERS_SCALING_MAX=50

# ===== MONITORING =====
HEALTH_CHECK_INTERVAL=30
HEALTH_CHECK_TIMEOUT=10
HEALTH_CHECK_RETRIES=3

# ===== SECURITY =====
HELMET_ENABLED=true
CONTENT_SECURITY_POLICY=true
SECURITY_HEADERS_ENABLED=true
CONTENT_SECURITY_POLICY_STRICT=true
HSTS_ENABLED=true
XSS_PROTECTION_ENABLED=true

# ===== LOGGING =====
LOG_FORMAT=json
LOG_FILE=/var/log/meeshy/meeshy.log
LOG_MAX_SIZE=100m
LOG_MAX_FILES=10
LOG_LEVEL_DEBUG=false
LOG_LEVEL_INFO=true
LOG_LEVEL_WARN=true
LOG_LEVEL_ERROR=true

# ===== BACKUP & RECOVERY =====
BACKUP_ENABLED=true
BACKUP_SCHEDULE="0 2 * * *"
BACKUP_RETENTION_DAYS=30
BACKUP_COMPRESSION=true
BACKUP_ENCRYPTION=true

# ===== NETWORKING =====
ENABLE_HTTPS=true
PROXY_ENABLED=true

# ===== OPTIMIZATION =====
ENABLE_COMPRESSION=true
ENABLE_MINIFICATION=true
ENABLE_CDN_CACHE=true
CACHE_INVALIDATION_ENABLED=true

# ===== SCALING =====
AUTO_SCALE_ENABLED=true
AUTO_SCALE_MIN_INSTANCES=2
AUTO_SCALE_MAX_INSTANCES=20
AUTO_SCALE_CPU_THRESHOLD=70

# ===== CLOUD PROVIDER =====
CLOUD_PROVIDER=digitalocean
DIGITALOCEAN_REGION=nyc3
DIGITALOCEAN_SIZE=s-4vcpu-8gb

# ===== MONITORING & ALERTS =====
MONITORING_ENABLED=true
METRICS_ENABLED=true
METRICS_PORT=9090
PROMETHEUS_ENABLED=true
ALERTS_ENABLED=true
ALERT_THRESHOLD_CPU=80
ALERT_THRESHOLD_MEMORY=85
ALERT_THRESHOLD_DISK=90

# ===== SSL/TLS =====
SSL_CERT_PATH=/etc/nginx/ssl/cert.pem
SSL_KEY_PATH=/etc/nginx/ssl/key.pem

# ===== FEATURE FLAGS =====
FEATURE_NEW_UI=true
FEATURE_ADVANCED_TRANSLATION=true
FEATURE_VIDEO_CHAT=false
FEATURE_VOICE_MESSAGES=false

# ===== COMPLIANCE =====
GDPR_COMPLIANCE=true
DATA_RETENTION_DAYS=365
ENABLE_AUDIT_LOGS=true
ENABLE_DATA_ENCRYPTION=true

# ===== INTEGRATION =====
ENABLE_API_RATE_LIMITING=true
API_RATE_LIMIT=10000

# ===== PERFORMANCE MONITORING =====
PERFORMANCE_MONITORING_ENABLED=true
PERFORMANCE_THRESHOLD_RESPONSE_TIME=2000
PERFORMANCE_THRESHOLD_MEMORY_USAGE=80
PERFORMANCE_THRESHOLD_CPU_USAGE=70

# ===== RELIABILITY =====
CIRCUIT_BREAKER_ENABLED=true
RETRY_MECHANISM_ENABLED=true
FALLBACK_MECHANISM_ENABLED=true

# ===== PRISMA CONFIGURATION =====
PRISMA_SCHEMA_PATH=
PRISMA_POOL_SIZE=50
PRISMA_QUERY_ENGINE_LIBRARY=
PRISMA_CLIENT_ENGINE_TYPE=library
PRISMA_DISABLE_WARNINGS=true

# ===== DEVELOPMENT =====
ENABLE_DEBUG_MODE=false
ENABLE_PROFILING=false
ENABLE_DEBUG_TOOLS=false

# ===== VERSION =====
DEPLOYMENT_VERSION=1.0.0-production

# ===== CONTACT =====
SUPPORT_EMAIL=$SUPPORT_EMAIL
FEEDBACK_EMAIL=$FEEDBACK_EMAIL

# ===== BRAND =====
BRAND_NAME=Meeshy
BRAND_COLOR=#3B82F6

# ===== CACHE CONFIGURATION =====
TRANSLATION_CACHE_TTL=3600
CACHE_MAX_ENTRIES=50000
EOF

    log_success "Fichier de configuration de production créé: $config_file"
}

# Fonction pour créer le fichier .gitignore pour les secrets
create_gitignore() {
    log_info "Création du fichier .gitignore pour les secrets..."
    
    local gitignore_file="$SECRETS_DIR/.gitignore"
    
    cat > "$gitignore_file" << EOF
# Fichiers de secrets - NE PAS COMMITER
*.env
*.key
*.pem
*.p12
*.pfx
*.jks
*.keystore
*.secret
*.password
*.token
*.credential

# Fichiers de configuration sensibles
production-secrets.env
secrets.env
credentials.env
auth.env

# Logs
*.log
logs/

# Fichiers temporaires
*.tmp
*.temp
*.bak
*.backup

# Fichiers de cache
*.cache
.cache/
cache/

# Fichiers de verrouillage
*.lock
.lock/
lock/
EOF

    log_success "Fichier .gitignore créé: $gitignore_file"
}

# Fonction pour afficher le résumé
show_summary() {
    log_success "🎉 Configuration de production générée avec succès !"
    echo ""
    echo -e "${BLUE}📋 Résumé de la génération:${NC}"
    echo -e "  • Répertoire secrets: ${CYAN}$SECRETS_DIR${NC}"
    echo -e "  • Fichier de secrets: ${CYAN}$SECRETS_DIR/production-secrets.env${NC}"
    echo -e "  • Fichier de config: ${CYAN}$CONFIG_DIR/production.env${NC}"
    echo -e "  • Fichier .gitignore: ${CYAN}$SECRETS_DIR/.gitignore${NC}"
    echo ""
    echo -e "${YELLOW}🔐 Informations de connexion générées:${NC}"
    echo -e "  • Admin: ${CYAN}admin${NC} / ${CYAN}$ADMIN_PASSWORD${NC}"
    echo -e "  • Meeshy: ${CYAN}meeshy${NC} / ${CYAN}$MEESHY_PASSWORD${NC}"
    echo -e "  • Atabeth: ${CYAN}atabeth${NC} / ${CYAN}$ATABETH_PASSWORD${NC}"
    echo ""
    echo -e "${YELLOW}📧 Emails configurés:${NC}"
    echo -e "  • Admin: ${CYAN}$ADMIN_EMAIL${NC}"
    echo -e "  • Meeshy: ${CYAN}$MEESHY_EMAIL${NC}"
    echo -e "  • Atabeth: ${CYAN}$ATABETH_EMAIL${NC}"
    echo -e "  • Support: ${CYAN}$SUPPORT_EMAIL${NC}"
    echo ""
    echo -e "${YELLOW}🌐 Domaine configuré:${NC}"
    echo -e "  • ${CYAN}$DOMAIN${NC}"
    echo ""
    echo -e "${RED}⚠️  IMPORTANT:${NC}"
    echo -e "  • Conservez le fichier ${CYAN}$SECRETS_DIR/production-secrets.env${NC} dans un endroit sécurisé"
    echo -e "  • Ne commitez JAMAIS ce fichier dans Git"
    echo -e "  • Transférez ces informations sur Digital Ocean dans un dossier sécurisé"
    echo -e "  • Utilisez ces configurations pour le déploiement en production"
    echo ""
    echo -e "${GREEN}🚀 Prochaines étapes:${NC}"
    echo -e "  1. Transférez le fichier de secrets sur Digital Ocean"
    echo -e "  2. Utilisez le script de reset de base de données"
    echo -e "  3. Déployez avec les nouvelles configurations"
    echo ""
}

# Fonction pour afficher l'aide
show_help() {
    echo -e "${BLUE}Générateur de Configuration de Production Meeshy${NC}"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --help                   Afficher cette aide"
    echo "  --force                  Forcer la régénération (écrase les fichiers existants)"
    echo ""
    echo "Description:"
    echo "  Ce script génère des configurations sécurisées pour le déploiement"
    echo "  en production de Meeshy sur Digital Ocean."
    echo ""
    echo "  Il crée:"
    echo "  • Des clés JWT sécurisées"
    echo "  • Des mots de passe forts pour tous les utilisateurs"
    echo "  • Des configurations de production optimisées"
    echo "  • Un fichier de secrets séparé et sécurisé"
    echo ""
    echo "Exemples:"
    echo "  $0                       # Génération normale"
    echo "  $0 --force              # Forcer la régénération"
    echo ""
}

# Fonction principale
main() {
    local force_regeneration=false
    
    # Parser les arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --help)
                show_help
                exit 0
                ;;
            --force)
                force_regeneration=true
                shift
                ;;
            *)
                log_error "Option inconnue: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    echo -e "${BLUE}🔐 Générateur de Configuration de Production Meeshy${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo ""
    
    # Vérifier si les fichiers existent déjà
    if [ "$force_regeneration" = false ] && [ -f "$SECRETS_DIR/production-secrets.env" ]; then
        log_warning "Le fichier de secrets existe déjà: $SECRETS_DIR/production-secrets.env"
        echo -e "${YELLOW}Utilisez --force pour forcer la régénération${NC}"
        exit 1
    fi
    
    # Créer le répertoire secrets
    create_secrets_directory
    
    # Générer les secrets
    generate_secrets
    
    # Créer les fichiers
    create_secrets_file
    create_production_config
    create_gitignore
    
    # Afficher le résumé
    show_summary
}

# Exécuter le script principal
main "$@"
