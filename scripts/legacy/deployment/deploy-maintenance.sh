#!/bin/bash

# ===== MEESHY - MAINTENANCE ET GESTION =====
# Script spécialisé pour la maintenance et la gestion des services
# Usage: ./deploy-maintenance.sh [COMMAND] [DROPLET_IP]

set -e

# Charger la configuration de déploiement
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

# Initialiser la traçabilité
init_deploy_tracing "deploy-maintenance" "maintenance_operations"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🔧 MEESHY - MAINTENANCE ET GESTION${NC}"
    echo "====================================="
    echo ""
    echo "Usage:"
    echo "  ./deploy-maintenance.sh [COMMAND] [DROPLET_IP]"
    echo ""
    echo "Commands:"
    echo -e "${GREEN}  Gestion des services:${NC}"
    echo "    status     - Afficher le statut des services"
    echo "    logs       - Afficher les logs des services"
    echo "    restart    - Redémarrer les services"
    echo "    stop       - Arrêter les services"
    echo "    start      - Démarrer les services"
    echo ""
    echo -e "${GREEN}  Maintenance:${NC}"
    echo "    cleanup    - Nettoyer les ressources Docker"
    echo "    backup     - Sauvegarder les données"
    echo "    restore    - Restaurer les données"
    echo "    update     - Mettre à jour les services"
    echo ""
    echo -e "${GREEN}  Monitoring:${NC}"
    echo "    monitor    - Surveillance en temps réel"
    echo "    stats      - Statistiques des services"
    echo "    health     - Vérification de santé"
    echo ""
    echo "Exemples:"
    echo "  ./deploy-maintenance.sh status 192.168.1.100"
    echo "  ./deploy-maintenance.sh logs 192.168.1.100"
    echo "  ./deploy-maintenance.sh restart 192.168.1.100"
    echo "  ./deploy-maintenance.sh cleanup 192.168.1.100"
    echo ""
}

# Afficher le statut des services
show_services_status() {
    local ip="$1"
    
    log_info "Affichage du statut des services..."
    trace_deploy_operation "show_status" "STARTED" "Showing services status on $ip"
    
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        cd /opt/meeshy
        
        echo "=== STATUT DES SERVICES MEESHY ==="
        echo "Date: $(date)"
        echo "Serveur: $(hostname)"
        echo ""
        
        # Statut détaillé
        docker compose ps
        
        echo ""
        echo "=== RÉSUMÉ DU STATUT ==="
        
        # Compter les services
        total_services=$(docker compose ps | grep -E "(traefik|redis|mongodb|gateway|translator|frontend)" | wc -l)
        running_services=$(docker compose ps | grep -E "(traefik|redis|mongodb|gateway|translator|frontend)" | grep "Up" | wc -l)
        
        echo "Services total: $total_services"
        echo "Services en cours d'exécution: $running_services"
        
        if [ $running_services -eq $total_services ]; then
            echo "✅ Tous les services sont en cours d'exécution"
        else
            echo "❌ Certains services ne sont pas en cours d'exécution"
        fi
        
        echo ""
        echo "=== UTILISATION DES RESSOURCES ==="
        docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Statut des services affiché"
        trace_deploy_operation "show_status" "SUCCESS" "Services status displayed on $ip"
    else
        log_error "Échec de l'affichage du statut"
        trace_deploy_operation "show_status" "FAILED" "Services status display failed on $ip"
        exit 1
    fi
}

