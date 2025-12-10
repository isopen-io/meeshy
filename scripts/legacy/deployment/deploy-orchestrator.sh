#!/bin/bash

# ===== MEESHY - ORCHESTRATEUR DE DÉPLOIEMENT =====
# Script orchestrateur principal pour coordonner tous les modules de déploiement
# Usage: ./deploy-orchestrator.sh [COMMAND] [DROPLET_IP] [OPTIONS]

set -e

# Charger la configuration de déploiement
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

# Initialiser la traçabilité
init_deploy_tracing "deploy-orchestrator" "orchestrate_deployment"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🚀 MEESHY - ORCHESTRATEUR DE DÉPLOIEMENT${NC}"
    echo "=========================================="
    echo ""
    echo "Usage:"
    echo "  ./deploy-orchestrator.sh [COMMAND] [DROPLET_IP] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo -e "${GREEN}  Déploiement:${NC}"
    echo "    deploy                 - Déploiement complet"
    echo "    quick-deploy           - Déploiement rapide (sans vérifications)"
    echo "    update                 - Mise à jour du déploiement existant"
    echo "    rollback               - Retour à la version précédente"
    echo ""
    echo -e "${GREEN}  Maintenance:${NC}"
    echo "    status                 - Statut du déploiement"
    echo "    restart                - Redémarrer les services"
    echo "    stop                   - Arrêter les services"
    echo "    start                  - Démarrer les services"
    echo ""
    echo -e "${GREEN}  Modules spécialisés:${NC}"
    echo "    security               - Gestion sécurité et mots de passe"
    echo "    ssl                    - Gestion SSL avancée"
    echo "    backup                 - Sauvegarde et restauration"
    echo "    monitoring             - Surveillance en temps réel"
    echo "    performance            - Optimisation des performances"
    echo "    testing                - Tests complets post-déploiement"
    echo "    troubleshooting        - Diagnostic et résolution de problèmes"
    echo ""
    echo -e "${GREEN}  Utilitaires:${NC}"
    echo "    health-check           - Vérification de santé"
    echo "    logs                   - Afficher les logs"
    echo "    cleanup                - Nettoyage du système"
    echo ""
    echo "Options:"
    echo "  --env=ENV              - Environnement (dev, prod) [défaut: prod]"
    echo "  --skip-tests           - Ignorer les tests post-déploiement"
    echo "  --skip-backup          - Ignorer la sauvegarde"
    echo "  --skip-security        - Ignorer la configuration sécurité"
    echo "  --skip-ssl             - Ignorer la configuration SSL"
    echo "  --skip-optimization    - Ignorer les optimisations performance"
    echo "  --force                - Forcer le déploiement"
    echo "  --verbose              - Mode verbeux"
    echo "  --dry-run              - Simulation sans modification"
    echo ""
    echo -e "${GREEN}  Gestion des droplets DigitalOcean:${NC}"
    echo "  --create-droplet       - Créer un nouveau droplet au lieu d'utiliser une IP"
    echo "  --droplet-name=NAME    - Nom du droplet [défaut: meeshy-server]"
    echo "  --droplet-size=SIZE    - Taille du droplet [défaut: s-2vcpu-2gb]"
    echo "  --droplet-region=REGION- Région du droplet [défaut: nyc1]"
    echo ""
    echo "Exemples:"
    echo "  ./deploy-orchestrator.sh deploy 192.168.1.100"
    echo "  ./deploy-orchestrator.sh deploy --create-droplet --droplet-name meeshy-prod"
    echo "  ./deploy-orchestrator.sh update 192.168.1.100 --skip-tests"
    echo "  ./deploy-orchestrator.sh status 192.168.1.100 --verbose"
    echo "  ./deploy-orchestrator.sh security 192.168.1.100 --force"
    echo "  ./deploy-orchestrator.sh monitoring 192.168.1.100"
    echo ""
}

