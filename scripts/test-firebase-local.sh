#!/bin/bash

# =============================================================================
# MEESHY - TEST FIREBASE EN LOCAL
# =============================================================================
# Script pour tester rapidement que Firebase fonctionne en local
# Usage: ./scripts/test-firebase-local.sh
# =============================================================================

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}🔥 MEESHY - TEST FIREBASE LOCAL${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Test 1: Vérifier les fichiers
log_info "Test 1/5 : Vérification des fichiers secrets..."

if [ -f "$PROJECT_ROOT/secrets/firebase-admin-dev.json" ]; then
    log_success "firebase-admin-dev.json présent"
else
    log_error "firebase-admin-dev.json MANQUANT"
    echo "   Exécutez : ./scripts/setup-firebase-local.sh --setup"
    exit 1
fi

# Test 2: Vérifier .env gateway
log_info "Test 2/5 : Vérification .env du gateway..."

if [ -f "$PROJECT_ROOT/services/gateway/.env" ]; then
    log_success ".env gateway existe"

    if grep -q "ENABLE_FCM_PUSH=true" "$PROJECT_ROOT/services/gateway/.env"; then
        log_success "FCM activé"
    else
        log_error "FCM désactivé"
        exit 1
    fi
else
    log_error ".env gateway manquant"
    exit 1
fi

# Test 3: Vérifier si Docker est lancé (optionnel)
log_info "Test 3/5 : Vérification environnement Docker..."

if command -v docker &> /dev/null; then
    if docker ps | grep -q "meeshy-local-gateway"; then
        log_success "Container gateway Docker en cours d'exécution"

        # Vérifier les logs Firebase
        log_info "Analyse des logs Docker..."
        if docker logs meeshy-local-gateway 2>&1 | grep -q "Firebase Admin SDK initialized successfully"; then
            log_success "Firebase initialisé avec succès dans Docker !"
        else
            log_error "Firebase NON initialisé dans Docker"
            echo ""
            echo "Logs pertinents :"
            docker logs meeshy-local-gateway 2>&1 | grep -i firebase | tail -5
            exit 1
        fi
    else
        log_info "Container Docker non lancé (OK si vous testez sans Docker)"
    fi
else
    log_info "Docker non installé (OK si vous testez sans Docker)"
fi

# Test 4: Vérifier le service gateway (sans Docker)
log_info "Test 4/5 : Vérification service gateway local..."

if lsof -i :3000 &> /dev/null; then
    log_success "Gateway tourne sur le port 3000"

    # Tester l'API health
    if command -v curl &> /dev/null; then
        response=$(curl -s http://localhost:3000/health 2>/dev/null || echo "")
        if [ -n "$response" ]; then
            log_success "API gateway répond"
        else
            log_info "API gateway ne répond pas (démarrage en cours ?)"
        fi
    fi
else
    log_info "Gateway non lancé sur port 3000 (OK si Docker utilisé)"
fi

# Test 5: Instructions de test manuel
echo ""
log_info "Test 5/5 : Instructions de test manuel"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}🧪 TESTS MANUELS RECOMMANDÉS${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "1. 📡 Test WebSocket (toujours actif) :"
echo "   • Ouvrez deux navigateurs"
echo "   • Connectez-vous avec deux comptes différents"
echo "   • Envoyez un message d'un compte à l'autre"
echo "   • La notification doit apparaître instantanément"
echo ""
echo "2. 🔥 Test Firebase Push (utilisateur déconnecté) :"
echo "   • Ouvrez le frontend sur Chrome/Firefox"
echo "   • Acceptez les permissions de notifications"
echo "   • Fermez l'onglet (mais gardez le navigateur ouvert)"
echo "   • Envoyez un message à ce compte"
echo "   • Une notification système doit apparaître"
echo ""
echo "3. 📱 Test APNS VoIP (iOS uniquement) :"
echo "   • App iOS installée sur device physique"
echo "   • Appelez l'utilisateur depuis un autre compte"
echo "   • Notification VoIP doit apparaître même si app fermée"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
log_success "Tous les tests automatiques réussis ! ✅"
echo ""
log_info "📚 Documentation complète : docs/FIREBASE_LOCAL_SETUP.md"
echo ""
