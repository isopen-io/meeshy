#!/bin/bash

# ===== MEESHY - MISE À JOUR PRISMA SCHEMA EN PRODUCTION =====
# Script pour mettre à jour le schema Prisma et régénérer les clients
# Usage: ./deploy-prisma-update.sh [DROPLET_IP]

set -e

# Charger la configuration de déploiement
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

# Variables
DROPLET_IP="${1:-157.230.15.51}"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
DEPLOY_DIR="/opt/meeshy"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🔄 MEESHY - MISE À JOUR PRISMA SCHEMA${NC}"
    echo "=========================================="
    echo ""
    echo "Usage:"
    echo "  ./deploy-prisma-update.sh [DROPLET_IP]"
    echo ""
    echo "Description:"
    echo "  Met à jour le schema Prisma sur le serveur de production et régénère les clients."
    echo "  Pour MongoDB, cela ne crée pas de migration mais met à jour le client Prisma."
    echo ""
    echo "Exemples:"
    echo "  ./deploy-prisma-update.sh 157.230.15.51"
    echo "  ./deploy-prisma-update.sh"
    echo ""
}

# Fonction de mise à jour Prisma
update_prisma_schema() {
    log_info "🔄 Mise à jour du schema Prisma sur le serveur de production"
    
    # Étape 1: Vérifier que le schema existe localement
    if [ ! -f "$PROJECT_ROOT/shared/schema.prisma" ]; then
        log_error "❌ Schema Prisma non trouvé: $PROJECT_ROOT/shared/schema.prisma"
        exit 1
    fi
    
    log_success "✅ Schema Prisma trouvé localement"
    
    # Étape 2: Copier le nouveau schema sur le serveur
    log_info "📤 Copie du schema Prisma sur le serveur..."
    
    # Créer une sauvegarde du schema actuel
    ssh -o StrictHostKeyChecking=no root@$DROPLET_IP \
        "cp $DEPLOY_DIR/shared/schema.prisma $DEPLOY_DIR/shared/schema.prisma.backup-\$(date +%Y%m%d-%H%M%S)"
    
    # Copier le nouveau schema vers le répertoire shared
    scp -o StrictHostKeyChecking=no \
        "$PROJECT_ROOT/shared/schema.prisma" \
        "root@$DROPLET_IP:$DEPLOY_DIR/shared/schema.prisma"
    
    log_success "✅ Schema Prisma copié sur le serveur"
    
    # Étape 3: Pull les dernières images Docker avec le nouveau schema
    log_info "📥 Pull des dernières images Docker..."
    
    ssh -o StrictHostKeyChecking=no root@$DROPLET_IP << 'EOF'
cd /opt/meeshy
docker compose pull meeshy-gateway meeshy-translator
EOF
    
    if [ $? -eq 0 ]; then
        log_success "✅ Images Docker mises à jour"
    else
        log_warning "⚠️  Erreur lors du pull des images"
    fi
    
    # Étape 4: Redémarrer les services pour appliquer les changements
    log_info "🔄 Redémarrage des services..."
    
    ssh -o StrictHostKeyChecking=no root@$DROPLET_IP << 'EOF'
cd /opt/meeshy
docker compose up -d --force-recreate meeshy-gateway meeshy-translator
EOF
    
    if [ $? -eq 0 ]; then
        log_success "✅ Services redémarrés avec succès"
    else
        log_error "❌ Erreur lors du redémarrage des services"
        exit 1
    fi
    
    # Étape 5: Vérifier que les services sont bien démarrés
    log_info "🔍 Vérification de l'état des services..."
    sleep 5
    
    ssh -o StrictHostKeyChecking=no root@$DROPLET_IP << 'EOF'
cd /opt/meeshy
docker compose ps | grep -E "meeshy-gateway|meeshy-translator"
EOF
    
    log_success "✅ Mise à jour Prisma terminée avec succès!"
    echo ""
    log_info "📝 Prochaines étapes recommandées:"
    echo "  1. Vérifier les logs: ssh root@$DROPLET_IP 'cd /opt/meeshy && docker compose logs -f meeshy-gateway'"
    echo "  2. Tester l'API: curl https://meeshy.me/health"
    echo "  3. Vérifier le fonctionnement de l'application"
}

