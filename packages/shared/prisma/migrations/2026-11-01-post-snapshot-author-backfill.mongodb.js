/**
 * Migration MongoDB — rattrape `Post.snapshotAuthorId` sur les copies EXISTANTES d'un contenu éphémère (#14247).
 *
 * `repostPost` copie le contenu d'une source éphémère (STORY, STATUS) dans la republication ; le balayage des stories
 * expirées détache ensuite `repostOfId`. Depuis #14247, la copie écrit l'auteur d'ORIGINE (`snapshotAuthorId`) et la
 * garde de blocage le lit. Les copies créées AVANT ne l'ont pas : tant qu'elles sont encore reliées à leur source, on le
 * rattrape ici (l'auteur d'origine de la source, ou à défaut son auteur). Une copie déjà détachée n'a plus de trace :
 * elle reste jugée sur son seul auteur.
 *
 * Règles :
 * - ne touche QUE les posts dont `repostOfId` vise une source STORY ou STATUS et dont `snapshotAuthorId` est absent ou
 *   nul — jamais une valeur posée ; rejouer ne trouve plus rien : idempotente ;
 * - écrit la valeur BSON de l'auteur telle quelle (ObjectId, comme `@db.ObjectId`) ;
 * - parcourt par `_id` croissant, par lots, sans charger la collection.
 *
 * À JOUER SUR LE STAGING D'ABORD ; en production, avec le feu vert du porteur (#9223), sauvegarde vérifiée d'abord.
 *
 * Exécution (DRY_RUN=1 pour simuler, rien n'est écrit) :
 *   docker exec -i -e DRY_RUN=1 meeshy-database mongosh meeshy --quiet < 2026-11-01-post-snapshot-author-backfill.mongodb.js
 *   docker exec -i meeshy-database mongosh meeshy --quiet < 2026-11-01-post-snapshot-author-backfill.mongodb.js
 */

const dryRun = process.env.DRY_RUN === '1';
const BATCH = 500;
const EPHEMERAL = ['STORY', 'STATUS'];
const posts = db.getCollection('Post');

const missing = { $or: [{ snapshotAuthorId: null }, { snapshotAuthorId: { $exists: false } }] };

let last = null;
let scanned = 0;
let filled = 0;

for (;;) {
  const filter = { repostOfId: { $ne: null }, ...missing, ...(last === null ? {} : { _id: { $gt: last } }) };
  const copies = posts.find(filter, { _id: 1, repostOfId: 1 }).sort({ _id: 1 }).limit(BATCH).toArray();
  if (copies.length === 0) break;
  last = copies[copies.length - 1]._id;
  scanned += copies.length;

  const sources = posts
    .find({ _id: { $in: copies.map((copy) => copy.repostOfId) }, type: { $in: EPHEMERAL } }, { _id: 1, authorId: 1, snapshotAuthorId: 1 })
    .toArray();
  const originOf = new Map(sources.map((source) => [String(source._id), source.snapshotAuthorId || source.authorId]));

  for (const copy of copies) {
    const origin = originOf.get(String(copy.repostOfId));
    if (!origin) continue;
    if (!dryRun) posts.updateOne({ _id: copy._id, ...missing }, { $set: { snapshotAuthorId: origin } });
    filled += 1;
  }
}

print(dryRun ? '===== SIMULATION — rien n’est écrit =====' : '===== Auteur d’origine des copies éphémères =====');
print(`Republications examinées : ${scanned}`);
print(`Copies d’une source éphémère rattrapées : ${filled}`);
