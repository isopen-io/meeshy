#!/bin/bash

# Script de redéploiement rapide (sans recompiler)
# Usage: ./redeploy.sh

set -e

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
PROJECT_DIR="/Users/smpceo/Documents/Services/Meeshy/ios"
APP_NAME="Meeshy"
BUNDLE_ID="me.meeshy.app"
SIMULATOR_NAME="iPhone 16 Pro"
DERIVED_DATA_PATH="$PROJECT_DIR/DerivedData"
APP_PATH="$DERIVED_DATA_PATH/Build/Products/Debug-iphonesimulator/$APP_NAME.app"

echo -e "${BLUE}📲 Redéploiement de $APP_NAME...${NC}"

cd "$PROJECT_DIR"

# Trouver le simulateur
SIMULATOR_ID=$(xcrun simctl list devices | grep "$SIMULATOR_NAME" | grep -v "unavailable" | head -1 | grep -oE '\([A-F0-9-]+\)' | tr -d '()')

if [ -z "$SIMULATOR_ID" ]; then
    echo -e "${RED}✗ Simulateur non trouvé${NC}"
    exit 1
fi

# Vérifier que l'app existe
if [ ! -d "$APP_PATH" ]; then
    echo -e "${RED}✗ Application non compilée. Lancez ./build.sh d'abord${NC}"
    exit 1
fi

# Arrêter l'app si elle tourne
echo -e "${YELLOW}Arrêt de l'application...${NC}"
xcrun simctl terminate "$SIMULATOR_ID" "$BUNDLE_ID" 2>/dev/null || true

# Désinstaller l'ancienne version
echo -e "${YELLOW}Désinstallation...${NC}"
xcrun simctl uninstall "$SIMULATOR_ID" "$BUNDLE_ID" 2>/dev/null || true

# Installer
echo -e "${YELLOW}Installation...${NC}"
xcrun simctl install "$SIMULATOR_ID" "$APP_PATH"

# Lancer
echo -e "${YELLOW}Lancement...${NC}"
APP_PID=$(xcrun simctl launch "$SIMULATOR_ID" "$BUNDLE_ID")

echo -e "${GREEN}✅ Application relancée !${NC}"
echo -e "${BLUE}Process: $APP_PID${NC}"

