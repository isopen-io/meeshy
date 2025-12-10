#!/bin/bash

# ===== MEESHY - SCRIPT PRINCIPAL DE GESTION =====
# Script principal pour gérer la production, le développement et le déploiement
# Usage: ./meeshy.sh [ENVIRONMENT] [COMMAND] [OPTIONS]

set -e

# Couleurs pour les logs
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export CYAN='\033[0;36m'
export NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Variables globales
ENVIRONMENT=""
COMMAND=""
OPTIONS=()

# Fonctions de logging
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Fonction d'aide principale
show_help() {
    echo -e "${CYAN}🚀 MEESHY - SCRIPT PRINCIPAL DE GESTION${NC}"
    echo "============================================="
    echo ""
    echo "Usage:"
    echo "  ./meeshy.sh [ENVIRONMENT] [COMMAND] [OPTIONS]"
    echo ""
    echo "Environnements:"
    echo -e "${GREEN}  prod (production)${NC}     - Gestion des services en production"
    echo -e "${GREEN}  dev (development)${NC}     - Gestion des services de développement"
    echo -e "${GREEN}  deploy${NC}                - Déploiement sur serveur distant"
    echo ""
    echo "Commandes par environnement:"
    echo ""
    echo -e "${YELLOW}📦 PRODUCTION (prod):${NC}"
    echo "  start       - Démarrer les services de production"
    echo "  stop        - Arrêter les services de production"
    echo "  restart     - Redémarrer les services de production"
    echo "  status      - Afficher le statut des services"
    echo "  logs        - Afficher les logs des services"
    echo "  maintenance - Opérations de maintenance"
    echo "  health      - Vérification de santé des services"
    echo "  info        - Informations sur l'environnement"
    echo "  version     - Version des services"
    echo "  backup      - Créer un backup des données"
    echo "  restore     - Restaurer un backup (interactif)"
    echo "  list-backups- Lister les backups disponibles"
    echo ""
    echo -e "${YELLOW}🛠️  DÉVELOPPEMENT (dev):${NC}"
    echo "  start       - Démarrer l'environnement de développement"
    echo "  stop        - Arrêter l'environnement de développement"
    echo "  restart     - Redémarrer l'environnement de développement"
    echo "  test        - Exécuter les tests de développement"
    echo "  configure   - Configurer l'environnement de développement"
    echo "  init-mongo  - Initialiser MongoDB pour le développement"
    echo "  test-access - Tests d'accès aux services"
    echo ""
    echo -e "${YELLOW}🚀 DÉPLOIEMENT (deploy):${NC}"
    echo "  deploy      - Déployer l'application complète"
    echo "  deploy-reset - Déploiement avec reset complet"
    echo "  test        - Tester la connexion au serveur"
    echo "  health      - Vérification de santé sur le serveur"
    echo "  status      - Statut des services sur le serveur"
    echo "  logs        - Logs des services sur le serveur"
    echo "  restart     - Redémarrer les services sur le serveur"
    echo "  stop        - Arrêter les services sur le serveur"
    echo "  passwords   - Déployer les mots de passe Traefik"
    echo "  replica     - Configuration du replica set MongoDB"
    echo "  backup      - Backup distant (DB, volumes, config)"
    echo "  restore     - Restaurer un backup distant"
    echo ""
    echo "Options globales:"
    echo "  --help, -h  - Afficher cette aide"
    echo "  --version   - Afficher la version"
    echo ""
    echo "Options de déploiement:"
    echo "  --regenerate-secrets - Forcer la régénération des secrets"
    echo "  --force-refresh      - Forcer le rafraîchissement des images"
    echo ""
    echo "Exemples:"
    echo "  # Production"
    echo "  ./meeshy.sh prod start"
    echo "  ./meeshy.sh prod status"
    echo "  ./meeshy.sh prod logs"
    echo ""
    echo "  # Développement"
    echo "  ./meeshy.sh dev start"
    echo "  ./meeshy.sh dev test"
    echo "  ./meeshy.sh dev configure"
    echo ""
    echo "  # Déploiement"
    echo "  ./meeshy.sh deploy deploy 192.168.1.100"
    echo "  ./meeshy.sh deploy test 192.168.1.100"
    echo "  ./meeshy.sh deploy health 192.168.1.100"
    echo ""
    echo -e "${YELLOW}💡 Architecture modulaire:${NC}"
    echo "  • scripts/production/     - Scripts de gestion de production"
    echo "  • scripts/development/    - Scripts de développement"
    echo "  • scripts/deployment/     - Scripts de déploiement"
    echo ""
}

