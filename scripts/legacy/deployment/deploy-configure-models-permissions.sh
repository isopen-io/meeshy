#!/bin/bash

# ===== MEESHY - CONFIGURATION DES PERMISSIONS DU DOSSIER MODELS =====
# Script spécialisé pour configurer les permissions du dossier models
# Usage: ./deploy-configure-models-permissions.sh [DROPLET_IP]

set -e

# Charger la configuration de déploiement
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

# Initialiser la traçabilité
init_deploy_tracing "deploy-configure-models-permissions" "configure_models_permissions"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🔧 MEESHY - CONFIGURATION DES PERMISSIONS DU DOSSIER MODELS${NC}"
    echo "============================================================="
    echo ""
    echo "Usage:"
    echo "  ./deploy-configure-models-permissions.sh [DROPLET_IP]"
    echo ""
    echo "Description:"
    echo "  Configure les permissions du dossier models pour permettre au container"
    echo "  meeshy-translator de télécharger, écrire et lire les modèles ML."
    echo ""
    echo "Actions effectuées:"
    echo "  • Création du volume Docker models_data"
    echo "  • Configuration des permissions (UID 42420:42420)"
    echo "  • Création des sous-dossiers nécessaires"
    echo "  • Vérification des permissions"
    echo ""
    echo "Exemples:"
    echo "  ./deploy-configure-models-permissions.sh 192.168.1.100"
    echo "  ./deploy-configure-models-permissions.sh 157.230.15.51"
    echo ""
}

# Configurer les permissions du dossier models
configure_models_permissions() {
    local ip="$1"
    
    log_info "Configuration des permissions du dossier models pour le translator sur $ip..."
    trace_deploy_operation "configure_models" "STARTED" "Configuring models directory permissions on $ip"
    
    # Configurer les permissions du dossier models
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        cd /opt/meeshy
        
        echo "🔧 Configuration des permissions du dossier models..."
        
        # Créer le volume models_data s'il n'existe pas
        if ! docker volume ls | grep -q "meeshy_models_data"; then
            echo "📦 Création du volume models_data..."
            docker volume create meeshy_models_data
            echo "✅ Volume models_data créé"
        else
            echo "✅ Volume models_data existe déjà"
        fi
        
        # Créer un conteneur temporaire pour configurer les permissions
        echo "🔧 Configuration des permissions avec un conteneur temporaire..."
        docker run --rm -v meeshy_models_data:/workspace/models \
            --user root \
            alpine:latest \
            sh -c "
                echo '📁 Création de la structure des dossiers...'
                
                # Créer le dossier models s'il n'existe pas
                mkdir -p /workspace/models
                
                # Créer les sous-dossiers nécessaires pour les modèles ML
                mkdir -p /workspace/models/models--t5-small
                mkdir -p /workspace/models/models--facebook--nllb-200-distilled-600M
                mkdir -p /workspace/models/cache
                mkdir -p /workspace/models/huggingface
                mkdir -p /workspace/models/transformers_cache
                mkdir -p /workspace/models/torch_cache
                
                echo '🔐 Configuration des permissions pour l'\''utilisateur translator (UID 42420)...'
                
                # Configurer les permissions pour l'utilisateur translator (UID 42420)
                chown -R 42420:42420 /workspace/models
                chmod -R 755 /workspace/models
                
                # Configurer les permissions sur les sous-dossiers
                chown -R 42420:42420 /workspace/models/models--t5-small
                chown -R 42420:42420 /workspace/models/models--facebook--nllb-200-distilled-600M
                chown -R 42420:42420 /workspace/models/cache
                chown -R 42420:42420 /workspace/models/huggingface
                chown -R 42420:42420 /workspace/models/transformers_cache
                chown -R 42420:42420 /workspace/models/torch_cache
                
                chmod -R 755 /workspace/models/models--t5-small
                chmod -R 755 /workspace/models/models--facebook--nllb-200-distilled-600M
                chmod -R 755 /workspace/models/cache
                chmod -R 755 /workspace/models/huggingface
                chmod -R 755 /workspace/models/transformers_cache
                chmod -R 755 /workspace/models/torch_cache
                
                echo '✅ Permissions configurées avec succès'
                
                # Afficher la structure créée
                echo '📋 Structure des dossiers créée:'
                ls -la /workspace/models
            "
        
        echo "✅ Permissions du dossier models configurées"
        
        # Vérifier les permissions
        echo "🔍 Vérification des permissions..."
        docker run --rm -v meeshy_models_data:/workspace/models \
            alpine:latest \
            sh -c "
                echo '📋 Permissions actuelles du dossier models:'
                ls -la /workspace/models
                echo ''
                echo '📋 Permissions des sous-dossiers:'
                find /workspace/models -type d -exec ls -ld {} \;
            "
        
        # Vérifier que le volume est bien monté
        echo "🔍 Vérification du volume Docker..."
        docker volume inspect meeshy_models_data
        
        echo "✅ Configuration des permissions terminée avec succès"
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Permissions du dossier models configurées avec succès sur $ip"
        trace_deploy_operation "configure_models" "SUCCESS" "Models directory permissions configured on $ip"
    else
        log_error "Échec de la configuration des permissions du dossier models sur $ip"
        trace_deploy_operation "configure_models" "FAILED" "Models directory permissions configuration failed on $ip"
        exit 1
    fi
}

# Vérifier la configuration des permissions
verify_models_permissions() {
    local ip="$1"
    
    log_info "Vérification de la configuration des permissions du dossier models..."
    trace_deploy_operation "verify_models" "STARTED" "Verifying models directory permissions on $ip"
    
    # Vérifier les permissions
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        cd /opt/meeshy
        
        echo "🔍 Vérification de la configuration des permissions..."
        
        # Vérifier que le volume existe
        if docker volume ls | grep -q "meeshy_models_data"; then
            echo "✅ Volume models_data existe"
        else
            echo "❌ Volume models_data n'existe pas"
            exit 1
        fi
        
        # Vérifier les permissions avec un conteneur
        echo "🔍 Test des permissions avec un conteneur translator simulé..."
        docker run --rm -v meeshy_models_data:/workspace/models \
            --user 42420:42420 \
            alpine:latest \
            sh -c "
                echo '🧪 Test de lecture...'
                if ls /workspace/models > /dev/null 2>&1; then
                    echo '✅ Lecture: OK'
                else
                    echo '❌ Lecture: ÉCHEC'
                    exit 1
                fi
                
                echo '🧪 Test d'\''écriture...'
                if touch /workspace/models/test_write.txt > /dev/null 2>&1; then
                    echo '✅ Écriture: OK'
                    rm -f /workspace/models/test_write.txt
                else
                    echo '❌ Écriture: ÉCHEC'
                    exit 1
                fi
                
                echo '🧪 Test de création de dossier...'
                if mkdir -p /workspace/models/test_dir > /dev/null 2>&1; then
                    echo '✅ Création de dossier: OK'
                    rmdir /workspace/models/test_dir
                else
                    echo '❌ Création de dossier: ÉCHEC'
                    exit 1
                fi
                
                echo '✅ Tous les tests de permissions ont réussi'
            "
        
        if [ $? -eq 0 ]; then
            echo "✅ Vérification des permissions réussie"
        else
            echo "❌ Vérification des permissions échouée"
            exit 1
        fi
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Vérification des permissions réussie sur $ip"
        trace_deploy_operation "verify_models" "SUCCESS" "Models directory permissions verification completed on $ip"
    else
        log_error "Échec de la vérification des permissions sur $ip"
        trace_deploy_operation "verify_models" "FAILED" "Models directory permissions verification failed on $ip"
        exit 1
    fi
}

# Fonction principale
main() {
    local ip="$1"
    
    # Parser les arguments si appelé directement
    if [ -z "$ip" ] && [ -n "$DROPLET_IP" ]; then
        ip="$DROPLET_IP"
    fi
    
    if [ -z "$ip" ]; then
        log_error "IP du serveur manquante"
        show_help
        exit 1
    fi
    
    log_info "🔧 Configuration des permissions du dossier models sur le serveur $ip"
    
    # Configurer les permissions
    configure_models_permissions "$ip"
    
    # Vérifier la configuration
    verify_models_permissions "$ip"
    
    # Résumé
    echo ""
    echo "=== RÉSUMÉ DE LA CONFIGURATION DES PERMISSIONS ==="
    echo "✅ Volume models_data: Créé et configuré"
    echo "✅ Permissions: UID 42420:42420 (utilisateur translator)"
    echo "✅ Structure: Dossiers ML créés"
    echo "✅ Tests: Lecture, écriture et création validés"
    echo "==============================================="
    
    log_success "Configuration des permissions du dossier models terminée avec succès"
    
    # Finaliser la traçabilité
    finalize_deploy_tracing "SUCCESS" "Models directory permissions configuration completed for $ip"
}

# Exécuter la fonction principale si le script est appelé directement
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi
