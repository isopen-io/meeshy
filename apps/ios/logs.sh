#!/bin/bash

# Script simple pour voir les logs de l'application en temps réel
# Usage: ./logs.sh
# 
# 💡 Pour plus d'options, utilisez: ./debug_logs.sh [all|error|warning|info|debug|file]

# Couleurs
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

APP_NAME="Meeshy"
SIMULATOR_NAME="iPhone 16 Pro"

echo -e "${BLUE}📋 Logs de $APP_NAME en temps réel...${NC}"
echo -e "${YELLOW}(Ctrl+C pour quitter)${NC}"
echo ""
echo -e "${GREEN}💡 Tip: Utilisez ./debug_logs.sh pour plus d'options de filtrage${NC}"
echo ""

SIMULATOR_ID=$(xcrun simctl list devices | grep "$SIMULATOR_NAME" | grep -v "unavailable" | head -1 | grep -oE '\([A-F0-9-]+\)' | tr -d '()')

if [ -z "$SIMULATOR_ID" ]; then
    echo "✗ Simulateur non trouvé"
    echo ""
    echo "Simulateurs disponibles:"
    xcrun simctl list devices | grep "iPhone"
    exit 1
fi

echo -e "${BLUE}Simulateur: $SIMULATOR_NAME${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""

xcrun simctl spawn "$SIMULATOR_ID" log stream --predicate "process == \"$APP_NAME\"" --level debug

