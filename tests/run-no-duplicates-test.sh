#!/bin/bash

# Script pour exécuter le test de vérification des doublons de traductions

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test: Vérification des doublons${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Paramètres par défaut
CONVERSATION_ID="${1:-meeshy}"
USERNAME="${2:-admin}"
PASSWORD="${3:-admin123}"
GATEWAY_URL="${GATEWAY_URL:-http://localhost:3000}"

echo -e "${YELLOW}Configuration:${NC}"
echo "  Conversation: $CONVERSATION_ID"
echo "  User: $USERNAME"
echo "  Gateway: $GATEWAY_URL"
echo ""

# Vérifier que node_modules existe
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  node_modules non trouvé, installation...${NC}"
    npm install
fi

# Vérifier que ts-node est disponible
if ! command -v ts-node &> /dev/null; then
    echo -e "${YELLOW}⚠️  ts-node non trouvé, installation...${NC}"
    npm install -D ts-node @types/node
fi

echo -e "${GREEN}🚀 Lancement du test...${NC}"
echo ""

# Exécuter le test
ts-node no-duplicate-translations-test.ts "$CONVERSATION_ID" "$USERNAME" "$PASSWORD"

# Capturer le code de sortie
EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✅ Test réussi - Aucun doublon détecté!${NC}"
else
    echo -e "${RED}❌ Test échoué - Des problèmes ont été détectés${NC}"
    echo ""
    echo -e "${YELLOW}💡 Actions recommandées:${NC}"
    echo "  1. Vérifier que l'index unique MongoDB est créé:"
    echo "     mongosh --eval \"use meeshy; db.MessageTranslation.getIndexes()\""
    echo ""
    echo "  2. Nettoyer les doublons existants:"
    echo "     node ../scripts/cleanup-duplicate-translations.js"
    echo ""
    echo "  3. Vérifier les logs du gateway pour les erreurs"
    echo ""
fi

exit $EXIT_CODE

