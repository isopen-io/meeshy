/**
 * Migration MongoDB — élargit l'index unique de `Reaction` de
 * (messageId, participantId) à (messageId, participantId, emoji).
 *
 * Multi-réactions (chantier Focal, feu vert user 2026-08-16) : un participant
 * peut désormais empiler PLUSIEURS emojis distincts sur le même message —
 * jamais deux fois le même. `ReactionService.addReaction` devient ADDITIF
 * (upsert atomique par TRIPLET, plus aucun swap ni `replacedEmojis`) ; le
 * toggle vit chez les clients, qui appellent `removeReaction` sur un emoji
 * déjà posé.
 *
 * C'est l'inverse exact du resserrement du 2026-07-04
 * (2026-07-04-reaction-single-per-user-unique-index.mongodb.js). Aucune
 * déduplication préalable n'est nécessaire : ÉLARGIR une contrainte unique ne
 * peut pas mettre en conflit des lignes existantes (toute paire unique est a
 * fortiori un triplet unique).
 *
 * ⚠️ ORDRE DE DÉPLOIEMENT : exécuter CE SCRIPT AVANT (ou avec) le déploiement
 * du gateway multi-réactions — l'ancien index à 2 champs REJETTE (E11000) la
 * seconde ligne d'un même participant, donc le nouveau code échouerait sur
 * chaque second emoji tant que l'index n'est pas élargi. L'entrypoint prod ne
 * joue AUCUNE migration : passage manuel obligatoire.
 *
 * Idempotent : si l'index du même nom existe déjà avec la spec à 3 champs,
 * no-op. S'il existe avec l'ancienne spec à 2 champs, il est droppé et recréé.
 *
 * Exécution :
 *   mongosh "$DATABASE_URL" < 2026-08-18-reaction-multi-per-user-unique-index.mongodb.js
 */

use('meeshy');

print('===== Multi-réactions — Reaction unique index (messageId, participantId, emoji) =====');
print('');

const indexName = 'participant_reaction_unique';
const targetKey = { messageId: 1, participantId: 1, emoji: 1 };

// CAS RÉEL CONSTATÉ EN PROD (2026-08-18) : le resserrement du 2026-07-04 n'y a
// jamais été exécuté — l'index triple HISTORIQUE existe encore sous son nom
// Prisma par défaut (`Reaction_messageId_participantId_emoji_key`). Créer la
// même clé sous un second nom serait refusé par Mongo (IndexOptionsConflict) :
// un index unique portant DÉJÀ la clé triple, quel que soit son nom, est un
// no-op.
const anyTripleUnique = db.Reaction.getIndexes().find(
  ix => JSON.stringify(ix.key) === JSON.stringify(targetKey) && ix.unique
);
const existing = db.Reaction.getIndexes().find(ix => ix.name === indexName);

if (anyTripleUnique) {
  print(`✅ Index unique triplet déjà présent (« ${anyTripleUnique.name} ») — no-op.`);
} else {
  if (existing) {
    print(`🗑  Drop de l'ancien index « ${indexName} » (clé ${JSON.stringify(existing.key)})...`);
    db.Reaction.dropIndex(indexName);
  } else {
    print('ℹ️  Aucun index existant de ce nom — création directe.');
  }
  print(`🔧 Création de l'index unique ${JSON.stringify(targetKey)}...`);
  db.Reaction.createIndex(targetKey, { name: indexName, unique: true });
  print('✅ Index élargi au triplet.');
}

print('');
print('===== Terminé =====');
