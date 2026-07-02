/**
 * Migration MongoDB — corrige l'index unique partiel de
 * `2026-05-09-message-client-id.mongodb.js`.
 *
 * Audit gateway prod 2026-07-02 (C6, docs/analyses/2026-07-02-audit-gateway-appels-prod.md) :
 * `partialFilterExpression: { clientMessageId: { $exists: true, $type: 'string', $ne: '' } }`
 * utilise `$ne`, qui n'est PAS supporté par MongoDB dans un
 * `partialFilterExpression` (opérateurs supportés : égalité, `$exists: true`,
 * `$gt`/`$gte`/`$lt`/`$lte`, `$type`, et `$and` au niveau racine — voir
 * https://www.mongodb.com/docs/manual/core/index-partial/#supported-operators).
 * `createIndex` lève donc une erreur et l'index n'a JAMAIS existé en prod
 * (vérifié via `db.messages.getIndexes()`). Conséquence directe : la dédup
 * offline-queue des messages ET des résumés d'appel (`call-summary:{callId}`,
 * cf. `CallService.createCallSummaryMessage`) repose sur un catch Prisma
 * P2002 qui ne se déclenche jamais sans contrainte unique réelle — deux
 * chemins terminaux concurrents (ex. double `call:ended`) insèrent chacun
 * leur propre document au lieu que le second échoue proprement.
 *
 * Fix : `$gt: ''` à la place de `$ne: ''` — équivalent pour une chaîne
 * (`$gt ''` exclut exactement la chaîne vide, rien de moins), et supporté
 * par les index partiels.
 *
 * Idempotent : si un index du même nom existe déjà (avec la bonne spec
 * corrigée, ex. ré-exécution de cette migration), no-op. S'il existe avec une
 * spec DIFFÉRENTE (ex. résidu d'une tentative manuelle), il est droppé et
 * recréé.
 *
 * Exécution :
 *   mongosh "$DATABASE_URL" < 2026-07-02-fix-message-client-id-partial-index.mongodb.js
 */

use('meeshy');

print('===== Fix C6 — clientMessageId unique partial index (opérateur $ne non supporté) =====');
print('');

const indexName = 'messages_conversationId_clientMessageId_unique';
const correctedFilter = { clientMessageId: { $exists: true, $type: 'string', $gt: '' } };

print('🔍 Validation pré-migration (aucun document ne doit avoir clientMessageId = "")...');
const emptyStringCount = db.messages.countDocuments({ clientMessageId: '' });
if (emptyStringCount > 0) {
  print(`❌ ERREUR : ${emptyStringCount} document(s) avec clientMessageId = "".`);
  print('   db.messages.updateMany({ clientMessageId: "" }, { $unset: { clientMessageId: "" } });');
  quit(1);
}
print('   ✅ OK');
print('');

const existing = db.messages.getIndexes().find(idx => idx.name === indexName);
if (existing) {
  const sameFilter = JSON.stringify(existing.partialFilterExpression) === JSON.stringify(correctedFilter);
  if (sameFilter) {
    print(`   ℹ️  L'index "${indexName}" existe déjà avec la spec corrigée — no-op.`);
  } else {
    print(`   ⚠️  L'index "${indexName}" existe avec une spec différente — drop + recréation.`);
    print(`      Ancienne spec : ${JSON.stringify(existing.partialFilterExpression)}`);
    db.messages.dropIndex(indexName);
    const result = db.messages.createIndex(
      { conversationId: 1, clientMessageId: 1 },
      { unique: true, name: indexName, partialFilterExpression: correctedFilter }
    );
    print(`   ✅ Index recréé : ${result}`);
  }
} else {
  const result = db.messages.createIndex(
    { conversationId: 1, clientMessageId: 1 },
    { unique: true, name: indexName, partialFilterExpression: correctedFilter }
  );
  print(`   ✅ Index créé : ${result}`);
}
print('');

const finalIndex = db.messages.getIndexes().find(idx => idx.name === indexName);
if (finalIndex) {
  print(`   ✅ Index "${indexName}" présent`);
  print(`      Keys           : ${JSON.stringify(finalIndex.key)}`);
  print(`      Unique         : ${finalIndex.unique}`);
  print(`      Partial filter : ${JSON.stringify(finalIndex.partialFilterExpression)}`);
} else {
  print(`   ❌ ERREUR : index "${indexName}" non trouvé après création.`);
  quit(1);
}
print('');
print('✅ Fix C6 terminé.');
