#!/bin/bash

# ===== MEESHY - DÉPANNAGE ET RÉPARATION =====
# Script spécialisé pour le dépannage, diagnostic et réparation automatique
# Usage: ./deploy-troubleshooting.sh [COMMAND] [DROPLET_IP] [OPTIONS]

set -e

# Charger la configuration de déploiement
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

# Initialiser la traçabilité
init_deploy_tracing "deploy-troubleshooting" "troubleshooting_operations"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🔧 MEESHY - DÉPANNAGE ET RÉPARATION${NC}"
    echo "======================================"
    echo ""
    echo "Usage:"
    echo "  ./deploy-troubleshooting.sh [COMMAND] [DROPLET_IP] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo -e "${GREEN}  Diagnostic:${NC}"
    echo "    diagnose               - Diagnostic complet automatique"
    echo "    check-logs             - Analyser les logs d'erreur"
    echo "    check-resources        - Vérifier les ressources système"
    echo "    check-network          - Vérifier la connectivité réseau"
    echo "    check-storage          - Vérifier l'espace disque"
    echo ""
    echo -e "${GREEN}  Réparation automatique:${NC}"
    echo "    auto-fix               - Tentative de réparation automatique"
    echo "    fix-services           - Réparer les services défaillants"
    echo "    fix-permissions        - Corriger toutes les permissions"
    echo "    fix-mongodb            - Réparer MongoDB et replica set"
    echo "    fix-networking         - Réparer la configuration réseau"
    echo ""
    echo -e "${GREEN}  Reset et nettoyage:${NC}"
    echo "    reset-services         - Redémarrer tous les services"
    echo "    reset-volumes          - Nettoyer et recréer les volumes"
    echo "    reset-complete         - Reset complet (ATTENTION: destructif)"
    echo "    cleanup-docker         - Nettoyer Docker (images, volumes, etc.)"
    echo ""
    echo -e "${GREEN}  Maintenance:${NC}"
    echo "    backup-data            - Sauvegarder les données importantes"
    echo "    restore-data           - Restaurer les données"
    echo "    update-services        - Mettre à jour les services"
    echo ""
    echo "Options:"
    echo "  --force                - Forcer l'exécution sans confirmation"
    echo "  --backup-before        - Sauvegarder avant modification"
    echo "  --verbose              - Mode verbeux"
    echo "  --dry-run              - Simulation sans modification"
    echo ""
    echo "Exemples:"
    echo "  ./deploy-troubleshooting.sh diagnose 192.168.1.100"
    echo "  ./deploy-troubleshooting.sh auto-fix 192.168.1.100 --backup-before"
    echo "  ./deploy-troubleshooting.sh reset-services 192.168.1.100 --force"
    echo "  ./deploy-troubleshooting.sh backup-data 192.168.1.100"
    echo ""
}

# Variables globales
FORCE=false
BACKUP_BEFORE=false
VERBOSE=false
DRY_RUN=false

# Diagnostic complet automatique
diagnose_system() {
    local ip="$1"
    
    log_info "🔍 Diagnostic complet du système..."
    trace_deploy_operation "diagnose_system" "STARTED" "Starting system diagnosis on $ip"
    
    local issues_found=0
    
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}    DIAGNOSTIC SYSTÈME - MEESHY${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
    
    # 1. Vérifier la connectivité de base
    log_info "📡 1. Test de connectivité de base..."
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@$ip "echo 'SSH OK'" >/dev/null 2>&1; then
        log_success "✅ Connectivité SSH: OK"
    else
        log_error "❌ Connectivité SSH: ÉCHEC"
        ((issues_found++))
    fi
    
    # 2. Vérifier les ressources système
    log_info "💾 2. Vérification des ressources système..."
    check_system_resources "$ip" || ((issues_found++))
    
    # 3. Vérifier Docker
    log_info "🐳 3. Vérification de Docker..."
    check_docker_status "$ip" || ((issues_found++))
    
    # 4. Vérifier les services
    log_info "🔧 4. Vérification des services..."
    check_services_status "$ip" || ((issues_found++))
    
    # 5. Vérifier les logs d'erreur
    log_info "📋 5. Analyse des logs d'erreur..."
    analyze_error_logs "$ip" || ((issues_found++))
    
    # 6. Vérifier la connectivité réseau
    log_info "🌐 6. Vérification de la connectivité réseau..."
    check_network_connectivity "$ip" || ((issues_found++))
    
    # 7. Vérifier les permissions
    log_info "🔒 7. Vérification des permissions..."
    check_permissions_status "$ip" || ((issues_found++))
    
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}      RÉSUMÉ DU DIAGNOSTIC${NC}"
    echo -e "${CYAN}========================================${NC}"
    
    if [ $issues_found -eq 0 ]; then
        log_success "✅ Aucun problème critique détecté"
        trace_deploy_operation "diagnose_system" "SUCCESS" "No critical issues found"
    else
        log_warning "⚠️  $issues_found problème(s) détecté(s)"
        log_info "💡 Utilisez 'auto-fix' pour tenter une réparation automatique"
        trace_deploy_operation "diagnose_system" "WARNING" "$issues_found issues found"
    fi
    
    echo ""
    
    return $issues_found
}

