/**
 * Migration 014 : fusionner les cinq clés de consentement du blob JSON dans
 * les quatre colonnes `User.*ConsentAt` (#4348, suite de #4180)
 *
 * ## Le défaut que cette migration ferme
 *
 * `#4180` a fait de `User.{dataProcessingConsentAt, voiceDataConsentAt,
 * voiceProfileConsentAt, voiceCloningEnabledAt}` les SEULES colonnes que
 * `ConsentValidationService.getConsentStatus` lit, et a fait rejeter par
 * `ApplicationPreferenceSchema` (`z.never()`) toute ÉCRITURE future des cinq
 * clés legacy dans `UserPreferences.application` (`dataProcessingConsentAt`,
 * `voiceDataConsentAt`, `voiceProfileConsentAt`, `voiceCloningConsentAt`,
 * `voiceCloningEnabledAt`). Mais les valeurs DÉJÀ écrites dans ce blob, par
 * l'ancien chemin (`PATCH /me/preferences/application` avant #4180), restent
 * dans la base — inertes du point de vue du serveur depuis #4180, et un
 * compte qui n'avait consenti QUE via le blob se retrouve non consentant.
 *
 * ## La correspondance : CINQ clés, QUATRE colonnes
 *
 * `voiceCloningConsentAt` (blob) n'a jamais eu de colonne `User` miroir — le
 * consentement de clonage n'a qu'UNE colonne, `voiceCloningEnabledAt`, que le
 * blob duplique sous DEUX noms distincts (`voiceCloningConsentAt` ET
 * `voiceCloningEnabledAt`, cf. le commentaire de
 * `packages/shared/types/preferences/application.ts`). Les deux fusionnent
 * donc vers la MÊME colonne.
 *
 *   application.dataProcessingConsentAt  → User.dataProcessingConsentAt
 *   application.voiceDataConsentAt       → User.voiceDataConsentAt
 *   application.voiceProfileConsentAt    → User.voiceProfileConsentAt
 *   application.voiceCloningConsentAt    → User.voiceCloningEnabledAt
 *   application.voiceCloningEnabledAt    → User.voiceCloningEnabledAt
 *
 * ## `max(colonne, blob)` — jamais un écrasement
 *
 * Un compte qui avait DÉJÀ consenti via la colonne (donc via
 * `POST /voice/profile/consent`, seul écrivain serveur) ne doit JAMAIS
 * repartir non consentant, et sa date ne doit jamais reculer. `$max` de
 * MongoDB pose la valeur la PLUS GRANDE des deux — colonne existante et
 * valeur du blob — sans jamais l'ABAISSER. L'ordre BSON range `null` avant
 * tout `Date` : une colonne `null` reçoit donc systématiquement la date du
 * blob dès que le blob en porte une, exactement le comportement recherché.
 *
 * ## Idempotente
 *
 * Rejouer cette migration après une première application ne change plus
 * rien : `$max` contre une colonne déjà à sa valeur maximale est un no-op,
 * et la purge (`$unset`) ne retire que des clés qui existent encore.
 *
 * ## Usage
 *
 *   mongosh <uri> --file 014_merge_consent_blob_into_user_columns.js              # SIMULATION
 *   mongosh <uri> --eval 'var APPLIQUER=true' --file 014_…js                       # écriture
 *
 * Sans `APPLIQUER`, rien n'est écrit : le script MESURE l'ampleur (combien de
 * comptes portent encore une des cinq clés dans le blob avec la colonne
 * `User` correspondante à `null`) et affiche des exemples. C'est cette
 * mesure qu'il faut lire AVANT de lancer l'écriture — voir la note ci-dessous,
 * qui explique pourquoi aucun chiffre n'est figé dans ce commentaire.
 *
 * Chaque document `UserPreferences.application` touché par la PURGE est
 * sauvegardé intégralement (les cinq clés + `userId`) dans
 * `ApplicationConsentBlob_backup_014` avant que `$unset` ne les retire — une
 * seule fois, la migration étant idempotente.
 *
 * ## Pourquoi aucun chiffre n'est figé ici (contrairement à la migration 013)
 *
 * La migration 013 cite « 514 attachements » parce que son auteur avait un
 * accès direct à la base au moment de l'écrire. Cette migration-ci a été
 * écrite depuis un poste SANS accès réseau à MongoDB (dev/staging/prod) —
 * mesuré : `docker ps` ne joint aucun daemon, aucun `mongod` local n'écoute
 * sur `27017`. Écrire un chiffre inventé ici serait plus trompeur que n'en
 * écrire aucun. Le script MESURE donc lui-même, à CHAQUE exécution, avant
 * d'écrire quoi que ce soit (mode SIMULATION par défaut) — c'est cette
 * mesure, produite par l'opérateur qui le lance, qui fait foi.
 */

const db = db.getSiblingDB('meeshy');

const APPLIQUER_ECRITURE = typeof APPLIQUER !== 'undefined' && APPLIQUER === true;
const SAUVEGARDE = 'ApplicationConsentBlob_backup_014';