# Fonction pour afficher la version
show_version() {
    echo -e "${CYAN}🚀 MEESHY - SCRIPT PRINCIPAL DE GESTION${NC}"
    echo "============================================="
    echo ""
    echo "Version: 2.0.0-modular"
    echo "Date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "Architecture: Modulaire"
    echo ""
    echo "Environnements supportés:"
    echo "  • Production (prod)"
    echo "  • Développement (dev)"
    echo "  • Déploiement (deploy)"
    echo ""
    echo "Modules disponibles:"
    echo "  • Production: $(ls -1 "$SCRIPT_DIR/production"/*.sh 2>/dev/null | wc -l) scripts"
    echo "  • Développement: $(ls -1 "$SCRIPT_DIR/development"/*.sh 2>/dev/null | wc -l) scripts"
    echo "  • Déploiement: $(ls -1 "$SCRIPT_DIR/deployment"/*.sh 2>/dev/null | wc -l) scripts"
    echo ""
}

# Gestion de la production
handle_production() {
    local cmd="$1"
    shift
    local args="$@"
    
    log_info "Gestion de la production - Commande: $cmd"
    
    case "$cmd" in
        "start")
            "$SCRIPT_DIR/production/meeshy-start.sh" $args
            ;;
        "stop")
            "$SCRIPT_DIR/production/meeshy-stop.sh" $args
            ;;
        "restart")
            "$SCRIPT_DIR/production/meeshy-maintenance.sh" "restart" $args
            ;;
        "status")
            "$SCRIPT_DIR/production/meeshy-status.sh" $args
            ;;
        "logs")
            "$SCRIPT_DIR/production/meeshy-logs.sh" $args
            ;;
        "maintenance")
            "$SCRIPT_DIR/production/meeshy-maintenance.sh" $args
            ;;
        "health")
            "$SCRIPT_DIR/production/meeshy-maintenance.sh" "health" $args
            ;;
        "info")
            "$SCRIPT_DIR/production/meeshy-orchestrator.sh" "info" $args
            ;;
        "version")
            "$SCRIPT_DIR/production/meeshy-orchestrator.sh" "version" $args
            ;;
        "backup")
            "$SCRIPT_DIR/production/meeshy-auto-backup.sh" $args
            ;;
        "restore")
            "$SCRIPT_DIR/production/meeshy-restore-backup.sh" $args
            ;;
        "list-backups")
            "$SCRIPT_DIR/production/meeshy-restore-backup.sh" --list
            ;;
        *)
            log_error "Commande de production inconnue: $cmd"
            echo ""
            echo "Commandes de production disponibles:"
            echo "  start, stop, restart, status, logs, maintenance, health, info, version"
            echo "  backup, restore, list-backups"
            exit 1
            ;;
    esac
}

# Gestion du développement
handle_development() {
    local cmd="$1"
    shift
    local args="$@"
    
    log_info "Gestion du développement - Commande: $cmd"
    
    case "$cmd" in
        "start")
            "$SCRIPT_DIR/development/development-start-local.sh" $args
            ;;
        "stop")
            "$SCRIPT_DIR/development/development-stop-local.sh" $args
            ;;
        "restart")
            "$SCRIPT_DIR/development/development-stop-local.sh" $args
            "$SCRIPT_DIR/development/development-start-local.sh" $args
            ;;
        "test")
            "$SCRIPT_DIR/development/development-test-local.sh" $args
            ;;
        "configure")
            "$SCRIPT_DIR/development/development-configure-dev.sh" $args
            ;;
        "init-mongo")
            "$SCRIPT_DIR/development/development-init-mongodb-replica.sh" $args
            ;;
        "test-access")
            "$SCRIPT_DIR/development/development-test-simple-access.sh" $args
            ;;
        *)
            log_error "Commande de développement inconnue: $cmd"
            echo ""
            echo "Commandes de développement disponibles:"
            echo "  start, stop, restart, test, configure, init-mongo, test-access"
            exit 1
            ;;
    esac
}

