/**
 * Migration MongoDB — pose les index de `EngagementActStreak` (#10389), la
 * série de chaque acte, sans `prisma db push` (même raisons et même méthode
 * que `2026-10-01-schema-indexes.mongodb.js`, #9035).
 *
 * Additive et idempotente : un index se reconnaît à sa CLÉ ; présent, rien ne
 * se passe ; un unique bloqué par des doublons est SIGNALÉ, jamais forcé.
 * La collection n'existe pas encore avant le premier crédit : l'index la crée.
 *
 * Exécution (DRY_RUN=1 pour simuler) :
 *   docker exec -i meeshy-database mongosh meeshy --quiet < 2026-10-12-engagement-act-streak-indexes.mongodb.js
 *   docker exec -i -e DRY_RUN=1 meeshy-database mongosh meeshy --quiet < 2026-10-12-engagement-act-streak-indexes.mongodb.js
 */

const dryRun = process.env.DRY_RUN === '1';

const specs = [
  { collection: 'EngagementActStreak', name: 'EngagementActStreak_userId_act_key', key: { userId: 1, act: 1 }, unique: true },
  { collection: 'EngagementActStreak', name: 'EngagementActStreak_userId_idx', key: { userId: 1 } },
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
