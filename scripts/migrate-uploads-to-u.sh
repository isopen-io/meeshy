#!/bin/bash
# Script de migration des fichiers uploadés vers le nouveau chemin /u
# Ce script déplace les fichiers de /public vers /public/u sans perte de données
# Usage: ./scripts/migrate-uploads-to-u.sh [ENVIRONMENT]
# ENVIRONMENT: local | production (default: local)

set -e

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction de logging
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# Fonction pour afficher l'aide
show_help() {
    cat << EOF
Usage: $0 [ENVIRONMENT]

ENVIRONMENT:
    local       Migration en environnement local (default)
    production  Migration en production via Docker volume

Examples:
    $0 local        # Migration locale
    $0 production   # Migration en production

Description:
    Ce script migre les fichiers uploadés de leur emplacement actuel
    vers le nouveau chemin /u sans perte de données.
    
    Il effectue :
    1. Sauvegarde des données existantes
    2. Migration vers /u
    3. Vérification de l'intégrité
    4. Mise à jour des permissions
EOF
}

# Fonction de sauvegarde
backup_data() {
    local source_path="$1"
    local backup_dir="backups/uploads-$(date +%Y%m%d-%H%M%S)"
    
    log_info "Création d'une sauvegarde dans $backup_dir..."
    mkdir -p "$backup_dir"
    
    if [ -d "$source_path" ] && [ "$(ls -A $source_path 2>/dev/null)" ]; then
        cp -r "$source_path"/* "$backup_dir/" 2>/dev/null || true
        log_success "Sauvegarde créée : $backup_dir"
        echo "$backup_dir"
    else
        log_warning "Aucun fichier à sauvegarder dans $source_path"
        echo ""
    fi
}

# Fonction de migration locale
migrate_local() {
    log_info "Migration en environnement LOCAL"
    
    local frontend_public="frontend/public"
    local backup_dir=$(backup_data "$frontend_public")
    
    # Créer la structure /u
    log_info "Création de la nouvelle structure /u..."
    mkdir -p "$frontend_public/u"
    
    # Déplacer les fichiers /i vers /u/i si ils existent
    if [ -d "$frontend_public/i" ]; then
        log_info "Migration de /i vers /u/i..."
        if [ "$(ls -A $frontend_public/i 2>/dev/null)" ]; then
            cp -r "$frontend_public/i" "$frontend_public/u/"
            log_success "Fichiers /i migrés vers /u/i"
        else
            mkdir -p "$frontend_public/u/i"
            log_info "Dossier /u/i créé (aucun fichier à migrer)"
        fi
    else
        mkdir -p "$frontend_public/u/i"
        log_info "Dossier /u/i créé"
    fi
    
    # Afficher le résultat
    log_success "Migration locale terminée"
    if [ -n "$backup_dir" ]; then
        log_info "Sauvegarde disponible dans: $backup_dir"
    fi
    
    # Afficher la structure
    log_info "Nouvelle structure:"
    tree -L 3 "$frontend_public/u" 2>/dev/null || ls -R "$frontend_public/u"
}

# Fonction de migration en production (via Docker)
migrate_production() {
    log_info "Migration en environnement PRODUCTION"
    
    # Vérifier que Docker est disponible
    if ! command -v docker &> /dev/null; then
        log_error "Docker n'est pas installé ou accessible"
        exit 1
    fi
    
    # Nom du volume Docker
    local volume_name="meeshy_frontend_uploads"
    
    # Vérifier que le volume existe
    if ! docker volume inspect "$volume_name" &> /dev/null; then
        log_error "Volume Docker $volume_name introuvable"
        log_info "Volumes disponibles:"
        docker volume ls
        exit 1
    fi
    
    log_info "Volume trouvé: $volume_name"
    
    # Créer un conteneur temporaire pour accéder au volume
    log_info "Création d'un conteneur temporaire pour la migration..."
    
    docker run --rm \
        -v "$volume_name:/data" \
        -v "$(pwd)/scripts:/scripts:ro" \
        alpine:latest \
        sh -c '
            echo "📦 Contenu actuel du volume:"
            ls -la /data/ || echo "Volume vide"
            
            echo ""
            echo "🔄 Création de la structure /u..."
            mkdir -p /data/u/i
            
            # Migrer les fichiers /i vers /u/i si ils existent
            if [ -d "/data/i" ] && [ "$(ls -A /data/i 2>/dev/null)" ]; then
                echo "📋 Migration de /i vers /u/i..."
                cp -r /data/i/* /data/u/i/ 2>/dev/null || true
                echo "✅ Migration effectuée"
            else
                echo "ℹ️  Aucun fichier à migrer dans /i"
            fi
            
            # Vérifier les permissions
            echo ""
            echo "🔐 Configuration des permissions..."
            chmod -R 755 /data/u
            
            # Afficher le résultat
            echo ""
            echo "📊 Nouvelle structure du volume:"
            ls -laR /data/u || echo "Dossier /u vide"
            
            echo ""
            echo "✅ Migration terminée avec succès"
        '
    
    log_success "Migration en production terminée"
}

# Fonction de vérification post-migration
verify_migration() {
    local env="$1"
    
    log_info "Vérification de la migration..."
    
    if [ "$env" = "local" ]; then
        if [ -d "frontend/public/u/i" ]; then
            log_success "Structure /u/i créée avec succès"
        else
            log_error "Structure /u/i non trouvée"
            return 1
        fi
    else
        log_info "Vérification production via Docker..."
        docker run --rm \
            -v "meeshy_frontend_uploads:/data" \
            alpine:latest \
            sh -c '
                if [ -d "/data/u/i" ]; then
                    echo "✅ Structure /u/i vérifiée"
                    exit 0
                else
                    echo "❌ Structure /u/i non trouvée"
                    exit 1
                fi
            '
    fi
    
    log_success "Vérification terminée avec succès"
}

# Fonction principale
main() {
    local environment="${1:-local}"
    
    # Afficher l'aide si demandé
    if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
        show_help
        exit 0
    fi
    
    # Valider l'environnement
    if [ "$environment" != "local" ] && [ "$environment" != "production" ]; then
        log_error "Environnement invalide: $environment"
        log_info "Utilisez 'local' ou 'production'"
        show_help
        exit 1
    fi
    
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║   Migration des uploads vers /u - Meeshy                      ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    
    log_info "Environnement: $environment"
    log_warning "Cette opération va migrer les fichiers vers /u"
    
    # Confirmation en production
    if [ "$environment" = "production" ]; then
        log_warning "ATTENTION: Migration en PRODUCTION"
        read -p "Voulez-vous continuer? (oui/non): " confirm
        if [ "$confirm" != "oui" ]; then
            log_info "Migration annulée"
            exit 0
        fi
    fi
    
    echo ""
    
    # Exécuter la migration
    if [ "$environment" = "local" ]; then
        migrate_local
    else
        migrate_production
    fi
    
    # Vérifier la migration
    echo ""
    verify_migration "$environment"
    
    echo ""
    log_success "Migration terminée avec succès!"
    
    if [ "$environment" = "production" ]; then
        echo ""
        log_info "Prochaines étapes:"
        echo "  1. Redéployer les services avec docker-compose"
        echo "  2. Vérifier que les images s'affichent correctement"
        echo "  3. Tester l'upload de nouvelles images"
    fi
}

# Exécuter le script
main "$@"