# Fonction de mise à jour avec rebuild complet (si nécessaire)
update_with_rebuild() {
    log_info "🔨 Mise à jour avec rebuild complet des conteneurs"
    
    # Étape 1: Créer une sauvegarde du schema actuel
    log_info "� Création d'une sauvegarde du schema actuel..."
    
    ssh -o StrictHostKeyChecking=no root@$DROPLET_IP \
        "cp $DEPLOY_DIR/shared/schema.prisma $DEPLOY_DIR/shared/schema.prisma.backup-\$(date +%Y%m%d-%H%M%S)"
    
    log_success "✅ Sauvegarde créée"
    
    # Étape 2: Copier le nouveau schema
    log_info "📤 Copie du nouveau schema Prisma..."
    
    scp -o StrictHostKeyChecking=no \
        "$PROJECT_ROOT/shared/schema.prisma" \
        "root@$DROPLET_IP:$DEPLOY_DIR/shared/schema.prisma"
    
    log_success "✅ Nouveau schema copié"
    
    # Étape 3: Pull les dernières images depuis Docker Hub
    log_info "� Pull des dernières images Docker..."
    
    ssh -o StrictHostKeyChecking=no root@$DROPLET_IP << 'EOF'
cd /opt/meeshy
docker compose pull meeshy-gateway meeshy-translator
EOF
    
    if [ $? -eq 0 ]; then
        log_success "✅ Images Docker mises à jour"
    else
        log_warning "⚠️  Impossible de pull les images (elles seront reconstruites localement)"
    fi
    
    # Étape 4: Redémarrer les services avec les nouvelles images
    log_info "🔄 Redémarrage des services..."
    
    ssh -o StrictHostKeyChecking=no root@$DROPLET_IP << 'EOF'
cd /opt/meeshy
docker compose up -d --force-recreate meeshy-gateway meeshy-translator
EOF
    
    if [ $? -eq 0 ]; then
        log_success "✅ Services redémarrés avec les nouvelles images"
    else
        log_error "❌ Erreur lors du redémarrage des services"
        exit 1
    fi
    
    # Étape 5: Attendre que les services soient prêts
    log_info "⏳ Attente du démarrage des services..."
    sleep 10
    
    # Étape 6: Vérifier l'état des services
    log_info "🔍 Vérification de l'état des services..."
    
    ssh -o StrictHostKeyChecking=no root@$DROPLET_IP << 'EOF'
cd /opt/meeshy
docker compose ps meeshy-gateway meeshy-translator
EOF
    
    log_success "✅ Mise à jour complète terminée!"
}

# Fonction principale
main() {
    # Initialiser la traçabilité
    init_deploy_tracing "deploy-prisma-update" "update_prisma_schema"
    
    log_info "🚀 Début de la mise à jour Prisma sur $DROPLET_IP"
    echo ""
    
    # Afficher les options
    echo -e "${CYAN}Options de mise à jour:${NC}"
    echo "  1. Mise à jour simple (régénération des clients)"
    echo "  2. Mise à jour avec rebuild (reconstruction des images)"
    echo "  3. Annuler"
    echo ""
    
    read -p "Choisissez une option (1-3): " choice
    
    case $choice in
        1)
            update_prisma_schema
            ;;
        2)
            update_with_rebuild
            ;;
        3)
            log_info "Opération annulée"
            exit 0
            ;;
        *)
            log_error "Option invalide"
            exit 1
            ;;
    esac
    
    echo ""
    log_success "🎉 Mise à jour Prisma terminée avec succès!"
    trace_deploy_operation "update_prisma_schema" "COMPLETED" "Prisma schema updated successfully on $DROPLET_IP"
}

# Vérifier les arguments
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_help
    exit 0
fi

# Exécuter
main
