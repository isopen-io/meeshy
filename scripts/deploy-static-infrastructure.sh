#!/bin/bash

# Script de déploiement de l'infrastructure pour static.meeshy.me
# Ce script déploie uniquement les changements d'infrastructure (Nginx + Traefik)

set -e

echo "=========================================="
echo "  Déploiement infrastructure static.meeshy.me"
echo "=========================================="
echo ""

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "📂 Répertoire: $PROJECT_ROOT"
echo ""

# 1. Copier les fichiers de configuration sur le serveur
echo "📤 Copie des fichiers de configuration..."
echo ""

scp "$PROJECT_ROOT/docker/nginx/static-files.conf" root@157.230.15.51:/opt/meeshy/docker/nginx/
if [ $? -ne 0 ]; then
    echo "❌ Erreur lors de la copie de static-files.conf"
    exit 1
fi
echo "✅ Nginx config copiée"

scp "$PROJECT_ROOT/docker-compose.traefik.yml" root@157.230.15.51:/opt/meeshy/
if [ $? -ne 0 ]; then
    echo "❌ Erreur lors de la copie de docker-compose.traefik.yml"
    exit 1
fi
echo "✅ Docker compose copié"

echo ""
echo "🚀 Déploiement sur le serveur de production..."
echo ""

# 2. Déploiement en production
ssh root@157.230.15.51 << 'ENDSSH'
cd /opt/meeshy

echo "📋 Configuration actuelle:"
docker ps | grep -E "meeshy-(frontend|static)" || echo "Aucun service actif"
echo ""

echo "🔄 Démarrage du service static-files..."
docker compose -f docker-compose.traefik.yml up -d static-files

if [ $? -ne 0 ]; then
    echo "❌ Erreur lors du démarrage du service"
    exit 1
fi

echo ""
echo "⏳ Attente du démarrage (15 secondes)..."
sleep 15

echo ""
echo "🔍 Vérification du statut des services..."
docker ps | grep -E "meeshy-(frontend|static)"

echo ""
echo "📊 Logs du service static-files:"
docker logs meeshy-static-files --tail 30

echo ""
echo "🔍 Vérification du healthcheck..."
docker inspect meeshy-static-files --format '{{.State.Health.Status}}'

echo ""
echo "✅ Infrastructure déployée"
ENDSSH

echo ""
echo "=========================================="
echo "  ✅ Infrastructure déployée avec succès!"
echo "=========================================="
echo ""
echo "📝 Vérifications à effectuer:"
echo ""
echo "1. Vérifier le statut du service:"
echo "   ssh root@157.230.15.51 'docker ps | grep static-files'"
echo ""
echo "2. Vérifier les logs:"
echo "   ssh root@157.230.15.51 'docker logs meeshy-static-files'"
echo ""
echo "3. Tester le healthcheck:"
echo "   curl https://static.meeshy.me/health"
echo ""
echo "4. Attendre la propagation DNS pour static.meeshy.me (peut prendre quelques minutes)"
echo ""
echo "5. Tester l'accès à un fichier existant (une fois le frontend rebuilé):"
echo "   curl -I https://static.meeshy.me/i/2025/10/avatar_xxx.jpg"
echo ""
echo "⚠️  N'oubliez pas de:"
echo "   - Ajouter l'enregistrement DNS: static.meeshy.me → 157.230.15.51"
echo "   - Rebuilder le frontend pour utiliser NEXT_PUBLIC_STATIC_URL"
echo ""

