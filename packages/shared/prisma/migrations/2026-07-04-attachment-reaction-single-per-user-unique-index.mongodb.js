/**
 * Migration MongoDB — resserre l'index unique de `AttachmentReaction` de
 * `(attachmentId, participantId, emoji)` à `(attachmentId, participantId)`.
 *
 * Audit realtime sync 2026-07-04 (cycle continuous-improvement, follow-up du
 * candidat #1 — mirrors 2026-07-04-reaction-single-per-user-unique-index.mongodb.js) :
 * `AttachmentReactionService.addAttachmentReaction` appliquait le modèle "1
 * emoji par user par pièce jointe" au niveau applicatif (findMany existants →
 * deleteMany conditionnel → upsert), pas au niveau DB — l'ancien index unique
 * autorisait plusieurs emojis pour le même (attachmentId, participantId). Deux
 * appels `addAttachmentReaction` concurrents avec des emojis DIFFÉRENTS
 * (double-tap sur deux boutons, retry optimistic-UI avant ack, même compte sur
 * deux appareils) passent tous les deux la vérification "aucune réaction
 * existante" avant que l'un des deux n'aie committé, et insèrent chacun leur
 * propre ligne — l'ancien index ne les met pas en conflit puisque l'emoji
 * diffère. Résultat : le participant se retrouve avec deux réactions
 * simultanées sur la même pièce jointe, chez tous les pairs (broadcast
 * `attachment:reaction-added` recalculant un `reactionSummary` qui compte les
 * deux lignes).
 *
 * Fix : le nouvel index unique ne porte plus que sur (attachmentId,
 * participantId) — Mongo garantit alors qu'au plus une ligne existe par
 * participant et par pièce jointe, quel que soit l'emoji. Le code applicatif
 * (`AttachmentReactionService.addAttachmentReaction`) passe d'un
 * find/deleteMany/upsert à un `upsert` unique sur cette clé composite : les
 * deux appels concurrents ciblent désormais le MÊME document, et Mongo
 * sérialise les deux `findOneAndUpdate` au lieu de laisser chacun insérer le
 * sien.
 *
 * ⚠️ PRÉ-REQUIS DÉDUP : la création du nouvel index échoue (E11000) si un
 * (attachmentId, participantId) a plusieurs lignes existantes (résidu du bug
 * ci-dessus). Ce script déduplique d'abord — garde la réaction la PLUS
 * RÉCENTE (createdAt le plus grand) par paire, supprime les autres. Pas de
 * compteur agrégé stocké à recalculer ici : contrairement à `Message`,
 * `AttachmentReaction` n'a pas de colonne `reactionSummary`/`reactionCount` —
 * `AttachmentReactionService.getReactionSummary()` recalcule à la volée par
 * `findMany`, donc la suppression des doublons suffit à corriger l'agrégat au
 * prochain appel.
 *
 * Idempotent : si l'index du même nom existe déjà avec la spec corrigée,
 * no-op. S'il existe avec une spec différente (l'ancien à 3 champs), il est
 * droppé et recréé.
 *
 * Exécution :
 *   mongosh "$DATABASE_URL" < 2026-07-04-attachment-reaction-single-per-user-unique-index.mongodb.js
 */

use('meeshy');

print('===== Fix — AttachmentReaction unique index (attachmentId, participantId), sans emoji =====');
print('');

const indexName = 'attachment_participant_reaction';
const correctedKey = { attachmentId: 1, participantId: 1 };

print('🔍 Recherche de doublons (attachmentId, participantId) à dédupliquer...');
const duplicateGroups = db.AttachmentReaction.aggregate([
  {
    $group: {
      _id: { attachmentId: '$attachmentId', participantId: '$participantId' },
      count: { $sum: 1 },
      docs: { $push: { id: '$_id', emoji: '$emoji', createdAt: '$createdAt' } }
    }
  },
  { $match: { count: { $gt: 1 } } }
]).toArray();

print(`   ${duplicateGroups.length} paire(s) (attachment, participant) en doublon.`);

duplicateGroups.forEach(group => {
  const sorted = group.docs.slice().sort((a, b) => b.createdAt - a.createdAt);
  const [keep, ...drop] = sorted;
  print(`   attachmentId=${group._id.attachmentId} participantId=${group._id.participantId}: garde emoji=${keep.emoji}, supprime ${drop.length} ligne(s) (${drop.map(d => d.emoji).join(', ')})`);
  db.AttachmentReaction.deleteMany({ _id: { $in: drop.map(d => d.id) } });
});

print(`   ✅ Dédup terminée.`);
print('');

const existing = db.AttachmentReaction.getIndexes().find(idx => idx.name === indexName);
if (existing) {
  const sameKey = JSON.stringify(existing.key) === JSON.stringify(correctedKey);
  if (sameKey) {
    print(`   ℹ️  L'index "${indexName}" existe déjà avec la spec corrigée — no-op.`);
  } else {
    print(`   ⚠️  L'index "${indexName}" existe avec une spec différente — drop + recréation.`);
    print(`      Ancienne spec : ${JSON.stringify(existing.key)}`);
    db.AttachmentReaction.dropIndex(indexName);
    const result = db.AttachmentReaction.createIndex(correctedKey, { unique: true, name: indexName });
    print(`   ✅ Index recréé : ${result}`);
  }
} else {
  const result = db.AttachmentReaction.createIndex(correctedKey, { unique: true, name: indexName });
  print(`   ✅ Index créé : ${result}`);
}
print('');

const finalIndex = db.AttachmentReaction.getIndexes().find(idx => idx.name === indexName);
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
