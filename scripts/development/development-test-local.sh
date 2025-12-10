#!/bin/bash

# 🧪 Test rapide de l'environnement de développement local
set -e

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🧪 Test de l'environnement de développement Meeshy${NC}"

# Test des ports
echo -e "${YELLOW}🔍 Test des services...${NC}"

services=(
    "3000:Gateway"
    "3100:Frontend" 
    "8000:Translator"
    "27017:MongoDB"
    "6379:Redis"
)

for service in "${services[@]}"; do
    port=$(echo $service | cut -d: -f1)
    name=$(echo $service | cut -d: -f2)
    
    if nc -z localhost $port 2>/dev/null; then
        echo -e "  ${GREEN}✅ $name (port $port)${NC}"
    else
        echo -e "  ${RED}❌ $name (port $port)${NC}"
    fi
done

# Test HTTP endpoints
echo -e "${YELLOW}🌐 Test des endpoints HTTP...${NC}"

if curl -s http://localhost:3000/health >/dev/null 2>&1; then
    echo -e "  ${GREEN}✅ Gateway health check${NC}"
else
    echo -e "  ${RED}❌ Gateway health check${NC}"
fi

if curl -s http://localhost:8000/health >/dev/null 2>&1; then
    echo -e "  ${GREEN}✅ Translator health check${NC}"
else
    echo -e "  ${RED}❌ Translator health check${NC}"
fi

if curl -s http://localhost:3100 >/dev/null 2>&1; then
    echo -e "  ${GREEN}✅ Frontend accessible${NC}"
else
    echo -e "  ${RED}❌ Frontend accessible${NC}"
fi

echo -e "${BLUE}🎯 Test terminé${NC}"
