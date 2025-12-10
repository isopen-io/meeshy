#!/bin/bash

# Script pour lancer le container Meeshy unifié avec montage des logs
set -e

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
CONTAINER_NAME="meeshy-unified"
IMAGE_NAME="meeshy:unified"
LOGS_DIR="./logs"
JWT_SECRET=${JWT_SECRET:-"test-secret-key"}

echo -e "${PURPLE}🚀 Lancement de Meeshy Unifié avec logs montés${NC}"
echo "=============================================="

# Créer le répertoire de logs s'il n'existe pas
echo -e "${BLUE}📁 Création du répertoire de logs...${NC}"
mkdir -p "$LOGS_DIR"
mkdir -p "$LOGS_DIR/postgres"
mkdir -p "$LOGS_DIR/redis"
mkdir -p "$LOGS_DIR/nginx"
mkdir -p "$LOGS_DIR/gateway"
mkdir -p "$LOGS_DIR/translator"
mkdir -p "$LOGS_DIR/frontend"
mkdir -p "$LOGS_DIR/supervisor"

# Arrêter et supprimer le container existant s'il existe
if docker ps -a --format "table {{.Names}}" | grep -q "^$CONTAINER_NAME$"; then
    echo -e "${YELLOW}🛑 Arrêt du container existant...${NC}"
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    docker rm "$CONTAINER_NAME" 2>/dev/null || true
fi

# Lancer le container avec montage des logs
echo -e "${BLUE}🐳 Lancement du container avec montage des logs...${NC}"
docker run -d \
    --name "$CONTAINER_NAME" \
    -p 80:80 \
    -p 3000:3000 \
    -p 8000:8000 \
    -e JWT_SECRET="$JWT_SECRET" \
    --user root \
    -v "$(pwd)/$LOGS_DIR:/app/logs" \
    "$IMAGE_NAME"

echo -e "${GREEN}✅ Container lancé avec succès${NC}"
echo -e "${CYAN}📊 Logs disponibles dans: $LOGS_DIR${NC}"
echo -e "${CYAN}🌐 Frontend: http://localhost${NC}"
echo -e "${CYAN}🔌 Gateway: http://localhost/api${NC}"
echo -e "${CYAN}🤖 Translator: http://localhost/translate${NC}"

# Afficher les logs en temps réel
echo -e "${BLUE}📋 Affichage des logs en temps réel (Ctrl+C pour arrêter)...${NC}"
echo "=============================================="

# Fonction pour nettoyer à la sortie
cleanup() {
    echo -e "\n${YELLOW}🛑 Arrêt du container...${NC}"
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    echo -e "${GREEN}✅ Container arrêté${NC}"
    exit 0
}

# Capturer Ctrl+C
trap cleanup SIGINT

# Surveiller les logs unifiés
docker logs -f "$CONTAINER_NAME"
