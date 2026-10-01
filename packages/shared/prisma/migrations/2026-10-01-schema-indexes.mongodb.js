/**
 * Migration MongoDB — pose les index du schéma qui manquent en production et
 * en staging (#9035), sans `prisma db push`.
 *
 * Relevé du 2026-10-01 (`getIndexes()` comparé à `schema.prisma` de dev) :
 * 13 index manquent en production, 22 en staging — dont celui de la remontée
 * en tête (#9026, `Conversation(isActive, lastActivityAt)`).
 *
 * Pourquoi pas `prisma db push` :
 * - le connecteur MongoDB émet un unique NON partiel : `User.referralCode`,
 *   absent chez tous les utilisateurs, ferait échouer la création (E11000) —
 *   même défaut que `clientMessageId` (voir le schéma, model Message) ;
 * - `db push` aligne la base sur le schéma : il retirerait l'unique partiel
 *   `messages_conversationId_clientMessageId_unique` et les index posés à la
 *   main (`Post_geoPoint_2dsphere`, `Notification_userId_*`, …).
 *
 * Règles :
 * - un index se reconnaît à sa CLÉ, jamais à son nom : s'il existe (unique
 *   quand il doit l'être), rien ne se passe ;
 * - aucun index n'est supprimé, sauf un non-unique de même clé qu'un unique
 *   attendu, et seulement quand aucun doublon ne bloque l'unique ;
 * - un unique bloqué par des doublons est SIGNALÉ, jamais forcé : la sortie
 *   donne la collection et le nombre de groupes, le dédoublonnage se décide
 *   donnée par donnée.
 *
 * Exécution (DRY_RUN=1 pour simuler) :
 *   docker exec -i meeshy-database mongosh meeshy --quiet < 2026-10-01-schema-indexes.mongodb.js
 *   docker exec -i -e DRY_RUN=1 meeshy-database mongosh meeshy --quiet < 2026-10-01-schema-indexes.mongodb.js
 */

const dryRun = process.env.DRY_RUN === '1';

const specs = [
  { collection: 'AdminAuditLog', name: 'AdminAuditLog_entity_entityId_idx', key: { entity: 1, entityId: 1 } },
  { collection: 'CallRecording', name: 'CallRecording_callSessionId_idx', key: { callSessionId: 1 } },
  { collection: 'Conversation', name: 'Conversation_isActive_lastActivityAt_idx', key: { isActive: 1, lastActivityAt: 1 } },
  { collection: 'ConversationEngagement', name: 'ConversationEngagement_userId_conversationId_key', key: { userId: 1, conversationId: 1 }, unique: true },
  { collection: 'ConversationEngagement', name: 'ConversationEngagement_userId_updatedAt_idx', key: { userId: 1, updatedAt: 1 } },
  { collection: 'EmailVerificationWatch', name: 'EmailVerificationWatch_expiresAt_idx', key: { expiresAt: 1 } },
  { collection: 'EmailVerificationWatch', name: 'EmailVerificationWatch_tokenHash_key', key: { tokenHash: 1 }, unique: true },
  { collection: 'EmailVerificationWatch', name: 'EmailVerificationWatch_userId_idx', key: { userId: 1 } },
  { collection: 'EngagementQuota', name: 'EngagementQuota_userId_createdAt_idx', key: { userId: 1, createdAt: 1 } },
  { collection: 'EngagementQuota', name: 'EngagementQuota_userId_operationKey_bucket_key', key: { userId: 1, operationKey: 1, bucket: 1 }, unique: true },
  { collection: 'EngagementScaleConfig', name: 'EngagementScaleConfig_key_key', key: { key: 1 }, unique: true },
  { collection: 'EngagementSignatureCredit', name: 'EngagementSignatureCredit_userId_axisKey_idx', key: { userId: 1, axisKey: 1 } },
  { collection: 'EngagementSignatureCredit', name: 'EngagementSignatureCredit_userId_axisKey_signature_key', key: { userId: 1, axisKey: 1, signature: 1 }, unique: true },
  { collection: 'Message', name: 'Message_storyReplyToId_idx', key: { storyReplyToId: 1 } },
  { collection: 'Participant', name: 'Participant_shareLinkId_joinedAt_idx', key: { shareLinkId: 1, joinedAt: 1 } },
  { collection: 'Participant', name: 'unique_conversation_identity', key: { conversationId: 1, userId: 1, sessionTokenHash: 1 }, unique: true },
  { collection: 'StoryBackgroundAudio', name: 'Sound_uploaderId_contentHash_key', key: { uploaderId: 1, contentHash: 1 }, unique: true },
  { collection: 'User', name: 'User_referralCode_key', key: { referralCode: 1 }, unique: true, partialFilterExpression: { referralCode: { $type: 'string' } } },
  { collection: 'UserConversationPreferences', name: 'UserConversationPreferences_userId_conversationId_key', key: { userId: 1, conversationId: 1 }, unique: true },
  { collection: 'UserSticker', name: 'UserSticker_userId_contentHash_key', key: { userId: 1, contentHash: 1 }, unique: true },
  { collection: 'UserSticker', name: 'UserSticker_userId_lastUsedAt_idx', key: { userId: 1, lastUsedAt: 1 } },
  { collection: 'UserVoiceModel', name: 'UserVoiceModel_profileId_key', key: { profileId: 1 }, unique: true },
];

const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const duplicateGroups = (collection, key) => {
  const id = Object.fromEntries(Object.keys(key).map((field) => [field, `$${field}`]));
  const [row] = db.getCollection(collection).aggregate([
    { $group: { _id: id, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $count: 'groups' },
  ]).toArray();
  return row ? row.groups : 0;
};

const report = { created: [], present: [], blocked: [] };
const collections = db.getCollectionNames();

for (const spec of specs) {
  const existing = collections.includes(spec.collection)
    ? db.getCollection(spec.collection).getIndexes()
    : [];
  const match = existing.find((index) => sameKey(index.key, spec.key));

  if (match && (match.unique || !spec.unique)) {
    report.present.push(`${spec.collection}.${match.name}`);
    continue;
  }

  if (spec.unique && !spec.partialFilterExpression && collections.includes(spec.collection)) {
    const groups = duplicateGroups(spec.collection, spec.key);
    if (groups > 0) {
      report.blocked.push(`${spec.collection}.${spec.name} — ${groups} groupe(s) en doublon`);
      continue;
    }
  }

  const options = { name: spec.name };
  if (spec.unique) options.unique = true;
  if (spec.partialFilterExpression) options.partialFilterExpression = spec.partialFilterExpression;

  if (!dryRun) {
    if (match) db.getCollection(spec.collection).dropIndex(match.name);
    db.getCollection(spec.collection).createIndex(spec.key, options);
  }
  report.created.push(`${spec.collection}.${spec.name}${match ? ` (remplace ${match.name}, non unique)` : ''}`);
}

print(dryRun ? '===== SIMULATION — rien n’est écrit =====' : '===== Index du schéma =====');
print(`Créés (${report.created.length}) :`);
report.created.forEach((line) => print(`  + ${line}`));
print(`Déjà présents (${report.present.length})`);
print(`Bloqués par des doublons (${report.blocked.length}) :`);
report.blocked.forEach((line) => print(`  ! ${line}`));
if (report.blocked.length > 0) quit(2);
