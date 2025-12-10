#!/bin/bash

# ===== MEESHY - DÉMARRAGE DES SERVICES =====
# Script spécialisé pour démarrer tous les services Meeshy
# Usage: ./meeshy-start.sh [OPTIONS]

set -e

# Charger la configuration globale
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/meeshy-config.sh"

# Initialiser la traçabilité
init_tracing "meeshy-start" "start_services"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🚀 MEESHY - DÉMARRAGE DES SERVICES${NC}"
    echo "====================================="
    echo ""
    echo "Usage:"
    echo "  ./meeshy-start.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --no-pull   - Ne pas télécharger les images"
    echo "  --logs      - Afficher les logs après démarrage"
    echo "  --help      - Afficher cette aide"
    echo ""
    echo "Exemples:"
    echo "  ./meeshy-start.sh"
    echo "  ./meeshy-start.sh --logs"
    echo "  ./meeshy-start.sh --no-pull"
    echo ""
}

# Télécharger les dernières images
pull_images() {
    log_info "Téléchargement des dernières images..."
    trace_operation "pull_images" "STARTED" "Downloading latest images"
    
    cd "$PROJECT_DIR"
    
    # Télécharger les images spécifiées dans le compose file
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull
    
    log_success "Images téléchargées avec succès"
    trace_operation "pull_images" "SUCCESS" "Images downloaded successfully"
}

# Démarrer les services
start_services() {
    log_info "Démarrage des services Meeshy..."
    trace_operation "start_services" "STARTED" "Starting Meeshy services"
    
    cd "$PROJECT_DIR"
    
    # Créer le réseau s'il n'existe pas
    docker network create meeshy-network 2>/dev/null || true
    log_info "Réseau meeshy-network vérifié"
    
    # Démarrer les services
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    
    log_success "Services démarrés avec succès"
    trace_operation "start_services" "SUCCESS" "Services started successfully"
    
    # Attendre que les services soient prêts
    log_info "Attente du démarrage des services..."
    sleep 3
    
    # Vérifier le statut
    show_status
}

# Afficher le statut des services
show_status() {
    log_info "Statut des services Meeshy:"
    echo ""
    
    cd "$PROJECT_DIR"
    
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
    
    echo ""
    log_info "Vérification de la santé des services..."
    
    # Vérifier les ports
    local ports=("80" "443" "3000" "8000" "3100")
    for port in "${ports[@]}"; do
        if netstat -tuln | grep -q ":$port "; then
            log_success "Port $port: Ouvert"
        else
            log_warning "Port $port: Fermé"
        fi
    done
    
    trace_operation "status_check" "SUCCESS" "Status check completed"
}

# Afficher les logs
show_logs() {
    log_info "Logs de tous les services:"
    
    cd "$PROJECT_DIR"
    
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs -f --tail=50
}

# Fonction principale
main() {
    local no_pull=false
    local show_logs_after=false
    
    # Parser les arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --no-pull)
                no_pull=true
                shift
                ;;
            --logs)
                show_logs_after=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "Option inconnue: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # Vérifications préliminaires
    check_prerequisites
    load_environment
    
    # Télécharger les images si demandé
    if [ "$no_pull" = false ]; then
        pull_images
    else
        log_info "Téléchargement des images ignoré (--no-pull)"
    fi
    
    # Démarrer les services
    start_services
    
    # Afficher les logs si demandé
    if [ "$show_logs_after" = true ]; then
        sleep 5
        show_logs
    fi
    
    # Finaliser la traçabilité
    finalize_tracing "SUCCESS" "Services started successfully"
    
    log_success "Démarrage des services terminé avec succès"
}

# Exécuter la fonction principale
main "$@"
