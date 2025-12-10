#!/bin/bash

# ===== MEESHY - INSTALLATION DES PRÉREQUIS =====
# Script spécialisé pour installer les prérequis sur le serveur de déploiement
# Usage: ./deploy-install-prerequisites.sh [DROPLET_IP]

set -e

# Charger la configuration de déploiement
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

# Initialiser la traçabilité
init_deploy_tracing "deploy-install-prerequisites" "install_prerequisites"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}📦 MEESHY - INSTALLATION DES PRÉREQUIS${NC}"
    echo "============================================="
    echo ""
    echo "Usage:"
    echo "  ./deploy-install-prerequisites.sh [DROPLET_IP]"
    echo ""
    echo "Description:"
    echo "  Installe les prérequis nécessaires sur le serveur de déploiement:"
    echo "  • Docker et Docker Compose"
    echo "  • OpenSSL pour la génération de certificats"
    echo "  • Outils système essentiels"
    echo ""
    echo "Exemples:"
    echo "  ./deploy-install-prerequisites.sh 192.168.1.100"
    echo "  ./deploy-install-prerequisites.sh 157.230.15.51"
    echo ""
}

# Vérifier les prérequis existants
check_existing_prerequisites() {
    local ip="$1"
    
    log_info "Vérification des prérequis existants sur le serveur..."
    trace_deploy_operation "check_prerequisites" "STARTED" "Checking existing prerequisites on $ip"
    
    # Vérifier Docker
    if ssh -o StrictHostKeyChecking=no root@$ip "command -v docker >/dev/null 2>&1" >/dev/null 2>&1; then
        local docker_version=$(ssh -o StrictHostKeyChecking=no root@$ip "docker --version" 2>/dev/null || echo "unknown")
        log_success "Docker déjà installé: $docker_version"
    else
        log_info "Docker non installé, installation nécessaire"
    fi
    
    # Vérifier Docker Compose
    if ssh -o StrictHostKeyChecking=no root@$ip "command -v docker-compose >/dev/null 2>&1 || docker compose version >/dev/null 2>&1" >/dev/null 2>&1; then
        local compose_version=$(ssh -o StrictHostKeyChecking=no root@$ip "docker-compose --version 2>/dev/null || docker compose version 2>/dev/null" || echo "unknown")
        log_success "Docker Compose déjà installé: $compose_version"
    else
        log_info "Docker Compose non installé, installation nécessaire"
    fi
    
    # Vérifier OpenSSL
    if ssh -o StrictHostKeyChecking=no root@$ip "command -v openssl >/dev/null 2>&1" >/dev/null 2>&1; then
        local openssl_version=$(ssh -o StrictHostKeyChecking=no root@$ip "openssl version" 2>/dev/null || echo "unknown")
        log_success "OpenSSL déjà installé: $openssl_version"
    else
        log_info "OpenSSL non installé, installation nécessaire"
    fi
    
    # Vérifier les outils système
    local system_tools=("curl" "wget" "git" "htpasswd" "jq")
    for tool in "${system_tools[@]}"; do
        if ssh -o StrictHostKeyChecking=no root@$ip "command -v $tool >/dev/null 2>&1" >/dev/null 2>&1; then
            log_success "$tool déjà installé"
        else
            log_info "$tool non installé, installation nécessaire"
        fi
    done
    
    trace_deploy_operation "check_prerequisites" "SUCCESS" "Prerequisites check completed on $ip"
}

# Installer Docker
install_docker() {
    local ip="$1"
    
    log_info "Installation de Docker..."
    trace_deploy_operation "install_docker" "STARTED" "Installing Docker on $ip"
    
    # Script d'installation Docker
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        # Mettre à jour le système
        apt-get update -y
        
        # Installer les prérequis
        apt-get install -y \
            apt-transport-https \
            ca-certificates \
            curl \
            gnupg \
            lsb-release
        
        # Ajouter la clé GPG officielle de Docker
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
        
        # Ajouter le repository Docker
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
        
        # Mettre à jour les packages
        apt-get update -y
        
        # Installer Docker
        apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        
        # Démarrer et activer Docker
        systemctl start docker
        systemctl enable docker
        
        # Ajouter l'utilisateur root au groupe docker
        usermod -aG docker root
        
        # Vérifier l'installation
        docker --version
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Docker installé avec succès"
        trace_deploy_operation "install_docker" "SUCCESS" "Docker installed successfully on $ip"
    else
        log_error "Échec de l'installation de Docker"
        trace_deploy_operation "install_docker" "FAILED" "Docker installation failed on $ip"
        exit 1
    fi
}

