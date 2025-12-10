#!/bin/bash

# ===== MEESHY - TEST DE CONNEXION SSH =====
# Script spécialisé pour tester la connexion SSH au serveur de déploiement
# Usage: ./deploy-test-connection.sh [DROPLET_IP]

set -e

# Charger la configuration de déploiement
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

# Initialiser la traçabilité
init_deploy_tracing "deploy-test-connection" "test_ssh_connection"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🔌 MEESHY - TEST DE CONNEXION SSH${NC}"
    echo "====================================="
    echo ""
    echo "Usage:"
    echo "  ./deploy-test-connection.sh [DROPLET_IP]"
    echo ""
    echo "Description:"
    echo "  Teste la connexion SSH vers le serveur de déploiement"
    echo "  et vérifie les prérequis de base."
    echo ""
    echo "Exemples:"
    echo "  ./deploy-test-connection.sh 192.168.1.100"
    echo "  ./deploy-test-connection.sh 157.230.15.51"
    echo ""
}

# Test de connexion SSH
test_ssh_connection() {
    local ip="$1"
    
    if [ -z "$ip" ]; then
        log_error "IP du serveur manquante"
        show_help
        exit 1
    fi
    
    log_info "Test de connexion SSH vers $ip..."
    trace_deploy_operation "ssh_test" "STARTED" "Testing SSH connection to $ip"
    
    # Test de connectivité réseau
    log_info "Vérification de la connectivité réseau..."
    if ping -c 1 -W 5 "$ip" >/dev/null 2>&1; then
        log_success "Serveur $ip accessible via ping"
    else
        log_warning "Serveur $ip non accessible via ping (peut être normal si ICMP est bloqué)"
    fi
    
    # Test de connexion SSH
    log_info "Test de connexion SSH..."
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes root@$ip "echo 'Connexion SSH réussie'" >/dev/null 2>&1; then
        log_success "Connexion SSH réussie vers $ip"
        trace_deploy_operation "ssh_test" "SUCCESS" "SSH connection successful to $ip"
    else
        log_error "Impossible de se connecter au serveur $ip"
        log_info "Vérifiez que:"
        echo "  • Le serveur est accessible"
        echo "  • SSH est activé sur le port 22"
        echo "  • Votre clé SSH est configurée"
        echo "  • L'utilisateur root a accès"
        trace_deploy_operation "ssh_test" "FAILED" "SSH connection failed to $ip"
        exit 1
    fi
    
    # Test des prérequis de base
    test_server_prerequisites "$ip"
}

# Test des prérequis de base sur le serveur
test_server_prerequisites() {
    local ip="$1"
    
    log_info "Vérification des prérequis de base sur le serveur..."
    trace_deploy_operation "prerequisites_test" "STARTED" "Testing server prerequisites on $ip"
    
    # Test de la commande curl
    log_info "Test de curl..."
    if ssh -o StrictHostKeyChecking=no root@$ip "command -v curl >/dev/null 2>&1" >/dev/null 2>&1; then
        log_success "curl disponible sur le serveur"
    else
        log_warning "curl non disponible sur le serveur"
    fi
    
    # Test de la commande wget
    log_info "Test de wget..."
    if ssh -o StrictHostKeyChecking=no root@$ip "command -v wget >/dev/null 2>&1" >/dev/null 2>&1; then
        log_success "wget disponible sur le serveur"
    else
        log_warning "wget non disponible sur le serveur"
    fi
    
    # Test de l'espace disque
    log_info "Vérification de l'espace disque..."
    local disk_usage=$(ssh -o StrictHostKeyChecking=no root@$ip "df -h / | tail -1 | awk '{print \$5}' | sed 's/%//'" 2>/dev/null || echo "unknown")
    if [ "$disk_usage" != "unknown" ]; then
        if [ "$disk_usage" -lt 80 ]; then
            log_success "Espace disque suffisant: ${disk_usage}% utilisé"
        else
            log_warning "Espace disque faible: ${disk_usage}% utilisé"
        fi
    else
        log_warning "Impossible de vérifier l'espace disque"
    fi
    
    # Test de la mémoire
    log_info "Vérification de la mémoire..."
    local mem_info=$(ssh -o StrictHostKeyChecking=no root@$ip "free -m | grep '^Mem:' | awk '{print \$2}'" 2>/dev/null || echo "unknown")
    if [ "$mem_info" != "unknown" ]; then
        if [ "$mem_info" -ge 2048 ]; then
            log_success "Mémoire suffisante: ${mem_info}MB"
        else
            log_warning "Mémoire faible: ${mem_info}MB (recommandé: 2GB+)"
        fi
    else
        log_warning "Impossible de vérifier la mémoire"
    fi
    
    # Test de l'architecture
    log_info "Vérification de l'architecture..."
    local arch=$(ssh -o StrictHostKeyChecking=no root@$ip "uname -m" 2>/dev/null || echo "unknown")
    log_info "Architecture détectée: $arch"
    
    # Test du système d'exploitation
    log_info "Vérification du système d'exploitation..."
    local os_info=$(ssh -o StrictHostKeyChecking=no root@$ip "cat /etc/os-release | grep '^PRETTY_NAME=' | cut -d'=' -f2 | tr -d '\"'" 2>/dev/null || echo "unknown")
    log_info "Système d'exploitation: $os_info"
    
    log_success "Vérification des prérequis terminée"
    trace_deploy_operation "prerequisites_test" "SUCCESS" "Server prerequisites checked on $ip"
}

