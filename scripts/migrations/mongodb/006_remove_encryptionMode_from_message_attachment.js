/**
 * Migration 006 — RETIRÉE (#12949, 2026-10-25). Elle n'écrit plus rien.
 *
 * Elle effaçait `encryptionMode` de chaque `Message` et `MessageAttachment`,
 * au motif que le mode ne vivait qu'au niveau de la conversation. Ce n'est plus
 * vrai : `Message.encryptionMode` (`e2ee`) est la marque qui garde un message
 * chiffré de bout en bout contre l'édition, le transfert et la traduction en
 * clair (#12881). La rejouer retirerait cette marque à tout l'historique
 * chiffré. Une conversation chiffrée de bout en bout ne repasse jamais en clair,
 * par aucun chemin, migrations comprises (garde
 * `services/gateway/src/__tests__/unit/encryption/e2ee-irreversible-write-guard.test.ts`).
 *
 * Ce fichier ne fait plus que compter, en lecture seule.
 */

print("=== Migration 006 : RETIRÉE (#12949), lecture seule ===");
print("Database: " + db.getName());
[
  ["MessageAttachment", db.MessageAttachment],
  ["Message", db.Message],
  ["Conversation", db.Conversation],
].forEach(([name, collection]) => {
  print(`  ${name} avec encryptionMode : ${collection.countDocuments({ encryptionMode: { $exists: true } })}`);
});
print("Aucune écriture.");
