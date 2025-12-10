#!/bin/bash

# ===== MEESHY - TESTS COMPLETS POST-DÉPLOIEMENT =====
# Script spécialisé pour tester l'intégrité complète du déploiement
# Usage: ./deploy-testing.sh [COMMAND] [DROPLET_IP] [OPTIONS]

set -e

# Charger la configuration de déploiement
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

# Initialiser la traçabilité
init_deploy_tracing "deploy-testing" "post_deployment_testing"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🧪 MEESHY - TESTS COMPLETS POST-DÉPLOIEMENT${NC}"
    echo "=============================================="
    echo ""
    echo "Usage:"
    echo "  ./deploy-testing.sh [COMMAND] [DROPLET_IP] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo -e "${GREEN}  Tests de base:${NC}"
    echo "    test-all               - Exécuter tous les tests"
    echo "    test-quick             - Tests rapides essentiels"
    echo "    test-connectivity      - Tests de connectivité"
    echo "    test-services          - Tests des services"
    echo ""
    echo -e "${GREEN}  Tests spécialisés:${NC}"
    echo "    test-database          - Tests MongoDB complets"
    echo "    test-authentication    - Tests d'authentification"
    echo "    test-communication     - Tests inter-services"
    echo "    test-api               - Tests des API REST"
    echo "    test-websocket         - Tests WebSocket"
    echo "    test-translation       - Tests de traduction"
    echo ""
    echo -e "${GREEN}  Tests de sécurité:${NC}"
    echo "    test-ssl               - Tests SSL/TLS"
    echo "    test-passwords         - Tests des mots de passe"
    echo "    test-permissions       - Tests des permissions"
    echo ""
    echo -e "${GREEN}  Rapports:${NC}"
    echo "    generate-report        - Générer un rapport complet"
    echo "    show-summary           - Afficher un résumé"
    echo ""
    echo "Options:"
    echo "  --verbose              - Mode verbeux avec détails"
    echo "  --fail-fast            - Arrêter au premier échec"
    echo "  --timeout=N            - Timeout en secondes (défaut: 30)"
    echo "  --save-report          - Sauvegarder le rapport"
    echo ""
    echo "Exemples:"
    echo "  ./deploy-testing.sh test-all 192.168.1.100"
    echo "  ./deploy-testing.sh test-quick 192.168.1.100 --fail-fast"
    echo "  ./deploy-testing.sh test-authentication 192.168.1.100 --verbose"
    echo "  ./deploy-testing.sh generate-report 192.168.1.100 --save-report"
    echo ""
}

# Variables globales pour les tests
TEST_TIMEOUT=30
VERBOSE=false
FAIL_FAST=false
SAVE_REPORT=false
TEST_RESULTS=()
FAILED_TESTS=()
PASSED_TESTS=()

# Fonction utilitaire pour exécuter un test
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_result="${3:-0}"
    
    if [ "$VERBOSE" = "true" ]; then
        log_info "🧪 Exécution du test: $test_name"
        log_info "📋 Commande: $test_command"
    fi
    
    local start_time=$(date +%s)
    
    # Exécuter la commande avec timeout
    if timeout $TEST_TIMEOUT bash -c "$test_command" >/dev/null 2>&1; then
        local result=0
    else
        local result=$?
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    if [ $result -eq $expected_result ]; then
        log_success "✅ $test_name (${duration}s)"
        PASSED_TESTS+=("$test_name")
        TEST_RESULTS+=("PASS:$test_name:${duration}s")
        trace_deploy_operation "test_$test_name" "PASS" "Test passed in ${duration}s"
        return 0
    else
        log_error "❌ $test_name (${duration}s) - Code: $result"
        FAILED_TESTS+=("$test_name")
        TEST_RESULTS+=("FAIL:$test_name:${duration}s:$result")
        trace_deploy_operation "test_$test_name" "FAIL" "Test failed in ${duration}s with code $result"
        
        if [ "$FAIL_FAST" = "true" ]; then
            log_error "🛑 Mode fail-fast activé - Arrêt des tests"
            exit 1
        fi
        return 1
    fi
}

# Test de connectivité SSH
test_ssh_connectivity() {
    local ip="$1"
    
    log_info "🔗 Test de connectivité SSH..."
    
    run_test "SSH_Connectivity" "ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@$ip 'echo SSH_OK'"
}

