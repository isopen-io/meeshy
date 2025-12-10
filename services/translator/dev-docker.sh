#!/bin/bash

# Script de développement pour le translator utilisant Docker
# Reproduit l'environnement Docker localement

echo "🚀 Démarrage du translator en mode développement avec Docker..."

# Vérifier que Docker est disponible
if ! command -v docker &> /dev/null; then
    echo "❌ Docker n'est pas installé ou n'est pas dans le PATH"
    exit 1
fi

# Construire l'image si nécessaire
echo "🔨 Construction de l'image Docker du translator..."
docker build -t meeshy-translator:dev .

# Démarrer le conteneur en mode développement
echo "🏃 Démarrage du conteneur en mode développement..."
docker run -it --rm \
    --name meeshy-dev-translator \
    -p 8000:8000 \
    -p 50051:50051 \
    -p 5555:5555 \
    -p 5558:5558 \
    -v "$(pwd)/src:/workspace/src" \
    -v "$(pwd)/shared:/workspace/shared" \
    -v "$(pwd)/.env:/workspace/.env" \
    -e DEBUG=true \
    -e LOG_LEVEL=debug \
    meeshy-translator:dev

echo "✅ Translator démarré en mode développement"

