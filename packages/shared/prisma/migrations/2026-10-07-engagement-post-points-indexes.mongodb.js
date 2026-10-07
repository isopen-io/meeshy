/**
 * Migration MongoDB — les index de `EngagementPostPoints`, ce qu'un post a rapporté à son lecteur (#9569), sans
 * `prisma db push` (#9035).
 *
 * Collection NEUVE : aucune donnée existante n'est lue ni modifiée, aucun backfill. Le crédit de publication
 * des posts d'avant ce lot se lit dans `EngagementQuota` (seau `content:<postId>`), qui n'est pas touchée.
 *
 * Deux index :
 * - l'unique (lecteur, post) — la clé de l'upsert du cumul, et celle de la lecture en lot d'une page de fil ;
 * - (post) — le retrait des lignes d'un post supprimé ou balayé.
 *
 * Même forme et mêmes règles que `2026-10-05-game-indexes.mongodb.js` : un index se reconnaît à sa CLÉ ; rien
 * ne se passe s'il existe ; un unique bloqué par des doublons est SIGNALÉ, jamais forcé. Idempotente — la
 * rejouer ne change rien.
 *
 * À JOUER AVANT le premier crédit du nouveau code, ou aussitôt après son déploiement : sans l'unique, deux
 * premiers gestes simultanés du même lecteur sur le même post peuvent poser deux lignes. La lecture les
 * additionne (aucun point n'est perdu), mais l'unique reste alors « bloqué » ici jusqu'à leur fusion à la main
 * (réécrire `totalPoints` en `Long`, jamais par une addition mongosh qui concatène).
 *
 * À JOUER SUR LE STAGING D'ABORD ; en production, avec le feu vert du porteur (#9223), sauvegarde vérifiée
 * d'abord.
 *
 * Exécution (DRY_RUN=1 pour simuler), puis relecture :
 *   docker exec -i -e DRY_RUN=1 meeshy-database mongosh meeshy --quiet < 2026-10-07-engagement-post-points-indexes.mongodb.js
 *   docker exec -i meeshy-database mongosh meeshy --quiet < 2026-10-07-engagement-post-points-indexes.mongodb.js
 *   docker exec -i meeshy-database mongosh meeshy --quiet --eval 'printjson(db.EngagementPostPoints.getIndexes())'
 */

const dryRun = process.env.DRY_RUN === '1';

const specs = [
  { collection: 'EngagementPostPoints', name: 'EngagementPostPoints_userId_postId_key', key: { userId: 1, postId: 1 }, unique: true },
  { collection: 'EngagementPostPoints', name: 'EngagementPostPoints_postId_idx', key: { postId: 1 } },
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

print(dryRun ? '===== SIMULATION — rien n’est écrit =====' : '===== Index de EngagementPostPoints =====');
print(`Créés (${report.created.length}) :`);
report.created.forEach((line) => print(`  + ${line}`));
print(`Déjà présents (${report.present.length})`);
print(`Bloqués par des doublons (${report.blocked.length}) :`);
report.blocked.forEach((line) => print(`  ! ${line}`));
if (report.blocked.length > 0) quit(2);
