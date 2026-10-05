/**
 * Migration 021 : poser `hiddenForUserIds: []` sur les CallSession qui n'en portent pas (#8294)
 *
 * Contexte — `CallSession.hiddenForUserIds` (#8066) est né sans défaut : aucune
 * session créée avant `@default([])` n'en porte la clé. Sur MongoDB, Prisma
 * double tout filtre de liste NIÉ (`NOT: { has }`) d'une exigence de présence
 * du champ : ces sessions sortaient de toute requête « non effacée ».
 *
 * Sans ce backfill, le journal reste juste : il retire les appels effacés par
 * identifiant (`services/calls/callHistoryList.ts`), jamais par `NOT has`. Le
 * backfill aligne les données sur le schéma, pour que toute requête future sur
 * ce champ lise une liste — jamais une clé absente.
 *
 * Idempotent : ne touche que les documents où le champ est ABSENT.
 *
 * Usage :
 *   Local   : docker exec -i meeshy-local-database mongosh < scripts/migrations/mongodb/021_backfill_callsession_hiddenForUserIds.js
 *   Prod    : ssh root@meeshy.me "docker exec -i meeshy-database mongosh" < scripts/migrations/mongodb/021_backfill_callsession_hiddenForUserIds.js
 */

const db = db.getSiblingDB("meeshy");

print("=== Migration 021 : backfill CallSession.hiddenForUserIds ===\n");

const missing = { hiddenForUserIds: { $exists: false } };
print(`Appels sans le champ : ${db.CallSession.countDocuments(missing)}`);

const result = db.CallSession.updateMany(missing, { $set: { hiddenForUserIds: [] } });
print(`hiddenForUserIds=[] posé sur ${result.modifiedCount} appels`);

const stillMissing = db.CallSession.countDocuments(missing);
print(`\nRestant sans le champ : ${stillMissing} ${stillMissing === 0 ? "(OK)" : "(ÉCHEC)"}`);

print("\n=== Migration 021 terminée ===");
