#!/bin/bash

# Script de déploiement du service Nginx pour les fichiers statiques
# Ce script copie la configuration et démarre le nouveau service

set -e

echo "=========================================="
echo "  Déploiement du service de fichiers statiques"
echo "=========================================="
echo ""

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "📂 Répertoire: $PROJECT_ROOT"
echo ""

# 1. Copier les fichiers de configuration sur le serveur
echo "📤 Copie de la configuration Nginx..."
scp "$PROJECT_ROOT/docker/nginx/static-files.conf" root@157.230.15.51:/opt/meeshy/docker/nginx/
scp "$PROJECT_ROOT/docker-compose.traefik.yml" root@157.230.15.51:/opt/meeshy/

if [ $? -ne 0 ]; then
    echo "❌ Erreur lors de la copie des fichiers"
    exit 1
fi

echo "✅ Fichiers copiés"
echo ""

# 2. Déploiement en production
echo "🚀 Démarrage du service..."
ssh root@157.230.15.51 << 'ENDSSH'
cd /opt/meeshy

echo "🔄 Démarrage du service static-files..."
docker compose -f docker-compose.traefik.yml up -d static-files

echo "⏳ Attente du démarrage (10 secondes)..."
sleep 10

echo ""
echo "🔍 Vérification du statut..."
docker ps | grep static-files

echo ""
echo "📊 Logs du service:"
docker logs meeshy-static-files --tail 20

echo ""
echo "✅ Service démarré"
ENDSSH

echo ""
echo "=========================================="
echo "  ✅ Déploiement terminé avec succès!"
echo "=========================================="
echo ""
echo "📝 Tests de vérification:"
echo ""
echo "1. Vérifier que le service est actif:"
echo "   ssh root@157.230.15.51 'docker ps | grep static-files'"
echo ""
echo "2. Tester l'accès à un avatar:"
echo "   curl -I https://meeshy.me/i/p/2025/10/avatar_1760877849690_827t7v.jpg"
echo ""
echo "3. Vérifier les headers de cache:"
echo "   curl -I https://meeshy.me/i/p/2025/10/avatar_1760877849690_827t7v.jpg | grep -i cache"
echo ""
echo "Résultats attendus:"
echo "  - HTTP/2 200 ✅"
echo "  - Cache-Control: public, immutable ✅"
echo "  - X-Served-By: Nginx-Static ✅"
echo ""

