#!/bin/bash

# ===== MEESHY - CONFIGURATION DE DÉPLOIEMENT =====
# Script de configuration partagée pour tous les modules de déploiement
# Usage: source ./deploy-config.sh

# Couleurs pour les logs
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export CYAN='\033[0;36m'
export NC='\033[0m' # No Color

# Variables globales de déploiement
export COMMAND=""
export DROPLET_IP=""
export FORCE_REFRESH=false
export REGENERATE_SECRETS=false

# Configuration de base
export SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DEPLOYMENT_DIR="$(dirname "$SCRIPT_DIR")"
export PROJECT_ROOT="$(dirname "$DEPLOYMENT_DIR")"
export DOCKER_COMPOSE_FILE="docker-compose.traefik.yml"

# Variables de traçabilité de déploiement
export DEPLOY_VERSION="2.0.0-modular"
export DEPLOY_BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
export DEPLOY_SESSION_ID="$(date +%Y%m%d_%H%M%S)_$(hostname)"
export DEPLOY_ENVIRONMENT="production"

# Répertoires de déploiement
export DEPLOY_LOGS_DIR="/tmp/meeshy-deploy/logs"
export DEPLOY_TRACE_DIR="/tmp/meeshy-deploy/traces"
export DEPLOY_TEMP_DIR="/tmp/meeshy-deploy/temp"

# Créer les répertoires nécessaires
mkdir -p "$DEPLOY_LOGS_DIR" 2>/dev/null || true
mkdir -p "$DEPLOY_TRACE_DIR" 2>/dev/null || true
mkdir -p "$DEPLOY_TEMP_DIR" 2>/dev/null || true

# Fonctions de logging avec traçabilité
log_info() {
    local message="$1"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo -e "${BLUE}ℹ️  $message${NC}"
    echo "[$timestamp] [INFO] $message" >> "$DEPLOY_LOGS_DIR/deploy.log" 2>/dev/null || true
}

log_success() {
    local message="$1"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo -e "${GREEN}✅ $message${NC}"
    echo "[$timestamp] [SUCCESS] $message" >> "$DEPLOY_LOGS_DIR/deploy.log" 2>/dev/null || true
}

log_warning() {
    local message="$1"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo -e "${YELLOW}⚠️  $message${NC}"
    echo "[$timestamp] [WARNING] $message" >> "$DEPLOY_LOGS_DIR/deploy.log" 2>/dev/null || true
}

log_error() {
    local message="$1"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo -e "${RED}❌ $message${NC}"
    echo "[$timestamp] [ERROR] $message" >> "$DEPLOY_LOGS_DIR/deploy.log" 2>/dev/null || true
}

# Fonction de traçabilité des opérations de déploiement
trace_deploy_operation() {
    local operation="$1"
    local status="$2"
    local details="$3"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local trace_file="$DEPLOY_TRACE_DIR/deploy-operations.log"
    
    echo "[$timestamp] [$DEPLOY_SESSION_ID] [$operation] [$status] $details" >> "$trace_file" 2>/dev/null || true
}

# Fonction pour initialiser la traçabilité de déploiement
init_deploy_tracing() {
    local module_name="$1"
    local operation="$2"
    
    log_info "Initialisation de la traçabilité de déploiement pour $module_name"
    
    # Créer le fichier de trace pour cette session de déploiement
    local session_trace="$DEPLOY_TRACE_DIR/session_${DEPLOY_SESSION_ID}.log"
    
    echo "=== MEESHY DEPLOYMENT SESSION TRACE ===" >> "$session_trace"
    echo "Session ID: $DEPLOY_SESSION_ID" >> "$session_trace"
    echo "Module: $module_name" >> "$session_trace"
    echo "Operation: $operation" >> "$session_trace"
    echo "Start Time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$session_trace"
    echo "Environment: $DEPLOY_ENVIRONMENT" >> "$session_trace"
    echo "Version: $DEPLOY_VERSION" >> "$session_trace"
    echo "Droplet IP: $DROPLET_IP" >> "$session_trace"
    echo "Command: $COMMAND" >> "$session_trace"
    echo "=====================================" >> "$session_trace"
    
    export DEPLOY_SESSION_TRACE_FILE="$session_trace"
    trace_deploy_operation "session_init" "SUCCESS" "Deployment session $DEPLOY_SESSION_ID started for $module_name"
}

# Fonction pour finaliser la traçabilité de déploiement
finalize_deploy_tracing() {
    local status="$1"
    local details="$2"
    
    if [ -n "$DEPLOY_SESSION_TRACE_FILE" ]; then
        echo "End Time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$DEPLOY_SESSION_TRACE_FILE"
        echo "Final Status: $status" >> "$DEPLOY_SESSION_TRACE_FILE"
        echo "Details: $details" >> "$DEPLOY_SESSION_TRACE_FILE"
        echo "=====================================" >> "$DEPLOY_SESSION_TRACE_FILE"
    fi
    
    trace_deploy_operation "session_end" "$status" "$details"
}

# Fonction pour parser les arguments de déploiement
parse_deploy_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --regenerate-secrets)
                REGENERATE_SECRETS=true
                shift
                ;;
            --force-refresh)
                FORCE_REFRESH=true
                shift
                ;;
            --help|-h)
                show_deploy_help
                exit 0
                ;;
            *)
                # Si ce n'est pas une option, c'est probablement la commande ou l'IP
                if [ -z "$COMMAND" ]; then
                    COMMAND="$1"
                elif [ -z "$DROPLET_IP" ]; then
                    DROPLET_IP="$1"
                fi
                shift
                ;;
        esac
    done
}

