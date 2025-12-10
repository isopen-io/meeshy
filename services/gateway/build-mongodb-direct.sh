#!/bin/bash

# Script de build direct pour l'image Docker MongoDB de la Gateway Meeshy
# Commande exacte demandée

set -e

echo "🚀 Démarrage du build MongoDB pour Meeshy Gateway..."
echo "📦 Image: isopen/meeshy-gateway"
echo "🏷️  Tags: mongodb, mongodb-ovh"
echo "🖥️  Plateformes: linux/amd64, linux/arm64"
echo ""

# Vérification de la présence du Dockerfile
if [ ! -f "Dockerfile.mongodb" ]; then
    echo "❌ Erreur: Dockerfile.mongodb non trouvé dans le répertoire courant"
    exit 1
fi

# Commande de build exacte
echo "🏗️  Construction de l'image Docker..."
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --progress=plain \
    -t isopen/meeshy-gateway:mongodb \
    -t isopen/meeshy-gateway:mongodb-ovh \
    -f Dockerfile.mongodb \
    . \
    --push

echo ""
echo "✅ Build terminé avec succès!"
echo "📦 Images créées et poussées:"
echo "   - isopen/meeshy-gateway:mongodb"
echo "   - isopen/meeshy-gateway:mongodb-ovh"
echo ""
echo "🖥️  Plateformes supportées: linux/amd64, linux/arm64"