# Déploiement complet
deploy_complete() {
    local ip="$1"
    
    log_info "🚀 Déploiement complet de Meeshy sur $ip"
    trace_deploy_operation "deploy_complete" "STARTED" "Starting complete deployment on $ip"
    
    # Étape 0: Validation de la configuration
    log_info "Étape 0/8: Validation de la configuration"
    if ! "$SCRIPT_DIR/deploy-validate-config.sh" "env.production"; then
        log_error "Validation de configuration échouée - Déploiement annulé"
        trace_deploy_operation "deploy_complete" "FAILED" "Configuration validation failed"
        exit 1
    fi
    log_success "Configuration validée avec succès"
    
    # Étape 1: Backup automatique PRÉ-DÉPLOIEMENT (PROTECTION DES DONNÉES)
    if [ "$SKIP_BACKUP" = "false" ]; then
        log_info "Étape 1/8: 💾 Backup automatique pré-déploiement"
        log_warning "🛡️  Protection des données: sauvegarde avant modifications"
        if [ "$DRY_RUN" = "true" ]; then
            log_info "Mode --dry-run activé: simulation du backup pré-déploiement"
        else
            "$BACKUP_MODULE" backup-database "$ip" --pre-deployment
            log_success "✅ Backup pré-déploiement créé avec succès"
        fi
    else
        log_warning "Étape 1/8: Backup pré-déploiement ignoré (--skip-backup)"
    fi
    
    # Étape 2: Test de connexion
    log_info "Étape 2/8: Test de connexion SSH"
    "$SCRIPT_DIR/deploy-test-connection.sh" "$ip"
    
    # Étape 3: Préparation des fichiers
    log_info "Étape 3/8: Préparation des fichiers de déploiement"
    "$SCRIPT_DIR/deploy-prepare-files.sh" "$ip" "meeshy.me"
    
    # Étape 4: Installation des prérequis
    log_info "Étape 4/8: Installation des prérequis"
    "$SCRIPT_DIR/deploy-install-prerequisites.sh" "$ip"
    
    # Étape 5: Configuration MongoDB
    log_info "Étape 5/8: Configuration MongoDB"
    "$SCRIPT_DIR/deploy-configure-mongodb.sh" "$ip"
    
    # Étape 6: Démarrage des services
    log_info "Étape 6/8: Démarrage des services"
    "$SCRIPT_DIR/deploy-start-services.sh" "$ip"
    
    # Étape 7: Vérification de santé
    log_info "Étape 7/8: Vérification de santé"
    "$SCRIPT_DIR/deploy-health-check.sh" "$ip"
    
    # Étape 8: Rapport final
    log_info "Étape 8/8: Génération du rapport de déploiement"
    generate_deployment_report "$ip"
    
    log_success "Déploiement complet terminé avec succès"
    trace_deploy_operation "deploy_complete" "SUCCESS" "Complete deployment finished on $ip"
}

