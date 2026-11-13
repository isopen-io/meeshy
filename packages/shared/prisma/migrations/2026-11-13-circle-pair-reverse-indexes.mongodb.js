/**
 * Migration MongoDB — les index du SECOND sens de la paire, pour `RelationFeatureSetting` et `PairInteractionDay`
 * (#14529, constat m1 de l'audit de #14448), sans `prisma db push` (#9035).
 *
 * Un `$or` n'utilise un index que si CHACUNE de ses branches en a un. La purge d'un compte
 * (`OR: [{ ownerId }, { otherId }]`, `OR: [{ userLowId }, { userHighId }]`), l'export des cercles et le progrès de
 * « Mes cercles » (`OR` sur la paire + `day`) avaient une branche servie par le préfixe de l'unique et l'autre par
 * rien : la collection entière se parcourait — pour `PairInteractionDay`, toutes les paires de la plateforme sur
 * 120 jours. Deux index, NON uniques :
 * - RelationFeatureSetting (otherId)          — le sens « ce qu'on m'a accordé » ;
 * - PairInteractionDay (userHighId, day)      — la branche haute de la paire ; `day` en second sert la fenêtre du
 *   progrès, et le préfixe seul sert la purge. La branche basse l'est déjà par l'unique (userLowId, userHighId, day).
 *
 * Aucune donnée n'est lue ni modifiée, aucun index existant n'est touché. Un index se reconnaît à sa CLÉ : présent
 * sous un autre nom, il est laissé tel quel. Idempotente.
 *
 * À JOUER SUR LE STAGING D'ABORD ; en production, avec le feu vert du porteur (#9223), sauvegarde vérifiée d'abord.
 *
 * Exécution (DRY_RUN=1 pour simuler), puis relecture et mesure :
 *   docker exec -i -e DRY_RUN=1 meeshy-database mongosh meeshy --quiet < 2026-11-13-circle-pair-reverse-indexes.mongodb.js
 *   docker exec -i meeshy-database mongosh meeshy --quiet < 2026-11-13-circle-pair-reverse-indexes.mongodb.js
 *   docker exec -i meeshy-database mongosh meeshy --quiet --eval '
 *     const id = ObjectId();
 *     printjson(db.PairInteractionDay.find({ $or: [{ userLowId: id }, { userHighId: id }] }).explain().queryPlanner.winningPlan);
 *     printjson(db.RelationFeatureSetting.find({ $or: [{ ownerId: id }, { otherId: id }] }).explain().queryPlanner.winningPlan)'
 *   (attendu : un OR de deux IXSCAN, plus aucun COLLSCAN)
 */

const dryRun = process.env.DRY_RUN === '1';

const specs = [
  { collection: 'RelationFeatureSetting', name: 'RelationFeatureSetting_otherId_idx', key: { otherId: 1 } },
  { collection: 'PairInteractionDay', name: 'PairInteractionDay_userHighId_day_idx', key: { userHighId: 1, day: 1 } },
];

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

print(dryRun ? '===== SIMULATION — rien n’est écrit =====' : '===== Index du second sens de la paire (cercles) =====');
print(`Créés (${report.created.length}) :`);
report.created.forEach((line) => print(`  + ${line}`));
print(`Déjà présents (${report.present.length}) :`);
report.present.forEach((line) => print(`  = ${line}`));
