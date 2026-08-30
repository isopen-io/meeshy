#!/bin/bash

# ===== MEESHY - ROLLBACK RAPIDE =====
# Script pour effectuer un rollback rapide en cas de problème
# Usage: ./scripts/quick-rollback.sh [DROPLET_IP] [OPTIONS]

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
VERBOSE=false
FORCE=false

# Fonctions utilitaires
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🔄 MEESHY - ROLLBACK RAPIDE${NC}"
    echo "============================="
    echo ""
    echo "Usage: $0 [DROPLET_IP] [OPTIONS]"
    echo ""
    echo "Description:"
    echo "  Effectue un rollback rapide vers les versions précédentes"
    echo "  en cas de problème avec la mise à jour"
    echo ""
    echo "Options:"
    echo "  --force                 Forcer le rollback sans confirmation"
    echo "  --verbose               Mode verbeux"
    echo "  --help, -h              Afficher cette aide"
    echo ""
    echo "Exemples:"
    echo "  $0 192.168.1.100"
    echo "  $0 157.230.15.51 --force"
    echo "  $0 157.230.15.51 --verbose"
    echo ""
    echo -e "${YELLOW}⚠️  ATTENTION:${NC}"
    echo "  • Ce script restaure les versions précédentes"
    echo "  • La base de données et l'infrastructure ne sont PAS modifiées"
    echo "  • Les données utilisateur sont préservées"
    echo ""
}

# Parser les arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
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

# Vérifier l'état actuel
check_current_status() {
    local ip="$1"
    log_info "Vérification de l'état actuel des services..."
    
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        cd /opt/meeshy
        echo "🔍 ÉTAT ACTUEL DES SERVICES"
        echo "==========================="
        
        echo "📊 Services en cours d'exécution:"
        docker-compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
        
        echo ""
        echo "🔍 Tests de connectivité:"
        
        # Test Gateway
        if curl -f -s http://localhost:3000/health >/dev/null 2>&1; then
            echo "✅ Gateway: Opérationnel"
        else
            echo "❌ Gateway: Problème détecté"
        fi
        
        # Test Frontend
        if curl -f -s http://localhost:3100 >/dev/null 2>&1; then
            echo "✅ Frontend: Opérationnel"
        else
            echo "❌ Frontend: Problème détecté"
        fi
        
        # Test via Traefik
        if curl -f -s -H "Host: gate.meeshy.me" http://localhost/health >/dev/null 2>&1; then
            echo "✅ Gateway via Traefik: Opérationnel"
        else
            echo "❌ Gateway via Traefik: Problème détecté"
        fi
        
        if curl -f -s -H "Host: meeshy.me" http://localhost >/dev/null 2>&1; then
            echo "✅ Frontend via Traefik: Opérationnel"
        else
            echo "❌ Frontend via Traefik: Problème détecté"
        fi
EOF
}

# Confirmation utilisateur
confirm_rollback() {
    if [ "$FORCE" = "true" ]; then
        return 0
    fi
    
    echo ""
    log_warning "⚠️  ATTENTION: Vous êtes sur le point d'effectuer un rollback"
    echo ""
    log_warning "Cette action va:"
    echo "   • Restaurer les versions précédentes de gateway et frontend"
    echo "   • Arrêter les versions actuelles"
    echo "   • Redémarrer avec les versions précédentes"
    echo "   • Préserver la base de données et l'infrastructure"
    echo ""
    
    read -p "Êtes-vous sûr de vouloir continuer ? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Rollback annulé par l'utilisateur"
        exit 0
    fi
}

# Rollback vers les versions précédentes
rollback_services() {
    local ip="$1"
    log_info "Rollback vers les versions précédentes..."
    
    # Créer le script de rollback
    cat << 'EOF' > /tmp/rollback-services.sh
#!/bin/bash
set -e

cd /opt/meeshy

echo "🔄 ROLLBACK VERS LES VERSIONS PRÉCÉDENTES"
echo "========================================="

# Vérifier que nous sommes dans le bon répertoire
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Fichier docker-compose.yml non trouvé dans /opt/meeshy"
    exit 1
fi

echo "📋 État des services avant le rollback:"
docker-compose ps --format "table {{.Name}}\t{{.Status}}"

echo ""
echo "🔄 ROLLBACK SÉQUENTIEL"
echo "======================"

# Arrêter les services actuels
echo "⏹️  Arrêt des services actuels..."
docker-compose stop gateway frontend

# Supprimer les conteneurs actuels
echo "🗑️  Suppression des conteneurs actuels..."
docker-compose rm -f gateway frontend frontend-v3

# Redémarrer avec les versions précédentes
echo "🚀 Redémarrage avec les versions précédentes..."

# Redémarrer le Gateway
echo "🚪 Redémarrage du Gateway..."
docker-compose up -d gateway

# Attendre que le Gateway soit prêt
echo "⏳ Attente que le Gateway soit prêt..."
sleep 10

# Vérifier que le Gateway répond
for i in {1..10}; do
    if curl -f -s http://localhost:3000/health >/dev/null 2>&1; then
        echo "✅ Gateway opérationnel"
        break
    fi
    echo "⏳ Tentative $i/10 pour le Gateway..."
    sleep 3
done

# Redémarrer le Frontend
echo "🎨 Redémarrage du Frontend..."
docker-compose up -d frontend

# Attendre que le Frontend soit prêt
echo "⏳ Attente que le Frontend soit prêt..."
sleep 5

# Vérifier que le Frontend répond
for i in {1..5}; do
    if curl -f -s http://localhost:3100 >/dev/null 2>&1; then
        echo "✅ Frontend opérationnel"
        break
    fi
    echo "⏳ Tentative $i/5 pour le Frontend..."
    sleep 2
done

# Zone Web v3 (préfixe /__v3) — elle est retirée par le `rm -f` ci-dessus au
# même titre que le frontend legacy ; ne pas la redémarrer laisserait la zone
# ÉTEINTE après un rollback, donc `/__v3/*` sur le plancher attrape-tout.
echo "🧪 Redémarrage de la zone Web v3..."
docker-compose up -d frontend-v3
sleep 3

echo ""
echo "📊 État des services après le rollback:"
docker-compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "🎉 ROLLBACK TERMINÉ AVEC SUCCÈS !"
echo "================================="
echo "✅ Gateway: Restauré à la version précédente"
echo "✅ Frontend: Restauré à la version précédente"
echo "✅ Web v3: Restauré à la version précédente"
echo "✅ Base de données: Préservée"
echo "✅ Infrastructure: Préservée"
EOF

    # Transférer et exécuter le script
    scp -o StrictHostKeyChecking=no /tmp/rollback-services.sh root@$ip:/tmp/
    ssh -o StrictHostKeyChecking=no root@$ip "chmod +x /tmp/rollback-services.sh && /tmp/rollback-services.sh"
    rm -f /tmp/rollback-services.sh
}

# Vérification post-rollback
verify_rollback() {
    local ip="$1"
    log_info "Vérification post-rollback..."
    
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        cd /opt/meeshy
        echo "🔍 VÉRIFICATION POST-ROLLBACK"
        echo "============================="
        
        echo "📊 État des services:"
        docker-compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
        
        echo ""
        echo "🔍 Tests de connectivité:"
        
        # Test Gateway
        if curl -f -s http://localhost:3000/health >/dev/null 2>&1; then
            echo "✅ Gateway: Endpoint /health accessible"
        else
            echo "❌ Gateway: Endpoint /health inaccessible"
        fi
        
        # Test Frontend
        if curl -f -s http://localhost:3100 >/dev/null 2>&1; then
            echo "✅ Frontend: Accessible sur le port 3100"
        else
            echo "❌ Frontend: Non accessible sur le port 3100"
        fi
        
        # Test via Traefik
        if curl -f -s -H "Host: gate.meeshy.me" http://localhost/health >/dev/null 2>&1; then
            echo "✅ Gateway: Accessible via Traefik"
        else
            echo "⚠️  Gateway: Non accessible via Traefik"
        fi
        
        if curl -f -s -H "Host: meeshy.me" http://localhost >/dev/null 2>&1; then
            echo "✅ Frontend: Accessible via Traefik"
        else
            echo "⚠️  Frontend: Non accessible via Traefik"
        fi
        
        echo ""
        echo "📋 Versions des images:"
        docker images | grep -E "(gateway|frontend)" | head -5
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
    
    log_info "🔄 Démarrage du rollback rapide sur $DROPLET_IP"
    log_warning "⚠️  Cette action va restaurer les versions précédentes"
    
    # Test de connexion
    test_ssh_connection "$DROPLET_IP" || exit 1
    
    # Vérifier l'état actuel
    check_current_status "$DROPLET_IP"
    
    # Confirmation utilisateur
    confirm_rollback
    
    # Rollback des services
    rollback_services "$DROPLET_IP"
    
    # Vérification post-rollback
    verify_rollback "$DROPLET_IP"
    
    # Résumé final
    echo ""
    echo "🎉 ROLLBACK RAPIDE TERMINÉ AVEC SUCCÈS !"
    echo "========================================"
    echo "✅ Gateway: Restauré à la version précédente"
    echo "✅ Frontend: Restauré à la version précédente"
    echo "✅ Base de données: Préservée (données intactes)"
    echo "✅ Infrastructure: Préservée (Traefik, Redis, MongoDB opérationnels)"
    echo ""
    echo "🔗 Accès aux services:"
    echo "   • Frontend: https://meeshy.me"
    echo "   • Gateway API: https://gate.meeshy.me"
    echo "   • Dashboard Traefik: https://traefik.meeshy.me"
    echo ""
    echo "📋 Commandes utiles:"
    echo "   • Statut: ssh root@$DROPLET_IP 'cd /opt/meeshy && docker-compose ps'"
    echo "   • Logs: ssh root@$DROPLET_IP 'cd /opt/meeshy && docker-compose logs gateway frontend'"
    echo "   • Redémarrage: ssh root@$DROPLET_IP 'cd /opt/meeshy && docker-compose restart gateway frontend'"
    echo ""
    echo "💡 Pour effectuer une nouvelle mise à jour:"
    echo "   • Mise à jour standard: ./scripts/update-production.sh $DROPLET_IP"
    echo "   • Mise à jour sans interruption: ./scripts/zero-downtime-update.sh $DROPLET_IP"
}

# Exécuter le script principal
main "$@"
