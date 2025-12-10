#!/bin/bash

# ===== MEESHY - DÉCOMMISSIONNEMENT DES SERVICES =====
# Script pour décommissionner proprement les services gateway et frontend
# Usage: ./scripts/decommission-services.sh [DROPLET_IP] [OPTIONS]

set -e

# Couleurs pour les logs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Variables globales
DROPLET_IP=""
SERVICES="gateway frontend"
VERBOSE=false
FORCE=false

# Fonctions utilitaires
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🛑 MEESHY - DÉCOMMISSIONNEMENT DES SERVICES${NC}"
    echo "============================================="
    echo ""
    echo "Usage: $0 [DROPLET_IP] [OPTIONS]"
    echo ""
    echo "Description:"
    echo "  Décommissionne proprement les services gateway et frontend"
    echo "  en production avant de déployer les nouvelles versions"
    echo ""
    echo "Options:"
    echo "  --services=SERVICES     Services à décommissionner (défaut: gateway frontend)"
    echo "  --force                 Forcer le décommissionnement sans confirmation"
    echo "  --verbose               Mode verbeux"
    echo "  --help, -h              Afficher cette aide"
    echo ""
    echo "Exemples:"
    echo "  $0 192.168.1.100"
    echo "  $0 157.230.15.51 --force"
    echo "  $0 157.230.15.51 --services=gateway"
    echo "  $0 157.230.15.51 --verbose"
    echo ""
    echo -e "${YELLOW}⚠️  ATTENTION:${NC}"
    echo "  • Ce script arrête et supprime les conteneurs des services spécifiés"
    echo "  • La base de données et l'infrastructure ne sont PAS affectées"
    echo "  • Les volumes de données sont préservés"
    echo ""
}

# Parser les arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --services=*)
                SERVICES="${1#*=}"
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                if [ -z "$DROPLET_IP" ]; then
                    DROPLET_IP="$1"
                fi
                shift
                ;;
        esac
    done
}

# Test de connexion SSH
test_ssh_connection() {
    local ip="$1"
    log_info "Test de connexion SSH vers $ip..."
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@$ip "echo 'Connexion SSH réussie'" >/dev/null 2>&1; then
        log_success "Connexion SSH réussie"
        return 0
    else
        log_error "Impossible de se connecter au serveur $ip"
        return 1
    fi
}

# Vérifier l'état actuel des services
check_current_status() {
    local ip="$1"
    log_info "Vérification de l'état actuel des services..."
    
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        cd /opt/meeshy
        echo "=== ÉTAT ACTUEL DES SERVICES ==="
        docker-compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
        echo ""
        echo "=== SERVICES À DÉCOMMISSIONNER ==="
        for service in gateway frontend; do
            if docker-compose ps --format "{{.Name}} {{.Status}}" | grep -q "$service.*Up"; then
                echo "✅ $service: En cours d'exécution"
            else
                echo "❌ $service: Non démarré"
            fi
        done
EOF
}

# Confirmation utilisateur
confirm_decommission() {
    if [ "$FORCE" = "true" ]; then
        return 0
    fi
    
    echo ""
    log_warning "⚠️  ATTENTION: Vous êtes sur le point de décommissionner les services suivants:"
    echo "   • $SERVICES"
    echo ""
    log_warning "Cette action va:"
    echo "   • Arrêter les conteneurs des services spécifiés"
    echo "   • Supprimer les conteneurs (mais pas les volumes)"
    echo "   • Préserver la base de données et l'infrastructure"
    echo ""
    
    read -p "Êtes-vous sûr de vouloir continuer ? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Décommissionnement annulé par l'utilisateur"
        exit 0
    fi
}

# Décommissionner les services
decommission_services() {
    local ip="$1"
    log_info "Décommissionnement des services: $SERVICES"
    
    # Créer le script de décommissionnement
    cat << EOF > /tmp/decommission.sh
#!/bin/bash
set -e

echo "🛑 DÉCOMMISSIONNEMENT DES SERVICES"
echo "=================================="

cd /opt/meeshy

# Vérifier que nous sommes dans le bon répertoire
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Fichier docker-compose.yml non trouvé dans /opt/meeshy"
    exit 1
fi

echo "📋 État des services avant le décommissionnement:"
docker-compose ps --format "table {{.Name}}\t{{.Status}}"

echo ""
echo "🛑 DÉCOMMISSIONNEMENT SÉQUENTIEL"
echo "================================"

# Décommissionner chaque service
for service in $SERVICES; do
    echo "⏹️  Arrêt du service \$service..."
    docker-compose stop \$service || echo "⚠️  Service \$service déjà arrêté"
    
    echo "🗑️  Suppression du conteneur \$service..."
    docker-compose rm -f \$service || echo "⚠️  Conteneur \$service déjà supprimé"
    
    echo "✅ Service \$service décommissionné"
    echo ""
done

echo "📊 État des services après le décommissionnement:"
docker-compose ps --format "table {{.Name}}\t{{.Status}}"

echo ""
echo "🎉 DÉCOMMISSIONNEMENT TERMINÉ AVEC SUCCÈS !"
echo "==========================================="
echo "✅ Services décommissionnés: $SERVICES"
echo "✅ Base de données: Préservée"
echo "✅ Infrastructure: Préservée"
echo "✅ Volumes: Préservés"
echo ""
echo "💡 Les services peuvent maintenant être redéployés avec les nouvelles versions"
EOF

    # Transférer et exécuter le script
    scp -o StrictHostKeyChecking=no /tmp/decommission.sh root@$ip:/tmp/
    ssh -o StrictHostKeyChecking=no root@$ip "chmod +x /tmp/decommission.sh && /tmp/decommission.sh"
    rm -f /tmp/decommission.sh
}

# Vérification post-décommissionnement
verify_decommission() {
    local ip="$1"
    log_info "Vérification post-décommissionnement..."
    
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        cd /opt/meeshy
        echo "🔍 VÉRIFICATION POST-DÉCOMMISSIONNEMENT"
        echo "======================================"
        
        echo "📊 État des services:"
        docker-compose ps --format "table {{.Name}}\t{{.Status}}"
        
        echo ""
        echo "🔍 Vérification des services décommissionnés:"
        for service in gateway frontend; do
            if docker-compose ps --format "{{.Name}} {{.Status}}" | grep -q "$service.*Up"; then
                echo "❌ $service: Toujours en cours d'exécution"
            else
                echo "✅ $service: Correctement décommissionné"
            fi
        done
        
        echo ""
        echo "🔍 Vérification des services préservés:"
        for service in traefik database redis translator; do
            if docker-compose ps --format "{{.Name}} {{.Status}}" | grep -q "$service.*Up"; then
                echo "✅ $service: Toujours opérationnel"
            else
                echo "⚠️  $service: Non démarré"
            fi
        done
        
        echo ""
        echo "📁 Vérification des volumes préservés:"
        docker volume ls | grep meeshy || echo "Aucun volume meeshy trouvé"
EOF
}

# Fonction principale
main() {
    # Parser les arguments
    parse_arguments "$@"
    
    # Vérifier que l'IP est fournie
    if [ -z "$DROPLET_IP" ]; then
        log_error "IP du serveur manquante"
        show_help
        exit 1
    fi
    
    log_info "🛑 Démarrage du décommissionnement sur $DROPLET_IP"
    log_info "Services à décommissionner: $SERVICES"
    log_warning "⚠️  La base de données et l'infrastructure seront préservées"
    
    # Test de connexion
    test_ssh_connection "$DROPLET_IP" || exit 1
    
    # Vérifier l'état actuel
    check_current_status "$DROPLET_IP"
    
    # Confirmation utilisateur
    confirm_decommission
    
    # Décommissionner les services
    decommission_services "$DROPLET_IP"
    
    # Vérification post-décommissionnement
    verify_decommission "$DROPLET_IP"
    
    # Résumé final
    echo ""
    echo "🎉 DÉCOMMISSIONNEMENT TERMINÉ AVEC SUCCÈS !"
    echo "==========================================="
    echo "✅ Services décommissionnés: $SERVICES"
    echo "✅ Base de données: Préservée (données intactes)"
    echo "✅ Infrastructure: Préservée (Traefik, Redis, MongoDB opérationnels)"
    echo "✅ Volumes: Préservés (données persistantes intactes)"
    echo ""
    echo "🚀 Prochaines étapes:"
    echo "   • Déployer les nouvelles versions avec: ./scripts/update-gateway-frontend.sh $DROPLET_IP"
    echo "   • Ou utiliser le script de déploiement rapide: ./scripts/deploy-update.sh $DROPLET_IP"
    echo ""
    echo "📋 Commandes utiles:"
    echo "   • Statut: ssh root@$DROPLET_IP 'cd /opt/meeshy && docker-compose ps'"
    echo "   • Logs: ssh root@$DROPLET_IP 'cd /opt/meeshy && docker-compose logs'"
    echo "   • Redémarrage complet: ssh root@$DROPLET_IP 'cd /opt/meeshy && docker-compose up -d'"
}

# Exécuter le script principal
main "$@"
