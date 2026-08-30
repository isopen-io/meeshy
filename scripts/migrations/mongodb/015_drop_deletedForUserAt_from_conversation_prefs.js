/**
 * Migration 015 : retirer `UserConversationPreferences.deletedForUserAt` (#4345)
 *
 * ## Pourquoi ce champ part
 *
 * Son unique écrivain a disparu au cycle #4332, qui a réaligné la corbeille de
 * conversations sur `Participant.deletedForMe` — la colonne que la route
 * canonique écrit réellement. `deletedForUserAt` est resté sélectionné, projeté
 * sur DEUX contrats de fil (`isDeletedForUser` en REST, `deletedForUserAt` sur
 * le canal de synchronisation) et posé à `null` par les valeurs par défaut.
 *
 * Il valait donc `null` pour TOUTE ligne. Ce n'est pas un résidu inoffensif :
 * pour une conversation réellement dans la corbeille, le fil affirmait
 * « pas supprimée ».
 *
 * La capacité qu'il décrivait est servie par deux autres mécanismes, tous deux
 * vivants : le filtre SERVEUR de `GET /conversations`
 * (`Participant.deletedForMe`, `routes/conversations/core-list.ts:140`) et les
 * événements dédiés `conversation:deleted` / `conversation:restored`.
 *
 * ## Ce que cette migration fait, et ne fait pas
 *
 * Prisma ayant perdu le champ, plus aucune lecture ni écriture ne le touche :
 * les documents qui le portent encore sont INERTES. Cette migration ne
 * corrige donc aucun comportement — elle nettoie, pour qu'un futur lecteur de
 * la base ne retrouve pas un nom que le schéma ne déclare plus et n'en déduise
 * une sémantique.
 *
 * Elle est donc SANS RISQUE et IDEMPOTENTE : `$unset` ne retire qu'une clé qui
 * existe encore, et rejouer ne change plus rien.
 *
 * ## Usage
 *
 *   mongosh <uri> --file 015_drop_deletedForUserAt_from_conversation_prefs.js            # SIMULATION
 *   mongosh <uri> --eval 'var APPLIQUER=true' --file 015_…js                              # écriture
 *
 * Sans `APPLIQUER`, rien n'est écrit : le script COMPTE les documents portant
 * encore la clé, et — c'est le point qui mérite d'être mesuré avant de purger —
 * combien la portent avec une valeur NON NULLE. Ce second chiffre doit être
 * ZÉRO. S'il ne l'est pas, la prémisse est fausse quelque part : un écrivain
 * a survécu, ou des lignes anciennes portent un état que personne ne lit plus
 * mais qui a du sens. Dans ce cas, NE PAS appliquer et rouvrir #4345.
 */

const APPLIQUER_ECRITURE = typeof APPLIQUER !== 'undefined' && APPLIQUER === true;

print('=== Migration 015 : retrait de UserConversationPreferences.deletedForUserAt (#4345) ===');
print('');
print(APPLIQUER_ECRITURE ? 'Mode : ÉCRITURE' : 'Mode : SIMULATION (rien ne sera écrit)');
print('');

const collection = db.getCollection('UserConversationPreferences');

const portantLaCle = collection.countDocuments({ deletedForUserAt: { $exists: true } });
const nonNulles = collection.countDocuments({ deletedForUserAt: { $exists: true, $ne: null } });

print(`Documents portant encore la clé          : ${portantLaCle}`);
print(`… dont valeur NON NULLE (doit être zéro) : ${nonNulles}`);
print('');

if (nonNulles > 0) {
  print('⛔ ARRÊT. Des lignes portent une valeur non nulle : la prémisse de #4345');
  print('   (« aucun écrivain, null partout ») est fausse ici. Ne pas purger —');
  print('   rouvrir #4345 avec ce chiffre.');
  print('');
  collection
    .find({ deletedForUserAt: { $exists: true, $ne: null } })
    .limit(10)
    .forEach((doc) => print(`  _id=${doc._id} userId=${doc.userId} deletedForUserAt=${doc.deletedForUserAt}`));
  quit(1);
}

if (!APPLIQUER_ECRITURE) {
  print('Simulation terminée — rien n\'a été écrit. Relancer avec APPLIQUER=true pour purger.');
  print('');
  print('=== Migration 015 terminée (simulation) ===');
} else {
  const resultat = collection.updateMany(
    { deletedForUserAt: { $exists: true } },
    { $unset: { deletedForUserAt: '' } },
  );
  print(`Purge appliquée sur ${resultat.modifiedCount} document(s).`);
  const reste = collection.countDocuments({ deletedForUserAt: { $exists: true } });
  print(`Documents portant encore la clé : ${reste} ${reste === 0 ? '(OK)' : '(INATTENDU)'}`);
  print('');
  print('=== Migration 015 terminée ===');
}
