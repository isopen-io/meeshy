#!/bin/bash

# Script de compilation rapide (sans arrêter le simulateur)
# Usage: ./build.sh

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_DIR="/Users/smpceo/Documents/Services/Meeshy/ios"
APP_NAME="Meeshy"
BUNDLE_ID="com.meeshy.app"
SCHEME="Meeshy"
SIMULATOR_NAME="iPhone 16 Pro"
DERIVED_DATA_PATH="$PROJECT_DIR/DerivedData"

echo -e "${BLUE}🔨 Compilation de $APP_NAME...${NC}"

cd "$PROJECT_DIR"

# Trouver le simulateur
SIMULATOR_ID=$(xcrun simctl list devices | grep "$SIMULATOR_NAME" | grep -v "unavailable" | head -1 | grep -oE '\([A-F0-9-]+\)' | tr -d '()')

if [ -z "$SIMULATOR_ID" ]; then
    echo -e "${RED}✗ Simulateur non trouvé${NC}"
    exit 1
fi

# Compiler
xcodebuild \
    -scheme "$SCHEME" \
    -destination "id=$SIMULATOR_ID" \
    -derivedDataPath "$DERIVED_DATA_PATH" \
    build \
    2>&1 | tail -10

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ BUILD SUCCEEDED${NC}"
else
    echo -e "${RED}❌ BUILD FAILED${NC}"
    exit 1
fi

