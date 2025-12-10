#!/bin/bash

# ===== MEESHY - PRÉPARATION DES FICHIERS DE DÉPLOIEMENT =====
# Script spécialisé pour préparer et transférer les fichiers essentiels
# Usage: ./deploy-prepare-files.sh [DROPLET_IP] [DOMAIN]

set -e

# Charger la configuration de déploiement
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

# Initialiser la traçabilité
init_deploy_tracing "deploy-prepare-files" "prepare_deployment_files"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}📁 MEESHY - PRÉPARATION DES FICHIERS DE DÉPLOIEMENT${NC}"
    echo "====================================================="
    echo ""
    echo "Usage:"
    echo "  ./deploy-prepare-files.sh [DROPLET_IP] [DOMAIN]"
    echo ""
    echo "Description:"
    echo "  Prépare et transfère les fichiers essentiels pour le déploiement"
    echo "  (infrastructure et configuration uniquement)."
    echo ""
    echo "Exemples:"
    echo "  ./deploy-prepare-files.sh 192.168.1.100"
    echo "  ./deploy-prepare-files.sh 192.168.1.100 meeshy.me"
    echo ""
}

# Préparer les fichiers essentiels
prepare_essential_files() {
    local ip="$1"
    local domain="${2:-meeshy.me}"
    
    log_info "Préparation des fichiers essentiels pour le déploiement sur $ip (domaine: $domain)"
    trace_deploy_operation "prepare_files" "STARTED" "Preparing essential files for $ip"
    
    # Créer répertoire temporaire pour les fichiers essentiels uniquement
    local deploy_dir="$DEPLOY_TEMP_DIR/meeshy-deploy-optimized-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$deploy_dir"
    
    log_info "Répertoire de déploiement temporaire: $deploy_dir"
    
    # Préparer fichiers essentiels uniquement
    log_info "📁 Préparation des fichiers essentiels (infrastructure et configuration)..."
    
    # Fichiers Docker Compose et environnement
    if [ -f "$PROJECT_ROOT/$DOCKER_COMPOSE_FILE" ]; then
        cp "$PROJECT_ROOT/$DOCKER_COMPOSE_FILE" "$deploy_dir/docker-compose.yml"
        log_success "Docker Compose file copié"
    else
        log_error "Fichier $DOCKER_COMPOSE_FILE non trouvé"
        trace_deploy_operation "prepare_files" "FAILED" "Docker Compose file not found"
        exit 1
    fi
    
    # Créer le fichier .env pour la production en intégrant les secrets
    create_production_env_file "$deploy_dir"
    
    # Configuration Docker essentielle uniquement
    prepare_docker_config "$deploy_dir"
    
    # Fichiers shared essentiels pour la configuration
    prepare_shared_files "$deploy_dir"
    
    # Génération des configurations de production sécurisées
    prepare_production_config "$deploy_dir"
    
    log_success "Fichiers essentiels préparés dans $deploy_dir"
    trace_deploy_operation "prepare_files" "SUCCESS" "Essential files prepared in $deploy_dir"
    
    # Stocker le chemin dans une variable globale
    export PREPARED_DEPLOY_DIR="$deploy_dir"
}