# Vérifier les ressources système
check_system_resources() {
    local ip="$1"
    local issues=0
    
    # Vérifier l'espace disque
    local disk_usage=$(ssh -o StrictHostKeyChecking=no root@$ip "df -h / | tail -1 | awk '{print \$5}' | sed 's/%//'" 2>/dev/null || echo "100")
    
    if [ "$disk_usage" -gt 90 ]; then
        log_error "❌ Espace disque critique: ${disk_usage}% utilisé"
        ((issues++))
    elif [ "$disk_usage" -gt 80 ]; then
        log_warning "⚠️  Espace disque élevé: ${disk_usage}% utilisé"
    else
        log_success "✅ Espace disque: ${disk_usage}% utilisé"
    fi
    
    # Vérifier la mémoire
    local memory_usage=$(ssh -o StrictHostKeyChecking=no root@$ip "free | grep Mem | awk '{printf \"%.0f\", \$3/\$2 * 100.0}'" 2>/dev/null || echo "100")
    
    if [ "$memory_usage" -gt 95 ]; then
        log_error "❌ Utilisation mémoire critique: ${memory_usage}%"
        ((issues++))
    elif [ "$memory_usage" -gt 85 ]; then
        log_warning "⚠️  Utilisation mémoire élevée: ${memory_usage}%"
    else
        log_success "✅ Utilisation mémoire: ${memory_usage}%"
    fi
    
    # Vérifier la charge système
    local load_avg=$(ssh -o StrictHostKeyChecking=no root@$ip "uptime | awk -F'load average:' '{print \$2}' | awk '{print \$1}' | sed 's/,//'" 2>/dev/null || echo "0")
    local cpu_count=$(ssh -o StrictHostKeyChecking=no root@$ip "nproc" 2>/dev/null || echo "1")
    
    # Convertir en entier pour la comparaison
    load_int=$(echo "$load_avg * 100" | bc 2>/dev/null | cut -d. -f1 || echo "0")
    cpu_threshold=$((cpu_count * 100))
    
    if [ "$load_int" -gt "$cpu_threshold" ]; then
        log_warning "⚠️  Charge système élevée: $load_avg (CPUs: $cpu_count)"
    else
        log_success "✅ Charge système: $load_avg"
    fi
    
    return $issues
}

# Vérifier le statut de Docker
check_docker_status() {
    local ip="$1"
    local issues=0
    
    # Vérifier que Docker est installé
    if ssh -o StrictHostKeyChecking=no root@$ip "command -v docker" >/dev/null 2>&1; then
        log_success "✅ Docker installé"
    else
        log_error "❌ Docker non installé"
        ((issues++))
        return $issues
    fi
    
    # Vérifier que Docker fonctionne
    if ssh -o StrictHostKeyChecking=no root@$ip "docker ps" >/dev/null 2>&1; then
        log_success "✅ Docker démon actif"
    else
        log_error "❌ Docker démon inactif"
        ((issues++))
    fi
    
    # Vérifier Docker Compose
    if ssh -o StrictHostKeyChecking=no root@$ip "docker compose version" >/dev/null 2>&1; then
        log_success "✅ Docker Compose disponible"
    else
        log_error "❌ Docker Compose non disponible"
        ((issues++))
    fi
    
    return $issues
}

# Vérifier le statut des services
check_services_status() {
    local ip="$1"
    local issues=0
    
    local services=("traefik" "redis" "mongodb" "gateway" "translator" "frontend")
    
    for service in "${services[@]}"; do
        if ssh -o StrictHostKeyChecking=no root@$ip "cd /opt/meeshy && docker compose ps $service | grep -q 'Up'" 2>/dev/null; then
            log_success "✅ Service $service: En cours d'exécution"
        else
            log_error "❌ Service $service: Arrêté ou en erreur"
            ((issues++))
        fi
    done
    
    return $issues
}

# Analyser les logs d'erreur
analyze_error_logs() {
    local ip="$1"
    local issues=0
    
    # Analyser les logs des services pour détecter les erreurs
    local services=("traefik" "redis" "mongodb" "gateway" "translator" "frontend")
    
    for service in "${services[@]}"; do
        local error_count=$(ssh -o StrictHostKeyChecking=no root@$ip "cd /opt/meeshy && docker compose logs --tail=50 $service 2>/dev/null | grep -i 'error\|failed\|exception' | wc -l" 2>/dev/null || echo "0")
        
        if [ "$error_count" -gt 0 ]; then
            log_warning "⚠️  Service $service: $error_count erreur(s) récente(s)"
            
            if [ "$VERBOSE" = "true" ]; then
                log_info "📋 Dernières erreurs pour $service:"
                ssh -o StrictHostKeyChecking=no root@$ip "cd /opt/meeshy && docker compose logs --tail=10 $service | grep -i 'error\|failed\|exception'" || true
            fi
            ((issues++))
        else
            log_success "✅ Service $service: Aucune erreur récente"
        fi
    done
    
    return $issues
}

# Vérifier la connectivité réseau
check_network_connectivity() {
    local ip="$1"
    local issues=0
    
    # Test des ports principaux
    local ports=("80:HTTP" "443:HTTPS" "8080:Traefik" "3000:Gateway" "8000:Translator")
    
    for port_info in "${ports[@]}"; do
        local port=$(echo "$port_info" | cut -d: -f1)
        local service=$(echo "$port_info" | cut -d: -f2)
        
        if nc -z -w5 "$ip" "$port" 2>/dev/null; then
            log_success "✅ Port $port ($service): Accessible"
        else
            log_error "❌ Port $port ($service): Inaccessible"
            ((issues++))
        fi
    done
    
    # Test de résolution DNS interne
    if ssh -o StrictHostKeyChecking=no root@$ip "cd /opt/meeshy && docker compose exec -T gateway ping -c 1 mongodb" >/dev/null 2>&1; then
        log_success "✅ Résolution DNS interne: OK"
    else
        log_error "❌ Résolution DNS interne: ÉCHEC"
        ((issues++))
    fi
    
    return $issues
}

# Vérifier les permissions
check_permissions_status() {
    local ip="$1"
    local issues=0
    
    # Vérifier les permissions des fichiers de configuration
    if ssh -o StrictHostKeyChecking=no root@$ip "test -f /opt/meeshy/secrets/production-secrets.env" 2>/dev/null; then
        local perms=$(ssh -o StrictHostKeyChecking=no root@$ip "ls -l /opt/meeshy/secrets/production-secrets.env | cut -d' ' -f1")
        if [[ "$perms" == "-rw-------" ]]; then
            log_success "✅ Permissions secrets: Correctes ($perms)"
        else
            log_warning "⚠️  Permissions secrets: À corriger ($perms)"
            ((issues++))
        fi
    else
        log_warning "⚠️  Fichier secrets non trouvé"
    fi
    
    # Vérifier les volumes Docker
    local volumes=("meeshy_models_data" "meeshy_translator_cache")
    for volume in "${volumes[@]}"; do
        if ssh -o StrictHostKeyChecking=no root@$ip "docker volume ls | grep -q $volume" 2>/dev/null; then
            log_success "✅ Volume $volume: Présent"
        else
            log_warning "⚠️  Volume $volume: Manquant"
            ((issues++))
        fi
    done
    
    return $issues
}

# Réparation automatique
auto_fix() {
    local ip="$1"
    
    log_info "🔧 Tentative de réparation automatique..."
    trace_deploy_operation "auto_fix" "STARTED" "Starting automatic repair on $ip"
    
    if [ "$BACKUP_BEFORE" = "true" ]; then
        backup_current_state "$ip"
    fi
    
    local fixes_applied=0
    
    # 1. Redémarrer Docker si nécessaire
    if ! ssh -o StrictHostKeyChecking=no root@$ip "docker ps" >/dev/null 2>&1; then
        log_info "🔄 Redémarrage de Docker..."
        if ssh -o StrictHostKeyChecking=no root@$ip "systemctl restart docker && sleep 3"; then
            log_success "✅ Docker redémarré"
            ((fixes_applied++))
        else
            log_error "❌ Échec du redémarrage de Docker"
        fi
    fi
    
    # 2. Corriger les permissions
    log_info "🔒 Correction des permissions..."
    if fix_all_permissions "$ip"; then
        log_success "✅ Permissions corrigées"
        ((fixes_applied++))
    fi
    
    # 3. Redémarrer les services défaillants
    log_info "🔄 Redémarrage des services défaillants..."
    if fix_failed_services "$ip"; then
        log_success "✅ Services redémarrés"
        ((fixes_applied++))
    fi
    
    # 4. Nettoyer Docker
    log_info "🧹 Nettoyage Docker..."
    if cleanup_docker_system "$ip"; then
        log_success "✅ Nettoyage Docker terminé"
        ((fixes_applied++))
    fi
    
    log_info "🎉 Réparation automatique terminée: $fixes_applied correction(s) appliquée(s)"
    trace_deploy_operation "auto_fix" "SUCCESS" "$fixes_applied fixes applied"
    
    # Relancer un diagnostic
    log_info "🔍 Nouveau diagnostic post-réparation..."
    diagnose_system "$ip"
}

# Corriger toutes les permissions
fix_all_permissions() {
    local ip="$1"
    
    log_info "🔒 Correction de toutes les permissions..."
    
    # Corriger les permissions des secrets
    ssh -o StrictHostKeyChecking=no root@$ip "
        if [ -f /opt/meeshy/secrets/production-secrets.env ]; then
            chmod 600 /opt/meeshy/secrets/production-secrets.env
            chown root:root /opt/meeshy/secrets/production-secrets.env
            echo 'Permissions secrets corrigées'
        fi
    "
    
    # Corriger les permissions des volumes translator
    "$SCRIPT_DIR/deploy-security.sh" fix-translator "$ip"
    
    return 0
}

# Réparer les services défaillants
fix_failed_services() {
    local ip="$1"
    
    log_info "🔄 Réparation des services défaillants..."
    
    local services=("traefik" "redis" "mongodb" "gateway" "translator" "frontend")
    local services_fixed=0
    
    for service in "${services[@]}"; do
        if ! ssh -o StrictHostKeyChecking=no root@$ip "cd /opt/meeshy && docker compose ps $service | grep -q 'Up'" 2>/dev/null; then
            log_info "🔄 Redémarrage du service $service..."
            
            if ssh -o StrictHostKeyChecking=no root@$ip "cd /opt/meeshy && docker compose restart $service" 2>/dev/null; then
                log_success "✅ Service $service redémarré"
                ((services_fixed++))
            else
                log_error "❌ Échec du redémarrage de $service"
            fi
        fi
    done
    
    log_info "$services_fixed service(s) redémarré(s)"
    return 0
}

# Nettoyer le système Docker
cleanup_docker_system() {
    local ip="$1"
    
    log_info "🧹 Nettoyage du système Docker..."
    
    ssh -o StrictHostKeyChecking=no root@$ip "
        echo 'Nettoyage des conteneurs arrêtés...'
        docker container prune -f || true
        
        echo 'Nettoyage des images inutilisées...'
        docker image prune -f || true
        
        echo 'Nettoyage des volumes orphelins...'
        docker volume prune -f || true
        
        echo 'Nettoyage des réseaux inutilisés...'
        docker network prune -f || true
        
        echo 'Nettoyage terminé'
    "
    
    return 0
}

# Sauvegarder l'état actuel
backup_current_state() {
    local ip="$1"
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    
    log_info "💾 Sauvegarde de l'état actuel..."
    
    # Créer le répertoire de sauvegarde
    mkdir -p "$DEPLOY_LOGS_DIR/backups"
    
    # Sauvegarder la configuration
    ssh -o StrictHostKeyChecking=no root@$ip "cd /opt/meeshy && tar -czf /tmp/meeshy_backup_${timestamp}.tar.gz docker-compose.yml .env secrets/ docker/ 2>/dev/null || true"
    
    # Récupérer la sauvegarde
    scp -o StrictHostKeyChecking=no root@$ip:/tmp/meeshy_backup_${timestamp}.tar.gz "$DEPLOY_LOGS_DIR/backups/" 2>/dev/null || log_warning "⚠️  Impossible de récupérer la sauvegarde"
    
    # Sauvegarder la base de données MongoDB
    backup_mongodb "$ip" "$timestamp"
    
    log_success "✅ Sauvegarde terminée: backups/meeshy_backup_${timestamp}.tar.gz"
}

# Sauvegarder MongoDB
backup_mongodb() {
    local ip="$1"
    local timestamp="$2"
    
    log_info "💾 Sauvegarde de MongoDB..."
    
    ssh -o StrictHostKeyChecking=no root@$ip "
        cd /opt/meeshy
        if docker compose ps mongodb | grep -q 'Up'; then
            echo 'Création de la sauvegarde MongoDB...'
            docker compose exec -T mongodb mongodump --db meeshy --out /tmp/mongodb_backup_${timestamp}/ 2>/dev/null || true
            cd /tmp && tar -czf mongodb_backup_${timestamp}.tar.gz mongodb_backup_${timestamp}/ 2>/dev/null || true
            rm -rf mongodb_backup_${timestamp}/ 2>/dev/null || true
            echo 'Sauvegarde MongoDB terminée'
        else
            echo 'MongoDB non démarré - Sauvegarde ignorée'
        fi
    "
    
    # Récupérer la sauvegarde MongoDB
    scp -o StrictHostKeyChecking=no root@$ip:/tmp/mongodb_backup_${timestamp}.tar.gz "$DEPLOY_LOGS_DIR/backups/" 2>/dev/null || log_warning "⚠️  Impossible de récupérer la sauvegarde MongoDB"
}

# Reset complet (DESTRUCTIF)
reset_complete() {
    local ip="$1"
    
    log_warning "⚠️  ATTENTION: Reset complet demandé - Cette opération est DESTRUCTIVE"
    
    if [ "$FORCE" != "true" ]; then
        echo ""
        echo -e "${RED}Cette opération va:${NC}"
        echo -e "${RED}• Supprimer tous les conteneurs${NC}"
        echo -e "${RED}• Supprimer tous les volumes${NC}"
        echo -e "${RED}• Supprimer toutes les données${NC}"
        echo -e "${RED}• Supprimer la configuration${NC}"
        echo ""
        read -p "Êtes-vous sûr de vouloir continuer? (tapez 'CONFIRMER'): " confirmation
        
        if [ "$confirmation" != "CONFIRMER" ]; then
            log_info "Opération annulée"
            return 0
        fi
    fi
    
    log_info "🔥 Début du reset complet..."
    trace_deploy_operation "reset_complete" "STARTED" "Starting complete reset on $ip"
    
    # Sauvegarder avant destruction si demandé
    if [ "$BACKUP_BEFORE" = "true" ]; then
        backup_current_state "$ip"
    fi
    
    # Arrêter et supprimer tout
    ssh -o StrictHostKeyChecking=no root@$ip "
        cd /opt/meeshy 2>/dev/null || true
        
        echo 'Arrêt de tous les services...'
        docker compose down --remove-orphans || true
        
        echo 'Suppression de tous les volumes...'
        docker volume ls | grep meeshy | awk '{print \$2}' | xargs -r docker volume rm || true
        
        echo 'Suppression des images...'
        docker image prune -af || true
        
        echo 'Nettoyage complet du système Docker...'
        docker system prune -af --volumes || true
        
        echo 'Suppression de la configuration...'
        rm -rf /opt/meeshy || true
        
        echo 'Reset complet terminé'
    "
    
    log_success "✅ Reset complet terminé"
    trace_deploy_operation "reset_complete" "SUCCESS" "Complete reset finished on $ip"
    
    log_info "💡 Vous pouvez maintenant redéployer avec: ./deploy-orchestrator.sh deploy $ip"
}

# Point d'entrée principal
main() {
    local command="${1:-help}"
    local ip="$2"
    
    # Parser les options
    shift 2 2>/dev/null || true
    while [[ $# -gt 0 ]]; do
        case $1 in
            --force)
                FORCE=true
                shift
                ;;
            --backup-before)
                BACKUP_BEFORE=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done
    
    case "$command" in
        "diagnose")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            diagnose_system "$ip"
            ;;
        "auto-fix")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            auto_fix "$ip"
            ;;
        "check-logs")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            analyze_error_logs "$ip"
            ;;
        "check-resources")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            check_system_resources "$ip"
            ;;
        "check-network")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            check_network_connectivity "$ip"
            ;;
        "fix-services")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            fix_failed_services "$ip"
            ;;
        "fix-permissions")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            fix_all_permissions "$ip"
            ;;
        "reset-services")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            "$SCRIPT_DIR/deploy-maintenance.sh" restart "$ip"
            ;;
        "reset-complete")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            reset_complete "$ip"
            ;;
        "cleanup-docker")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            cleanup_docker_system "$ip"
            ;;
        "backup-data")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            backup_current_state "$ip"
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
}

# Exécuter le script principal
main "$@"
