#!/bin/bash

# ===== MEESHY - GESTION SSL AVANCÉE =====
# Script spécialisé pour la gestion complète des certificats SSL
# Usage: ./deploy-ssl-management.sh [COMMAND] [DROPLET_IP] [OPTIONS]

set -e

# Charger la configuration de déploiement
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

# Initialiser la traçabilité
init_deploy_tracing "deploy-ssl-management" "ssl_operations"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🔒 MEESHY - GESTION SSL AVANCÉE${NC}"
    echo "===================================="
    echo ""
    echo "Usage:"
    echo "  ./deploy-ssl-management.sh [COMMAND] [DROPLET_IP] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo -e "${GREEN}  Configuration SSL:${NC}"
    echo "    setup-ssl             - Configuration SSL complète"
    echo "    setup-staging         - Configuration SSL de test (Let's Encrypt staging)"
    echo "    setup-production      - Configuration SSL de production"
    echo "    setup-wildcard        - Configuration certificat wildcard"
    echo ""
    echo -e "${GREEN}  Gestion certificats:${NC}"
    echo "    status                - Statut des certificats SSL"
    echo "    renew                 - Renouvellement des certificats"
    echo "    revoke                - Révoquer un certificat"
    echo "    force-renew           - Forcer le renouvellement"
    echo ""
    echo -e "${GREEN}  Validation:${NC}"
    echo "    validate              - Valider la configuration SSL"
    echo "    test-domains          - Tester l'accessibilité des domaines"
    echo "    check-expiry          - Vérifier l'expiration des certificats"
    echo "    security-scan         - Scan de sécurité SSL"
    echo ""
    echo -e "${GREEN}  Sauvegarde/Restauration:${NC}"
    echo "    backup-certs          - Sauvegarder les certificats"
    echo "    restore-certs         - Restaurer les certificats"
    echo "    export-certs          - Exporter les certificats"
    echo ""
    echo -e "${GREEN}  Maintenance:${NC}"
    echo "    cleanup               - Nettoyer les anciens certificats"
    echo "    reset-ssl             - Réinitialiser complètement SSL"
    echo "    migrate-certs         - Migrer les certificats"
    echo ""
    echo "Options:"
    echo "  --domain=DOMAIN        - Domaine spécifique à traiter"
    echo "  --email=EMAIL          - Email pour Let's Encrypt"
    echo "  --staging              - Utiliser l'environnement de test"
    echo "  --force                - Forcer l'opération"
    echo "  --dry-run              - Simulation sans modification"
    echo "  --backup-path=PATH     - Chemin de sauvegarde des certificats"
    echo ""
    echo "Exemples:"
    echo "  ./deploy-ssl-management.sh setup-ssl 192.168.1.100 --email=admin@example.com"
    echo "  ./deploy-ssl-management.sh status 192.168.1.100"
    echo "  ./deploy-ssl-management.sh renew 192.168.1.100 --domain=meeshy.me"
    echo "  ./deploy-ssl-management.sh backup-certs 192.168.1.100 --backup-path=/tmp/ssl-backup"
    echo ""
}

# Variables globales
DOMAIN=""
EMAIL=""
USE_STAGING=false
FORCE_MODE=false
DRY_RUN=false
BACKUP_PATH=""

# Domaines par défaut de Meeshy
MEESHY_DOMAINS=(
    "meeshy.me"
    "www.meeshy.me"
    "gate.meeshy.me"
    "ml.meeshy.me"
    "admin.meeshy.me"
)

# Configuration SSL complète
setup_ssl_complete() {
    local ip="$1"
    
    log_info "🔒 Configuration SSL complète..."
    trace_deploy_operation "setup_ssl_complete" "STARTED" "Starting complete SSL setup for $ip"
    
    # Vérifier les prérequis
    validate_ssl_prerequisites "$ip"
    
    # Arrêter Traefik temporairement
    log_info "⏸️  Arrêt temporaire de Traefik..."
    ssh -o StrictHostKeyChecking=no root@$ip "cd /opt/meeshy && docker compose stop traefik" || true
    
    # Installer Certbot si nécessaire
    install_certbot "$ip"
    
    # Configurer les certificats pour chaque domaine
    for domain in "${MEESHY_DOMAINS[@]}"; do
        setup_domain_certificate "$ip" "$domain"
    done
    
    # Configurer Traefik pour SSL
    configure_traefik_ssl "$ip"
    
    # Redémarrer Traefik
    log_info "🔄 Redémarrage de Traefik avec SSL..."
    ssh -o StrictHostKeyChecking=no root@$ip "cd /opt/meeshy && docker compose up -d traefik"
    
    # Valider la configuration
    validate_ssl_configuration "$ip"
    
    trace_deploy_operation "setup_ssl_complete" "SUCCESS" "SSL setup completed successfully"
    log_success "✅ Configuration SSL complète terminée"
}

