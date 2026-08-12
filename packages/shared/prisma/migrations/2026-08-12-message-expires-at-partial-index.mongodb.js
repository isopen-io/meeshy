/**
 * Migration MongoDB — index partiel sur `Message.expiresAt`.
 *
 * POURQUOI CE SCRIPT EXISTE : l'entrypoint de production ne joue AUCUNE
 * migration, et les `@@index` du schéma Prisma ne sont jamais créés sur la base
 * de production par un déploiement (cf. l'en-tête de
 * `2026-08-04-post-media-download-indexes.mongodb.js`).
 *
 * CE QU'IL SERT : `ExpiredMessagesCleanupService` balaye à la minute
 * `{ expiresAt: { $lt: now }, deletedAt: absent-ou-nul }`. Sans index, c'est un
 * COLLSCAN par minute sur la plus grosse collection du dépôt — inacceptable à
 * l'échelle visée.
 *
 * POURQUOI PARTIEL, ET PAS `@@index([expiresAt])` DANS LE SCHÉMA : `expiresAt`
 * est écrit EXPLICITEMENT à `null` par tous les créateurs de message
 * (`MessageProcessor.saveMessage`), donc un index ordinaire porterait une
 * entrée par message alors que les messages éphémères sont une fraction
 * infime du total. `partialFilterExpression: { expiresAt: { $type: 'date' } }`
 * n'indexe que les lignes qui ont réellement une échéance — c'est aussi
 * exactement l'ensemble que le balayage interroge, donc le planner l'utilise.
 * Prisma ne sait pas exprimer un index partiel dans le schéma ; le dépôt a déjà
 * ce précédent (`2026-05-09-message-client-id.mongodb.js`).
 *
 * Idempotent : présent avec la même spec = no-op ; spec divergente = drop puis
 * recréation.
 *
 * Exécution :
 *   mongosh "$DATABASE_URL" < 2026-08-12-message-expires-at-partial-index.mongodb.js
 */

const COLLECTION = 'Message';
const INDEX_NAME = 'expiresAt_ephemeral_partial';
const KEY = { expiresAt: 1 };
const PARTIAL_FILTER = { expiresAt: { $type: 'date' } };

function sameKey(a, b) {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k, i) => kb[i] === k && a[k] === b[k]);
}

function samePartialFilter(found) {
  const pfe = found.partialFilterExpression;
  if (!pfe || !pfe.expiresAt) return false;
  return pfe.expiresAt.$type === 'date';
}

const names = db.getCollectionNames();
if (!names.includes(COLLECTION)) {
  print(`[migration] collection ${COLLECTION} absente — rien à indexer`);
} else {
  const coll = db.getCollection(COLLECTION);
  const found = coll.getIndexes().find((idx) => idx.name === INDEX_NAME);

  if (found && sameKey(found.key, KEY) && samePartialFilter(found)) {
    print(`[migration] ${INDEX_NAME} — déjà conforme, no-op`);
  } else {
    if (found) {
      print(`[migration] ${INDEX_NAME} — spec divergente, drop puis recréation`);
      coll.dropIndex(INDEX_NAME);
    }
    coll.createIndex(KEY, { name: INDEX_NAME, partialFilterExpression: PARTIAL_FILTER });
    print(`[migration] ${INDEX_NAME} — créé`);
  }
}

print('[migration] index Message.expiresAt à jour');
