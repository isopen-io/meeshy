/**
 * Migration MongoDB — les index de lecture de `CommunityMember` par PERSONNE et par PAIRE (communauté, personne),
 * #14227 (constat 1 de l'audit de #14081), sans `prisma db push` (#9035).
 *
 * La collection ne portait qu'un index, `(communityId, isActive, joinedAt)`, qui sert l'effectif d'une communauté.
 * Tout le reste parcourait la collection entière, ou tout l'effectif pour une seule personne :
 * - « mes communautés », l'accès d'un post COMMUNITY, la co-appartenance de deux personnes, la purge et l'export
 *   d'un compte lisent `{ userId, isActive }` (parfois `communityId: { in }` en plus) ;
 * - le contrôle d'accès de chaque route, l'invitation, l'adhésion et la décision d'une demande d'entrée lisent
 *   `{ communityId, userId }`.
 * Deux index, NON uniques :
 * - (userId, isActive)     — le préfixe `userId` sert aussi les lectures sans `isActive` (purge, export) ;
 * - (communityId, userId)  — une personne dans une communauté, active ou non (réactivation, invitation).
 * L'unicité de la paire est un autre geste (#16696) : des doublons existent peut-être, ils ne doivent pas bloquer
 * ces index de lecture.
 *
 * Aucune donnée n'est lue ni modifiée, aucun index existant n'est touché. Un index se reconnaît à sa CLÉ : présent
 * sous un autre nom, il est laissé tel quel. Un index de même clé mais PARTIEL, ÉPARS ou à COLLATION propre ne sert
 * pas toutes ces lectures : il est signalé (sortie 2), jamais remplacé — à arbitrer à la main. Idempotente.
 *
 * À JOUER SUR LE STAGING D'ABORD ; en production, avec le feu vert du porteur (#9223), sauvegarde vérifiée d'abord,
 * hors pic, après avoir relevé `db.CommunityMember.estimatedDocumentCount()` (la construction ne verrouille la
 * collection qu'à son début et à sa fin depuis MongoDB 4.2). Retour arrière : `dropIndex` des deux noms créés, rien
 * d'autre n'ayant été touché.
 *
 * Exécution (DRY_RUN=1 pour simuler), puis relecture et mesure :
 *   docker exec -i -e DRY_RUN=1 meeshy-database mongosh meeshy --quiet < 2026-11-19-community-member-lookup-indexes.mongodb.js
 *   docker exec -i meeshy-database mongosh meeshy --quiet < 2026-11-19-community-member-lookup-indexes.mongodb.js
 *   docker exec -i meeshy-database mongosh meeshy --quiet --eval '
 *     const id = ObjectId();
 *     printjson(db.CommunityMember.find({ userId: id, isActive: true }).explain().queryPlanner.winningPlan);
 *     printjson(db.CommunityMember.find({ communityId: id, userId: id }).explain().queryPlanner.winningPlan)'
 *   (attendu : IXSCAN sur CommunityMember_userId_isActive_idx puis CommunityMember_communityId_userId_idx, aucun COLLSCAN)
 */

const dryRun = process.env.DRY_RUN === '1';
const COLLECTION = 'CommunityMember';

const specs = [
  { name: 'CommunityMember_userId_isActive_idx', key: { userId: 1, isActive: 1 } },
  { name: 'CommunityMember_communityId_userId_idx', key: { communityId: 1, userId: 1 } },
];

const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const servesEveryRead = (index) => index.partialFilterExpression === undefined && index.sparse !== true && index.collation === undefined;

const report = { created: [], present: [], blocked: [] };
const existing = db.getCollectionNames().includes(COLLECTION) ? db.getCollection(COLLECTION).getIndexes() : [];

for (const spec of specs) {
  const match = existing.find((index) => sameKey(index.key, spec.key));

  if (match && !servesEveryRead(match)) {
    report.blocked.push(`${COLLECTION}.${match.name} — même clé, mais partiel, épars ou à collation propre`);
    continue;
  }

  if (match) {
    report.present.push(`${COLLECTION}.${match.name}`);
    continue;
  }

  if (!dryRun) db.getCollection(COLLECTION).createIndex(spec.key, { name: spec.name });
  report.created.push(`${COLLECTION}.${spec.name}`);
}

print(dryRun ? '===== SIMULATION — rien n’est écrit =====' : '===== Index de lecture des appartenances de communauté =====');
print(`Créés (${report.created.length}) :`);
report.created.forEach((line) => print(`  + ${line}`));
print(`Déjà présents (${report.present.length}) :`);
report.present.forEach((line) => print(`  = ${line}`));
print(`Bloqués (${report.blocked.length}) :`);
report.blocked.forEach((line) => print(`  ! ${line}`));
if (report.blocked.length > 0) quit(2);
