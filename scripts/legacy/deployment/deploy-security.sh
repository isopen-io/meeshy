#!/bin/bash

# ===== MEESHY - GESTION DE LA SÉCURITÉ ET DES SECRETS =====
# Script spécialisé pour la gestion des secrets, mots de passe et sécurité
# Usage: ./deploy-security.sh [COMMAND] [DROPLET_IP] [OPTIONS]

set -e

# Charger la configuration de déploiement
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

# Initialiser la traçabilité
init_deploy_tracing "deploy-security" "security_management"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🔐 MEESHY - GESTION DE LA SÉCURITÉ ET DES SECRETS${NC}"
    echo "======================================================="
    echo ""
    echo "Usage:"
    echo "  ./deploy-security.sh [COMMAND] [DROPLET_IP] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo -e "${GREEN}  Gestion des secrets:${NC}"
    echo "    generate-secrets       - Générer tous les secrets de production"
    echo "    validate-secrets       - Valider l'intégrité des secrets"
    echo "    deploy-secrets         - Déployer les secrets sur le serveur"
    echo "    reset-secrets          - Régénérer et redéployer tous les secrets"
    echo "    backup-secrets         - Sauvegarder les secrets actuels"
    echo ""
    echo -e "${GREEN}  Mots de passe:${NC}"
    echo "    deploy-passwords       - Déployer les mots de passe Traefik"
    echo "    test-passwords         - Tester l'authentification"
    echo "    show-passwords         - Afficher les mots de passe générés"
    echo "    reset-passwords        - Régénérer les mots de passe"
    echo ""
    echo -e "${GREEN}  Permissions:${NC}"
    echo "    fix-permissions        - Corriger les permissions des volumes"
    echo "    fix-translator         - Corriger spécifiquement le translator"
    echo "    check-permissions      - Vérifier les permissions"
    echo ""
    echo "Options:"
    echo "  --force                - Forcer la régénération même si les secrets existent"
    echo "  --backup-before        - Sauvegarder avant modification"
    echo "  --validate-after       - Valider après modification"
    echo ""
    echo "Exemples:"
    echo "  ./deploy-security.sh generate-secrets 192.168.1.100"
    echo "  ./deploy-security.sh deploy-passwords 192.168.1.100 --force"
    echo "  ./deploy-security.sh fix-translator 192.168.1.100"
    echo "  ./deploy-security.sh show-passwords"
    echo ""
}

# Générer tous les secrets de production
generate_production_secrets() {
    local ip="$1"
    local force="${2:-false}"
    
    log_info "🔐 Génération des secrets de production..."
    trace_deploy_operation "generate_secrets" "STARTED" "Generating production secrets"
    
    # Vérifier si les secrets existent déjà
    if [ -f "$PROJECT_ROOT/secrets/production-secrets.env" ] && [ "$force" = "false" ]; then
        log_warning "Les secrets de production existent déjà"
        log_info "💡 Utilisez --force pour forcer la régénération"
        return 0
    fi
    
    # Créer le répertoire secrets
    mkdir -p "$PROJECT_ROOT/secrets"
    
    log_info "📋 Génération des secrets..."
    
    # Exécuter le script de génération
    if [ -f "$PROJECT_ROOT/scripts/production/meeshy-generate-production-variables.sh" ]; then
        log_info "📁 Fichier local utilisé: $PROJECT_ROOT/scripts/production/meeshy-generate-production-variables.sh"
        log_info "🎯 Action: Génération des secrets de production"
        
        if [ "$force" = "true" ]; then
            bash "$PROJECT_ROOT/scripts/production/meeshy-generate-production-variables.sh" --force
        else
            bash "$PROJECT_ROOT/scripts/production/meeshy-generate-production-variables.sh"
        fi
        
        # Vérifier la génération
        if [ -f "$PROJECT_ROOT/secrets/production-secrets.env" ]; then
            log_success "✅ Secrets générés: $PROJECT_ROOT/secrets/production-secrets.env"
            
            # Lister les secrets générés
            log_info "📋 Secrets générés:"
            grep -E "^[A-Z_]+=.+" "$PROJECT_ROOT/secrets/production-secrets.env" | cut -d'=' -f1 | while read secret; do
                log_info "  • $secret"
            done
            
            # Vérifier le fichier des mots de passe en clair
            if [ -f "$PROJECT_ROOT/secrets/clear.txt" ]; then
                log_success "✅ Mots de passe en clair: $PROJECT_ROOT/secrets/clear.txt"
                log_warning "⚠️  Ce fichier contient les mots de passe non chiffrés - À conserver en sécurité"
            else
                log_warning "⚠️  Fichier des mots de passe en clair non trouvé"
            fi
        else
            log_error "❌ Échec de la génération des secrets"
            trace_deploy_operation "generate_secrets" "FAILED" "Secret generation failed"
            exit 1
        fi
    else
        log_error "❌ Script de génération non trouvé: $PROJECT_ROOT/scripts/production/meeshy-generate-production-variables.sh"
        trace_deploy_operation "generate_secrets" "FAILED" "Generation script not found"
        exit 1
    fi
    
    trace_deploy_operation "generate_secrets" "SUCCESS" "Production secrets generated"
}