# Fonction d'aide pour le déploiement
show_deploy_help() {
    echo -e "${CYAN}🚀 MEESHY - SCRIPT DE DÉPLOIEMENT MODULAIRE V2.0${NC}"
    echo "======================================================"
    echo ""
    echo "Usage:"
    echo "  ./meeshy-deploy.sh [COMMAND] [DROPLET_IP] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo -e "${GREEN}  Déploiement:${NC}"
    echo "    deploy     - Déployer l'application complète"
    echo "    deploy-reset - Déploiement avec reset complet"
    echo "    fix        - Correction rapide (redémarrage)"
    echo ""
    echo -e "${GREEN}  Vérification:${NC}"
    echo "    test       - Tester la connexion au serveur"
    echo "    verify     - Vérifier le statut des services"
    echo "    health     - Vérification complète de santé"
    echo "    simple-health - Vérification simple et robuste"
    echo ""
    echo -e "${GREEN}  Configuration:${NC}"
    echo "    replica    - Configuration du replica set MongoDB"
    echo "    ssl        - Test des certificats SSL et Traefik"
    echo "    fix-translator - Correction des permissions du container translator"
    echo "    deploy-passwords - Déploiement fiable des mots de passe Traefik"
    echo ""
    echo -e "${GREEN}  Maintenance:${NC}"
    echo "    status     - État des services"
    echo "    logs       - Logs des services"
    echo "    restart    - Redémarrage des services"
    echo "    stop       - Arrêt des services"
    echo ""
    echo "Options:"
    echo "  --regenerate-secrets    - Forcer la régénération des secrets de production"
    echo "  --force-refresh         - Forcer le rafraîchissement des images"
    echo "  --help, -h              - Afficher cette aide"
    echo ""
    echo "Gestion des secrets:"
    echo "  Par défaut, si des secrets existent déjà, ils seront réutilisés."
    echo "  Utilisez --regenerate-secrets pour forcer la création de nouveaux secrets."
    echo ""
    echo "Exemples:"
    echo "  ./meeshy-deploy.sh deploy 192.168.1.100"
    echo "  ./meeshy-deploy.sh deploy 192.168.1.100 --regenerate-secrets"
    echo "  ./meeshy-deploy.sh test 192.168.1.100"
    echo "  ./meeshy-deploy.sh health 192.168.1.100"
    echo "  ./meeshy-deploy.sh deploy-passwords 192.168.1.100"
    echo ""
    echo -e "${YELLOW}💡 Architecture modulaire:${NC}"
    echo "  • deploy-config.sh           - Configuration globale et traçabilité"
    echo "  • deploy-test-connection.sh  - Tests de connexion SSH"
    echo "  • deploy-prepare-files.sh    - Préparation et transfert des fichiers"
    echo "  • deploy-install-prerequisites.sh - Installation des prérequis"
    echo "  • deploy-configure-mongodb.sh - Configuration MongoDB"
    echo "  • deploy-start-services.sh   - Démarrage des services"
    echo "  • deploy-health-check.sh     - Vérifications de santé"
    echo "  • deploy-maintenance.sh      - Maintenance et gestion"
    echo "  • deploy-orchestrator.sh     - Orchestrateur principal"
    echo ""
}

# Fonction pour obtenir des informations de déploiement
get_deploy_info() {
    echo "=== MEESHY DEPLOYMENT INFO ==="
    echo "Deployment Session ID: $DEPLOY_SESSION_ID"
    echo "Version: $DEPLOY_VERSION"
    echo "Environment: $DEPLOY_ENVIRONMENT"
    echo "Build Date: $DEPLOY_BUILD_DATE"
    echo "Project Root: $PROJECT_ROOT"
    echo "Docker Compose File: $DOCKER_COMPOSE_FILE"
    echo "Droplet IP: $DROPLET_IP"
    echo "Command: $COMMAND"
    echo "Force Refresh: $FORCE_REFRESH"
    echo "Regenerate Secrets: $REGENERATE_SECRETS"
    echo "============================="
}

# Fonction pour valider les paramètres de déploiement
validate_deploy_params() {
    if [ -z "$DROPLET_IP" ]; then
        log_error "IP du droplet manquante"
        show_deploy_help
        exit 1
    fi
    
    if [ -z "$COMMAND" ]; then
        log_error "Commande manquante"
        show_deploy_help
        exit 1
    fi
    
    # Valider le format de l'IP
    if ! [[ $DROPLET_IP =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        log_error "Format d'IP invalide: $DROPLET_IP"
        exit 1
    fi
    
    log_success "Paramètres de déploiement validés"
    trace_deploy_operation "param_validation" "SUCCESS" "Deployment parameters validated for $COMMAND on $DROPLET_IP"
}

# Fonction pour nettoyer les fichiers temporaires
cleanup_deploy_temp() {
    log_info "Nettoyage des fichiers temporaires de déploiement..."
    
    # Nettoyer les fichiers temporaires
    rm -rf "$DEPLOY_TEMP_DIR"/* 2>/dev/null || true
    
    # Garder seulement les 10 dernières sessions de logs
    find "$DEPLOY_TRACE_DIR" -name "session_*.log" -type f | sort -r | tail -n +11 | xargs rm -f 2>/dev/null || true
    
    log_success "Nettoyage terminé"
    trace_deploy_operation "cleanup" "SUCCESS" "Deployment temporary files cleaned"
}

# Exporter les fonctions pour qu'elles soient disponibles dans les autres scripts
export -f log_info log_success log_warning log_error trace_deploy_operation
export -f init_deploy_tracing finalize_deploy_tracing parse_deploy_arguments
export -f show_deploy_help get_deploy_info validate_deploy_params cleanup_deploy_temp