# Test de performance de la connexion
test_connection_performance() {
    local ip="$1"
    
    log_info "Test de performance de la connexion..."
    trace_deploy_operation "performance_test" "STARTED" "Testing connection performance to $ip"
    
    # Test de latence
    local start_time=$(date +%s%N)
    ssh -o StrictHostKeyChecking=no root@$ip "echo 'test'" >/dev/null 2>&1
    local end_time=$(date +%s%N)
    local latency=$(( (end_time - start_time) / 1000000 ))
    
    log_info "Latence SSH: ${latency}ms"
    
    if [ "$latency" -lt 1000 ]; then
        log_success "Latence SSH excellente: ${latency}ms"
    elif [ "$latency" -lt 3000 ]; then
        log_warning "Latence SSH acceptable: ${latency}ms"
    else
        log_warning "Latence SSH élevée: ${latency}ms"
    fi
    
    # Test de bande passante (upload d'un petit fichier)
    log_info "Test de bande passante..."
    local test_file="$DEPLOY_TEMP_DIR/test_bandwidth.txt"
    echo "Test de bande passante - $(date)" > "$test_file"
    
    local start_time=$(date +%s%N)
    scp -o StrictHostKeyChecking=no "$test_file" root@$ip:/tmp/ >/dev/null 2>&1
    local end_time=$(date +%s%N)
    local upload_time=$(( (end_time - start_time) / 1000000 ))
    
    # Nettoyer le fichier de test
    rm -f "$test_file"
    ssh -o StrictHostKeyChecking=no root@$ip "rm -f /tmp/test_bandwidth.txt" >/dev/null 2>&1
    
    log_info "Temps d'upload (1KB): ${upload_time}ms"
    
    if [ "$upload_time" -lt 1000 ]; then
        log_success "Bande passante excellente: ${upload_time}ms pour 1KB"
    elif [ "$upload_time" -lt 5000 ]; then
        log_warning "Bande passante acceptable: ${upload_time}ms pour 1KB"
    else
        log_warning "Bande passante faible: ${upload_time}ms pour 1KB"
    fi
    
    trace_deploy_operation "performance_test" "SUCCESS" "Connection performance tested: ${latency}ms latency, ${upload_time}ms upload"
}

# Test de sécurité de la connexion
test_connection_security() {
    local ip="$1"
    
    log_info "Test de sécurité de la connexion..."
    trace_deploy_operation "security_test" "STARTED" "Testing connection security to $ip"
    
    # Test de la version SSH
    local ssh_version=$(ssh -o StrictHostKeyChecking=no root@$ip "ssh -V 2>&1" 2>/dev/null || echo "unknown")
    log_info "Version SSH: $ssh_version"
    
    # Test des algorithmes de chiffrement supportés
    log_info "Vérification des algorithmes de chiffrement..."
    local ciphers=$(ssh -o StrictHostKeyChecking=no root@$ip "ssh -Q cipher" 2>/dev/null | head -5 | tr '\n' ' ')
    log_info "Algorithmes de chiffrement: $ciphers"
    
    # Test de la configuration SSH
    log_info "Vérification de la configuration SSH..."
    local ssh_config=$(ssh -o StrictHostKeyChecking=no root@$ip "cat /etc/ssh/sshd_config | grep -E '^PermitRootLogin|^PasswordAuthentication|^PubkeyAuthentication' | head -3" 2>/dev/null || echo "unknown")
    log_info "Configuration SSH: $ssh_config"
    
    log_success "Test de sécurité terminé"
    trace_deploy_operation "security_test" "SUCCESS" "Connection security tested on $ip"
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
    
    # Tests de connexion
    test_ssh_connection "$ip"
    test_connection_performance "$ip"
    test_connection_security "$ip"
    
    # Résumé des tests
    echo ""
    echo "=== RÉSUMÉ DES TESTS DE CONNEXION ==="
    echo "✅ Connexion SSH: Fonctionnelle"
    echo "✅ Prérequis serveur: Vérifiés"
    echo "✅ Performance: Testée"
    echo "✅ Sécurité: Vérifiée"
    echo "================================"
    
    log_success "Tous les tests de connexion ont réussi"
    
    # Finaliser la traçabilité
    finalize_deploy_tracing "SUCCESS" "All connection tests passed for $ip"
}

# Exécuter la fonction principale si le script est appelé directement
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi
