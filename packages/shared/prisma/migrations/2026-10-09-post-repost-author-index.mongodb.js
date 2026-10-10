/**
 * Migration MongoDB — l'index des republications par auteur (#9727), sans
 * `prisma db push` (#9035).
 *
 * La liste des vues enrichie (`services/gateway/src/services/posts/viewerEngagement.ts`)
 * compte, pour chaque personne d'une page, ses republications d'UN contenu
 * (`repostOfId` + `authorId in [...]`). `Post` n'avait aucun index sur
 * `repostOfId` : sans celui-ci, chaque page balaie la collection. Un index non
 * unique, sur une collection existante : aucune donnée n'est lue ni modifiée.
 *
 * Même forme et mêmes règles que `2026-10-08-session-retention-indexes.mongodb.js` :
 * un index se reconnaît à sa CLÉ (ordre compris) ; rien ne se passe s'il existe.
 * Idempotente.
 *
 * Exécution (DRY_RUN=1 pour simuler), staging d'abord :
 *   docker exec -i -e DRY_RUN=1 meeshy-database-staging mongosh meeshy --quiet < 2026-10-09-post-repost-author-index.mongodb.js
 *   docker exec -i meeshy-database-staging mongosh meeshy --quiet < 2026-10-09-post-repost-author-index.mongodb.js
 * Vérifier ensuite : db.Post.getIndexes() porte { repostOfId: 1, authorId: 1 }.
 */

const dryRun = process.env.DRY_RUN === '1';

const specs = [
  { collection: 'Post', name: 'Post_repostOfId_authorId_idx', key: { repostOfId: 1, authorId: 1 } },
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

print(dryRun ? '===== SIMULATION — rien n’est écrit =====' : '===== Index des republications par auteur =====');
print(`Créés (${report.created.length}) :`);
report.created.forEach((line) => print(`  + ${line}`));
print(`Déjà présents (${report.present.length})`);
report.present.forEach((line) => print(`  = ${line}`));
