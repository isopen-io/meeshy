#!/bin/bash

# ===== MEESHY - DÉMARRAGE DES SERVICES =====
# Script spécialisé pour démarrer les services de manière séquentielle
# Usage: ./deploy-start-services.sh [DROPLET_IP]

set -e

# Charger la configuration de déploiement
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

# Initialiser la traçabilité
init_deploy_tracing "deploy-start-services" "start_services"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🚀 MEESHY - DÉMARRAGE DES SERVICES${NC}"
    echo "====================================="
    echo ""
    echo "Usage:"
    echo "  ./deploy-start-services.sh [DROPLET_IP]"
    echo ""
    echo "Description:"
    echo "  Démarre les services Meeshy de manière séquentielle:"
    echo "  • Infrastructure (Traefik, Redis, MongoDB)"
    echo "  • Services applicatifs (Gateway, Translator, Frontend)"
    echo "  • Vérification du démarrage"
    echo ""
    echo "Exemples:"
    echo "  ./deploy-start-services.sh 192.168.1.100"
    echo "  ./deploy-start-services.sh 157.230.15.51"
    echo ""
}

# Démarrer l'infrastructure
start_infrastructure() {
    local ip="$1"
    
    log_info "Démarrage de l'infrastructure (Traefik, Redis, MongoDB)..."
    trace_deploy_operation "start_infrastructure" "STARTED" "Starting infrastructure services on $ip"
    
    # Démarrer les services d'infrastructure
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        cd /opt/meeshy
        
        # Démarrer Traefik
        echo "Démarrage de Traefik..."
        docker compose up -d traefik
        
        # Attendre que Traefik soit prêt
        echo "Attente que Traefik soit prêt..."
        sleep 3
        
        # Démarrer Redis
        echo "Démarrage de Redis..."
        docker compose up -d redis
        
        # Attendre que Redis soit prêt
        echo "Attente que Redis soit prêt..."
        sleep 5
        
        # Démarrer MongoDB
        echo "Démarrage de MongoDB..."
        docker compose up -d mongodb
        
        # Attendre que MongoDB soit prêt
        echo "Attente que MongoDB soit prêt..."
        sleep 15
        
        # Vérifier le statut des services d'infrastructure
        echo "=== STATUT DE L'INFRASTRUCTURE ==="
        docker compose ps traefik redis mongodb
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Infrastructure démarrée avec succès"
        trace_deploy_operation "start_infrastructure" "SUCCESS" "Infrastructure services started on $ip"
    else
        log_error "Échec du démarrage de l'infrastructure"
        trace_deploy_operation "start_infrastructure" "FAILED" "Infrastructure services startup failed on $ip"
        exit 1
    fi
}

# Configurer les permissions du dossier models pour le translator
configure_models_permissions() {
    local ip="$1"
    
    log_info "Configuration des permissions du dossier models pour le translator..."
    trace_deploy_operation "configure_models" "STARTED" "Configuring models directory permissions on $ip"
    
    # Configurer les permissions du dossier models
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        cd /opt/meeshy
        
        echo "Configuration des permissions du dossier models..."
        
        # Créer le volume models_data s'il n'existe pas
        if ! docker volume ls | grep -q "meeshy_models_data"; then
            echo "Création du volume models_data..."
            docker volume create meeshy_models_data
        fi
        
        # Créer un conteneur temporaire pour configurer les permissions
        echo "Configuration des permissions avec un conteneur temporaire..."
        docker run --rm -v meeshy_models_data:/workspace/models \
            --user root \
            alpine:latest \
            sh -c "
                # Créer le dossier models s'il n'existe pas
                mkdir -p /workspace/models
                
                # Configurer les permissions pour l'utilisateur translator (UID 1000)
                chown -R 1000:1000 /workspace/models
                chmod -R 755 /workspace/models
                
                # Créer les sous-dossiers nécessaires pour les modèles ML
                mkdir -p /workspace/models/models--t5-small
                mkdir -p /workspace/models/models--facebook--nllb-200-distilled-600M
                mkdir -p /workspace/models/cache
                mkdir -p /workspace/models/huggingface
                
                # Configurer les permissions sur les sous-dossiers
                chown -R 1000:1000 /workspace/models/models--t5-small
                chown -R 1000:1000 /workspace/models/models--facebook--nllb-200-distilled-600M
                chown -R 1000:1000 /workspace/models/cache
                chown -R 1000:1000 /workspace/models/huggingface
                
                chmod -R 755 /workspace/models/models--t5-small
                chmod -R 755 /workspace/models/models--facebook--nllb-200-distilled-600M
                chmod -R 755 /workspace/models/cache
                chmod -R 755 /workspace/models/huggingface
                
                echo 'Permissions configurées avec succès'
            "
        
        echo "✅ Permissions du dossier models configurées"
        
        # Vérifier les permissions
        echo "Vérification des permissions..."
        docker run --rm -v meeshy_models_data:/workspace/models \
            alpine:latest \
            ls -la /workspace/models
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Permissions du dossier models configurées avec succès"
        trace_deploy_operation "configure_models" "SUCCESS" "Models directory permissions configured on $ip"
    else
        log_error "Échec de la configuration des permissions du dossier models"
        trace_deploy_operation "configure_models" "FAILED" "Models directory permissions configuration failed on $ip"
        exit 1
    fi
}

# Démarrer les services applicatifs
start_application_services() {
    local ip="$1"
    
    log_info "Démarrage des services applicatifs (Gateway, Translator, Frontend)..."
    trace_deploy_operation "start_application" "STARTED" "Starting application services on $ip"
    
    # Démarrer les services applicatifs
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        cd /opt/meeshy
        
        # Démarrer le Gateway
        echo "Démarrage du Gateway..."
        docker compose up -d gateway
        
        # Attendre que le Gateway soit prêt
        echo "Attente que le Gateway soit prêt..."
        sleep 3
        
        # Démarrer le Translator
        echo "Démarrage du Translator..."
        docker compose up -d translator
        
        # Attendre que le Translator soit prêt
        echo "Attente que le Translator soit prêt..."
        sleep 15
        
        # Démarrer le Frontend
        echo "Démarrage du Frontend..."
        docker compose up -d frontend
        
        # Attendre que le Frontend soit prêt
        echo "Attente que le Frontend soit prêt..."
        sleep 3
        
        # Vérifier le statut des services applicatifs
        echo "=== STATUT DES SERVICES APPLICATIFS ==="
        docker compose ps gateway translator frontend
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Services applicatifs démarrés avec succès"
        trace_deploy_operation "start_application" "SUCCESS" "Application services started on $ip"
    else
        log_error "Échec du démarrage des services applicatifs"
        trace_deploy_operation "start_application" "FAILED" "Application services startup failed on $ip"
        exit 1
    fi
}

# Vérifier le démarrage des services
verify_services_startup() {
    local ip="$1"
    
    log_info "Vérification du démarrage des services..."
    trace_deploy_operation "verify_startup" "STARTED" "Verifying services startup on $ip"
    
    # Vérifier le statut de tous les services
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        cd /opt/meeshy
        
        echo "=== STATUT COMPLET DES SERVICES ==="
        docker compose ps
        
        echo ""
        echo "=== VÉRIFICATION DE LA SANTÉ DES SERVICES ==="
        
        # Vérifier Traefik
        echo "Vérification de Traefik..."
        if docker compose ps traefik | grep -q "Up"; then
            echo "✅ Traefik: En cours d'exécution"
        else
            echo "❌ Traefik: Non démarré"
        fi
        
        # Vérifier Redis
        echo "Vérification de Redis..."
        if docker compose ps redis | grep -q "Up"; then
            echo "✅ Redis: En cours d'exécution"
        else
            echo "❌ Redis: Non démarré"
        fi
        
        # Vérifier MongoDB
        echo "Vérification de MongoDB..."
        if docker compose ps mongodb | grep -q "Up"; then
            echo "✅ MongoDB: En cours d'exécution"
        else
            echo "❌ MongoDB: Non démarré"
        fi
        
        # Vérifier le Gateway
        echo "Vérification du Gateway..."
        if docker compose ps gateway | grep -q "Up"; then
            echo "✅ Gateway: En cours d'exécution"
        else
            echo "❌ Gateway: Non démarré"
        fi
        
        # Vérifier le Translator
        echo "Vérification du Translator..."
        if docker compose ps translator | grep -q "Up"; then
            echo "✅ Translator: En cours d'exécution"
        else
            echo "❌ Translator: Non démarré"
        fi
        
        # Vérifier le Frontend
        echo "Vérification du Frontend..."
        if docker compose ps frontend | grep -q "Up"; then
            echo "✅ Frontend: En cours d'exécution"
        else
            echo "❌ Frontend: Non démarré"
        fi
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Vérification du démarrage terminée"
        trace_deploy_operation "verify_startup" "SUCCESS" "Services startup verification completed on $ip"
    else
        log_error "Échec de la vérification du démarrage"
        trace_deploy_operation "verify_startup" "FAILED" "Services startup verification failed on $ip"
        exit 1
    fi
}

# Tester la connectivité des services
test_services_connectivity() {
    local ip="$1"
    
    log_info "Test de connectivité des services..."
    trace_deploy_operation "test_connectivity" "STARTED" "Testing services connectivity on $ip"
    
    # Tests de connectivité
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        echo "=== TESTS DE CONNECTIVITÉ ==="
        
        # Test Traefik
        echo "Test de Traefik..."
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/rawdata | grep -q "200"; then
            echo "✅ Traefik: Accessible sur le port 8080"
        else
            echo "❌ Traefik: Non accessible sur le port 8080"
        fi
        
        # Test Redis
        echo "Test de Redis..."
        if docker exec meeshy-redis redis-cli ping | grep -q "PONG"; then
            echo "✅ Redis: Répond aux commandes"
        else
            echo "❌ Redis: Ne répond pas aux commandes"
        fi
        
        # Test MongoDB
        echo "Test de MongoDB..."
        if docker exec meeshy-database mongosh --eval "db.adminCommand('ping')" | grep -q "ok.*1"; then
            echo "✅ MongoDB: Répond aux commandes"
        else
            echo "❌ MongoDB: Ne répond pas aux commandes"
        fi
        
        # Test Gateway
        echo "Test du Gateway..."
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health | grep -q "200"; then
            echo "✅ Gateway: Accessible sur le port 3001"
        else
            echo "❌ Gateway: Non accessible sur le port 3001"
        fi
        
        # Test Translator
        echo "Test du Translator..."
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health | grep -q "200"; then
            echo "✅ Translator: Accessible sur le port 8000"
        else
            echo "❌ Translator: Non accessible sur le port 8000"
        fi
        
        # Test Frontend
        echo "Test du Frontend..."
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200"; then
            echo "✅ Frontend: Accessible sur le port 3000"
        else
            echo "❌ Frontend: Non accessible sur le port 3000"
        fi
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Tests de connectivité terminés"
        trace_deploy_operation "test_connectivity" "SUCCESS" "Services connectivity tests completed on $ip"
    else
        log_warning "Certains tests de connectivité ont échoué"
        trace_deploy_operation "test_connectivity" "WARNING" "Some connectivity tests failed on $ip"
    fi
}

# Afficher les logs des services
show_services_logs() {
    local ip="$1"
    
    log_info "Affichage des logs des services..."
    trace_deploy_operation "show_logs" "STARTED" "Showing services logs on $ip"
    
    # Afficher les logs des services
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        cd /opt/meeshy
        
        echo "=== LOGS DES SERVICES (dernières 10 lignes) ==="
        
        echo "--- Traefik ---"
        docker compose logs --tail=10 traefik
        
        echo "--- Redis ---"
        docker compose logs --tail=10 redis
        
        echo "--- MongoDB ---"
        docker compose logs --tail=10 mongodb
        
        echo "--- Gateway ---"
        docker compose logs --tail=10 gateway
        
        echo "--- Translator ---"
        docker compose logs --tail=10 translator
        
        echo "--- Frontend ---"
        docker compose logs --tail=10 frontend
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Logs des services affichés"
        trace_deploy_operation "show_logs" "SUCCESS" "Services logs displayed on $ip"
    else
        log_warning "Impossible d'afficher tous les logs"
        trace_deploy_operation "show_logs" "WARNING" "Could not display all services logs on $ip"
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
    
    log_info "🚀 Démarrage des services Meeshy sur le serveur $ip"
    
    # Démarrer l'infrastructure
    start_infrastructure "$ip"
    
    # Configurer les permissions du dossier models
    configure_models_permissions "$ip"
    
    # Démarrer les services applicatifs
    start_application_services "$ip"
    
    # Vérifier le démarrage
    verify_services_startup "$ip"
    
    # Tester la connectivité
    test_services_connectivity "$ip"
    
    # Afficher les logs
    show_services_logs "$ip"
    
    # Résumé du démarrage
    echo ""
    echo "=== RÉSUMÉ DU DÉMARRAGE DES SERVICES ==="
    echo "✅ Infrastructure: Traefik, Redis, MongoDB démarrés"
    echo "✅ Permissions: Dossier models configuré pour le translator"
    echo "✅ Services applicatifs: Gateway, Translator, Frontend démarrés"
    echo "✅ Vérification: Statut des services validé"
    echo "✅ Connectivité: Tests de connectivité effectués"
    echo "✅ Logs: Logs des services affichés"
    echo "======================================="
    
    log_success "Démarrage des services terminé avec succès"
    
    # Finaliser la traçabilité
    finalize_deploy_tracing "SUCCESS" "Services startup completed for $ip"
}

# Exécuter la fonction principale si le script est appelé directement
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi
