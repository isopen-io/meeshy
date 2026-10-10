/**
 * Migration MongoDB — les index de `SharedTranslation` (la traduction qu'un membre
 * partage aux autres, scellée), #9899, sans `prisma db push` (#9035).
 *
 * Collection NEUVE : aucune donnée existante n'est lue ni modifiée, aucun backfill.
 * MongoDB la crée à la pose du premier index, ou à la première écriture si le
 * script n'a pas encore été joué.
 *
 * Deux index :
 * - SharedTranslation (messageId, targetLanguage, sourceVersion) UNIQUE — l'arbitre
 *   du « premier partage gagne » : la route (`routes/conversations/shared-translations.ts`)
 *   crée d'abord et ne relit que sur la violation d'unicité. Sans lui la création ne
 *   lève jamais : deux partages simultanés d'une même traduction seraient rangés
 *   tous deux et diffusés tous deux (le `GET`, lui, n'en sert qu'un — le premier).
 * - SharedTranslation (conversationId, messageId) — la lecture : les traductions
 *   d'une conversation pour les messages demandés, sans balayer la collection.
 *
 * L'ordre avec le déploiement : à jouer AVANT que la passerelle qui sert la route
 * ne reçoive du trafic, ou aussitôt après. Le créneau est sans conséquence tant
 * qu'aucun membre n'a partagé deux fois la même clé ; s'il a eu lieu, l'unique est
 * « bloqué » (voir plus bas) et le script le dit.
 *
 * Même forme et mêmes règles que `2026-10-07-mythic-seat-indexes.mongodb.js` : un
 * index se reconnaît à sa CLÉ (ordre compris) ; rien ne se passe s'il existe ; un
 * unique bloqué par des doublons est SIGNALÉ, jamais forcé. Idempotente — la rejouer
 * ne change rien. Un « bloqué » ne peut venir que de deux partages simultanés rangés
 * avant la pose de l'unique : examiner avec le porteur avant toute écriture (les
 * lignes sont des enveloppes scellées, l'ancienneté seule désigne la gagnante).
 *
 * À JOUER SUR LE STAGING D'ABORD ; en production, avec le feu vert du porteur (#9223),
 * sauvegarde vérifiée d'abord.
 *
 * Exécution (DRY_RUN=1 pour simuler), puis relecture :
 *   docker exec -i -e DRY_RUN=1 meeshy-database-staging mongosh meeshy --quiet < 2026-10-10-shared-translation-indexes.mongodb.js
 *   docker exec -i meeshy-database-staging mongosh meeshy --quiet < 2026-10-10-shared-translation-indexes.mongodb.js
 *   docker exec -i meeshy-database-staging mongosh meeshy --quiet --eval 'printjson(db.SharedTranslation.getIndexes())'
 * En production, le même avec `meeshy-database` à la place de `meeshy-database-staging`.
 */

const dryRun = process.env.DRY_RUN === '1';

const specs = [
  {
    collection: 'SharedTranslation',
    name: 'SharedTranslation_messageId_targetLanguage_sourceVersion_key',
    key: { messageId: 1, targetLanguage: 1, sourceVersion: 1 },
    unique: true,
  },
  { collection: 'SharedTranslation', name: 'SharedTranslation_conversationId_messageId_idx', key: { conversationId: 1, messageId: 1 } },
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

  if (spec.unique && collections.includes(spec.collection)) {
    const groups = duplicateGroups(spec.collection, spec.key);
    if (groups > 0) {
      report.blocked.push(`${spec.collection}.${spec.name} — ${groups} groupe(s) en doublon`);
      continue;
    }
  }

  const options = { name: spec.name };
  if (spec.unique) options.unique = true;

  if (!dryRun) {
    if (match) db.getCollection(spec.collection).dropIndex(match.name);
    db.getCollection(spec.collection).createIndex(spec.key, options);
  }
  report.created.push(`${spec.collection}.${spec.name}${match ? ` (remplace ${match.name}, non unique)` : ''}`);
}

print(dryRun ? '===== SIMULATION — rien n’est écrit =====' : '===== Index de SharedTranslation =====');
print(`Créés (${report.created.length}) :`);
report.created.forEach((line) => print(`  + ${line}`));
print(`Déjà présents (${report.present.length})`);
report.present.forEach((line) => print(`  = ${line}`));
print(`Bloqués par des doublons (${report.blocked.length}) :`);
report.blocked.forEach((line) => print(`  ! ${line}`));
if (report.blocked.length > 0) quit(2);
