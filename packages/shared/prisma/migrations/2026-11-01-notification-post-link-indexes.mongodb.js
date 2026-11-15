/**
 * Migration MongoDB — les index des chemins qui lient une `Notification` à une publication (#14254), sans
 * `prisma db push` (#9035).
 *
 * `retractPostNotifications` filtre `context.postId`, `metadata.repostId` et `metadata.originalPostId` par une commande
 * brute. Aucun index ne couvrait ces chemins : chaque retrait d'une publication parcourait la collection, une fois par
 * lot de 200. `reproduceEditedSubjectNotifications` et `retractReactionNotifications` (cas post) en profitent aussi ;
 * `markPostNotificationsAsRead` reste sur l'index `userId`.
 *
 * Mesure sur un mongod 8.0.4 local (200 001 lignes synthétiques, audit #14254) : avant, 171 430 documents lus en
 * 287 ms par lot ; après, `FETCH > OR > IXSCAN` sur les trois index, 41 documents lus, 2 ms. La mesure « avant »
 * imprimée ici parcourt la collection UNE fois (le coût d'un lot de retrait d'aujourd'hui), sans rien imprimer d'autre
 * que des compteurs. `createIndex` attend le quorum du replica set.
 *
 * Pourquoi un index sur le CHEMIN et pas une colonne typée : Prisma range un `Json` comme un sous-document BSON, que
 * MongoDB indexe par chemin pointé. L'index sert donc toutes les lignes EXISTANTES et à venir, sans qu'aucun producteur
 * ne change ni qu'aucune ligne ne soit réécrite : rien à rétro-remplir, aucune transition à deux lectures, aucun client
 * concerné. Prisma ne sait pas déclarer un index sur un chemin de `Json` : ces trois index vivent ICI, comme les
 * `Notification_userId_*` posés à la main (un `prisma db push` les retirerait — il est interdit, #9035).
 *
 * Trois index CREUX (`sparse`) : une ligne qui ne porte pas le chemin (un message, un appel…) n'y entre pas. Une
 * égalité ou un `$in` sur des valeurs non nulles ne peut pas rendre de ligne sans le chemin, donc le planificateur les
 * emploie ; chaque branche du `$or` du retrait devient un parcours d'index.
 *
 * Même forme et mêmes règles que `2026-10-31-user-relation-indexes.mongodb.js` : un index se reconnaît à sa CLÉ ; rien
 * ne se passe s'il existe ; aucun index n'est supprimé. Idempotente — la rejouer ne change rien. La MESURE du plan
 * avant / après est imprimée par la migration elle-même (`EXPLAIN` sur le filtre du retrait, avec le post le plus
 * récemment notifié).
 *
 * À JOUER SUR LE STAGING D'ABORD ; en production, avec le feu vert du porteur (#9223), sauvegarde vérifiée d'abord.
 *
 * Exécution (DRY_RUN=1 pour simuler et mesurer le plan actuel, rien n'est écrit), puis relecture :
 *   docker exec -i -e DRY_RUN=1 meeshy-database mongosh meeshy --quiet < 2026-11-01-notification-post-link-indexes.mongodb.js
 *   docker exec -i meeshy-database mongosh meeshy --quiet < 2026-11-01-notification-post-link-indexes.mongodb.js
 *   docker exec -i meeshy-database mongosh meeshy --quiet --eval 'printjson(db.Notification.getIndexes())'
 */

const dryRun = process.env.DRY_RUN === '1';

const specs = [
  { collection: 'Notification', name: 'Notification_context_postId_idx', key: { 'context.postId': 1 } },
  { collection: 'Notification', name: 'Notification_metadata_repostId_idx', key: { 'metadata.repostId': 1 } },
  { collection: 'Notification', name: 'Notification_metadata_originalPostId_idx', key: { 'metadata.originalPostId': 1 } },
];

const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const sampleFilter = () => {
  const [row] = db.Notification.find({ 'context.postId': { $exists: true } }, { 'context.postId': 1 })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();
  const postId = row && row.context ? String(row.context.postId) : '000000000000000000000000';
  return {
    type: { $ne: 'content_removed' },
    $or: specs.map((spec) => ({ [Object.keys(spec.key)[0]]: { $in: [postId] } })),
  };
};

const stagesOf = (plan) => {
  if (!plan) return [];
  const own = plan.stage ? [plan.stage] : [];
  const children = [plan.inputStage, ...(plan.inputStages || [])].filter(Boolean);
  return own.concat(...children.map(stagesOf));
};

const measure = (label) => {
  const filter = sampleFilter();
  const explained = db.Notification.find(filter).explain('executionStats');
  const stats = explained.executionStats || {};
  const stages = [...new Set(stagesOf(explained.queryPlanner && explained.queryPlanner.winningPlan))];
  print(`Plan ${label} : ${stages.join(' > ')} — ${stats.totalDocsExamined} document(s) lu(s), ${stats.nReturned} rendu(s), ${stats.executionTimeMillis} ms`);
};

const report = { created: [], present: [] };
const exists = db.getCollectionNames().includes('Notification');

print(dryRun ? '===== SIMULATION — rien n’est écrit =====' : '===== Index des liens Notification → publication =====');
if (exists) measure('avant');

for (const spec of specs) {
  const existing = exists ? db.getCollection(spec.collection).getIndexes() : [];
  const match = existing.find((index) => sameKey(index.key, spec.key));
  if (match) {
    report.present.push(`${spec.collection}.${match.name}`);
    continue;
  }
  if (!dryRun) db.getCollection(spec.collection).createIndex(spec.key, { name: spec.name, sparse: true });
  report.created.push(`${spec.collection}.${spec.name}`);
}

print(`Créés (${report.created.length}) :`);
report.created.forEach((line) => print(`  + ${line}`));
print(`Déjà présents (${report.present.length})`);
report.present.forEach((line) => print(`  = ${line}`));
if (exists && !dryRun) measure('après');
