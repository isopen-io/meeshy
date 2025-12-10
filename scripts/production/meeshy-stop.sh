#!/bin/bash

# ===== MEESHY - ARRÊT DES SERVICES =====
# Script spécialisé pour arrêter tous les services Meeshy
# Usage: ./meeshy-stop.sh [OPTIONS]

set -e

# Charger la configuration globale
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/meeshy-config.sh"

# Initialiser la traçabilité
init_tracing "meeshy-stop" "stop_services"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🛑 MEESHY - ARRÊT DES SERVICES${NC}"
    echo "=================================="
    echo ""
    echo "Usage:"
    echo "  ./meeshy-stop.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --force     - Forcer l'arrêt (arrêt brutal)"
    echo "  --clean     - Nettoyer les volumes après arrêt"
    echo "  --help      - Afficher cette aide"
    echo ""
    echo "Exemples:"
    echo "  ./meeshy-stop.sh"
    echo "  ./meeshy-stop.sh --force"
    echo "  ./meeshy-stop.sh --clean"
    echo ""
}

# Arrêter les services normalement
stop_services() {
    log_info "Arrêt des services Meeshy..."
    trace_operation "stop_services" "STARTED" "Stopping Meeshy services"
    
    cd "$PROJECT_DIR"
    
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down
    
    log_success "Services arrêtés avec succès"
    trace_operation "stop_services" "SUCCESS" "Services stopped successfully"
}

# Arrêter les services de force
force_stop_services() {
    log_warning "Arrêt forcé des services Meeshy..."
    trace_operation "force_stop_services" "STARTED" "Force stopping Meeshy services"
    
    cd "$PROJECT_DIR"
    
    # Arrêter tous les conteneurs Meeshy
    docker stop $(docker ps -q --filter "name=meeshy-") 2>/dev/null || true
    
    # Supprimer tous les conteneurs Meeshy
    docker rm $(docker ps -aq --filter "name=meeshy-") 2>/dev/null || true
    
    log_success "Services arrêtés de force"
    trace_operation "force_stop_services" "SUCCESS" "Services force stopped"
}

# Nettoyer les volumes
clean_volumes() {
    log_warning "Nettoyage des volumes..."
    trace_operation "clean_volumes" "STARTED" "Cleaning volumes"
    
    cd "$PROJECT_DIR"
    
    # Supprimer les volumes
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down -v
    
    log_success "Volumes nettoyés"
    trace_operation "clean_volumes" "SUCCESS" "Volumes cleaned"
}

# Vérifier le statut après arrêt
check_stopped_status() {
    log_info "Vérification du statut après arrêt..."
    
    cd "$PROJECT_DIR"
    
    # Vérifier qu'aucun conteneur Meeshy n'est en cours d'exécution
    local running_containers=$(docker ps --filter "name=meeshy-" --format "{{.Names}}" | wc -l)
    
    if [ "$running_containers" -eq 0 ]; then
        log_success "Aucun service Meeshy en cours d'exécution"
        trace_operation "status_check" "SUCCESS" "All services stopped"
    else
        log_warning "$running_containers service(s) encore en cours d'exécution"
        trace_operation "status_check" "WARNING" "$running_containers services still running"
    fi
}

# Fonction principale
main() {
    local force_stop=false
    local clean_volumes=false
    
    # Parser les arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --force)
                force_stop=true
                shift
                ;;
            --clean)
                clean_volumes=true
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
    
    # Arrêter les services
    if [ "$force_stop" = true ]; then
        force_stop_services
    else
        stop_services
    fi
    
    # Nettoyer les volumes si demandé
    if [ "$clean_volumes" = true ]; then
        clean_volumes
    fi
    
    # Vérifier le statut
    check_stopped_status
    
    # Finaliser la traçabilité
    finalize_tracing "SUCCESS" "Services stopped successfully"
    
    log_success "Arrêt des services terminé avec succès"
}

# Exécuter la fonction principale
main "$@"
