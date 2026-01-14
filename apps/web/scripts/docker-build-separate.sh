#!/bin/bash
# Build les plateformes séparément pour éviter les timeouts
# Plus lent mais plus fiable pour les connexions instables

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
DOCKER_IMAGE="${DOCKER_IMAGE:-isopen/meeshy-web}"
DOCKER_TAG="${DOCKER_TAG:-latest}"
DOCKERFILE="${DOCKERFILE:-Dockerfile.optimized}"

echo -e "${BLUE}🚀 Meeshy Frontend - Build séparé par plateforme${NC}"
echo -e "${BLUE}================================================${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$FRONTEND_ROOT"

# Préparation
echo -e "\n${YELLOW}📦 Préparation du contexte...${NC}"
SHARED_DIR="$(cd "$FRONTEND_ROOT/../shared" && pwd)"
if [ -f "$SHARED_DIR/scripts/distribute.sh" ]; then
    echo "📦 Running centralized shared distribution script..."
    cd "$SHARED_DIR"
    bash ./scripts/distribute.sh
    cd "$FRONTEND_ROOT"
fi

# Vérifier buildx
BUILDER_NAME="meeshy-builder-fresh"
if ! docker buildx inspect "$BUILDER_NAME" > /dev/null 2>&1; then
    echo -e "${YELLOW}   Création du builder...${NC}"
    docker buildx create --name "$BUILDER_NAME" --driver docker-container --bootstrap
fi
docker buildx use "$BUILDER_NAME"

# Login Docker Hub
echo -e "\n${YELLOW}🔐 Login Docker Hub...${NC}"
if ! docker info | grep -q "Username"; then
    docker login
fi

# Function pour builder une plateforme
build_platform() {
    local platform=$1
    local tag_suffix=$2
    
    echo -e "\n${BLUE}🔨 Build pour $platform...${NC}"
    
    docker buildx build \
        --platform "$platform" \
        --progress=plain \
        -t "$DOCKER_IMAGE:$DOCKER_TAG-$tag_suffix" \
        -f "$DOCKERFILE" \
        --cache-from "type=registry,ref=$DOCKER_IMAGE:buildcache-$tag_suffix" \
        --cache-to "type=registry,ref=$DOCKER_IMAGE:buildcache-$tag_suffix,mode=max" \
        --push \
        .
    
    echo -e "${GREEN}✅ Build $platform terminée!${NC}"
}

# Build ARM64
build_platform "linux/arm64" "arm64"

# Build AMD64
build_platform "linux/amd64" "amd64"

# Créer le manifest multi-arch
echo -e "\n${YELLOW}📦 Création du manifest multi-architecture...${NC}"

# Créer le manifest
docker buildx imagetools create \
    -t "$DOCKER_IMAGE:$DOCKER_TAG" \
    "$DOCKER_IMAGE:$DOCKER_TAG-arm64" \
    "$DOCKER_IMAGE:$DOCKER_TAG-amd64"

echo -e "\n${GREEN}✅ Toutes les builds sont terminées!${NC}"
echo -e "${GREEN}✅ Manifest multi-arch créé: $DOCKER_IMAGE:$DOCKER_TAG${NC}"
echo ""
echo -e "${BLUE}Images disponibles:${NC}"
echo -e "   - $DOCKER_IMAGE:$DOCKER_TAG (manifest multi-arch)"
echo -e "   - $DOCKER_IMAGE:$DOCKER_TAG-arm64 (ARM64)"
echo -e "   - $DOCKER_IMAGE:$DOCKER_TAG-amd64 (AMD64)"
echo ""