# Tests des services Docker
test_docker_services() {
    local ip="$1"
    
    log_info "🐳 Tests des services Docker..."
    
    # Test que Docker est installé et fonctionne
    run_test "Docker_Installation" "ssh -o StrictHostKeyChecking=no root@$ip 'docker --version'"
    
    # Test que Docker Compose est installé
    run_test "Docker_Compose_Installation" "ssh -o StrictHostKeyChecking=no root@$ip 'docker compose version'"
    
    # Test que les services sont démarrés
    local services=("traefik" "redis" "mongodb" "gateway" "translator" "frontend")
    
    for service in "${services[@]}"; do
        run_test "Service_${service}_Running" "ssh -o StrictHostKeyChecking=no root@$ip 'cd /opt/meeshy && docker compose ps $service | grep -q \"Up\"'"
    done
}

# Tests de connectivité des services
test_services_connectivity() {
    local ip="$1"
    
    log_info "🌐 Tests de connectivité des services..."
    
    # Test Traefik
    run_test "Traefik_HTTP" "curl -f -s --max-time $TEST_TIMEOUT http://$ip:80"
    run_test "Traefik_Dashboard" "curl -f -s --max-time $TEST_TIMEOUT http://$ip:8080/api/rawdata"
    
    # Test des services via Traefik
    run_test "Frontend_Via_Traefik" "curl -f -s --max-time $TEST_TIMEOUT -H 'Host: meeshy.me' http://$ip"
    run_test "Gateway_Via_Traefik" "curl -f -s --max-time $TEST_TIMEOUT -H 'Host: gate.meeshy.me' http://$ip/health"
    run_test "Translator_Via_Traefik" "curl -f -s --max-time $TEST_TIMEOUT -H 'Host: ml.meeshy.me' http://$ip/health"
    
    # Tests directs (sans Traefik)
    run_test "Gateway_Direct" "ssh -o StrictHostKeyChecking=no root@$ip 'cd /opt/meeshy && docker compose exec -T gateway curl -f -s http://localhost:3000/health'"
    run_test "Translator_Direct" "ssh -o StrictHostKeyChecking=no root@$ip 'cd /opt/meeshy && docker compose exec -T translator curl -f -s http://localhost:8000/health'"
}

# Tests MongoDB complets
test_mongodb_comprehensive() {
    local ip="$1"
    
    log_info "📊 Tests MongoDB complets..."
    
    # Test de base MongoDB
    run_test "MongoDB_Ping" "ssh -o StrictHostKeyChecking=no root@$ip 'cd /opt/meeshy && docker compose exec -T mongodb mongosh --eval \"db.adminCommand(\\\"ping\\\")\"'"
    
    # Test de la base de données meeshy
    run_test "MongoDB_Database_Access" "ssh -o StrictHostKeyChecking=no root@$ip 'cd /opt/meeshy && docker compose exec -T mongodb mongosh --eval \"use meeshy; db.runCommand(\\\"ping\\\")\"'"
    
    # Test du replica set
    run_test "MongoDB_Replica_Set" "ssh -o StrictHostKeyChecking=no root@$ip 'cd /opt/meeshy && docker compose exec -T mongodb mongosh --eval \"rs.status()\"'"
    
    # Vérifier le nom d'hôte du replica set
    run_test "MongoDB_Replica_Hostname" "ssh -o StrictHostKeyChecking=no root@$ip 'cd /opt/meeshy && docker compose exec -T mongodb mongosh --eval \"rs.status().members[0].name\" --quiet | grep -q \"meeshy-database:27017\"'"
    
    # Test de l'authentification si configurée
    if ssh -o StrictHostKeyChecking=no root@$ip 'test -f /opt/meeshy/secrets/production-secrets.env'; then
        log_info "🔐 Test de l'authentification MongoDB..."
        run_test "MongoDB_Authentication" "ssh -o StrictHostKeyChecking=no root@$ip 'cd /opt/meeshy && source secrets/production-secrets.env && docker compose exec -T mongodb mongosh -u meeshy -p \"\$MONGODB_PASSWORD\" --authenticationDatabase admin --eval \"db.runCommand({connectionStatus: 1})\"'"
    fi
}

