#!/bin/bash

# ===== MEESHY - MAINTENANCE ET NETTOYAGE =====
# Script spécialisé pour la maintenance et le nettoyage des services Meeshy
# Usage: ./meeshy-maintenance.sh [COMMAND] [OPTIONS]

set -e

# Charger la configuration globale
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/meeshy-config.sh"

# Initialiser la traçabilité
init_tracing "meeshy-maintenance" "maintenance_operations"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🔧 MEESHY - MAINTENANCE ET NETTOYAGE${NC}"
    echo "======================================="
    echo ""
    echo "Usage:"
    echo "  ./meeshy-maintenance.sh [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  clean       - Nettoyer les conteneurs et images inutilisés"
    echo "  backup      - Sauvegarder les données"
    echo "  restore     - Restaurer les données"
    echo "  update      - Mettre à jour et redémarrer"
    echo "  health      - Vérifier la santé des services"
    echo "  optimize    - Optimiser les performances"
    echo "  security    - Vérifications de sécurité"
    echo ""
    echo "Options:"
    echo "  --force     - Forcer l'opération"
    echo "  --dry-run   - Simulation sans exécution"
    echo "  --help      - Afficher cette aide"
    echo ""
    echo "Exemples:"
    echo "  ./meeshy-maintenance.sh clean"
    echo "  ./meeshy-maintenance.sh backup --force"
    echo "  ./meeshy-maintenance.sh update"
    echo "  ./meeshy-maintenance.sh health"
    echo ""
}

# Nettoyer les conteneurs et images inutilisés
clean_system() {
    local force="$1"
    local dry_run="$2"
    
    log_info "Nettoyage du système..."
    trace_operation "clean_system" "STARTED" "Starting system cleanup"
    
    if [ "$dry_run" = true ]; then
        log_info "Mode simulation - aucune action ne sera effectuée"
    fi
    
    cd "$PROJECT_DIR"
    
    # Arrêter tous les conteneurs
    if [ "$dry_run" = false ]; then
        if [ "$force" = true ]; then
            log_warning "Arrêt forcé de tous les conteneurs..."
            docker stop $(docker ps -aq) 2>/dev/null || true
        else
            log_info "Arrêt des conteneurs Meeshy..."
            docker stop $(docker ps -q --filter "name=meeshy-") 2>/dev/null || true
        fi
    else
        log_info "Simulation: Arrêt des conteneurs"
    fi
    
    # Supprimer tous les conteneurs
    if [ "$dry_run" = false ]; then
        if [ "$force" = true ]; then
            log_warning "Suppression de tous les conteneurs..."
            docker rm $(docker ps -aq) 2>/dev/null || true
        else
            log_info "Suppression des conteneurs Meeshy..."
            docker rm $(docker ps -aq --filter "name=meeshy-") 2>/dev/null || true
        fi
    else
        log_info "Simulation: Suppression des conteneurs"
    fi
    
    # Supprimer les images inutilisées
    if [ "$dry_run" = false ]; then
        log_info "Suppression des images inutilisées..."
        docker image prune -f
    else
        log_info "Simulation: Suppression des images inutilisées"
    fi
    
    # Supprimer les volumes inutilisés
    if [ "$dry_run" = false ]; then
        log_info "Suppression des volumes inutilisés..."
        docker volume prune -f
    else
        log_info "Simulation: Suppression des volumes inutilisés"
    fi
    
    # Supprimer les réseaux inutilisés
    if [ "$dry_run" = false ]; then
        log_info "Suppression des réseaux inutilisés..."
        docker network prune -f
    else
        log_info "Simulation: Suppression des réseaux inutilisés"
    fi
    
    log_success "Nettoyage terminé"
    trace_operation "clean_system" "SUCCESS" "System cleanup completed"
}

