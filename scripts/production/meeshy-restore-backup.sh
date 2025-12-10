#!/bin/bash

# ===== MEESHY - RESTAURATION DE BACKUP =====
# Script pour restaurer un backup créé par meeshy-auto-backup.sh
# Usage: ./meeshy-restore-backup.sh [BACKUP_FILE]

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
RESTORE_TEMP_DIR="/tmp/meeshy-restore-$(date +%s)"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🔄 MEESHY - RESTAURATION DE BACKUP${NC}"
    echo "===================================="
    echo ""
    echo "Usage: $0 [BACKUP_FILE]"
    echo ""
    echo "Description:"
    echo "  Restaure un backup créé par meeshy-auto-backup.sh"
    echo "  • Volumes Docker (uploads gateway, Redis data)"
    echo "  • Base de données MongoDB"
    echo "  • Configuration Redis"
    echo ""
    echo "Arguments:"
    echo "  BACKUP_FILE   Fichier de backup à restaurer (.tar.gz)"
    echo ""
    echo "Exemples:"
    echo "  $0 ./backups/pre-update-20241017_143022.tar.gz"
    echo "  $0 /opt/meeshy/backups/pre-update-20251017_143022.tar.gz"
    echo ""
}

# Lister les backups disponibles
list_backups() {
    local backup_dir="$PROJECT_ROOT/backups"
    
    log_info "Backups disponibles dans $backup_dir:"
    echo ""
    
    if [ -d "$backup_dir" ]; then
        ls -lh "$backup_dir"/pre-update-*.tar.gz 2>/dev/null | awk '{print "  • " $9 " (" $5 ") - " $6 " " $7 " " $8}' || {
            log_warning "Aucun backup trouvé"
        }
    else
        log_warning "Répertoire de backup non trouvé: $backup_dir"
    fi
    
    echo ""
}

# Extraire le backup
extract_backup() {
    local backup_file="$1"
    
    log_info "Extraction du backup..."
    
    mkdir -p "$RESTORE_TEMP_DIR"
    tar xzf "$backup_file" -C "$RESTORE_TEMP_DIR" --strip-components=1
    
    log_success "Backup extrait dans $RESTORE_TEMP_DIR"
}

# Restaurer les volumes Docker
restore_docker_volumes() {
    log_info "Restauration des volumes Docker..."
    
    # Restaurer gateway_uploads
    if [ -f "$RESTORE_TEMP_DIR/volumes/gateway_uploads.tar.gz" ]; then
        log_info "Restauration du volume gateway_uploads..."
        
        # Créer le volume s'il n'existe pas
        docker volume create meeshy_gateway_uploads 2>/dev/null || true
        
        # Restaurer les données
        docker run --rm \
            -v meeshy_gateway_uploads:/target \
            -v "$RESTORE_TEMP_DIR/volumes":/backup:ro \
            alpine sh -c "cd /target && tar xzf /backup/gateway_uploads.tar.gz"
        
        log_success "Volume gateway_uploads restauré"
    else
        log_warning "Backup du volume gateway_uploads non trouvé"
    fi
    
    # Restaurer redis_data
    if [ -f "$RESTORE_TEMP_DIR/volumes/redis_data.tar.gz" ]; then
        log_info "Restauration du volume redis_data..."
        
        # Créer le volume s'il n'existe pas
        docker volume create meeshy_redis_data 2>/dev/null || true
        
        # Arrêter Redis temporairement
        docker stop meeshy-redis 2>/dev/null || log_warning "Redis non démarré"
        
        # Restaurer les données
        docker run --rm \
            -v meeshy_redis_data:/target \
            -v "$RESTORE_TEMP_DIR/volumes":/backup:ro \
            alpine sh -c "cd /target && tar xzf /backup/redis_data.tar.gz"
        
        # Redémarrer Redis
        docker start meeshy-redis 2>/dev/null || log_warning "Impossible de redémarrer Redis"
        
        log_success "Volume redis_data restauré"
    else
        log_warning "Backup du volume redis_data non trouvé"
    fi
    
    # Restaurer translator_models
    if [ -f "$RESTORE_TEMP_DIR/volumes/translator_models.tar.gz" ]; then
        log_info "Restauration du volume translator_models..."
        
        # Créer le volume s'il n'existe pas
        docker volume create meeshy_translator_models 2>/dev/null || true
        
        # Restaurer les données
        docker run --rm \
            -v meeshy_translator_models:/target \
            -v "$RESTORE_TEMP_DIR/volumes":/backup:ro \
            alpine sh -c "cd /target && tar xzf /backup/translator_models.tar.gz"
        
        log_success "Volume translator_models restauré"
    else
        log_warning "Backup du volume translator_models non trouvé"
    fi
}

