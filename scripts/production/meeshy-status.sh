#!/bin/bash

# ===== MEESHY - STATUT ET SURVEILLANCE =====
# Script spécialisé pour surveiller le statut des services Meeshy
# Usage: ./meeshy-status.sh [OPTIONS]

set -e

# Charger la configuration globale
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/meeshy-config.sh"

# Initialiser la traçabilité
init_tracing "meeshy-status" "status_check"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}📊 MEESHY - STATUT ET SURVEILLANCE${NC}"
    echo "====================================="
    echo ""
    echo "Usage:"
    echo "  ./meeshy-status.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --detailed  - Affichage détaillé avec métriques"
    echo "  --health    - Vérification de santé complète"
    echo "  --watch     - Surveillance continue (rafraîchissement automatique)"
    echo "  --export    - Exporter le statut en JSON"
    echo "  --help      - Afficher cette aide"
    echo ""
    echo "Exemples:"
    echo "  ./meeshy-status.sh"
    echo "  ./meeshy-status.sh --detailed"
    echo "  ./meeshy-status.sh --health"
    echo "  ./meeshy-status.sh --watch"
    echo ""
}

# Afficher le statut de base
show_basic_status() {
    log_info "Statut des services Meeshy:"
    echo ""
    
    cd "$PROJECT_DIR"
    
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
    
    echo ""
    log_info "Vérification des ports..."
    
    # Vérifier les ports
    local ports=("80" "443" "3000" "8000" "3100")
    for port in "${ports[@]}"; do
        if netstat -tuln | grep -q ":$port "; then
            log_success "Port $port: Ouvert"
        else
            log_warning "Port $port: Fermé"
        fi
    done
    
    trace_operation "basic_status" "SUCCESS" "Basic status check completed"
}

# Afficher le statut détaillé
show_detailed_status() {
    log_info "Statut détaillé des services Meeshy:"
    echo ""
    
    cd "$PROJECT_DIR"
    
    # Informations système
    get_system_info
    echo ""
    
    # Statut des conteneurs
    echo "=== CONTENEURS DOCKER ==="
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
    echo ""
    
    # Utilisation des ressources
    echo "=== UTILISATION DES RESSOURCES ==="
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}" $(docker ps --filter "name=meeshy-" --format "{{.Names}}") 2>/dev/null || echo "Aucun conteneur Meeshy en cours d'exécution"
    echo ""
    
    # Vérification des ports
    echo "=== PORTS ET CONNECTIVITÉ ==="
    local ports=("80" "443" "3000" "8000" "3100")
    for port in "${ports[@]}"; do
        if netstat -tuln | grep -q ":$port "; then
            log_success "Port $port: Ouvert"
        else
            log_warning "Port $port: Fermé"
        fi
    done
    echo ""
    
    # Vérification des volumes
    echo "=== VOLUMES DOCKER ==="
    docker volume ls | grep meeshy || echo "Aucun volume Meeshy trouvé"
    echo ""
    
    # Vérification des réseaux
    echo "=== RÉSEAUX DOCKER ==="
    docker network ls | grep meeshy || echo "Aucun réseau Meeshy trouvé"
    echo ""
    
    trace_operation "detailed_status" "SUCCESS" "Detailed status check completed"
}

