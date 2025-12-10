#!/bin/bash

# ===== MEESHY - VÉRIFICATION POST-RÉINITIALISATION DES MOTS DE PASSE =====
# Script pour vérifier que tous les services fonctionnent après la réinitialisation
# Usage: ./scripts/production/verify-password-reset.sh [DROPLET_IP]

set -e

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Variables
DROPLET_IP=""
DOMAIN="meeshy.me"

# Fonctions utilitaires
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

show_help() {
    echo -e "${CYAN}🔍 MEESHY - VÉRIFICATION POST-RÉINITIALISATION${NC}"
    echo "=============================================="
    echo ""
    echo "Usage: $0 [DROPLET_IP]"
    echo ""
    echo "Vérifie que tous les services fonctionnent après"
    echo "la réinitialisation des mots de passe."
    echo ""
}

# Vérification de l'état des conteneurs
check_containers() {
    log_info "Vérification de l'état des conteneurs..."
    
    ssh root@$DROPLET_IP << 'EOF'
        cd /opt/meeshy
        echo "📊 État des conteneurs:"
        docker-compose ps
        echo ""
        
        # Vérifier que tous les conteneurs sont Up
        failed_containers=$(docker-compose ps | grep -v "Up" | grep -v "NAME" | wc -l)
        if [ "$failed_containers" -gt 0 ]; then
            echo "❌ Certains conteneurs ne sont pas en état Up"
            exit 1
        else
            echo "✅ Tous les conteneurs sont Up"
        fi
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Tous les conteneurs sont opérationnels"
    else
        log_error "Certains conteneurs ont des problèmes"
        return 1
    fi
}

# Vérification de Traefik
check_traefik() {
    log_info "Vérification de Traefik Dashboard..."
    
    # Test sans authentification (doit échouer avec 401)
    status=$(curl -s -o /dev/null -w "%{http_code}" https://traefik.$DOMAIN)
    
    if [ "$status" == "401" ]; then
        log_success "Traefik Dashboard requiert l'authentification (401) ✅"
        log_warning "Testez manuellement avec: https://traefik.$DOMAIN"
    else
        log_warning "Statut Traefik inattendu: $status"
    fi
}

# Vérification de MongoDB UI
check_mongodb_ui() {
    log_info "Vérification de MongoDB UI..."
    
    status=$(curl -s -o /dev/null -w "%{http_code}" https://mongo.$DOMAIN)
    
    if [ "$status" == "401" ] || [ "$status" == "200" ]; then
        log_success "MongoDB UI accessible"
        log_warning "Testez manuellement avec: https://mongo.$DOMAIN"
    else
        log_warning "Statut MongoDB UI inattendu: $status"
    fi
}

# Vérification de Redis UI
check_redis_ui() {
    log_info "Vérification de Redis UI..."
    
    status=$(curl -s -o /dev/null -w "%{http_code}" https://redis.$DOMAIN)
    
    if [ "$status" == "401" ] || [ "$status" == "200" ]; then
        log_success "Redis UI accessible"
        log_warning "Testez manuellement avec: https://redis.$DOMAIN"
    else
        log_warning "Statut Redis UI inattendu: $status"
    fi
}

# Vérification du Gateway
check_gateway() {
    log_info "Vérification du Gateway..."
    
    status=$(curl -s -o /dev/null -w "%{http_code}" https://gate.$DOMAIN/health)
    
    if [ "$status" == "200" ]; then
        log_success "Gateway opérationnel (200 OK)"
    else
        log_error "Gateway non accessible (status: $status)"
        return 1
    fi
}

# Vérification du Translator
check_translator() {
    log_info "Vérification du Translator..."
    
    status=$(curl -s -o /dev/null -w "%{http_code}" https://ml.$DOMAIN/health)
    
    if [ "$status" == "200" ]; then
        log_success "Translator opérationnel (200 OK)"
    else
        log_error "Translator non accessible (status: $status)"
        return 1
    fi
}

# Vérification du Frontend
check_frontend() {
    log_info "Vérification du Frontend..."
    
    status=$(curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN)
    
    if [ "$status" == "200" ]; then
        log_success "Frontend accessible (200 OK)"
    else
        log_error "Frontend non accessible (status: $status)"
        return 1
    fi
}

# Vérification des logs
check_logs() {
    log_info "Vérification des logs récents..."
    
    ssh root@$DROPLET_IP << 'EOF'
        cd /opt/meeshy
        echo "📋 Logs récents du Gateway:"
        docker-compose logs --tail=20 gateway | grep -i "error" || echo "Aucune erreur détectée"
        echo ""
        echo "📋 Logs récents de Traefik:"
        docker-compose logs --tail=20 traefik | grep -i "error" || echo "Aucune erreur détectée"
EOF
    
    log_success "Vérification des logs terminée"
}

# Afficher le récapitulatif
show_summary() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}           RÉCAPITULATIF DE LA VÉRIFICATION            ${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${GREEN}✅ SERVICES VÉRIFIÉS${NC}"
    echo ""
    echo "🌐 URLs à tester manuellement:"
    echo "   • Traefik Dashboard: https://traefik.$DOMAIN"
    echo "   • MongoDB UI:        https://mongo.$DOMAIN"
    echo "   • Redis UI:          https://redis.$DOMAIN"
    echo "   • Gateway:           https://gate.$DOMAIN"
    echo "   • Translator:        https://ml.$DOMAIN"
    echo "   • Frontend:          https://$DOMAIN"
    echo ""
    echo -e "${YELLOW}📝 PROCHAINES ÉTAPES:${NC}"
    echo "   1. Tester la connexion aux interfaces d'administration"
    echo "   2. Tester la connexion à l'application avec les 3 utilisateurs"
    echo "   3. Vérifier que les données MongoDB sont intactes"
    echo "   4. Sauvegarder les nouveaux mots de passe dans un gestionnaire"
    echo ""
    echo -e "${GREEN}🎉 Vérification terminée!${NC}"
    echo ""
}

# Fonction principale
main() {
    if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
        show_help
        exit 0
    fi
    
    if [ -z "$1" ]; then
        log_error "Adresse IP du serveur requise"
        show_help
        exit 1
    fi
    
    DROPLET_IP="$1"
    
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║       VÉRIFICATION POST-RÉINITIALISATION DES MOTS DE PASSE    ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    log_info "Serveur: $DROPLET_IP"
    log_info "Domaine: $DOMAIN"
    echo ""
    
    # Exécuter les vérifications
    check_containers
    check_traefik
    check_mongodb_ui
    check_redis_ui
    check_gateway
    check_translator
    check_frontend
    check_logs
    show_summary
}

# Exécution
main "$@"
