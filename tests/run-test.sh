#!/bin/bash

# Script de lancement des tests E2E Meeshy
# Usage: ./run-test.sh [quick|full] [conversationId]

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_TYPE="${1:-quick}"
CONVERSATION_ID="${2:-meeshy}"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Tests E2E Meeshy - Validation des traductions           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Vérifier que Node.js est installé
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js n'est pas installé${NC}"
    exit 1
fi

# Vérifier que pnpm est installé
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}⚠️  pnpm n'est pas installé, installation...${NC}"
    npm install -g pnpm
fi

# Vérifier que ts-node est disponible
if ! command -v ts-node &> /dev/null; then
    echo -e "${YELLOW}⚠️  ts-node n'est pas disponible${NC}"
    echo -e "${BLUE}📦 Installation des dépendances...${NC}"
    cd "$SCRIPT_DIR"
    pnpm install
fi

# Charger les variables d'environnement si le fichier .env existe
if [ -f "$SCRIPT_DIR/.env" ]; then
    echo -e "${GREEN}✅ Chargement des variables d'environnement${NC}"
    export $(cat "$SCRIPT_DIR/.env" | xargs)
else
    echo -e "${YELLOW}⚠️  Fichier .env non trouvé, utilisation des valeurs par défaut${NC}"
    echo -e "${BLUE}💡 Conseil: Copiez .env.example vers .env et configurez-le${NC}"
fi

# Afficher la configuration
echo -e "${BLUE}📋 Configuration:${NC}"
echo -e "   Gateway URL: ${GATEWAY_URL:-http://localhost:3001}"
echo -e "   Conversation: ${CONVERSATION_ID}"
echo -e "   Type de test: ${TEST_TYPE}"
echo ""

# Vérifier que le gateway est accessible
echo -e "${BLUE}🔍 Vérification de la connexion au Gateway...${NC}"
if curl -s -o /dev/null -w "%{http_code}" "${GATEWAY_URL:-http://localhost:3001}/health" | grep -q "200\|404"; then
    echo -e "${GREEN}✅ Gateway accessible${NC}"
else
    echo -e "${RED}❌ Gateway non accessible à ${GATEWAY_URL:-http://localhost:3001}${NC}"
    echo -e "${YELLOW}💡 Vérifiez que le Gateway Meeshy est démarré${NC}"
    echo -e "${YELLOW}   docker-compose up -d gateway${NC}"
    exit 1
fi

echo ""

# Exécuter le test approprié
cd "$SCRIPT_DIR"

case "$TEST_TYPE" in
    quick)
        echo -e "${BLUE}🚀 Lancement du test rapide...${NC}"
        echo ""
        pnpm ts-node quick-translation-test.ts "$CONVERSATION_ID"
        ;;
    full)
        echo -e "${BLUE}🚀 Lancement du test complet...${NC}"
        echo ""
        pnpm ts-node e2e-translation-test.ts "$CONVERSATION_ID"
        ;;
    *)
        echo -e "${RED}❌ Type de test invalide: $TEST_TYPE${NC}"
        echo ""
        echo -e "${YELLOW}Usage: $0 [quick|full] [conversationId]${NC}"
        echo ""
        echo -e "${BLUE}Exemples:${NC}"
        echo -e "  $0 quick meeshy       # Test rapide sur la conversation 'meeshy'"
        echo -e "  $0 full meeshy        # Test complet sur la conversation 'meeshy'"
        echo ""
        exit 1
        ;;
esac

# Afficher le résultat
EXIT_CODE=$?
echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✅ TEST TERMINÉ AVEC SUCCÈS                              ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ❌ TEST ÉCHOUÉ                                            ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
fi

exit $EXIT_CODE

