/**
 * Migration MongoDB — les index de `PairInteractionDay` (l'agrégat des interactions d'une paire, par jour UTC),
 * #13932, sans `prisma db push` (#9035).
 *
 * Collection NEUVE : aucune donnée existante n'est lue ni modifiée. Elle se remplit à mesure que les messages,
 * réactions, vues de posts, commentaires, partages, réponses de story, mentions, appels et vocaux passent ; aucun
 * rattrapage historique (voir l'issue de suivi du lot).
 *
 * Trois index :
 * - (userLowId, userHighId, day) UNIQUE — une ligne par paire non orientée et par jour ; l'écrivain compte par
 *   `$inc` et reprend en incrément quand deux écrivains créent la même ligne (P2002) ;
 * - (day)                        — le rattrapage lit les jours de la semaine glissante ;
 * - (expiresAt) TTL, expireAfterSeconds 0 — la ligne meurt à `expiresAt` (120 jours : douze semaines entières plus
 *   la marge des semaines partielles). Posé ici, jamais par `db push`, comme `socialEventIndexes.ts`.
 *
 * Même forme et mêmes règles que `2026-10-31-user-relation-indexes.mongodb.js` : un index se reconnaît à sa CLÉ ;
 * rien ne se passe s'il existe ; un unique bloqué par des doublons est SIGNALÉ, jamais forcé. Idempotente.
 *
 * À JOUER SUR LE STAGING D'ABORD ; en production, avec le feu vert du porteur (#9223), sauvegarde vérifiée d'abord.
 *
 * Exécution (DRY_RUN=1 pour simuler), puis relecture :
 *   docker exec -i -e DRY_RUN=1 meeshy-database mongosh meeshy --quiet < 2026-10-31-pair-interaction-day-indexes.mongodb.js
 *   docker exec -i meeshy-database mongosh meeshy --quiet < 2026-10-31-pair-interaction-day-indexes.mongodb.js
 *   docker exec -i meeshy-database mongosh meeshy --quiet --eval 'printjson(db.PairInteractionDay.getIndexes())'
 */

const dryRun = process.env.DRY_RUN === '1';
const COLLECTION = 'PairInteractionDay';

const specs = [
  { name: 'PairInteractionDay_userLowId_userHighId_day_key', key: { userLowId: 1, userHighId: 1, day: 1 }, unique: true },
  { name: 'PairInteractionDay_day_idx', key: { day: 1 }, unique: false },
  { name: 'PairInteractionDay_expiresAt_ttl', key: { expiresAt: 1 }, unique: false, expireAfterSeconds: 0 },
];

const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const duplicateGroups = (key) => {
  const id = Object.fromEntries(Object.keys(key).map((field) => [field, `$${field}`]));
  const [row] = db.getCollection(COLLECTION).aggregate([
    { $group: { _id: id, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $count: 'groups' },
  ]).toArray();
  return row ? row.groups : 0;
};

const report = { created: [], present: [], blocked: [] };
const exists = db.getCollectionNames().includes(COLLECTION);
const indexes = exists ? db.getCollection(COLLECTION).getIndexes() : [];

for (const spec of specs) {
  const match = indexes.find((index) => sameKey(index.key, spec.key));
  const ttlOk = spec.expireAfterSeconds === undefined || (match && match.expireAfterSeconds === spec.expireAfterSeconds);

  if (match && (match.unique || !spec.unique) && ttlOk) {
    report.present.push(`${COLLECTION}.${match.name}`);
    continue;
  }

  if (spec.unique && exists) {
    const groups = duplicateGroups(spec.key);
    if (groups > 0) {
      report.blocked.push(`${COLLECTION}.${spec.name} — ${groups} groupe(s) en doublon`);
      continue;
    }
  }

  const options = { name: spec.name };
  if (spec.unique) options.unique = true;
  if (spec.expireAfterSeconds !== undefined) options.expireAfterSeconds = spec.expireAfterSeconds;

  if (!dryRun) {
    if (match) db.getCollection(COLLECTION).dropIndex(match.name);
    db.getCollection(COLLECTION).createIndex(spec.key, options);
  }
  report.created.push(`${COLLECTION}.${spec.name}${match ? ` (remplace ${match.name})` : ''}`);
}

print(dryRun ? '===== SIMULATION — rien n’est écrit =====' : '===== Index de PairInteractionDay =====');
print(`Créés (${report.created.length}) :`);
report.created.forEach((line) => print(`  + ${line}`));
print(`Déjà présents (${report.present.length})`);
print(`Bloqués par des doublons (${report.blocked.length}) :`);
report.blocked.forEach((line) => print(`  ! ${line}`));
if (report.blocked.length > 0) quit(2);