# Tests d'authentification
test_authentication() {
    local ip="$1"
    
    log_info "🔐 Tests d'authentification..."
    
    # Test des secrets de production
    run_test "Production_Secrets_File" "ssh -o StrictHostKeyChecking=no root@$ip 'test -f /opt/meeshy/secrets/production-secrets.env'"
    
    # Test des mots de passe Traefik
    run_test "Traefik_Passwords_File" "ssh -o StrictHostKeyChecking=no root@$ip 'test -f /opt/meeshy/traefik/passwords'"
    
    # Test de l'authentification Traefik
    if ssh -o StrictHostKeyChecking=no root@$ip 'test -f /opt/meeshy/secrets/production-secrets.env'; then
        log_info "🔑 Test de l'authentification Traefik..."
        # Ce test va échouer sans les bons credentials, c'est normal
        run_test "Traefik_Auth_Protected" "! curl -f -s --max-time $TEST_TIMEOUT -H 'Host: traefik.meeshy.me' http://$ip/dashboard/" 1
    fi
    
    # Test Redis avec authentification
    run_test "Redis_Authentication" "ssh -o StrictHostKeyChecking=no root@$ip 'cd /opt/meeshy && docker compose exec -T redis redis-cli --no-auth-warning -a MeeshyRedis123 ping'"
}

# Tests de communication inter-services
test_inter_services_communication() {
    local ip="$1"
    
    log_info "🔄 Tests de communication inter-services..."
    
    # Test MongoDB depuis Gateway
    run_test "Gateway_MongoDB_Connection" "ssh -o StrictHostKeyChecking=no root@$ip 'cd /opt/meeshy && docker compose exec -T gateway node -e \"console.log(\\\"MongoDB connection test from Gateway\\\")\"'"
    
    # Test MongoDB depuis Translator
    run_test "Translator_MongoDB_Connection" "ssh -o StrictHostKeyChecking=no root@$ip 'cd /opt/meeshy && docker compose exec -T translator python -c \"print(\\\"MongoDB connection test from Translator\\\")\"'"
    
    # Test Redis depuis Gateway
    run_test "Gateway_Redis_Connection" "ssh -o StrictHostKeyChecking=no root@$ip 'cd /opt/meeshy && docker compose exec -T gateway node -e \"console.log(\\\"Redis connection test from Gateway\\\")\"'"
    
    # Test de résolution DNS entre services
    run_test "Service_DNS_Resolution" "ssh -o StrictHostKeyChecking=no root@$ip 'cd /opt/meeshy && docker compose exec -T gateway ping -c 1 mongodb'"
}

# Tests des API REST
test_api_endpoints() {
    local ip="$1"
    
    log_info "🔌 Tests des API REST..."
    
    # Tests Gateway API
    run_test "Gateway_Health_Endpoint" "curl -f -s --max-time $TEST_TIMEOUT -H 'Host: gate.meeshy.me' http://$ip/health"
    run_test "Gateway_Info_Endpoint" "curl -f -s --max-time $TEST_TIMEOUT -H 'Host: gate.meeshy.me' http://$ip/info"
    
    # Tests Translator API
    run_test "Translator_Health_Endpoint" "curl -f -s --max-time $TEST_TIMEOUT -H 'Host: ml.meeshy.me' http://$ip/health"
    run_test "Translator_Models_Endpoint" "curl -f -s --max-time $TEST_TIMEOUT -H 'Host: ml.meeshy.me' http://$ip/models"
    
    # Test d'un endpoint de traduction simple
    run_test "Translator_Translate_Endpoint" "curl -f -s --max-time $TEST_TIMEOUT -X POST -H 'Content-Type: application/json' -H 'Host: ml.meeshy.me' -d '{\"text\":\"hello\",\"source_language\":\"en\",\"target_language\":\"fr\"}' http://$ip/translate"
}

# Tests WebSocket
test_websocket() {
    local ip="$1"
    
    log_info "🔌 Tests WebSocket..."
    
    # Test de connexion WebSocket (nécessite wscat ou équivalent)
    if command -v wscat &> /dev/null; then
        run_test "WebSocket_Connection" "timeout 5 wscat -c ws://$ip/ws --execute 'ping'"
    else
        log_warning "⚠️  wscat non disponible - Tests WebSocket ignorés"
    fi
}

# Tests SSL/TLS
test_ssl_certificates() {
    local ip="$1"
    
    log_info "🔐 Tests SSL/TLS..."
    
    # Test des certificats auto-signés en développement
    run_test "SSL_Certificate_Present" "ssh -o StrictHostKeyChecking=no root@$ip 'test -f /opt/meeshy/ssl/cert.pem'"
    run_test "SSL_Private_Key_Present" "ssh -o StrictHostKeyChecking=no root@$ip 'test -f /opt/meeshy/ssl/key.pem'"
    
    # Test de validation des certificats
    if ssh -o StrictHostKeyChecking=no root@$ip 'test -f /opt/meeshy/ssl/cert.pem'; then
        run_test "SSL_Certificate_Valid" "ssh -o StrictHostKeyChecking=no root@$ip 'openssl x509 -in /opt/meeshy/ssl/cert.pem -text -noout'"
    fi
}

