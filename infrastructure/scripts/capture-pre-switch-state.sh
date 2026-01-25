#!/bin/bash
# =============================================================================
# MEESHY - Script de Capture État Pré-Switch
# =============================================================================
# Description: Capture l'état complet de production avant le switch vers Prisma
# Usage: ./infrastructure/scripts/capture-pre-switch-state.sh
# =============================================================================

set -euo pipefail

REMOTE_HOST="root@meeshy.me"
PROD_DIR="/opt/meeshy/production"
BACKUP_DIR="/opt/meeshy/backups"
SNAPSHOT_DIR="/opt/meeshy/pre-switch-snapshots"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
SNAPSHOT_NAME="pre-switch-$TIMESTAMP"

echo "📸 Capture de l'état PRÉ-SWITCH production..."
echo ""

# =============================================================================
# ÉTAPE 1: CRÉER LES RÉPERTOIRES
# =============================================================================

echo "📁 Création des répertoires..."

ssh $REMOTE_HOST "mkdir -p $SNAPSHOT_DIR/$SNAPSHOT_NAME/{docker,mongodb,config,logs}"

echo "✅ Répertoires créés"
echo ""

# =============================================================================
# ÉTAPE 2: CAPTURE DOCKER STATE
# =============================================================================

echo "🐋 Capture de l'état Docker..."

# Images SHA
ssh $REMOTE_HOST "docker inspect meeshy-gateway -f '{{.Image}}'" > /tmp/gateway-sha.txt
ssh $REMOTE_HOST "docker inspect meeshy-web -f '{{.Image}}'" > /tmp/web-sha.txt
ssh $REMOTE_HOST "docker inspect meeshy-translator -f '{{.Image}}'" > /tmp/translator-sha.txt

scp /tmp/gateway-sha.txt $REMOTE_HOST:$SNAPSHOT_DIR/$SNAPSHOT_NAME/docker/
scp /tmp/web-sha.txt $REMOTE_HOST:$SNAPSHOT_DIR/$SNAPSHOT_NAME/docker/
scp /tmp/translator-sha.txt $REMOTE_HOST:$SNAPSHOT_DIR/$SNAPSHOT_NAME/docker/

# État des services
ssh $REMOTE_HOST "docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'" \
  > /tmp/docker-ps.txt

scp /tmp/docker-ps.txt $REMOTE_HOST:$SNAPSHOT_DIR/$SNAPSHOT_NAME/docker/

# docker-compose.yml actuel
ssh $REMOTE_HOST "cp /opt/meeshy/docker-compose.yml \
  $SNAPSHOT_DIR/$SNAPSHOT_NAME/docker/docker-compose.yml.backup"

# .env actuel (sans secrets sensibles)
ssh $REMOTE_HOST "grep -v 'PASSWORD\|SECRET\|TOKEN' /opt/meeshy/.env \
  > $SNAPSHOT_DIR/$SNAPSHOT_NAME/docker/.env.backup || true"

echo "✅ État Docker capturé"
echo ""

# =============================================================================
# ÉTAPE 3: BACKUP MONGODB COMPLET
# =============================================================================

echo "💾 Backup MongoDB complet..."

# Créer backup complet
ssh $REMOTE_HOST "docker exec meeshy-database mongodump \
  --db=meeshy \
  --out=/dump/$SNAPSHOT_NAME \
  --quiet"

# Copier hors du container
ssh $REMOTE_HOST "docker cp meeshy-database:/dump/$SNAPSHOT_NAME \
  $SNAPSHOT_DIR/$SNAPSHOT_NAME/mongodb/"

# Créer archive tar.gz pour compression
ssh $REMOTE_HOST "cd $SNAPSHOT_DIR/$SNAPSHOT_NAME/mongodb && \
  tar -czf mongodb-backup.tar.gz $SNAPSHOT_NAME && \
  rm -rf $SNAPSHOT_NAME"

echo "✅ MongoDB backup créé et compressé"
echo ""

# =============================================================================
# ÉTAPE 4: CAPTURE STRUCTURE ET COUNTS
# =============================================================================

echo "📊 Capture des statistiques MongoDB..."

# Counts de toutes les collections
ssh $REMOTE_HOST "docker exec meeshy-database mongosh meeshy --quiet --eval '
  const collections = db.getCollectionNames();
  const stats = {};
  collections.forEach(col => {
    stats[col] = db[col].countDocuments();
  });
  print(JSON.stringify(stats, null, 2));
'" > /tmp/mongodb-counts.json

scp /tmp/mongodb-counts.json $REMOTE_HOST:$SNAPSHOT_DIR/$SNAPSHOT_NAME/mongodb/

# Indexes de toutes les collections
ssh $REMOTE_HOST "docker exec meeshy-database mongosh meeshy --quiet --eval '
  const collections = db.getCollectionNames();
  const indexes = {};
  collections.forEach(col => {
    indexes[col] = db[col].getIndexes();
  });
  print(JSON.stringify(indexes, null, 2));
'" > /tmp/mongodb-indexes.json

scp /tmp/mongodb-indexes.json $REMOTE_HOST:$SNAPSHOT_DIR/$SNAPSHOT_NAME/mongodb/

echo "✅ Statistiques capturées"
echo ""

# =============================================================================
# ÉTAPE 5: CAPTURE LOGS RÉCENTS
# =============================================================================

echo "📜 Capture des logs récents..."

# Gateway logs (dernières 1000 lignes)
ssh $REMOTE_HOST "docker logs meeshy-gateway --tail 1000 \
  > $SNAPSHOT_DIR/$SNAPSHOT_NAME/logs/gateway.log 2>&1"