# Afficher les logs des services
show_services_logs() {
    local ip="$1"
    local service="${2:-all}"
    local lines="${3:-50}"
    
    log_info "Affichage des logs des services..."
    trace_deploy_operation "show_logs" "STARTED" "Showing services logs on $ip"
    
    if [ "$service" = "all" ]; then
        # Afficher les logs de tous les services
        ssh -o StrictHostKeyChecking=no root@$ip << EOF
            cd /opt/meeshy
            
            echo "=== LOGS DES SERVICES MEESHY (dernières $lines lignes) ==="
            echo "Date: \$(date)"
            echo ""
            
            services=("traefik" "redis" "mongodb" "gateway" "translator" "frontend")
            
            for svc in "\${services[@]}"; do
                echo "--- \$svc ---"
                docker compose logs --tail=$lines \$svc
                echo ""
            done
EOF
    else
        # Afficher les logs d'un service spécifique
        ssh -o StrictHostKeyChecking=no root@$ip << EOF
            cd /opt/meeshy
            
            echo "=== LOGS DU SERVICE $service (dernières $lines lignes) ==="
            echo "Date: \$(date)"
            echo ""
            
            docker compose logs --tail=$lines $service
EOF
    fi
    
    if [ $? -eq 0 ]; then
        log_success "Logs des services affichés"
        trace_deploy_operation "show_logs" "SUCCESS" "Services logs displayed on $ip"
    else
        log_error "Échec de l'affichage des logs"
        trace_deploy_operation "show_logs" "FAILED" "Services logs display failed on $ip"
        exit 1
    fi
}

# Redémarrer les services
restart_services() {
    local ip="$1"
    local service="${2:-all}"
    
    log_info "Redémarrage des services..."
    trace_deploy_operation "restart_services" "STARTED" "Restarting services on $ip"
    
    if [ "$service" = "all" ]; then
        # Redémarrer tous les services
        ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
            cd /opt/meeshy
            
            echo "=== REDÉMARRAGE DE TOUS LES SERVICES ==="
            echo "Date: $(date)"
            echo ""
            
            # Arrêter tous les services SANS supprimer les volumes
            echo "Arrêt des services (conservation des volumes)..."
            docker compose stop
            
            # Attendre un peu
            sleep 5
            
            # Redémarrer tous les services
            echo "Redémarrage des services..."
            docker compose up -d
            
            # Attendre que les services soient prêts
            echo "Attente que les services soient prêts..."
            sleep 30
            
            # Vérifier le statut
            echo "Vérification du statut..."
            docker compose ps
EOF
    else
        # Redémarrer un service spécifique
        ssh -o StrictHostKeyChecking=no root@$ip << EOF
            cd /opt/meeshy
            
            echo "=== REDÉMARRAGE DU SERVICE $service ==="
            echo "Date: \$(date)"
            echo ""
            
            # Redémarrer le service
            echo "Redémarrage du service $service..."
            docker compose restart $service
            
            # Attendre que le service soit prêt
            echo "Attente que le service soit prêt..."
            sleep 3
            
            # Vérifier le statut
            echo "Vérification du statut..."
            docker compose ps $service
EOF
    fi
    
    if [ $? -eq 0 ]; then
        log_success "Services redémarrés avec succès"
        trace_deploy_operation "restart_services" "SUCCESS" "Services restarted on $ip"
    else
        log_error "Échec du redémarrage des services"
        trace_deploy_operation "restart_services" "FAILED" "Services restart failed on $ip"
        exit 1
    fi
}

# Arrêter les services
stop_services() {
    local ip="$1"
    local service="${2:-all}"
    
    log_info "Arrêt des services..."
    trace_deploy_operation "stop_services" "STARTED" "Stopping services on $ip"
    
    if [ "$service" = "all" ]; then
        # Arrêter tous les services
        ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
            cd /opt/meeshy
            
            echo "=== ARRÊT DE TOUS LES SERVICES ==="
            echo "Date: $(date)"
            echo ""
            
            # Arrêter tous les services SANS supprimer les volumes ni les réseaux
            echo "Arrêt des services (conservation des volumes et réseaux)..."
            docker compose stop
            
            # Vérifier le statut
            echo "Vérification du statut..."
            docker compose ps
EOF
    else
        # Arrêter un service spécifique
        ssh -o StrictHostKeyChecking=no root@$ip << EOF
            cd /opt/meeshy
            
            echo "=== ARRÊT DU SERVICE $service ==="
            echo "Date: \$(date)"
            echo ""
            
            # Arrêter le service
            echo "Arrêt du service $service..."
            docker compose stop $service
            
            # Vérifier le statut
            echo "Vérification du statut..."
            docker compose ps $service
EOF
    fi
    
    if [ $? -eq 0 ]; then
        log_success "Services arrêtés avec succès"
        trace_deploy_operation "stop_services" "SUCCESS" "Services stopped on $ip"
    else
        log_error "Échec de l'arrêt des services"
        trace_deploy_operation "stop_services" "FAILED" "Services stop failed on $ip"
        exit 1
    fi
}

