#!/bin/bash

# ===== MEESHY - VÉRIFICATION DE SANTÉ =====
# Script spécialisé pour vérifier la santé des services et effectuer des tests
# Usage: ./deploy-health-check.sh [DROPLET_IP]

set -e

# Charger la configuration de déploiement
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

# Initialiser la traçabilité
init_deploy_tracing "deploy-health-check" "health_check"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🏥 MEESHY - VÉRIFICATION DE SANTÉ${NC}"
    echo "====================================="
    echo ""
    echo "Usage:"
    echo "  ./deploy-health-check.sh [DROPLET_IP]"
    echo ""
    echo "Description:"
    echo "  Vérifie la santé des services Meeshy:"
    echo "  • Statut des conteneurs Docker"
    echo "  • Connectivité des services"
    echo "  • Tests de fonctionnalité"
    echo "  • Vérification des logs d'erreur"
    echo ""
    echo "Exemples:"
    echo "  ./deploy-health-check.sh 192.168.1.100"
    echo "  ./deploy-health-check.sh 157.230.15.51"
    echo ""
}

# Vérifier le statut des conteneurs
check_container_status() {
    local ip="$1"
    
    log_info "Vérification du statut des conteneurs..."
    trace_deploy_operation "check_containers" "STARTED" "Checking container status on $ip"
    
    # Vérifier le statut de tous les conteneurs
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        cd /opt/meeshy
        
        echo "=== STATUT DES CONTENEURS ==="
        docker compose ps
        
        echo ""
        echo "=== VÉRIFICATION DÉTAILLÉE ==="
        
        # Vérifier chaque service
        services=("traefik" "redis" "mongodb" "gateway" "translator" "frontend")
        
        for service in "${services[@]}"; do
            echo "--- $service ---"
            if docker compose ps $service | grep -q "Up"; then
                echo "✅ $service: En cours d'exécution"
                
                # Vérifier la santé du conteneur
                container_id=$(docker compose ps -q $service)
                if [ -n "$container_id" ]; then
                    health_status=$(docker inspect --format='{{.State.Health.Status}}' $container_id 2>/dev/null || echo "no-health-check")
                    echo "   Santé: $health_status"
                fi
            else
                echo "❌ $service: Non démarré ou en erreur"
                
                # Afficher les logs d'erreur
                echo "   Derniers logs d'erreur:"
                docker compose logs --tail=5 $service | grep -i error || echo "   Aucune erreur récente"
            fi
        done
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Vérification du statut des conteneurs terminée"
        trace_deploy_operation "check_containers" "SUCCESS" "Container status check completed on $ip"
    else
        log_error "Échec de la vérification du statut des conteneurs"
        trace_deploy_operation "check_containers" "FAILED" "Container status check failed on $ip"
        exit 1
    fi
}

