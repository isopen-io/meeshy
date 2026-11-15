/**
 * Migration 022 : poser la valeur par défaut des champs que la passerelle lit
 * sous une NÉGATION, sur les documents qui n'en portent pas la clé (#8309)
 *
 * Contexte — sur MongoDB, Prisma écarte de toute négation (`NOT`, `not`,
 * `notIn`) le document où la clé est ABSENTE (mesuré contre mongo:8 avec le
 * vrai client Prisma, 2026-10-02). Un document écrit avant que le champ n'ait
 * son défaut sortait donc en silence :
 *
 *   - Post.visibilityUserIds        NOT has  → un post EXCEPT fermé à tous les amis
 *   - CallRecording.consentedUserIds NOT has → un consentement à l'enregistrement perdu
 *   - CallRecording.requiredUserIds          → né sans défaut, comme le précédent
 *   - Message.isViewOnce            NOT true → un message absent de l'index des médias
 *   - MessageAttachment.isViewOnce  NOT true → une pièce absente de l'index des médias
 *   - Notification.isRead           NOT {isRead, type} → une notification absente de la liste
 *
 * Idempotent : ne touche que les documents où le champ est ABSENT, jamais une
 * valeur posée (une liste remplie, un `true`).
 *
 * Usage :
 *   Local   : docker exec -i meeshy-local-database mongosh < scripts/migrations/mongodb/022_backfill_fields_read_under_negation.js
 *   Prod    : ssh root@meeshy.me "docker exec -i meeshy-database mongosh" < scripts/migrations/mongodb/022_backfill_fields_read_under_negation.js
 */

const db = db.getSiblingDB("meeshy");

print("=== Migration 022 : défauts des champs lus sous une négation ===\n");

const BACKFILLS = [
  { collection: "Post", field: "visibilityUserIds", value: [] },
  { collection: "CallRecording", field: "consentedUserIds", value: [] },
  { collection: "CallRecording", field: "requiredUserIds", value: [] },
  { collection: "Message", field: "isViewOnce", value: false },
  { collection: "MessageAttachment", field: "isViewOnce", value: false },
  { collection: "Notification", field: "isRead", value: false },
];

let failures = 0;
BACKFILLS.forEach(({ collection, field, value }) => {
  const missing = { [field]: { $exists: false } };
  const before = db[collection].countDocuments(missing);
  const result = before === 0 ? { modifiedCount: 0 } : db[collection].updateMany(missing, { $set: { [field]: value } });
  const after = db[collection].countDocuments(missing);
  if (after !== 0) failures += 1;
  print(`${collection}.${field} : ${before} sans la clé, ${result.modifiedCount} complétés, ${after} restants ${after === 0 ? "(OK)" : "(ÉCHEC)"}`);
});

print(`\n=== Migration 022 terminée ${failures === 0 ? "(OK)" : `(${failures} ÉCHEC)`} ===`);