# Restaurer MongoDB
restore_mongodb() {
    log_info "Restauration de MongoDB..."
    
    # Trouver le répertoire de backup MongoDB
    local mongodb_backup=$(find "$RESTORE_TEMP_DIR/database" -type d -name "mongodb_*" | head -n 1)
    
    if [ -n "$mongodb_backup" ]; then
        if docker ps | grep -q meeshy-database; then
            docker cp "$mongodb_backup" meeshy-database:/tmp/restore
            docker exec meeshy-database mongorestore --drop /tmp/restore
            docker exec meeshy-database rm -rf /tmp/restore
            log_success "MongoDB restauré"
        else
            log_error "Conteneur MongoDB non démarré"
        fi
    else
        log_warning "Backup MongoDB non trouvé"
    fi
}

# Restaurer Redis dump
restore_redis_dump() {
    log_info "Restauration du dump Redis..."
    
    # Trouver le fichier dump.rdb
    local redis_dump=$(find "$RESTORE_TEMP_DIR/redis" -name "redis_dump_*.rdb" | head -n 1)
    
    if [ -n "$redis_dump" ]; then
        if docker ps | grep -q meeshy-redis; then
            # Arrêter Redis
            docker stop meeshy-redis
            
            # Copier le dump
            docker cp "$redis_dump" meeshy-redis:/data/dump.rdb
            
            # Redémarrer Redis
            docker start meeshy-redis
            
            log_success "Dump Redis restauré"
        else
            log_error "Conteneur Redis non démarré"
        fi
    else
        log_warning "Backup dump Redis non trouvé"
    fi
}

# Afficher les informations de restauration
show_restore_info() {
    log_info "Informations de restauration:"
    
    if [ -f "$RESTORE_TEMP_DIR/backup-metadata.txt" ]; then
        echo ""
        cat "$RESTORE_TEMP_DIR/backup-metadata.txt"
        echo ""
    fi
}

# Nettoyer les fichiers temporaires
cleanup() {
    log_info "Nettoyage des fichiers temporaires..."
    rm -rf "$RESTORE_TEMP_DIR"
    log_success "Nettoyage terminé"
}

# Fonction principale
main() {
    local backup_file="$1"
    
    echo ""
    log_info "🚀 Restauration de backup Meeshy"
    echo ""
    
    # Vérifier les arguments
    if [ -z "$backup_file" ]; then
        log_error "Fichier de backup manquant"
        echo ""
        list_backups
        echo ""
        show_help
        exit 1
    fi
    
    # Vérifier que le fichier existe
    if [ ! -f "$backup_file" ]; then
        log_error "Fichier de backup non trouvé: $backup_file"
        echo ""
        list_backups
        exit 1
    fi
    
    # Confirmation de l'utilisateur
    log_warning "⚠️  ATTENTION: Cette opération va restaurer les données depuis le backup"
    log_warning "⚠️  Les données actuelles seront écrasées"
    echo ""
    read -p "Voulez-vous continuer? (tapez 'OUI' pour confirmer): " confirmation
    
    if [ "$confirmation" != "OUI" ]; then
        log_info "Restauration annulée"
        exit 0
    fi
    
    echo ""
    
    # Extraire le backup
    extract_backup "$backup_file"
    
    # Afficher les informations
    show_restore_info
    
    # Restaurer les composants
    restore_docker_volumes
    restore_mongodb
    restore_redis_dump
    
    # Nettoyer
    cleanup
    
    echo ""
    log_success "✅ Restauration terminée avec succès"
    log_info "ℹ️  Redémarrez les services pour appliquer les changements:"
    log_info "   cd $PROJECT_ROOT && docker-compose restart"
    echo ""
}

# Exécuter la fonction principale si le script est appelé directement
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
        show_help
        exit 0
    fi
    
    if [ "$1" = "--list" ]; then
        list_backups
        exit 0
    fi
    
    main "$@"
fi

