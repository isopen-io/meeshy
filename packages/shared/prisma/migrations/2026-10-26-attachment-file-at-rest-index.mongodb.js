/**
 * Migration MongoDB — pose l'index unique de `AttachmentFileAtRest.storageKey`
 * et l'index de `attachmentId` (#13100), sans `prisma db push` (même raisons et
 * même méthode que `2026-10-01-schema-indexes.mongodb.js`, #9035).
 *
 * La lecture d'un fichier de pièce jointe demande « ce fichier est-il scellé ? »
 * par sa clé de stockage, à chaque requête : sans index, chaque média servi
 * parcourrait la collection. L'unicité garantit qu'une clé n'a qu'un scellement.
 *
 * Additive et idempotente : un index se reconnaît à sa CLÉ ; présent, rien ne
 * se passe. La collection est neuve : aucun doublon possible avant le premier
 * scellement.
 *
 * Exécution (DRY_RUN=1 pour simuler, staging d'abord) :
 *   docker exec -i -e DRY_RUN=1 meeshy-database-staging mongosh meeshy --quiet < 2026-10-26-attachment-file-at-rest-index.mongodb.js
 *   docker exec -i meeshy-database-staging mongosh meeshy --quiet < 2026-10-26-attachment-file-at-rest-index.mongodb.js
 */

const dryRun = process.env.DRY_RUN === '1';

const specs = [
  { collection: 'AttachmentFileAtRest', name: 'AttachmentFileAtRest_storageKey_key', key: { storageKey: 1 }, unique: true },
  { collection: 'AttachmentFileAtRest', name: 'AttachmentFileAtRest_attachmentId_idx', key: { attachmentId: 1 } },
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
  if (dryRun) {
    report.created.push(`${spec.collection}.${spec.name} (à blanc)`);
    continue;
  }
  db.getCollection(spec.collection).createIndex(spec.key, options);
  report.created.push(`${spec.collection}.${spec.name}`);
}

printjson(report);