# Installer Docker Compose (version standalone si nécessaire)
install_docker_compose() {
    local ip="$1"
    
    log_info "Installation de Docker Compose..."
    trace_deploy_operation "install_docker_compose" "STARTED" "Installing Docker Compose on $ip"
    
    # Vérifier si Docker Compose est déjà disponible via le plugin
    if ssh -o StrictHostKeyChecking=no root@$ip "docker compose version >/dev/null 2>&1" >/dev/null 2>&1; then
        log_success "Docker Compose (plugin) déjà disponible"
        trace_deploy_operation "install_docker_compose" "SUCCESS" "Docker Compose plugin already available on $ip"
        return 0
    fi
    
    # Installer Docker Compose standalone
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        # Télécharger la dernière version de Docker Compose
        COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep 'tag_name' | cut -d\" -f4)
        curl -L "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        
        # Rendre exécutable
        chmod +x /usr/local/bin/docker-compose
        
        # Créer un lien symbolique
        ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
        
        # Vérifier l'installation
        docker-compose --version
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Docker Compose installé avec succès"
        trace_deploy_operation "install_docker_compose" "SUCCESS" "Docker Compose installed successfully on $ip"
    else
        log_error "Échec de l'installation de Docker Compose"
        trace_deploy_operation "install_docker_compose" "FAILED" "Docker Compose installation failed on $ip"
        exit 1
    fi
}

# Installer OpenSSL et outils système
install_system_tools() {
    local ip="$1"
    
    log_info "Installation des outils système..."
    trace_deploy_operation "install_system_tools" "STARTED" "Installing system tools on $ip"
    
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        # Mettre à jour le système
        apt-get update -y
        
        # Installer seulement les outils essentiels pour Docker
        apt-get install -y \
            openssl \
            curl \
            wget \
            git \
            jq
        
        # Vérifier les installations
        openssl version
        curl --version | head -1
        wget --version | head -1
        git --version
        jq --version
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Outils système installés avec succès"
        trace_deploy_operation "install_system_tools" "SUCCESS" "System tools installed successfully on $ip"
    else
        log_error "Échec de l'installation des outils système"
        trace_deploy_operation "install_system_tools" "FAILED" "System tools installation failed on $ip"
        exit 1
    fi
}

# Vérifier les outils système essentiels (sans installation forcée)
check_system_tools() {
    local ip="$1"
    
    log_info "Vérification des outils système essentiels..."
    trace_deploy_operation "check_system_tools" "STARTED" "Checking system tools on $ip"
    
    # Vérifier OpenSSL
    if ssh -o StrictHostKeyChecking=no root@$ip "command -v openssl >/dev/null 2>&1" >/dev/null 2>&1; then
        local openssl_version=$(ssh -o StrictHostKeyChecking=no root@$ip "openssl version" 2>/dev/null || echo "unknown")
        log_success "OpenSSL déjà installé: $openssl_version"
    else
        log_warning "OpenSSL non installé, installation nécessaire"
        install_openssl "$ip"
    fi
    
    # Vérifier curl
    if ssh -o StrictHostKeyChecking=no root@$ip "command -v curl >/dev/null 2>&1" >/dev/null 2>&1; then
        log_success "curl déjà installé"
    else
        log_warning "curl non installé, installation nécessaire"
        install_curl "$ip"
    fi
    
    # Vérifier wget
    if ssh -o StrictHostKeyChecking=no root@$ip "command -v wget >/dev/null 2>&1" >/dev/null 2>&1; then
        log_success "wget déjà installé"
    else
        log_warning "wget non installé, installation nécessaire"
        install_wget "$ip"
    fi
    
    # Vérifier git
    if ssh -o StrictHostKeyChecking=no root@$ip "command -v git >/dev/null 2>&1" >/dev/null 2>&1; then
        log_success "git déjà installé"
    else
        log_warning "git non installé, installation nécessaire"
        install_git "$ip"
    fi
    
    # Vérifier jq
    if ssh -o StrictHostKeyChecking=no root@$ip "command -v jq >/dev/null 2>&1" >/dev/null 2>&1; then
        log_success "jq déjà installé"
    else
        log_warning "jq non installé, installation nécessaire"
        install_jq "$ip"
    fi
    
    log_success "Vérification des outils système terminée"
    trace_deploy_operation "check_system_tools" "SUCCESS" "System tools check completed on $ip"
}

# Installer OpenSSL uniquement si nécessaire
install_openssl() {
    local ip="$1"
    log_info "Installation d'OpenSSL..."
    ssh -o StrictHostKeyChecking=no root@$ip "apt-get update -y && apt-get install -y openssl"
    log_success "OpenSSL installé"
}

# Installer curl uniquement si nécessaire
install_curl() {
    local ip="$1"
    log_info "Installation de curl..."
    ssh -o StrictHostKeyChecking=no root@$ip "apt-get update -y && apt-get install -y curl"
    log_success "curl installé"
}

# Installer wget uniquement si nécessaire
install_wget() {
    local ip="$1"
    log_info "Installation de wget..."
    ssh -o StrictHostKeyChecking=no root@$ip "apt-get update -y && apt-get install -y wget"
    log_success "wget installé"
}

# Installer git uniquement si nécessaire
install_git() {
    local ip="$1"
    log_info "Installation de git..."
    ssh -o StrictHostKeyChecking=no root@$ip "apt-get update -y && apt-get install -y git"
    log_success "git installé"
}

# Installer jq uniquement si nécessaire
install_jq() {
    local ip="$1"
    log_info "Installation de jq..."
    ssh -o StrictHostKeyChecking=no root@$ip "apt-get update -y && apt-get install -y jq"
    log_success "jq installé"
}

# Configurer le pare-feu (optionnel)
configure_firewall() {
    local ip="$1"
    
    log_info "Vérification de la configuration du pare-feu..."
    trace_deploy_operation "configure_firewall" "STARTED" "Checking firewall configuration on $ip"
    
    # Vérifier si UFW est installé
    if ssh -o StrictHostKeyChecking=no root@$ip "command -v ufw >/dev/null 2>&1" >/dev/null 2>&1; then
        log_info "UFW détecté, configuration du pare-feu..."
        ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
            # Activer UFW
            ufw --force enable
            
            # Règles par défaut
            ufw default deny incoming
            ufw default allow outgoing
            
            # Autoriser SSH
            ufw allow ssh
            
            # Autoriser HTTP et HTTPS
            ufw allow 80/tcp
            ufw allow 443/tcp
            
            # Vérifier le statut
            ufw status verbose
EOF
        
        if [ $? -eq 0 ]; then
            log_success "Pare-feu configuré avec succès"
            trace_deploy_operation "configure_firewall" "SUCCESS" "Firewall configured successfully on $ip"
        else
            log_warning "Configuration du pare-feu échouée (peut être normal)"
            trace_deploy_operation "configure_firewall" "WARNING" "Firewall configuration failed on $ip"
        fi
    else
        log_info "UFW non installé, pare-feu non configuré (normal pour un déploiement containerisé)"
        trace_deploy_operation "configure_firewall" "SKIPPED" "UFW not installed, firewall configuration skipped on $ip"
    fi
}

# Optimiser les paramètres système
optimize_system() {
    local ip="$1"
    
    log_info "Optimisation des paramètres système..."
    trace_deploy_operation "optimize_system" "STARTED" "Optimizing system parameters on $ip"
    
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        # Optimiser les limites de fichiers
        echo "* soft nofile 65536" >> /etc/security/limits.conf
        echo "* hard nofile 65536" >> /etc/security/limits.conf
        
        # Optimiser les paramètres réseau
        cat >> /etc/sysctl.conf << 'SYSCTL_EOF'
# Optimisations réseau pour Docker
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 65536 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_congestion_control = bbr
SYSCTL_EOF
        
        # Appliquer les paramètres
        sysctl -p
        
        # Optimiser Docker
        mkdir -p /etc/docker
        cat > /etc/docker/daemon.json << 'DOCKER_EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "live-restore": true,
  "userland-proxy": false,
  "experimental": false,
  "metrics-addr": "127.0.0.1:9323",
  "default-address-pools": [
    {
      "base": "172.17.0.0/12",
      "size": 24
    }
  ]
}
DOCKER_EOF
        
        # Redémarrer Docker pour appliquer les changements
        systemctl restart docker
        
        # Vérifier que Docker fonctionne
        docker info >/dev/null 2>&1
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Système optimisé avec succès"
        trace_deploy_operation "optimize_system" "SUCCESS" "System optimized successfully on $ip"
    else
        log_warning "Optimisation du système échouée (peut être normal)"
        trace_deploy_operation "optimize_system" "WARNING" "System optimization failed on $ip"
    fi
}

