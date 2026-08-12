/**
 * Migration MongoDB — resserre l'index unique de `Reaction` de
 * `(messageId, participantId, emoji)` à `(messageId, participantId)`.
 *
 * Audit realtime sync 2026-07-04 (cycle continuous-improvement, candidat #1) :
 * `ReactionService.addReaction` applique le modèle "1 emoji par user par
 * message" au niveau applicatif (find existing → deleteMany → create), pas au
 * niveau DB — l'ancien index unique autorisait plusieurs emojis pour le même
 * (messageId, participantId). Deux appels `addReaction` concurrents avec des
 * emojis DIFFÉRENTS (double-tap sur deux boutons, retry optimistic-UI avant
 * ack, même compte sur deux appareils) passent tous les deux la vérification
 * "aucune réaction existante" avant que l'un des deux n'aie committé, et
 * insèrent chacun leur propre ligne — l'ancien index ne les met pas en
 * conflit puisque l'emoji diffère. Résultat : le participant se retrouve avec
 * deux réactions simultanées sur le même message, sans `reaction:removed`
 * compensatoire, chez tous les pairs.
 *
 * Fix : le nouvel index unique ne porte plus que sur (messageId,
 * participantId) — Mongo garantit alors qu'au plus une ligne existe par
 * participant et par message, quel que soit l'emoji. Le code applicatif
 * (`ReactionService.addReaction`) passe d'un find/delete/create à un
 * `upsert` unique sur cette clé composite : les deux appels concurrents
 * ciblent désormais le MÊME document, et Mongo sérialise les deux
 * `findOneAndUpdate` au lieu de laisser chacun insérer le sien.
 *
 * ⚠️ PRÉ-REQUIS DÉDUP : la création du nouvel index échoue (E11000) si un
 * (messageId, participantId) a plusieurs lignes existantes (résidu du bug
 * ci-dessus). Ce script déduplique d'abord — garde la réaction la PLUS
 * RÉCENTE (createdAt le plus grand) par paire, supprime les autres, puis
 * recalcule `reactionSummary`/`reactionCount` (compteur autoritaire, miroir
 * de `ReactionService.updateMessageReactionSummary`) pour chaque message
 * touché avant de remplacer l'index.
 *
 * Idempotent : si l'index du même nom existe déjà avec la spec corrigée,
 * no-op. S'il existe avec une spec différente (l'ancien à 3 champs), il est
 * droppé et recréé.
 *
 * Exécution :
 *   mongosh "$DATABASE_URL" < 2026-07-04-reaction-single-per-user-unique-index.mongodb.js
 */

use('meeshy');

print('===== Fix — Reaction unique index (messageId, participantId), sans emoji =====');
print('');

const indexName = 'participant_reaction_unique';
const correctedKey = { messageId: 1, participantId: 1 };

print('🔍 Recherche de doublons (messageId, participantId) à dédupliquer...');
const duplicateGroups = db.Reaction.aggregate([
  {
    $group: {
      _id: { messageId: '$messageId', participantId: '$participantId' },
      count: { $sum: 1 },
      docs: { $push: { id: '$_id', emoji: '$emoji', createdAt: '$createdAt' } }
    }
  },
  { $match: { count: { $gt: 1 } } }
]).toArray();

print(`   ${duplicateGroups.length} paire(s) (message, participant) en doublon.`);

const touchedMessageIds = new Set();

duplicateGroups.forEach(group => {
  const sorted = group.docs.slice().sort((a, b) => b.createdAt - a.createdAt);
  const [keep, ...drop] = sorted;
  print(`   messageId=${group._id.messageId} participantId=${group._id.participantId}: garde emoji=${keep.emoji}, supprime ${drop.length} ligne(s) (${drop.map(d => d.emoji).join(', ')})`);
  db.Reaction.deleteMany({ _id: { $in: drop.map(d => d.id) } });
  touchedMessageIds.add(String(group._id.messageId));
});

print(`   ✅ Dédup terminée — ${touchedMessageIds.size} message(s) à recalculer.`);
print('');

if (touchedMessageIds.size > 0) {
  print('🔧 Recalcul reactionSummary/reactionCount (compteur autoritaire) pour les messages touchés...');
  touchedMessageIds.forEach(messageIdStr => {
    const messageId = ObjectId(messageIdStr);
    const remaining = db.Reaction.find({ messageId }).toArray();
    const summary = {};
    remaining.forEach(r => { summary[r.emoji] = (summary[r.emoji] || 0) + 1; });
    db.Message.updateOne(
      { _id: messageId },
      { $set: { reactionSummary: summary, reactionCount: remaining.length } }
    );
  });
  print('   ✅ Recalcul terminé.');
  print('');
}

const existing = db.Reaction.getIndexes().find(idx => idx.name === indexName);
if (existing) {
  const sameKey = JSON.stringify(existing.key) === JSON.stringify(correctedKey);
  if (sameKey) {
    print(`   ℹ️  L'index "${indexName}" existe déjà avec la spec corrigée — no-op.`);
  } else {
    print(`   ⚠️  L'index "${indexName}" existe avec une spec différente — drop + recréation.`);
    print(`      Ancienne spec : ${JSON.stringify(existing.key)}`);
    db.Reaction.dropIndex(indexName);
    const result = db.Reaction.createIndex(correctedKey, { unique: true, name: indexName });
    print(`   ✅ Index recréé : ${result}`);
  }
} else {
  const result = db.Reaction.createIndex(correctedKey, { unique: true, name: indexName });
  print(`   ✅ Index créé : ${result}`);
}
print('');

const finalIndex = db.Reaction.getIndexes().find(idx => idx.name === indexName);
if (finalIndex) {
  print(`   ✅ Index "${indexName}" présent`);
  print(`      Keys   : ${JSON.stringify(finalIndex.key)}`);
  print(`      Unique : ${finalIndex.unique}`);
} else {
  print(`   ❌ ERREUR : index "${indexName}" non trouvé après création.`);
  quit(1);
}
print('');
print('✅ Migration terminée.');