# Créer le fichier .env pour la production en intégrant les secrets
create_production_env_file() {
    local deploy_dir="$1"
    
    log_info "Création du fichier .env pour la production..."
    trace_deploy_operation "create_env_file" "STARTED" "Creating production .env file"
    
    # Commencer avec env.digitalocean comme base
    if [ -f "$PROJECT_ROOT/env.digitalocean" ]; then
        cp "$PROJECT_ROOT/env.digitalocean" "$deploy_dir/.env"
        log_success "Fichier env.digitalocean copié comme base"
    else
        log_warning "Fichier env.digitalocean non trouvé, création d'un fichier .env vide"
        touch "$deploy_dir/.env"
    fi
    
    # Intégrer les secrets de production si disponibles
    if [ -f "$PROJECT_ROOT/secrets/production-secrets.env" ]; then
        log_info "Intégration des secrets de production..."
        
        # Lire les secrets et les ajouter au fichier .env
        while IFS='=' read -r key value; do
            # Ignorer les commentaires et lignes vides
            if [[ ! "$key" =~ ^[[:space:]]*# ]] && [[ -n "$key" ]]; then
                # Échapper les caractères spéciaux dans la valeur
                escaped_value=$(printf '%s\n' "$value" | sed 's/[[\.*^$()+?{|]/\\&/g')
                
                # Vérifier si la variable existe déjà dans .env
                if grep -q "^${key}=" "$deploy_dir/.env"; then
                    # Remplacer la valeur existante
                    sed -i.bak "s/^${key}=.*/${key}=${escaped_value}/" "$deploy_dir/.env"
                else
                    # Ajouter la nouvelle variable
                    echo "${key}=${escaped_value}" >> "$deploy_dir/.env"
                fi
            fi
        done < "$PROJECT_ROOT/secrets/production-secrets.env"
        
        # Nettoyer le fichier de sauvegarde
        rm -f "$deploy_dir/.env.bak"
        
        log_success "Secrets de production intégrés dans .env"
    else
        log_warning "Fichier de secrets de production non trouvé, utilisation des valeurs par défaut"
    fi
    
    # Vérifier que le fichier .env a été créé
    if [ -f "$deploy_dir/.env" ]; then
        log_success "Fichier .env créé avec succès pour la production"
        trace_deploy_operation "create_env_file" "SUCCESS" "Production .env file created"
    else
        log_error "Échec de la création du fichier .env"
        trace_deploy_operation "create_env_file" "FAILED" "Failed to create production .env file"
        exit 1
    fi
}

# Préparer la configuration Docker
prepare_docker_config() {
    local deploy_dir="$1"
    
    log_info "Préparation de la configuration Docker..."
    
    mkdir -p "$deploy_dir/docker"
    
    # Configuration Nginx
    if [ -d "$PROJECT_ROOT/docker/nginx" ]; then
        cp -r "$PROJECT_ROOT/docker/nginx" "$deploy_dir/docker/"
        log_success "Configuration Nginx copiée"
    else
        log_warning "Configuration Nginx non trouvée"
    fi
    
    # Configuration Supervisor
    if [ -d "$PROJECT_ROOT/docker/supervisor" ]; then
        cp -r "$PROJECT_ROOT/docker/supervisor" "$deploy_dir/docker/"
        log_success "Configuration Supervisor copiée"
    else
        log_warning "Configuration Supervisor non trouvée"
    fi
    
    trace_deploy_operation "docker_config" "SUCCESS" "Docker configuration prepared"
}

# Préparer les fichiers shared
prepare_shared_files() {
    local deploy_dir="$1"
    
    log_info "Préparation des fichiers shared essentiels..."
    
    mkdir -p "$deploy_dir/shared"
    
    # Schémas de base de données
    if [ -f "$PROJECT_ROOT/shared/schema.prisma" ]; then
        cp "$PROJECT_ROOT/shared/schema.prisma" "$deploy_dir/shared/"
        log_success "Schéma Prisma copié"
    fi
    
    if [ -f "$PROJECT_ROOT/shared/schema.postgresql.prisma" ]; then
        cp "$PROJECT_ROOT/shared/schema.postgresql.prisma" "$deploy_dir/shared/"
        log_success "Schéma PostgreSQL copié"
    fi
    
    # Scripts d'initialisation de base de données
    local init_files=("init-postgresql.sql" "init-database.sh" "init-mongodb-replica.sh" "mongodb-keyfile")
    for file in "${init_files[@]}"; do
        if [ -f "$PROJECT_ROOT/shared/$file" ]; then
            cp "$PROJECT_ROOT/shared/$file" "$deploy_dir/shared/"
            log_success "Fichier d'initialisation $file copié"
        fi
    done
    
    # Fichiers Proto pour la communication inter-services
    if [ -d "$PROJECT_ROOT/shared/proto" ]; then
        mkdir -p "$deploy_dir/shared/proto"
        cp "$PROJECT_ROOT/shared/proto/messaging.proto" "$deploy_dir/shared/proto/" 2>/dev/null || true
        log_success "Fichiers Proto copiés"
    fi
    
    # Version pour le suivi
    if [ -f "$PROJECT_ROOT/shared/version.txt" ]; then
        cp "$PROJECT_ROOT/shared/version.txt" "$deploy_dir/shared/"
    else
        echo "1.0.0" > "$deploy_dir/shared/version.txt"
    fi
    
    trace_deploy_operation "shared_files" "SUCCESS" "Shared files prepared"
}

# Préparer la configuration de production
prepare_production_config() {
    local deploy_dir="$1"
    
    log_info "🔐 Gestion des configurations de production sécurisées..."
    
    if [ -f "$PROJECT_ROOT/scripts/production/meeshy-generate-production-variables.sh" ]; then
        # Vérifier si les secrets existent déjà
        if [ -f "$PROJECT_ROOT/secrets/production-secrets.env" ] && [ "$REGENERATE_SECRETS" = false ]; then
            log_info "📋 Fichier de secrets existant détecté: $PROJECT_ROOT/secrets/production-secrets.env"
            log_info "💡 Utilisation des secrets existants (utilisez --regenerate-secrets pour forcer la régénération)"
        else
            if [ "$REGENERATE_SECRETS" = true ]; then
                log_warning "⚠️  Régénération forcée des secrets de production..."
            else
                log_info "📋 Génération des nouvelles configurations de production..."
            fi
            bash "$PROJECT_ROOT/scripts/production/meeshy-generate-production-variables.sh" --force
            log_success "✅ Configurations de production générées"
        fi
        
        # Vérifier que le fichier clear.txt a été créé
        if [ -f "$PROJECT_ROOT/secrets/clear.txt" ]; then
            log_success "✅ Fichier des mots de passe en clair trouvé: secrets/clear.txt"
        else
            log_warning "⚠️  Fichier des mots de passe en clair non trouvé: secrets/clear.txt"
        fi
    else
        log_warning "⚠️  Script de génération de configuration non trouvé"
    fi
    
    trace_deploy_operation "production_config" "SUCCESS" "Production configuration prepared"
}

# Transférer les fichiers sur le serveur
transfer_files_to_server() {
    local ip="$1"
    local deploy_dir="$2"
    
    log_info "📤 Transfert des fichiers optimisés vers le serveur $ip..."
    trace_deploy_operation "transfer_files" "STARTED" "Transferring files to $ip"
    
    # Créer le répertoire sur le serveur
    ssh -o StrictHostKeyChecking=no root@$ip "mkdir -p /opt/meeshy"
    
    # Transférer les fichiers essentiels
    log_info "Transfert du fichier Docker Compose..."
    scp -o StrictHostKeyChecking=no "$deploy_dir/docker-compose.yml" root@$ip:/opt/meeshy/
    
    log_info "Transfert du fichier d'environnement..."
    scp -o StrictHostKeyChecking=no "$deploy_dir/.env" root@$ip:/opt/meeshy/
    
    log_info "Transfert de la configuration Docker..."
    scp -r -o StrictHostKeyChecking=no "$deploy_dir/docker" root@$ip:/opt/meeshy/
    
    log_info "Transfert des fichiers shared..."
    scp -r -o StrictHostKeyChecking=no "$deploy_dir/shared" root@$ip:/opt/meeshy/
    
    log_success "Fichiers transférés avec succès"
    trace_deploy_operation "transfer_files" "SUCCESS" "Files transferred to $ip"
}

# Gérer les secrets de production
handle_production_secrets() {
    local ip="$1"
    
    log_info "🔐 Gestion des secrets de production..."
    trace_deploy_operation "handle_secrets" "STARTED" "Handling production secrets for $ip"
    
    if [ -f "$PROJECT_ROOT/secrets/production-secrets.env" ]; then
        log_info "📋 Fichier de secrets de production trouvé"
        
        # Créer le répertoire secrets sur le serveur
        ssh -o StrictHostKeyChecking=no root@$ip "mkdir -p /opt/meeshy/secrets"
        
        # Transférer le fichier de secrets
        scp -o StrictHostKeyChecking=no "$PROJECT_ROOT/secrets/production-secrets.env" root@$ip:/opt/meeshy/secrets/
        
        # Sécuriser le fichier sur le serveur
        ssh -o StrictHostKeyChecking=no root@$ip "chmod 600 /opt/meeshy/secrets/production-secrets.env"
        
        log_success "✅ Fichier de secrets transféré et sécurisé"
        
        # ⚠️  SÉCURITÉ: Ne JAMAIS transférer les mots de passe en clair sur le serveur
        log_info "🔒 Fichier des mots de passe en clair conservé en local uniquement (sécurité)"
        
        trace_deploy_operation "handle_secrets" "SUCCESS" "Production secrets handled securely"
    else
        log_warning "⚠️  Fichier de secrets de production non trouvé: $PROJECT_ROOT/secrets/production-secrets.env"
        log_info "💡 Créez le fichier avec: ./scripts/production/meeshy-generate-production-variables.sh"
        trace_deploy_operation "handle_secrets" "WARNING" "Production secrets file not found"
    fi
}

# Nettoyer les fichiers temporaires
cleanup_temp_files() {
    local deploy_dir="$1"
    
    log_info "🧹 Nettoyage des fichiers temporaires..."
    
    if [ -n "$deploy_dir" ] && [ -d "$deploy_dir" ]; then
        rm -rf "$deploy_dir"
        log_success "Fichiers temporaires nettoyés"
    fi
    
    trace_deploy_operation "cleanup" "SUCCESS" "Temporary files cleaned"
}

# Fonction principale
main() {
    local ip="$1"
    local domain="$2"
    
    # Parser les arguments si appelé directement
    if [ -z "$ip" ] && [ -n "$DROPLET_IP" ]; then
        ip="$DROPLET_IP"
    fi
    
    if [ -z "$domain" ]; then
        domain="meeshy.me"
    fi
    
    if [ -z "$ip" ]; then
        log_error "IP du serveur manquante"
        show_help
        exit 1
    fi
    
    log_info "🚀 Préparation du déploiement sur $ip (domaine: $domain)"
    
    # Préparer les fichiers essentiels
    prepare_essential_files "$ip" "$domain"
    local deploy_dir="$PREPARED_DEPLOY_DIR"
    
    # Transférer les fichiers sur le serveur (comme dans l'ancien script)
    log_info "📤 Envoi des fichiers optimisés..."
    ssh -o StrictHostKeyChecking=no root@$ip "mkdir -p /opt/meeshy"
    scp -o StrictHostKeyChecking=no "$deploy_dir/docker-compose.yml" root@$ip:/opt/meeshy/
    scp -o StrictHostKeyChecking=no "$deploy_dir/.env" root@$ip:/opt/meeshy/
    scp -r -o StrictHostKeyChecking=no "$deploy_dir/docker" root@$ip:/opt/meeshy/
    scp -r -o StrictHostKeyChecking=no "$deploy_dir/shared" root@$ip:/opt/meeshy/
    log_success "Fichiers transférés avec succès"
    
    # Gérer les secrets de production
    handle_production_secrets "$ip"
    
    # Nettoyer les fichiers temporaires
    cleanup_temp_files "$deploy_dir"
    
    log_success "Préparation des fichiers de déploiement terminée avec succès"
    
    # Finaliser la traçabilité
    finalize_deploy_tracing "SUCCESS" "File preparation completed for $ip"
    
    echo "$deploy_dir"
}

# Exécuter la fonction principale si le script est appelé directement
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi
