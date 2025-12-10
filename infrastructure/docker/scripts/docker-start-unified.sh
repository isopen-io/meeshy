#!/bin/bash

# Script de démarrage pour Container Unifié Meeshy
set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# ===== SYSTÈME DE LOGGING UNIFIÉ =====
LOG_DIR="/app/logs"
UNIFIED_LOG="$LOG_DIR/meeshy-unified.log"
SUPERVISOR_LOG="$LOG_DIR/supervisor.log"
POSTGRES_LOG="$LOG_DIR/postgres.log"
REDIS_LOG="$LOG_DIR/redis.log"
NGINX_LOG="$LOG_DIR/nginx.log"
GATEWAY_LOG="$LOG_DIR/gateway.log"
TRANSLATOR_LOG="$LOG_DIR/translator.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

# Fonction de logging unifié
log_unified() {
    local level=$1
    local service=$2
    local message=$3
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] [$service] $message" | tee -a "$UNIFIED_LOG"
}

# Fonction de logging avec couleur pour la console
log_console() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Initialisation du système de logging
mkdir -p "$LOG_DIR"
touch "$UNIFIED_LOG" "$SUPERVISOR_LOG" "$POSTGRES_LOG" "$REDIS_LOG" "$NGINX_LOG" "$GATEWAY_LOG" "$TRANSLATOR_LOG" "$FRONTEND_LOG"
chown -R meeshy:meeshy "$LOG_DIR"

log_unified "INFO" "SYSTEM" "Démarrage du système de logging unifié"
log_console "$PURPLE" "🚀 Démarrage de Meeshy - Container Unifié"
echo "=============================================="

# Créer les répertoires nécessaires
mkdir -p /app/data/postgres /app/data/redis /app/logs /app/cache /app/models
chown -R meeshy:meeshy /app/data /app/logs /app/cache /app/models

# Vérifier si on utilise des services externes
USE_EXTERNAL_DB=${USE_EXTERNAL_DB:-false}
USE_EXTERNAL_REDIS=${USE_EXTERNAL_REDIS:-false}

log_console "$BLUE" "🔍 Configuration des services:"
log_unified "INFO" "CONFIG" "Base de données externe: $USE_EXTERNAL_DB"
log_unified "INFO" "CONFIG" "Redis externe: $USE_EXTERNAL_REDIS"
echo "  - Base de données externe: $USE_EXTERNAL_DB"
echo "  - Redis externe: $USE_EXTERNAL_REDIS"

# Variables d'environnement par défaut
export POSTGRES_USER=${POSTGRES_USER:-"meeshy"}
export POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-"MeeshyP@ssword"}
export POSTGRES_DB=${POSTGRES_DB:-"meeshy"}
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}"

# Initialiser PostgreSQL si nécessaire
if [ "$USE_EXTERNAL_DB" != "true" ]; then
    log_console "$BLUE" "📊 Configuration de PostgreSQL 17..."
    log_unified "INFO" "POSTGRES" "Début de la configuration PostgreSQL"
    
    mkdir -p /app/data/postgres /app/data/redis /app/logs
    
    # Créer l'utilisateur postgres s'il n'existe pas
    if ! id "postgres" &>/dev/null; then
        log_console "$YELLOW" "👤 Création de l'utilisateur postgres..."
        log_unified "INFO" "POSTGRES" "Création de l'utilisateur postgres"
        useradd -r -s /bin/bash -d /var/lib/postgresql postgres
        log_console "$GREEN" "✅ Utilisateur postgres créé"
        log_unified "INFO" "POSTGRES" "Utilisateur postgres créé avec succès"
    else
        log_console "$GREEN" "✅ Utilisateur postgres existe déjà"
        log_unified "INFO" "POSTGRES" "Utilisateur postgres existe déjà"
    fi
    
    # Configuration PostgreSQL (toujours exécuter)
    log_console "$YELLOW" "📝 Configuration PostgreSQL..."
    log_unified "INFO" "POSTGRES" "Début de la configuration des fichiers PostgreSQL"
    
    # Configuration PostgreSQL avec initdb
    mkdir -p /app/data/postgres
    log_unified "INFO" "POSTGRES" "Initialisation de la base de données avec initdb"
    
    # S'assurer que les permissions sont correctes
    chown -R postgres:postgres /app/data/postgres
    chmod 700 /app/data/postgres
    
    # Initialiser la base de données PostgreSQL
    if [ ! -f /app/data/postgres/PG_VERSION ]; then
        log_unified "INFO" "POSTGRES" "Exécution de initdb pour créer la base de données"
        sudo -u postgres /usr/lib/postgresql/17/bin/initdb -D /app/data/postgres --auth-local peer --auth-host scram-sha-256
        log_unified "INFO" "POSTGRES" "initdb terminé avec succès"
    else
        log_unified "INFO" "POSTGRES" "Base de données PostgreSQL déjà initialisée"
    fi
    cat > /app/data/postgres/postgresql.conf << EOF
