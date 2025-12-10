#!/bin/bash

# Script de migration sécurisée des avatars vers le volume partagé
# Ce script copie les fichiers existants AVANT de redémarrer le frontend

set -e

echo "=========================================="
echo "  Migration sécurisée des avatars"
echo "=========================================="
echo ""

ssh root@157.230.15.51 << 'ENDSSH'
cd /opt/meeshy

echo "📊 État actuel:"
echo ""

# 1. Compter les fichiers dans le conteneur frontend
CURRENT_FILES=$(docker exec meeshy-frontend find /app/public/i -type f 2>/dev/null | wc -l)
echo "Fichiers dans le conteneur frontend: $CURRENT_FILES"

# 2. Vérifier le volume
VOLUME_PATH=$(docker volume inspect meeshy_frontend_uploads --format '{{.Mountpoint}}')
echo "Chemin du volume: $VOLUME_PATH"

VOLUME_FILES=$(find "$VOLUME_PATH" -type f 2>/dev/null | wc -l)
echo "Fichiers dans le volume: $VOLUME_FILES"
echo ""

# 3. Si le volume est vide mais qu'il y a des fichiers dans le conteneur, MIGRER
if [ $CURRENT_FILES -gt 0 ] && [ $VOLUME_FILES -eq 0 ]; then
    echo "⚠️  Le volume est vide mais le conteneur a $CURRENT_FILES fichiers"
    echo "🔄 Migration nécessaire..."
    echo ""
    
    # Créer un backup de sécurité
    echo "💾 Création d'un backup de sécurité..."
    BACKUP_DIR="/opt/meeshy/backups/avatars_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    docker cp meeshy-frontend:/app/public/i/. "$BACKUP_DIR/"
    
    BACKUP_FILES=$(find "$BACKUP_DIR" -type f | wc -l)
    echo "✅ Backup créé: $BACKUP_DIR ($BACKUP_FILES fichiers)"
    echo ""
    
    # Copier les fichiers vers le volume
    echo "📤 Copie des fichiers vers le volume partagé..."
    cp -r "$BACKUP_DIR"/* "$VOLUME_PATH/"
    
    # Vérifier la copie
    VOLUME_FILES_AFTER=$(find "$VOLUME_PATH" -type f 2>/dev/null | wc -l)
    echo "✅ Fichiers copiés dans le volume: $VOLUME_FILES_AFTER"
    
    if [ $VOLUME_FILES_AFTER -eq $CURRENT_FILES ]; then
        echo "✅ Migration réussie: tous les fichiers ont été copiés"
    else
        echo "❌ ERREUR: Nombre de fichiers différent!"
        echo "   Conteneur: $CURRENT_FILES"
        echo "   Volume: $VOLUME_FILES_AFTER"
        exit 1
    fi
    
elif [ $VOLUME_FILES -gt 0 ]; then
    echo "✅ Le volume contient déjà $VOLUME_FILES fichiers"
    
else
    echo "ℹ️  Aucun fichier à migrer"
fi

echo ""
echo "📋 Structure du volume:"
ls -lh "$VOLUME_PATH" 2>/dev/null || echo "Volume vide"

echo ""
echo "🔄 Redémarrage du service frontend pour monter le volume..."
docker compose -f docker-compose.traefik.yml up -d frontend

echo ""
echo "⏳ Attente du démarrage (15 secondes)..."
sleep 15

echo ""
echo "🔍 Vérification après redémarrage..."

# Vérifier que le frontend voit bien les fichiers du volume
FRONTEND_FILES=$(docker exec meeshy-frontend find /app/public/i -type f 2>/dev/null | wc -l)
echo "Fichiers visibles par le frontend: $FRONTEND_FILES"

# Vérifier que static-files voit aussi les fichiers
STATIC_FILES=$(docker exec meeshy-static-files find /usr/share/nginx/html -type f 2>/dev/null | wc -l)
echo "Fichiers visibles par static-files: $STATIC_FILES"

echo ""
if [ $FRONTEND_FILES -gt 0 ] && [ $STATIC_FILES -gt 0 ]; then
    echo "✅ Les deux services voient les fichiers du volume partagé!"
else
    echo "❌ PROBLÈME: Les services ne voient pas les fichiers"
    echo "   Frontend: $FRONTEND_FILES fichiers"
    echo "   Static: $STATIC_FILES fichiers"
    exit 1
fi

echo ""
echo "📊 Résumé final:"
echo "  - Fichiers dans le volume: $(find "$VOLUME_PATH" -type f 2>/dev/null | wc -l)"
echo "  - Frontend peut lire: $FRONTEND_FILES fichiers"
echo "  - Static peut lire: $STATIC_FILES fichiers"

ENDSSH

echo ""
echo "=========================================="
echo "  ✅ Migration terminée avec succès!"
echo "=========================================="
echo ""
echo "📝 Prochaines étapes:"
echo "  1. Vérifier qu'un avatar existant est accessible:"
echo "     curl -I https://static.meeshy.me/i/p/2025/10/avatar_1760877849690_827t7v.jpg"
echo ""
echo "  2. Rebuilder le frontend avec NEXT_PUBLIC_STATIC_URL"
echo ""

