/**
 * Migration MongoDB — les index de `UserRelation` (le lien entre deux personnes) et d'`AtomLink` (réservé), #13926,
 * sans `prisma db push` (#9035).
 *
 * Collections NEUVES : aucune donnée existante n'est lue ni modifiée ici. Le REMPLISSAGE des liens depuis les demandes
 * d'amitié acceptées est un autre geste, `services/gateway/scripts/2026-10-31-backfill-user-relations.ts`, à jouer
 * APRÈS ces index (l'unique de paire est ce qui refuse un second exemplaire quand deux écrivains se croisent).
 *
 * Trois index :
 * - UserRelation (userLowId, userHighId) UNIQUE — une ligne par paire non orientée ; sert aussi le côté « low » (préfixe) ;
 * - UserRelation (userHighId)             — le côté « high » ;
 * - AtomLink (atomId, electronId) UNIQUE  — un lien parent/tuteur ne se déclare qu'une fois (aucune route au MVP).
 *
 * Même forme et mêmes règles que `2026-10-07-mythic-seat-indexes.mongodb.js` : un index se reconnaît à sa CLÉ ; rien ne
 * se passe s'il existe ; un unique bloqué par des doublons est SIGNALÉ, jamais forcé. Idempotente — la rejouer ne change
 * rien.
 *
 * Un index NON unique de même clé déjà posé est CONVERTI EN PLACE (#13977), jamais supprimé puis recréé : le verrou
 * `prepareUnique` (MongoDB 6.0+) refuse d'abord tout NOUVEAU doublon, les doublons existants sont comptés ensuite, puis
 * `collMod … unique` convertit. Un doublon présent ou glissé laisse l'index où il était, verrouillé, et se signale :
 * la collection ne reste jamais sans index de paire pendant que la passerelle écrit.
 *
 * À JOUER SUR LE STAGING D'ABORD ; en production, avec le feu vert du porteur (#9223), sauvegarde vérifiée d'abord.
 *
 * Exécution (DRY_RUN=1 pour simuler), puis relecture :
 *   docker exec -i -e DRY_RUN=1 meeshy-database mongosh meeshy --quiet < 2026-10-31-user-relation-indexes.mongodb.js
 *   docker exec -i meeshy-database mongosh meeshy --quiet < 2026-10-31-user-relation-indexes.mongodb.js
 *   docker exec -i meeshy-database mongosh meeshy --quiet --eval 'printjson(db.UserRelation.getIndexes())'
 */

const dryRun = process.env.DRY_RUN === '1';

const specs = [
  { collection: 'UserRelation', name: 'UserRelation_userLowId_userHighId_key', key: { userLowId: 1, userHighId: 1 }, unique: true },
  { collection: 'UserRelation', name: 'UserRelation_userHighId_idx', key: { userHighId: 1 }, unique: false },
  { collection: 'AtomLink', name: 'AtomLink_atomId_electronId_key', key: { atomId: 1, electronId: 1 }, unique: true },
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

const commandError = (command) => {
  try {
    const result = db.runCommand(command);
    return result && result.ok === 1 ? null : (result && result.errmsg) || 'commande refusée';
  } catch (error) {
    return error.message;
  }
};

const convertInPlace = (spec, match) => {
  const label = `${spec.collection}.${match.name}`;
  if (!dryRun) {
    const lockError = commandError({ collMod: spec.collection, index: { keyPattern: spec.key, prepareUnique: true } });
    if (lockError) return report.blocked.push(`${label} — verrou prepareUnique refusé : ${lockError}`);
  }
  const groups = duplicateGroups(spec.collection, spec.key);
  if (groups > 0) return report.blocked.push(`${label} — ${groups} groupe(s) en doublon`);
  if (!dryRun) {
    const convertError = commandError({ collMod: spec.collection, index: { keyPattern: spec.key, unique: true } });
    if (convertError) return report.blocked.push(`${label} — conversion en unique refusée : ${convertError}`);
  }
  return report.created.push(`${label} (converti en unique, en place)`);
};

for (const spec of specs) {
  const existing = collections.includes(spec.collection)
    ? db.getCollection(spec.collection).getIndexes()
    : [];
  const match = existing.find((index) => sameKey(index.key, spec.key));

  if (match && (match.unique || !spec.unique)) {
    report.present.push(`${spec.collection}.${match.name}`);
    continue;
  }

  if (match) {
    convertInPlace(spec, match);
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

  if (!dryRun) db.getCollection(spec.collection).createIndex(spec.key, options);
  report.created.push(`${spec.collection}.${spec.name}`);
}

print(dryRun ? '===== SIMULATION — rien n’est écrit =====' : '===== Index de UserRelation et AtomLink =====');
print(`Créés (${report.created.length}) :`);
report.created.forEach((line) => print(`  + ${line}`));
print(`Déjà présents (${report.present.length})`);
print(`Bloqués par des doublons (${report.blocked.length}) :`);
report.blocked.forEach((line) => print(`  ! ${line}`));
if (report.blocked.length > 0) quit(2);