# Déploiement avec reset
deploy_with_reset() {
    local ip="$1"
    
    log_info "🔄 Déploiement avec reset complet sur $ip"
    trace_deploy_operation "deploy_reset" "STARTED" "Starting deployment with reset on $ip"
    
    # Validation critique de la configuration
    log_info "Validation de la configuration avant reset"
    if ! "$SCRIPT_DIR/deploy-validate-config.sh" "env.production"; then
        log_error "Validation de configuration échouée - Déploiement avec reset annulé"
        trace_deploy_operation "deploy_reset" "FAILED" "Configuration validation failed"
        exit 1
    fi
    log_success "Configuration validée avec succès"
    
    # Backup CRITIQUE avant reset (protection maximale)
    if [ "$SKIP_BACKUP" = "false" ]; then
        log_warning "🛡️  BACKUP CRITIQUE AVANT RESET COMPLET"
        log_info "💾 Sauvegarde complète des données avant destruction..."
        if [ "$DRY_RUN" = "true" ]; then
            log_info "Mode --dry-run activé: simulation du backup pré-reset"
        else
            "$BACKUP_MODULE" backup-all "$ip"
            log_success "✅ Backup critique pré-reset créé avec succès"
        fi
    else
        log_error "⚠️  ATTENTION: Reset sans backup! Risque de perte de données!"
    fi
    
    # Reset complet
    log_info "Reset complet du système..."
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        cd /opt/meeshy 2>/dev/null || true
        
        # Arrêter tous les services
        docker compose down 2>/dev/null || true
        
        # Supprimer tous les conteneurs, volumes et réseaux
        docker system prune -af 2>/dev/null || true
        
        # Nettoyer les fichiers de configuration
        rm -rf /opt/meeshy/* 2>/dev/null || true
EOF
    
    # Déploiement complet
    deploy_complete "$ip"
    
    log_success "Déploiement avec reset terminé avec succès"
    trace_deploy_operation "deploy_reset" "SUCCESS" "Deployment with reset finished on $ip"
}

# Correction rapide
fix_services() {
    local ip="$1"
    
    log_info "🔧 Correction rapide des services sur $ip"
    trace_deploy_operation "fix_services" "STARTED" "Starting quick fix on $ip"
    
    # Redémarrage des services
    log_info "Redémarrage des services..."
    "$SCRIPT_DIR/deploy-maintenance.sh" "restart" "$ip"
    
    # Vérification de santé
    log_info "Vérification de santé..."
    "$SCRIPT_DIR/deploy-health-check.sh" "$ip"
    
    log_success "Correction rapide terminée"
    trace_deploy_operation "fix_services" "SUCCESS" "Quick fix completed on $ip"
}

# Test de connexion
test_connection() {
    local ip="$1"
    
    log_info "🔌 Test de connexion SSH sur $ip"
    trace_deploy_operation "test_connection" "STARTED" "Testing SSH connection to $ip"
    
    "$SCRIPT_DIR/deploy-test-connection.sh" "$ip"
    
    log_success "Test de connexion terminé"
    trace_deploy_operation "test_connection" "SUCCESS" "Connection test completed for $ip"
}

# Vérification du statut
verify_status() {
    local ip="$1"
    
    log_info "📊 Vérification du statut des services sur $ip"
    trace_deploy_operation "verify_status" "STARTED" "Verifying services status on $ip"
    
    "$SCRIPT_DIR/deploy-maintenance.sh" "status" "$ip"
    
    log_success "Vérification du statut terminée"
    trace_deploy_operation "verify_status" "SUCCESS" "Status verification completed for $ip"
}

# Vérification de santé
health_check() {
    local ip="$1"
    
    log_info "🏥 Vérification de santé des services sur $ip"
    trace_deploy_operation "health_check" "STARTED" "Running health check on $ip"
    
    "$SCRIPT_DIR/deploy-health-check.sh" "$ip"
    
    log_success "Vérification de santé terminée"
    trace_deploy_operation "health_check" "SUCCESS" "Health check completed for $ip"
}

# Variables globales avec nouvelles options
ENVIRONMENT="prod"
SKIP_TESTS=false
SKIP_BACKUP=false
SKIP_SECURITY=false
SKIP_SSL=false
SKIP_OPTIMIZATION=false
FORCE_MODE=false
VERBOSE_MODE=false
DRY_RUN=false

# Configuration des droplets DigitalOcean
CREATE_DROPLET=false
DROPLET_NAME="meeshy-server"
DROPLET_SIZE="s-2vcpu-2gb"
DROPLET_IMAGE="ubuntu-22-04-x64"
DROPLET_REGION="nyc1"

# Chemins des modules spécialisés
SECURITY_MODULE="$SCRIPT_DIR/deploy-security.sh"
SSL_MODULE="$SCRIPT_DIR/deploy-ssl-management.sh"
BACKUP_MODULE="$SCRIPT_DIR/deploy-backup.sh"
MONITORING_MODULE="$SCRIPT_DIR/deploy-monitoring.sh"
PERFORMANCE_MODULE="$SCRIPT_DIR/deploy-performance.sh"
TESTING_MODULE="$SCRIPT_DIR/deploy-testing.sh"
TROUBLESHOOTING_MODULE="$SCRIPT_DIR/deploy-troubleshooting.sh"

# Déploiement complet avancé avec tous les modules
deploy_complete_advanced() {
    local ip="$1"
    
    if [ "$ip" = "droplet-creation" ]; then
        log_info "🚀 Déploiement complet avancé de Meeshy avec création de droplet"
        trace_deploy_operation "deploy_complete_advanced" "STARTED" "Starting advanced complete deployment with droplet creation"
    else
        log_info "🚀 Déploiement complet avancé de Meeshy sur $ip"
        trace_deploy_operation "deploy_complete_advanced" "STARTED" "Starting advanced complete deployment on $ip"
    fi
    
    # Étape 1: Test de connexion (sauté si création de droplet)
    if [ "$ip" != "droplet-creation" ]; then
        log_info "Étape 1/12: Test de connexion SSH"
        "$SCRIPT_DIR/deploy-test-connection.sh" "$ip"
    else
        log_info "Étape 1/12: Test de connexion SSH (sauté - création de droplet)"
    fi
    
    # Étape 2: Préparation des fichiers
    log_info "Étape 2/12: Préparation des fichiers de déploiement"
    if [ "$DRY_RUN" = "true" ]; then
        log_info "Mode --dry-run activé: simulation de la préparation des fichiers"
        log_info "Fichiers qui seraient préparés:"
        log_info "  - docker-compose.traefik.yml"
        log_info "  - .env (avec secrets intégrés)"
        log_info "  - Configuration Docker (nginx, supervisor)"
        log_info "  - Fichiers shared essentiels"
        log_info "  - Configurations de production sécurisées"
    else
        if [ "$ip" != "droplet-creation" ]; then
            "$SCRIPT_DIR/deploy-prepare-files.sh" "$ip" "meeshy.me"
        else
            log_info "Préparation des fichiers (sautée - sera faite après création du droplet)"
        fi
    fi
    
    # Étape 3: Gestion des droplets DigitalOcean (optionnel)
    log_info "Étape 3/12: Gestion des droplets DigitalOcean"
    if [ "$DRY_RUN" = "true" ]; then
        log_info "Mode --dry-run activé: simulation de la gestion des droplets"
        log_info "Actions qui seraient effectuées:"
        log_info "  - Vérification de l'installation de doctl"
        log_info "  - Création d'un nouveau droplet (si --create-droplet)"
        log_info "  - Vérification du droplet existant (si IP fournie)"
    else
        # Vérifier si on doit créer un nouveau droplet ou utiliser un existant
        if [ "$CREATE_DROPLET" = "true" ]; then
            log_info "Création d'un nouveau droplet..."
            "$SCRIPT_DIR/deploy-droplet-manager.sh" create "$DROPLET_NAME" --size "$DROPLET_SIZE" --region "$DROPLET_REGION" --wait
            
            # Récupérer l'IP du droplet créé
            local droplet_ip=$("$SCRIPT_DIR/deploy-droplet-manager.sh" get "$DROPLET_NAME" | awk '{print $3}' | head -1)
            if [ -n "$droplet_ip" ]; then
                log_success "Droplet créé avec l'IP: $droplet_ip"
                ip="$droplet_ip"
            else
                log_error "Impossible de récupérer l'IP du droplet créé"
                exit 1
            fi
        else
            log_info "Vérification du droplet existant..."
            "$SCRIPT_DIR/deploy-droplet-manager.sh" get "$ip"
        fi
    fi
    
    # Étape 3.5: Préparation des fichiers (si création de droplet)
    if [ "$CREATE_DROPLET" = "true" ] && [ "$ip" != "droplet-creation" ]; then
        log_info "Étape 3.5/12: Préparation des fichiers de déploiement (après création du droplet)"
        if [ "$DRY_RUN" = "true" ]; then
            log_info "Mode --dry-run activé: simulation de la préparation des fichiers"
        else
            "$SCRIPT_DIR/deploy-prepare-files.sh" "$ip" "meeshy.me"
        fi
    fi
    
    # Étape 4: Configuration sécurité
    if [ "$SKIP_SECURITY" = "false" ]; then
        log_info "Étape 4/12: Configuration sécurité et mots de passe"
        if [ "$DRY_RUN" = "true" ]; then
            log_info "Mode --dry-run activé: simulation de la configuration sécurité"
            log_info "Opérations de sécurité qui seraient effectuées:"
            log_info "  - Génération des secrets de production"
            log_info "  - Déploiement des mots de passe Traefik"
            log_info "  - Configuration des permissions"
            log_info "  - Validation de la sécurité"
        else
            if [ "$FORCE_MODE" = "true" ]; then
                "$SECURITY_MODULE" generate-secrets "$ip" --force
                "$SECURITY_MODULE" deploy-passwords "$ip" --force
            else
                "$SECURITY_MODULE" generate-secrets "$ip"
                "$SECURITY_MODULE" deploy-passwords "$ip"
            fi
        fi
    else
        log_info "Étape 4/12: Configuration sécurité ignorée"
    fi
    
    # Étape 5: Configuration MongoDB
    log_info "Étape 5/12: Configuration MongoDB"
    if [ "$DRY_RUN" = "true" ]; then
        log_info "Mode --dry-run activé: simulation de la configuration MongoDB"
        log_info "Configuration MongoDB qui serait effectuée:"
        log_info "  - Initialisation du replica set"
        log_info "  - Configuration des utilisateurs"
        log_info "  - Création des bases de données"
        log_info "  - Configuration des permissions"
        log_info "  - Test de connectivité"
    else
        "$SCRIPT_DIR/deploy-configure-mongodb.sh" "$ip"
    fi
    
    # Étape 5.5: Configuration des permissions du dossier models
    log_info "Étape 5.5/12: Configuration des permissions du dossier models"
    if [ "$DRY_RUN" = "true" ]; then
        log_info "Mode --dry-run activé: simulation de la configuration des permissions models"
        log_info "Configuration des permissions qui serait effectuée:"
        log_info "  - Création du volume Docker models_data"
        log_info "  - Configuration des permissions (UID 1000:1000)"
        log_info "  - Création des sous-dossiers ML nécessaires"
        log_info "  - Vérification des permissions"
    else
        "$SCRIPT_DIR/deploy-configure-models-permissions.sh" "$ip"
    fi
    
    # Étape 6: Démarrage des services
    log_info "Étape 6/13: Démarrage des services"
    if [ "$DRY_RUN" = "true" ]; then
        log_info "Mode --dry-run activé: simulation du démarrage des services"
        log_info "Services qui seraient démarrés:"
        log_info "  - MongoDB (avec replica set)"
        log_info "  - Redis"
        log_info "  - Gateway (Fastify + WebSocket)"
        log_info "  - Translator (FastAPI + ML)"
        log_info "  - Frontend (Next.js)"
        log_info "  - Traefik (reverse proxy + SSL)"
        log_info "  - Nginx (load balancer)"
    else
        "$SCRIPT_DIR/deploy-start-services.sh" "$ip"
    fi
    
    # Étape 7: Configuration SSL
    if [ "$SKIP_SSL" = "false" ]; then
        log_info "Étape 7/13: Configuration SSL"
        if [ "$DRY_RUN" = "true" ]; then
            log_info "Mode --dry-run activé: simulation de la configuration SSL"
            log_info "Configuration SSL qui serait effectuée:"
            log_info "  - Installation de Certbot"
            log_info "  - Génération des certificats Let's Encrypt"
            log_info "  - Configuration des domaines (meeshy.me, www.meeshy.me, etc.)"
            log_info "  - Configuration du renouvellement automatique"
            log_info "  - Test de la configuration SSL"
        else
            "$SSL_MODULE" setup-ssl "$ip" --email=admin@meeshy.me
        fi
    else
        log_info "Étape 7/13: Configuration SSL ignorée"
    fi
    
    # Étape 8: Optimisation des performances
    if [ "$SKIP_OPTIMIZATION" = "false" ]; then
        log_info "Étape 8/13: Optimisation des performances"
        if [ "$DRY_RUN" = "true" ]; then
            log_info "Mode --dry-run activé: simulation de l'optimisation des performances"
            log_info "Optimisations qui seraient effectuées:"
            log_info "  - Configuration des limites système"
            log_info "  - Optimisation des paramètres réseau"
            log_info "  - Configuration des caches"
            log_info "  - Optimisation des paramètres Docker"
            log_info "  - Configuration des logs"
        else
            "$PERFORMANCE_MODULE" optimize-system "$ip"
        fi
    else
        log_info "Étape 8/13: Optimisation des performances ignorée"
    fi
    
    # Étape 9: Vérification de santé
    log_info "Étape 9/13: Vérification de santé"
    if [ "$DRY_RUN" = "true" ]; then
        log_info "Mode --dry-run activé: simulation de la vérification de santé"
        log_info "Vérifications qui seraient effectuées:"
        log_info "  - Test de connectivité des services"
        log_info "  - Vérification des ports (80, 443, 3000, 8000, 3100)"
        log_info "  - Test des endpoints API"
        log_info "  - Vérification de la base de données"
        log_info "  - Test des fonctionnalités de traduction"
        log_info "  - Validation de la configuration SSL"
    else
        "$SCRIPT_DIR/deploy-health-check.sh" "$ip"
    fi
    
    # Étape 10: Tests complets
    if [ "$SKIP_TESTS" = "false" ]; then
        log_info "Étape 10/13: Tests post-déploiement"
        if [ "$DRY_RUN" = "true" ]; then
            log_info "Mode --dry-run activé: simulation des tests post-déploiement"
            log_info "Tests qui seraient effectués:"
            log_info "  - Tests de connectivité des services"
            log_info "  - Tests des endpoints API"
            log_info "  - Tests de traduction"
            log_info "  - Tests de performance"
            log_info "  - Tests de sécurité"
        else
            "$TESTING_MODULE" run-all-tests "$ip"
        fi
    else
        log_info "Étape 10/13: Tests post-déploiement ignorés"
    fi
    
    # Étape 11: Sauvegarde
    if [ "$SKIP_BACKUP" = "false" ]; then
        log_info "Étape 11/13: Sauvegarde post-déploiement"
        if [ "$DRY_RUN" = "true" ]; then
            log_info "Mode --dry-run activé: simulation de la sauvegarde post-déploiement"
            log_info "Sauvegardes qui seraient effectuées:"
            log_info "  - Sauvegarde de la configuration"
            log_info "  - Sauvegarde des données"
            log_info "  - Sauvegarde de l'état du déploiement"
            log_info "  - Création des points de restauration"
        else
            "$BACKUP_MODULE" backup-complete "$ip" --save-deployment-state
        fi
    else
        log_info "Étape 11/13: Sauvegarde post-déploiement ignorée"
    fi
    
    # Étape 12: Rapport final
    log_info "Étape 12/13: Génération du rapport de déploiement"
    if [ "$DRY_RUN" = "true" ]; then
        log_info "Mode --dry-run activé: simulation de la génération du rapport"
        log_info "Rapport qui serait généré:"
        log_info "  - Résumé du déploiement"
        log_info "  - Statut des services"
        log_info "  - Informations de connexion"
        log_info "  - Commandes de maintenance"
        log_info "  - Logs de déploiement"
    else
        generate_deployment_report "$ip"
    fi
    
    log_success "✅ Déploiement complet avancé terminé avec succès"
    trace_deploy_operation "deploy_complete_advanced" "SUCCESS" "Advanced complete deployment finished on $ip"
}

# Exécution des modules spécialisés
execute_specialized_module() {
    local module_name="$1"
    local ip="$2"
    shift 2
    local module_args="$@"
    
    case "$module_name" in
        "security")
            log_info "🔒 Exécution du module sécurité..."
            "$SECURITY_MODULE" $module_args
            ;;
        "ssl")
            log_info "🔐 Exécution du module SSL..."
            "$SSL_MODULE" $module_args
            ;;
        "backup")
            log_info "💾 Exécution du module sauvegarde..."
            "$BACKUP_MODULE" $module_args
            ;;
        "monitoring")
            log_info "📊 Exécution du module surveillance..."
            "$MONITORING_MODULE" $module_args
            ;;
        "performance")
            log_info "⚡ Exécution du module performance..."
            "$PERFORMANCE_MODULE" $module_args
            ;;
        "testing")
            log_info "🧪 Exécution du module tests..."
            "$TESTING_MODULE" $module_args
            ;;
        "troubleshooting")
            log_info "🔧 Exécution du module diagnostic..."
            "$TROUBLESHOOTING_MODULE" $module_args
            ;;
        *)
            log_error "Module spécialisé inconnu: $module_name"
            exit 1
            ;;
    esac
}

# Configuration MongoDB
configure_mongodb() {
    local ip="$1"
    
    log_info "🍃 Configuration MongoDB sur $ip"
    trace_deploy_operation "configure_mongodb" "STARTED" "Configuring MongoDB on $ip"
    
    "$SCRIPT_DIR/deploy-configure-mongodb.sh" "$ip"
    
    log_success "Configuration MongoDB terminée"
    trace_deploy_operation "configure_mongodb" "SUCCESS" "MongoDB configuration completed for $ip"
}

# Déploiement des mots de passe
deploy_passwords() {
    local ip="$1"
    
    log_info "🔐 Déploiement des mots de passe Traefik sur $ip"
    trace_deploy_operation "deploy_passwords" "STARTED" "Deploying Traefik passwords on $ip"
    
    # Utiliser le script existant
    if [ -f "$PROJECT_ROOT/scripts/simple-deploy-password.sh" ]; then
        bash "$PROJECT_ROOT/scripts/simple-deploy-password.sh" "$ip"
    else
        log_error "Script de déploiement des mots de passe non trouvé"
        trace_deploy_operation "deploy_passwords" "FAILED" "Password deployment script not found"
        exit 1
    fi
    
    log_success "Déploiement des mots de passe terminé"
    trace_deploy_operation "deploy_passwords" "SUCCESS" "Password deployment completed for $ip"
}

# Gestion des logs
manage_logs() {
    local ip="$1"
    local service="$2"
    
    log_info "📋 Gestion des logs sur $ip"
    trace_deploy_operation "manage_logs" "STARTED" "Managing logs on $ip"
    
    "$SCRIPT_DIR/deploy-maintenance.sh" "logs" "$ip" "$service"
    
    log_success "Gestion des logs terminée"
    trace_deploy_operation "manage_logs" "SUCCESS" "Log management completed for $ip"
}

# Redémarrage des services
restart_services() {
    local ip="$1"
    local service="$2"
    
    log_info "🔄 Redémarrage des services sur $ip"
    trace_deploy_operation "restart_services" "STARTED" "Restarting services on $ip"
    
    "$SCRIPT_DIR/deploy-maintenance.sh" "restart" "$ip" "$service"
    
    log_success "Redémarrage des services terminé"
    trace_deploy_operation "restart_services" "SUCCESS" "Services restart completed for $ip"
}

# Arrêt des services
stop_services() {
    local ip="$1"
    local service="$2"
    
    log_info "⏹️  Arrêt des services sur $ip"
    trace_deploy_operation "stop_services" "STARTED" "Stopping services on $ip"
    
    "$SCRIPT_DIR/deploy-maintenance.sh" "stop" "$ip" "$service"
    
    log_success "Arrêt des services terminé"
    trace_deploy_operation "stop_services" "SUCCESS" "Services stop completed for $ip"
}

# Générer le rapport de déploiement
generate_deployment_report() {
    local ip="$1"
    
    log_info "📊 Génération du rapport de déploiement..."
    trace_deploy_operation "generate_report" "STARTED" "Generating deployment report for $ip"
    
    # Créer le rapport
    local report_file="$DEPLOY_TRACE_DIR/deployment_report_${DEPLOY_SESSION_ID}.txt"
    
    cat > "$report_file" << EOF
=== RAPPORT DE DÉPLOIEMENT MEESHY ===
Date: $(date)
Session ID: $DEPLOY_SESSION_ID
Version: $DEPLOY_VERSION
Serveur: $ip
Environnement: $DEPLOY_ENVIRONMENT

=== RÉSUMÉ DU DÉPLOIEMENT ===
✅ Test de connexion SSH: Réussi
✅ Préparation des fichiers: Terminée
✅ Installation des prérequis: Terminée
✅ Configuration MongoDB: Terminée
✅ Configuration permissions models: Terminée
✅ Démarrage des services: Terminé
✅ Vérification de santé: Terminée

=== SERVICES DÉPLOYÉS ===
• Traefik: Reverse proxy et load balancer
• Redis: Cache et session store
• MongoDB: Base de données principale
• Gateway: API Gateway et WebSocket
• Translator: Service de traduction
• Frontend: Interface utilisateur

=== ACCÈS AUX SERVICES ===
• Frontend: http://$ip:3000
• API Gateway: http://$ip:3001
• Translator API: http://$ip:8000
• Traefik Dashboard: http://$ip:8080

=== COMMANDES DE MAINTENANCE ===
• Statut: ./deploy-maintenance.sh status $ip
• Logs: ./deploy-maintenance.sh logs $ip
• Redémarrage: ./deploy-maintenance.sh restart $ip
• Santé: ./deploy-health-check.sh $ip

=== FIN DU RAPPORT ===
EOF
    
    log_success "Rapport de déploiement généré: $report_file"
    trace_deploy_operation "generate_report" "SUCCESS" "Deployment report generated for $ip"
}

# Fonction principale mise à jour
main() {
    local command="${1:-help}"
    local ip=""
    
    # Parser tous les arguments
    shift
    while [[ $# -gt 0 ]]; do
        case $1 in
            --env=*)
                ENVIRONMENT="${1#*=}"
                shift
                ;;
            --skip-tests)
                SKIP_TESTS=true
                shift
                ;;
            --skip-backup)
                SKIP_BACKUP=true
                shift
                ;;
            --skip-security)
                SKIP_SECURITY=true
                shift
                ;;
            --skip-ssl)
                SKIP_SSL=true
                shift
                ;;
            --skip-optimization)
                SKIP_OPTIMIZATION=true
                shift
                ;;
            --force)
                FORCE_MODE=true
                shift
                ;;
            --verbose)
                VERBOSE_MODE=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --create-droplet)
                CREATE_DROPLET=true
                shift
                ;;
            --droplet-name=*)
                DROPLET_NAME="${1#*=}"
                shift
                ;;
            --droplet-size=*)
                DROPLET_SIZE="${1#*=}"
                shift
                ;;
            --droplet-region=*)
                DROPLET_REGION="${1#*=}"
                shift
                ;;
            *)
                # Premier argument non-optionnel = IP
                if [ -z "$ip" ] && [[ ! "$1" =~ ^-- ]]; then
                    ip="$1"
                fi
                shift
                ;;
        esac
    done
    
    case "$command" in
        "deploy")
            if [ -z "$ip" ] && [ "$CREATE_DROPLET" != "true" ]; then
                log_error "IP du serveur requise ou utilisez --create-droplet"
                exit 1
            fi
            if [ "$CREATE_DROPLET" = "true" ]; then
                deploy_complete_advanced "droplet-creation"
            else
                deploy_complete_advanced "$ip"
            fi
            ;;
        "quick-deploy")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            SKIP_TESTS=true
            SKIP_BACKUP=true
            deploy_complete "$ip"
            ;;
        "deploy-reset")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            deploy_with_reset "$ip"
            ;;
        "fix")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            fix_services "$ip"
            ;;
        "test-connection")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            test_connection "$ip"
            ;;
        "status")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            verify_status "$ip"
            ;;
        "health-check")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            health_check "$ip"
            ;;
        "configure-mongodb")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            configure_mongodb "$ip"
            ;;
        "deploy-passwords")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            deploy_passwords "$ip"
            ;;
        "logs")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            manage_logs "$ip" "$3"
            ;;
        "restart")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            restart_services "$ip" "$3"
            ;;
        "stop")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            stop_services "$ip" "$3"
            ;;
        "start")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            start_services "$ip" "$3"
            ;;
        "cleanup")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            cleanup_deployment "$ip"
            ;;
        # Modules spécialisés
        "security")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            execute_specialized_module "security" "$ip" "setup-security" "$ip" $([ "$FORCE_MODE" = "true" ] && echo "--force")
            ;;
        "ssl")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            execute_specialized_module "ssl" "$ip" "setup-ssl" "$ip"
            ;;
        "backup")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            execute_specialized_module "backup" "$ip" "backup-complete" "$ip"
            ;;
        "monitoring")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            execute_specialized_module "monitoring" "$ip" "monitor" "$ip"
            ;;
        "performance")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            execute_specialized_module "performance" "$ip" "optimize-system" "$ip"
            ;;
        "testing")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            execute_specialized_module "testing" "$ip" "run-all-tests" "$ip"
            ;;
        "troubleshooting")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            execute_specialized_module "troubleshooting" "$ip" "diagnose-system" "$ip"
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
