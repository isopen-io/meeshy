#!/bin/bash
# Script optimisé pour builder le frontend avec cache et multi-plateforme
# Résout les problèmes de timeout lors des builds Docker

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOCKER_IMAGE="${DOCKER_IMAGE:-isopen/meeshy-frontend}"
DOCKER_TAG="${DOCKER_TAG:-latest}"
PLATFORMS="${PLATFORMS:-linux/arm64,linux/amd64}"
DOCKERFILE="${DOCKERFILE:-Dockerfile.optimized}"
PUSH="${PUSH:-true}"

echo -e "${BLUE}🚀 Meeshy Frontend - Build Docker optimisé${NC}"
echo -e "${BLUE}===========================================${NC}"

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$FRONTEND_ROOT"

# Step 1: Vérifier buildx
echo -e "\n${YELLOW}📋 Step 1/6: Vérification buildx...${NC}"
if ! docker buildx version > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker buildx n'est pas installé!${NC}"
    exit 1
fi

# Vérifier ou créer un builder
BUILDER_NAME="meeshy-builder-fresh"
if ! docker buildx inspect "$BUILDER_NAME" > /dev/null 2>&1; then
    echo -e "${YELLOW}   Création du builder $BUILDER_NAME...${NC}"
    docker buildx create --name "$BUILDER_NAME" --driver docker-container --bootstrap
fi

echo -e "${YELLOW}   Utilisation du builder $BUILDER_NAME...${NC}"
docker buildx use "$BUILDER_NAME"

# Step 2: Préparer le contexte
echo -e "\n${YELLOW}📦 Step 2/6: Préparation du contexte Docker...${NC}"
SHARED_DIR="$(cd "$FRONTEND_ROOT/../shared" && pwd)"
if [ -f "$SHARED_DIR/scripts/distribute.sh" ]; then
    echo "📦 Running centralized shared distribution script..."
    cd "$SHARED_DIR"
    bash ./scripts/distribute.sh
    cd "$FRONTEND_ROOT"
else
    echo -e "${YELLOW}   ⚠️  Script shared/scripts/distribute.sh non trouvé, continuons...${NC}"
fi

# Step 3: Login Docker Hub (si nécessaire)
echo -e "\n${YELLOW}🔐 Step 3/6: Vérification authentification Docker Hub...${NC}"
if [ "$PUSH" = "true" ]; then
    if ! docker info | grep -q "Username"; then
        echo -e "${YELLOW}   Veuillez vous connecter à Docker Hub:${NC}"
        docker login
    fi
else
    echo -e "${GREEN}   ✓ Mode local (pas de push)${NC}"
fi

# Step 4: Build avec cache
echo -e "\n${YELLOW}🔨 Step 4/6: Build de l'image avec cache...${NC}"
echo -e "${BLUE}   Image: $DOCKER_IMAGE:$DOCKER_TAG${NC}"
echo -e "${BLUE}   Plateformes: $PLATFORMS${NC}"
echo -e "${BLUE}   Dockerfile: $DOCKERFILE${NC}"

BUILD_ARGS=(
    --platform "$PLATFORMS"
    --progress=plain
    -t "$DOCKER_IMAGE:$DOCKER_TAG"
    -f "$DOCKERFILE"
    --cache-from "type=registry,ref=$DOCKER_IMAGE:buildcache"
    --cache-to "type=registry,ref=$DOCKER_IMAGE:buildcache,mode=max"
)

if [ "$PUSH" = "true" ]; then
    BUILD_ARGS+=(--push)
    echo -e "${BLUE}   Mode: Build + Push${NC}"
else
    BUILD_ARGS+=(--load)
    echo -e "${BLUE}   Mode: Build local uniquement${NC}"
fi

echo -e "${YELLOW}   Commande: docker buildx build ${BUILD_ARGS[*]} .${NC}"
echo ""

# Exécuter la build
if docker buildx build "${BUILD_ARGS[@]}" .; then
    echo -e "\n${GREEN}✅ Build réussie!${NC}"
else
    echo -e "\n${RED}❌ Build échouée!${NC}"
    exit 1
fi

# Step 5: Vérification
echo -e "\n${YELLOW}🔍 Step 5/6: Vérification de l'image...${NC}"
if [ "$PUSH" = "true" ]; then
    echo -e "${GREEN}   ✓ Image poussée vers Docker Hub: $DOCKER_IMAGE:$DOCKER_TAG${NC}"
    echo -e "${GREEN}   ✓ Cache sauvegardé: $DOCKER_IMAGE:buildcache${NC}"
else
    echo -e "${GREEN}   ✓ Image disponible localement: $DOCKER_IMAGE:$DOCKER_TAG${NC}"
    docker images "$DOCKER_IMAGE:$DOCKER_TAG"
fi

# Step 6: Résumé
echo -e "\n${BLUE}📊 Step 6/6: Résumé${NC}"
echo -e "${GREEN}✅ Build terminée avec succès!${NC}"
echo ""
echo -e "${BLUE}Prochaines étapes:${NC}"
if [ "$PUSH" = "true" ]; then
    echo -e "   1. Déployer: docker pull $DOCKER_IMAGE:$DOCKER_TAG"
    echo -e "   2. Run: docker run -p 3100:80 $DOCKER_IMAGE:$DOCKER_TAG"
else
    echo -e "   1. Run: docker run -p 3100:80 $DOCKER_IMAGE:$DOCKER_TAG"
    echo -e "   2. Push: PUSH=true $0"
fi
echo ""
echo -e "${BLUE}Pour un build encore plus rapide la prochaine fois:${NC}"
echo -e "   - Le cache est maintenant disponible dans: $DOCKER_IMAGE:buildcache"
echo -e "   - Les prochains builds seront beaucoup plus rapides!"
echo ""

