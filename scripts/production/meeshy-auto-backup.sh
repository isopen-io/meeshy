#!/bin/bash

# ===== MEESHY - BACKUP AUTOMATIQUE AVANT MISE À JOUR =====
# Script pour sauvegarder automatiquement les données critiques avant les mises à jour
# Usage: ./meeshy-auto-backup.sh [BACKUP_DIR]

set -e

# Couleurs pour les logs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Fonctions utilitaires
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
BACKUP_BASE_DIR="${1:-$PROJECT_ROOT/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$BACKUP_BASE_DIR/pre-update-$TIMESTAMP"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}💾 MEESHY - BACKUP AUTOMATIQUE${NC}"
    echo "================================"
    echo ""
    echo "Usage: $0 [BACKUP_DIR]"
    echo ""
    echo "Description:"
    echo "  Sauvegarde automatique des données critiques avant mise à jour:"
    echo "  • Volumes Docker (uploads gateway, Redis data)"
    echo "  • Base de données MongoDB"
    echo "  • Configuration Redis (cache de traductions)"
    echo ""
    echo "Arguments:"
    echo "  BACKUP_DIR    Répertoire de sauvegarde (défaut: ./backups)"
    echo ""
    echo "Exemples:"
    echo "  $0"
    echo "  $0 /opt/meeshy/backups"
    echo ""
}

# Créer le répertoire de backup
create_backup_directory() {
    log_info "Création du répertoire de backup: $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"
    mkdir -p "$BACKUP_DIR/volumes"
    mkdir -p "$BACKUP_DIR/database"
    mkdir -p "$BACKUP_DIR/redis"
    mkdir -p "$BACKUP_DIR/config"
    log_success "Répertoire créé"
}

# Backup des volumes Docker
backup_docker_volumes() {
    log_info "Backup des volumes Docker..."
    
    # Volume uploads de la gateway
    if docker volume inspect meeshy_gateway_uploads > /dev/null 2>&1; then
        log_info "Backup du volume gateway_uploads..."
        docker run --rm \
            -v meeshy_gateway_uploads:/source:ro \
            -v "$BACKUP_DIR/volumes":/backup \
            alpine tar czf /backup/gateway_uploads.tar.gz -C /source .
        log_success "Volume gateway_uploads sauvegardé"
    else
        log_warning "Volume gateway_uploads non trouvé"
    fi
    
    # Volume Redis data
    if docker volume inspect meeshy_redis_data > /dev/null 2>&1; then
        log_info "Backup du volume redis_data..."
        docker run --rm \
            -v meeshy_redis_data:/source:ro \
            -v "$BACKUP_DIR/volumes":/backup \
            alpine tar czf /backup/redis_data.tar.gz -C /source .
        log_success "Volume redis_data sauvegardé"
    else
        log_warning "Volume redis_data non trouvé"
    fi
    
    # Volume translator models
    if docker volume inspect meeshy_translator_models > /dev/null 2>&1; then
        log_info "Backup du volume translator_models..."
        docker run --rm \
            -v meeshy_translator_models:/source:ro \
            -v "$BACKUP_DIR/volumes":/backup \
            alpine tar czf /backup/translator_models.tar.gz -C /source .
        log_success "Volume translator_models sauvegardé"
    else
        log_warning "Volume translator_models non trouvé"
    fi
}

# Backup de la base de données MongoDB
backup_mongodb() {
    log_info "Backup de MongoDB..."
    
    if docker ps | grep -q meeshy-database; then
        docker exec meeshy-database mongodump --out /tmp/backup_$TIMESTAMP
        docker cp meeshy-database:/tmp/backup_$TIMESTAMP "$BACKUP_DIR/database/mongodb_$TIMESTAMP"
        docker exec meeshy-database rm -rf /tmp/backup_$TIMESTAMP
        log_success "MongoDB sauvegardé"
    else
        log_warning "Conteneur MongoDB non trouvé"
    fi
}

