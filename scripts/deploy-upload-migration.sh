#!/bin/bash
# Script de déploiement de la nouvelle configuration uploads en production
# Ce script effectue une migration sécurisée sans perte de données
# Usage: ./scripts/deploy-upload-migration.sh [SERVER_IP]

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
Usage: $0 [SERVER_IP]

Arguments:
    SERVER_IP   IP du serveur de production (optionnel, utilise DROPLET_IP si non fourni)

Description:
    Ce script effectue une migration sécurisée de la configuration uploads
    vers le nouveau chemin /u en production.
    
    Étapes:
    1. Sauvegarde de la configuration actuelle
    2. Migration des fichiers existants vers /u
    3. Mise à jour de docker-compose.traefik.yml
    4. Redéploiement des services
    5. Vérification du fonctionnement

Examples:
    $0                          # Utilise DROPLET_IP depuis .env
    $0 123.45.67.89            # Utilise l'IP fournie
EOF
}

# Charger les variables d'environnement
load_env() {
    if [ -f "secrets/production-secrets.env" ]; then
        log_info "Chargement des secrets de production..."
        set -a
        source secrets/production-secrets.env 2>/dev/null || true
        set +a
    elif [ -f "env.production" ]; then
        log_info "Chargement de env.production..."
        set -a
        source env.production 2>/dev/null || true
        set +a
    else
        log_warning "Aucun fichier de configuration trouvé"
    fi
}

# Fonction de sauvegarde de la configuration actuelle
backup_config() {
    local server_ip="$1"
    local backup_dir="backups/upload-migration-$(date +%Y%m%d-%H%M%S)"
    
    log_info "Sauvegarde de la configuration actuelle..."
    mkdir -p "$backup_dir"
    
    # Sauvegarder le docker-compose actuel du serveur
    ssh -o StrictHostKeyChecking=no root@"$server_ip" \
        "cat /opt/meeshy/docker-compose.yml" > "$backup_dir/docker-compose.yml.backup" || true
    
    # Sauvegarder le .env actuel du serveur
    ssh -o StrictHostKeyChecking=no root@"$server_ip" \
        "cat /opt/meeshy/.env" > "$backup_dir/.env.backup" || true
    
    log_success "Configuration sauvegardée dans $backup_dir"
    echo "$backup_dir"
}

