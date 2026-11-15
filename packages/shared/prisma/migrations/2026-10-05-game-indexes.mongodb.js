/**
 * Migration MongoDB — les index des collections du Jeu Meeshy (#9374, #9375,
 * #9376), sans `prisma db push` (#9035).
 *
 * Collections NEUVES : `GloryLedger` (registre en ajout seul), `DailyMission`
 * et `GameDay`. Les champs ajoutés à `User` (levelRecord, prestige,
 * flameFreezes, lastRelightDay, brokenStreakDays, brokenStreakLastDay,
 * guideSeen) n'exigent AUCUN index ni backfill : ils sont optionnels et un
 * champ absent se lit comme la valeur neutre.
 *
 * Même forme et mêmes règles que `2026-10-01-schema-indexes.mongodb.js` :
 * un index se reconnaît à sa CLÉ ; rien ne se passe s'il existe ; un unique
 * bloqué par des doublons est SIGNALÉ, jamais forcé. Idempotente — la rejouer
 * ne change rien. Aucune donnée n'est lue ni modifiée hors des index.
 *
 * Exécution (DRY_RUN=1 pour simuler) :
 *   docker exec -i meeshy-database mongosh meeshy --quiet < 2026-10-05-game-indexes.mongodb.js
 *   docker exec -i -e DRY_RUN=1 meeshy-database mongosh meeshy --quiet < 2026-10-05-game-indexes.mongodb.js
 */

const dryRun = process.env.DRY_RUN === '1';

const specs = [
  { collection: 'GloryLedger', name: 'GloryLedger_userId_requestId_key', key: { userId: 1, requestId: 1 }, unique: true },
  { collection: 'GloryLedger', name: 'GloryLedger_userId_createdAt_idx', key: { userId: 1, createdAt: 1 } },
  { collection: 'DailyMission', name: 'DailyMission_userId_dayKey_slot_key', key: { userId: 1, dayKey: 1, slot: 1 }, unique: true },
  { collection: 'DailyMission', name: 'DailyMission_userId_dayKey_idx', key: { userId: 1, dayKey: 1 } },
  { collection: 'GameDay', name: 'GameDay_userId_dayKey_key', key: { userId: 1, dayKey: 1 }, unique: true },
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

print(dryRun ? '===== SIMULATION — rien n’est écrit =====' : '===== Index du Jeu Meeshy =====');
print(`Créés (${report.created.length}) :`);
report.created.forEach((line) => print(`  + ${line}`));
print(`Déjà présents (${report.present.length})`);
print(`Bloqués par des doublons (${report.blocked.length}) :`);
report.blocked.forEach((line) => print(`  ! ${line}`));
if (report.blocked.length > 0) quit(2);