# Valider les prérequis SSL
validate_ssl_prerequisites() {
    local ip="$1"
    
    log_info "🔍 Validation des prérequis SSL..."
    
    # Vérifier la résolution DNS
    for domain in "${MEESHY_DOMAINS[@]}"; do
        local resolved_ip=$(dig +short "$domain" @8.8.8.8 | tail -n1)
        if [ "$resolved_ip" != "$ip" ]; then
            log_warning "⚠️  DNS: $domain pointe vers $resolved_ip au lieu de $ip"
        else
            log_success "✅ DNS: $domain correctement configuré"
        fi
    done
    
    # Vérifier l'accessibilité HTTP
    for domain in "${MEESHY_DOMAINS[@]}"; do
        if curl -f -s --max-time 10 -H "Host: $domain" "http://$ip/.well-known/acme-challenge/test" >/dev/null 2>&1; then
            log_success "✅ HTTP: $domain accessible"
        else
            log_info "ℹ️  HTTP: $domain - sera configuré avec les certificats"
        fi
    done
}

# Installer Certbot
install_certbot() {
    local ip="$1"
    
    log_info "📦 Installation de Certbot..."
    
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        # Mettre à jour le système
        apt update
        
        # Installer snapd si nécessaire
        if ! command -v snap &> /dev/null; then
            apt install -y snapd
        fi
        
        # Installer certbot via snap
        if ! command -v certbot &> /dev/null; then
            snap install core; snap refresh core
            snap install --classic certbot
            ln -sf /snap/bin/certbot /usr/bin/certbot
        fi
        
        # Vérifier l'installation
        certbot --version
EOF
    
    log_success "✅ Certbot installé"
}

# Configurer le certificat pour un domaine
setup_domain_certificate() {
    local ip="$1"
    local domain="$2"
    
    log_info "🔐 Configuration certificat pour $domain..."
    
    local staging_flag=""
    if [ "$USE_STAGING" = "true" ]; then
        staging_flag="--staging"
    fi
    
    local email_option=""
    if [ -n "$EMAIL" ]; then
        email_option="--email $EMAIL"
    else
        email_option="--register-unsafely-without-email"
    fi
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "🧪 Mode simulation - certificat pour $domain"
        return 0
    fi
    
    ssh -o StrictHostKeyChecking=no root@$ip << EOF
        # Créer le répertoire webroot si nécessaire
        mkdir -p /var/www/html/.well-known/acme-challenge
        
        # Obtenir le certificat
        certbot certonly \\
            --webroot \\
            --webroot-path=/var/www/html \\
            $staging_flag \\
            $email_option \\
            --agree-tos \\
            --non-interactive \\
            --domains $domain \\
            --keep-until-expiring \\
            --expand
EOF
    
    if [ $? -eq 0 ]; then
        log_success "✅ Certificat obtenu pour $domain"
        trace_file_deployment "CREATED" "/etc/letsencrypt/live/$domain/fullchain.pem" "SSL certificate for $domain"
    else
        log_error "❌ Échec obtention certificat pour $domain"
    fi
}

# Configurer Traefik pour SSL
configure_traefik_ssl() {
    local ip="$1"
    
    log_info "⚙️  Configuration Traefik SSL..."
    
    # Créer la configuration Traefik avec SSL
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        cat > /opt/meeshy/traefik/traefik.yml << 'TRAEFIK_EOF'
global:
  checkNewVersion: false
  sendAnonymousUsage: false

api:
  dashboard: true
  insecure: false

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entrypoint:
          to: websecure
          scheme: https
          permanent: true
  websecure:
    address: ":443"

certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@meeshy.me
      storage: /certificates/acme.json
      httpChallenge:
        entryPoint: web

providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false
  file:
    directory: /etc/traefik/dynamic
    watch: true

log:
  level: INFO

accessLog: {}
TRAEFIK_EOF

        # Créer la configuration dynamique
        mkdir -p /opt/meeshy/traefik/dynamic
        
        cat > /opt/meeshy/traefik/dynamic/tls.yml << 'TLS_EOF'
tls:
  certificates:
    - certFile: /etc/letsencrypt/live/meeshy.me/fullchain.pem
      keyFile: /etc/letsencrypt/live/meeshy.me/privkey.pem
    - certFile: /etc/letsencrypt/live/www.meeshy.me/fullchain.pem
      keyFile: /etc/letsencrypt/live/www.meeshy.me/privkey.pem
    - certFile: /etc/letsencrypt/live/gate.meeshy.me/fullchain.pem
      keyFile: /etc/letsencrypt/live/gate.meeshy.me/privkey.pem
    - certFile: /etc/letsencrypt/live/ml.meeshy.me/fullchain.pem
      keyFile: /etc/letsencrypt/live/ml.meeshy.me/privkey.pem
    - certFile: /etc/letsencrypt/live/admin.meeshy.me/fullchain.pem
      keyFile: /etc/letsencrypt/live/admin.meeshy.me/privkey.pem

  options:
    default:
      minVersion: "VersionTLS12"
      cipherSuites:
        - "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384"
        - "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305"
        - "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256"
        - "TLS_RSA_WITH_AES_256_GCM_SHA384"
        - "TLS_RSA_WITH_AES_128_GCM_SHA256"
TLS_EOF

        # Permissions appropriées
        chmod 600 /opt/meeshy/traefik/traefik.yml
        chmod 600 /opt/meeshy/traefik/dynamic/tls.yml
EOF
    
    trace_file_deployment "MODIFIED" "/opt/meeshy/traefik/traefik.yml" "Traefik SSL configuration"
    trace_file_deployment "CREATED" "/opt/meeshy/traefik/dynamic/tls.yml" "Traefik TLS certificates configuration"
    
    log_success "✅ Configuration Traefik SSL terminée"
}

# Valider la configuration SSL
validate_ssl_configuration() {
    local ip="$1"
    
    log_info "🔍 Validation de la configuration SSL..."
    
    # Attendre que Traefik démarre
    sleep 3
    
    local failed_domains=()
    
    for domain in "${MEESHY_DOMAINS[@]}"; do
        log_info "🔗 Test HTTPS pour $domain..."
        
        if curl -f -s --max-time 10 -H "Host: $domain" "https://$ip" >/dev/null 2>&1; then
            log_success "✅ HTTPS: $domain fonctionne"
        else
            log_warning "⚠️  HTTPS: $domain inaccessible"
            failed_domains+=("$domain")
        fi
        
        # Vérifier le certificat
        local cert_info=$(echo | openssl s_client -servername "$domain" -connect "$ip:443" 2>/dev/null | openssl x509 -noout -dates 2>/dev/null || echo "")
        if [ -n "$cert_info" ]; then
            log_info "📜 Certificat $domain: $cert_info"
        fi
    done
    
    if [ ${#failed_domains[@]} -eq 0 ]; then
        log_success "✅ Tous les domaines SSL sont opérationnels"
        return 0
    else
        log_warning "⚠️  Domaines en échec: ${failed_domains[*]}"
        return 1
    fi
}

# Afficher le statut des certificats
show_ssl_status() {
    local ip="$1"
    
    log_info "📋 Statut des certificats SSL..."
    
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        echo "=== CERTIFICATS INSTALLÉS ==="
        certbot certificates 2>/dev/null || echo "Aucun certificat trouvé"
        echo ""
        
        echo "=== STATUT DES SERVICES SSL ==="
        systemctl is-active nginx 2>/dev/null || echo "Nginx: Non installé"
        docker compose -f /opt/meeshy/docker-compose.yml ps traefik 2>/dev/null || echo "Traefik: Non démarré"
        echo ""
        
        echo "=== FICHIERS DE CERTIFICATS ==="
        ls -la /etc/letsencrypt/live/ 2>/dev/null || echo "Aucun certificat Let's Encrypt"
        echo ""
EOF
    
    # Tester la connectivité HTTPS
    for domain in "${MEESHY_DOMAINS[@]}"; do
        log_info "🔗 Test HTTPS $domain..."
        if curl -f -s --max-time 5 -H "Host: $domain" "https://$ip" >/dev/null 2>&1; then
            echo -e "  ✅ $domain: ${GREEN}Accessible en HTTPS${NC}"
        else
            echo -e "  ❌ $domain: ${RED}Inaccessible en HTTPS${NC}"
        fi
    done
}

# Renouveler les certificats
renew_certificates() {
    local ip="$1"
    local specific_domain="$2"
    
    log_info "🔄 Renouvellement des certificats..."
    trace_deploy_operation "renew_certificates" "STARTED" "Renewing SSL certificates"
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "🧪 Mode simulation - renouvellement"
        ssh -o StrictHostKeyChecking=no root@$ip "certbot renew --dry-run"
        return $?
    fi
    
    local renew_command="certbot renew"
    if [ "$FORCE_MODE" = "true" ]; then
        renew_command="$renew_command --force-renewal"
    fi
    
    if [ -n "$specific_domain" ]; then
        renew_command="$renew_command --cert-name $specific_domain"
    fi
    
    ssh -o StrictHostKeyChecking=no root@$ip << EOF
        $renew_command
        
        # Redémarrer Traefik pour recharger les certificats
        cd /opt/meeshy
        docker compose restart traefik
EOF
    
    if [ $? -eq 0 ]; then
        log_success "✅ Certificats renouvelés avec succès"
        trace_deploy_operation "renew_certificates" "SUCCESS" "Certificates renewed successfully"
    else
        log_error "❌ Échec du renouvellement des certificats"
        trace_deploy_operation "renew_certificates" "FAILED" "Certificate renewal failed"
        return 1
    fi
}

# Sauvegarder les certificats
backup_certificates() {
    local ip="$1"
    local backup_path="${BACKUP_PATH:-/tmp/ssl-backup-$(date +%Y%m%d_%H%M%S)}"
    
    log_info "💾 Sauvegarde des certificats vers $backup_path..."
    trace_deploy_operation "backup_certificates" "STARTED" "Backing up SSL certificates"
    
    # Créer le répertoire de sauvegarde localement
    mkdir -p "$backup_path"
    
    # Sauvegarder les certificats
    scp -r -o StrictHostKeyChecking=no root@$ip:/etc/letsencrypt/ "$backup_path/" 2>/dev/null || {
        log_warning "⚠️  Aucun certificat Let's Encrypt trouvé"
    }
    
    # Sauvegarder la configuration Traefik
    scp -r -o StrictHostKeyChecking=no root@$ip:/opt/meeshy/traefik/ "$backup_path/traefik-config/" 2>/dev/null || {
        log_warning "⚠️  Configuration Traefik non trouvée"
    }
    
    # Créer un manifest de sauvegarde
    cat > "$backup_path/backup-manifest.txt" << EOF
SAUVEGARDE SSL - MEESHY
======================
Date: $(date)
Serveur: $ip
Session: $DEPLOY_SESSION_ID

Contenu sauvegardé:
- Certificats Let's Encrypt (/etc/letsencrypt/)
- Configuration Traefik SSL
- Logs de déploiement SSL

Pour restaurer:
./deploy-ssl-management.sh restore-certs [IP] --backup-path=$backup_path
EOF
    
    log_success "✅ Sauvegarde SSL terminée: $backup_path"
    trace_deploy_operation "backup_certificates" "SUCCESS" "SSL backup completed"
    trace_file_deployment "BACKUP" "$backup_path" "SSL certificates and configuration backup"
}

# Restaurer les certificats
restore_certificates() {
    local ip="$1"
    local backup_path="$BACKUP_PATH"
    
    if [ -z "$backup_path" ] || [ ! -d "$backup_path" ]; then
        log_error "❌ Chemin de sauvegarde requis et valide: --backup-path=PATH"
        return 1
    fi
    
    log_info "📥 Restauration des certificats depuis $backup_path..."
    trace_deploy_operation "restore_certificates" "STARTED" "Restoring SSL certificates from $backup_path"
    
    # Arrêter Traefik
    ssh -o StrictHostKeyChecking=no root@$ip "cd /opt/meeshy && docker compose stop traefik" || true
    
    # Restaurer les certificats Let's Encrypt
    if [ -d "$backup_path/letsencrypt" ]; then
        scp -r -o StrictHostKeyChecking=no "$backup_path/letsencrypt/" root@$ip:/etc/
        log_success "✅ Certificats Let's Encrypt restaurés"
    fi
    
    # Restaurer la configuration Traefik
    if [ -d "$backup_path/traefik-config" ]; then
        scp -r -o StrictHostKeyChecking=no "$backup_path/traefik-config/" root@$ip:/opt/meeshy/traefik/
        log_success "✅ Configuration Traefik restaurée"
    fi
    
    # Redémarrer Traefik
    ssh -o StrictHostKeyChecking=no root@$ip "cd /opt/meeshy && docker compose up -d traefik"
    
    log_success "✅ Restauration SSL terminée"
    trace_deploy_operation "restore_certificates" "SUCCESS" "SSL restoration completed"
}

# Scan de sécurité SSL
ssl_security_scan() {
    local ip="$1"
    
    log_info "🔒 Scan de sécurité SSL..."
    
    for domain in "${MEESHY_DOMAINS[@]}"; do
        log_info "🔍 Analyse de sécurité pour $domain..."
        
        # Test de la configuration SSL
        local ssl_result=$(echo | openssl s_client -servername "$domain" -connect "$ip:443" 2>/dev/null)
        
        if [ $? -eq 0 ]; then
            echo "$ssl_result" | openssl x509 -noout -text | grep -E "(Signature Algorithm|Public Key|Not Before|Not After)" || true
            
            # Vérifier les ciphers supportés
            local cipher_test=$(nmap --script ssl-enum-ciphers -p 443 "$ip" 2>/dev/null | grep -A 10 "ssl-enum-ciphers" || echo "nmap non disponible")
            if [ "$cipher_test" != "nmap non disponible" ]; then
                echo "Ciphers supportés: $cipher_test"
            fi
        else
            log_warning "⚠️  Impossible de tester SSL pour $domain"
        fi
    done
}

# Réinitialiser complètement SSL
reset_ssl_complete() {
    local ip="$1"
    
    if [ "$FORCE_MODE" != "true" ]; then
        log_warning "⚠️  Cette opération va supprimer tous les certificats SSL"
        read -p "Confirmer la réinitialisation complète SSL? (oui/non): " confirm
        if [ "$confirm" != "oui" ]; then
            log_info "Opération annulée"
            return 0
        fi
    fi
    
    log_info "🔄 Réinitialisation complète SSL..."
    trace_deploy_operation "reset_ssl_complete" "STARTED" "Performing complete SSL reset"
    
    # Arrêter Traefik
    ssh -o StrictHostKeyChecking=no root@$ip "cd /opt/meeshy && docker compose stop traefik" || true
    
    # Supprimer tous les certificats
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        # Sauvegarder avant suppression
        if [ -d "/etc/letsencrypt" ]; then
            mv /etc/letsencrypt /etc/letsencrypt.backup.$(date +%Y%m%d_%H%M%S)
        fi
        
        # Supprimer la configuration Traefik SSL
        rm -f /opt/meeshy/traefik/dynamic/tls.yml
        
        # Réinitialiser la configuration Traefik de base
        cat > /opt/meeshy/traefik/traefik.yml << 'TRAEFIK_EOF'
global:
  checkNewVersion: false
  sendAnonymousUsage: false

api:
  dashboard: true
  insecure: true

entryPoints:
  web:
    address: ":80"

providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false

log:
  level: INFO

accessLog: {}
TRAEFIK_EOF
EOF
    
    # Redémarrer Traefik en mode HTTP seulement
    ssh -o StrictHostKeyChecking=no root@$ip "cd /opt/meeshy && docker compose up -d traefik"
    
    log_success "✅ SSL complètement réinitialisé"
    log_info "ℹ️  Utilisez 'setup-ssl' pour reconfigurer SSL"
    trace_deploy_operation "reset_ssl_complete" "SUCCESS" "SSL reset completed"
}

# Point d'entrée principal
main() {
    local command="${1:-help}"
    local ip="$2"
    
    # Parser les options
    shift 2 2>/dev/null || true
    while [[ $# -gt 0 ]]; do
        case $1 in
            --domain=*)
                DOMAIN="${1#*=}"
                shift
                ;;
            --email=*)
                EMAIL="${1#*=}"
                shift
                ;;
            --staging)
                USE_STAGING=true
                shift
                ;;
            --force)
                FORCE_MODE=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --backup-path=*)
                BACKUP_PATH="${1#*=}"
                shift
                ;;
            *)
                shift
                ;;
        esac
    done
    
    case "$command" in
        "setup-ssl")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            setup_ssl_complete "$ip"
            ;;
        "setup-staging")
            USE_STAGING=true
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            setup_ssl_complete "$ip"
            ;;
        "setup-production")
            USE_STAGING=false
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            setup_ssl_complete "$ip"
            ;;
        "status")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            show_ssl_status "$ip"
            ;;
        "renew")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            renew_certificates "$ip" "$DOMAIN"
            ;;
        "validate")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            validate_ssl_configuration "$ip"
            ;;
        "backup-certs")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            backup_certificates "$ip"
            ;;
        "restore-certs")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            restore_certificates "$ip"
            ;;
        "security-scan")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            ssl_security_scan "$ip"
            ;;
        "reset-ssl")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            reset_ssl_complete "$ip"
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
