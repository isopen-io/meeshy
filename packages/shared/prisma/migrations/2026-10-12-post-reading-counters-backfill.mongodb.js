/**
 * Migration MongoDB — rattrape les compteurs de lecture d'un `Post` restés
 * `null` ou ABSENTS (#10402).
 *
 * Prisma traduit `{ increment: n }` en `$set: { f: { $add: ['$f', n] } }` sur
 * MongoDB : un champ `null` ou absent en ressort `null`, pour toujours, et
 * l'API le sert `0`. Tout post antérieur à ces colonnes affichait donc
 * « N likes, 0 impression, 0 vue » pendant que ses lignes d'événements
 * s'accumulaient. Depuis #10402 le code incrémente par `$ifNull` ; cette
 * migration recalcule ce que les incréments perdus auraient dû écrire.
 *
 * Règles :
 * - ne touche QUE les champs `null` ou absents — un compteur numérique n'est
 *   jamais réécrit (les lignes d'événements peuvent avoir été purgées par une
 *   republication, le compteur fait alors foi) ; rejouer la migration ne
 *   trouve donc plus rien : elle est idempotente ;
 * - chaque valeur se recalcule depuis la source que le code incrémente :
 *     viewCount          = lignes PostView du post
 *     impressionCount    = lignes PostImpression du post
 *                        + lignes PostImpression de ses republications
 *                          (crédit de la RACINE, `originalRepostOfId ?? repostOfId`)
 *     postOpenCount      = sessions PostEngagement `surface: 'reels'`
 *                        + impressions `source: 'detail'` + ouvertures anonymes
 *     playCount          = sessions PostEngagement `completed: true`
 *     qualifiedViewCount = sessions PostEngagement qualifiées (même règle que
 *                          `services/posts/engagementIncrements.ts`)
 * - le type numérique écrit est celui de `likeCount` sur le même post (Long
 *   ou Int) : additionner un Long en JavaScript CONCATÈNE (mémoire
 *   reference_schema_indexes_deploy_without_db_push).
 *
 * Exécution (DRY_RUN=1 pour simuler, rien n'est écrit) :
 *   docker exec -i -e DRY_RUN=1 meeshy-database-staging mongosh meeshy --quiet < 2026-10-12-post-reading-counters-backfill.mongodb.js
 *   docker exec -i meeshy-database-staging mongosh meeshy --quiet < 2026-10-12-post-reading-counters-backfill.mongodb.js
 * En production : feu vert du porteur ET sauvegarde vérifiée d'abord.
 */

const dryRun = process.env.DRY_RUN === '1';
const meeshy = db.getSiblingDB('meeshy');

const COUNTERS = ['viewCount', 'impressionCount', 'postOpenCount', 'playCount', 'qualifiedViewCount'];
const SHORT_VIDEO_MS = 8300;
const QUALIFY_MS = 2500;

const missing = (field) => ({ $or: [{ [field]: null }, { [field]: { $exists: false } }] });

const targets = meeshy.Post.find(
  { $or: COUNTERS.map(missing) },
  { _id: 1, likeCount: 1, ...Object.fromEntries(COUNTERS.map((f) => [f, 1])) },
).toArray();

print(`posts à rattraper : ${targets.length}${dryRun ? ' (DRY_RUN)' : ''}`);

const countBy = (collection, match) => {
  const rows = meeshy[collection].aggregate([
    { $match: match },
    { $group: { _id: '$postId', n: { $sum: 1 } } },
  ]).toArray();
  return new Map(rows.map((row) => [String(row._id), Number(row.n)]));
};

const ids = targets.map((post) => post._id);
const views = countBy('PostView', { postId: { $in: ids } });
const ownImpressions = countBy('PostImpression', { postId: { $in: ids } });
const detailImpressions = countBy('PostImpression', { postId: { $in: ids }, source: 'detail' });
const anonymousOpens = countBy('AnonymousPostOpen', { postId: { $in: ids } });
const reelSessions = countBy('PostEngagement', { postId: { $in: ids }, surface: 'reels' });
const completedSessions = countBy('PostEngagement', { postId: { $in: ids }, completed: true });