/** Les cinq clés du blob, dans le MÊME ordre que `LEGACY_APPLICATION_CONSENT_KEYS`
 * (`packages/shared/types/preferences/application.ts`) — recopiées ici en
 * dur : ce script mongosh ne peut pas importer un module TypeScript. */
const CLES_BLOB = [
  'dataProcessingConsentAt',
  'voiceDataConsentAt',
  'voiceProfileConsentAt',
  'voiceCloningConsentAt',
  'voiceCloningEnabledAt',
];

/** Colonne `User` que chaque clé du blob alimente — voir § correspondance. */
const COLONNE_CIBLE = {
  dataProcessingConsentAt: 'dataProcessingConsentAt',
  voiceDataConsentAt: 'voiceDataConsentAt',
  voiceProfileConsentAt: 'voiceProfileConsentAt',
  voiceCloningConsentAt: 'voiceCloningEnabledAt',
  voiceCloningEnabledAt: 'voiceCloningEnabledAt',
};

/**
 * Rend une `Date` BSON, ou `null` si la valeur n'est pas une date lisible.
 *
 * CONVERTIT au lieu d'ACCEPTER, et c'est le coeur du script : le blob
 * `UserPreferences.application` est une colonne `Json?`, donc MongoDB y stocke
 * une **chaîne ISO**, jamais une `Date` — les cinq clés étaient déclarées
 * `z.iso.datetime({ offset: true })` avant #4180, ce qui ne laisse aucun doute
 * sur leur forme en base.
 *
 * La première écriture de ce script testait `typeof valeur.getTime ===
 * 'function'`, vrai d'une `Date` et faux d'une chaîne. Conséquence mesurée à
 * la revue : la mesure affichait 0, la fusion ne construisait rien, `$max` ne
 * tournait jamais — et la PURGE, gardée par un `!== undefined` qui est vrai
 * d'une chaîne, effaçait les cinq clés quand même. Le script aurait DÉTRUIT
 * exactement les consentements qu'il existe pour sauver, en imprimant qu'il
 * n'avait rien fait.
 *
 * Et convertir n'est pas facultatif : `$max` comparerait sinon une String BSON
 * à une Date BSON. Une String trie AVANT une Date, donc une colonne `null`
 * recevrait une chaîne — que Prisma refuse ensuite de lire sur un champ
 * `DateTime`. Accepter la chaîne sans la convertir déplace le défaut d'un
 * cran, il ne le corrige pas.
 */
function versDate(valeur) {
  if (valeur === null || valeur === undefined) return null;
  if (valeur instanceof Date) return isNaN(valeur.getTime()) ? null : valeur;
  if (typeof valeur.getTime === 'function') {
    return isNaN(valeur.getTime()) ? null : valeur;
  }
  if (typeof valeur === 'string') {
    const d = new Date(valeur);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Le prédicat DÉRIVE de la conversion — les deux ne peuvent pas diverger. */
function estDateValide(valeur) {
  return versDate(valeur) !== null;
}

print('=== Migration 014 : fusion blob → colonnes User (consentements, #4348) ===\n');
print(APPLIQUER_ECRITURE ? 'Mode : ÉCRITURE (APPLIQUER=true)\n' : 'Mode : SIMULATION (rien ne sera écrit)\n');

// ─── 1) MESURE — l'ampleur AVANT tout geste d'écriture ─────────────────────
//
// Un SEUL passage construit `candidats` — chaque entrée résolue vers son
// `User` réel — que la fusion et la purge RÉUTILISENT ensuite telles
// quelles. Une `UserPreferences` ORPHELINE (aucun `User` avec ce `_id`, une
// anomalie hors périmètre de cette migration) n'entre JAMAIS dans
// `candidats` : ni fusionnée (rien à fusionner DANS), ni purgée (purger le
// blob d'un compte qui n'existe pas ne protège personne et sort du récit
// « max(colonne, blob) » que documente ce fichier).

const prefsAvecUneCle = db.user_preferences.find({
  $or: CLES_BLOB.map((cle) => ({ [`application.${cle}`]: { $exists: true, $ne: null } })),
});

const candidats = [];
let comptesConcernes = 0;
let comptesColonneNulleParClé = {};
CLES_BLOB.forEach((cle) => { comptesColonneNulleParClé[cle] = 0; });
const exemples = [];

prefsAvecUneCle.forEach((pref) => {
  const application = pref.application || {};
  const userId = pref.userId;
  const user = db.User.findOne(
    { _id: userId },
    { dataProcessingConsentAt: 1, voiceDataConsentAt: 1, voiceProfileConsentAt: 1, voiceCloningEnabledAt: 1 }
  );
  if (!user) return; // UserPreferences orpheline — hors périmètre de cette migration

  candidats.push({ prefId: pref._id, userId: userId, application: application });

  let concerne = false;
  CLES_BLOB.forEach((cle) => {
    if (!estDateValide(application[cle])) return;
    const colonne = COLONNE_CIBLE[cle];
    if (user[colonne] === null || user[colonne] === undefined) {
      comptesColonneNulleParClé[cle] += 1;
      concerne = true;
    }
  });

  if (concerne) {
    comptesConcernes += 1;
    if (exemples.length < 10) {
      exemples.push({ userId: String(userId), application });
    }
  }
});

print(`Comptes portant au moins une clé blob dont la colonne User est NULL : ${comptesConcernes}\n`);
print('Détail par clé (colonne User nulle alors que le blob porte une date) :');
CLES_BLOB.forEach((cle) => {
  print(`  ${cle} → User.${COLONNE_CIBLE[cle]} : ${comptesColonneNulleParClé[cle]}`);
});
if (exemples.length > 0) {
  print('\nExemples (jusqu\'à 10) :');
  exemples.forEach((ex) => print(`  userId=${ex.userId} application=${JSON.stringify(ex.application)}`));
}
print('');

if (!APPLIQUER_ECRITURE) {
  print('Simulation terminée — rien n\'a été écrit. Relancer avec APPLIQUER=true pour appliquer.');
  print('\n=== Migration 014 terminée (simulation) ===');
  quit();
}

if (candidats.length === 0) {
  print('Aucun compte concerné — rien à fusionner, rien à purger.');
  print('\n=== Migration 014 terminée ===');
  quit();
}

// ─── 2) FUSION — $max, jamais un écrasement (voir doc-comment) ─────────────
//
// Tourne sur TOUS les `candidats`, pas seulement ceux dont une colonne était
// NULL au moment de la mesure : `$max` est un no-op sûr sur une colonne déjà
// à sa valeur maximale, et une base a pu changer entre la mesure et
// l'écriture (une autre requête, un rejeu).

let fusions = 0;
candidats.forEach((candidat) => {
  const maj = {};
  CLES_BLOB.forEach((cle) => {
    const date = versDate(candidat.application[cle]);
    if (date === null) return;
    const colonne = COLONNE_CIBLE[cle];
    // DEUX clés du blob visent la MÊME colonne (`voiceCloningConsentAt` et
    // `voiceCloningEnabledAt` → `voiceCloningEnabledAt`). Sans ce `max` local,
    // la seconde écrasait la première dans l'objet `maj` avant même que `$max`
    // ne voie quoi que ce soit : si la première portait la date la plus
    // RÉCENTE, elle était silencieusement perdue — ce que le doc-comment de ce
    // fichier interdit en toutes lettres (« sa date ne doit jamais reculer »).
    const dejaPose = maj[colonne];
    maj[colonne] = dejaPose && dejaPose > date ? dejaPose : date;
  });

  if (Object.keys(maj).length === 0) return;

  const resultat = db.User.updateOne({ _id: candidat.userId }, { $max: maj });
  if (resultat.matchedCount > 0) fusions += 1;
});

print(`Fusion $max appliquée sur ${fusions} compte(s).`);

// ─── 3) SAUVEGARDE puis PURGE des cinq clés du blob ─────────────────────────

let sauvegardes = 0;
let purges = 0;
candidats.forEach((candidat) => {
  const application = candidat.application;

  const aPurger = {};
  CLES_BLOB.forEach((cle) => {
    // MÊME prédicat que la fusion, et c'est une règle, pas une commodité :
    // **toute valeur que la fusion décline est une valeur que la purge doit
    // laisser en place.** Deux gardes différentes sur le même champ, c'est la
    // porte ouverte à effacer ce qu'on n'a pas su reprendre — le défaut exact
    // que la revue de ce lot a trouvé (purge sur `!== undefined`, fusion sur
    // un prédicat plus étroit).
    if (estDateValide(application[cle])) aPurger[`application.${cle}`] = '';
  });
  if (Object.keys(aPurger).length === 0) return;

  // Sauvegarde AVANT purge — idempotente via upsert sur `userId` : un rejeu
  // ne duplique pas la ligne de sauvegarde, il la laisse telle quelle (elle
  // porte l'état d'AVANT la toute première purge).
  const dejaSauvegarde = db[SAUVEGARDE].findOne({ userId: candidat.userId });
  if (!dejaSauvegarde) {
    const original = {};
    CLES_BLOB.forEach((cle) => { if (application[cle] !== undefined) original[cle] = application[cle]; });
    db[SAUVEGARDE].insertOne({ userId: candidat.userId, application: original, backedUpAt: new Date() });
    sauvegardes += 1;
  }

  db.user_preferences.updateOne({ _id: candidat.prefId }, { $unset: aPurger });
  purges += 1;
});

print(`Sauvegarde écrite pour ${sauvegardes} compte(s) dans ${SAUVEGARDE}.`);
print(`Purge appliquée sur ${purges} document(s) UserPreferences.`);

// ─── 4) CONTRÔLE DE SORTIE ──────────────────────────────────────────────────

const restant = db.user_preferences.countDocuments({
  $or: CLES_BLOB.map((cle) => ({ [`application.${cle}`]: { $exists: true } })),
});
print(`\nDocuments UserPreferences portant encore l'une des cinq clés : ${restant} ${restant === 0 ? '(OK)' : '(à réexaminer)'}`);

print('\n=== Migration 014 terminée ===');
