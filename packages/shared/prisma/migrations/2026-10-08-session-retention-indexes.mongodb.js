/**
 * Migration MongoDB — l'index de la conservation des sessions (#9614), sans
 * `prisma db push` (#9035).
 *
 * La passe quotidienne de conservation (`services/gateway/src/jobs/retention-sweep.ts`)
 * efface les sessions closes 90 jours après `invalidatedAt` : sans cet index,
 * chaque passe balaie la collection. Un index non unique, sur une collection
 * existante : aucune donnée n'est lue ni modifiée, rien ne peut le bloquer.
 *
 * Même forme et mêmes règles que `2026-10-07-mythic-seat-indexes.mongodb.js` :
 * un index se reconnaît à sa CLÉ ; rien ne se passe s'il existe. Idempotente.
 *
 * Exécution (DRY_RUN=1 pour simuler), staging d'abord :
 *   docker exec -i -e DRY_RUN=1 meeshy-database-staging mongosh meeshy --quiet < 2026-10-08-session-retention-indexes.mongodb.js
 *   docker exec -i meeshy-database-staging mongosh meeshy --quiet < 2026-10-08-session-retention-indexes.mongodb.js
 */

const dryRun = process.env.DRY_RUN === '1';

const specs = [
  { collection: 'UserSession', name: 'UserSession_invalidatedAt_idx', key: { invalidatedAt: 1 } },
];

const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const report = { created: [], present: [] };
const collections = db.getCollectionNames();

for (const spec of specs) {
  const existing = collections.includes(spec.collection)
    ? db.getCollection(spec.collection).getIndexes()
    : [];
  const match = existing.find((index) => sameKey(index.key, spec.key));
  if (match) {
    report.present.push(`${spec.collection}.${match.name}`);
    continue;
  }
  if (!dryRun) db.getCollection(spec.collection).createIndex(spec.key, { name: spec.name });
  report.created.push(`${spec.collection}.${spec.name}`);
}

print(dryRun ? '===== SIMULATION — rien n’est écrit =====' : '===== Index de conservation des sessions =====');
print(`Créés (${report.created.length}) :`);
report.created.forEach((line) => print(`  + ${line}`));
print(`Déjà présents (${report.present.length})`);