# Valider l'intégrité des secrets
validate_secrets() {
    local ip="$1"
    
    log_info "🔍 Validation de l'intégrité des secrets..."
    trace_deploy_operation "validate_secrets" "STARTED" "Validating secrets integrity"
    
    local errors=0
    
    # Vérifier l'existence du fichier principal
    if [ ! -f "$PROJECT_ROOT/secrets/production-secrets.env" ]; then
        log_error "❌ Fichier des secrets manquant: $PROJECT_ROOT/secrets/production-secrets.env"
        ((errors++))
    else
        log_success "✅ Fichier des secrets trouvé: $PROJECT_ROOT/secrets/production-secrets.env"
        
        # Vérifier les variables obligatoires
        local required_vars=("MONGODB_PASSWORD" "REDIS_PASSWORD" "JWT_SECRET" "TRAEFIK_USERS")
        
        for var in "${required_vars[@]}"; do
            if grep -q "^${var}=" "$PROJECT_ROOT/secrets/production-secrets.env"; then
                # Vérifier que la valeur n'est pas vide
                local value=$(grep "^${var}=" "$PROJECT_ROOT/secrets/production-secrets.env" | cut -d'=' -f2-)
                if [ -n "$value" ] && [ "$value" != '""' ] && [ "$value" != "''" ]; then
                    log_success "✅ Variable $var: définie et non vide"
                    
                    # Vérifier les caractères d'échappement problématiques
                    if echo "$value" | grep -q '\$' && ! echo "$value" | grep -q '\\\$'; then
                        log_warning "⚠️  Variable $var: contient des \$ non échappés"
                        log_info "💡 Valeur détectée: $value"
                        ((errors++))
                    fi
                else
                    log_error "❌ Variable $var: vide ou mal définie"
                    ((errors++))
                fi
            else
                log_error "❌ Variable obligatoire manquante: $var"
                ((errors++))
            fi
        done
    fi
    
    # Vérifier le fichier des mots de passe en clair
    if [ -f "$PROJECT_ROOT/secrets/clear.txt" ]; then
        log_success "✅ Fichier des mots de passe en clair: $PROJECT_ROOT/secrets/clear.txt"
    else
        log_warning "⚠️  Fichier des mots de passe en clair manquant: $PROJECT_ROOT/secrets/clear.txt"
    fi
    
    if [ $errors -eq 0 ]; then
        log_success "✅ Validation des secrets réussie"
        trace_deploy_operation "validate_secrets" "SUCCESS" "Secrets validation passed"
        return 0
    else
        log_error "❌ Validation des secrets échouée ($errors erreurs)"
        trace_deploy_operation "validate_secrets" "FAILED" "Secrets validation failed with $errors errors"
        return 1
    fi
}

