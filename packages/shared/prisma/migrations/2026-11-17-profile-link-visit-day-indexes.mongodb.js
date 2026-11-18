/**
 * Migration MongoDB — les index de `ProfileLinkVisitDay` (les visites de mon lien de profil, par jour UTC),
 * #19206, sans `prisma db push` (#9035).
 *
 * Collection NEUVE : aucune donnée existante n'est lue ni modifiée. Elle se remplit à mesure que les fiches
 * s'ouvrent par `/@pseudo`, `/u/:username` ou `/directory/people/:handle` ; aucun rattrapage historique.
 *
 * Deux index :
 * - (userId, day) UNIQUE — une ligne par propriétaire et par jour ; l'écrivain compte par `$inc` et reprend en
 *   incrément quand deux écrivains créent la même ligne (P2002). Il sert aussi la lecture du propriétaire, la
 *   purge et l'export, qui filtrent par `userId` ;
 * - (expiresAt) TTL, expireAfterSeconds 0 — la ligne meurt à `expiresAt` (40 jours : le mois calendaire le plus
 *   long et la série de trente jours). Posé ici, jamais par `db push`.
 *
 * Même forme et mêmes règles que `2026-10-31-pair-interaction-day-indexes.mongodb.js` : un index se reconnaît à
 * sa CLÉ ; rien ne se passe s'il existe ; un unique bloqué par des doublons est SIGNALÉ, jamais forcé. Idempotente.
 *
 * À JOUER SUR LE STAGING D'ABORD ; en production, avec le feu vert du porteur (#9223), sauvegarde vérifiée d'abord.
 *
 * Exécution (DRY_RUN=1 pour simuler), puis relecture :
 *   docker exec -i -e DRY_RUN=1 meeshy-database mongosh meeshy --quiet < 2026-11-17-profile-link-visit-day-indexes.mongodb.js
 *   docker exec -i meeshy-database mongosh meeshy --quiet < 2026-11-17-profile-link-visit-day-indexes.mongodb.js
 *   docker exec -i meeshy-database mongosh meeshy --quiet --eval 'printjson(db.ProfileLinkVisitDay.getIndexes())'
 */

const dryRun = process.env.DRY_RUN === '1';
const COLLECTION = 'ProfileLinkVisitDay';

const specs = [
  { name: 'ProfileLinkVisitDay_userId_day_key', key: { userId: 1, day: 1 }, unique: true },
  { name: 'ProfileLinkVisitDay_expiresAt_ttl', key: { expiresAt: 1 }, unique: false, expireAfterSeconds: 0 },
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

print(dryRun ? '===== SIMULATION — rien n’est écrit =====' : '===== Index de ProfileLinkVisitDay =====');
print(`Créés (${report.created.length}) :`);
report.created.forEach((line) => print(`  + ${line}`));
print(`Déjà présents (${report.present.length})`);
print(`Bloqués par des doublons (${report.blocked.length}) :`);
report.blocked.forEach((line) => print(`  ! ${line}`));
if (report.blocked.length > 0) quit(2);
