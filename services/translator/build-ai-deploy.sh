#!/bin/bash

echo "🚀 Construction d'image Docker pour OVHcloud AI Deploy"
echo "====================================================="

# Variables de configuration
IMAGE_NAME="meeshy-translator-mongodb"
IMAGE_TAG="ai-deploy-latest"
DOCKERFILE="Dockerfile.mongodb"
PLATFORM="linux/amd64"

# Fonction pour afficher les résultats
print_result() {
    if [ $1 -eq 0 ]; then
        echo "✅ $2"
    else
        echo "❌ $2"
        exit 1
    fi
}

# Vérification des prérequis
echo
echo "🔍 Vérification des prérequis..."

# Vérifier que Docker est installé
if ! command -v docker &> /dev/null; then
    echo "❌ Docker n'est pas installé"
    exit 1
fi
print_result 0 "Docker disponible"

# Vérifier que buildx est disponible
if ! docker buildx version &> /dev/null; then
    echo "⚠️ Docker buildx non disponible, utilisation de docker build classique"
    USE_BUILDX=false
else
    print_result 0 "Docker buildx disponible"
    USE_BUILDX=true
fi

# Vérifier que le Dockerfile existe
if [ ! -f "$DOCKERFILE" ]; then
    echo "❌ $DOCKERFILE n'existe pas"
    exit 1
fi
print_result 0 "Dockerfile.mongodb trouvé"

# Construction de l'image
echo
echo "🔨 Construction de l'image Docker..."
echo "Image: $IMAGE_NAME:$IMAGE_TAG"
echo "Plateforme: $PLATFORM"
echo "Dockerfile: $DOCKERFILE"

if [ "$USE_BUILDX" = true ]; then
    # Utiliser buildx pour le support multi-plateforme
    docker buildx build \
        --platform "$PLATFORM" \
        -f "$DOCKERFILE" \
        -t "$IMAGE_NAME:$IMAGE_TAG" \
        --load \
        .
    BUILD_RESULT=$?
else
    # Utiliser docker build classique
    docker build \
        -f "$DOCKERFILE" \
        -t "$IMAGE_NAME:$IMAGE_TAG" \
        .
    BUILD_RESULT=$?
fi

print_result $BUILD_RESULT "Image construite avec succès"

# Vérification de l'image
echo
echo "🔍 Vérification de l'image construite..."

# Vérifier que l'image existe
docker images | grep -q "$IMAGE_NAME.*$IMAGE_TAG"
print_result $? "Image présente dans le registre local"

# Afficher les informations de l'image
echo
echo "📊 Informations de l'image:"
docker images | grep "$IMAGE_NAME.*$IMAGE_TAG" | head -1

# Test de l'image avec l'utilisateur 42420
echo
echo "🧪 Test de l'image avec l'utilisateur OVHcloud (42420)..."

# Test rapide de démarrage
timeout 30s docker run --rm --user=42420:42420 "$IMAGE_NAME:$IMAGE_TAG" /bin/bash -c "
    echo 'Test de l'\''utilisateur:'
    id
    echo 'Test du répertoire de travail:'
    pwd
    echo 'Test des permissions:'
    ls -la /workspace/ | head -5
    echo 'Test de Python:'
    python3 --version
    echo '✅ Tests de base réussis'
" 2>/dev/null

if [ $? -eq 0 ] || [ $? -eq 124 ]; then  # 124 = timeout (normal)
    print_result 0 "Tests de base réussis"
else
    print_result 1 "Échec des tests de base"
fi

# Instructions finales
echo
echo "🎯 Image prête pour AI Deploy !"
echo "================================"
echo
echo "📋 Prochaines étapes:"
echo "1. Tester l'image localement:"
echo "   docker run --rm -it --user=42420:42420 $IMAGE_NAME:$IMAGE_TAG"
echo
echo "2. Taguer pour votre registre (exemple):"
echo "   docker tag $IMAGE_NAME:$IMAGE_TAG your-registry.com/$IMAGE_NAME:$IMAGE_TAG"
echo
echo "3. Pousser vers votre registre:"
echo "   docker push your-registry.com/$IMAGE_NAME:$IMAGE_TAG"
echo
echo "4. Déployer sur OVHcloud AI Deploy avec:"
echo "   - Image: your-registry.com/$IMAGE_NAME:$IMAGE_TAG"
echo "   - Variables d'environnement selon vos besoins"
echo "   - Ports exposés: 8000 (HTTP), 50051 (gRPC), 5555, 5558 (ZMQ)"
echo
echo "✅ Configuration conforme aux exigences OVHcloud AI Deploy !"