# Déployer les secrets sur le serveur
deploy_secrets() {
    local ip="$1"
    local validate_before="${2:-true}"
    
    log_info "🚀 Déploiement des secrets sur le serveur $ip..."
    trace_deploy_operation "deploy_secrets" "STARTED" "Deploying secrets to $ip"
    
    # Valider avant déploiement si demandé
    if [ "$validate_before" = "true" ]; then
        validate_secrets "$ip" || {
            log_error "❌ Validation des secrets échouée - Déploiement annulé"
            exit 1
        }
    fi
    
    # Créer le répertoire secrets sur le serveur
    log_info "📁 Création du répertoire secrets sur le serveur..."
    ssh -o StrictHostKeyChecking=no root@$ip "mkdir -p /opt/meeshy/secrets"
    
    # Transférer le fichier de secrets
    log_info "📤 Transfert des secrets..."
    log_info "📁 Fichier local: $PROJECT_ROOT/secrets/production-secrets.env"
    log_info "📁 Destination: root@$ip:/opt/meeshy/secrets/production-secrets.env"
    log_info "🎯 Action: Transfert sécurisé des secrets de production"
    
    scp -o StrictHostKeyChecking=no "$PROJECT_ROOT/secrets/production-secrets.env" root@$ip:/opt/meeshy/secrets/
    
    # Sécuriser le fichier sur le serveur
    log_info "🔒 Sécurisation des permissions..."
    ssh -o StrictHostKeyChecking=no root@$ip "chmod 600 /opt/meeshy/secrets/production-secrets.env"
    ssh -o StrictHostKeyChecking=no root@$ip "chown root:root /opt/meeshy/secrets/production-secrets.env"
    
    # Vérifier le déploiement
    log_info "🔍 Vérification du déploiement..."
    if ssh -o StrictHostKeyChecking=no root@$ip "test -f /opt/meeshy/secrets/production-secrets.env"; then
        log_success "✅ Secrets déployés avec succès"
        log_info "📍 Emplacement sur la production: /opt/meeshy/secrets/production-secrets.env"
        log_info "🎯 Utilisation: Chargé par les services Docker lors du démarrage"
        
        # Vérifier les permissions
        local perms=$(ssh -o StrictHostKeyChecking=no root@$ip "ls -l /opt/meeshy/secrets/production-secrets.env | cut -d' ' -f1")
        log_info "🔒 Permissions: $perms"
        
        trace_deploy_operation "deploy_secrets" "SUCCESS" "Secrets deployed to $ip"
    else
        log_error "❌ Échec du déploiement des secrets"
        trace_deploy_operation "deploy_secrets" "FAILED" "Secret deployment failed to $ip"
        exit 1
    fi
}

# Déployer les mots de passe Traefik avec validation avancée
deploy_traefik_passwords() {
    local ip="$1"
    local force="${2:-false}"
    
    log_info "🔐 Déploiement des mots de passe Traefik..."
    trace_deploy_operation "deploy_traefik_passwords" "STARTED" "Deploying Traefik passwords to $ip"
    
    # Vérifier que les secrets existent
    if [ ! -f "$PROJECT_ROOT/secrets/production-secrets.env" ]; then
        log_error "❌ Secrets de production non trouvés"
        log_info "💡 Exécutez d'abord: ./deploy-security.sh generate-secrets"
        exit 1
    fi
    
    # Charger les secrets
    source "$PROJECT_ROOT/secrets/production-secrets.env"
    
    # Vérifier que le mot de passe Traefik existe
    if [ -z "$TRAEFIK_USERS" ]; then
        log_error "❌ Mot de passe Traefik non défini dans les secrets"
        exit 1
    fi
    
    log_info "📋 Configuration des mots de passe Traefik..."
    log_info "📁 Fichier local des secrets: $PROJECT_ROOT/secrets/production-secrets.env"
    log_info "🎯 Action: Génération du fichier htpasswd pour l'authentification Traefik"
    
    # Créer le script de configuration sur le serveur
    cat > /tmp/traefik-setup.sh << 'SCRIPT_EOF'
#!/bin/bash
set -e

echo "🔐 Configuration des mots de passe Traefik..."

# Charger les secrets si disponibles
if [ -f "/opt/meeshy/secrets/production-secrets.env" ]; then
    echo "📋 Chargement des secrets de production..."
    source /opt/meeshy/secrets/production-secrets.env
else
    echo "❌ Fichier des secrets non trouvé"
    exit 1
fi

# Vérifier que le mot de passe existe
if [ -z "$TRAEFIK_USERS" ]; then
    echo "❌ TRAEFIK_USERS non défini"
    exit 1
fi

echo "✅ Mot de passe Traefik trouvé"

# Installer htpasswd si nécessaire
if ! command -v htpasswd &> /dev/null; then
    echo "📦 Installation d'htpasswd..."
    if command -v apt-get &> /dev/null; then
        apt-get update && apt-get install -y apache2-utils
    elif command -v yum &> /dev/null; then
        yum install -y httpd-tools
    elif command -v apk &> /dev/null; then
        apk add --no-cache apache2-utils
    else
        echo "❌ Impossible d'installer htpasswd"
        exit 1
    fi
fi

# Créer le répertoire pour les mots de passe
mkdir -p /opt/meeshy/traefik

# Générer le fichier htpasswd
echo "🔑 Génération du fichier htpasswd..."
echo "$TRAEFIK_USERS" > /opt/meeshy/traefik/passwords
chmod 600 /opt/meeshy/traefik/passwords

# Vérifier la génération
if [ -f "/opt/meeshy/traefik/passwords" ]; then
    echo "✅ Fichier htpasswd généré: /opt/meeshy/traefik/passwords"
    echo "🔒 Permissions: $(ls -l /opt/meeshy/traefik/passwords | cut -d' ' -f1)"
    
    # Tester le fichier
    if grep -q "admin:" /opt/meeshy/traefik/passwords; then
        echo "✅ Format htpasswd valide"
    else
        echo "❌ Format htpasswd invalide"
        exit 1
    fi
else
    echo "❌ Échec de la génération du fichier htpasswd"
    exit 1
fi

echo "🎉 Configuration des mots de passe Traefik terminée"
SCRIPT_EOF
    
    # Transférer et exécuter le script
    log_info "📤 Transfert du script de configuration..."
    scp -o StrictHostKeyChecking=no /tmp/traefik-setup.sh root@$ip:/tmp/
    
    log_info "🚀 Exécution de la configuration sur le serveur..."
    if ssh -o StrictHostKeyChecking=no root@$ip "chmod +x /tmp/traefik-setup.sh && /tmp/traefik-setup.sh"; then
        log_success "✅ Mots de passe Traefik configurés avec succès"
        log_info "📍 Emplacement sur la production: /opt/meeshy/traefik/passwords"
        log_info "🎯 Utilisation: Authentification pour l'interface d'administration Traefik"
        
        # Nettoyer le script temporaire
        rm -f /tmp/traefik-setup.sh
        ssh -o StrictHostKeyChecking=no root@$ip "rm -f /tmp/traefik-setup.sh"
        
        trace_deploy_operation "deploy_traefik_passwords" "SUCCESS" "Traefik passwords deployed to $ip"
    else
        log_error "❌ Échec de la configuration des mots de passe Traefik"
        trace_deploy_operation "deploy_traefik_passwords" "FAILED" "Traefik passwords deployment failed to $ip"
        exit 1
    fi
}

