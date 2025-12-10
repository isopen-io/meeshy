#!/bin/bash

# ===== MEESHY - DÉPLOIEMENT DES SCRIPTS DE NETTOYAGE =====
# Script pour déployer les scripts de nettoyage des fichiers et attachements orphelins
# Usage: ./deploy-cleanup-scripts.sh [DROPLET_IP]

set -e

# Charger la configuration de déploiement
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

# Initialiser la traçabilité
init_deploy_tracing "deploy-cleanup-scripts" "cleanup_scripts_deployment"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🧹 MEESHY - DÉPLOIEMENT SCRIPTS DE NETTOYAGE${NC}"
    echo "=============================================="
    echo ""
    echo "Ce script déploie les scripts de nettoyage sur le serveur de production."
    echo ""
    echo "Scripts déployés:"
    echo "  • export-attachment-paths.js     - Export des chemins d'attachements"
    echo "  • cleanup-orphan-attachments.js  - Nettoyage des attachements orphelins (DB)"
    echo "  • cleanup-orphan-files.sh        - Nettoyage des fichiers orphelins (disque)"
    echo "  • test-cleanup-system.sh         - Test du système de nettoyage"
    echo "  • CLEANUP-README.md              - Guide d'utilisation rapide"
    echo "  • CLEANUP-GUIDE.md               - Documentation complète"
    echo ""
    echo "Usage:"
    echo "  ./deploy-cleanup-scripts.sh [DROPLET_IP]"
    echo ""
    echo "Exemples:"
    echo "  ./deploy-cleanup-scripts.sh 192.168.1.100"
    echo "  ./deploy-cleanup-scripts.sh prod.meeshy.me"
    echo ""
    echo "Après le déploiement, sur le serveur:"
    echo "  cd /opt/meeshy"
    echo "  bash scripts/test-cleanup-system.sh"
    echo ""
}

# Vérifier les arguments
if [ $# -eq 0 ]; then
    show_help
    exit 1
fi

DROPLET_IP="$1"

# Vérifier que les scripts existent localement
check_local_scripts() {
    log_info "Vérification des scripts locaux..."

    local missing=0
    local scripts=(
        "scripts/export-attachment-paths.js"
        "scripts/cleanup-orphan-attachments.js"
        "scripts/cleanup-orphan-files.sh"
        "scripts/test-cleanup-system.sh"
        "scripts/CLEANUP-README.md"
        "scripts/CLEANUP-GUIDE.md"
    )

    for script in "${scripts[@]}"; do
        if [ ! -f "$script" ]; then
            log_error "Script manquant: $script"
            missing=1
        else
            log_success "Trouvé: $script"
        fi
    done

    if [ $missing -eq 1 ]; then
        log_error "Des scripts sont manquants. Vérifiez votre installation."
        exit 1
    fi

    log_success "Tous les scripts sont présents"
}

# Créer le dossier scripts sur le serveur
create_scripts_directory() {
    local ip="$1"

    log_info "Création du dossier scripts sur le serveur..."
    trace_deploy_operation "create_directory" "STARTED" "Creating scripts directory on $ip"

    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        # Créer le dossier si nécessaire
        mkdir -p /opt/meeshy/scripts

        # Vérifier la création
        if [ -d /opt/meeshy/scripts ]; then
            echo "✅ Dossier /opt/meeshy/scripts créé avec succès"
        else
            echo "❌ Échec de la création du dossier"
            exit 1
        fi
EOF

    if [ $? -eq 0 ]; then
        log_success "Dossier scripts créé"
        trace_deploy_operation "create_directory" "SUCCESS" "Scripts directory created"
    else
        log_error "Échec de la création du dossier"
        trace_deploy_operation "create_directory" "FAILED" "Failed to create directory"
        exit 1
    fi
}

# Copier les scripts sur le serveur
copy_cleanup_scripts() {
    local ip="$1"

    log_info "Copie des scripts de nettoyage..."
    trace_deploy_operation "copy_scripts" "STARTED" "Copying cleanup scripts to $ip"

    # Scripts JavaScript/MongoDB
    log_info "Copie des scripts MongoDB..."
    scp -o StrictHostKeyChecking=no \
        scripts/export-attachment-paths.js \
        scripts/cleanup-orphan-attachments.js \
        root@$ip:/opt/meeshy/scripts/

    # Scripts Shell
    log_info "Copie des scripts shell..."
    scp -o StrictHostKeyChecking=no \
        scripts/cleanup-orphan-files.sh \
        scripts/test-cleanup-system.sh \
        root@$ip:/opt/meeshy/scripts/

    # Documentation
    log_info "Copie de la documentation..."
    scp -o StrictHostKeyChecking=no \
        scripts/CLEANUP-README.md \
        scripts/CLEANUP-GUIDE.md \
        root@$ip:/opt/meeshy/scripts/

    log_success "Scripts copiés avec succès"
    trace_deploy_operation "copy_scripts" "SUCCESS" "All scripts copied"
}

# Rendre les scripts exécutables
make_scripts_executable() {
    local ip="$1"

    log_info "Configuration des permissions..."
    trace_deploy_operation "set_permissions" "STARTED" "Setting executable permissions"

    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        cd /opt/meeshy/scripts

        # Rendre les scripts shell exécutables
        chmod +x cleanup-orphan-files.sh
        chmod +x test-cleanup-system.sh

        # Vérifier les permissions
        echo "Permissions:"
        ls -lh cleanup-orphan-files.sh test-cleanup-system.sh

        echo "✅ Permissions configurées"
EOF

    if [ $? -eq 0 ]; then
        log_success "Permissions configurées"
        trace_deploy_operation "set_permissions" "SUCCESS" "Permissions set"
    else
        log_error "Échec de la configuration des permissions"
        trace_deploy_operation "set_permissions" "FAILED" "Failed to set permissions"
        exit 1
    fi
}

# Vérifier l'installation sur le serveur
verify_installation() {
    local ip="$1"

    log_info "Vérification de l'installation..."
    trace_deploy_operation "verify_install" "STARTED" "Verifying installation"

    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        cd /opt/meeshy

        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "🧹 VÉRIFICATION DES SCRIPTS DE NETTOYAGE"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""

        # Vérifier les prérequis
        echo "Prérequis:"
        if command -v mongosh &> /dev/null; then
            echo "  ✅ mongosh: $(mongosh --version | head -1)"
        else
            echo "  ❌ mongosh non installé"
        fi

        if command -v jq &> /dev/null; then
            echo "  ✅ jq: $(jq --version)"
        else
            echo "  ⚠️  jq non installé (à installer: apt-get install jq)"
        fi
        echo ""

        # Lister les scripts
        echo "Scripts installés dans /opt/meeshy/scripts:"
        ls -lh scripts/*.js scripts/*.sh scripts/*.md 2>/dev/null | grep -E '\.(js|sh|md)$' || echo "  Aucun script trouvé"
        echo ""

        # Vérifier l'exécutabilité
        echo "Scripts exécutables:"
        if [ -x scripts/cleanup-orphan-files.sh ]; then
            echo "  ✅ cleanup-orphan-files.sh"
        else
            echo "  ❌ cleanup-orphan-files.sh"
        fi

        if [ -x scripts/test-cleanup-system.sh ]; then
            echo "  ✅ test-cleanup-system.sh"
        else
            echo "  ❌ test-cleanup-system.sh"
        fi
        echo ""

        # Vérifier le dossier uploads
        if [ -d gateway/uploads/attachments ]; then
            UPLOADS_SIZE=$(du -sh gateway/uploads/attachments 2>/dev/null | cut -f1)
            FILES_COUNT=$(find gateway/uploads/attachments -type f 2>/dev/null | wc -l | tr -d ' ')
            echo "Dossier uploads:"
            echo "  📁 Chemin: gateway/uploads/attachments"
            echo "  📊 Taille: $UPLOADS_SIZE"
            echo "  📄 Fichiers: $FILES_COUNT"
        else
            echo "⚠️  Dossier uploads non trouvé"
        fi
        echo ""

        # Test de connexion MongoDB
        echo "Test connexion MongoDB:"
        if docker compose exec -T mongodb mongosh --quiet --eval "db.stats()" > /dev/null 2>&1; then
            ATTACHMENTS=$(docker compose exec -T mongodb mongosh meeshy --quiet --eval "db.MessageAttachment.countDocuments({})" 2>/dev/null)
            MESSAGES=$(docker compose exec -T mongodb mongosh meeshy --quiet --eval "db.Message.countDocuments({})" 2>/dev/null)
            echo "  ✅ MongoDB accessible"
            echo "  📨 Messages: $MESSAGES"
            echo "  📎 Attachements: $ATTACHMENTS"
        else
            echo "  ❌ MongoDB non accessible"
        fi
        echo ""

        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "Installation vérifiée!"
        echo ""
        echo "Prochaines étapes:"
        echo "  1. Installer jq si nécessaire: apt-get install jq"
        echo "  2. Tester le système: bash scripts/test-cleanup-system.sh"
        echo "  3. Consulter la doc: cat scripts/CLEANUP-README.md"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
EOF

    if [ $? -eq 0 ]; then
        log_success "Installation vérifiée"
        trace_deploy_operation "verify_install" "SUCCESS" "Installation verified"
    else
        log_error "Échec de la vérification"
        trace_deploy_operation "verify_install" "FAILED" "Verification failed"
        exit 1
    fi
}

# Installer jq si nécessaire
install_jq() {
    local ip="$1"

    log_info "Vérification et installation de jq..."
    trace_deploy_operation "install_jq" "STARTED" "Installing jq if needed"

    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        if ! command -v jq &> /dev/null; then
            echo "Installation de jq..."
            apt-get update -qq
            apt-get install -y -qq jq

            if command -v jq &> /dev/null; then
                echo "✅ jq installé: $(jq --version)"
            else
                echo "❌ Échec de l'installation de jq"
                exit 1
            fi
        else
            echo "✅ jq déjà installé: $(jq --version)"
        fi
EOF

    if [ $? -eq 0 ]; then
        log_success "jq disponible"
        trace_deploy_operation "install_jq" "SUCCESS" "jq available"
    else
        log_warn "Échec de l'installation de jq (à faire manuellement)"
        trace_deploy_operation "install_jq" "WARNING" "jq installation failed"
    fi
}

# Créer un script de nettoyage automatique mensuel
setup_monthly_cleanup() {
    local ip="$1"

    log_info "Configuration du nettoyage automatique mensuel..."
    trace_deploy_operation "setup_cron" "STARTED" "Setting up monthly cleanup"

    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        # Créer le script de nettoyage automatique
        cat > /opt/meeshy/scripts/monthly-cleanup.sh << 'SCRIPT_EOF'
#!/bin/bash
set -euo pipefail

echo "=== Nettoyage automatique Meeshy - $(date) ===" >> /opt/meeshy/logs/cleanup.log

cd /opt/meeshy

# Export des chemins
docker compose exec -T mongodb mongosh meeshy --quiet \
  --file scripts/export-attachment-paths.js > attachment-export.json 2>&1

# Extraction des chemins
cat attachment-export.json | jq -r '.paths.all[]' > valid-paths.txt

# Nettoyage des fichiers (avec --delete automatique)
echo "Nettoyage des fichiers orphelins..." >> /opt/meeshy/logs/cleanup.log
echo "y" | bash scripts/cleanup-orphan-files.sh valid-paths.txt --delete >> /opt/meeshy/logs/cleanup.log 2>&1

# Nettoyage de la DB
echo "Nettoyage des attachements orphelins en DB..." >> /opt/meeshy/logs/cleanup.log
docker compose exec -T mongodb mongosh meeshy \
  --eval "var CONFIRM_DELETE=true" \
  --file scripts/cleanup-orphan-attachments.js >> /opt/meeshy/logs/cleanup.log 2>&1

# Nettoyage
rm -f attachment-export.json valid-paths.txt

echo "=== Nettoyage terminé - $(date) ===" >> /opt/meeshy/logs/cleanup.log
SCRIPT_EOF

        chmod +x /opt/meeshy/scripts/monthly-cleanup.sh

        # Créer le dossier logs
        mkdir -p /opt/meeshy/logs

        echo "✅ Script de nettoyage automatique créé"
        echo ""
        echo "Pour activer le cron job mensuel:"
        echo "  crontab -e"
        echo "  Ajouter: 0 3 1 * * cd /opt/meeshy && bash scripts/monthly-cleanup.sh"
        echo ""
EOF

    if [ $? -eq 0 ]; then
        log_success "Nettoyage automatique configuré"
        trace_deploy_operation "setup_cron" "SUCCESS" "Automatic cleanup configured"
    else
        log_warn "Échec de la configuration du cron"
        trace_deploy_operation "setup_cron" "WARNING" "Cron setup failed"
    fi
}

# Afficher les instructions finales
show_final_instructions() {
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✅ DÉPLOIEMENT TERMINÉ AVEC SUCCÈS${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "📋 Scripts déployés dans /opt/meeshy/scripts:"
    echo "  • export-attachment-paths.js"
    echo "  • cleanup-orphan-attachments.js"
    echo "  • cleanup-orphan-files.sh"
    echo "  • test-cleanup-system.sh"
    echo "  • monthly-cleanup.sh"
    echo "  • CLEANUP-README.md"
    echo "  • CLEANUP-GUIDE.md"
    echo ""
    echo "🚀 Prochaines étapes sur le serveur:"
    echo ""
    echo "  1. Se connecter au serveur:"
    echo "     ssh root@$DROPLET_IP"
    echo ""
    echo "  2. Aller dans le dossier Meeshy:"
    echo "     cd /opt/meeshy"
    echo ""
    echo "  3. Tester le système de nettoyage:"
    echo "     bash scripts/test-cleanup-system.sh"
    echo ""
    echo "  4. Consulter la documentation:"
    echo "     cat scripts/CLEANUP-README.md"
    echo ""
    echo "  5. Configurer le nettoyage automatique mensuel (optionnel):"
    echo "     crontab -e"
    echo "     Ajouter: 0 3 1 * * cd /opt/meeshy && bash scripts/monthly-cleanup.sh"
    echo ""
    echo "📖 Documentation:"
    echo "  Guide rapide: scripts/CLEANUP-README.md"
    echo "  Guide complet: scripts/CLEANUP-GUIDE.md"
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ===== MAIN =====
main() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🧹 DÉPLOIEMENT DES SCRIPTS DE NETTOYAGE"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    log_info "Serveur cible: $DROPLET_IP"
    echo ""

    # Étape 1: Vérifier les scripts locaux
    check_local_scripts
    echo ""

    # Étape 2: Créer le dossier sur le serveur
    create_scripts_directory "$DROPLET_IP"
    echo ""

    # Étape 3: Copier les scripts
    copy_cleanup_scripts "$DROPLET_IP"
    echo ""

    # Étape 4: Configurer les permissions
    make_scripts_executable "$DROPLET_IP"
    echo ""

    # Étape 5: Installer jq
    install_jq "$DROPLET_IP"
    echo ""

    # Étape 6: Configurer le nettoyage automatique
    setup_monthly_cleanup "$DROPLET_IP"
    echo ""

    # Étape 7: Vérifier l'installation
    verify_installation "$DROPLET_IP"
    echo ""

    # Afficher les instructions finales
    show_final_instructions

    trace_deploy_operation "deploy_cleanup_complete" "SUCCESS" "Cleanup scripts deployed successfully to $DROPLET_IP"
}

# Exécuter le script
main
