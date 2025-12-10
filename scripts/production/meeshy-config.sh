#!/bin/bash

# ===== MEESHY - CONFIGURATION GLOBALE ET TRAÇABILITÉ =====
# Script de configuration partagée pour tous les modules Meeshy
# Usage: source ./meeshy-config.sh

# Couleurs pour les logs
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export CYAN='\033[0;36m'
export NC='\033[0m' # No Color

# Configuration de base
# Détecter automatiquement l'environnement (production vs local)
if [ -d "/opt/meeshy" ]; then
    # Environnement de production
    export PROJECT_DIR="/opt/meeshy"
    export ENV_FILE=".env"
    export DOMAIN="meeshy.me"
else
    # Environnement local (développement/test)
    # Remonter depuis scripts/production/ vers la racine du projet
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    export PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
    export ENV_FILE=".env.local"
    export DOMAIN="localhost"
fi

export COMPOSE_FILE="docker-compose.traefik.yml"

# Déterminer la commande Docker Compose
if docker compose version &> /dev/null; then
    export COMPOSE_CMD="docker compose"
else
    export COMPOSE_CMD="docker-compose"
fi

# Variables de traçabilité de production
export MEESHY_VERSION="1.0.0"
export MEESHY_BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
export MEESHY_DEPLOYMENT_ID="$(date +%Y%m%d_%H%M%S)_$(hostname)"
export MEESHY_SCRIPT_VERSION="2.0.0-modular"
export MEESHY_ENVIRONMENT="production"

# Répertoires de logs et traçabilité
export MEESHY_LOGS_DIR="/var/log/meeshy"
export MEESHY_TRACE_DIR="/opt/meeshy/traces"
export MEESHY_BACKUP_DIR="/opt/backups/meeshy"

# En mode local, utiliser des répertoires temporaires
if [ ! -d "/opt/meeshy" ]; then
    export MEESHY_LOGS_DIR="/tmp/meeshy/logs"
    export MEESHY_TRACE_DIR="/tmp/meeshy/traces"
    export MEESHY_BACKUP_DIR="/tmp/meeshy/backups"
fi

# Créer les répertoires nécessaires
mkdir -p "$MEESHY_LOGS_DIR" 2>/dev/null || true
mkdir -p "$MEESHY_TRACE_DIR" 2>/dev/null || true
mkdir -p "$MEESHY_BACKUP_DIR" 2>/dev/null || true

# Fonctions de logging avec traçabilité
log_info() {
    local message="$1"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo -e "${BLUE}[INFO]${NC} $message"
    echo "[$timestamp] [INFO] $message" >> "$MEESHY_LOGS_DIR/meeshy.log" 2>/dev/null || true
}

log_success() {
    local message="$1"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo -e "${GREEN}[SUCCESS]${NC} $message"
    echo "[$timestamp] [SUCCESS] $message" >> "$MEESHY_LOGS_DIR/meeshy.log" 2>/dev/null || true
}

log_warning() {
    local message="$1"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo -e "${YELLOW}[WARNING]${NC} $message"
    echo "[$timestamp] [WARNING] $message" >> "$MEESHY_LOGS_DIR/meeshy.log" 2>/dev/null || true
}

log_error() {
    local message="$1"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo -e "${RED}[ERROR]${NC} $message"
    echo "[$timestamp] [ERROR] $message" >> "$MEESHY_LOGS_DIR/meeshy.log" 2>/dev/null || true
}

# Fonction de traçabilité des opérations
trace_operation() {
    local operation="$1"
    local status="$2"
    local details="$3"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local trace_file="$MEESHY_TRACE_DIR/operations.log"
    
    echo "[$timestamp] [$MEESHY_DEPLOYMENT_ID] [$operation] [$status] $details" >> "$trace_file" 2>/dev/null || true
}