# Corriger les permissions du translator
fix_translator_permissions() {
    local ip="$1"
    
    log_info "🔧 Correction des permissions du translator..."
    trace_deploy_operation "fix_translator_permissions" "STARTED" "Fixing translator permissions on $ip"
    
    log_info "📁 Volumes concernés sur la production:"
    log_info "  • meeshy_models_data → /workspace/models"
    log_info "  • meeshy_translator_cache → /workspace/cache"
    log_info "  • meeshy_translator_generated → /workspace/generated"
    log_info "🎯 Action: Correction des permissions (1000:1000) et nettoyage des verrous"
    
    # Créer le script de correction sur le serveur
    cat << 'EOF' > /tmp/fix-translator-permissions.sh
#!/bin/bash
set -e

echo "🔧 Correction des permissions du translator..."

cd /opt/meeshy

# Fonction pour corriger les permissions d'un volume
fix_volume_permissions() {
    local volume_name="$1"
    local mount_path="$2"
    local user_id="${3:-1000}"
    local group_id="${4:-1000}"
    
    if docker volume ls | grep -q "$volume_name"; then
        echo "📁 Volume $volume_name existant détecté"
        echo "🔧 Correction des permissions du volume $volume_name..."
        
        # Corriger les permissions
        docker run --rm -v "$volume_name:$mount_path" alpine:latest sh -c "
            echo '🔧 Correction des permissions du volume $volume_name...'
            chown -R $user_id:$group_id $mount_path 2>/dev/null || true
            chmod -R 755 $mount_path 2>/dev/null || true
            echo '✅ Permissions corrigées pour le volume $volume_name'
        "
    else
        echo "📁 Création du volume $volume_name avec permissions correctes..."
        docker volume create "$volume_name"
        
        # Initialiser les permissions
        docker run --rm -v "$volume_name:$mount_path" alpine:latest sh -c "
            echo '🔧 Initialisation des permissions du volume $volume_name...'
            mkdir -p $mount_path
            chown -R $user_id:$group_id $mount_path
            chmod -R 755 $mount_path
            echo '✅ Volume $volume_name initialisé avec permissions correctes'
        "
    fi
}

# Nettoyage avancé des fichiers de verrouillage
cleanup_locks() {
    local volume_name="$1"
    local mount_path="$2"
    
    if docker volume ls | grep -q "$volume_name"; then
        echo "🧹 Nettoyage du volume $volume_name..."
        
        docker run --rm -v "$volume_name:$mount_path" alpine:latest sh -c "
            echo '🧹 Recherche et suppression des fichiers de verrouillage dans $volume_name...'
            find $mount_path -name '*.lock' -type f -delete 2>/dev/null || true
            find $mount_path -name '*.tmp' -type f -delete 2>/dev/null || true
            find $mount_path -name '.incomplete' -type d -exec rm -rf {} + 2>/dev/null || true
            find $mount_path -name '*.pid' -type f -delete 2>/dev/null || true
            find $mount_path -name '.DS_Store' -type f -delete 2>/dev/null || true
            echo '✅ Fichiers de verrouillage nettoyés dans $volume_name'
        "
    fi
}

# Corriger les permissions de tous les volumes translator
echo "📋 Correction des volumes du translator..."

fix_volume_permissions "meeshy_models_data" "/workspace/models" "1000" "1000"
fix_volume_permissions "meeshy_translator_cache" "/workspace/cache" "1000" "1000"
fix_volume_permissions "meeshy_translator_generated" "/workspace/generated" "1000" "1000"

echo "🧹 Nettoyage des fichiers de verrouillage..."

cleanup_locks "meeshy_models_data" "/workspace/models"
cleanup_locks "meeshy_translator_cache" "/workspace/cache"
cleanup_locks "meeshy_translator_generated" "/workspace/generated"

# Redémarrer le translator si il est en cours d'exécution
if docker compose ps translator | grep -q "Up"; then
    echo "🔄 Redémarrage du service translator..."
    docker compose restart translator
    echo "✅ Service translator redémarré"
fi

echo "🎉 Correction des permissions du translator terminée"
EOF
    
    # Transférer et exécuter le script
    log_info "📤 Transfert du script de correction..."
    scp -o StrictHostKeyChecking=no /tmp/fix-translator-permissions.sh root@$ip:/tmp/
    
    log_info "🚀 Exécution de la correction sur le serveur..."
    if ssh -o StrictHostKeyChecking=no root@$ip "chmod +x /tmp/fix-translator-permissions.sh && /tmp/fix-translator-permissions.sh"; then
        log_success "✅ Permissions du translator corrigées avec succès"
        
        # Nettoyer le script temporaire
        rm -f /tmp/fix-translator-permissions.sh
        ssh -o StrictHostKeyChecking=no root@$ip "rm -f /tmp/fix-translator-permissions.sh"
        
        trace_deploy_operation "fix_translator_permissions" "SUCCESS" "Translator permissions fixed on $ip"
    else
        log_error "❌ Échec de la correction des permissions du translator"
        trace_deploy_operation "fix_translator_permissions" "FAILED" "Translator permissions fix failed on $ip"
        exit 1
    fi
}