const reposts = meeshy.Post.find(
  { $or: [{ originalRepostOfId: { $in: ids } }, { repostOfId: { $in: ids } }] },
  { _id: 1, repostOfId: 1, originalRepostOfId: 1 },
).toArray();
const rootOf = new Map(reposts
  .map((repost) => [String(repost._id), String(repost.originalRepostOfId ?? repost.repostOfId)])
  .filter(([repostId, rootId]) => repostId !== rootId));
const repostImpressions = countBy('PostImpression', { postId: { $in: reposts.map((repost) => repost._id) } });
const rootCredits = new Map();
for (const [repostId, n] of repostImpressions) {
  const rootId = rootOf.get(repostId);
  if (rootId) rootCredits.set(rootId, (rootCredits.get(rootId) ?? 0) + n);
}

const qualifies = (session) => {
  const samples = Array.isArray(session.watchSamples) ? session.watchSamples : [];
  const maxPosition = samples.reduce((max, sample) => {
    const position = sample && sample.positionMs !== undefined ? Number(sample.positionMs) : NaN;
    return Number.isFinite(position) && position > max ? position : max;
  }, 0);
  const duration = session.mediaDurationMs == null ? 0 : Number(session.mediaDurationMs);
  const threshold = duration < SHORT_VIDEO_MS ? 0.9 : 0.3;
  const positionQualifies = duration > 0 && maxPosition / duration >= threshold;
  const watch = session.watchMs == null ? undefined : Number(session.watchMs);
  const watchQualifies = (watch ?? 0) >= QUALIFY_MS;
  const dwellQualifies = watch === undefined && Number(session.dwellMs) >= QUALIFY_MS;
  return positionQualifies || watchQualifies || dwellQualifies;
};
const qualifiedViews = new Map();
meeshy.PostEngagement.find(
  { postId: { $in: ids } },
  { postId: 1, watchMs: 1, dwellMs: 1, mediaDurationMs: 1, watchSamples: 1 },
).forEach((session) => {
  if (!qualifies(session)) return;
  const key = String(session.postId);
  qualifiedViews.set(key, (qualifiedViews.get(key) ?? 0) + 1);
});

const recomputed = (id) => ({
  viewCount: views.get(id) ?? 0,
  impressionCount: (ownImpressions.get(id) ?? 0) + (rootCredits.get(id) ?? 0),
  postOpenCount: (reelSessions.get(id) ?? 0) + (detailImpressions.get(id) ?? 0) + (anonymousOpens.get(id) ?? 0),
  playCount: completedSessions.get(id) ?? 0,
  qualifiedViewCount: qualifiedViews.get(id) ?? 0,
});

const totals = Object.fromEntries(COUNTERS.map((field) => [field, { posts: 0, sum: 0 }]));
let written = 0;

for (const post of targets) {
  const id = String(post._id);
  const values = recomputed(id);
  const asLong = post.likeCount instanceof Long;
  const set = {};
  for (const field of COUNTERS) {
    if (post[field] !== null && post[field] !== undefined) continue;
    set[field] = asLong ? Long.fromNumber(values[field]) : NumberInt(values[field]);
    totals[field].posts += 1;
    totals[field].sum += values[field];
  }
  if (Object.keys(set).length === 0) continue;
  if (!dryRun) {
    meeshy.Post.updateOne({ _id: post._id, $or: Object.keys(set).map(missing) }, { $set: set });
  }
  written += 1;
}

for (const field of COUNTERS) {
  print(`${field} : ${totals[field].posts} posts, ${totals[field].sum} événements rattrapés`);
}
print(`${dryRun ? 'à écrire' : 'écrits'} : ${written} posts`);

if (!dryRun) {
  const remaining = meeshy.Post.countDocuments({ $or: COUNTERS.map(missing) });
  print(`compteurs encore null ou absents : ${remaining}`);
}
