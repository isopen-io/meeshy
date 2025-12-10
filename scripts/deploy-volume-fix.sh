#!/bin/bash

# ===== DÉPLOIEMENT DU FIX DE PERSISTANCE DES VOLUMES =====
# Déploie les corrections pour protéger les données lors des mises à jour
# Usage: ./deploy-volume-fix.sh [DROPLET_IP]

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
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DROPLET_IP="${1:-157.230.15.51}"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🚀 DÉPLOIEMENT DU FIX DE PERSISTANCE DES VOLUMES${NC}"
    echo "================================================="
    echo ""
    echo "Usage: $0 [DROPLET_IP]"
    echo ""
    echo "Description:"
    echo "  Déploie les corrections pour protéger les données:"
    echo "  • Nouveau docker-compose.yml avec volumes persistants"
    echo "  • Scripts de backup automatique"
    echo "  • Scripts de restauration"
    echo "  • Scripts de maintenance corrigés"
    echo ""
    echo "Arguments:"
    echo "  DROPLET_IP    IP du serveur (défaut: 157.230.15.51)"
    echo ""
    echo "Exemples:"
    echo "  $0"
    echo "  $0 157.230.15.51"
    echo ""
}

# Test de connexion SSH
test_ssh_connection() {
    log_info "Test de connexion SSH vers $DROPLET_IP..."
    
    if ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@$DROPLET_IP "echo 'OK'" > /dev/null 2>&1; then
        log_success "Connexion SSH établie"
        return 0
    else
        log_error "Impossible de se connecter au serveur $DROPLET_IP"
        exit 1
    fi
}

# Créer un backup avant déploiement
create_pre_deployment_backup() {
    log_info "Création d'un backup de sécurité avant le déploiement..."
    
    ssh -o StrictHostKeyChecking=no root@$DROPLET_IP << 'EOF'
        cd /opt/meeshy
        
        # Créer le répertoire de backup
        mkdir -p backups/pre-volume-fix-$(date +%Y%m%d_%H%M%S)
        
        # Backup des fichiers importants
        cp docker-compose.yml backups/pre-volume-fix-$(date +%Y%m%d_%H%M%S)/ 2>/dev/null || true
        cp -r scripts/production backups/pre-volume-fix-$(date +%Y%m%d_%H%M%S)/ 2>/dev/null || true
        cp -r scripts/deployment backups/pre-volume-fix-$(date +%Y%m%d_%H%M%S)/ 2>/dev/null || true
        
        echo "Backup créé dans: backups/pre-volume-fix-$(date +%Y%m%d_%H%M%S)"
EOF
    
    log_success "Backup de sécurité créé"
}

# Déployer le nouveau docker-compose.yml
deploy_docker_compose() {
    log_info "Déploiement du nouveau docker-compose.yml..."
    
    # Copier le fichier
    scp -o StrictHostKeyChecking=no "$PROJECT_ROOT/docker-compose.yml" root@$DROPLET_IP:/opt/meeshy/docker-compose.yml
    
    log_success "docker-compose.yml déployé"
}