# Gestion du déploiement
handle_deployment() {
    local cmd="$1"
    shift
    local args="$@"
    
    log_info "Gestion du déploiement - Commande: $cmd"
    log_info "DEBUG: Arguments reçus: '$args'"
    
    case "$cmd" in
        "deploy")
            "$SCRIPT_DIR/deployment/deploy-orchestrator.sh" "deploy" "$args"
            ;;
        "deploy-reset")
            "$SCRIPT_DIR/deployment/deploy-orchestrator.sh" "deploy-reset" $args
            ;;
        "test")
            "$SCRIPT_DIR/deployment/deploy-orchestrator.sh" "test" $args
            ;;
        "health")
            "$SCRIPT_DIR/deployment/deploy-orchestrator.sh" "health" $args
            ;;
        "status")
            "$SCRIPT_DIR/deployment/deploy-orchestrator.sh" "status" $args
            ;;
        "logs")
            "$SCRIPT_DIR/deployment/deploy-orchestrator.sh" "logs" $args
            ;;
        "restart")
            "$SCRIPT_DIR/deployment/deploy-orchestrator.sh" "restart" $args
            ;;
        "stop")
            "$SCRIPT_DIR/deployment/deploy-orchestrator.sh" "stop" $args
            ;;
        "passwords")
            "$SCRIPT_DIR/deployment/deploy-orchestrator.sh" "deploy-passwords" $args
            ;;
        "replica")
            "$SCRIPT_DIR/deployment/deploy-orchestrator.sh" "replica" $args
            ;;
        "backup")
            "$SCRIPT_DIR/deployment/deploy-orchestrator.sh" "backup" $args
            ;;
        "restore")
            log_info "Restauration de backup distant"
            "$SCRIPT_DIR/deployment/deploy-backup.sh" "restore-interactive" $args
            ;;
        *)
            log_error "Commande de déploiement inconnue: $cmd"
            echo ""
            echo "Commandes de déploiement disponibles:"
            echo "  deploy, deploy-reset, test, health, status, logs, restart, stop, passwords, replica"
            echo "  backup, restore"
            exit 1
            ;;
    esac
}

# Parser les arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --help|-h)
                show_help
                exit 0
                ;;
            --version)
                show_version
                exit 0
                ;;
            prod|production)
                ENVIRONMENT="prod"
                shift
                ;;
            dev|development)
                ENVIRONMENT="dev"
                shift
                ;;
            deploy|deployment)
                ENVIRONMENT="deploy"
                shift
                ;;
            *)
                if [ -z "$ENVIRONMENT" ]; then
                    log_error "Environnement manquant. Utilisez: prod, dev, ou deploy"
                    show_help
                    exit 1
                fi
                
                if [ -z "$COMMAND" ]; then
                    COMMAND="$1"
                else
                    OPTIONS+=("$1")
                fi
                shift
                ;;
        esac
    done
}

# Valider les arguments
validate_arguments() {
    if [ -z "$ENVIRONMENT" ]; then
        log_error "Environnement manquant"
        show_help
        exit 1
    fi
    
    if [ -z "$COMMAND" ]; then
        log_error "Commande manquante"
        show_help
        exit 1
    fi
}

# Fonction principale
main() {
    # Parser les arguments
    parse_arguments "$@"
    
    # Valider les arguments
    validate_arguments
    
    # Afficher les informations de démarrage
    log_info "🚀 Meeshy - Gestion des services"
    log_info "Environnement: $ENVIRONMENT"
    log_info "Commande: $COMMAND"
    if [ ${#OPTIONS[@]} -gt 0 ]; then
        log_info "Options: ${OPTIONS[*]}"
    fi
    log_info "DEBUG: Nombre d'options: ${#OPTIONS[@]}"
    echo ""
    
    # Exécuter la commande appropriée selon l'environnement
    case "$ENVIRONMENT" in
        "prod")
            handle_production "$COMMAND" "${OPTIONS[@]}"
            ;;
        "dev")
            handle_development "$COMMAND" "${OPTIONS[@]}"
            ;;
        "deploy")
            handle_deployment "$COMMAND" "${OPTIONS[@]}"
            ;;
        *)
            log_error "Environnement inconnu: $ENVIRONMENT"
            show_help
            exit 1
            ;;
    esac
    
    log_success "Commande exécutée avec succès"
}

# Exécuter la fonction principale si le script est appelé directement
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi