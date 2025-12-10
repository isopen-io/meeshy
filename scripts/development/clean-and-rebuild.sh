#!/bin/bash

# Script pour nettoyer les caches Next.js et rebuilder
# Usage: ./scripts/development/clean-and-rebuild.sh

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧹 Nettoyage des caches Next.js...${NC}"
echo ""

cd frontend

# 1. Arrêter le serveur Next.js s'il tourne
echo -e "${YELLOW}Vérification des processus Next.js en cours...${NC}"
if lsof -ti:3100 > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Port 3100 occupé, arrêt du processus...${NC}"
    kill -9 $(lsof -ti:3100) 2>/dev/null || true
    sleep 2
fi

# 2. Supprimer les caches Next.js
echo -e "${GREEN}🗑️  Suppression de .next/...${NC}"
rm -rf .next

echo -e "${GREEN}🗑️  Suppression de node_modules/.cache/...${NC}"
rm -rf node_modules/.cache

# 3. Rebuilder (optionnel - Next.js rebuild automatiquement au démarrage)
# echo -e "${GREEN}📦 Rebuild Next.js...${NC}"
# pnpm run build

echo ""
echo -e "${GREEN}✅ Nettoyage terminé !${NC}"
echo ""
echo -e "${BLUE}Pour redémarrer l'application :${NC}"
echo -e "   ${YELLOW}Mode HTTP:${NC}   ./scripts/development/development-start-local.sh"
echo -e "   ${YELLOW}Mode HTTPS:${NC}  ./scripts/development/development-start-local.sh --https"
echo ""