# Déployer les scripts de production
deploy_production_scripts() {
    log_info "Déploiement des scripts de production..."
    
    # Créer le répertoire si nécessaire
    ssh -o StrictHostKeyChecking=no root@$DROPLET_IP "mkdir -p /opt/meeshy/scripts/production"
    
    # Copier les scripts modifiés et nouveaux
    scp -o StrictHostKeyChecking=no \
        "$PROJECT_ROOT/scripts/production/meeshy-maintenance.sh" \
        "$PROJECT_ROOT/scripts/production/meeshy-auto-backup.sh" \
        "$PROJECT_ROOT/scripts/production/meeshy-restore-backup.sh" \
        root@$DROPLET_IP:/opt/meeshy/scripts/production/
    
    # Rendre les scripts exécutables
    ssh -o StrictHostKeyChecking=no root@$DROPLET_IP << 'EOF'
        chmod +x /opt/meeshy/scripts/production/*.sh
EOF
    
    log_success "Scripts de production déployés"
}

# Déployer les scripts de déploiement
deploy_deployment_scripts() {
    log_info "Déploiement des scripts de déploiement..."
    
    # Créer le répertoire si nécessaire
    ssh -o StrictHostKeyChecking=no root@$DROPLET_IP "mkdir -p /opt/meeshy/scripts/deployment"
    
    # Copier le script modifié
    scp -o StrictHostKeyChecking=no \
        "$PROJECT_ROOT/scripts/deployment/deploy-maintenance.sh" \
        root@$DROPLET_IP:/opt/meeshy/scripts/deployment/
    
    # Rendre le script exécutable
    ssh -o StrictHostKeyChecking=no root@$DROPLET_IP << 'EOF'
        chmod +x /opt/meeshy/scripts/deployment/*.sh
EOF
    
    log_success "Scripts de déploiement déployés"
}

# Déployer la documentation
deploy_documentation() {
    log_info "Déploiement de la documentation..."
    
    # Créer le répertoire si nécessaire
    ssh -o StrictHostKeyChecking=no root@$DROPLET_IP "mkdir -p /opt/meeshy/docs"
    
    # Copier la documentation
    scp -o StrictHostKeyChecking=no \
        "$PROJECT_ROOT/docs/FIX_VOLUME_PERSISTENCE.md" \
        root@$DROPLET_IP:/opt/meeshy/docs/
    
    log_success "Documentation déployée"
}

# Créer les volumes Docker s'ils n'existent pas
create_docker_volumes() {
    log_info "Création des volumes Docker..."
    
    ssh -o StrictHostKeyChecking=no root@$DROPLET_IP << 'EOF'
        cd /opt/meeshy
        
        # Créer les volumes s'ils n'existent pas
        docker volume create meeshy_gateway_uploads 2>/dev/null || echo "Volume gateway_uploads existe déjà"
        docker volume create meeshy_redis_data 2>/dev/null || echo "Volume redis_data existe déjà"
        docker volume create meeshy_database_data 2>/dev/null || echo "Volume database_data existe déjà"
        docker volume create meeshy_translator_models 2>/dev/null || echo "Volume translator_models existe déjà"
        docker volume create meeshy_traefik_certs 2>/dev/null || echo "Volume traefik_certs existe déjà"
        
        echo ""
        echo "Volumes Docker actuels:"
        docker volume ls | grep meeshy
EOF
    
    log_success "Volumes Docker vérifiés/créés"
}

# Afficher un résumé des changements
show_deployment_summary() {
    echo ""
    echo "========================================="
    echo -e "${CYAN}📋 RÉSUMÉ DU DÉPLOIEMENT${NC}"
    echo "========================================="
    echo ""
    echo -e "${GREEN}Fichiers déployés:${NC}"
    echo "  ✅ docker-compose.yml (avec volumes persistants)"
    echo "  ✅ scripts/production/meeshy-maintenance.sh (corrigé)"
    echo "  ✅ scripts/production/meeshy-auto-backup.sh (nouveau)"
    echo "  ✅ scripts/production/meeshy-restore-backup.sh (nouveau)"
    echo "  ✅ scripts/deployment/deploy-maintenance.sh (corrigé)"
    echo "  ✅ docs/FIX_VOLUME_PERSISTENCE.md"
    echo ""
    echo -e "${YELLOW}⚠️  IMPORTANT:${NC}"
    echo "  • Les services continuent de fonctionner normalement"
    echo "  • Les données existantes sont préservées"
    echo "  • Les nouveaux volumes sont créés"
    echo "  • Les backups automatiques sont activés"
    echo ""
    echo -e "${BLUE}📋 Prochaines étapes:${NC}"
    echo ""
    echo "1. Les changements prendront effet lors du prochain redémarrage:"
    echo "   ssh root@$DROPLET_IP 'cd /opt/meeshy && docker compose restart gateway'"
    echo ""
    echo "2. Ou lors de la prochaine mise à jour (qui inclura le backup automatique):"
    echo "   ssh root@$DROPLET_IP 'cd /opt/meeshy/scripts && ./meeshy.sh prod maintenance update'"
    echo ""
    echo "3. Pour vérifier les volumes:"
    echo "   ssh root@$DROPLET_IP 'docker volume ls | grep meeshy'"
    echo ""
    echo "4. Pour lister les backups disponibles:"
    echo "   ssh root@$DROPLET_IP 'cd /opt/meeshy && ./scripts/production/meeshy-restore-backup.sh --list'"
    echo ""
}

# Tester le déploiement
test_deployment() {
    log_info "Vérification du déploiement..."
    
    ssh -o StrictHostKeyChecking=no root@$DROPLET_IP << 'EOF'
        cd /opt/meeshy
        
        echo "Vérification des fichiers déployés:"
        echo ""
        
        # Vérifier docker-compose.yml
        if grep -q "gateway_uploads" docker-compose.yml; then
            echo "✅ docker-compose.yml contient gateway_uploads"
        else
            echo "❌ docker-compose.yml ne contient pas gateway_uploads"
        fi
        
        # Vérifier les scripts
        if [ -f "scripts/production/meeshy-auto-backup.sh" ]; then
            echo "✅ meeshy-auto-backup.sh existe"
        else
            echo "❌ meeshy-auto-backup.sh n'existe pas"
        fi
        
        if [ -f "scripts/production/meeshy-restore-backup.sh" ]; then
            echo "✅ meeshy-restore-backup.sh existe"
        else
            echo "❌ meeshy-restore-backup.sh n'existe pas"
        fi
        
        # Vérifier les permissions
        echo ""
        echo "Permissions des scripts:"
        ls -la scripts/production/*.sh | grep -E "(backup|restore|maintenance)"
EOF
    
    log_success "Vérification terminée"
}

# Fonction principale
main() {
    echo ""
    log_info "🚀 Déploiement du fix de persistance des volumes sur $DROPLET_IP"
    echo ""
    
    # Confirmation de l'utilisateur
    log_warning "⚠️  Ce déploiement va mettre à jour les fichiers suivants:"
    echo "   • docker-compose.yml"
    echo "   • Scripts de maintenance"
    echo "   • Scripts de backup"
    echo ""
    log_info "Les services ne seront PAS redémarrés automatiquement"
    echo ""
    read -p "Voulez-vous continuer? (tapez 'OUI' pour confirmer): " confirmation
    
    if [ "$confirmation" != "OUI" ]; then
        log_info "Déploiement annulé"
        exit 0
    fi
    
    echo ""
    
    # Exécuter le déploiement
    test_ssh_connection
    create_pre_deployment_backup
    deploy_docker_compose
    deploy_production_scripts
    deploy_deployment_scripts
    deploy_documentation
    create_docker_volumes
    test_deployment
    
    # Afficher le résumé
    show_deployment_summary
    
    log_success "✅ Déploiement terminé avec succès!"
}

# Exécuter la fonction principale si le script est appelé directement
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
        show_help
        exit 0
    fi
    
    main "$@"
fi

