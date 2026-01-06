#!/bin/bash

# Script de compilation et déploiement complet de l'app Meeshy iOS
# Usage: ./deploy.sh [debug|release]
# Par défaut: debug

set -e  # Exit on error

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
BUILD_CONFIG="${1:-Debug}"  # Debug par défaut, ou Release si spécifié
if [[ "$BUILD_CONFIG" == "release" ]]; then
    BUILD_CONFIG="Release"
fi
if [[ "$BUILD_CONFIG" == "debug" ]]; then
    BUILD_CONFIG="Debug"
fi

PROJECT_DIR="/Users/smpceo/Documents/Services/Meeshy/ios"
SCHEME="Meeshy"
SIMULATOR_NAME="iPhone 16 Pro"
DERIVED_DATA_PATH="$PROJECT_DIR/DerivedData"

# App name and Bundle ID depend on build configuration
if [[ "$BUILD_CONFIG" == "Release" ]]; then
    APP_NAME="Meeshy"
    BUNDLE_ID="me.meeshy.app"
else
    APP_NAME="Meeshy-Dev"
    BUNDLE_ID="me.meeshy.app.debug"
fi

APP_PATH="$DERIVED_DATA_PATH/Build/Products/$BUILD_CONFIG-iphonesimulator/$APP_NAME.app"
LOG_FILE="$PROJECT_DIR/deploy_debug.log"

# Mode debug verbeux
DEBUG_MODE=true
if [ "$DEBUG_MODE" = true ]; then
    set -x  # Active le mode trace
fi

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}║         🚀 MEESHY iOS - DÉPLOIEMENT COMPLET 🚀              ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${MAGENTA}🐛 MODE: $BUILD_CONFIG${NC}"
echo -e "${MAGENTA}📝 Log: $LOG_FILE${NC}"
echo ""

# Initialiser le fichier log
echo "=== MEESHY iOS DEPLOY LOG - $(date) ===" > "$LOG_FILE"
echo "Build Configuration: $BUILD_CONFIG" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# Étape 1: Navigation vers le projet
echo -e "${YELLOW}📂 [1/8] Navigation vers le projet...${NC}"
cd "$PROJECT_DIR"
echo -e "${GREEN}✓ Dans le dossier: $(pwd)${NC}"
echo "Current directory: $(pwd)" >> "$LOG_FILE"
echo ""

# Étape 2: Régénération du projet avec XcodeGen
echo -e "${YELLOW}🔧 [2/8] Régénération du projet avec XcodeGen...${NC}"
if command -v xcodegen &> /dev/null; then
    xcodegen generate
    echo -e "${GREEN}✓ Projet Xcode régénéré${NC}"
else
    echo -e "${RED}✗ XcodeGen non trouvé, passage à l'étape suivante${NC}"
fi
echo ""

# Étape 3: Nettoyage des builds précédents
echo -e "${YELLOW}🧹 [3/8] Nettoyage des builds précédents...${NC}"
if [ -d "$DERIVED_DATA_PATH" ]; then
    rm -rf "$DERIVED_DATA_PATH"
    echo -e "${GREEN}✓ DerivedData nettoyé${NC}"
else
    echo -e "${GREEN}✓ Aucun build précédent à nettoyer${NC}"
fi
echo ""

# Étape 4: Récupération de l'ID du simulateur
echo -e "${YELLOW}📱 [4/8] Recherche du simulateur...${NC}"
SIMULATOR_ID=$(xcrun simctl list devices | grep "$SIMULATOR_NAME" | grep -v "unavailable" | head -1 | grep -oE '\([A-F0-9-]+\)' | tr -d '()')

if [ -z "$SIMULATOR_ID" ]; then
    echo -e "${RED}✗ Simulateur '$SIMULATOR_NAME' non trouvé${NC}"
    echo -e "${YELLOW}Simulateurs disponibles:${NC}"
    xcrun simctl list devices | grep "iPhone"
    exit 1
fi

echo -e "${GREEN}✓ Simulateur trouvé: $SIMULATOR_NAME${NC}"
echo -e "${GREEN}  ID: $SIMULATOR_ID${NC}"
echo ""

# Étape 5: Arrêt du simulateur s'il tourne
echo -e "${YELLOW}🛑 [5/8] Arrêt du simulateur...${NC}"
SIMULATOR_STATE=$(xcrun simctl list devices | grep "$SIMULATOR_ID" | grep -oE '\((Booted|Shutdown)\)' | tr -d '()')

if [ "$SIMULATOR_STATE" = "Booted" ]; then
    xcrun simctl shutdown "$SIMULATOR_ID"
    echo -e "${GREEN}✓ Simulateur arrêté${NC}"
    sleep 2
else
    echo -e "${GREEN}✓ Simulateur déjà arrêté${NC}"
fi
echo ""

# Étape 6: Compilation du projet
echo -e "${YELLOW}🔨 [6/8] Compilation du projet en mode $BUILD_CONFIG...${NC}"
echo -e "${BLUE}Cela peut prendre 30-60 secondes...${NC}"
echo "Starting build at $(date)" >> "$LOG_FILE"

# Compiler avec plus de détails en mode debug
if [ "$DEBUG_MODE" = true ]; then
    echo -e "${MAGENTA}📋 Mode verbeux activé - détails complets dans $LOG_FILE${NC}"
    xcodebuild \
        -scheme "$SCHEME" \
        -destination "id=$SIMULATOR_ID" \
        -derivedDataPath "$DERIVED_DATA_PATH" \
        -configuration "$BUILD_CONFIG" \
        clean build \
        ENABLE_TESTABILITY=YES \
        GCC_GENERATE_DEBUGGING_SYMBOLS=YES \
        DEBUG_INFORMATION_FORMAT=dwarf-with-dsym \
        SWIFT_OPTIMIZATION_LEVEL="-Onone" \
        2>&1 | tee -a "$LOG_FILE" | grep -E "(BUILD|error:|warning:|note:)" || true
else
    xcodebuild \
        -scheme "$SCHEME" \
        -destination "id=$SIMULATOR_ID" \
        -derivedDataPath "$DERIVED_DATA_PATH" \
        -configuration "$BUILD_CONFIG" \
        clean build \
        2>&1 | grep -E "(BUILD|error:|warning:)" || true
fi

# Vérifier le résultat de la compilation
if [ -d "$APP_PATH" ]; then
    echo -e "${GREEN}✓ Compilation réussie !${NC}"
    echo "Build succeeded at $(date)" >> "$LOG_FILE"
    echo -e "${BLUE}📍 App path: $APP_PATH${NC}"
else
    echo -e "${RED}✗ Échec de la compilation${NC}"
    echo "Build failed at $(date)" >> "$LOG_FILE"
    echo -e "${RED}Voir les détails dans: $LOG_FILE${NC}"
    exit 1
fi
echo ""

# Étape 7: Démarrage du simulateur
echo -e "${YELLOW}🚀 [7/8] Démarrage du simulateur...${NC}"
open -a Simulator
sleep 3

xcrun simctl boot "$SIMULATOR_ID" 2>/dev/null || echo -e "${BLUE}Simulateur en cours de démarrage...${NC}"
sleep 3

echo -e "${GREEN}✓ Simulateur démarré${NC}"
echo ""

# Étape 8: Installation et lancement de l'app
echo -e "${YELLOW}📲 [8/8] Installation et lancement de l'application...${NC}"

# Désinstaller l'ancienne version si présente
echo "Uninstalling previous version..." >> "$LOG_FILE"
xcrun simctl uninstall "$SIMULATOR_ID" "$BUNDLE_ID" 2>/dev/null || true

# Installer la nouvelle version
echo "Installing app from: $APP_PATH" >> "$LOG_FILE"
xcrun simctl install "$SIMULATOR_ID" "$APP_PATH"
echo -e "${GREEN}✓ Application installée${NC}"

# Lancer l'application en mode debug
if [ "$DEBUG_MODE" = true ]; then
    echo -e "${MAGENTA}🐛 Lancement en mode debug avec LLDB...${NC}"
    APP_PID=$(xcrun simctl launch --console --terminate-running-process "$SIMULATOR_ID" "$BUNDLE_ID" 2>&1 | tee -a "$LOG_FILE")
else
    APP_PID=$(xcrun simctl launch "$SIMULATOR_ID" "$BUNDLE_ID")
fi
echo -e "${GREEN}✓ Application lancée${NC}"
echo -e "${BLUE}  Process ID: $APP_PID${NC}"
echo "App launched with PID: $APP_PID" >> "$LOG_FILE"
echo ""

# Résumé final
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║              ✅ DÉPLOIEMENT RÉUSSI ! 🎉                      ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📱 Simulateur: $SIMULATOR_NAME${NC}"
echo -e "${BLUE}📦 Application: $APP_NAME${NC}"
echo -e "${BLUE}🆔 Bundle ID: $BUNDLE_ID${NC}"
echo -e "${BLUE}🔢 Process: $APP_PID${NC}"
echo -e "${MAGENTA}🐛 Mode: $BUILD_CONFIG${NC}"
echo -e "${MAGENTA}📝 Log: $LOG_FILE${NC}"
echo ""

# Commandes de débogage
echo -e "${YELLOW}💡 Commandes de débogage:${NC}"
echo ""
echo -e "${BLUE}📊 Voir les logs en temps réel:${NC}"
echo -e "   xcrun simctl spawn $SIMULATOR_ID log stream --predicate 'process == \"$APP_NAME\"' --level debug"
echo ""
echo -e "${BLUE}🔍 Voir uniquement les erreurs:${NC}"
echo -e "   xcrun simctl spawn $SIMULATOR_ID log stream --predicate 'process == \"$APP_NAME\"' --level error"
echo ""
echo -e "${BLUE}🛠️ Inspecter le conteneur de l'app:${NC}"
echo -e "   xcrun simctl get_app_container $SIMULATOR_ID $BUNDLE_ID"
echo ""
echo -e "${BLUE}🗄️ Voir les UserDefaults:${NC}"
echo -e "   xcrun simctl get_app_container $SIMULATOR_ID $BUNDLE_ID data"
echo ""
echo -e "${BLUE}🔄 Redémarrer:${NC}"
echo -e "   xcrun simctl terminate $SIMULATOR_ID $BUNDLE_ID && ./deploy.sh"
echo ""
echo -e "${BLUE}🧹 Nettoyer complètement:${NC}"
echo -e "   xcrun simctl uninstall $SIMULATOR_ID $BUNDLE_ID && ./deploy.sh"
echo ""
echo -e "${BLUE}📱 Ouvrir le simulateur:${NC}"
echo -e "   open -a Simulator"
echo ""

# Si mode debug, proposer de suivre les logs
if [ "$DEBUG_MODE" = true ]; then
    echo -e "${MAGENTA}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${MAGENTA}🐛 MODE DEBUG ACTIF${NC}"
    echo -e "${MAGENTA}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}Voulez-vous suivre les logs en temps réel ? (Ctrl+C pour arrêter)${NC}"
    read -p "Appuyez sur Entrée pour continuer ou tapez 'logs' pour suivre: " -t 5 choice || choice=""
    
    if [[ "$choice" == "logs" ]]; then
        echo -e "${BLUE}📊 Suivi des logs en cours...${NC}"
        xcrun simctl spawn "$SIMULATOR_ID" log stream --predicate "process == \"$APP_NAME\"" --level debug
    fi
fi

echo -e "${GREEN}✨ Terminé !${NC}"
echo ""

