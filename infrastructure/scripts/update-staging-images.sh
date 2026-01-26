#!/bin/bash

# =============================================================================
# UPDATE STAGING IMAGES - Pull et redémarrage avec dernières images
# =============================================================================

set -e

REMOTE_HOST="root@meeshy.me"
STAGING_DIR="/opt/meeshy/staging"

echo "🔄 Mise à jour des images staging..."
echo ""

# =============================================================================
# ÉTAPE 1: COPIER .env.staging MIS À JOUR
# =============================================================================

echo "📤 Upload .env.staging mis à jour..."
scp infrastructure/docker/compose/.env.staging $REMOTE_HOST:$STAGING_DIR/.env
echo "✅ .env.staging copié"
echo ""

# =============================================================================
# ÉTAPE 2: PULL DES DERNIÈRES IMAGES
# =============================================================================

echo "🐋 Pull des dernières images Docker..."
ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose pull"
echo "✅ Images mises à jour"
echo ""

# =============================================================================
# ÉTAPE 3: REDÉMARRER LES SERVICES
# =============================================================================

echo "♻️  Redémarrage des services avec nouvelles images..."
ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose up -d --force-recreate"
echo "✅ Services redémarrés"
echo ""

# =============================================================================
# ÉTAPE 4: VÉRIFIER STATUS
# =============================================================================

echo "⏳ Attente du démarrage (30s)..."
sleep 30

echo "📊 Status des services:"
ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose ps"
echo ""

# =============================================================================
# ÉTAPE 5: HEALTH CHECKS
# =============================================================================

echo "🏥 Vérification health endpoints..."

echo -n "   Gateway: "
curl -sf https://gate.staging.meeshy.me/health >/dev/null && echo "✅ OK" || echo "❌ FAIL"

echo -n "   ML Service: "
curl -sf https://ml.staging.meeshy.me/health >/dev/null && echo "✅ OK" || echo "❌ FAIL"

echo -n "   Frontend: "
curl -sf https://staging.meeshy.me >/dev/null && echo "✅ OK" || echo "❌ FAIL"

echo ""
echo "✅ Mise à jour staging terminée!"
echo ""
echo "URLs staging:"
echo "  - Frontend: https://staging.meeshy.me"
echo "  - Gateway: https://gate.staging.meeshy.me"
echo "  - ML Service: https://ml.staging.meeshy.me"
echo "  - Traefik: https://traefik.staging.meeshy.me"
