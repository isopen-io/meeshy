/**
 * Migration MongoDB — les index uniques des ÉDITEURS de packs (#16274), sans
 * `prisma db push` (même raisons et même méthode que
 * `2026-10-01-schema-indexes.mongodb.js`, #9035).
 *
 *  - `PartnerProfile.userId` UNIQUE : un compte possède au plus un éditeur. Le
 *    schéma le déclare (`@unique`) depuis #11327, mais aucune migration ne le
 *    posait : il n'existait que là où un `db push` avait tourné ;
 *  - `PartnerProfile.slug` UNIQUE PARTIEL (`{ slug: { $type: 'string' } }`) :
 *    deux éditeurs n'ont pas la même adresse, et un profil d'avant les éditeurs,
 *    sans adresse, ne bloque rien ;
 *  - `PartnerProfile.nameKey` UNIQUE PARTIEL : deux éditeurs ne portent pas un
 *    nom qui se LIT pareil (`publisherNameKey`).
 *
 * `PackPublishers` vérifie ces unicités lui-même sans supposer les index ; les
 * index ferment la course que le code ne peut pas fermer seul.
 *
 * Idempotente : un index se reconnaît à sa CLÉ et à ses options ; présent tel
 * quel, rien ne se passe ; présent avec d'autres options (l'unique NON partiel
 * d'un ancien `db push`), il est remplacé. Les DOUBLONS sont relevés AVANT
 * toute écriture : un index qu'ils bloquent n'est pas posé, le script le dit et
 * sort en code 2 — les résoudre à la main, puis rejouer.
 *
 * Exécution (DRY_RUN=1 pour simuler, staging d'abord ; production après feu
 * vert du porteur et sauvegarde vérifiée) :
 *   docker exec -i -e DRY_RUN=1 meeshy-database-staging mongosh meeshy --quiet < 2026-11-05-partner-profile-publisher-indexes.mongodb.js
 *   docker exec -i meeshy-database-staging mongosh meeshy --quiet < 2026-11-05-partner-profile-publisher-indexes.mongodb.js
 */

const dryRun = process.env.DRY_RUN === '1';

const COLLECTION = 'PartnerProfile';

const specs = [
  { name: 'PartnerProfile_userId_key', key: { userId: 1 }, unique: true },
  { name: 'PartnerProfile_slug_key', key: { slug: 1 }, unique: true, partialFilterExpression: { slug: { $type: 'string' } } },
  { name: 'PartnerProfile_nameKey_key', key: { nameKey: 1 }, unique: true, partialFilterExpression: { nameKey: { $type: 'string' } } },
];

const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const sameOptions = (index, spec) => (index.unique === true) === (spec.unique === true) && sameJson(index.partialFilterExpression, spec.partialFilterExpression);

const duplicateGroups = (spec) => {
  const field = Object.keys(spec.key)[0];
  const pipeline = [
    ...(spec.partialFilterExpression ? [{ $match: spec.partialFilterExpression }] : []),
    { $group: { _id: { [field]: `$${field}` }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $count: 'groups' },
  ];
  const [row] = db.getCollection(COLLECTION).aggregate(pipeline).toArray();
  return row ? row.groups : 0;
};

const report = { created: [], present: [], blocked: [] };
const exists = db.getCollectionNames().includes(COLLECTION);

for (const spec of specs) {
  const existing = exists ? db.getCollection(COLLECTION).getIndexes() : [];
  const match = existing.find((index) => sameJson(index.key, spec.key));

  if (match && sameOptions(match, spec)) {
    report.present.push(`${COLLECTION}.${match.name}`);
    continue;
  }

  const groups = exists ? duplicateGroups(spec) : 0;
  if (groups > 0) {
    report.blocked.push(`${COLLECTION}.${spec.name} — ${groups} groupe(s) en doublon`);
    continue;
  }

  const options = { name: spec.name, unique: true };
  if (spec.partialFilterExpression) options.partialFilterExpression = spec.partialFilterExpression;

  if (!dryRun) {
    if (match) db.getCollection(COLLECTION).dropIndex(match.name);
    db.getCollection(COLLECTION).createIndex(spec.key, options);
  }
  report.created.push(`${COLLECTION}.${spec.name}${match ? ` (remplace ${match.name})` : ''}`);
}

print(dryRun ? '===== SIMULATION — rien n’est écrit =====' : '===== Index des éditeurs de packs =====');
print(`Créés (${report.created.length}) :`);
report.created.forEach((line) => print(`  + ${line}`));
print(`Déjà présents (${report.present.length})`);
print(`Bloqués par des doublons (${report.blocked.length}) :`);
report.blocked.forEach((line) => print(`  ! ${line}`));
if (report.blocked.length > 0) quit(2);
