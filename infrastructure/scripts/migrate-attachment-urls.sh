#!/bin/bash

# =============================================================================
# MIGRATION DES URLs D'ATTACHMENTS - /api/attachments/ vers /api/v1/attachments/
# =============================================================================
# Ce script migre les URLs des attachments stockées dans MongoDB pour utiliser
# le nouveau format /api/v1/attachments/ au lieu de /api/attachments/
# =============================================================================

set -e

REMOTE_HOST="${REMOTE_HOST:-root@meeshy.me}"
ENVIRONMENT="${ENVIRONMENT:-staging}"
BACKUP_DIR="${BACKUP_DIR:-/opt/meeshy/backups}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "🔄 Migration des URLs d'attachments - Environnement: $ENVIRONMENT"
echo ""

# =============================================================================
# ÉTAPE 1: BACKUP AVANT MIGRATION
# =============================================================================

echo "💾 Création d'un backup de sécurité..."
BACKUP_NAME="attachments-pre-migration-${TIMESTAMP}"

# Le réseau de la base de CET environnement (#11451) : la base de production n'est
# que sur meeshy_meeshy-data, celle du staging que sur meeshy-staging-network.
if [ "$ENVIRONMENT" = "staging" ]; then
  DB_HOST="database-staging"
  DB_NAME="meeshy"
  DB_NETWORK="meeshy-staging-network"
else
  DB_HOST="meeshy-database"
  DB_NAME="meeshy"
  DB_NETWORK="meeshy_meeshy-data"
fi

ssh $REMOTE_HOST "docker run --rm \
  --network=$DB_NETWORK \
  -v $BACKUP_DIR:/backup \
  mongo:8.0 \
  mongodump \
    --host=$DB_HOST \
    --port=27017 \
    --db=$DB_NAME \
    --collection=MessageAttachment \
    --out=/backup/$BACKUP_NAME \
  2>&1 | tail -5"

echo "✅ Backup créé: $BACKUP_NAME"
echo ""

# =============================================================================
# ÉTAPE 2: ANALYSE PRÉ-MIGRATION
# =============================================================================

echo "📊 Analyse des URLs avant migration..."

ssh $REMOTE_HOST "cat > /tmp/analyze-attachments.js << 'EOFJS'
db = db.getSiblingDB('$DB_NAME');

var stats = {
  total: db.MessageAttachment.countDocuments(),
  withApiAttachments: db.MessageAttachment.countDocuments({fileUrl: /^\/api\/attachments\//}),
  withApiV1: db.MessageAttachment.countDocuments({fileUrl: /^\/api\/v1\//}),
  relative: db.MessageAttachment.countDocuments({fileUrl: /^[^\/]/})
};

print('Total attachments: ' + stats.total);
print('  - URLs à migrer (/api/attachments/): ' + stats.withApiAttachments);
print('  - URLs déjà migrées (/api/v1/): ' + stats.withApiV1);
print('  - URLs relatives (OK): ' + stats.relative);
EOFJS

if [ \"$ENVIRONMENT\" = \"staging\" ]; then
  docker exec -i meeshy-database-staging mongosh --quiet < /tmp/analyze-attachments.js
else
  docker exec -i meeshy-database mongosh --quiet < /tmp/analyze-attachments.js
fi"

echo ""

# =============================================================================
# ÉTAPE 3: MIGRATION
# =============================================================================

echo "🔄 Exécution de la migration..."

ssh $REMOTE_HOST "cat > /tmp/migrate-attachments.js << 'EOFJS'
db = db.getSiblingDB('$DB_NAME');

var result = db.MessageAttachment.updateMany(
  {fileUrl: /^\/api\/attachments\//},
  [{
    \$set: {
      fileUrl: {
        \$replaceOne: {
          input: '\$fileUrl',
          find: '/api/attachments/',
          replacement: '/api/v1/attachments/'
        }
      }
    }
  }]
);

print('✅ Migration terminée: ' + result.modifiedCount + ' attachments mis à jour');
EOFJS

if [ \"$ENVIRONMENT\" = \"staging\" ]; then
  docker exec -i meeshy-database-staging mongosh --quiet < /tmp/migrate-attachments.js
else
  docker exec -i meeshy-database mongosh --quiet < /tmp/migrate-attachments.js
fi"

echo ""

# =============================================================================
# ÉTAPE 4: VÉRIFICATION POST-MIGRATION
# =============================================================================

echo "✅ Vérification post-migration..."

ssh $REMOTE_HOST "cat > /tmp/verify-attachments.js << 'EOFJS'
db = db.getSiblingDB('$DB_NAME');

var stats = {
  withApiAttachmentsOld: db.MessageAttachment.countDocuments({fileUrl: /^\/api\/attachments\//}),
  withApiV1: db.MessageAttachment.countDocuments({fileUrl: /^\/api\/v1\//})
};

print('  - URLs ancien format (/api/attachments/): ' + stats.withApiAttachmentsOld);
print('  - URLs nouveau format (/api/v1/): ' + stats.withApiV1);

if (stats.withApiAttachmentsOld > 0) {
  print('');
  print('⚠️  ATTENTION: ' + stats.withApiAttachmentsOld + ' URLs non migrées!');
  printjson(db.MessageAttachment.find({fileUrl: /^\/api\/attachments\//}, {fileUrl: 1}).limit(5).toArray());
} else {
  print('');
  print('✅ Toutes les URLs ont été migrées avec succès!');
}
EOFJS

if [ \"$ENVIRONMENT\" = \"staging\" ]; then
  docker exec -i meeshy-database-staging mongosh --quiet < /tmp/verify-attachments.js
else
  docker exec -i meeshy-database mongosh --quiet < /tmp/verify-attachments.js
fi"

echo ""
echo "✅ Migration terminée!"
echo ""
echo "📁 Backup disponible: $BACKUP_DIR/$BACKUP_NAME"
echo ""
echo "Pour restaurer en cas de problème:"
echo "  ssh $REMOTE_HOST \"docker run --rm \\"
echo "    --network=$DB_NETWORK \\"
echo "    -v $BACKUP_DIR:/backup \\"
echo "    mongo:8.0 \\"
echo "    mongorestore \\"
echo "      --host=$DB_HOST \\"
echo "      --port=27017 \\"
echo "      --db=$DB_NAME \\"
echo "      --drop \\"
echo "      /backup/$BACKUP_NAME/$DB_NAME\""
