#!/bin/bash
# Script de diagnostic pour identifier les problèmes avant build Docker

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔍 Diagnostic Build Docker Frontend${NC}"
echo -e "${BLUE}===================================${NC}"

ISSUES_FOUND=0

# Check 1: Docker version
echo -e "\n${YELLOW}📋 1. Vérification Docker...${NC}"
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    echo -e "${GREEN}   ✓ Docker installé: $DOCKER_VERSION${NC}"
else
    echo -e "${RED}   ✗ Docker n'est pas installé!${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check 2: Docker daemon
echo -e "\n${YELLOW}📋 2. Vérification Docker daemon...${NC}"
if docker info &> /dev/null; then
    echo -e "${GREEN}   ✓ Docker daemon en cours d'exécution${NC}"
else
    echo -e "${RED}   ✗ Docker daemon n'est pas démarré!${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check 3: Buildx
echo -e "\n${YELLOW}📋 3. Vérification Buildx...${NC}"
if docker buildx version &> /dev/null; then
    BUILDX_VERSION=$(docker buildx version)
    echo -e "${GREEN}   ✓ Buildx installé: $BUILDX_VERSION${NC}"
else
    echo -e "${RED}   ✗ Buildx n'est pas installé!${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check 4: Builders
echo -e "\n${YELLOW}📋 4. Vérification Builders...${NC}"
if docker buildx ls | grep -q "meeshy-builder-fresh"; then
    echo -e "${GREEN}   ✓ Builder meeshy-builder-fresh existe${NC}"
    
    # Check if running
    if docker buildx ls | grep "meeshy-builder-fresh" | grep -q "running"; then
        echo -e "${GREEN}   ✓ Builder en cours d'exécution${NC}"
    else
        echo -e "${YELLOW}   ⚠ Builder pas en cours d'exécution, sera démarré automatiquement${NC}"
    fi
else
    echo -e "${YELLOW}   ⚠ Builder meeshy-builder-fresh n'existe pas (sera créé)${NC}"
fi

# Check 5: Docker Hub authentication
echo -e "\n${YELLOW}📋 5. Vérification authentification Docker Hub...${NC}"
if docker info 2>/dev/null | grep -q "Username"; then
    USERNAME=$(docker info 2>/dev/null | grep "Username" | awk '{print $2}')
    echo -e "${GREEN}   ✓ Connecté comme: $USERNAME${NC}"
else
    echo -e "${YELLOW}   ⚠ Non connecté à Docker Hub (nécessaire pour push)${NC}"
    echo -e "${YELLOW}   → Lancez: docker login${NC}"
fi

# Check 6: Disk space
echo -e "\n${YELLOW}📋 6. Vérification espace disque...${NC}"
AVAILABLE_SPACE=$(df -h . | tail -1 | awk '{print $4}')
AVAILABLE_SPACE_GB=$(df -k . | tail -1 | awk '{print $4}')
AVAILABLE_SPACE_GB=$((AVAILABLE_SPACE_GB / 1024 / 1024))

echo -e "   Espace disponible: $AVAILABLE_SPACE (${AVAILABLE_SPACE_GB}GB)"

if [ "$AVAILABLE_SPACE_GB" -lt 5 ]; then
    echo -e "${RED}   ✗ Espace disque insuffisant (< 5GB)${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
elif [ "$AVAILABLE_SPACE_GB" -lt 10 ]; then
    echo -e "${YELLOW}   ⚠ Espace disque limite (< 10GB)${NC}"
else
    echo -e "${GREEN}   ✓ Espace disque OK${NC}"
fi

# Check 7: Docker cache
echo -e "\n${YELLOW}📋 7. Vérification cache Docker...${NC}"
if docker buildx du --verbose &> /dev/null; then
    CACHE_SIZE=$(docker buildx du 2>/dev/null | tail -1 | awk '{print $1}')
    echo -e "   Cache actuel: $CACHE_SIZE"
    echo -e "${GREEN}   ✓ Cache disponible${NC}"
else
    echo -e "${YELLOW}   ⚠ Impossible de vérifier le cache${NC}"
fi

# Check 8: Network connectivity
echo -e "\n${YELLOW}📋 8. Vérification connectivité réseau...${NC}"
if ping -c 1 docker.io &> /dev/null; then
    echo -e "${GREEN}   ✓ Docker Hub accessible${NC}"
else
    echo -e "${RED}   ✗ Impossible de joindre Docker Hub${NC}"
    echo -e "${YELLOW}   → Vérifiez votre connexion internet${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

if ping -c 1 registry.npmjs.org &> /dev/null; then
    echo -e "${GREEN}   ✓ npm registry accessible${NC}"
else
    echo -e "${RED}   ✗ Impossible de joindre npm registry${NC}"
    echo -e "${YELLOW}   → Vérifiez votre connexion internet${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check 9: Required files
echo -e "\n${YELLOW}📋 9. Vérification fichiers requis...${NC}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

FILES_TO_CHECK=(
    "package.json"
    "Dockerfile"
    "Dockerfile.optimized"
    "scripts/docker-build-optimized.sh"
    "../shared/scripts/distribute.sh"
)

for file in "${FILES_TO_CHECK[@]}"; do
    if [ -f "$FRONTEND_ROOT/$file" ]; then
        echo -e "${GREEN}   ✓ $file${NC}"
    else
        echo -e "${RED}   ✗ $file manquant${NC}"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
done

# Check 10: Platform support
echo -e "\n${YELLOW}📋 10. Vérification plateformes supportées...${NC}"
PLATFORMS=$(docker buildx inspect meeshy-builder-fresh 2>/dev/null | grep "Platforms:" | head -1 || echo "")
if echo "$PLATFORMS" | grep -q "linux/arm64"; then
    echo -e "${GREEN}   ✓ linux/arm64 supportée${NC}"
else
    echo -e "${YELLOW}   ⚠ linux/arm64 non supportée${NC}"
fi

if echo "$PLATFORMS" | grep -q "linux/amd64"; then
    echo -e "${GREEN}   ✓ linux/amd64 supportée${NC}"
else
    echo -e "${YELLOW}   ⚠ linux/amd64 non supportée${NC}"
fi

# Summary
echo -e "\n${BLUE}===========================================${NC}"
if [ $ISSUES_FOUND -eq 0 ]; then
    echo -e "${GREEN}✅ Aucun problème détecté!${NC}"
    echo -e "${GREEN}✅ Vous pouvez lancer la build en toute sécurité${NC}"
    echo ""
    echo -e "${BLUE}Commandes disponibles:${NC}"
    echo -e "   1. Build rapide (cache): ${YELLOW}./scripts/docker-build-optimized.sh${NC}"
    echo -e "   2. Build locale: ${YELLOW}PUSH=false ./scripts/docker-build-optimized.sh${NC}"
    echo -e "   3. Build séparée: ${YELLOW}./scripts/docker-build-separate.sh${NC}"
else
    echo -e "${RED}⚠️  $ISSUES_FOUND problème(s) détecté(s)${NC}"
    echo -e "${YELLOW}→ Corrigez les problèmes ci-dessus avant de continuer${NC}"
fi
echo ""