# Démarrer les services
start_services() {
    local ip="$1"
    local service="${2:-all}"
    
    log_info "Démarrage des services..."
    trace_deploy_operation "start_services" "STARTED" "Starting services on $ip"
    
    if [ "$service" = "all" ]; then
        # Démarrer tous les services
        ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
            cd /opt/meeshy
            
            echo "=== DÉMARRAGE DE TOUS LES SERVICES ==="
            echo "Date: $(date)"
            echo ""
            
            # Démarrer tous les services
            echo "Démarrage des services..."
            docker compose up -d
            
            # Attendre que les services soient prêts
            echo "Attente que les services soient prêts..."
            sleep 30
            
            # Vérifier le statut
            echo "Vérification du statut..."
            docker compose ps
EOF
    else
        # Démarrer un service spécifique
        ssh -o StrictHostKeyChecking=no root@$ip << EOF
            cd /opt/meeshy
            
            echo "=== DÉMARRAGE DU SERVICE $service ==="
            echo "Date: \$(date)"
            echo ""
            
            # Démarrer le service
            echo "Démarrage du service $service..."
            docker compose up -d $service
            
            # Attendre que le service soit prêt
            echo "Attente que le service soit prêt..."
            sleep 3
            
            # Vérifier le statut
            echo "Vérification du statut..."
            docker compose ps $service
EOF
    fi
    
    if [ $? -eq 0 ]; then
        log_success "Services démarrés avec succès"
        trace_deploy_operation "start_services" "SUCCESS" "Services started on $ip"
    else
        log_error "Échec du démarrage des services"
        trace_deploy_operation "start_services" "FAILED" "Services start failed on $ip"
        exit 1
    fi
}

# Nettoyer les ressources Docker
cleanup_docker_resources() {
    local ip="$1"
    
    log_info "Nettoyage des ressources Docker..."
    trace_deploy_operation "cleanup_docker" "STARTED" "Cleaning up Docker resources on $ip"
    
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        echo "=== NETTOYAGE DES RESSOURCES DOCKER ==="
        echo "Date: $(date)"
        echo ""
        
        # Afficher l'espace utilisé avant le nettoyage
        echo "Espace utilisé avant le nettoyage:"
        docker system df
        
        echo ""
        echo "=== NETTOYAGE EN COURS ==="
        
        # Supprimer les conteneurs arrêtés
        echo "Suppression des conteneurs arrêtés..."
        docker container prune -f
        
        # Supprimer les images non utilisées
        echo "Suppression des images non utilisées..."
        docker image prune -f
        
        # Supprimer les volumes non utilisés
        echo "Suppression des volumes non utilisés..."
        docker volume prune -f
        
        # Supprimer les réseaux non utilisés
        echo "Suppression des réseaux non utilisés..."
        docker network prune -f
        
        # Nettoyage complet (optionnel, plus agressif)
        echo "Nettoyage complet du système Docker..."
        docker system prune -f
        
        echo ""
        echo "=== ESPACE LIBÉRÉ ==="
        docker system df
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Nettoyage des ressources Docker terminé"
        trace_deploy_operation "cleanup_docker" "SUCCESS" "Docker resources cleanup completed on $ip"
    else
        log_error "Échec du nettoyage des ressources Docker"
        trace_deploy_operation "cleanup_docker" "FAILED" "Docker resources cleanup failed on $ip"
        exit 1
    fi
}