# Vérifier la connectivité des services
check_services_connectivity() {
    local ip="$1"
    
    log_info "Vérification de la connectivité des services..."
    trace_deploy_operation "check_connectivity" "STARTED" "Checking services connectivity on $ip"
    
    # Tests de connectivité
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        echo "=== TESTS DE CONNECTIVITÉ ==="
        
        # Test Traefik
        echo "--- Traefik ---"
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/rawdata | grep -q "200"; then
            echo "✅ Traefik: Accessible sur le port 8080"
        else
            echo "❌ Traefik: Non accessible sur le port 8080"
        fi
        
        # Test Redis
        echo "--- Redis ---"
        if docker exec meeshy-redis redis-cli ping | grep -q "PONG"; then
            echo "✅ Redis: Répond aux commandes"
            
            # Test de lecture/écriture
            if docker exec meeshy-redis redis-cli set test_key "test_value" && docker exec meeshy-redis redis-cli get test_key | grep -q "test_value"; then
                echo "✅ Redis: Lecture/écriture fonctionnelle"
                docker exec meeshy-redis redis-cli del test_key >/dev/null
            else
                echo "❌ Redis: Problème de lecture/écriture"
            fi
        else
            echo "❌ Redis: Ne répond pas aux commandes"
        fi
        
        # Test MongoDB
        echo "--- MongoDB ---"
        if docker exec meeshy-database mongosh --eval "db.adminCommand('ping')" | grep -q "ok.*1"; then
            echo "✅ MongoDB: Répond aux commandes"
            
            # Test du replica set
            if docker exec meeshy-database mongosh --eval "rs.status()" | grep -q "ok.*1"; then
                echo "✅ MongoDB: Replica set fonctionnel"
            else
                echo "❌ MongoDB: Problème avec le replica set"
            fi
        else
            echo "❌ MongoDB: Ne répond pas aux commandes"
        fi
        
        # Test Gateway
        echo "--- Gateway ---"
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health | grep -q "200"; then
            echo "✅ Gateway: Accessible sur le port 3000"
        else
            echo "❌ Gateway: Non accessible sur le port 3000"
        fi
        
        # Test Translator
        echo "--- Translator ---"
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health | grep -q "200"; then
            echo "✅ Translator: Accessible sur le port 8000"
        else
            echo "❌ Translator: Non accessible sur le port 8000"
        fi
        
        # Test Frontend
        echo "--- Frontend ---"
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200"; then
            echo "✅ Frontend: Accessible sur le port 3000"
        else
            echo "❌ Frontend: Non accessible sur le port 3000"
        fi
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Vérification de la connectivité terminée"
        trace_deploy_operation "check_connectivity" "SUCCESS" "Services connectivity check completed on $ip"
    else
        log_warning "Certains tests de connectivité ont échoué"
        trace_deploy_operation "check_connectivity" "WARNING" "Some connectivity tests failed on $ip"
    fi
}

# Effectuer des tests de fonctionnalité
run_functionality_tests() {
    local ip="$1"
    
    log_info "Tests de fonctionnalité des services..."
    trace_deploy_operation "functionality_tests" "STARTED" "Running functionality tests on $ip"
    
    # Tests de fonctionnalité
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        echo "=== TESTS DE FONCTIONNALITÉ ==="
        
        # Test de l'API Gateway
        echo "--- Test API Gateway ---"
        if curl -s http://localhost:3001/api/health | grep -q "ok"; then
            echo "✅ API Gateway: Endpoint de santé fonctionnel"
        else
            echo "❌ API Gateway: Endpoint de santé non fonctionnel"
        fi
        
        # Test de l'API de traduction
        echo "--- Test API de traduction ---"
        if curl -s http://localhost:8000/health | grep -q "ok"; then
            echo "✅ API de traduction: Endpoint de santé fonctionnel"
        else
            echo "❌ API de traduction: Endpoint de santé non fonctionnel"
        fi
        
        # Test de la base de données
        echo "--- Test base de données ---"
        if docker exec meeshy-database mongosh --eval "db.adminCommand('ping')" | grep -q "ok.*1"; then
            echo "✅ Base de données: Connexion fonctionnelle"
            
            # Test de création de données
            if docker exec meeshy-database mongosh --eval "db.test.insertOne({test: 'value'})" | grep -q "acknowledged.*true"; then
                echo "✅ Base de données: Création de données fonctionnelle"
                docker exec meeshy-database mongosh --eval "db.test.drop()" >/dev/null
            else
                echo "❌ Base de données: Problème de création de données"
            fi
        else
            echo "❌ Base de données: Connexion non fonctionnelle"
        fi
        
        # Test du cache Redis
        echo "--- Test cache Redis ---"
        if docker exec meeshy-redis redis-cli ping | grep -q "PONG"; then
            echo "✅ Cache Redis: Connexion fonctionnelle"
            
            # Test de mise en cache
            if docker exec meeshy-redis redis-cli set test_cache "test_value" && docker exec meeshy-redis redis-cli get test_cache | grep -q "test_value"; then
                echo "✅ Cache Redis: Mise en cache fonctionnelle"
                docker exec meeshy-redis redis-cli del test_cache >/dev/null
            else
                echo "❌ Cache Redis: Problème de mise en cache"
            fi
        else
            echo "❌ Cache Redis: Connexion non fonctionnelle"
        fi
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Tests de fonctionnalité terminés"
        trace_deploy_operation "functionality_tests" "SUCCESS" "Functionality tests completed on $ip"
    else
        log_warning "Certains tests de fonctionnalité ont échoué"
        trace_deploy_operation "functionality_tests" "WARNING" "Some functionality tests failed on $ip"
    fi
}