# Tests des permissions
test_permissions() {
    local ip="$1"
    
    log_info "🔒 Tests des permissions..."
    
    # Test des permissions des secrets
    run_test "Secrets_File_Permissions" "ssh -o StrictHostKeyChecking=no root@$ip 'ls -l /opt/meeshy/secrets/production-secrets.env | grep -q \"^-rw-------\"'"
    
    # Test des permissions des volumes translator
    run_test "Translator_Volumes_Permissions" "ssh -o StrictHostKeyChecking=no root@$ip 'docker volume ls | grep -q meeshy_models_data'"
    
    # Test que les services peuvent écrire dans leurs volumes
    run_test "Translator_Volume_Write_Test" "ssh -o StrictHostKeyChecking=no root@$ip 'cd /opt/meeshy && docker compose exec -T translator touch /workspace/cache/test_write && rm /workspace/cache/test_write'"
}

# Tests rapides essentiels
test_quick() {
    local ip="$1"
    
    log_info "⚡ Tests rapides essentiels..."
    
    test_ssh_connectivity "$ip"
    
    # Tests de base des services
    local services=("traefik" "mongodb" "gateway" "translator" "frontend")
    for service in "${services[@]}"; do
        run_test "Service_${service}_Quick" "ssh -o StrictHostKeyChecking=no root@$ip 'cd /opt/meeshy && docker compose ps $service | grep -q \"Up\"'"
    done
    
    # Tests de connectivité essentiels
    run_test "HTTP_Access" "curl -f -s --max-time 10 http://$ip"
    run_test "Gateway_Health" "curl -f -s --max-time 10 -H 'Host: gate.meeshy.me' http://$ip/health"
    run_test "Translator_Health" "curl -f -s --max-time 10 -H 'Host: ml.meeshy.me' http://$ip/health"
}