# Backup Redis (dump.rdb)
backup_redis() {
    log_info "Backup de Redis..."
    
    if docker ps | grep -q meeshy-redis; then
        # Forcer une sauvegarde Redis
        docker exec meeshy-redis redis-cli BGSAVE 2>/dev/null || log_warning "Impossible d'exécuter BGSAVE"
        sleep 5
        
        # Copier le dump.rdb
        if docker exec meeshy-redis test -f /data/dump.rdb; then
            docker cp meeshy-redis:/data/dump.rdb "$BACKUP_DIR/redis/redis_dump_$TIMESTAMP.rdb"
            log_success "Redis dump.rdb sauvegardé"
        else
            log_warning "Fichier dump.rdb non trouvé"
        fi
    else
        log_warning "Conteneur Redis non trouvé"
    fi
}

# Backup de la configuration
backup_configuration() {
    log_info "Backup de la configuration..."
    
    # Copier les fichiers de configuration principaux
    if [ -f "$PROJECT_ROOT/docker-compose.yml" ]; then
        cp "$PROJECT_ROOT/docker-compose.yml" "$BACKUP_DIR/config/"
        log_success "docker-compose.yml sauvegardé"
    fi
    
    if [ -f "$PROJECT_ROOT/.env" ]; then
        cp "$PROJECT_ROOT/.env" "$BACKUP_DIR/config/"
        log_success ".env sauvegardé"
    fi
    
    if [ -f "$PROJECT_ROOT/env.production" ]; then
        cp "$PROJECT_ROOT/env.production" "$BACKUP_DIR/config/"
        log_success "env.production sauvegardé"
    fi
}

# Créer un fichier de métadonnées
create_metadata() {
    log_info "Création du fichier de métadonnées..."
    
    cat > "$BACKUP_DIR/backup-metadata.txt" << EOF
=== MEESHY BACKUP METADATA ===
Date: $(date)
Timestamp: $TIMESTAMP
Backup Directory: $BACKUP_DIR

=== CONTENEURS ===
$(docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}")

=== VOLUMES ===
$(docker volume ls | grep meeshy)

=== TAILLES ===
$(du -sh "$BACKUP_DIR"/* 2>/dev/null)

=== IMAGES ===
$(docker images | grep meeshy)
EOF
    
    log_success "Métadonnées créées"
}

# Compresser le backup
compress_backup() {
    log_info "Compression du backup..."
    
    cd "$BACKUP_BASE_DIR"
    tar czf "pre-update-$TIMESTAMP.tar.gz" "pre-update-$TIMESTAMP"
    
    local backup_size=$(du -sh "pre-update-$TIMESTAMP.tar.gz" | cut -f1)
    log_success "Backup compressé: pre-update-$TIMESTAMP.tar.gz ($backup_size)"
}

# Nettoyer les anciens backups (garder les 3 derniers)
cleanup_old_backups() {
    log_info "Nettoyage des anciens backups..."
    
    cd "$BACKUP_BASE_DIR"
    
    # Compter les backups
    local backup_count=$(ls -1 pre-update-*.tar.gz 2>/dev/null | wc -l)
    
    if [ "$backup_count" -gt 3 ]; then
        log_info "Suppression des backups les plus anciens (conservation des 3 derniers)..."
        ls -1t pre-update-*.tar.gz | tail -n +4 | xargs rm -f
        log_success "Anciens backups supprimés"
    else
        log_info "Nombre de backups: $backup_count (pas de nettoyage nécessaire)"
    fi
}

# Fonction principale
main() {
    echo ""
    log_info "🚀 Démarrage du backup automatique avant mise à jour"
    echo ""
    
    # Créer le répertoire de backup
    create_backup_directory
    
    # Effectuer les backups
    backup_docker_volumes
    backup_mongodb
    backup_redis
    backup_configuration
    
    # Créer les métadonnées
    create_metadata
    
    # Compresser le backup
    compress_backup
    
    # Nettoyer les anciens backups
    cleanup_old_backups
    
    echo ""
    log_success "✅ Backup automatique terminé avec succès"
    log_info "📁 Emplacement: $BACKUP_BASE_DIR/pre-update-$TIMESTAMP.tar.gz"
    log_info "📊 Taille: $(du -sh "$BACKUP_BASE_DIR/pre-update-$TIMESTAMP.tar.gz" | cut -f1)"
    echo ""
    
    # Supprimer le répertoire non compressé
    rm -rf "$BACKUP_DIR"
}

# Exécuter la fonction principale si le script est appelé directement
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
        show_help
        exit 0
    fi
    
    main "$@"
fi