# Vérification de santé complète
check_health() {
    log_info "Vérification de santé complète des services..."
    trace_operation "health_check" "STARTED" "Starting comprehensive health check"
    
    cd "$PROJECT_DIR"
    
    # Vérifier les conteneurs
    local containers=("meeshy-traefik" "meeshy-database" "meeshy-redis" "meeshy-translator" "meeshy-gateway" "meeshy-web")
    local healthy_containers=0
    local total_containers=${#containers[@]}
    
    echo "=== VÉRIFICATION DES CONTENEURS ==="
    for container in "${containers[@]}"; do
        if docker ps | grep -q "$container"; then
            local status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "unknown")
            if [ "$status" = "running" ]; then
                log_success "$container: En cours d'exécution"
                ((healthy_containers++))
            else
                log_warning "$container: Statut $status"
            fi
        else
            log_error "$container: Non trouvé"
        fi
    done
    echo ""
    
    # Vérifier les endpoints
    echo "=== VÉRIFICATION DES ENDPOINTS ==="
    
    # Traefik
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost" | grep -q "200\|301\|302"; then
        log_success "Traefik: Accessible"
    else
        log_warning "Traefik: Non accessible"
    fi
    
    # Gateway
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/health" | grep -q "200"; then
        log_success "Gateway: Accessible"
    else
        log_warning "Gateway: Non accessible"
    fi
    
    # Translator
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:8000/health" | grep -q "200"; then
        log_success "Translator: Accessible"
    else
        log_warning "Translator: Non accessible"
    fi
    echo ""
    
    # Résumé de santé
    echo "=== RÉSUMÉ DE SANTÉ ==="
    echo "Conteneurs sains: $healthy_containers/$total_containers"
    
    if [ "$healthy_containers" -eq "$total_containers" ]; then
        log_success "Tous les services sont opérationnels"
        trace_operation "health_check" "SUCCESS" "All services healthy"
    else
        log_warning "Certains services ont des problèmes"
        trace_operation "health_check" "WARNING" "$healthy_containers/$total_containers services healthy"
    fi
}

# Surveillance continue
watch_status() {
    log_info "Surveillance continue des services (Ctrl+C pour arrêter)..."
    
    while true; do
        clear
        echo "=== MEESHY STATUS WATCH - $(date) ==="
        echo ""
        show_basic_status
        echo ""
        echo "Rafraîchissement dans 3 secondes... (Ctrl+C pour arrêter)"
        sleep 3
    done
}

# Exporter le statut en JSON
export_status_json() {
    log_info "Export du statut en JSON..."
    
    cd "$PROJECT_DIR"
    
    # Créer un fichier JSON avec le statut
    local json_file="$MEESHY_TRACE_DIR/status_$(date +%Y%m%d_%H%M%S).json"
    
    cat > "$json_file" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "deployment_id": "$MEESHY_DEPLOYMENT_ID",
  "version": "$MEESHY_VERSION",
  "environment": "$MEESHY_ENVIRONMENT",
  "containers": [
EOF

    # Ajouter les informations des conteneurs
    local containers=("meeshy-traefik" "meeshy-database" "meeshy-redis" "meeshy-translator" "meeshy-gateway" "meeshy-web")
    local first=true
    
    for container in "${containers[@]}"; do
        if [ "$first" = true ]; then
            first=false
        else
            echo "," >> "$json_file"
        fi
        
        local status="unknown"
        local running="false"
        
        if docker ps | grep -q "$container"; then
            status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "unknown")
            running="true"
        fi
        
        cat >> "$json_file" << EOF
    {
      "name": "$container",
      "running": $running,
      "status": "$status"
    }
EOF
    done
    
    cat >> "$json_file" << EOF
  ],
  "ports": [
EOF

    # Ajouter les informations des ports
    local ports=("80" "443" "3000" "8000" "3100")
    local first=true
    
    for port in "${ports[@]}"; do
        if [ "$first" = true ]; then
            first=false
        else
            echo "," >> "$json_file"
        fi
        
        local open="false"
        if netstat -tuln | grep -q ":$port "; then
            open="true"
        fi
        
        cat >> "$json_file" << EOF
    {
      "port": $port,
      "open": $open
    }
EOF
    done
    
    cat >> "$json_file" << EOF
  ]
}
EOF

    log_success "Statut exporté vers: $json_file"
    trace_operation "export_status" "SUCCESS" "Status exported to $json_file"
}

# Fonction principale
main() {
    local detailed=false
    local health=false
    local watch=false
    local export=false
    
    # Parser les arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --detailed)
                detailed=true
                shift
                ;;
            --health)
                health=true
                shift
                ;;
            --watch)
                watch=true
                shift
                ;;
            --export)
                export=true
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
    
    # Exécuter la fonction demandée
    if [ "$export" = true ]; then
        export_status_json
    elif [ "$watch" = true ]; then
        watch_status
    elif [ "$health" = true ]; then
        check_health
    elif [ "$detailed" = true ]; then
        show_detailed_status
    else
        show_basic_status
    fi
    
    # Finaliser la traçabilité
    finalize_tracing "SUCCESS" "Status check completed"
}

# Exécuter la fonction principale
main "$@"
