/**
 * Migration 012 : poser `capturedInApp` sur les MessageAttachment antérieurs
 *
 * Contexte — `MessageAttachment.capturedInApp` (Boolean, défaut `false`) déclare
 * qu'un média sort de la caméra ou du micro de l'application. La feuille de
 * partage le lit pour décider si PUBLIER ce média demande confirmation : une
 * capture n'a encore été vue par personne.
 *
 * ─── Pourquoi un backfill, alors que MongoDB est sans schéma ───────────────
 *
 * Un scalaire NON NULLABLE que le document ne porte pas fait échouer la LECTURE
 * côté Prisma (« Field capturedInApp is required to return data, got null »), et
 * cette lecture-là sert la liste de messages : sans backfill, toute conversation
 * portant une pièce jointe antérieure à ce champ cesserait de se charger. Le
 * `@default(false)` du schéma s'applique à l'ÉCRITURE, il ne reconstitue pas un
 * champ absent à la lecture.
 *
 * C'est le même geste que l'étape 4 de `scripts/migrate-effect-flags.js`, qui
 * initialise `effectFlags = 0` sur tous les messages qui ne le portent pas — et
 * pour exactement la même raison.
 *
 * ─── Pourquoi `false` pour TOUT le monde, sans exception ───────────────────
 *
 * La provenance n'est connaissable qu'AU MOMENT de la capture, par le client qui
 * a ouvert la caméra ou le micro. Rien dans un fichier, un type MIME ou un nom ne
 * distingue une photo prise à l'instant d'une photo importée : toute heuristique
 * de rattrapage (« les .m4a sont des notes vocales ») fabriquerait une
 * affirmation que personne n'a faite. `false` — « je n'affirme pas que c'est une
 * capture » — est la seule valeur honnête pour un média déjà envoyé, et c'est
 * aussi la valeur prudente dans le bon sens : elle ne pose pas de confirmation
 * là où elle n'a aucun fondement.
 *
 * Idempotent : ne touche que les documents où le champ est ABSENT, jamais ceux
 * qui portent déjà une valeur — un rejeu n'écrase donc aucune déclaration faite
 * par un client entre-temps.
 *
 * Usage :
 *   Local   : docker exec -i meeshy-local-database mongosh < scripts/migrations/mongodb/012_backfill_attachment_capturedInApp.js
 *   Staging : mongosh "mongodb://staging-host/meeshy" scripts/migrations/mongodb/012_backfill_attachment_capturedInApp.js
 *   Prod    : ssh root@meeshy.me "docker exec -i meeshy-database mongosh" < scripts/migrations/mongodb/012_backfill_attachment_capturedInApp.js
 */

const db = db.getSiblingDB("meeshy");

print("=== Migration 012 : backfill MessageAttachment.capturedInApp ===\n");

const total = db.MessageAttachment.countDocuments();
const missing = db.MessageAttachment.countDocuments({ capturedInApp: { $exists: false } });
const present = total - missing;

print(`Pièces jointes au total       : ${total}`);
print(`Portant déjà capturedInApp    : ${present}`);
print(`Sans le champ (à backfiller)  : ${missing}`);
print("");

if (missing > 0) {
  const result = db.MessageAttachment.updateMany(
    { capturedInApp: { $exists: false } },
    { $set: { capturedInApp: false } }
  );
  print(`capturedInApp=false posé sur ${result.modifiedCount} pièces jointes`);
} else {
  print("Toutes les pièces jointes portent déjà le champ — rien à faire.");
}

// Contrôle de sortie : la lecture Prisma n'est sûre que si le compte restant
// est ZÉRO. L'afficher explicitement évite de lire « migration terminée » comme
// « migration réussie ».
const stillMissing = db.MessageAttachment.countDocuments({ capturedInApp: { $exists: false } });
print(`\nRestant sans le champ : ${stillMissing} ${stillMissing === 0 ? "(OK)" : "(ÉCHEC — la lecture Prisma échouera sur ces documents)"}`);

print("\n=== Migration 012 terminée ===");