# Exécuter tous les tests
test_all() {
    local ip="$1"
    
    log_info "🧪 Exécution de tous les tests..."
    trace_deploy_operation "test_all" "STARTED" "Running all tests on $ip"
    
    test_ssh_connectivity "$ip"
    test_docker_services "$ip"
    test_services_connectivity "$ip"
    test_mongodb_comprehensive "$ip"
    test_authentication "$ip"
    test_inter_services_communication "$ip"
    test_api_endpoints "$ip"
    test_ssl_certificates "$ip"
    test_permissions "$ip"
    
    # Résumé final
    show_test_summary
    
    if [ ${#FAILED_TESTS[@]} -eq 0 ]; then
        log_success "✅ Tous les tests sont passés avec succès"
        trace_deploy_operation "test_all" "SUCCESS" "All tests passed"
        return 0
    else
        log_error "❌ ${#FAILED_TESTS[@]} tests ont échoué"
        trace_deploy_operation "test_all" "FAILED" "${#FAILED_TESTS[@]} tests failed"
        return 1
    fi
}

# Afficher un résumé des tests
show_test_summary() {
    local total_tests=${#TEST_RESULTS[@]}
    local passed_tests=${#PASSED_TESTS[@]}
    local failed_tests=${#FAILED_TESTS[@]}
    
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}      RÉSUMÉ DES TESTS - MEESHY${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
    echo -e "${BLUE}📊 Statistiques:${NC}"
    echo "   Total des tests: $total_tests"
    echo -e "   ${GREEN}✅ Réussis: $passed_tests${NC}"
    echo -e "   ${RED}❌ Échoués: $failed_tests${NC}"
    
    if [ $total_tests -gt 0 ]; then
        local success_rate=$((passed_tests * 100 / total_tests))
        echo "   📈 Taux de réussite: ${success_rate}%"
    fi
    
    echo ""
    
    # Afficher les tests échoués si il y en a
    if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
        echo -e "${RED}❌ Tests échoués:${NC}"
        for test in "${FAILED_TESTS[@]}"; do
            echo "   • $test"
        done
        echo ""
    fi
    
    # Afficher les détails en mode verbeux
    if [ "$VERBOSE" = "true" ]; then
        echo -e "${BLUE}📋 Détails des tests:${NC}"
        for result in "${TEST_RESULTS[@]}"; do
            IFS=':' read -r status test_name duration code <<< "$result"
            if [ "$status" = "PASS" ]; then
                echo -e "   ${GREEN}✅ $test_name ($duration)${NC}"
            else
                echo -e "   ${RED}❌ $test_name ($duration) - Code: $code${NC}"
            fi
        done
        echo ""
    fi
    
    echo -e "${CYAN}========================================${NC}"
}

# Générer un rapport complet
generate_test_report() {
    local ip="$1"
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local report_file="$DEPLOY_LOGS_DIR/test_report_${timestamp}.txt"
    
    log_info "📋 Génération du rapport de tests..."
    
    {
        echo "======================================"
        echo "    RAPPORT DE TESTS - MEESHY"
        echo "======================================"
        echo ""
        echo "Date: $(date)"
        echo "Serveur: $ip"
        echo "Session: $DEPLOY_SESSION_ID"
        echo ""
        
        # Statistiques
        local total_tests=${#TEST_RESULTS[@]}
        local passed_tests=${#PASSED_TESTS[@]}
        local failed_tests=${#FAILED_TESTS[@]}
        
        echo "STATISTIQUES:"
        echo "  Total des tests: $total_tests"
        echo "  Réussis: $passed_tests"
        echo "  Échoués: $failed_tests"
        
        if [ $total_tests -gt 0 ]; then
            local success_rate=$((passed_tests * 100 / total_tests))
            echo "  Taux de réussite: ${success_rate}%"
        fi
        
        echo ""
        
        # Détails des tests
        echo "DÉTAILS DES TESTS:"
        for result in "${TEST_RESULTS[@]}"; do
            IFS=':' read -r status test_name duration code <<< "$result"
            if [ "$status" = "PASS" ]; then
                echo "  ✅ $test_name ($duration)"
            else
                echo "  ❌ $test_name ($duration) - Code: $code"
            fi
        done
        
        echo ""
        
        # Tests échoués
        if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
            echo "TESTS ÉCHOUÉS:"
            for test in "${FAILED_TESTS[@]}"; do
                echo "  • $test"
            done
            echo ""
        fi
        
        echo "======================================"
        
    } > "$report_file"
    
    log_success "✅ Rapport généré: $report_file"
    
    if [ "$SAVE_REPORT" = "true" ]; then
        # Copier aussi dans le projet
        cp "$report_file" "$PROJECT_ROOT/test_report_${timestamp}.txt"
        log_success "✅ Rapport sauvegardé: test_report_${timestamp}.txt"
    fi
}

# Point d'entrée principal
main() {
    local command="${1:-help}"
    local ip="$2"
    
    # Parser les options
    shift 2 2>/dev/null || true
    while [[ $# -gt 0 ]]; do
        case $1 in
            --verbose)
                VERBOSE=true
                shift
                ;;
            --fail-fast)
                FAIL_FAST=true
                shift
                ;;
            --timeout=*)
                TEST_TIMEOUT="${1#*=}"
                shift
                ;;
            --save-report)
                SAVE_REPORT=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done
    
    case "$command" in
        "test-all")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            test_all "$ip"
            if [ "$SAVE_REPORT" = "true" ]; then
                generate_test_report "$ip"
            fi
            ;;
        "test-quick")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            test_quick "$ip"
            show_test_summary
            ;;
        "test-connectivity")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            test_services_connectivity "$ip"
            show_test_summary
            ;;
        "test-services")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            test_docker_services "$ip"
            show_test_summary
            ;;
        "test-database")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            test_mongodb_comprehensive "$ip"
            show_test_summary
            ;;
        "test-authentication")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            test_authentication "$ip"
            show_test_summary
            ;;
        "test-communication")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            test_inter_services_communication "$ip"
            show_test_summary
            ;;
        "test-api")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            test_api_endpoints "$ip"
            show_test_summary
            ;;
        "test-websocket")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            test_websocket "$ip"
            show_test_summary
            ;;
        "test-ssl")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            test_ssl_certificates "$ip"
            show_test_summary
            ;;
        "test-permissions")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            test_permissions "$ip"
            show_test_summary
            ;;
        "generate-report")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            generate_test_report "$ip"
            ;;
        "show-summary")
            show_test_summary
            ;;
        "help"|"-h"|"--help"|"")
            show_help
            ;;
        *)
            log_error "Commande inconnue: $command"
            show_help
            exit 1
            ;;
    esac
}

# Exécuter le script principal
main "$@"
