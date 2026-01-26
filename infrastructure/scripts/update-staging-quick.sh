#!/bin/bash

# =============================================================================
# MISE À JOUR RAPIDE STAGING - Pull et redémarrage
# =============================================================================

set -e

REMOTE_HOST="${REMOTE_HOST:-root@meeshy.me}"
STAGING_DIR="/opt/meeshy/staging"

echo "🔄 Mise à jour rapide staging..."
echo ""

# =============================================================================
# ÉTAPE 1: PULL DES DERNIÈRES IMAGES
# =============================================================================

echo "🐋 Pull des dernières images Docker..."
ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose pull gateway-staging translator-staging frontend-staging"
echo "✅ Images à jour"
echo ""

# =============================================================================
# ÉTAPE 2: REDÉMARRAGE DES SERVICES
# =============================================================================

echo "♻️  Redémarrage des services avec nouvelles images..."
ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose up -d --force-recreate gateway-staging translator-staging frontend-staging"
echo "✅ Services redémarrés"
echo ""

# =============================================================================
# ÉTAPE 3: ATTENTE ET VÉRIFICATION
# =============================================================================

echo "⏳ Attente du démarrage (30s)..."
sleep 30

echo ""
echo "📊 Status des services:"
ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose ps gateway-staging translator-staging frontend-staging"
echo ""

# =============================================================================
# ÉTAPE 4: HEALTH CHECKS
# =============================================================================

echo "🏥 Vérification health endpoints..."
echo ""

echo -n "   Gateway: "
if curl -sf https://gate.staging.meeshy.me:8443/health >/dev/null 2>&1; then
  echo "✅ OK"
  curl -s https://gate.staging.meeshy.me:8443/health | grep -o '"version":"[^"]*"' || echo ""
else
  echo "❌ FAIL"
fi

echo -n "   ML Service: "
if curl -sf https://ml.staging.meeshy.me:8443/health >/dev/null 2>&1; then
  echo "✅ OK"
  curl -s https://ml.staging.meeshy.me:8443/health | grep -o '"version":"[^"]*"' || echo ""
else
  echo "❌ FAIL"
fi

echo -n "   Frontend: "
if curl -sf https://staging.meeshy.me:8443 >/dev/null 2>&1; then
  echo "✅ OK"
else
  echo "❌ FAIL"
fi

echo ""
echo "✅ Mise à jour terminée!"
echo ""
echo "URLs staging:"
echo "  - Frontend: https://staging.meeshy.me:8443"
echo "  - Gateway: https://gate.staging.meeshy.me:8443"
echo "  - ML Service: https://ml.staging.meeshy.me:8443"
