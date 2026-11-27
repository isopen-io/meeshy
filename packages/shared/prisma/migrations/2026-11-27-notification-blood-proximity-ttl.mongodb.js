/**
 * Migration MongoDB — l'alerte de proximité entre Sangs disparaît à son expiration (#20542), sans
 * `prisma db push` (#9035).
 *
 * `blood_proximity` (#20540) est persistée avec `expiresAt` = création + 2 h. Avant cet index, `expiresAt`
 * ne faisait que MASQUER la ligne à la lecture (`visibleNotificationsWhere`) : « Lina, à 500 m, le 24/11 à
 * 21 h 12 » restait en base sans limite, au-delà des 30 jours de l'historique des positions.
 *
 * Un index TTL PARTIEL (`partialFilterExpression: { type: 'blood_proximity' }`) : seules ces lignes
 * expirent. Les autres types qui portent `expiresAt` (messages éphémères, etc.) gardent leur régime — un
 * TTL plein sur `Notification.expiresAt` en supprimerait que leurs producteurs relisent encore. Le moniteur
 * TTL de MongoDB passe toutes les 60 s ; une ligne expirée et pas encore retirée est déjà invisible.
 *
 * Aucune ligne n'est lue ni réécrite : à la création, le moniteur retire les lignes déjà expirées. Un index se
 * reconnaît à sa CLÉ et à son FILTRE ; rien ne se passe s'il existe ; aucun index n'est supprimé. Un index
 * de même clé mais d'un autre régime est SIGNALÉ, jamais remplacé (sortie 2). Idempotente.
 *
 * À JOUER SUR LE STAGING D'ABORD ; en production, avec le feu vert du porteur (#9223), sauvegarde vérifiée d'abord.
 *
 * Exécution (DRY_RUN=1 pour simuler et compter les lignes que le moniteur retirera), puis relecture :
 *   docker exec -i -e DRY_RUN=1 meeshy-database mongosh meeshy --quiet < 2026-11-27-notification-blood-proximity-ttl.mongodb.js
 *   docker exec -i meeshy-database mongosh meeshy --quiet < 2026-11-27-notification-blood-proximity-ttl.mongodb.js
 *   docker exec -i meeshy-database mongosh meeshy --quiet --eval 'printjson(db.Notification.getIndexes())'
 */

const dryRun = process.env.DRY_RUN === '1';

const spec = {
  collection: 'Notification',
  name: 'Notification_bloodProximity_expiresAt_ttl',
  key: { expiresAt: 1 },
  expireAfterSeconds: 0,
  partialFilterExpression: { type: 'blood_proximity' },
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const collection = db.getCollection(spec.collection);
const sameKey = collection.getIndexes().filter((index) => same(index.key, spec.key));
const existing = sameKey.find((index) => same(index.partialFilterExpression, spec.partialFilterExpression) && index.expireAfterSeconds === spec.expireAfterSeconds);
const conflicting = sameKey.filter((index) => index !== existing);

const expired = collection.countDocuments({ type: 'blood_proximity', expiresAt: { $lte: new Date() } });

if (existing) {
  printjson({ dryRun, present: [spec.name], created: [], expiredRows: expired });
} else if (conflicting.length > 0) {
  printjson({ dryRun, conflict: conflicting.map((index) => index.name), created: [] });
  quit(2);
} else {
  if (!dryRun) {
    collection.createIndex(spec.key, { name: spec.name, expireAfterSeconds: spec.expireAfterSeconds, partialFilterExpression: spec.partialFilterExpression });
  }
  printjson({ dryRun, present: [], created: [spec.name], expiredRows: expired });
}