# Sauvegarder les données
backup_data() {
    local ip="$1"
    local backup_dir="${2:-/opt/meeshy/backups}"
    
    log_info "Sauvegarde des données..."
    trace_deploy_operation "backup_data" "STARTED" "Backing up data on $ip"
    
    ssh -o StrictHostKeyChecking=no root@$ip << EOF
        echo "=== SAUVEGARDE DES DONNÉES ==="
        echo "Date: \$(date)"
        echo "Répertoire de sauvegarde: $backup_dir"
        echo ""
        
        # Créer le répertoire de sauvegarde
        mkdir -p $backup_dir
        
        # Sauvegarder MongoDB
        echo "Sauvegarde de MongoDB..."
        docker exec meeshy-database mongodump --out /tmp/backup
        docker cp meeshy-database:/tmp/backup $backup_dir/mongodb_backup_\$(date +%Y%m%d_%H%M%S)
        docker exec meeshy-database rm -rf /tmp/backup
        
        # Sauvegarder Redis (optionnel)
        echo "Sauvegarde de Redis..."
        docker exec meeshy-redis redis-cli BGSAVE
        sleep 5
        docker cp meeshy-redis:/data/dump.rdb $backup_dir/redis_backup_\$(date +%Y%m%d_%H%M%S).rdb
        
        # Sauvegarder les configurations
        echo "Sauvegarde des configurations..."
        tar -czf $backup_dir/config_backup_\$(date +%Y%m%d_%H%M%S).tar.gz /opt/meeshy/docker-compose.yml /opt/meeshy/.env /opt/meeshy/docker/ /opt/meeshy/shared/
        
        echo ""
        echo "=== SAUVEGARDE TERMINÉE ==="
        ls -la $backup_dir/
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Sauvegarde des données terminée"
        trace_deploy_operation "backup_data" "SUCCESS" "Data backup completed on $ip"
    else
        log_error "Échec de la sauvegarde des données"
        trace_deploy_operation "backup_data" "FAILED" "Data backup failed on $ip"
        exit 1
    fi
}

# Surveillance en temps réel
monitor_services() {
    local ip="$1"
    local duration="${2:-60}"
    
    log_info "Surveillance des services en temps réel..."
    trace_deploy_operation "monitor_services" "STARTED" "Monitoring services on $ip"
    
    ssh -o StrictHostKeyChecking=no root@$ip << EOF
        echo "=== SURVEILLANCE DES SERVICES ==="
        echo "Date: \$(date)"
        echo "Durée: $duration secondes"
        echo ""
        
        # Surveillance des conteneurs
        echo "Surveillance des conteneurs..."
        timeout $duration docker stats --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Surveillance terminée"
        trace_deploy_operation "monitor_services" "SUCCESS" "Services monitoring completed on $ip"
    else
        log_warning "Surveillance interrompue"
        trace_deploy_operation "monitor_services" "WARNING" "Services monitoring interrupted on $ip"
    fi
}

# Fonction principale
main() {
    local command="$1"
    local ip="$2"
    local service="$3"
    
    # Parser les arguments si appelé directement
    if [ -z "$command" ] && [ -n "$COMMAND" ]; then
        command="$COMMAND"
    fi
    
    if [ -z "$ip" ] && [ -n "$DROPLET_IP" ]; then
        ip="$DROPLET_IP"
    fi
    
    if [ -z "$command" ] || [ -z "$ip" ]; then
        log_error "Commande ou IP du serveur manquante"
        show_help
        exit 1
    fi
    
    log_info "🔧 Maintenance des services Meeshy sur le serveur $ip"
    
    case "$command" in
        "status")
            show_services_status "$ip"
            ;;
        "logs")
            show_services_logs "$ip" "$service"
            ;;
        "restart")
            restart_services "$ip" "$service"
            ;;
        "stop")
            stop_services "$ip" "$service"
            ;;
        "start")
            start_services "$ip" "$service"
            ;;
        "cleanup")
            cleanup_docker_resources "$ip"
            ;;
        "backup")
            backup_data "$ip"
            ;;
        "monitor")
            monitor_services "$ip"
            ;;
        "health")
            # Utiliser le script de vérification de santé
            "$SCRIPT_DIR/deploy-health-check.sh" "$ip"
            ;;
        *)
            log_error "Commande inconnue: $command"
            show_help
            exit 1
            ;;
    esac
    
    log_success "Opération de maintenance terminée avec succès"
    
    # Finaliser la traçabilité
    finalize_deploy_tracing "SUCCESS" "Maintenance operation $command completed for $ip"
}

# Exécuter la fonction principale si le script est appelé directement
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi
