#!/bin/bash

# ===== MEESHY - GESTION DES LOGS =====
# Script spécialisé pour afficher et gérer les logs des services Meeshy
# Usage: ./meeshy-logs.sh [SERVICE] [OPTIONS]

set -e

# Charger la configuration globale
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/meeshy-config.sh"

# Initialiser la traçabilité
init_tracing "meeshy-logs" "logs_management"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}📋 MEESHY - GESTION DES LOGS${NC}"
    echo "==============================="
    echo ""
    echo "Usage:"
    echo "  ./meeshy-logs.sh [SERVICE] [OPTIONS]"
    echo ""
    echo "Services disponibles:"
    echo "  traefik     - Logs du reverse proxy Traefik"
    echo "  database    - Logs de MongoDB"
    echo "  redis       - Logs de Redis"
    echo "  translator  - Logs du service de traduction"
    echo "  gateway     - Logs de l'API Gateway"
    echo "  frontend    - Logs du frontend Next.js"
    echo "  all         - Logs de tous les services (défaut)"
    echo ""
    echo "Options:"
    echo "  --tail N    - Afficher les N dernières lignes (défaut: 50)"
    echo "  --follow    - Suivre les logs en temps réel"
    echo "  --since     - Logs depuis (ex: 1h, 30m, 2023-01-01)"
    echo "  --until     - Logs jusqu'à (ex: 1h, 30m, 2023-01-01)"
    echo "  --export    - Exporter les logs vers un fichier"
    echo "  --help      - Afficher cette aide"
    echo ""
    echo "Exemples:"
    echo "  ./meeshy-logs.sh"
    echo "  ./meeshy-logs.sh gateway --tail 100"
    echo "  ./meeshy-logs.sh translator --follow"
    echo "  ./meeshy-logs.sh all --since 1h"
    echo "  ./meeshy-logs.sh database --export"
    echo ""
}

# Afficher les logs d'un service
show_service_logs() {
    local service="$1"
    local tail_lines="$2"
    local follow="$3"
    local since="$4"
    local until="$5"
    local export_file="$6"
    
    log_info "Affichage des logs du service: $service"
    trace_operation "show_logs" "STARTED" "Showing logs for service: $service"
    
    cd "$PROJECT_DIR"
    
    # Construire la commande docker-compose logs
    local cmd="$COMPOSE_CMD -f $COMPOSE_FILE --env-file $ENV_FILE logs"
    
    # Ajouter les options
    if [ "$follow" = true ]; then
        cmd="$cmd -f"
    fi
    
    if [ -n "$tail_lines" ]; then
        cmd="$cmd --tail=$tail_lines"
    fi
    
    if [ -n "$since" ]; then
        cmd="$cmd --since=$since"
    fi
    
    if [ -n "$until" ]; then
        cmd="$cmd --until=$until"
    fi
    
    # Ajouter le service
    if [ "$service" != "all" ]; then
        cmd="$cmd $service"
    fi
    
    # Exécuter la commande
    if [ -n "$export_file" ]; then
        log_info "Export des logs vers: $export_file"
        eval "$cmd" > "$export_file"
        log_success "Logs exportés vers: $export_file"
        trace_operation "export_logs" "SUCCESS" "Logs exported to $export_file"
    else
        eval "$cmd"
    fi
    
    trace_operation "show_logs" "SUCCESS" "Logs displayed for service: $service"
}