# Sauvegarder les données
backup_data() {
    local force="$1"
    local dry_run="$2"
    
    log_info "Sauvegarde des données..."
    trace_operation "backup_data" "STARTED" "Starting data backup"
    
    local backup_dir="$MEESHY_BACKUP_DIR"
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    
    if [ "$dry_run" = true ]; then
        log_info "Mode simulation - aucune sauvegarde ne sera effectuée"
        log_info "Répertoire de sauvegarde: $backup_dir"
        log_info "Timestamp: $timestamp"
        return
    fi
    
    mkdir -p "$backup_dir"
    
    # Sauvegarder la base de données
    log_info "Sauvegarde de MongoDB..."
    if docker ps | grep -q "meeshy-database"; then
        docker exec meeshy-database mongodump --out /tmp/backup
        docker cp meeshy-database:/tmp/backup "$backup_dir/mongodb_$timestamp"
        log_success "MongoDB sauvegardé"
    else
        log_warning "MongoDB non disponible pour la sauvegarde"
    fi
    
    # Sauvegarder Redis
    log_info "Sauvegarde de Redis..."
    if docker ps | grep -q "meeshy-redis"; then
        docker exec meeshy-redis redis-cli BGSAVE
        docker cp meeshy-redis:/data/dump.rdb "$backup_dir/redis_$timestamp.rdb"
        log_success "Redis sauvegardé"
    else
        log_warning "Redis non disponible pour la sauvegarde"
    fi
    
    # Sauvegarder les volumes
    log_info "Sauvegarde des volumes..."
    docker run --rm -v meeshy_database_data:/data -v "$backup_dir":/backup alpine tar czf /backup/database_data_$timestamp.tar.gz -C /data . 2>/dev/null || true
    docker run --rm -v meeshy_redis_data:/data -v "$backup_dir":/backup alpine tar czf /backup/redis_data_$timestamp.tar.gz -C /data . 2>/dev/null || true
    
    log_success "Sauvegarde terminée dans $backup_dir"
    trace_operation "backup_data" "SUCCESS" "Data backup completed"
}

# Restaurer les données
restore_data() {
    local force="$1"
    local dry_run="$2"
    
    log_warning "Cette opération va restaurer les données depuis la dernière sauvegarde"
    
    if [ "$dry_run" = true ]; then
        log_info "Mode simulation - aucune restauration ne sera effectuée"
        return
    fi
    
    if [ "$force" != true ]; then
        read -p "Êtes-vous sûr ? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Restauration annulée"
            return
        fi
    fi
    
    log_info "Restauration des données..."
    trace_operation "restore_data" "STARTED" "Starting data restore"
    
    local backup_dir="$MEESHY_BACKUP_DIR"
    
    # Trouver la dernière sauvegarde
    local latest_backup=$(ls -t "$backup_dir" | head -1)
    
    if [ -z "$latest_backup" ]; then
        log_error "Aucune sauvegarde trouvée"
        trace_operation "restore_data" "FAILED" "No backup found"
        return
    fi
    
    log_info "Restauration depuis $latest_backup"
    
    # Restaurer la base de données
    if [[ "$latest_backup" == mongodb_* ]]; then
        docker cp "$backup_dir/$latest_backup" meeshy-database:/tmp/restore
        docker exec meeshy-database mongorestore /tmp/restore
        log_success "MongoDB restauré"
    fi
    
    # Restaurer Redis
    if [[ "$latest_backup" == redis_*.rdb ]]; then
        docker cp "$backup_dir/$latest_backup" meeshy-redis:/data/dump.rdb
        docker restart meeshy-redis
        log_success "Redis restauré"
    fi
    
    log_success "Restauration terminée"
    trace_operation "restore_data" "SUCCESS" "Data restore completed"
}

# Mettre à jour et redémarrer
update_services() {
    local force="$1"
    local dry_run="$2"
    
    log_info "Mise à jour des services Meeshy..."
    trace_operation "update_services" "STARTED" "Starting services update"
    
    cd "$PROJECT_DIR"
    
    if [ "$dry_run" = false ]; then
        # === ÉTAPE 1: BACKUP AUTOMATIQUE ===
        log_warning "⚠️  Sauvegarde automatique avant mise à jour..."
        if [ -f "$SCRIPT_DIR/meeshy-auto-backup.sh" ]; then
            bash "$SCRIPT_DIR/meeshy-auto-backup.sh" "$PROJECT_DIR/backups" || {
                log_warning "Le backup automatique a échoué, mais on continue..."
            }
        else
            log_warning "Script de backup non trouvé, on continue sans backup..."
        fi
        
        # === ÉTAPE 2: TÉLÉCHARGEMENT DES IMAGES ===
        log_info "Téléchargement des dernières images..."
        $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull
        
        # === ÉTAPE 3: ARRÊT DES SERVICES (SANS SUPPRIMER LES VOLUMES) ===
        log_info "Arrêt des services (conservation des volumes)..."
        $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop
        
        # === ÉTAPE 4: SUPPRESSION DES ANCIENS CONTENEURS ===
        log_info "Suppression des anciens conteneurs..."
        $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" rm -f
        
        # === ÉTAPE 5: REDÉMARRAGE AVEC LES NOUVELLES IMAGES ===
        log_info "Redémarrage des services avec les nouvelles images..."
        $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
        
        log_success "✅ Mise à jour terminée (volumes et données préservés)"
        log_info "💾 Backup disponible dans: $PROJECT_DIR/backups/"
    else
        log_info "Mode simulation - mise à jour simulée"
    fi
    
    trace_operation "update_services" "SUCCESS" "Services update completed"
}

# Vérifier la santé des services
check_health() {
    log_info "Vérification de la santé des services..."
    trace_operation "check_health" "STARTED" "Starting health check"
    
    cd "$PROJECT_DIR"
    
    # Vérifier les conteneurs
    local containers=("meeshy-traefik" "meeshy-database" "meeshy-redis" "meeshy-translator" "meeshy-gateway" "meeshy-web")
    local healthy_containers=0
    local total_containers=${#containers[@]}
    
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
    
    # Résumé de santé
    echo ""
    echo "=== RÉSUMÉ DE SANTÉ ==="
    echo "Conteneurs sains: $healthy_containers/$total_containers"
    
    if [ "$healthy_containers" -eq "$total_containers" ]; then
        log_success "Tous les services sont opérationnels"
        trace_operation "check_health" "SUCCESS" "All services healthy"
    else
        log_warning "Certains services ont des problèmes"
        trace_operation "check_health" "WARNING" "$healthy_containers/$total_containers services healthy"
    fi
}

# Optimiser les performances
optimize_performance() {
    local force="$1"
    local dry_run="$2"
    
    log_info "Optimisation des performances..."
    trace_operation "optimize_performance" "STARTED" "Starting performance optimization"
    
    if [ "$dry_run" = true ]; then
        log_info "Mode simulation - aucune optimisation ne sera effectuée"
        return
    fi
    
    cd "$PROJECT_DIR"
    
    # Nettoyer les logs anciens
    log_info "Nettoyage des logs anciens..."
    find "$MEESHY_LOGS_DIR" -name "*.log" -mtime +7 -delete 2>/dev/null || true
    
    # Optimiser les volumes Docker
    log_info "Optimisation des volumes Docker..."
    docker system df
    
    # Redémarrer les services pour libérer la mémoire
    if [ "$force" = true ]; then
        log_info "Redémarrage des services pour libérer la mémoire..."
        $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart
    fi
    
    log_success "Optimisation terminée"
    trace_operation "optimize_performance" "SUCCESS" "Performance optimization completed"
}

# Vérifications de sécurité
security_check() {
    log_info "Vérifications de sécurité..."
    trace_operation "security_check" "STARTED" "Starting security check"
    
    cd "$PROJECT_DIR"
    
    # Vérifier les permissions des fichiers sensibles
    log_info "Vérification des permissions des fichiers sensibles..."
    if [ -f "$ENV_FILE" ]; then
        local perms=$(stat -c "%a" "$ENV_FILE" 2>/dev/null || echo "unknown")
        if [ "$perms" = "600" ]; then
            log_success "Permissions du fichier d'environnement: $perms (sécurisé)"
        else
            log_warning "Permissions du fichier d'environnement: $perms (recommandé: 600)"
        fi
    fi
    
    # Vérifier les conteneurs en cours d'exécution
    log_info "Vérification des conteneurs en cours d'exécution..."
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    
    # Vérifier les ports ouverts
    log_info "Vérification des ports ouverts..."
    netstat -tuln | grep -E ":(80|443|3000|8000|3100) " || echo "Aucun port Meeshy détecté"
    
    log_success "Vérifications de sécurité terminées"
    trace_operation "security_check" "SUCCESS" "Security check completed"
}

# Fonction principale
main() {
    local command="$1"
    local force=false
    local dry_run=false
    
    # Parser les arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --force)
                force=true
                shift
                ;;
            --dry-run)
                dry_run=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                if [ -z "$command" ]; then
                    command="$1"
                fi
                shift
                ;;
        esac
    done
    
    # Vérifications préliminaires
    check_prerequisites
    load_environment
    
    # Exécuter la commande demandée
    case "$command" in
        "clean")
            clean_system "$force" "$dry_run"
            ;;
        "backup")
            backup_data "$force" "$dry_run"
            ;;
        "restore")
            restore_data "$force" "$dry_run"
            ;;
        "update")
            update_services "$force" "$dry_run"
            ;;
        "health")
            check_health
            ;;
        "optimize")
            optimize_performance "$force" "$dry_run"
            ;;
        "security")
            security_check
            ;;
        "help"|"-h"|"--help"|"")
            show_help
            ;;
        *)
            log_error "Commande inconnue: $command"
            show_help
            exit 1
            ;;
    esac
    
    # Finaliser la traçabilité
    finalize_tracing "SUCCESS" "Maintenance operation completed: $command"
}

# Exécuter la fonction principale
main "$@"
