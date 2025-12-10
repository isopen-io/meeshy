#!/bin/bash

# Script de démarrage du frontend Next.js Meeshy
set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Fonction de chargement du fichier .env
load_env_file() {
    local env_file=".env"
    
    if [[ -f "$env_file" ]]; then
        echo -e "${GREEN}✅ [GWY] Chargement des variables depuis $env_file${NC}"
        source "$env_file"
    else
        echo -e "${YELLOW}⚠️  [GWY] Fichier $env_file non trouvé, utilisation des valeurs par défaut${NC}"
    fi
}

# Charger les variables d'environnement
load_env_file

echo -e "${BLUE}🎨 [APP] Démarrage du frontend Next.js Meeshy${NC}"
echo "================================================="

# Vérifier Node.js
if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}❌ Node.js non trouvé${NC}"
    exit 1
fi

echo -e "${GREEN}✅ [APP] Node.js version: $(node --version)${NC}"

# Vérifier pnpm
if ! command -v pnpm >/dev/null 2>&1; then
    echo -e "${RED}❌ pnpm non trouvé${NC}"
    exit 1
fi

echo -e "${GREEN}✅ [APP] pnpm version: $(pnpm --version)${NC}"

# Vérifier les dépendances
if [[ ! -d "node_modules" ]]; then
    echo -e "${YELLOW}📦 [APP] Installation des dépendances...${NC}"
    pnpm install
fi

# Variables d'environnement
export NODE_ENV=${NODE_ENV:-development}
export PORT=${PORT:-3100}
export NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-"http://localhost:3000"}
export NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL:-"ws://localhost:3000"}
export NEXT_PUBLIC_BACKEND_URL=${NEXT_PUBLIC_BACKEND_URL:-"http://localhost:3000"}
export NEXT_PUBLIC_TRANSLATION_URL=${NEXT_PUBLIC_TRANSLATION_URL:-"http://localhost:8000"}

# Internal URLs for SSR when running locally (non-docker)
export INTERNAL_BACKEND_URL=${INTERNAL_BACKEND_URL:-"http://localhost:3000"}
export INTERNAL_WS_URL=${INTERNAL_WS_URL:-"ws://localhost:3000"}

echo -e "${BLUE}📊 [APP] Configuration:${NC}"
echo "   Port: $PORT"
echo "   Environment: $NODE_ENV"
echo "   API URL: $NEXT_PUBLIC_API_URL"
echo "   WebSocket URL: $NEXT_PUBLIC_WS_URL"
echo "   Backend URL (public): $NEXT_PUBLIC_BACKEND_URL"
echo "   Backend URL (internal SSR): $INTERNAL_BACKEND_URL"

# Fonction de nettoyage
cleanup() {
    echo -e "\n${YELLOW}🛑 [APP] Arrêt du frontend...${NC}"
    if [[ ! -z "$FRONTEND_PID" ]]; then
        kill $FRONTEND_PID 2>/dev/null || true
        wait $FRONTEND_PID 2>/dev/null || true
    fi
    echo -e "${GREEN}✅ [APP] Frontend arrêté proprement${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Démarrer le frontend
echo -e "${GREEN}🚀 [APP] Démarrage du frontend Next.js...${NC}"
echo "   Utilisez Ctrl+C pour arrêter"
echo "================================================="

# Démarrer en mode développement avec Turbopack
pnpm run dev &
FRONTEND_PID=$!

# Attendre le démarrage
sleep 5

# Vérifier si le serveur fonctionne
if kill -0 $FRONTEND_PID 2>/dev/null; then
    echo -e "${GREEN}✅ [APP] Frontend démarré avec succès (PID: $FRONTEND_PID)${NC}"
    echo -e "${BLUE}🌐 [APP] Application disponible sur http://localhost:$PORT${NC}"
    echo -e "${YELLOW}💡 [APP] Pages disponibles:${NC}"
    echo "   /                    - Page d'accueil"
    echo "   /chat                - Interface de chat"
    echo "   /demo-translation    - Démo de traduction"
    echo "   /conversations       - Liste des conversations"
    echo "   /settings            - Paramètres utilisateur"
else
    echo -e "${RED}❌ [APP] Échec du démarrage du frontend${NC}"
    exit 1
fi

# Attendre la fin du processus
wait $FRONTEND_PID
