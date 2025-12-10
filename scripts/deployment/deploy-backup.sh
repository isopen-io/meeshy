#!/bin/bash

# ===== MEESHY - SAUVEGARDE ET RESTAURATION =====
# Script spécialisé pour la sauvegarde et restauration des données
# Usage: ./deploy-backup.sh [COMMAND] [DROPLET_IP] [OPTIONS]

set -e

# Charger la configuration de déploiement
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

# Initialiser la traçabilité
init_deploy_tracing "deploy-backup" "backup_operations"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}💾 MEESHY - SAUVEGARDE ET RESTAURATION${NC}"
    echo "======================================"
    echo ""
    echo "Usage:"
    echo "  ./deploy-backup.sh [COMMAND] [DROPLET_IP] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo -e "${GREEN}  Sauvegarde:${NC}"
    echo "    backup-all             - Sauvegarde complète (DB + config + secrets)"
    echo "    backup-database        - Sauvegarde base de données uniquement"
    echo "    backup-config          - Sauvegarde configuration uniquement"
    echo "    backup-secrets         - Sauvegarde secrets uniquement"
    echo "    backup-volumes         - Sauvegarde volumes Docker"
    echo ""
    echo -e "${GREEN}  Restauration:${NC}"
    echo "    restore-all            - Restauration complète"
    echo "    restore-database       - Restauration base de données"
    echo "    restore-config         - Restauration configuration"
    echo "    restore-secrets        - Restauration secrets"
    echo ""
    echo -e "${GREEN}  Gestion:${NC}"
    echo "    list-backups           - Lister les sauvegardes disponibles"
    echo "    cleanup-old            - Nettoyer les anciennes sauvegardes"
    echo "    verify-backup          - Vérifier l'intégrité d'une sauvegarde"
    echo "    schedule-backup        - Planifier les sauvegardes automatiques"
    echo ""
    echo "Options:"
    echo "  --backup-name=NAME     - Nom personnalisé pour la sauvegarde"
    echo "  --retention=N          - Nombre de sauvegardes à conserver (défaut: 7)"
    echo "  --compress             - Compresser les sauvegardes"
    echo "  --encrypt              - Chiffrer les sauvegardes"
    echo "  --remote-storage=PATH  - Copier vers stockage distant"
    echo ""
    echo "Exemples:"
    echo "  ./deploy-backup.sh backup-all 192.168.1.100"
    echo "  ./deploy-backup.sh backup-database 192.168.1.100 --backup-name=pre-update"
    echo "  ./deploy-backup.sh restore-database 192.168.1.100 backup_20250909_120000"
    echo "  ./deploy-backup.sh list-backups"
    echo ""
}

# Variables globales
BACKUP_NAME=""
RETENTION_COUNT=7
COMPRESS=false
ENCRYPT=false
REMOTE_STORAGE=""

# Répertoires de sauvegarde
BACKUP_ROOT="$PROJECT_ROOT/backups"
BACKUP_DATABASE_DIR="$BACKUP_ROOT/database"
BACKUP_CONFIG_DIR="$BACKUP_ROOT/config"
BACKUP_SECRETS_DIR="$BACKUP_ROOT/secrets"
BACKUP_VOLUMES_DIR="$BACKUP_ROOT/volumes"

# Créer les répertoires de sauvegarde
create_backup_directories() {
    mkdir -p "$BACKUP_DATABASE_DIR"
    mkdir -p "$BACKUP_CONFIG_DIR"
    mkdir -p "$BACKUP_SECRETS_DIR"
    mkdir -p "$BACKUP_VOLUMES_DIR"
    
    log_info "📁 Répertoires de sauvegarde initialisés:"
    log_info "  • Base de données: $BACKUP_DATABASE_DIR"
    log_info "  • Configuration: $BACKUP_CONFIG_DIR"
    log_info "  • Secrets: $BACKUP_SECRETS_DIR"
    log_info "  • Volumes: $BACKUP_VOLUMES_DIR"
}

# Générer un nom de sauvegarde
generate_backup_name() {
    local prefix="$1"
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    
    if [ -n "$BACKUP_NAME" ]; then
        echo "${prefix}_${BACKUP_NAME}_${timestamp}"
    else
        echo "${prefix}_${timestamp}"
    fi
}

# Sauvegarde complète
backup_all() {
    local ip="$1"
    
    log_info "💾 Sauvegarde complète de Meeshy..."
    trace_deploy_operation "backup_all" "STARTED" "Starting complete backup from $ip"
    
    create_backup_directories
    
    local backup_name=$(generate_backup_name "complete")
    local backup_dir="$BACKUP_ROOT/$backup_name"
    mkdir -p "$backup_dir"
    
    log_info "📁 Répertoire de sauvegarde: $backup_dir"
    
    # Sauvegarder la base de données
    log_info "1/4 Sauvegarde de la base de données..."
    backup_database_to_dir "$ip" "$backup_dir/database"
    
    # Sauvegarder la configuration
    log_info "2/4 Sauvegarde de la configuration..."
    backup_configuration_to_dir "$ip" "$backup_dir/config"
    
    # Sauvegarder les secrets
    log_info "3/4 Sauvegarde des secrets..."
    backup_secrets_to_dir "$ip" "$backup_dir/secrets"
    
    # Sauvegarder les volumes
    log_info "4/4 Sauvegarde des volumes..."
    backup_volumes_to_dir "$ip" "$backup_dir/volumes"
    
    # Créer un fichier de métadonnées
    create_backup_metadata "$backup_dir" "$ip"
    
    # Compresser si demandé
    if [ "$COMPRESS" = "true" ]; then
        compress_backup "$backup_dir"
    fi
    
    # Chiffrer si demandé
    if [ "$ENCRYPT" = "true" ]; then
        encrypt_backup "$backup_dir"
    fi
    
    # Copier vers stockage distant si configuré
    if [ -n "$REMOTE_STORAGE" ]; then
        copy_to_remote_storage "$backup_dir"
    fi
    
    log_success "✅ Sauvegarde complète terminée: $backup_name"
    trace_deploy_operation "backup_all" "SUCCESS" "Complete backup finished: $backup_name"
    
    # Nettoyer les anciennes sauvegardes
    cleanup_old_backups
}

# Sauvegarde de la base de données
backup_database() {
    local ip="$1"
    
    log_info "💾 Sauvegarde de la base de données..."
    trace_deploy_operation "backup_database" "STARTED" "Starting database backup from $ip"
    
    create_backup_directories
    
    local backup_name=$(generate_backup_name "database")
    local backup_path="$BACKUP_DATABASE_DIR/$backup_name"
    
    backup_database_to_dir "$ip" "$backup_path"
    
    log_success "✅ Sauvegarde de la base de données terminée: $backup_name"
    trace_deploy_operation "backup_database" "SUCCESS" "Database backup finished: $backup_name"
}

# Sauvegarde de la base de données vers un répertoire
backup_database_to_dir() {
    local ip="$1"
    local backup_dir="$2"
    
    mkdir -p "$backup_dir"
    
    log_info "📊 Sauvegarde MongoDB depuis $ip..."
    log_info "📁 Destination locale: $backup_dir"
    
    # Vérifier que MongoDB est accessible
    if ! ssh -o StrictHostKeyChecking=no root@$ip "cd /opt/meeshy && docker compose exec -T mongodb mongosh --eval 'db.adminCommand(\"ping\")'" >/dev/null 2>&1; then
        log_error "❌ MongoDB non accessible sur $ip"
        return 1
    fi
    
    # Créer la sauvegarde sur le serveur
    local remote_backup_dir="/tmp/mongodb_backup_$(date +%s)"
    
    ssh -o StrictHostKeyChecking=no root@$ip "
        cd /opt/meeshy
        echo '📊 Création de la sauvegarde MongoDB...'
        
        # Sauvegarde avec mongodump
        docker compose exec -T mongodb mongodump --db meeshy --out $remote_backup_dir/ 2>/dev/null
        
        # Compresser la sauvegarde
        cd /tmp && tar -czf mongodb_backup.tar.gz $(basename $remote_backup_dir)/
        
        echo '✅ Sauvegarde MongoDB créée'
    "
    
    # Récupérer la sauvegarde
    log_info "📤 Récupération de la sauvegarde..."
    scp -o StrictHostKeyChecking=no root@$ip:/tmp/mongodb_backup.tar.gz "$backup_dir/mongodb_$(date +%Y%m%d_%H%M%S).tar.gz"
    
    # Nettoyer le serveur
    ssh -o StrictHostKeyChecking=no root@$ip "
        rm -rf $remote_backup_dir /tmp/mongodb_backup.tar.gz
    "
    
    log_info "📍 Sauvegarde stockée: $backup_dir/mongodb_$(date +%Y%m%d_%H%M%S).tar.gz"
    log_info "🎯 Usage: Sauvegarde complète de la base de données MongoDB"
}

# Sauvegarde de la configuration
backup_configuration() {
    local ip="$1"
    
    log_info "💾 Sauvegarde de la configuration..."
    trace_deploy_operation "backup_config" "STARTED" "Starting configuration backup from $ip"
    
    create_backup_directories
    
    local backup_name=$(generate_backup_name "config")
    local backup_path="$BACKUP_CONFIG_DIR/$backup_name"
    
    backup_configuration_to_dir "$ip" "$backup_path"
    
    log_success "✅ Sauvegarde de la configuration terminée: $backup_name"
    trace_deploy_operation "backup_config" "SUCCESS" "Configuration backup finished: $backup_name"
}

# Sauvegarde de la configuration vers un répertoire
backup_configuration_to_dir() {
    local ip="$1"
    local backup_dir="$2"
    
    mkdir -p "$backup_dir"
    
    log_info "⚙️  Sauvegarde de la configuration depuis $ip..."
    log_info "📁 Destination locale: $backup_dir"
    
    # Fichiers de configuration à sauvegarder
    local config_files=(
        "docker-compose.yml"
        ".env"
        "docker/nginx/"
        "docker/supervisor/"
        "shared/schema.prisma"
        "shared/schema.postgresql.prisma"
        "shared/proto/"
    )
    
    for file in "${config_files[@]}"; do
        log_info "📄 Sauvegarde: /opt/meeshy/$file"
        scp -r -o StrictHostKeyChecking=no root@$ip:/opt/meeshy/$file "$backup_dir/" 2>/dev/null || log_warning "⚠️  Fichier non trouvé: $file"
    done
    
    log_info "📍 Configuration sauvegardée dans: $backup_dir"
    log_info "🎯 Usage: Fichiers de configuration et structure Docker"
}

# Sauvegarde des secrets
backup_secrets() {
    local ip="$1"
    
    log_info "💾 Sauvegarde des secrets..."
    trace_deploy_operation "backup_secrets" "STARTED" "Starting secrets backup from $ip"
    
    create_backup_directories
    
    local backup_name=$(generate_backup_name "secrets")
    local backup_path="$BACKUP_SECRETS_DIR/$backup_name"
    
    backup_secrets_to_dir "$ip" "$backup_path"
    
    log_success "✅ Sauvegarde des secrets terminée: $backup_name"
    trace_deploy_operation "backup_secrets" "SUCCESS" "Secrets backup finished: $backup_name"
}

# Sauvegarde des secrets vers un répertoire
backup_secrets_to_dir() {
    local ip="$1"
    local backup_dir="$2"
    
    mkdir -p "$backup_dir"
    
    log_info "🔐 Sauvegarde des secrets depuis $ip..."
    log_info "📁 Destination locale: $backup_dir"
    
    # Sauvegarder les secrets du serveur
    scp -o StrictHostKeyChecking=no root@$ip:/opt/meeshy/secrets/production-secrets.env "$backup_dir/" 2>/dev/null || log_warning "⚠️  Secrets de production non trouvés sur le serveur"
    scp -o StrictHostKeyChecking=no root@$ip:/opt/meeshy/traefik/passwords "$backup_dir/traefik-passwords" 2>/dev/null || log_warning "⚠️  Mots de passe Traefik non trouvés"
    
    # Sauvegarder les secrets locaux
    if [ -f "$PROJECT_ROOT/secrets/production-secrets.env" ]; then
        cp "$PROJECT_ROOT/secrets/production-secrets.env" "$backup_dir/local-production-secrets.env"
        log_info "📄 Secrets locaux: local-production-secrets.env"
    fi
    
    if [ -f "$PROJECT_ROOT/secrets/clear.txt" ]; then
        cp "$PROJECT_ROOT/secrets/clear.txt" "$backup_dir/local-clear-passwords.txt"
        log_info "📄 Mots de passe en clair: local-clear-passwords.txt"
        log_warning "⚠️  ATTENTION: Ce fichier contient des mots de passe non chiffrés"
    fi
    
    log_info "📍 Secrets sauvegardés dans: $backup_dir"
    log_info "🎯 Usage: Secrets et mots de passe pour la restauration"
}

# Sauvegarde des volumes Docker
backup_volumes() {
    local ip="$1"
    
    log_info "💾 Sauvegarde des volumes Docker..."
    trace_deploy_operation "backup_volumes" "STARTED" "Starting volumes backup from $ip"
    
    create_backup_directories
    
    local backup_name=$(generate_backup_name "volumes")
    local backup_path="$BACKUP_VOLUMES_DIR/$backup_name"
    
    backup_volumes_to_dir "$ip" "$backup_path"
    
    log_success "✅ Sauvegarde des volumes terminée: $backup_name"
    trace_deploy_operation "backup_volumes" "SUCCESS" "Volumes backup finished: $backup_name"
}

# Sauvegarde des volumes vers un répertoire
backup_volumes_to_dir() {
    local ip="$1"
    local backup_dir="$2"
    
    mkdir -p "$backup_dir"
    
    log_info "🗂️  Sauvegarde des volumes Docker depuis $ip..."
    log_info "📁 Destination locale: $backup_dir"
    
    # Volumes à sauvegarder
    local volumes=("meeshy_models_data" "meeshy_translator_cache" "meeshy_translator_generated")
    
    for volume in "${volumes[@]}"; do
        log_info "🗂️  Sauvegarde du volume: $volume"
        
        # Créer une archive du volume sur le serveur
        ssh -o StrictHostKeyChecking=no root@$ip "
            if docker volume ls | grep -q $volume; then
                echo 'Sauvegarde du volume $volume...'
                docker run --rm -v $volume:/source alpine tar -czf /tmp/${volume}_backup.tar.gz -C /source .
                echo 'Volume $volume sauvegardé'
            else
                echo 'Volume $volume non trouvé'
            fi
        "
        
        # Récupérer l'archive
        scp -o StrictHostKeyChecking=no root@$ip:/tmp/${volume}_backup.tar.gz "$backup_dir/" 2>/dev/null && \
        ssh -o StrictHostKeyChecking=no root@$ip "rm -f /tmp/${volume}_backup.tar.gz" || \
        log_warning "⚠️  Impossible de sauvegarder le volume $volume"
    done
    
    log_info "📍 Volumes sauvegardés dans: $backup_dir"
    log_info "🎯 Usage: Données persistantes des services (modèles ML, cache, etc.)"
}

# Créer les métadonnées de sauvegarde
create_backup_metadata() {
    local backup_dir="$1"
    local ip="$2"
    
    local metadata_file="$backup_dir/backup_metadata.txt"
    
    {
        echo "===== MÉTADONNÉES DE SAUVEGARDE MEESHY ====="
        echo "Date de création: $(date)"
        echo "Serveur source: $ip"
        echo "Session de déploiement: $DEPLOY_SESSION_ID"
        echo "Version: $DEPLOY_VERSION"
        echo "Utilisateur: $(whoami)"
        echo "Machine locale: $(hostname)"
        echo ""
        echo "Contenu de la sauvegarde:"
        find "$backup_dir" -type f -name "*.tar.gz" -o -name "*.env" -o -name "*.txt" -o -name "*.yml" | sort
        echo ""
        echo "Taille totale:"
        du -sh "$backup_dir"
        echo ""
        echo "Commande de restauration suggérée:"
        echo "./deploy-backup.sh restore-all $ip $(basename "$backup_dir")"
        echo "============================================"
    } > "$metadata_file"
    
    log_info "📋 Métadonnées créées: backup_metadata.txt"
}

# Lister les sauvegardes disponibles
list_backups() {
    log_info "📋 Sauvegardes disponibles..."
    
    if [ ! -d "$BACKUP_ROOT" ]; then
        log_warning "⚠️  Aucun répertoire de sauvegarde trouvé: $BACKUP_ROOT"
        return 0
    fi
    
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}    SAUVEGARDES DISPONIBLES - MEESHY${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
    
    # Sauvegardes complètes
    if [ -d "$BACKUP_ROOT" ] && ls "$BACKUP_ROOT"/complete_* >/dev/null 2>&1; then
        echo -e "${GREEN}💾 Sauvegardes complètes:${NC}"
        for backup in "$BACKUP_ROOT"/complete_*; do
            if [ -d "$backup" ]; then
                local name=$(basename "$backup")
                local size=$(du -sh "$backup" | cut -f1)
                local date=$(stat -c %y "$backup" 2>/dev/null | cut -d' ' -f1 || echo "inconnue")
                echo "  📦 $name ($size) - $date"
                
                # Afficher les métadonnées si disponibles
                if [ -f "$backup/backup_metadata.txt" ]; then
                    local server=$(grep "Serveur source:" "$backup/backup_metadata.txt" | cut -d: -f2- | xargs)
                    echo "      🖥️  Serveur: $server"
                fi
            fi
        done
        echo ""
    fi
    
    # Sauvegardes de base de données
    if [ -d "$BACKUP_DATABASE_DIR" ] && ls "$BACKUP_DATABASE_DIR"/* >/dev/null 2>&1; then
        echo -e "${BLUE}📊 Sauvegardes de base de données:${NC}"
        ls -la "$BACKUP_DATABASE_DIR" | grep -v "^total" | grep -v "^d" | while read line; do
            echo "  📄 $(echo "$line" | awk '{print $9, "(" $5 " bytes) -", $6, $7, $8}')"
        done
        echo ""
    fi
    
    # Sauvegardes de configuration
    if [ -d "$BACKUP_CONFIG_DIR" ] && ls "$BACKUP_CONFIG_DIR"/* >/dev/null 2>&1; then
        echo -e "${YELLOW}⚙️  Sauvegardes de configuration:${NC}"
        ls -la "$BACKUP_CONFIG_DIR" | grep -v "^total" | grep -v "^d" | while read line; do
            echo "  📄 $(echo "$line" | awk '{print $9, "(" $5 " bytes) -", $6, $7, $8}')"
        done
        echo ""
    fi
    
    echo -e "${CYAN}========================================${NC}"
}

# Nettoyer les anciennes sauvegardes
cleanup_old_backups() {
    log_info "🧹 Nettoyage des anciennes sauvegardes (conservation: $RETENTION_COUNT)..."
    
    # Nettoyer les sauvegardes complètes
    if [ -d "$BACKUP_ROOT" ]; then
        local complete_backups=($(ls -1dt "$BACKUP_ROOT"/complete_* 2>/dev/null | tail -n +$((RETENTION_COUNT + 1))))
        for backup in "${complete_backups[@]}"; do
            log_info "🗑️  Suppression: $(basename "$backup")"
            rm -rf "$backup"
        done
    fi
    
    # Nettoyer les sauvegardes de base de données
    if [ -d "$BACKUP_DATABASE_DIR" ]; then
        local db_backups=($(ls -1t "$BACKUP_DATABASE_DIR"/* 2>/dev/null | tail -n +$((RETENTION_COUNT + 1))))
        for backup in "${db_backups[@]}"; do
            log_info "🗑️  Suppression: $(basename "$backup")"
            rm -f "$backup"
        done
    fi
    
    log_success "✅ Nettoyage terminé"
}

# Point d'entrée principal
main() {
    local command="${1:-help}"
    local ip="$2"
    
    # Parser les options
    shift 2 2>/dev/null || true
    while [[ $# -gt 0 ]]; do
        case $1 in
            --backup-name=*)
                BACKUP_NAME="${1#*=}"
                shift
                ;;
            --retention=*)
                RETENTION_COUNT="${1#*=}"
                shift
                ;;
            --compress)
                COMPRESS=true
                shift
                ;;
            --encrypt)
                ENCRYPT=true
                shift
                ;;
            --remote-storage=*)
                REMOTE_STORAGE="${1#*=}"
                shift
                ;;
            *)
                shift
                ;;
        esac
    done
    
    case "$command" in
        "backup-all")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            backup_all "$ip"
            ;;
        "backup-database")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            backup_database "$ip"
            ;;
        "backup-config")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            backup_configuration "$ip"
            ;;
        "backup-secrets")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            backup_secrets "$ip"
            ;;
        "backup-volumes")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            backup_volumes "$ip"
            ;;
        "list-backups")
            list_backups
            ;;
        "cleanup-old")
            cleanup_old_backups
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