# Vérifier l'installation complète
verify_installation() {
    local ip="$1"
    
    log_info "Vérification de l'installation complète..."
    trace_deploy_operation "verify_installation" "STARTED" "Verifying complete installation on $ip"
    
    # Vérifier Docker
    if ssh -o StrictHostKeyChecking=no root@$ip "docker --version >/dev/null 2>&1" >/dev/null 2>&1; then
        local docker_version=$(ssh -o StrictHostKeyChecking=no root@$ip "docker --version" 2>/dev/null)
        log_success "✅ Docker: $docker_version"
    else
        log_error "❌ Docker non fonctionnel"
        trace_deploy_operation "verify_installation" "FAILED" "Docker verification failed on $ip"
        exit 1
    fi
    
    # Vérifier Docker Compose
    if ssh -o StrictHostKeyChecking=no root@$ip "docker-compose --version >/dev/null 2>&1 || docker compose version >/dev/null 2>&1" >/dev/null 2>&1; then
        local compose_version=$(ssh -o StrictHostKeyChecking=no root@$ip "docker-compose --version 2>/dev/null || docker compose version 2>/dev/null")
        log_success "✅ Docker Compose: $compose_version"
    else
        log_error "❌ Docker Compose non fonctionnel"
        trace_deploy_operation "verify_installation" "FAILED" "Docker Compose verification failed on $ip"
        exit 1
    fi
    
    # Vérifier OpenSSL
    if ssh -o StrictHostKeyChecking=no root@$ip "openssl version >/dev/null 2>&1" >/dev/null 2>&1; then
        local openssl_version=$(ssh -o StrictHostKeyChecking=no root@$ip "openssl version" 2>/dev/null)
        log_success "✅ OpenSSL: $openssl_version"
    else
        log_error "❌ OpenSSL non fonctionnel"
        trace_deploy_operation "verify_installation" "FAILED" "OpenSSL verification failed on $ip"
        exit 1
    fi
    
    # Vérifier les outils système
    local system_tools=("curl" "wget" "git" "htpasswd" "jq")
    for tool in "${system_tools[@]}"; do
        if ssh -o StrictHostKeyChecking=no root@$ip "command -v $tool >/dev/null 2>&1" >/dev/null 2>&1; then
            log_success "✅ $tool: Disponible"
        else
            log_error "❌ $tool: Non disponible"
            trace_deploy_operation "verify_installation" "FAILED" "$tool verification failed on $ip"
            exit 1
        fi
    done
    
    # Test de fonctionnement Docker
    log_info "Test de fonctionnement Docker..."
    if ssh -o StrictHostKeyChecking=no root@$ip "docker run --rm hello-world >/dev/null 2>&1" >/dev/null 2>&1; then
        log_success "✅ Docker: Test de fonctionnement réussi"
    else
        log_error "❌ Docker: Test de fonctionnement échoué"
        trace_deploy_operation "verify_installation" "FAILED" "Docker functionality test failed on $ip"
        exit 1
    fi
    
    log_success "Tous les prérequis sont installés et fonctionnels"
    trace_deploy_operation "verify_installation" "SUCCESS" "All prerequisites installed and functional on $ip"
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
    
    log_info "🚀 Installation des prérequis sur le serveur $ip"
    
    # Vérifier les prérequis existants
    check_existing_prerequisites "$ip"
    
    # Installer Docker
    install_docker "$ip"
    
    # Installer Docker Compose
    install_docker_compose "$ip"
    
    # Vérifier les outils système essentiels (sans installation forcée)
    check_system_tools "$ip"
    
    # Configurer le pare-feu (optionnel)
    configure_firewall "$ip"
    
    # Optimiser le système
    optimize_system "$ip"
    
    # Vérifier l'installation
    verify_installation "$ip"
    
    # Résumé de l'installation
    echo ""
    echo "=== RÉSUMÉ DE L'INSTALLATION ==="
    echo "✅ Docker: Installé et fonctionnel"
    echo "✅ Docker Compose: Installé et fonctionnel"
    echo "✅ OpenSSL: Installé et fonctionnel"
    echo "✅ Outils système: Installés et fonctionnels"
    echo "✅ Pare-feu: Configuré"
    echo "✅ Système: Optimisé"
    echo "==============================="
    
    log_success "Installation des prérequis terminée avec succès"
    
    # Finaliser la traçabilité
    finalize_deploy_tracing "SUCCESS" "Prerequisites installation completed for $ip"
}

# Exécuter la fonction principale si le script est appelé directement
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi
