#!/bin/bash
# =============================================================================
# Migration STAGING → PRODUCTION avec transformation de schéma
# =============================================================================
# Ce script migre les données de staging (ancien schéma) vers production
# (nouveau schéma v1.0.0) en appliquant toutes les transformations nécessaires
# =============================================================================

set -euo pipefail

# Couleurs pour output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

REMOTE_HOST="${REMOTE_HOST:-root@meeshy.me}"
STAGING_DB="meeshy"
PROD_DB="meeshy"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/opt/meeshy/backups/migration-$TIMESTAMP"

# Tables à ignorer (snake_case legacy)
IGNORE_COLLECTIONS=(
  "call_participants"
  "call_sessions"
  "old_message_status"
  "MessageAttachment_backup_urls"
  "user_conversation_categories"
  "user_conversation_preferences"
)

echo -e "${BLUE}=============================================================================${NC}"
echo -e "${BLUE}  MIGRATION STAGING → PRODUCTION (v1.0.0)${NC}"
echo -e "${BLUE}=============================================================================${NC}"
echo ""
echo -e "${YELLOW}⚠️  ATTENTION: Cette migration va:${NC}"
echo "  1. Créer un backup complet de production"
echo "  2. Copier les données de staging vers production"
echo "  3. Transformer MessageTranslation → Message.translations (JSON)"
echo "  4. Ignorer les tables snake_case legacy"
echo "  5. Valider l'intégrité des données"
echo ""

# Mode dry-run
DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo -e "${YELLOW}🧪 MODE DRY-RUN: Aucune donnée ne sera modifiée${NC}"
  echo ""
fi

read -p "Continuer avec la migration? (oui/non): " confirm
if [[ "$confirm" != "oui" ]]; then
  echo "Migration annulée."
  exit 0
fi

