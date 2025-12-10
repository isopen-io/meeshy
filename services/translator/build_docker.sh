#!/bin/bash

# Script de build Docker pour le service de traduction Meeshy
set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🐳 [DOCKER] Build du service de traduction Meeshy${NC}"
echo "=============================================="

# Variables
IMAGE_NAME="meeshy-translator"
TAG=${1:-"latest"}
FULL_IMAGE_NAME="$IMAGE_NAME:$TAG"

echo -e "${GREEN}📝 Image à construire: $FULL_IMAGE_NAME${NC}"

# Vérifier que Docker est démarré
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker n'est pas démarré${NC}"
    exit 1
fi

# Créer un fichier .env.docker optimisé pour Docker
echo -e "${YELLOW}📋 Création de la configuration Docker...${NC}"
cat > .env.docker << EOF
# Configuration Docker pour le service de traduction Meeshy
DEBUG=false
WORKERS=4

# Ports (Docker expose ces ports)
FASTAPI_PORT=8000
GRPC_PORT=50051
ZMQ_PORT=5555

# Base de données (SQLite dans le container)
DATABASE_URL=file:./dev.db

# Cache (Memory pour simplicité)
REDIS_URL=memory://
TRANSLATION_CACHE_TTL=3600
CACHE_MAX_ENTRIES=10000

# ML Configuration
ML_BATCH_SIZE=32
GPU_MEMORY_FRACTION=0.8
MODELS_PATH=/app/models

# Langues supportées
DEFAULT_LANGUAGE=fr
SUPPORTED_LANGUAGES=fr,en,es,de,pt,zh,ja,ar
AUTO_DETECT_LANGUAGE=true

# Modèles de traduction
BASIC_MODEL=google/t5-small
MEDIUM_MODEL=facebook/nllb-200-distilled-600M
PREMIUM_MODEL=facebook/nllb-200-distilled-1.3B

# Performance
TRANSLATION_TIMEOUT=30
MAX_TEXT_LENGTH=1000
CONCURRENT_TRANSLATIONS=10
EOF

echo -e "${GREEN}✅ Configuration Docker créée${NC}"

# Build de l'image Docker
echo -e "${YELLOW}🔨 Construction de l'image Docker...${NC}"
docker build \
    --tag "$FULL_IMAGE_NAME" \
    --file Dockerfile \
    --build-arg DATABASE_URL="file:./dev.db" \
    --build-arg REDIS_URL="memory://" \
    --progress=plain \
    .

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Image Docker construite avec succès: $FULL_IMAGE_NAME${NC}"
    
    # Afficher les informations de l'image
    echo -e "${BLUE}📊 Informations de l'image:${NC}"
    docker images "$IMAGE_NAME:$TAG" --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}\t{{.CreatedAt}}"
    
    # Proposer de tester l'image
    echo ""
    echo -e "${YELLOW}💡 Pour tester l'image:${NC}"
    echo "   docker run -p 8000:8000 -p 5555:5555 $FULL_IMAGE_NAME"
    echo ""
    echo -e "${YELLOW}💡 Pour tester avec volume (persistance DB):${NC}"
    echo "   docker run -p 8000:8000 -p 5555:5555 -v \$(pwd)/data:/app/data $FULL_IMAGE_NAME"
    
else
    echo -e "${RED}❌ Échec de la construction de l'image Docker${NC}"
    exit 1
fi

echo -e "${GREEN}🎉 Build Docker terminé !${NC}"
