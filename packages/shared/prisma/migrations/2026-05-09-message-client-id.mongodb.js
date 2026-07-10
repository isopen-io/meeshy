/**
 * Migration MongoDB — Phase 4 §6.2 (offline-queue clientMessageId dedup)
 *
 * Crée un index unique partiel sur (conversationId, clientMessageId) pour le
 * pattern catch-P2002 dedup côté gateway (offline queue + retry réseau).
 *
 * L'index est PARTIEL : il ignore les documents où `clientMessageId` est
 * absent, null, ou égal à la chaîne vide. Cela garantit la rétro-compatibilité
 * avec les messages historiques pré-Phase-4 (qui n'ont pas le champ).
 *
 * Idempotent : `createIndex` ne fait rien si l'index existe déjà avec la
 * même spec. Si la spec diffère, MongoDB renvoie une erreur — il faut alors
 * dropper l'index existant manuellement.
 *
 * Exécution :
 *   mongosh "$DATABASE_URL" < 2026-05-09-message-client-id.mongodb.js
 *
 * VALIDATION PRÉ-MIGRATION (obligatoire) :
 *   Avant exécution, vérifier qu'aucun document existant n'a
 *   `clientMessageId = ""` (chaîne vide), ce qui violerait l'index unique
 *   partiel sur les conversations multi-messages :
 *
 *     db.messages.countDocuments({ clientMessageId: "" })
 *
 *   Doit retourner 0. Si > 0, nettoyer ces documents (passer à null) avant
 *   de lancer cette migration.
 *
 * Référence : docs/superpowers/specs/2026-05-08-ios-conversation-list-cache-offline-design.md §6.2
 */

// Utiliser la base de données appropriée
use('meeshy');  // Remplacer par le nom de votre base si différent

print('===== Phase 4 §6.2 — clientMessageId unique partial index =====');
print('');

// ===== ÉTAPE 1 : VALIDATION PRÉ-MIGRATION =====
print('🔍 Validation pré-migration...');
const emptyStringCount = db.messages.countDocuments({ clientMessageId: '' });
if (emptyStringCount > 0) {
  print(`❌ ERREUR : ${emptyStringCount} document(s) avec clientMessageId = "".`);
  print('   Nettoyer ces documents (passer à null) avant de lancer la migration.');
  print('   Commande de nettoyage :');
  print('     db.messages.updateMany({ clientMessageId: "" }, { $unset: { clientMessageId: "" } });');
  quit(1);
}
print(`   ✅ Aucun document avec clientMessageId = "" (validation OK)`);
print('');

// ===== ÉTAPE 2 : ÉTAT ACTUEL =====
const totalMessages = db.messages.countDocuments({});
const withClientId = db.messages.countDocuments({
  clientMessageId: { $exists: true, $type: 'string', $ne: '' }
});
print(`📊 État actuel :`);
print(`   Messages totaux           : ${totalMessages}`);
print(`   Messages avec clientId    : ${withClientId}`);
print(`   Messages sans clientId    : ${totalMessages - withClientId} (historiques pré-Phase-4)`);
print('');

// ===== ÉTAPE 3 : CRÉATION DE L'INDEX UNIQUE PARTIEL =====
print('🔧 Création de l\'index unique partiel...');

const indexName = 'messages_conversationId_clientMessageId_unique';

// Vérifier si l'index existe déjà
const existing = db.messages.getIndexes().find(idx => idx.name === indexName);
if (existing) {
  print(`   ℹ️  L'index "${indexName}" existe déjà.`);
  print(`      Spec actuelle : ${JSON.stringify(existing)}`);
  print('   ✅ Migration idempotente — aucune action nécessaire.');
} else {
  const result = db.messages.createIndex(
    { conversationId: 1, clientMessageId: 1 },
    {
      unique: true,
      name: indexName,
      partialFilterExpression: {
        clientMessageId: { $exists: true, $type: 'string', $ne: '' }
      }
    }
  );
  print(`   ✅ Index créé : ${result}`);
}
print('');

// ===== ÉTAPE 4 : VÉRIFICATION POST-MIGRATION =====
print('🔍 Vérification post-migration...');
const finalIndex = db.messages.getIndexes().find(idx => idx.name === indexName);
if (finalIndex) {
  print(`   ✅ Index "${indexName}" présent`);
  print(`      Keys                   : ${JSON.stringify(finalIndex.key)}`);
  print(`      Unique                 : ${finalIndex.unique}`);
  print(`      Partial filter         : ${JSON.stringify(finalIndex.partialFilterExpression)}`);
} else {
  print(`   ❌ ERREUR : index "${indexName}" non trouvé après création.`);
  quit(1);
}
print('');

print('✅ Migration Phase 4 §6.2 terminée avec succès.');
print('');
print('Prochaines étapes :');
print('  1. Côté gateway : MessagingService capture P2002 sur cet index pour');
print('     retourner le message existant (dedup transparent côté client).');
print('  2. Côté client iOS : OfflineQueue génère un UUID v4 par message');
print('     avant push, conservé sur retry réseau.');
print('');