# =============================================================================
# ÉTAPE 1: BACKUP PRODUCTION
# =============================================================================

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  ÉTAPE 1/7: Backup de la production${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [[ "$DRY_RUN" == "false" ]]; then
  echo "💾 Création du backup production..."
  ssh "$REMOTE_HOST" "mkdir -p $BACKUP_DIR"
  ssh "$REMOTE_HOST" "docker exec meeshy-database mongodump \
    --db=$PROD_DB \
    --out=$BACKUP_DIR \
    --quiet"

  # Compression
  ssh "$REMOTE_HOST" "cd /opt/meeshy/backups && tar -czf migration-$TIMESTAMP.tar.gz migration-$TIMESTAMP"

  BACKUP_SIZE=$(ssh "$REMOTE_HOST" "du -h /opt/meeshy/backups/migration-$TIMESTAMP.tar.gz | cut -f1")
  echo -e "${GREEN}✅ Backup créé: migration-$TIMESTAMP.tar.gz ($BACKUP_SIZE)${NC}"
else
  echo -e "${YELLOW}[DRY-RUN] Backup serait créé: $BACKUP_DIR${NC}"
fi

# =============================================================================
# ÉTAPE 2: ANALYSE DES COLLECTIONS
# =============================================================================

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  ÉTAPE 2/7: Analyse des collections à migrer${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo "🔍 Analyse des collections staging..."

# Récupérer toutes les collections de staging
STAGING_COLLECTIONS=$(ssh "$REMOTE_HOST" "docker exec meeshy-database-staging mongosh $STAGING_DB --quiet --eval 'db.getCollectionNames().join(\",\")'")

# Filtrer les collections à migrer (ignorer snake_case)
COLLECTIONS_TO_MIGRATE=()
for collection in ${STAGING_COLLECTIONS//,/ }; do
  # Ignorer si dans la liste d'exclusion
  skip=false
  for ignore in "${IGNORE_COLLECTIONS[@]}"; do
    if [[ "$collection" == "$ignore" ]]; then
      skip=true
      echo -e "${YELLOW}  ⏭️  Ignoré: $collection (legacy snake_case)${NC}"
      break
    fi
  done

  # Ignorer si snake_case
  if [[ "$collection" =~ ^[a-z_]+$ ]]; then
    echo -e "${YELLOW}  ⏭️  Ignoré: $collection (format snake_case)${NC}"
    skip=true
  fi

  if [[ "$skip" == "false" ]]; then
    COLLECTIONS_TO_MIGRATE+=("$collection")
    COUNT=$(ssh "$REMOTE_HOST" "docker exec meeshy-database-staging mongosh $STAGING_DB --quiet --eval 'db.$collection.countDocuments()'")
    echo -e "${GREEN}  ✅ À migrer: $collection ($COUNT documents)${NC}"
  fi
done

echo ""
echo -e "${GREEN}📊 Total: ${#COLLECTIONS_TO_MIGRATE[@]} collections à migrer${NC}"

# =============================================================================
# ÉTAPE 3: COPIE DES COLLECTIONS STANDARDS
# =============================================================================

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  ÉTAPE 3/7: Copie des collections standards${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [[ "$DRY_RUN" == "false" ]]; then
  for collection in "${COLLECTIONS_TO_MIGRATE[@]}"; do
    # Skip MessageTranslation (traitement spécial)
    if [[ "$collection" == "MessageTranslation" ]]; then
      continue
    fi

    echo "📦 Migration de $collection..."

    # Dump de staging
    ssh "$REMOTE_HOST" "docker exec meeshy-database-staging mongodump \
      --db=$STAGING_DB \
      --collection=$collection \
      --out=/tmp/staging-dump \
      --quiet"

    # Restore vers production (avec --drop pour écraser)
    ssh "$REMOTE_HOST" "docker exec meeshy-database mongorestore \
      --db=$PROD_DB \
      --collection=$collection \
      --drop \
      /tmp/staging-dump/$STAGING_DB/$collection.bson \
      --quiet"

    COUNT=$(ssh "$REMOTE_HOST" "docker exec meeshy-database mongosh $PROD_DB --quiet --eval 'db.$collection.countDocuments()'")
    echo -e "${GREEN}  ✅ $collection migré: $COUNT documents${NC}"
  done

  # Nettoyage
  ssh "$REMOTE_HOST" "rm -rf /tmp/staging-dump"
else
  echo -e "${YELLOW}[DRY-RUN] ${#COLLECTIONS_TO_MIGRATE[@]} collections seraient copiées${NC}"
fi

# =============================================================================
# ÉTAPE 4: TRANSFORMATION MessageTranslation → Message.translations
# =============================================================================

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  ÉTAPE 4/7: Transformation MessageTranslation → Message.translations${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

TRANSLATION_COUNT=$(ssh "$REMOTE_HOST" "docker exec meeshy-database-staging mongosh $STAGING_DB --quiet --eval 'db.MessageTranslation.countDocuments()'")
echo "🔄 Migration de $TRANSLATION_COUNT traductions..."

if [[ "$DRY_RUN" == "false" ]]; then
  # Exécuter le script de transformation
  ssh "$REMOTE_HOST" "docker exec meeshy-database mongosh $STAGING_DB" << 'EOF'
// Script de transformation MessageTranslation → Message.translations (JSON)
print("🔄 Début de la transformation...");

const translations = db.MessageTranslation.find({});
let processed = 0;
let errors = 0;

translations.forEach(translation => {
  try {
    const messageId = translation.messageId;
    const targetLanguage = translation.targetLanguage || translation.language;

    // Construire l'objet de traduction
    const translationData = {
      text: translation.translatedText || translation.content,
      translationModel: translation.translationModel || "basic",
      confidenceScore: translation.confidenceScore,
      createdAt: translation.createdAt || new Date(),
      updatedAt: translation.updatedAt || new Date()
    };

    // Si champs de chiffrement présents
    if (translation.isEncrypted) {
      translationData.isEncrypted = true;
      translationData.encryptionKeyId = translation.encryptionKeyId;
      translationData.encryptionIv = translation.encryptionIv;
      translationData.encryptionAuthTag = translation.encryptionAuthTag;
    }

    // Mettre à jour le message avec $set pour ajouter la traduction
    const updateKey = `translations.${targetLanguage}`;
    const result = db.Message.updateOne(
      { _id: messageId },
      { $set: { [updateKey]: translationData } }
    );

    if (result.modifiedCount > 0) {
      processed++;
    } else {
      print(`⚠️  Message non trouvé: ${messageId}`);
    }

    if (processed % 100 === 0) {
      print(`  Progression: ${processed} traductions migrées...`);
    }
  } catch (error) {
    errors++;
    print(`❌ Erreur: ${error.message}`);
  }
});

print(`\n✅ Transformation terminée:`);
print(`  - Traductions migrées: ${processed}`);
print(`  - Erreurs: ${errors}`);
EOF

  echo -e "${GREEN}✅ Transformation MessageTranslation terminée${NC}"
else
  echo -e "${YELLOW}[DRY-RUN] $TRANSLATION_COUNT traductions seraient transformées${NC}"
fi

# =============================================================================
# ÉTAPE 5: CRÉATION DES INDEX DE PERFORMANCE
# =============================================================================

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  ÉTAPE 5/7: Création des index de performance${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [[ "$DRY_RUN" == "false" ]]; then
  echo "⚡ Création des index MongoDB optimisés..."

  # Vérifier si le script d'index existe
  if [[ -f "infrastructure/scripts/mongodb-add-conversation-indexes.js" ]]; then
    # Copier vers le serveur
    scp infrastructure/scripts/mongodb-add-conversation-indexes.js "$REMOTE_HOST:/tmp/add-indexes.js"

    # Exécuter le script
    ssh "$REMOTE_HOST" "docker exec -i meeshy-database mongosh $PROD_DB < /tmp/add-indexes.js"

    echo -e "${GREEN}✅ Index de performance créés${NC}"
  else
    echo -e "${YELLOW}⚠️  Script d'index non trouvé, création manuelle...${NC}"

    ssh "$REMOTE_HOST" "docker exec meeshy-database mongosh $PROD_DB" << 'EOF'
// Index critiques pour performance
print("Création des index de performance...");

// ConversationMember
db.ConversationMember.createIndex(
  { userId: 1, isActive: 1, conversationId: 1 },
  { name: "idx_member_user_active_conv" }
);

// Message
db.Message.createIndex(
  { conversationId: 1, isDeleted: 1, createdAt: -1 },
  { name: "idx_message_conv_notdeleted_created" }
);

// Conversation
db.Conversation.createIndex(
  { isActive: 1, lastMessageAt: -1 },
  { name: "idx_conversation_active_lastmsg" }
);

print("✅ Index créés avec succès");
EOF

    echo -e "${GREEN}✅ Index de base créés${NC}"
  fi
else
  echo -e "${YELLOW}[DRY-RUN] Index seraient créés${NC}"
fi

# =============================================================================
# ÉTAPE 6: VALIDATION DES DONNÉES
# =============================================================================

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  ÉTAPE 6/7: Validation des données migrées${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo "🔍 Vérification de l'intégrité des données..."

# Comparer les counts
VALIDATION_FAILED=false

echo ""
echo "📊 Comparaison des counts STAGING vs PRODUCTION:"
echo "================================================"

for collection in "${COLLECTIONS_TO_MIGRATE[@]}"; do
  if [[ "$collection" == "MessageTranslation" ]]; then
    continue
  fi

  STAGING_COUNT=$(ssh "$REMOTE_HOST" "docker exec meeshy-database-staging mongosh $STAGING_DB --quiet --eval 'db.$collection.countDocuments()'")
  PROD_COUNT=$(ssh "$REMOTE_HOST" "docker exec meeshy-database mongosh $PROD_DB --quiet --eval 'db.$collection.countDocuments()'")

  if [[ "$STAGING_COUNT" == "$PROD_COUNT" ]]; then
    echo -e "${GREEN}  ✅ $collection: $PROD_COUNT documents (OK)${NC}"
  else
    echo -e "${RED}  ❌ $collection: Staging=$STAGING_COUNT, Prod=$PROD_COUNT (MISMATCH!)${NC}"
    VALIDATION_FAILED=true
  fi
done

# Vérifier les traductions JSON
echo ""
echo "🔍 Vérification des traductions JSON..."
MESSAGES_WITH_TRANSLATIONS=$(ssh "$REMOTE_HOST" "docker exec meeshy-database mongosh $PROD_DB --quiet --eval 'db.Message.countDocuments({ translations: { \$exists: true, \$ne: null } })'")
echo -e "${GREEN}  ✅ Messages avec traductions JSON: $MESSAGES_WITH_TRANSLATIONS${NC}"

if [[ "$VALIDATION_FAILED" == "true" ]]; then
  echo ""
  echo -e "${RED}❌ VALIDATION ÉCHOUÉE: Des différences ont été détectées!${NC}"
  echo -e "${YELLOW}⚠️  Vérifiez les logs ci-dessus avant de continuer${NC}"
  exit 1
fi

# =============================================================================
# ÉTAPE 7: NETTOYAGE (OPTIONNEL)
# =============================================================================

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  ÉTAPE 7/7: Nettoyage (optionnel)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo ""
read -p "Supprimer les collections legacy de production? (oui/non): " cleanup
if [[ "$cleanup" == "oui" ]]; then
  if [[ "$DRY_RUN" == "false" ]]; then
    echo "🗑️  Suppression des collections legacy..."

    for ignore in "${IGNORE_COLLECTIONS[@]}"; do
      ssh "$REMOTE_HOST" "docker exec meeshy-database mongosh $PROD_DB --quiet --eval 'db.$ignore.drop()'" 2>/dev/null || true
      echo -e "${GREEN}  ✅ Supprimé: $ignore${NC}"
    done

    # Supprimer MessageTranslation (maintenant dans Message.translations)
    ssh "$REMOTE_HOST" "docker exec meeshy-database mongosh $PROD_DB --quiet --eval 'db.MessageTranslation.drop()'"
    echo -e "${GREEN}  ✅ Supprimé: MessageTranslation${NC}"
  else
    echo -e "${YELLOW}[DRY-RUN] Collections legacy seraient supprimées${NC}"
  fi
else
  echo "Collections legacy conservées pour référence."
fi

# =============================================================================
# RÉSUMÉ FINAL
# =============================================================================

echo ""
echo -e "${GREEN}=============================================================================${NC}"
echo -e "${GREEN}  ✅ MIGRATION TERMINÉE AVEC SUCCÈS!${NC}"
echo -e "${GREEN}=============================================================================${NC}"
echo ""
echo "📦 Backup disponible: /opt/meeshy/backups/migration-$TIMESTAMP.tar.gz"
echo ""
echo "🔄 Prochaines étapes:"
echo "  1. Redémarrer les services production pour appliquer les changements"
echo "  2. Tester l'application en production"
echo "  3. Monitorer les logs pendant 24h"
echo ""
echo "🔙 Rollback si nécessaire:"
echo "  ./infrastructure/scripts/rollback-migration.sh $TIMESTAMP"
echo ""
