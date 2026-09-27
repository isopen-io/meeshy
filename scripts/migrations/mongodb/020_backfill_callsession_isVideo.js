/**
 * Migration 020 : poser `isVideo` sur les CallSession antérieurs (#8203)
 *
 * Contexte — le journal des appels se filtre par type côté serveur
 * (`GET /api/v1/calls/history?type=video`). Le type vivait seulement dans
 * `metadata.type`, un JSON que Prisma sur MongoDB ne sait pas filtrer ;
 * `CallSession.isVideo` en est la copie requêtable, posée à la création depuis
 * ce lot.
 *
 * Sans ce backfill, rien ne casse : `isVideo` est NULLABLE, et un appel qui ne
 * le porte pas se lit « vocal » (le filtre audio garde `NOT isVideo: true`).
 * Mais un appel VIDÉO antérieur manquerait au filtre « vidéo » jusqu'à sortir
 * de la fenêtre de 90 jours : le backfill le rattrape tout de suite.
 *
 * La valeur se déduit de `metadata.type`, la même source que lit `callIsVideo`
 * pour l'affichage : aucune affirmation nouvelle n'est fabriquée.
 *
 * Idempotent : ne touche que les documents où le champ est ABSENT.
 *
 * Usage :
 *   Local   : docker exec -i meeshy-local-database mongosh < scripts/migrations/mongodb/020_backfill_callsession_isVideo.js
 *   Prod    : ssh root@meeshy.me "docker exec -i meeshy-database mongosh" < scripts/migrations/mongodb/020_backfill_callsession_isVideo.js
 */

const db = db.getSiblingDB("meeshy");

print("=== Migration 020 : backfill CallSession.isVideo ===\n");

const missing = { isVideo: { $exists: false } };
print(`Appels sans le champ : ${db.CallSession.countDocuments(missing)}`);

const video = db.CallSession.updateMany({ ...missing, "metadata.type": "video" }, { $set: { isVideo: true } });
print(`isVideo=true posé sur ${video.modifiedCount} appels vidéo`);

const audio = db.CallSession.updateMany(missing, { $set: { isVideo: false } });
print(`isVideo=false posé sur ${audio.modifiedCount} autres appels`);

const stillMissing = db.CallSession.countDocuments(missing);
print(`\nRestant sans le champ : ${stillMissing} ${stillMissing === 0 ? "(OK)" : "(ÉCHEC)"}`);

print("\n=== Migration 020 terminée ===");
