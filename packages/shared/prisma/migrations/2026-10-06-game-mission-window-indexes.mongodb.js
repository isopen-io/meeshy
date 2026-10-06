/**
 * Migration MongoDB — l'index du balayage des missions PERSONNELLES du jour (#9539), sans `prisma db push` (#9035).
 *
 * `DailyMission` gagne trois champs OPTIONNELS (`startsAt`, `endsAt`, `notifiedAt`) : un champ absent se lit
 * `null`, aucun backfill, aucune donnée lue ni modifiée. Le seul besoin est un index sur `startsAt`, pour que
 * le job qui annonce « ta mission du jour commence » retrouve les plages qui viennent de s'ouvrir sans balayer
 * la collection.
 *
 * Même forme et mêmes règles que `2026-10-05-game-indexes.mongodb.js` : un index se reconnaît à sa CLÉ ; rien
 * ne se passe s'il existe ; idempotente. À JOUER SUR LE STAGING D'ABORD ; en production, avec le feu vert du
 * porteur (#9223).
 *
 * Exécution (DRY_RUN=1 pour simuler) :
 *   docker exec -i meeshy-database mongosh meeshy --quiet < 2026-10-06-game-mission-window-indexes.mongodb.js
 *   docker exec -i -e DRY_RUN=1 meeshy-database mongosh meeshy --quiet < 2026-10-06-game-mission-window-indexes.mongodb.js
 */

const dryRun = process.env.DRY_RUN === '1';

const specs = [{ collection: 'DailyMission', name: 'DailyMission_startsAt_idx', key: { startsAt: 1 } }];

const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const report = { created: [], present: [] };
const collections = db.getCollectionNames();

for (const spec of specs) {
  const existing = collections.includes(spec.collection) ? db.getCollection(spec.collection).getIndexes() : [];
  const match = existing.find((index) => sameKey(index.key, spec.key));
  if (match) {
    report.present.push(`${spec.collection}.${match.name}`);
    continue;
  }
  if (!dryRun) db.getCollection(spec.collection).createIndex(spec.key, { name: spec.name });
  report.created.push(`${spec.collection}.${spec.name}`);
}

print(dryRun ? '===== SIMULATION — rien n’est écrit =====' : '===== Index des missions personnelles =====');
print(`Créés (${report.created.length}) :`);
report.created.forEach((line) => print(`  + ${line}`));
print(`Déjà présents (${report.present.length})`);