# Vérifier les logs d'erreur
check_error_logs() {
    local ip="$1"
    
    log_info "Vérification des logs d'erreur..."
    trace_deploy_operation "check_error_logs" "STARTED" "Checking error logs on $ip"
    
    # Vérifier les logs d'erreur
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        echo "=== VÉRIFICATION DES LOGS D'ERREUR ==="
        
        services=("traefik" "redis" "mongodb" "gateway" "translator" "frontend")
        
        for service in "${services[@]}"; do
            echo "--- $service ---"
            
            # Chercher les erreurs dans les logs
            error_count=$(docker compose logs $service | grep -i error | wc -l)
            warning_count=$(docker compose logs $service | grep -i warning | wc -l)
            
            if [ $error_count -gt 0 ]; then
                echo "❌ $service: $error_count erreur(s) détectée(s)"
                echo "   Dernières erreurs:"
                docker compose logs $service | grep -i error | tail -3
            else
                echo "✅ $service: Aucune erreur détectée"
            fi
            
            if [ $warning_count -gt 0 ]; then
                echo "⚠️  $service: $warning_count avertissement(s) détecté(s)"
            fi
        done
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Vérification des logs d'erreur terminée"
        trace_deploy_operation "check_error_logs" "SUCCESS" "Error logs check completed on $ip"
    else
        log_warning "Impossible de vérifier tous les logs d'erreur"
        trace_deploy_operation "check_error_logs" "WARNING" "Could not check all error logs on $ip"
    fi
}