# Database logs
ssh $REMOTE_HOST "docker logs meeshy-database --tail 1000 \
  > $SNAPSHOT_DIR/$SNAPSHOT_NAME/logs/database.log 2>&1"

# Translator logs
ssh $REMOTE_HOST "docker logs meeshy-translator --tail 1000 \
  > $SNAPSHOT_DIR/$SNAPSHOT_NAME/logs/translator.log 2>&1"

echo "✅ Logs capturés"
echo ""

# =============================================================================
# ÉTAPE 6: CAPTURE CONFIGURATION
# =============================================================================

echo "⚙️  Capture des configurations..."

# Traefik config
ssh $REMOTE_HOST "cp -r /opt/meeshy/config \
  $SNAPSHOT_DIR/$SNAPSHOT_NAME/ 2>/dev/null || true"

# Nginx config
ssh $REMOTE_HOST "cp -r /opt/meeshy/docker/nginx \
  $SNAPSHOT_DIR/$SNAPSHOT_NAME/config/ 2>/dev/null || true"

echo "✅ Configurations capturées"
echo ""

# =============================================================================
# ÉTAPE 7: CRÉER MANIFEST
# =============================================================================

echo "📋 Création du manifest..."

ssh $REMOTE_HOST "cat > $SNAPSHOT_DIR/$SNAPSHOT_NAME/MANIFEST.md << 'EOF'
# Pre-Switch Snapshot Manifest

**Date:** $TIMESTAMP
**Snapshot:** $SNAPSHOT_NAME

## État Capturé

### Docker
- \`docker/gateway-sha.txt\` - SHA de l'image gateway
- \`docker/web-sha.txt\` - SHA de l'image web
- \`docker/translator-sha.txt\` - SHA de l'image translator
- \`docker/docker-ps.txt\` - État des containers
- \`docker/docker-compose.yml.backup\` - docker-compose actuel

### MongoDB
- \`mongodb/mongodb-backup.tar.gz\` - Backup complet de la base
- \`mongodb/mongodb-counts.json\` - Counts de toutes les collections
- \`mongodb/mongodb-indexes.json\` - Index de toutes les collections

### Logs
- \`logs/gateway.log\` - Dernières 1000 lignes
- \`logs/database.log\` - Dernières 1000 lignes
- \`logs/translator.log\` - Dernières 1000 lignes

### Configuration
- \`config/\` - Configurations Traefik, Nginx, etc.

## Rollback Procedure

Si le switch échoue, restaurer cet état:

\`\`\`bash
# 1. Arrêter les nouveaux services
cd /opt/meeshy/production && docker compose down

# 2. Restaurer le docker-compose
cp $SNAPSHOT_DIR/$SNAPSHOT_NAME/docker/docker-compose.yml.backup \\
   /opt/meeshy/production/docker-compose.yml

# 3. Restaurer MongoDB
cd $SNAPSHOT_DIR/$SNAPSHOT_NAME/mongodb
tar -xzf mongodb-backup.tar.gz
docker cp $SNAPSHOT_NAME meeshy-database:/dump/
docker exec meeshy-database mongorestore \\
  --db=meeshy --drop /dump/$SNAPSHOT_NAME/meeshy

# 4. Redémarrer avec anciennes images
cd /opt/meeshy/production
docker compose up -d
\`\`\`

## Validation

Après restauration, vérifier:
- [ ] Tous les services sont healthy
- [ ] Gateway répond (/health)
- [ ] Frontend accessible
- [ ] Counts MongoDB correspondent au manifest

EOF
"

echo "✅ Manifest créé"
echo ""

# =============================================================================
# ÉTAPE 8: CRÉER ARCHIVE COMPLÈTE
# =============================================================================

echo "📦 Création de l'archive complète..."

ssh $REMOTE_HOST "cd $SNAPSHOT_DIR && \
  tar -czf $SNAPSHOT_NAME.tar.gz $SNAPSHOT_NAME && \
  cp $SNAPSHOT_NAME.tar.gz $BACKUP_DIR/"

ARCHIVE_SIZE=$(ssh $REMOTE_HOST "du -h $BACKUP_DIR/$SNAPSHOT_NAME.tar.gz | cut -f1")

echo "✅ Archive créée: $BACKUP_DIR/$SNAPSHOT_NAME.tar.gz ($ARCHIVE_SIZE)"
echo ""

# =============================================================================
# RÉSUMÉ
# =============================================================================

echo "=" | tr -d '\n' | head -c 80; echo
echo "✅ SNAPSHOT PRÉ-SWITCH CAPTURÉ!"
echo "=" | tr -d '\n' | head -c 80; echo
echo ""
echo "📊 Résumé:"
echo "   - Snapshot: $SNAPSHOT_NAME"
echo "   - Location: $SNAPSHOT_DIR/$SNAPSHOT_NAME/"
echo "   - Archive: $BACKUP_DIR/$SNAPSHOT_NAME.tar.gz ($ARCHIVE_SIZE)"
echo ""
echo "📁 Contenu:"
echo "   - État Docker (images, containers, compose)"
echo "   - Backup MongoDB complet"
echo "   - Statistiques et indexes"
echo "   - Logs récents"
echo "   - Configurations"
echo ""
echo "🔙 Rollback:"
echo "   Voir: $SNAPSHOT_DIR/$SNAPSHOT_NAME/MANIFEST.md"
echo ""
echo "✅ Prêt pour le switch production!"
echo "   ./infrastructure/scripts/switch-to-production.sh"
echo ""

# Sauvegarder le nom du snapshot pour référence
echo "$SNAPSHOT_NAME" > /tmp/last-snapshot-name.txt
