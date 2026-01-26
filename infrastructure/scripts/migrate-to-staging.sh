#!/bin/bash
# =============================================================================
# MEESHY - Script de Migration vers Staging
# =============================================================================
# Description: Migre les données de production vers staging avec transformation Prisma
# Usage: ./infrastructure/scripts/migrate-to-staging.sh
# =============================================================================

set -euo pipefail

REMOTE_HOST="root@meeshy.me"
STAGING_DIR="/opt/meeshy/staging"
BACKUP_DIR="/opt/meeshy/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "🚀 Migration des données vers STAGING..."
echo ""

# =============================================================================
# ÉTAPE 1: BACKUP PRODUCTION
# =============================================================================

echo "📦 Création du backup production..."

ssh $REMOTE_HOST "mkdir -p $BACKUP_DIR"

# Backup MongoDB production
ssh $REMOTE_HOST "docker exec meeshy-database mongodump \
  --db=meeshy \
  --out=/dump/backup-pre-staging-$TIMESTAMP \
  --quiet"

# Copier le backup hors du container
ssh $REMOTE_HOST "docker cp meeshy-database:/dump/backup-pre-staging-$TIMESTAMP \
  $BACKUP_DIR/"

echo "✅ Backup créé: $BACKUP_DIR/backup-pre-staging-$TIMESTAMP"
echo ""

# =============================================================================
# ÉTAPE 2: RESTAURER DANS STAGING
# =============================================================================

echo "📥 Restauration du backup dans staging..."

# Copier le backup dans le container staging
ssh $REMOTE_HOST "docker cp $BACKUP_DIR/backup-pre-staging-$TIMESTAMP \
  meeshy-database-staging:/dump/"

# Restaurer dans MongoDB staging
ssh $REMOTE_HOST "docker exec meeshy-database-staging mongorestore \
  --db=meeshy \
  --drop \
  /dump/backup-pre-staging-$TIMESTAMP/meeshy \
  --quiet"

echo "✅ Données restaurées dans staging"
echo ""

# =============================================================================
# ÉTAPE 3: VÉRIFIER LES DONNÉES STAGING
# =============================================================================

echo "🔍 Vérification des données staging..."

USER_COUNT=$(ssh $REMOTE_HOST "docker exec meeshy-database-staging mongosh meeshy \
  --quiet --eval 'db.User.countDocuments()'")

MESSAGE_COUNT=$(ssh $REMOTE_HOST "docker exec meeshy-database-staging mongosh meeshy \
  --quiet --eval 'db.Message.countDocuments()'")

NOTIF_COUNT=$(ssh $REMOTE_HOST "docker exec meeshy-database-staging mongosh meeshy \
  --quiet --eval 'db.Notification.countDocuments()'")

USER_CONV_CAT_COUNT=$(ssh $REMOTE_HOST "docker exec meeshy-database-staging mongosh meeshy \
  --quiet --eval 'db.user_conversation_categories.countDocuments()'")

USER_CONV_PREF_COUNT=$(ssh $REMOTE_HOST "docker exec meeshy-database-staging mongosh meeshy \
  --quiet --eval 'db.user_conversation_preferences.countDocuments()'")

echo "   Users: $USER_COUNT"
echo "   Messages: $MESSAGE_COUNT"
echo "   Notifications: $NOTIF_COUNT (seront droppées)"
echo "   User Conversation Categories: $USER_CONV_CAT_COUNT"
echo "   User Conversation Preferences: $USER_CONV_PREF_COUNT"
echo ""

# =============================================================================
# ÉTAPE 4: COPIER LE SCRIPT DE MIGRATION
# =============================================================================

echo "📋 Copie du script de migration vers le serveur..."

ssh $REMOTE_HOST "mkdir -p $STAGING_DIR/migrations"

scp services/gateway/src/migrations/migrate-from-legacy.ts \
  $REMOTE_HOST:$STAGING_DIR/migrations/

echo "✅ Script copié"
echo ""

# =============================================================================
# ÉTAPE 5: MIGRATION DRY-RUN
# =============================================================================

