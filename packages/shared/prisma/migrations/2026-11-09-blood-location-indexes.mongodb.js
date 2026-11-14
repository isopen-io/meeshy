/**
 * Migration MongoDB — les index de la position du Sang (#13937), sans `prisma db push` (#9035).
 *
 * Deux collections NEUVES (aucune donnée existante n'est lue ni modifiée). Prisma ne sait pas déclarer
 * un index TTL : l'historique de 30 jours ne s'expire que par ces index.
 * - BloodLocationPoint (expiresAt) TTL 0 — le point disparaît à `expiresAt`, 30 jours après sa prise ;
 * - BloodLocationConsultation (expiresAt) TTL 0 — le journal des consultations, 30 jours.
 * Les index (ownerId, recordedAt) et (observedId, consultedAt) sont ceux du schéma Prisma, posés ici aussi
 * pour qu'une base sans `db push` serve les lectures par compte.
 *
 * Même forme et mêmes règles que `2026-10-31-relation-feature-setting-indexes.mongodb.js` : un index se reconnaît à
 * sa CLÉ ; rien ne se passe s'il existe. Idempotente.
 *
 * À JOUER SUR LE STAGING D'ABORD ; en production, avec le feu vert du porteur (#9223), sauvegarde vérifiée d'abord.
 *
 * Exécution (DRY_RUN=1 pour simuler), puis relecture :
 *   docker exec -i -e DRY_RUN=1 meeshy-database mongosh meeshy --quiet < 2026-11-09-blood-location-indexes.mongodb.js
 *   docker exec -i meeshy-database mongosh meeshy --quiet < 2026-11-09-blood-location-indexes.mongodb.js
 *   docker exec -i meeshy-database mongosh meeshy --quiet --eval 'printjson(db.BloodLocationPoint.getIndexes())'
 */

const dryRun = process.env.DRY_RUN === '1';

const specs = [
  { collection: 'BloodLocationPoint', name: 'BloodLocationPoint_expiresAt_ttl', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  { collection: 'BloodLocationPoint', name: 'BloodLocationPoint_ownerId_recordedAt', key: { ownerId: 1, recordedAt: -1 } },
  { collection: 'BloodLocationConsultation', name: 'BloodLocationConsultation_expiresAt_ttl', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  { collection: 'BloodLocationConsultation', name: 'BloodLocationConsultation_observedId_consultedAt', key: { observedId: 1, consultedAt: -1 } },
];

const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const report = { created: [], present: [] };

specs.forEach((spec) => {
  const existing = db.getCollection(spec.collection).getIndexes().find((index) => sameKey(index.key, spec.key));
  if (existing) {
    report.present.push(spec.name);
    return;
  }
  if (!dryRun) {
    const options = { name: spec.name, ...(spec.expireAfterSeconds === undefined ? {} : { expireAfterSeconds: spec.expireAfterSeconds }) };
    db.getCollection(spec.collection).createIndex(spec.key, options);
  }
  report.created.push(spec.name);
});

printjson({ dryRun, ...report });
