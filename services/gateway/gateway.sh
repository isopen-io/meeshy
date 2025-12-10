#!/bin/bash

# Script de démarrage du serveur Fastify avec WebSocket
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
    local env_files=(".env.local" "../.env.local" "../.env")
    
    for env_file in "${env_files[@]}"; do
        if [[ -f "$env_file" ]]; then
            echo -e "${GREEN}✅ [GWY] Chargement des variables depuis $env_file${NC}"
            # Lire le fichier .env et exporter les variables
            while IFS='=' read -r key value; do
                # Ignorer les commentaires et les lignes vides
                if [[ ! "$key" =~ ^[[:space:]]*# ]] && [[ -n "$key" ]]; then
                    # Supprimer les guillemets et espaces en début/fin
                    key=$(echo "$key" | xargs)
                    value=$(echo "$value" | xargs)
                    value=${value#\"}  # Supprimer guillemet de début
                    value=${value%\"}  # Supprimer guillemet de fin
                    export "$key=$value"
                    echo "  - $key=$value"
                fi
            done < "$env_file"
            return 0
        fi
    done
    
    echo -e "${YELLOW}⚠️  [GWY] Aucun fichier .env trouvé, utilisation des valeurs par défaut${NC}"
}

# Charger les variables d'environnement
load_env_file

echo -e "${BLUE}🚀 [GWY] Démarrage du serveur Fastify Meeshy${NC}"
echo "================================================="

# Vérifier Node.js
if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}❌ Node.js non trouvé${NC}"
    exit 1
fi

echo -e "${GREEN}✅ [GWY] Node.js version: $(node --version)${NC}"

# Vérifier les dépendances
if [[ ! -d "node_modules" ]]; then
    echo -e "${YELLOW}📦 [GWY] Installation des dépendances...${NC}"
    pnpm install
fi

# Vérifier la génération Prisma
if [[ ! -d "./shared/prisma/client" ]]; then
    echo -e "${YELLOW}🔧 [GWY] Génération du client Prisma...${NC}"
    cd ./shared
    pnpm prisma generate
    cd ..
fi

# Variables d'environnement
export NODE_ENV=${NODE_ENV:-development}
export PORT=${PORT:-3000}
export HOST=${HOST:-0.0.0.0}
export JWT_SECRET=${JWT_SECRET:-meeshy-secret}
export DATABASE_URL=${DATABASE_URL:-"file:./dev.db"}

echo -e "${BLUE}📊 [GWY] Configuration:${NC}"
echo "   Port: $PORT"
echo "   Host: $HOST"
echo "   Environment: $NODE_ENV"

# Fonction de nettoyage
cleanup() {
    echo -e "\n${YELLOW}🛑 [GWY] Arrêt du serveur...${NC}"
    if [[ ! -z "$SERVER_PID" ]]; then
        kill $SERVER_PID 2>/dev/null || true
        wait $SERVER_PID 2>/dev/null || true
    fi
    echo -e "${GREEN}✅ [GWY] Serveur arrêté proprement${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Démarrer le serveur
echo -e "${GREEN}🚀 [GWY] Démarrage du serveur Fastify...${NC}"
echo "   Utilisez Ctrl+C pour arrêter"
echo "================================================="

# Compiler TypeScript et démarrer en mode dev
pnpm run dev &
SERVER_PID=$!

# Attendre le démarrage
sleep 3

# Vérifier si le serveur fonctionne
if kill -0 $SERVER_PID 2>/dev/null; then
    echo -e "${GREEN}✅ [GWY] Serveur démarré avec succès (PID: $SERVER_PID)${NC}"
    echo -e "${BLUE}🌐 [GWY] API disponible sur http://$HOST:$PORT${NC}"
    echo -e "${BLUE}📡 [GWY] WebSocket sur ws://$HOST:$PORT/ws${NC}"
    echo -e "${YELLOW}💡 [GWY] Endpoints disponibles:${NC}"
    echo "   GET  /health - Status du serveur"
    echo "   GET  /stats - Statistiques"
    echo "   POST /test-translation - Test de traduction"
    echo "   POST /test-detection - Test de détection"
    echo "   GET  /messages - Messages de test"
else
    echo -e "${RED}❌ [GWY] Échec du démarrage du serveur${NC}"
    exit 1
fi

# Attendre la fin du processus
wait $SERVER_PID
