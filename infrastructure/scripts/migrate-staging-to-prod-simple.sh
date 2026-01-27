#!/bin/bash
# Migration simplifiée STAGING → PRODUCTION
set -euo pipefail

REMOTE_HOST="root@meeshy.me"
STAGING_DB="meeshy"
PROD_DB="meeshy"

echo "=== MIGRATION STAGING → PRODUCTION ==="
echo ""

# Collections à migrer (les plus importantes d'abord)
COLLECTIONS=(
  "User"
  "Conversation"
  "ConversationMember"
  "Message"
  "MessageStatus"
  "MessageReadStatus"
  "MessageAttachment"
  "MessageTranslation"
  "Reaction"
  "Notification"
  "FriendRequest"
  "Community"
  "CommunityMember"
  "AdminAuditLog"
  "AffiliateToken"
  "AffiliateRelation"
  "TrackingLink"
  "TrackingLinkClick"
  "Mention"
  "UserStats"
  "UserPreference"
  "UserConversationCategory"
  "UserConversationPreferences"
  "ConversationPreference"
  "ConversationReadCursor"
  "ConversationShareLink"
  "AnonymousParticipant"
  "TypingIndicator"
)

echo "Étape 1: Copie des collections"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
for collection in "${COLLECTIONS[@]}"; do
  echo -n "  Copie $collection... "

  ssh "$REMOTE_HOST" "docker exec meeshy-database-staging mongodump \
    --db=$STAGING_DB \
    --collection=$collection \
    --archive 2>/dev/null \
    | docker exec -i meeshy-database mongorestore \
      --db=$PROD_DB \
      --collection=$collection \
      --drop \
      --archive 2>&1" > /tmp/migrate-$collection.log

  COUNT=$(ssh "$REMOTE_HOST" "docker exec meeshy-database mongosh $PROD_DB --quiet --eval 'db.$collection.countDocuments()'")
  echo "✅ $COUNT documents"
done

echo ""
echo "Étape 2: Transformation MessageTranslation → Message.translations"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ssh "$REMOTE_HOST" "docker exec meeshy-database mongosh $PROD_DB --quiet" << 'EOJS'
const translations = db.MessageTranslation.find({});
let processed = 0;

translations.forEach(translation => {
  try {
    const messageId = translation.messageId;
    const targetLanguage = translation.targetLanguage || translation.language;

    const translationData = {
      text: translation.translatedText || translation.content,
      translationModel: translation.translationModel || "basic",
      confidenceScore: translation.confidenceScore,
      createdAt: translation.createdAt || new Date(),
      updatedAt: translation.updatedAt || new Date()
    };

    if (translation.isEncrypted) {
      translationData.isEncrypted = true;
      translationData.encryptionKeyId = translation.encryptionKeyId;
      translationData.encryptionIv = translation.encryptionIv;
      translationData.encryptionAuthTag = translation.encryptionAuthTag;
    }

    const updateKey = `translations.${targetLanguage}`;
    const result = db.Message.updateOne(
      { _id: messageId },
      { $set: { [updateKey]: translationData } }
    );

    if (result.modifiedCount > 0) {
      processed++;
    }
  } catch (error) {
    // Continue
  }
});

print('✅ Transformation terminée: ' + processed + ' traductions migrées');
EOJS

echo ""
echo "Étape 3: Nettoyage MessageTranslation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ssh "$REMOTE_HOST" "docker exec meeshy-database mongosh $PROD_DB --quiet --eval 'db.MessageTranslation.drop()'"
echo "✅ Collection MessageTranslation supprimée"

echo ""
echo "Étape 4: Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Counts finaux:"
for collection in "User" "Conversation" "Message" "Notification"; do
  COUNT=$(ssh "$REMOTE_HOST" "docker exec meeshy-database mongosh $PROD_DB --quiet --eval 'db.$collection.countDocuments()'")
  echo "  $collection: $COUNT"
done

echo ""
echo "✅ MIGRATION TERMINÉE"
