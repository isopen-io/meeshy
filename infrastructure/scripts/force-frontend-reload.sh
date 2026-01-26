#!/bin/bash

# =============================================================================
# FORCER LE RECHARGEMENT DU FRONTEND - Invalidation du cache
# =============================================================================

set -e

REMOTE_HOST="${REMOTE_HOST:-root@meeshy.me}"
STAGING_DIR="/opt/meeshy/staging"

echo "🔄 Forçage du rechargement frontend avec invalidation du cache..."
echo ""

# =============================================================================
# ÉTAPE 1: REDÉMARRER LE FRONTEND AVEC NOUVELLE STRATÉGIE DE CACHE
# =============================================================================

echo "♻️  Redémarrage du frontend avec nouvelles variables de cache..."

# Ajouter un timestamp pour forcer le rechargement
CACHE_BUST=$(date +%s)

ssh $REMOTE_HOST "cd $STAGING_DIR && \
  docker compose stop frontend-staging && \
  docker compose rm -f frontend-staging && \
  NEXT_CACHE_BUST=$CACHE_BUST docker compose up -d frontend-staging"

echo "✅ Frontend redémarré avec cache bust: $CACHE_BUST"
echo ""

# =============================================================================
# ÉTAPE 2: ATTENTE ET VÉRIFICATION
# =============================================================================

echo "⏳ Attente du démarrage (20s)..."
sleep 20

echo ""
echo "📊 Status du frontend:"
ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose ps frontend-staging"
echo ""

echo "🏥 Vérification frontend:"
if curl -sf https://staging.meeshy.me:8443 >/dev/null 2>&1; then
  echo "✅ Frontend accessible"
else
  echo "❌ Frontend non accessible"
fi

echo ""
echo "✅ Rechargement terminé!"
echo ""
echo "📝 Instructions pour l'utilisateur:"
echo "   1. Ouvrir DevTools (F12)"
echo "   2. Onglet Application > Storage > Clear site data"
echo "   3. OU utiliser navigation privée (Ctrl+Shift+N)"
echo "   4. OU hard refresh (Ctrl+Shift+R)"
echo ""