# Afficher les mots de passe générés
show_generated_passwords() {
    log_info "🔑 Affichage des mots de passe générés..."
    
    if [ ! -f "$PROJECT_ROOT/secrets/clear.txt" ]; then
        log_warning "⚠️  Fichier des mots de passe en clair non trouvé: $PROJECT_ROOT/secrets/clear.txt"
        log_info "💡 Générez d'abord les secrets avec: ./deploy-security.sh generate-secrets"
        return 1
    fi
    
    log_info "📁 Fichier source: $PROJECT_ROOT/secrets/clear.txt"
    log_warning "⚠️  ATTENTION: Ces mots de passe sont sensibles - Sauvegardez-les en lieu sûr !"
    echo ""
    echo -e "${YELLOW}===========================================${NC}"
    echo -e "${YELLOW}     MOTS DE PASSE GÉNÉRÉS - MEESHY${NC}"
    echo -e "${YELLOW}===========================================${NC}"
    echo ""
    
    cat "$PROJECT_ROOT/secrets/clear.txt"
    
    echo ""
    echo -e "${YELLOW}===========================================${NC}"
    echo -e "${RED}⚠️  IMPORTANT: Sauvegardez ces mots de passe${NC}"
    echo -e "${RED}    dans un gestionnaire de mots de passe sécurisé${NC}"
    echo -e "${YELLOW}===========================================${NC}"
    
    log_info "💡 Ces mots de passe sont également disponibles dans les variables d'environnement chiffrées"
}

