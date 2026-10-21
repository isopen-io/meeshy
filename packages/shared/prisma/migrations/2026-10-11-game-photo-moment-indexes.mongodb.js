/**
 * Migration MongoDB — les index de `GamePhotoMoment` (le registre des moments photo, #10162, L10a du chantier
 * « Cadres de gloire »), sans `prisma db push` (#9035).
 *
 * Collection NEUVE : aucune donnée existante n'est lue ni modifiée, aucun backfill. Les cinq colonnes neuves de
 * `GameProfile` (`frameAtmosphere`, `photoInvitations`, `photoAlertsBaselineAt`, `photoAlertsBaseline`,
 * `treasuryPeakTier`) sont optionnelles : un document sans elles se lit « pas encore choisi », rien à écrire.
 *
 * Deux index :
 * - GamePhotoMoment (userId, stepId), UNIQUE — une étape n'a qu'une ligne par compte ;
 * - GamePhotoMoment (userId, updatedAt) — l'extension `game.photo` lit les 64 lignes les plus récentes d'un compte.
 *
 * L'ordre avec le déploiement : l'unique n'est pas indispensable à la justesse — chaque ligne naît avec un `_id`
 * DÉRIVÉ de (userId, stepId) (`photoMomentId`), et l'index `_id`, qui existe toujours, refuse un second
 * exemplaire. Il garde la base contre une ligne écrite à la main ou par un autre chemin.
 *
 * Même forme et mêmes règles que `2026-10-07-mythic-seat-indexes.mongodb.js` : un index se reconnaît à sa CLÉ ;
 * rien ne se passe s'il existe ; un unique bloqué par des doublons est SIGNALÉ, jamais forcé. Idempotente — la
 * rejouer ne change rien.
 *
 * À JOUER SUR LE STAGING D'ABORD ; en production, avec le feu vert du porteur (#9223, accordé pour L10a le
 * 2026-10-11 sur #9963), sauvegarde vérifiée d'abord.
 *
 * Exécution (DRY_RUN=1 pour simuler), puis relecture :
 *   docker exec -i -e DRY_RUN=1 meeshy-database mongosh meeshy --quiet < 2026-10-11-game-photo-moment-indexes.mongodb.js
 *   docker exec -i meeshy-database mongosh meeshy --quiet < 2026-10-11-game-photo-moment-indexes.mongodb.js
 *   docker exec -i meeshy-database mongosh meeshy --quiet --eval 'printjson(db.GamePhotoMoment.getIndexes())'
 */

const dryRun = process.env.DRY_RUN === '1';

const specs = [
  { collection: 'GamePhotoMoment', name: 'GamePhotoMoment_userId_stepId_key', key: { userId: 1, stepId: 1 }, unique: true },
  { collection: 'GamePhotoMoment', name: 'GamePhotoMoment_userId_updatedAt_idx', key: { userId: 1, updatedAt: 1 } },
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

print(dryRun ? '===== SIMULATION — rien n’est écrit =====' : '===== Index de GamePhotoMoment =====');
print(`Créés (${report.created.length}) :`);
report.created.forEach((line) => print(`  + ${line}`));
print(`Déjà présents (${report.present.length})`);
print(`Bloqués par des doublons (${report.blocked.length}) :`);
report.blocked.forEach((line) => print(`  ! ${line}`));
if (report.blocked.length > 0) quit(2);
