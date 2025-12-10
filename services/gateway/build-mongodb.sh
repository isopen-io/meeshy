#!/bin/bash

# Script de build pour l'image Docker MongoDB de la Gateway Meeshy
# Usage: ./build-mongodb.sh [version]

set -e

# Configuration
IMAGE_NAME="isopen/meeshy-gateway"
TAG_MONGODB="mongodb"
TAG_OVH="mongodb-ovh"
VERSION=${1:-$(date +%Y%m%d-%H%M%S)}

echo "🚀 Démarrage du build MongoDB pour Meeshy Gateway..."
echo "📦 Image: ${IMAGE_NAME}"
echo "🏷️  Tags: ${TAG_MONGODB}, ${TAG_OVH}"
echo "📋 Version: ${VERSION}"
echo "🖥️  Plateformes: linux/amd64, linux/arm64"
echo ""

# Vérification de la présence du Dockerfile
if [ ! -f "Dockerfile.mongodb" ]; then
    echo "❌ Erreur: Dockerfile.mongodb non trouvé dans le répertoire courant"
    exit 1
fi

# Vérification de la présence de docker buildx
if ! docker buildx version > /dev/null 2>&1; then
    echo "❌ Erreur: docker buildx n'est pas disponible"
    echo "💡 Installez Docker Buildx ou activez-le avec: docker buildx install"
    exit 1
fi

# Création du builder multi-platform si nécessaire
echo "🔧 Configuration du builder multi-platform..."
docker buildx create --name meeshy-mongodb-builder --use --driver docker-container 2>/dev/null || true

# Build de l'image
echo "🏗️  Construction de l'image Docker..."
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --progress=plain \
    -t "${IMAGE_NAME}:${TAG_MONGODB}" \
    -t "${IMAGE_NAME}:${TAG_MONGODB}-${VERSION}" \
    -t "${IMAGE_NAME}:${TAG_OVH}" \
    -t "${IMAGE_NAME}:${TAG_OVH}-${VERSION}" \
    -f Dockerfile.mongodb \
    . \
    --push

echo ""
echo "✅ Build terminé avec succès!"
echo "📦 Images créées:"
echo "   - ${IMAGE_NAME}:${TAG_MONGODB}"
echo "   - ${IMAGE_NAME}:${TAG_MONGODB}-${VERSION}"
echo "   - ${IMAGE_NAME}:${TAG_OVH}"
echo "   - ${IMAGE_NAME}:${TAG_OVH}-${VERSION}"
echo ""
echo "🖥️  Plateformes supportées: linux/amd64, linux/arm64"
echo "🚀 Images poussées vers le registry Docker Hub"
echo ""
echo "💡 Pour tester localement:"
echo "   docker run -p 3000:3000 ${IMAGE_NAME}:${TAG_MONGODB}"


