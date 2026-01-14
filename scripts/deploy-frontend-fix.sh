#!/bin/bash

# Script de déploiement de la correction du service des fichiers statiques
# Ce script build et déploie la nouvelle image frontend avec la route API pour servir les avatars

set -e

echo "=========================================="
echo "  Déploiement du fix des fichiers statiques"
echo "=========================================="
echo ""

cd "$(dirname "$0")/.."
PROJECT_ROOT=$(pwd)

echo "📂 Répertoire: $PROJECT_ROOT"
echo ""

# 1. Build de l'image frontend
echo "🔨 Build de l'image frontend..."
cd "$PROJECT_ROOT/frontend"

docker build --platform linux/amd64 -t isopen/meeshy-web:latest .

if [ $? -ne 0 ]; then
    echo "❌ Erreur lors du build de l'image"
    exit 1
fi

echo "✅ Build réussie"
echo ""

# 2. Push sur Docker Hub
echo "📤 Push de l'image sur Docker Hub..."
docker push isopen/meeshy-web:latest

if [ $? -ne 0 ]; then
    echo "❌ Erreur lors du push de l'image"
    exit 1
fi

echo "✅ Push réussie"
echo ""

# 3. Déploiement en production
echo "🚀 Déploiement en production..."
ssh root@157.230.15.51 << 'ENDSSH'
cd /opt/meeshy

echo "📥 Pull de la nouvelle image..."
docker compose -f docker-compose.traefik.yml pull frontend

echo "🔄 Redémarrage du service frontend..."
docker compose -f docker-compose.traefik.yml up -d frontend

echo "⏳ Attente du démarrage (20 secondes)..."
sleep 20

echo "🔍 Vérification du statut..."
docker ps | grep meeshy-web

echo "✅ Déploiement terminé"
ENDSSH

echo ""
echo "=========================================="
echo "  ✅ Déploiement terminé avec succès!"
echo "=========================================="
echo ""
echo "📝 Test de vérification:"
echo "   curl -I https://meeshy.me/i/p/2025/10/avatar_1760877849690_827t7v.jpg"
echo ""
echo "   Résultat attendu: HTTP/2 200"
echo ""

