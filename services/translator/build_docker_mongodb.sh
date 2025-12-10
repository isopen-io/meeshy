#!/bin/bash

# Script de build Docker pour le service de traduction Meeshy avec MongoDB
set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🐳 [DOCKER] Build du service de traduction Meeshy avec MongoDB${NC}"
echo "=========================================================="

# Variables
IMAGE_NAME="meeshy-translator"
TAG=${1:-"mongodb"}
FULL_IMAGE_NAME="$IMAGE_NAME:$TAG"

echo -e "${GREEN}📝 Image à construire: $FULL_IMAGE_NAME${NC}"

# Vérifier que Docker est démarré
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker n'est pas démarré${NC}"
    exit 1
fi

# Créer un fichier .env.docker optimisé pour MongoDB
echo -e "${YELLOW}📋 Création de la configuration Docker MongoDB...${NC}"
cat > .env.docker << EOF
# Configuration Docker pour le service de traduction Meeshy avec MongoDB
DEBUG=false
WORKERS=4

# Ports (Docker expose ces ports)
FASTAPI_PORT=8000
GRPC_PORT=50051
ZMQ_PORT=5555

# Base de données MongoDB
# Note: Cette URL est un fallback, utilisez DATABASE_URL via Docker env vars
DATABASE_URL=mongodb://database:27017/meeshy?replicaSet=rs0
PRISMA_POOL_SIZE=15

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

# Configuration des workers
TRANSLATION_WORKERS=50
NORMAL_WORKERS_DEFAULT=20
ANY_WORKERS_DEFAULT=10
NORMAL_WORKERS_MIN=2
ANY_WORKERS_MIN=2
NORMAL_WORKERS_MAX=40
ANY_WORKERS_MAX=20

# Configuration de la quantification
QUANTIZATION_LEVEL=float16

# Configuration des retries
MODEL_DOWNLOAD_MAX_RETRIES=3
MODEL_DOWNLOAD_TIMEOUT=300
MODEL_DOWNLOAD_CONSECUTIVE_TIMEOUTS=3
EOF

echo -e "${GREEN}✅ Configuration Docker MongoDB créée${NC}"

# Build de l'image Docker avec MongoDB
echo -e "${YELLOW}🔨 Construction de l'image Docker MongoDB...${NC}"
docker build \
    --tag "$FULL_IMAGE_NAME" \
    --file Dockerfile.mongodb \
    --build-arg DATABASE_URL="mongodb://database:27017/meeshy?replicaSet=rs0" \
    --build-arg REDIS_URL="memory://" \
    --progress=plain \
    .

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Image Docker MongoDB construite avec succès: $FULL_IMAGE_NAME${NC}"
    
    # Afficher les informations de l'image
    echo -e "${BLUE}📊 Informations de l'image:${NC}"
    docker images "$IMAGE_NAME:$TAG" --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}\t{{.CreatedAt}}"
    
    # Test automatique de l'image
    echo -e "${YELLOW}🧪 Test automatique de l'image...${NC}"
    
    # Arrêter les conteneurs existants s'ils existent
    docker stop mongodb-test-build 2>/dev/null || true
    docker rm mongodb-test-build 2>/dev/null || true
    docker stop translator-test-build 2>/dev/null || true
    docker rm translator-test-build 2>/dev/null || true
    
    # Démarrer MongoDB
    echo -e "${BLUE}📦 Démarrage de MongoDB pour le test...${NC}"
    docker run -d --name mongodb-test-build -p 27017:27017 mongo:8.0
    
    # Attendre que MongoDB soit prêt
    echo -e "${YELLOW}⏳ Attente que MongoDB soit prêt...${NC}"
    sleep 15
    
    # Tester la connexion MongoDB
    if docker exec mongodb-test-build mongosh --eval "db.runCommand('ping')" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ MongoDB est prêt${NC}"
    else
        echo -e "${YELLOW}⏳ MongoDB n'est pas encore prêt, attente supplémentaire...${NC}"
        sleep 10
    fi
    
    # Démarrer le translator
    echo -e "${BLUE}🚀 Démarrage du service Translator...${NC}"
    docker run -d --name translator-test-build \
        --link mongodb-test-build:mongodb \
        -p 8000:8000 \
        -e DATABASE_URL=mongodb://mongodb:27017/meeshy \
        "$FULL_IMAGE_NAME"
    
    # Attendre que le service démarre
    echo -e "${YELLOW}⏳ Attente que le service Translator démarre...${NC}"
    sleep 30
    
    # Vérifier les logs
    echo -e "${BLUE}📋 Logs du service Translator:${NC}"
    docker logs --tail 20 translator-test-build
    
    # Test de connectivité
    echo -e "${YELLOW}🔍 Test de connectivité...${NC}"
    if curl -s http://localhost:8000/health >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Service accessible sur http://localhost:8000/health${NC}"
    else
        echo -e "${YELLOW}⚠️ Service pas encore accessible, vérification des logs...${NC}"
        docker logs --tail 10 translator-test-build
    fi
    
    # Nettoyage
    echo -e "${YELLOW}🧹 Nettoyage des conteneurs de test...${NC}"
    docker stop translator-test-build mongodb-test-build
    docker rm translator-test-build mongodb-test-build
    
    echo -e "${GREEN}🎉 Test terminé avec succès !${NC}"
    
    # Instructions d'utilisation
    echo ""
    echo -e "${BLUE}📖 Instructions d'utilisation:${NC}"
    echo ""
    echo -e "${YELLOW}💡 Pour démarrer avec MongoDB local:${NC}"
    echo "   docker run -d --name mongodb -p 27017:27017 mongo:8.0"
    echo "   docker run -d --name translator --link mongodb:mongodb -p 8000:8000 -e DATABASE_URL=mongodb://mongodb:27017/meeshy $FULL_IMAGE_NAME"
    echo ""
    echo -e "${YELLOW}💡 Pour démarrer avec docker-compose:${NC}"
    echo "   docker-compose up -d"
    echo ""
    echo -e "${YELLOW}💡 Pour tester l'API:${NC}"
    echo "   curl http://localhost:8000/health"
    echo "   curl http://localhost:8000/translate -X POST -H 'Content-Type: application/json' -d '{\"text\":\"Hello world\",\"source_lang\":\"en\",\"target_lang\":\"fr\"}'"
    
else
    echo -e "${RED}❌ Échec de la construction de l'image Docker MongoDB${NC}"
    exit 1
fi

echo -e "${GREEN}🎉 Build et test Docker MongoDB terminés !${NC}"
