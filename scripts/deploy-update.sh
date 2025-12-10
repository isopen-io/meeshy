#!/bin/bash

# ===== MEESHY - DÉPLOIEMENT RAPIDE DE MISE À JOUR =====
# Script pour déployer rapidement les mises à jour de gateway et frontend
# Usage: ./scripts/deploy-update.sh [DROPLET_IP] [OPTIONS]

set -e

# Couleurs pour les logs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Variables globales
DROPLET_IP=""
FORCE_REFRESH=false
VERBOSE=false

# Fonctions utilitaires
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🚀 MEESHY - DÉPLOIEMENT RAPIDE DE MISE À JOUR${NC}"
    echo "=================================================="
    echo ""
    echo "Usage: $0 [DROPLET_IP] [OPTIONS]"
    echo ""
    echo "Description:"
    echo "  Déploie rapidement les mises à jour de gateway et frontend"
    echo "  en production sans toucher à la base de données"
    echo ""
    echo "Options:"
    echo "  --force-refresh         Forcer le téléchargement des nouvelles images"
    echo "  --verbose               Mode verbeux"
    echo "  --help, -h              Afficher cette aide"
    echo ""
    echo "Exemples:"
    echo "  $0 192.168.1.100"
    echo "  $0 157.230.15.51 --force-refresh"
    echo "  $0 157.230.15.51 --verbose"
    echo ""
    echo -e "${YELLOW}⚠️  ATTENTION:${NC}"
    echo "  • Ce script met à jour uniquement gateway et frontend"
    echo "  • La base de données et l'infrastructure ne sont PAS modifiées"
    echo "  • Les services sont redémarrés de manière séquentielle"
    echo ""
}

# Parser les arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --force-refresh)
                FORCE_REFRESH=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                if [ -z "$DROPLET_IP" ]; then
                    DROPLET_IP="$1"
                fi
                shift
                ;;
        esac
    done
}

# Fonction principale
main() {
    # Parser les arguments
    parse_arguments "$@"
    
    # Vérifier que l'IP est fournie
    if [ -z "$DROPLET_IP" ]; then
        log_error "IP du serveur manquante"
        show_help
        exit 1
    fi
    
    log_info "🚀 Démarrage du déploiement rapide sur $DROPLET_IP"
    
    # Vérifier que le script de mise à jour existe
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    UPDATE_SCRIPT="$SCRIPT_DIR/update-gateway-frontend.sh"
    
    if [ ! -f "$UPDATE_SCRIPT" ]; then
        log_error "Script de mise à jour non trouvé: $UPDATE_SCRIPT"
        exit 1
    fi
    
    # Construire la commande
    CMD="$UPDATE_SCRIPT $DROPLET_IP"
    
    if [ "$FORCE_REFRESH" = "true" ]; then
        CMD="$CMD --force-refresh"
    fi
    
    if [ "$VERBOSE" = "true" ]; then
        CMD="$CMD --verbose"
    fi
    
    # Exécuter le script de mise à jour
    log_info "Exécution du script de mise à jour sélective..."
    eval "$CMD"
    
    log_success "Déploiement rapide terminé avec succès !"
}

# Exécuter le script principal
main "$@"