listen_addresses = '*'
port = 5432
max_connections = 100
shared_buffers = 128MB
logging_collector = on
log_directory = '/app/logs'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
data_directory = '/app/data/postgres'
EOF
    
    cat > /app/data/postgres/pg_hba.conf << EOF
# Configuration d'authentification simplifiée
host    all             all             127.0.0.1/32            md5
host    all             all             ::1/128                 md5
host    all             all             0.0.0.0/0               md5
local   all             postgres                                peer
local   all             all                                     peer
EOF
    
    chown -R postgres:postgres /app/data/postgres
    chmod 700 /app/data/postgres
    log_console "$GREEN" "✅ Configuration PostgreSQL simplifiée créée"
    log_unified "INFO" "POSTGRES" "Configuration PostgreSQL terminée avec succès"
else
    log_console "$YELLOW" "⚠️  Utilisation d'une base de données externe"
    log_unified "INFO" "POSTGRES" "Utilisation d'une base de données externe"
fi

# Initialiser Redis si nécessaire
if [ "$USE_EXTERNAL_REDIS" != "true" ]; then
    log_console "$BLUE" "➕ Initialisation de Redis..."
    log_unified "INFO" "REDIS" "Début de la configuration Redis"
    mkdir -p /app/data/redis
    chown -R redis:redis /app/data/redis
    chmod 755 /app/data/redis
    log_console "$GREEN" "✅ Redis configuré"
    log_unified "INFO" "REDIS" "Configuration Redis terminée avec succès"
else
    log_console "$YELLOW" "⚠️  Utilisation d'un Redis externe"
    log_unified "INFO" "REDIS" "Utilisation d'un Redis externe"
fi

# Configuration Supervisor
log_console "$BLUE" "🔧 Préparation de la configuration Supervisor..."
log_unified "INFO" "SUPERVISOR" "Début de la configuration Supervisor"
TEMP_SUPERVISOR_DIR="/tmp/supervisor"
mkdir -p $TEMP_SUPERVISOR_DIR

# Créer supervisord.conf avec logging unifié
cat > $TEMP_SUPERVISOR_DIR/supervisord.conf << EOF
[unix_http_server]
file=/var/run/supervisor.sock
chmod=0700

[supervisord]
logfile=$SUPERVISOR_LOG
pidfile=/var/run/supervisord.pid
childlogdir=$LOG_DIR
nodaemon=true
user=root
loglevel=info

[rpcinterface:supervisor]
supervisor.rpcinterface_factory = supervisor.rpcinterface:make_main_rpcinterface

[supervisorctl]
serverurl=unix:///var/run/supervisor.sock

[include]
files = /tmp/supervisor/*.conf

[group:meeshy]
programs=PROGRAMS_PLACEHOLDER
priority=999
EOF

# Déterminer quels services démarrer
PROGRAMS="translator,gateway,frontend"

if [ "$USE_EXTERNAL_DB" != "true" ]; then
    cp /etc/supervisor/conf.d/postgres.conf $TEMP_SUPERVISOR_DIR/
    PROGRAMS="postgres,$PROGRAMS"
fi

if [ "$USE_EXTERNAL_REDIS" != "true" ]; then
    cp /etc/supervisor/conf.d/redis.conf $TEMP_SUPERVISOR_DIR/
    PROGRAMS="redis,$PROGRAMS"
fi

cp /etc/supervisor/conf.d/translator.conf $TEMP_SUPERVISOR_DIR/
cp /etc/supervisor/conf.d/gateway.conf $TEMP_SUPERVISOR_DIR/
cp /etc/supervisor/conf.d/frontend.conf $TEMP_SUPERVISOR_DIR/
cp /etc/supervisor/conf.d/nginx.conf $TEMP_SUPERVISOR_DIR/

sed -i "s/PROGRAMS_PLACEHOLDER/$PROGRAMS/" $TEMP_SUPERVISOR_DIR/supervisord.conf

# Fonction pour attendre qu'un service soit prêt
wait_for_service() {
    local service_name=$1
    local check_command=$2
    local max_attempts=6
    local attempt=1
    
    log_console "$BLUE" "⏳ Attente du service $service_name..."
    log_unified "INFO" "WAIT" "Début de l'attente pour le service $service_name"
    
    while [ $attempt -le $max_attempts ]; do
        if eval "$check_command" >/dev/null 2>&1; then
            log_console "$GREEN" "✅ $service_name est prêt"
            log_unified "INFO" "WAIT" "Service $service_name est prêt"
            return 0
        fi
        
        log_console "$YELLOW" "   Tentative $attempt/$max_attempts..."
        log_unified "DEBUG" "WAIT" "Tentative $attempt/$max_attempts pour $service_name"
        sleep 5
        attempt=$((attempt + 1))
    done
    
    log_console "$RED" "❌ Timeout en attendant $service_name"
    log_unified "ERROR" "WAIT" "Timeout en attendant le service $service_name"
    return 1
}

# Démarrer Supervisor en arrière-plan
log_console "$BLUE" "🔧 Démarrage de Supervisor..."
log_unified "INFO" "SUPERVISOR" "Démarrage de Supervisor avec PID"
/usr/bin/supervisord -c $TEMP_SUPERVISOR_DIR/supervisord.conf &
SUPERVISOR_PID=$!
log_unified "INFO" "SUPERVISOR" "Supervisor démarré avec PID: $SUPERVISOR_PID"

# Attendre que Supervisor soit démarré
sleep 10

# Configuration de la base de données après démarrage
if [ "$USE_EXTERNAL_DB" != "true" ]; then
    # Attendre que PostgreSQL soit vraiment prêt
    wait_for_service "PostgreSQL" "pg_isready -h localhost -p 5432"
    
    log_console "$BLUE" "🔧 Configuration de la base de données meeshy..."
    log_unified "INFO" "DATABASE" "Début de la configuration de la base de données"
    
    # Créer l'utilisateur et la base de données
    log_unified "INFO" "DATABASE" "Création de l'utilisateur $POSTGRES_USER"
    sudo -u postgres psql -c "CREATE USER \"$POSTGRES_USER\" WITH PASSWORD '$POSTGRES_PASSWORD' CREATEDB SUPERUSER;" 2>/dev/null || true
    sudo -u postgres psql -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\";" 2>/dev/null || true
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE \"$POSTGRES_DB\" TO \"$POSTGRES_USER\";" 2>/dev/null || true
    
    # Tester la connexion
    log_console "$BLUE" "🔍 Test de connexion avec l'utilisateur $POSTGRES_USER..."
    log_unified "INFO" "DATABASE" "Test de connexion avec l'utilisateur $POSTGRES_USER"
    if PGPASSWORD="$POSTGRES_PASSWORD" psql -h localhost -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT version();" >/dev/null 2>&1; then
        log_console "$GREEN" "✅ Connexion réussie avec $POSTGRES_USER"
        log_unified "INFO" "DATABASE" "Connexion réussie avec $POSTGRES_USER"
    else
        log_console "$RED" "❌ Échec de connexion avec $POSTGRES_USER"
        log_unified "ERROR" "DATABASE" "Échec de connexion avec $POSTGRES_USER"
        exit 1
    fi
    
    # Attendre que tous les services soient stables
    sleep 10
    
    # Exécuter les migrations Prisma (simplifié)
    log_console "$BLUE" "🔧 Exécution des migrations Prisma..."
    log_unified "INFO" "PRISMA" "Début des migrations Prisma"
    
    if [ -d "/app/shared" ] && [ -f "/app/shared/schema.prisma" ]; then
        log_console "$BLUE" "   Migration du schéma shared..."
        log_unified "INFO" "PRISMA" "Migration du schéma shared"
        cd /app/shared
        if npx prisma migrate deploy --schema=./schema.prisma; then
            log_console "$GREEN" "✅ Migration shared réussie"
            log_unified "INFO" "PRISMA" "Migration shared réussie"
        else
            log_console "$YELLOW" "⚠️ Migration shared échouée (peut être normal)"
            log_unified "WARN" "PRISMA" "Migration shared échouée (peut être normal)"
        fi
    fi
    
    log_console "$GREEN" "✅ Configuration de la base de données terminée"
    log_unified "INFO" "DATABASE" "Configuration de la base de données terminée"
fi

# Attendre que Redis soit prêt si nécessaire
if [ "$USE_EXTERNAL_REDIS" != "true" ]; then
    wait_for_service "Redis" "redis-cli ping"
fi

# Vérifier l'état final des services
log_console "$BLUE" "🔍 État final des services..."
log_unified "INFO" "SYSTEM" "Vérification de l'état final des services"
supervisorctl -c $TEMP_SUPERVISOR_DIR/supervisord.conf status

log_console "$GREEN" "✅ Tous les services sont démarrés"
log_unified "INFO" "SYSTEM" "Tous les services sont démarrés avec succès"
log_console "$CYAN" "🌐 Frontend accessible sur: http://localhost"
log_console "$CYAN" "🔌 Gateway API accessible sur: http://localhost/api"
log_console "$CYAN" "🤖 Translator API accessible sur: http://localhost/translate"
log_unified "INFO" "SYSTEM" "Services accessibles: Frontend(http://localhost), Gateway(http://localhost/api), Translator(http://localhost/translate)"

# Log final
log_unified "INFO" "SYSTEM" "Container Meeshy unifié démarré avec succès"

# Attendre le processus Supervisor
wait $SUPERVISOR_PID