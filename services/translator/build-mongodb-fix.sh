#!/bin/bash

echo "🚀 Construction rapide avec corrections MongoDB pour AI Deploy"
echo "============================================================"

# Variables
IMAGE_NAME="isopen/meeshy-translator"
TAG_MONGODB="mongodb-fix-$(date +%Y%m%d-%H%M)"
TAG_LATEST="mongodb-ovh-latest"
DOCKERFILE="Dockerfile.mongodb"

echo "📋 Tags de l'image:"
echo "  - $IMAGE_NAME:$TAG_MONGODB"
echo "  - $IMAGE_NAME:$TAG_LATEST"

# Construction avec buildx multi-plateforme
echo
echo "🔨 Construction de l'image Docker..."

docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --progress=plain \
    -f "$DOCKERFILE" \
    -t "$IMAGE_NAME:$TAG_MONGODB" \
    -t "$IMAGE_NAME:$TAG_LATEST" \
    . \
    --push

if [ $? -eq 0 ]; then
    echo
    echo "✅ Construction et push réussis!"
    echo
    echo "📋 Images disponibles:"
    echo "  - $IMAGE_NAME:$TAG_MONGODB"
    echo "  - $IMAGE_NAME:$TAG_LATEST"
    echo
    echo "🚀 Prêt pour déploiement AI Deploy avec:"
    echo "  Image: $IMAGE_NAME:$TAG_LATEST"
    echo
    echo "🔧 Améliorations apportées:"
    echo "  ✅ Test de connectivité DNS amélioré"
    echo "  ✅ Configuration MongoDB optimisée pour OVH Cloud"
    echo "  ✅ Timeouts étendus pour les connexions lentes"
    echo "  ✅ Retry logic amélioré"
    echo "  ✅ Mode dégradé en cas d'échec de migration"
    echo "  ✅ Script de health check dédié"
    echo
else
    echo "❌ Échec de la construction!"
    exit 1
fi