# Vérifier les ressources système
check_system_resources() {
    local ip="$1"
    
    log_info "Vérification des ressources système..."
    trace_deploy_operation "check_resources" "STARTED" "Checking system resources on $ip"
    
    # Vérifier les ressources système
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        echo "=== VÉRIFICATION DES RESSOURCES SYSTÈME ==="
        
        # Utilisation CPU
        echo "--- CPU ---"
        cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
        echo "Utilisation CPU: ${cpu_usage}%"
        
        # Utilisation mémoire
        echo "--- Mémoire ---"
        memory_info=$(free -m | grep "Mem:")
        total_memory=$(echo $memory_info | awk '{print $2}')
        used_memory=$(echo $memory_info | awk '{print $3}')
        memory_percent=$((used_memory * 100 / total_memory))
        echo "Utilisation mémoire: ${memory_percent}% (${used_memory}MB/${total_memory}MB)"
        
        # Utilisation disque
        echo "--- Disque ---"
        disk_usage=$(df -h / | tail -1 | awk '{print $5}' | cut -d'%' -f1)
        echo "Utilisation disque: ${disk_usage}%"
        
        # Utilisation Docker
        echo "--- Docker ---"
        docker_stats=$(docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" | grep meeshy)
        if [ -n "$docker_stats" ]; then
            echo "Utilisation des conteneurs Meeshy:"
            echo "$docker_stats"
        else
            echo "Aucun conteneur Meeshy en cours d'exécution"
        fi
        
        # Vérifier les limites
        if [ $cpu_usage -gt 80 ]; then
            echo "⚠️  Utilisation CPU élevée: ${cpu_usage}%"
        fi
        
        if [ $memory_percent -gt 80 ]; then
            echo "⚠️  Utilisation mémoire élevée: ${memory_percent}%"
        fi
        
        if [ $disk_usage -gt 80 ]; then
            echo "⚠️  Utilisation disque élevée: ${disk_usage}%"
        fi
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Vérification des ressources système terminée"
        trace_deploy_operation "check_resources" "SUCCESS" "System resources check completed on $ip"
    else
        log_warning "Impossible de vérifier toutes les ressources système"
        trace_deploy_operation "check_resources" "WARNING" "Could not check all system resources on $ip"
    fi
}

# Générer un rapport de santé
generate_health_report() {
    local ip="$1"
    
    log_info "Génération du rapport de santé..."
    trace_deploy_operation "generate_report" "STARTED" "Generating health report for $ip"
    
    # Générer le rapport
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        echo "=== RAPPORT DE SANTÉ MEESHY ==="
        echo "Date: $(date)"
        echo "Serveur: $(hostname)"
        echo "IP: $(hostname -I | awk '{print $1}')"
        echo ""
        
        # Statut des services
        echo "--- STATUT DES SERVICES ---"
        docker compose ps
        
        echo ""
        
        # Résumé de santé
        echo "--- RÉSUMÉ DE SANTÉ ---"
        
        # Compter les services en cours d'exécution
        running_services=$(docker compose ps | grep "Up" | wc -l)
        total_services=6  # traefik, redis, mongodb, gateway, translator, frontend
        
        echo "Services en cours d'exécution: $running_services/$total_services"
        
        if [ $running_services -eq $total_services ]; then
            echo "✅ Tous les services sont en cours d'exécution"
        else
            echo "❌ Certains services ne sont pas en cours d'exécution"
        fi
        
        # Vérifier les erreurs
        total_errors=0
        services=("traefik" "redis" "mongodb" "gateway" "translator" "frontend")
        
        for service in "${services[@]}"; do
            error_count=$(docker compose logs $service | grep -i error | wc -l)
            total_errors=$((total_errors + error_count))
        done
        
        echo "Erreurs totales détectées: $total_errors"
        
        if [ $total_errors -eq 0 ]; then
            echo "✅ Aucune erreur détectée"
        else
            echo "❌ Des erreurs ont été détectées"
        fi
        
        echo ""
        echo "=== FIN DU RAPPORT ==="
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Rapport de santé généré"
        trace_deploy_operation "generate_report" "SUCCESS" "Health report generated for $ip"
    else
        log_error "Échec de la génération du rapport de santé"
        trace_deploy_operation "generate_report" "FAILED" "Health report generation failed for $ip"
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
    
    log_info "🏥 Vérification de la santé des services Meeshy sur le serveur $ip"
    
    # Vérifier le statut des conteneurs
    check_container_status "$ip"
    
    # Vérifier la connectivité
    check_services_connectivity "$ip"
    
    # Effectuer des tests de fonctionnalité
    run_functionality_tests "$ip"
    
    # Vérifier les logs d'erreur
    check_error_logs "$ip"
    
    # Vérifier les ressources système
    check_system_resources "$ip"
    
    # Générer le rapport de santé
    generate_health_report "$ip"
    
    # Résumé de la vérification
    echo ""
    echo "=== RÉSUMÉ DE LA VÉRIFICATION DE SANTÉ ==="
    echo "✅ Statut des conteneurs: Vérifié"
    echo "✅ Connectivité des services: Testée"
    echo "✅ Tests de fonctionnalité: Effectués"
    echo "✅ Logs d'erreur: Vérifiés"
    echo "✅ Ressources système: Vérifiées"
    echo "✅ Rapport de santé: Généré"
    echo "======================================="
    
    log_success "Vérification de santé terminée avec succès"
    
    # Finaliser la traçabilité
    finalize_deploy_tracing "SUCCESS" "Health check completed for $ip"
}

# Exécuter la fonction principale si le script est appelé directement
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi
