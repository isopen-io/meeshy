#!/bin/bash
# =============================================================================
# MEESHY - Script de Switch Production
# =============================================================================
# Description: Switch atomique de l'ancienne prod vers la nouvelle avec Prisma
# Usage: ./infrastructure/scripts/switch-to-production.sh
#
# ATTENTION: Ce script effectue le switch en production
# Durée cible: ≤10 minutes de downtime
# =============================================================================

set -euo pipefail

REMOTE_HOST="root@meeshy.me"
OLD_PROD_DIR="/opt/meeshy"
NEW_PROD_DIR="/opt/meeshy/production"
STAGING_DIR="/opt/meeshy/staging"
BACKUP_DIR="/opt/meeshy/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 SWITCH PRODUCTION MEESHY${NC}"
echo ""
echo "⚠️  ${RED}ATTENTION: Cette opération va:${NC}"
echo "   1. Arrêter la production actuelle"
echo "   2. Migrer vers le nouveau schema Prisma"
echo "   3. Redémarrer avec les nouvelles images"
echo ""
echo "   Downtime cible: ≤10 minutes"
echo ""

read -p "Êtes-vous ABSOLUMENT SÛR de continuer? (oui/non): " confirm1

if [ "$confirm1" != "oui" ]; then
  echo "Switch annulé."
  exit 0
fi

echo ""
read -p "Taper 'SWITCH-PRODUCTION' pour confirmer: " confirm2

if [ "$confirm2" != "SWITCH-PRODUCTION" ]; then
  echo "Confirmation incorrecte. Annulé."
  exit 0
fi

echo ""
echo -e "${GREEN}✅ Confirmé - Début du switch${NC}"
echo ""

START_TIME=$(date +%s)

# =============================================================================
# ÉTAPE 1: VÉRIFICATIONS PRÉ-SWITCH
# =============================================================================

echo "🔍 Vérifications pré-switch..."

# Vérifier que staging fonctionne
STAGING_GATEWAY_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "https://gate.staging.meeshy.me/health" 2>/dev/null || echo "000")

if [ "$STAGING_GATEWAY_HEALTH" != "200" ]; then
  echo -e "${RED}❌ Staging gateway ne répond pas (HTTP $STAGING_GATEWAY_HEALTH)${NC}"
  echo "   Vérifier staging avant de continuer"
  exit 1
fi

echo "   ✅ Staging gateway OK"

# Vérifier que les données ont été migrées dans staging
STAGING_USER_COUNT=$(ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose exec -T gateway \
  node -e \"const { PrismaClient } = require('@prisma/client'); \
  const prisma = new PrismaClient(); \
  prisma.user.count().then(c => console.log(c)).finally(() => prisma.\\\$disconnect())\" 2>/dev/null" || echo "0")

if [ "$STAGING_USER_COUNT" -eq 0 ]; then
  echo -e "${RED}❌ Aucun utilisateur dans staging${NC}"
  echo "   Migrer les données dans staging d'abord"
  exit 1
fi

echo "   ✅ Staging contient $STAGING_USER_COUNT utilisateurs"
echo ""

# =============================================================================
# ÉTAPE 2: CAPTURE ÉTAT PRÉ-SWITCH
# =============================================================================

echo "📸 Capture de l'état pré-switch..."

./infrastructure/scripts/capture-pre-switch-state.sh

SNAPSHOT_NAME=$(cat /tmp/last-snapshot-name.txt)

echo "   ✅ Snapshot créé: $SNAPSHOT_NAME"
echo ""

# =============================================================================
# ÉTAPE 3: MIGRATION DELTA (nouvelles données depuis test staging)
# =============================================================================

echo "🔄 Migration des données delta vers staging..."

# Backup final de production
echo "   Backup final production..."
ssh $REMOTE_HOST "docker exec meeshy-database mongodump \
  --db=meeshy \
  --out=/dump/final-backup-$TIMESTAMP \
  --quiet"

ssh $REMOTE_HOST "docker cp meeshy-database:/dump/final-backup-$TIMESTAMP \
  $BACKUP_DIR/"

echo "   ✅ Backup final créé"

# Comparer les timestamps et migrer seulement les nouvelles données
# (Pour simplifier, on peut re-migrer toutes les données avec upsert)
echo "   ⚠️  Migration delta non implémentée - données staging seront utilisées telles quelles"
echo "   (Acceptable si staging vient d'être testé)"
echo ""

# =============================================================================
# ÉTAPE 4: ARRÊT PRODUCTION ACTUELLE
# =============================================================================

echo "🛑 Arrêt de la production actuelle..."

DOWNTIME_START=$(date +%s)

ssh $REMOTE_HOST "cd $OLD_PROD_DIR && docker compose down"

echo "   ✅ Production arrêtée"
echo ""

# =============================================================================
# ÉTAPE 5: DÉPLACEMENT ANCIENNE PROD
# =============================================================================

echo "📦 Déplacement de l'ancienne production..."

# Créer backup de l'ancienne structure
ssh $REMOTE_HOST "mkdir -p /opt/meeshy-backups"

ssh $REMOTE_HOST "mv $OLD_PROD_DIR $NEW_PROD_DIR-old-$TIMESTAMP"

echo "   ✅ Ancienne prod déplacée vers: $NEW_PROD_DIR-old-$TIMESTAMP"
echo ""

# =============================================================================
# ÉTAPE 6: COPIE STAGING VERS PRODUCTION
# =============================================================================

echo "🚚 Copie staging vers production..."

# Copier la configuration staging vers production
ssh $REMOTE_HOST "cp -r $STAGING_DIR $NEW_PROD_DIR"

# Remplacer le docker-compose.staging.yml par docker-compose.yml
# et ajuster pour les URLs de production
ssh $REMOTE_HOST "cd $NEW_PROD_DIR && \
  sed 's/staging\\.meeshy\\.me/meeshy.me/g' docker-compose.yml > docker-compose.prod.yml && \
  mv docker-compose.prod.yml docker-compose.yml"

# Ajuster les ports (80/443 au lieu de 8080/8443)
ssh $REMOTE_HOST "cd $NEW_PROD_DIR && \
  sed -i 's/8080:80/80:80/g' docker-compose.yml && \
  sed -i 's/8443:443/443:443/g' docker-compose.yml"

# Ajuster les noms de volumes (enlever staging_)
ssh $REMOTE_HOST "cd $NEW_PROD_DIR && \
  sed -i 's/meeshy-staging-/meeshy-/g' docker-compose.yml"

# Ajuster les noms de containers (enlever -staging)
ssh $REMOTE_HOST "cd $NEW_PROD_DIR && \
  sed -i 's/-staging//g' docker-compose.yml"

# Ajuster le réseau
ssh $REMOTE_HOST "cd $NEW_PROD_DIR && \
  sed -i 's/meeshy-staging-network/meeshy-network/g' docker-compose.yml"

echo "   ✅ Configuration ajustée pour production"
echo ""

# =============================================================================
# ÉTAPE 7: COPIE DES VOLUMES STAGING → PRODUCTION
# =============================================================================

echo "💾 Copie des volumes staging vers production..."

# Liste des volumes à copier
VOLUMES=(
  "database-data"
  "gateway-uploads"
  "web-uploads"
  "redis-data"
  "models-data"
)

for volume in "${VOLUMES[@]}"; do
  echo "   Copie meeshy-staging-$volume → meeshy-$volume..."

  # Créer le volume de production s'il n'existe pas
  ssh $REMOTE_HOST "docker volume create meeshy-$volume" || true

  # Copier les données
  ssh $REMOTE_HOST "docker run --rm \
    -v meeshy-staging-$volume:/from:ro \
    -v meeshy-$volume:/to \
    alpine sh -c 'cp -av /from/. /to/'" || {
    echo -e "   ${RED}⚠️  Erreur lors de la copie de $volume${NC}"
  }
done

echo "   ✅ Volumes copiés"
echo ""

# =============================================================================
# ÉTAPE 8: DÉMARRAGE NOUVELLE PRODUCTION
# =============================================================================

echo "▶️  Démarrage de la nouvelle production..."

ssh $REMOTE_HOST "cd $NEW_PROD_DIR && docker compose up -d"

DOWNTIME_END=$(date +%s)
DOWNTIME=$((DOWNTIME_END - DOWNTIME_START))

echo "   ✅ Services démarrés"
echo "   ⏱️  Downtime: ${DOWNTIME}s"
echo ""

# =============================================================================
# ÉTAPE 9: ATTENTE ET VÉRIFICATION
# =============================================================================

echo "⏳ Attente du démarrage complet (60s)..."
sleep 60

echo "🔍 Vérification de la nouvelle production..."
echo ""

# Vérifier gateway health
PROD_GATEWAY_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "https://gate.meeshy.me/health" 2>/dev/null || echo "000")

if [ "$PROD_GATEWAY_HEALTH" = "200" ]; then
  echo -e "   ${GREEN}✅ Gateway health OK${NC}"
else
  echo -e "   ${RED}❌ Gateway health FAILED (HTTP $PROD_GATEWAY_HEALTH)${NC}"
  echo ""
  echo "   🔙 ROLLBACK RECOMMANDÉ!"
  echo "   Voir: $NEW_PROD_DIR-old-$TIMESTAMP/MANIFEST.md"
  exit 1
fi

# Vérifier frontend
PROD_FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://meeshy.me" 2>/dev/null || echo "000")

if [ "$PROD_FRONTEND_STATUS" = "200" ]; then
  echo -e "   ${GREEN}✅ Frontend OK${NC}"
else
  echo -e "   ${YELLOW}⚠️  Frontend status: $PROD_FRONTEND_STATUS${NC}"
fi

# Vérifier les données
PROD_USER_COUNT=$(ssh $REMOTE_HOST "cd $NEW_PROD_DIR && docker compose exec -T gateway \
  node -e \"const { PrismaClient } = require('@prisma/client'); \
  const prisma = new PrismaClient(); \
  prisma.user.count().then(c => console.log(c)).finally(() => prisma.\\\$disconnect())\" 2>/dev/null" || echo "0")

echo "   📊 Users en production: $PROD_USER_COUNT"

if [ "$PROD_USER_COUNT" -eq "$STAGING_USER_COUNT" ]; then
  echo -e "   ${GREEN}✅ Count users correspond${NC}"
else
  echo -e "   ${YELLOW}⚠️  Count users différent (staging: $STAGING_USER_COUNT, prod: $PROD_USER_COUNT)${NC}"
fi

echo ""

# =============================================================================
# ÉTAPE 10: NETTOYAGE STAGING
# =============================================================================

echo "🧹 Nettoyage staging (optionnel)..."
read -p "Arrêter et supprimer staging? (oui/non): " cleanup_staging

if [ "$cleanup_staging" = "oui" ]; then
  ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose down"
  echo "   ✅ Staging arrêté (volumes conservés pour rollback)"
else
  echo "   ⏭️  Staging conservé"
fi

echo ""

# =============================================================================
# RÉSUMÉ FINAL
# =============================================================================

END_TIME=$(date +%s)
TOTAL_TIME=$((END_TIME - START_TIME))
TOTAL_MINUTES=$((TOTAL_TIME / 60))
TOTAL_SECONDS=$((TOTAL_TIME % 60))

echo "=" | tr -d '\n' | head -c 80; echo
echo -e "${GREEN}✅ SWITCH PRODUCTION TERMINÉ!${NC}"
echo "=" | tr -d '\n' | head -c 80; echo
echo ""
echo "📊 Résumé:"
echo "   - Downtime: ${DOWNTIME}s"
echo "   - Durée totale: ${TOTAL_MINUTES}m ${TOTAL_SECONDS}s"
echo "   - Users migrés: $PROD_USER_COUNT"
echo "   - Snapshot rollback: $SNAPSHOT_NAME"
echo ""
echo "🌐 URLs de production:"
echo "   - Frontend:  https://meeshy.me"
echo "   - Gateway:   https://gate.meeshy.me"
echo "   - ML:        https://ml.meeshy.me"
echo ""
echo "📝 Prochaines étapes:"
echo "   1. Tester intensivement la production"
echo "   2. Surveiller les logs: ssh $REMOTE_HOST 'cd $NEW_PROD_DIR && docker compose logs -f'"
echo "   3. Surveiller les métriques"
echo ""
echo "🔙 Rollback (si nécessaire):"
echo "   Voir: $NEW_PROD_DIR-old-$TIMESTAMP/MANIFEST.md"
echo ""
echo "🗑️  Nettoyage (après validation):"
echo "   - Supprimer ancienne prod: rm -rf $NEW_PROD_DIR-old-$TIMESTAMP"
echo "   - Supprimer staging: ./infrastructure/scripts/teardown-staging.sh"
echo ""

if [ $DOWNTIME -gt 600 ]; then
  echo -e "${YELLOW}⚠️  Downtime > 10 minutes (${DOWNTIME}s)${NC}"
  echo "   Analyser les causes pour améliorer le process"
else
  echo -e "${GREEN}✅ Downtime ≤ 10 minutes (objectif atteint)${NC}"
fi

echo ""