# Fonction pour vérifier les prérequis
check_prerequisites() {
    log_info "Vérification des prérequis..."
    
    # Vérifier Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker n'est pas installé"
        trace_operation "prerequisites_check" "FAILED" "Docker not installed"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker n'est pas en cours d'exécution"
        trace_operation "prerequisites_check" "FAILED" "Docker not running"
        exit 1
    fi
    
    # Vérifier Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose n'est pas installé"
        trace_operation "prerequisites_check" "FAILED" "Docker Compose not installed"
        exit 1
    fi
    
    # Déterminer la commande Docker Compose
    if docker compose version &> /dev/null; then
        export COMPOSE_CMD="docker compose"
    else
        export COMPOSE_CMD="docker-compose"
    fi
    
    # Vérifier les fichiers nécessaires
    if [ ! -f "$PROJECT_DIR/$COMPOSE_FILE" ]; then
        log_error "Fichier $COMPOSE_FILE non trouvé dans $PROJECT_DIR"
        trace_operation "prerequisites_check" "FAILED" "Compose file not found"
        exit 1
    fi
    
    if [ ! -f "$PROJECT_DIR/$ENV_FILE" ]; then
        log_error "Fichier $ENV_FILE non trouvé dans $PROJECT_DIR"
        trace_operation "prerequisites_check" "FAILED" "Environment file not found"
        exit 1
    fi
    
    log_success "Prérequis vérifiés avec succès"
    trace_operation "prerequisites_check" "SUCCESS" "All prerequisites met"
}

# Fonction pour charger l'environnement
load_environment() {
    log_info "Chargement de l'environnement..."
    
    cd "$PROJECT_DIR"
    
    # Charger les variables d'environnement
    if [ -f "$ENV_FILE" ]; then
        set -a
        source "$ENV_FILE"
        set +a
        log_success "Variables d'environnement chargées"
        trace_operation "environment_load" "SUCCESS" "Environment variables loaded"
    else
        log_warning "Fichier d'environnement non trouvé, utilisation des valeurs par défaut"
        trace_operation "environment_load" "WARNING" "Environment file not found"
    fi
}

# Fonction pour initialiser la traçabilité
init_tracing() {
    local script_name="$1"
    local operation="$2"
    
    log_info "Initialisation de la traçabilité pour $script_name"
    
    # Créer le fichier de trace pour cette session
    local session_trace="$MEESHY_TRACE_DIR/session_${MEESHY_DEPLOYMENT_ID}.log"
    
    echo "=== MEESHY SESSION TRACE ===" >> "$session_trace"
    echo "Session ID: $MEESHY_DEPLOYMENT_ID" >> "$session_trace"
    echo "Script: $script_name" >> "$session_trace"
    echo "Operation: $operation" >> "$session_trace"
    echo "Start Time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$session_trace"
    echo "Environment: $MEESHY_ENVIRONMENT" >> "$session_trace"
    echo "Version: $MEESHY_VERSION" >> "$session_trace"
    echo "=========================" >> "$session_trace"
    
    export SESSION_TRACE_FILE="$session_trace"
    trace_operation "session_init" "SUCCESS" "Session $MEESHY_DEPLOYMENT_ID started for $script_name"
}

# Fonction pour finaliser la traçabilité
finalize_tracing() {
    local status="$1"
    local details="$2"
    
    if [ -n "$SESSION_TRACE_FILE" ]; then
        echo "End Time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$SESSION_TRACE_FILE"
        echo "Final Status: $status" >> "$SESSION_TRACE_FILE"
        echo "Details: $details" >> "$SESSION_TRACE_FILE"
        echo "=========================" >> "$SESSION_TRACE_FILE"
    fi
    
    trace_operation "session_end" "$status" "$details"
}

# Fonction pour obtenir des informations système
get_system_info() {
    echo "=== MEESHY SYSTEM INFO ==="
    echo "Deployment ID: $MEESHY_DEPLOYMENT_ID"
    echo "Version: $MEESHY_VERSION"
    echo "Environment: $MEESHY_ENVIRONMENT"
    echo "Build Date: $MEESHY_BUILD_DATE"
    echo "Script Version: $MEESHY_SCRIPT_VERSION"
    echo "Project Directory: $PROJECT_DIR"
    echo "Domain: $DOMAIN"
    echo "Docker Compose Command: $COMPOSE_CMD"
    echo "========================="
}

# Exporter les fonctions pour qu'elles soient disponibles dans les autres scripts
export -f log_info log_success log_warning log_error trace_operation
export -f check_prerequisites load_environment init_tracing finalize_tracing get_system_info
