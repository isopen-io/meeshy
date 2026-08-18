// Remplace l'index unique `Participant_conversationId_userId_key` par la clé
// d'IDENTITÉ `(conversationId, userId, sessionTokenHash)`.
//
// Pourquoi : MongoDB indexe un champ ABSENT comme la valeur `null`. Avec une
// clé unique `(conversationId, userId)`, tous les participants anonymes d'une
// même conversation — qui n'ont jamais de `userId` — se percutaient sur la
// clé `(C, null)`. Conséquence : UN SEUL anonyme par conversation, et chaque
// join suivant tombait en duplicate key servi en 500 opaque par
// `POST /anonymous/join/:linkId`.
//
// La nouvelle clé conserve la garantie « un inscrit une seule fois par
// conversation » — un inscrit s'indexe en `(C, userId, null)` — et sépare les
// anonymes par leur `sessionTokenHash`, écrit à la création et jamais effacé.
//
// Source de vérité : `model Participant` dans packages/shared/prisma/schema.prisma
//
// Usage :
//   docker exec meeshy-database mongosh meeshy --file /tmp/fix-participant-identity-index.mongodb.js
//
// Idempotent : relançable sans effet si l'index cible existe déjà.

const OLD_INDEX = 'Participant_conversationId_userId_key';
const NEW_INDEX = 'Participant_conversationId_userId_sessionTokenHash_key';
const NEW_KEY = { conversationId: 1, userId: 1, sessionTokenHash: 1 };

const existing = db.Participant.getIndexes().map((i) => i.name);
print('Index présents : ' + existing.join(', ') + '\n');

// 1. Refuser d'agir si les données violent déjà la clé cible — un index unique
//    créé sur des doublons échoue à mi-chemin et laisse la collection sans
//    aucune garantie. On regarde AVANT.
const collisions = db.Participant.aggregate([
  {
    $group: {
      _id: {
        conversationId: '$conversationId',
        userId: '$userId',
        sessionTokenHash: '$sessionTokenHash',
      },
      n: { $sum: 1 },
      ids: { $push: '$_id' },
    },
  },
  { $match: { n: { $gt: 1 } } },
]).toArray();

if (collisions.length > 0) {
  print('❌ ' + collisions.length + ' groupe(s) violeraient déjà la clé cible :');
  collisions.forEach((c) => printjson(c));
  print('\nAucune modification appliquée. Résoudre les doublons d’abord.');
  quit(1);
}
print('✅ Aucune collision sur (conversationId, userId, sessionTokenHash)\n');

// 2. Créer la nouvelle clé AVANT de retirer l'ancienne : à aucun instant la
//    collection ne reste sans garantie d'unicité pour les inscrits.
if (existing.indexOf(NEW_INDEX) === -1) {
  db.Participant.createIndex(NEW_KEY, { unique: true, name: NEW_INDEX });
  print('✅ Index créé : ' + NEW_INDEX);
} else {
  print('↷ Index déjà présent : ' + NEW_INDEX);
}

// 3. Retirer le plafond.
if (existing.indexOf(OLD_INDEX) !== -1) {
  db.Participant.dropIndex(OLD_INDEX);
  print('✅ Index retiré : ' + OLD_INDEX);
} else {
  print('↷ Index déjà absent : ' + OLD_INDEX);
}

// 4. Index déclaré au schéma mais jamais poussé en production — les listings de
//    participants actifs le filtrent (`conversationId` + `isActive`) à chaque
//    ouverture de conversation.
const ACTIVE_INDEX = 'Participant_conversationId_isActive_idx';
if (db.Participant.getIndexes().map((i) => i.name).indexOf(ACTIVE_INDEX) === -1) {
  db.Participant.createIndex({ conversationId: 1, isActive: 1 }, { name: ACTIVE_INDEX });
  print('✅ Index créé : ' + ACTIVE_INDEX);
} else {
  print('↷ Index déjà présent : ' + ACTIVE_INDEX);
}

print('\nÉtat final :');
db.Participant.getIndexes().forEach((i) => {
  print('  ' + i.name + ' ' + JSON.stringify(i.key) + (i.unique ? ' [unique]' : ''));
});