# Réinitialiser tous les secrets
reset_all_secrets() {
    local ip="$1"
    local backup_before="${2:-true}"
    
    log_info "🔄 Réinitialisation complète des secrets..."
    trace_deploy_operation "reset_secrets" "STARTED" "Resetting all secrets"
    
    # Sauvegarder avant si demandé
    if [ "$backup_before" = "true" ]; then
        backup_secrets "$ip"
    fi
    
    # Supprimer les anciens secrets
    log_info "🗑️  Suppression des anciens secrets..."
    rm -f "$PROJECT_ROOT/secrets/production-secrets.env"
    rm -f "$PROJECT_ROOT/secrets/clear.txt"
    
    # Supprimer aussi sur le serveur
    if [ -n "$ip" ]; then
        ssh -o StrictHostKeyChecking=no root@$ip "rm -f /opt/meeshy/secrets/production-secrets.env" || true
        ssh -o StrictHostKeyChecking=no root@$ip "rm -f /opt/meeshy/traefik/passwords" || true
    fi
    
    # Régénérer les secrets
    generate_production_secrets "$ip" "true"
    
    # Redéployer si IP fournie
    if [ -n "$ip" ]; then
        deploy_secrets "$ip"
        deploy_traefik_passwords "$ip"
    fi
    
    log_success "✅ Réinitialisation des secrets terminée"
    trace_deploy_operation "reset_secrets" "SUCCESS" "All secrets reset"
    
    # Afficher les nouveaux mots de passe
    show_generated_passwords
}

# Sauvegarder les secrets actuels
backup_secrets() {
    local ip="$1"
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    
    log_info "💾 Sauvegarde des secrets actuels..."
    trace_deploy_operation "backup_secrets" "STARTED" "Backing up current secrets"
    
    mkdir -p "$PROJECT_ROOT/secrets/backups"
    
    # Sauvegarder les fichiers locaux
    if [ -f "$PROJECT_ROOT/secrets/production-secrets.env" ]; then
        cp "$PROJECT_ROOT/secrets/production-secrets.env" "$PROJECT_ROOT/secrets/backups/production-secrets_${timestamp}.env"
        log_success "✅ Secrets sauvegardés: secrets/backups/production-secrets_${timestamp}.env"
    fi
    
    if [ -f "$PROJECT_ROOT/secrets/clear.txt" ]; then
        cp "$PROJECT_ROOT/secrets/clear.txt" "$PROJECT_ROOT/secrets/backups/clear_${timestamp}.txt"
        log_success "✅ Mots de passe sauvegardés: secrets/backups/clear_${timestamp}.txt"
    fi
    
    # Sauvegarder depuis le serveur si IP fournie
    if [ -n "$ip" ]; then
        log_info "💾 Sauvegarde des secrets du serveur $ip..."
        scp -o StrictHostKeyChecking=no root@$ip:/opt/meeshy/secrets/production-secrets.env "$PROJECT_ROOT/secrets/backups/server-secrets_${timestamp}.env" 2>/dev/null || log_warning "⚠️  Impossible de sauvegarder les secrets du serveur"
    fi
    
    trace_deploy_operation "backup_secrets" "SUCCESS" "Secrets backed up with timestamp $timestamp"
    log_success "✅ Sauvegarde terminée dans secrets/backups/"
}

# Point d'entrée principal
main() {
    local command="${1:-help}"
    local ip="$2"
    local force=false
    local backup_before=false
    local validate_after=false
    
    # Parser les options
    shift 2 2>/dev/null || true
    while [[ $# -gt 0 ]]; do
        case $1 in
            --force)
                force=true
                shift
                ;;
            --backup-before)
                backup_before=true
                shift
                ;;
            --validate-after)
                validate_after=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done
    
    case "$command" in
        "generate-secrets")
            generate_production_secrets "$ip" "$force"
            ;;
        "validate-secrets")
            validate_secrets "$ip"
            ;;
        "deploy-secrets")
            deploy_secrets "$ip" true
            ;;
        "reset-secrets")
            reset_all_secrets "$ip" "$backup_before"
            ;;
        "backup-secrets")
            backup_secrets "$ip"
            ;;
        "deploy-passwords")
            deploy_traefik_passwords "$ip" "$force"
            ;;
        "show-passwords")
            show_generated_passwords
            ;;
        "reset-passwords")
            if [ "$backup_before" = "true" ]; then
                backup_secrets "$ip"
            fi
            deploy_traefik_passwords "$ip" "true"
            ;;
        "fix-permissions")
            fix_translator_permissions "$ip"
            ;;
        "fix-translator")
            fix_translator_permissions "$ip"
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
