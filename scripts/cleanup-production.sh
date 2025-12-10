#!/bin/bash

# Script de nettoyage de la production
# Garde uniquement les fichiers essentiels

set -e

echo "=========================================="
echo "  Nettoyage de la production"
echo "=========================================="
echo ""

ssh root@157.230.15.51 << 'ENDSSH'
cd /opt/meeshy

echo "📋 Fichiers à conserver:"
echo ""

# Fichiers essentiels en production
KEEP_FILES=(
    "docker-compose.yml"           # docker-compose principal
    ".env"                         # Variables d'environnement
    "docker/nginx/static-files.conf"  # Config nginx pour static
)

KEEP_DIRS=(
    "docker/nginx"                 # Config nginx
    "scripts"                      # Scripts utiles (backups, etc)
)

echo "Fichiers:"
for file in "${KEEP_FILES[@]}"; do
    echo "  ✅ $file"
done

echo ""
echo "Répertoires:"
for dir in "${KEEP_DIRS[@]}"; do
    echo "  ✅ $dir/"
done

echo ""
echo "🗑️  Fichiers à supprimer:"
echo ""

# Liste des fichiers à supprimer
TO_DELETE=(
    "docker-compose.dev.yml"
    "docker-compose.local.yml"
    "docker-compose.unified.yml"
    "docker/nginx/default.conf"
    "docker/nginx/dev.conf"
    "docker/nginx/digitalocean.conf"
    "docker/nginx/letsencrypt.conf"
    "docker/nginx/nginx.conf"
    "docker/nginx/prod.conf"
    "docker/nginx/ssl-optimized.conf"
    "docker/supervisor"
    "docker/scripts"
    "docker/elasticsearch"
    "docker/logstash"
    "shared"
    ".gitignore"
    "README.md"
)

for item in "${TO_DELETE[@]}"; do
    if [ -e "$item" ]; then
        echo "  🗑️  $item"
    fi
done

echo ""
read -p "Continuer avec le nettoyage? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Nettoyage annulé"
    exit 1
fi

echo ""
echo "🧹 Nettoyage en cours..."

# Renommer docker-compose.traefik.yml en docker-compose.yml
if [ -f "docker-compose.traefik.yml" ]; then
    mv docker-compose.traefik.yml docker-compose.yml
    echo "✅ docker-compose.traefik.yml → docker-compose.yml"
fi

# Supprimer les fichiers inutiles
for item in "${TO_DELETE[@]}"; do
    if [ -e "$item" ]; then
        rm -rf "$item"
        echo "🗑️  Supprimé: $item"
    fi
done

# Nettoyer les anciens backups (garder les 5 plus récents)
if [ -d "backups" ]; then
    echo ""
    echo "🧹 Nettoyage des anciens backups..."
    cd backups
    ls -t | tail -n +6 | xargs -r rm -rf
    echo "✅ Gardé les 5 backups les plus récents"
    cd ..
fi

echo ""
echo "📊 État final:"
echo ""
echo "Fichiers de configuration:"
ls -lh *.yml *.env 2>/dev/null || true

echo ""
echo "Répertoires:"
ls -d */ 2>/dev/null | grep -v node_modules || true

echo ""
echo "✅ Nettoyage terminé!"

ENDSSH

echo ""
echo "=========================================="
echo "  ✅ Production nettoyée"
echo "=========================================="
echo ""