# Lister les services disponibles
list_services() {
    log_info "Services disponibles:"
    echo ""
    
    cd "$PROJECT_DIR"
    
    # Obtenir la liste des services depuis docker-compose
    local services=$($COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" config --services 2>/dev/null || echo "traefik database redis translator gateway frontend")
    
    for service in $services; do
        local status="❌ Arrêté"
        if docker ps | grep -q "meeshy-$service"; then
            status="✅ En cours"
        fi
        echo "  $service: $status"
    done
    
    echo ""
}

# Analyser les logs pour détecter les erreurs
analyze_logs() {
    local service="$1"
    local hours="${2:-24}"
    
    log_info "Analyse des logs du service $service (dernières $hours heures)..."
    trace_operation "analyze_logs" "STARTED" "Analyzing logs for service: $service"
    
    cd "$PROJECT_DIR"
    
    # Obtenir les logs récents
    local logs=$($COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs --since="${hours}h" $service 2>/dev/null || echo "")
    
    if [ -z "$logs" ]; then
        log_warning "Aucun log trouvé pour le service $service"
        return
    fi
    
    # Compter les erreurs
    local error_count=$(echo "$logs" | grep -i "error\|exception\|failed\|fatal" | wc -l)
    local warning_count=$(echo "$logs" | grep -i "warning\|warn" | wc -l)
    local total_lines=$(echo "$logs" | wc -l)
    
    echo "=== ANALYSE DES LOGS - $service ==="
    echo "Période: dernières $hours heures"
    echo "Total des lignes: $total_lines"
    echo "Erreurs: $error_count"
    echo "Avertissements: $warning_count"
    echo ""
    
    if [ "$error_count" -gt 0 ]; then
        echo "=== DERNIÈRES ERREURS ==="
        echo "$logs" | grep -i "error\|exception\|failed\|fatal" | tail -10
        echo ""
    fi
    
    if [ "$warning_count" -gt 0 ]; then
        echo "=== DERNIERS AVERTISSEMENTS ==="
        echo "$logs" | grep -i "warning\|warn" | tail -10
        echo ""
    fi
    
    trace_operation "analyze_logs" "SUCCESS" "Log analysis completed for service: $service"
}

# Nettoyer les anciens logs
cleanup_logs() {
    local days="${1:-7}"
    
    log_info "Nettoyage des logs anciens (plus de $days jours)..."
    trace_operation "cleanup_logs" "STARTED" "Cleaning logs older than $days days"
    
    cd "$PROJECT_DIR"
    
    # Nettoyer les logs Docker
    docker system prune -f --filter "until=${days}d"
    
    # Nettoyer les logs locaux
    find "$MEESHY_LOGS_DIR" -name "*.log" -mtime +$days -delete 2>/dev/null || true
    
    log_success "Nettoyage des logs terminé"
    trace_operation "cleanup_logs" "SUCCESS" "Log cleanup completed"
}

# Fonction principale
main() {
    local service="all"
    local tail_lines="50"
    local follow=false
    local since=""
    local until=""
    local export_file=""
    local analyze=false
    local cleanup=false
    local list=false
    
    # Parser les arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --tail)
                tail_lines="$2"
                shift 2
                ;;
            --follow|-f)
                follow=true
                shift
                ;;
            --since)
                since="$2"
                shift 2
                ;;
            --until)
                until="$2"
                shift 2
                ;;
            --export)
                export_file="$2"
                shift 2
                ;;
            --analyze)
                analyze=true
                shift
                ;;
            --cleanup)
                cleanup=true
                shift
                ;;
            --list)
                list=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            -*)
                log_error "Option inconnue: $1"
                show_help
                exit 1
                ;;
            *)
                if [ "$service" = "all" ]; then
                    service="$1"
                fi
                shift
                ;;
        esac
    done
    
    # Vérifications préliminaires
    check_prerequisites
    load_environment
    
    # Exécuter la fonction demandée
    if [ "$list" = true ]; then
        list_services
    elif [ "$cleanup" = true ]; then
        cleanup_logs
    elif [ "$analyze" = true ]; then
        analyze_logs "$service"
    else
        show_service_logs "$service" "$tail_lines" "$follow" "$since" "$until" "$export_file"
    fi
    
    # Finaliser la traçabilité
    finalize_tracing "SUCCESS" "Logs management completed"
}

# Exécuter la fonction principale
main "$@"