echo "🧪 Exécution DRY-RUN de la migration..."
echo ""

ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose exec -T gateway \
  tsx /app/migrations/migrate-from-legacy.ts --dry-run"

echo ""
read -p "Dry-run OK? Continuer avec la migration réelle? (oui/non): " confirm

if [ "$confirm" != "oui" ]; then
  echo "Migration annulée."
  exit 1
fi

echo ""

# =============================================================================
# ÉTAPE 6: MIGRATION RÉELLE
# =============================================================================

echo "🔄 Exécution de la migration réelle..."
echo ""

ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose exec -T gateway \
  tsx /app/migrations/migrate-from-legacy.ts"

echo ""

# =============================================================================
# ÉTAPE 7: VALIDATION POST-MIGRATION
# =============================================================================

echo "✅ Validation des données migrées..."

# Compter via Prisma (nouveau schema)
NEW_USER_COUNT=$(ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose exec -T gateway \
  node -e \"const { PrismaClient } = require('@prisma/client'); \
  const prisma = new PrismaClient(); \
  prisma.user.count().then(c => console.log(c)).finally(() => prisma.\\\$disconnect())\"")

NEW_MESSAGE_COUNT=$(ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose exec -T gateway \
  node -e \"const { PrismaClient } = require('@prisma/client'); \
  const prisma = new PrismaClient(); \
  prisma.message.count().then(c => console.log(c)).finally(() => prisma.\\\$disconnect())\"")

echo ""
echo "📊 Comparaison:"
echo "   Users: $USER_COUNT → $NEW_USER_COUNT"
echo "   Messages: $MESSAGE_COUNT → $NEW_MESSAGE_COUNT"
echo ""

if [ "$USER_COUNT" != "$NEW_USER_COUNT" ]; then
  echo "⚠️  Attention: Le nombre d'utilisateurs ne correspond pas!"
  read -p "Continuer quand même? (oui/non): " force_continue
  if [ "$force_continue" != "oui" ]; then
    exit 1
  fi
fi

if [ "$MESSAGE_COUNT" != "$NEW_MESSAGE_COUNT" ]; then
  echo "⚠️  Attention: Le nombre de messages ne correspond pas!"
  read -p "Continuer quand même? (oui/non): " force_continue
  if [ "$force_continue" != "oui" ]; then
    exit 1
  fi
fi

# =============================================================================
# ÉTAPE 8: REDÉMARRER LES SERVICES STAGING
# =============================================================================

echo "🔄 Redémarrage des services staging..."

ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose restart gateway"

echo "✅ Services redémarrés"
echo ""

# Attendre que les services soient prêts
echo "⏳ Attente du démarrage des services (30s)..."
sleep 30

# =============================================================================
# RÉSUMÉ
# =============================================================================

echo "=" | tr -d '\n' | head -c 80; echo
echo "✅ MIGRATION VERS STAGING TERMINÉE!"
echo "=" | tr -d '\n' | head -c 80; echo
echo ""
echo "📊 Résumé:"
echo "   - Backup: $BACKUP_DIR/backup-pre-staging-$TIMESTAMP"
echo "   - Users migrés: $NEW_USER_COUNT"
echo "   - Messages migrés: $NEW_MESSAGE_COUNT"
echo "   - Catégories de conversations: $USER_CONV_CAT_COUNT"
echo "   - Préférences de conversations: $USER_CONV_PREF_COUNT"
echo ""
echo "🌐 Tester staging:"
echo "   - Frontend: https://staging.meeshy.me"
echo "   - Gateway: https://gate.staging.meeshy.me/health"
echo "   - MongoDB UI: https://mongo.staging.meeshy.me"
echo ""
echo "📝 Prochaines étapes:"
echo "   1. Tester l'application sur staging"
echo "   2. Valider toutes les fonctionnalités"
echo "   3. Si OK: ./infrastructure/scripts/switch-to-production.sh"
echo ""
echo "🔙 Rollback (si problème):"
echo "   ./infrastructure/scripts/teardown-staging.sh"
echo "   ./infrastructure/scripts/deploy-staging.sh"
echo ""
