#!/bin/bash

# Script de gestion du simulateur
# Usage: ./simulator.sh [start|stop|restart|list]

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

SIMULATOR_NAME="iPhone 16 Pro"

case "$1" in
    start)
        echo -e "${BLUE}🚀 Démarrage du simulateur...${NC}"
        SIMULATOR_ID=$(xcrun simctl list devices | grep "$SIMULATOR_NAME" | grep -v "unavailable" | head -1 | grep -oE '\([A-F0-9-]+\)' | tr -d '()')
        
        if [ -z "$SIMULATOR_ID" ]; then
            echo -e "${RED}✗ Simulateur non trouvé${NC}"
            exit 1
        fi
        
        open -a Simulator
        xcrun simctl boot "$SIMULATOR_ID" 2>/dev/null || echo -e "${BLUE}Déjà démarré${NC}"
        echo -e "${GREEN}✓ Simulateur démarré${NC}"
        ;;
        
    stop)
        echo -e "${YELLOW}🛑 Arrêt du simulateur...${NC}"
        SIMULATOR_ID=$(xcrun simctl list devices | grep "$SIMULATOR_NAME" | grep -v "unavailable" | head -1 | grep -oE '\([A-F0-9-]+\)' | tr -d '()')
        
        if [ -z "$SIMULATOR_ID" ]; then
            echo -e "${RED}✗ Simulateur non trouvé${NC}"
            exit 1
        fi
        
        xcrun simctl shutdown "$SIMULATOR_ID"
        echo -e "${GREEN}✓ Simulateur arrêté${NC}"
        ;;
        
    restart)
        echo -e "${BLUE}🔄 Redémarrage du simulateur...${NC}"
        SIMULATOR_ID=$(xcrun simctl list devices | grep "$SIMULATOR_NAME" | grep -v "unavailable" | head -1 | grep -oE '\([A-F0-9-]+\)' | tr -d '()')
        
        if [ -z "$SIMULATOR_ID" ]; then
            echo -e "${RED}✗ Simulateur non trouvé${NC}"
            exit 1
        fi
        
        xcrun simctl shutdown "$SIMULATOR_ID" 2>/dev/null || true
        sleep 2
        open -a Simulator
        xcrun simctl boot "$SIMULATOR_ID"
        echo -e "${GREEN}✓ Simulateur redémarré${NC}"
        ;;
        
    list)
        echo -e "${BLUE}📱 Simulateurs disponibles:${NC}"
        xcrun simctl list devices | grep "iPhone"
        ;;
        
    *)
        echo -e "${YELLOW}Usage: $0 {start|stop|restart|list}${NC}"
        echo ""
        echo -e "${BLUE}Commandes disponibles:${NC}"
        echo "  start   - Démarrer le simulateur"
        echo "  stop    - Arrêter le simulateur"
        echo "  restart - Redémarrer le simulateur"
        echo "  list    - Lister les simulateurs disponibles"
        exit 1
        ;;
esac