# Fonction de migration des fichiers sur le serveur
migrate_server_files() {
    local server_ip="$1"
    
    log_info "Migration des fichiers existants vers /u sur le serveur..."
    
    ssh -o StrictHostKeyChecking=no root@"$server_ip" << 'ENDSSH'
        set -e
        
        echo "📦 Arrêt temporaire des services..."
        cd /opt/meeshy
        docker-compose -f docker-compose.yml down frontend static-files || true
        
        echo ""
        echo "🔄 Migration des fichiers dans le volume Docker..."
        
        # Créer un conteneur temporaire pour migrer les données
        docker run --rm \
            -v meeshy_frontend_uploads:/data \
            alpine:latest \
            sh -c '
                echo "📊 Contenu actuel du volume:"
                ls -la /data/ 2>/dev/null || echo "Volume vide ou nouveau"
                
                echo ""
                echo "🔄 Création de la structure /u/i..."
                mkdir -p /data/u/i
                
                # Migrer les fichiers existants de /data/i vers /data/u/i
                if [ -d "/data/i" ] && [ "$(ls -A /data/i 2>/dev/null)" ]; then
                    echo "📋 Migration des fichiers de /i vers /u/i..."
                    file_count=$(find /data/i -type f | wc -l)
                    echo "   Fichiers à migrer: $file_count"
                    
                    # Copier (pas déplacer) pour garder une sauvegarde
                    cp -r /data/i/* /data/u/i/ 2>/dev/null || true
                    
                    echo "✅ Migration effectuée"
                    echo "   Nouveaux fichiers dans /u/i: $(find /data/u/i -type f | wc -l)"
                else
                    echo "ℹ️  Aucun fichier existant dans /i (premier déploiement ou volume vide)"
                fi
                
                # Créer les sous-dossiers par année si nécessaire
                for year in 2024 2025; do
                    mkdir -p /data/u/i/$year
                done
                
                # Permissions correctes
                echo ""
                echo "🔐 Configuration des permissions..."
                chmod -R 755 /data/u
                
                echo ""
                echo "📊 Structure finale du volume:"
                du -sh /data/u/* 2>/dev/null || echo "Dossier /u vide (OK pour nouveau déploiement)"
                
                echo ""
                echo "✅ Migration terminée"
            '
        
        echo ""
        echo "✅ Migration des fichiers terminée avec succès"
ENDSSH
    
    if [ $? -eq 0 ]; then
        log_success "Fichiers migrés avec succès sur le serveur"
    else
        log_error "Erreur lors de la migration des fichiers"
        return 1
    fi
}

# Fonction de déploiement de la nouvelle configuration
deploy_new_config() {
    local server_ip="$1"
    
    log_info "Déploiement de la nouvelle configuration Docker Compose..."
    
    # Copier le nouveau docker-compose.traefik.yml
    scp -o StrictHostKeyChecking=no \
        docker-compose.traefik.yml \
        root@"$server_ip":/opt/meeshy/docker-compose.yml
    
    log_success "Configuration Docker Compose mise à jour"
    
    # Copier le fichier de configuration Nginx
    scp -o StrictHostKeyChecking=no \
        docker/nginx/static-files.conf \
        root@"$server_ip":/opt/meeshy/docker/nginx/static-files.conf
    
    log_success "Configuration Nginx mise à jour"
}

# Fonction de redémarrage des services
restart_services() {
    local server_ip="$1"
    
    log_info "Redémarrage des services avec la nouvelle configuration..."
    
    ssh -o StrictHostKeyChecking=no root@"$server_ip" << 'ENDSSH'
        set -e
        cd /opt/meeshy
        
        echo "🧹 Purge non interactive des images obsolètes (#6556)..."
        docker image prune -f || true
        docker image prune -af --filter "until=168h" || true

        echo "🔄 Pull des dernières images..."
        docker-compose pull frontend static-files 2>/dev/null || true
        
        echo ""
        echo "🚀 Redémarrage des services..."
        docker-compose up -d frontend static-files
        
        echo ""
        echo "⏳ Attente du démarrage des services..."
        sleep 10
        
        echo ""
        echo "📊 État des services:"
        docker-compose ps frontend static-files
        
        echo ""
        echo "✅ Services redémarrés"
ENDSSH
    
    if [ $? -eq 0 ]; then
        log_success "Services redémarrés avec succès"
    else
        log_error "Erreur lors du redémarrage des services"
        return 1
    fi
}

# Fonction de vérification post-déploiement
verify_deployment() {
    local server_ip="$1"
    local domain="${DOMAIN:-meeshy.me}"
    
    log_info "Vérification du déploiement..."
    
    # Vérifier que les services sont en cours d'exécution
    ssh -o StrictHostKeyChecking=no root@"$server_ip" \
        'cd /opt/meeshy && docker-compose ps --filter "status=running" frontend static-files'
    
    # Vérifier l'accès au frontend
    log_info "Test d'accès au frontend..."
    if curl -s -o /dev/null -w "%{http_code}" "https://$domain" | grep -q "200\|301\|302"; then
        log_success "Frontend accessible"
    else
        log_warning "Frontend non accessible (peut être normal si SSL en cours de configuration)"
    fi
    
    # Vérifier l'accès au serveur static
    log_info "Test d'accès au serveur static..."
    if curl -s -o /dev/null -w "%{http_code}" "https://static.$domain/health" | grep -q "200"; then
        log_success "Serveur static accessible"
    else
        log_warning "Serveur static non accessible"
    fi
    
    # Vérifier la structure du volume
    log_info "Vérification de la structure du volume..."
    ssh -o StrictHostKeyChecking=no root@"$server_ip" << 'ENDSSH'
        docker run --rm \
            -v meeshy_frontend_uploads:/data \
            alpine:latest \
            sh -c 'ls -la /data/u/i 2>/dev/null && echo "✅ Structure /u/i présente" || echo "⚠️  Structure /u/i non trouvée"'
ENDSSH
    
    log_success "Vérification terminée"
}

# Fonction principale
main() {
    local server_ip="$1"
    
    # Afficher l'aide si demandé
    if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
        show_help
        exit 0
    fi
    
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║   Déploiement Migration Uploads /u - Meeshy Production        ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    
    # Charger les variables d'environnement
    load_env
    
    # Déterminer l'IP du serveur
    if [ -z "$server_ip" ]; then
        server_ip="${DROPLET_IP}"
    fi
    
    if [ -z "$server_ip" ]; then
        log_error "IP du serveur non fournie"
        log_info "Utilisez: $0 <SERVER_IP> ou définissez DROPLET_IP dans .env"
        show_help
        exit 1
    fi
    
    log_info "Serveur cible: $server_ip"
    log_info "Domaine: ${DOMAIN:-meeshy.me}"
    
    # Confirmation
    log_warning "Cette opération va:"
    echo "  1. Sauvegarder la configuration actuelle"
    echo "  2. Migrer les fichiers existants vers /u"
    echo "  3. Mettre à jour docker-compose.yml"
    echo "  4. Redémarrer les services frontend et static-files"
    echo ""
    read -p "Voulez-vous continuer? (oui/non): " confirm
    
    if [ "$confirm" != "oui" ]; then
        log_info "Déploiement annulé"
        exit 0
    fi
    
    echo ""
    log_info "Début du déploiement..."
    echo ""
    
    # Étape 1: Sauvegarde
    backup_dir=$(backup_config "$server_ip")
    
    # Étape 2: Migration des fichiers
    migrate_server_files "$server_ip"
    
    # Étape 3: Déploiement de la nouvelle configuration
    deploy_new_config "$server_ip"
    
    # Étape 4: Redémarrage des services
    restart_services "$server_ip"
    
    # Étape 5: Vérification
    echo ""
    verify_deployment "$server_ip"
    
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║   ✅ Déploiement terminé avec succès!                         ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    
    log_info "Sauvegarde de la configuration précédente: $backup_dir"
    echo ""
    log_info "Prochaines étapes recommandées:"
    echo "  1. Vérifier l'affichage des images existantes"
    echo "  2. Tester l'upload d'une nouvelle image"
    echo "  3. Surveiller les logs: ssh root@$server_ip 'cd /opt/meeshy && docker-compose logs -f frontend static-files'"
    echo ""
    log_info "URLs à tester:"
    echo "  • Frontend: https://${DOMAIN:-meeshy.me}"
    echo "  • Static: https://static.${DOMAIN:-meeshy.me}/health"
    echo "  • Upload test: Essayez d'uploader un avatar dans les paramètres utilisateur"
}

# Exécuter le script
main "$@"

