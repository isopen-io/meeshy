/**
 * Migration 017 : un avatar du magasin STATIQUE dit d'où il vient (#4625)
 *
 * ## Ce que la 013 n'a pas pu faire
 *
 * La 013 a retiré l'hôte et le préfixe d'API des médias servis par la
 * PASSERELLE — reconnaissables à leur segment `/attachments/file/`. Les avatars
 * du magasin STATIQUE (`https://static.<domaine>/u/i/YYYY/MM/…`) ne portent pas
 * ce segment : elle ne les a donc pas vus, et c'est heureux. Réduits à leur clé
 * nue, ils seraient partis se chercher sur la passerelle, où ils ne sont pas —
 * **ils ne s'affichaient que parce qu'ils portaient encore leur hôte.**
 *
 * ## Ce que celle-ci écrit
 *
 *   https://static.meeshy.me/u/i/2025/11/avatar_1763143871947_o0.jpg
 *   →  static:u/i/2025/11/avatar_1763143871947_o0.jpg
 *
 * Le schéma `static:` déclare le magasin DANS la donnée. Il le fallait parce
 * qu'aucune FORME de clé ne le dit : `u/i/2025/11/a.jpg` (statique) et
 * `avatars/user/<id>.jpg` (passerelle) se ressemblent trop pour qu'un
 * consommateur les sépare à vue.
 *
 * Site de la règle : `packages/shared/api/media-ref.ts`
 * (`STATIC_STORE_SCHEME`, `staticKeyFromAbsoluteUrl`). Ses miroirs :
 * `MeeshyConfig.staticOrigin` (iOS), `staticOriginOf` (Android),
 * `buildAttachmentUrl` (web).
 *
 * ## ⚠ CETTE MIGRATION EST GATÉE PAR UNE LIVRAISON, PAS PAR DU CODE
 *
 * Une application iOS ou Android **déjà installée** ne sait pas lire `static:`
 * — elle le prendrait pour une clé de passerelle et afficherait un avatar
 * cassé. Le correctif client est `6e8b004a9f` :
 *
 *   * sur **staging**, jouable dès que les builds portant ce commit y sont ;
 *   * sur **production**, seulement après que la version mobile qui le porte
 *     est SORTIE et largement installée.
 *
 * L'ordre est celui du volet A de #4324 — les lecteurs d'abord — et il est
 * l'inverse de l'intuition.
 *
 * ## Usage
 *
 *   mongosh <uri> --file 017_static_avatars_carry_their_store.js          # SIMULATION
 *   mongosh <uri> --eval 'var APPLIQUER=true' --file 017_…js              # écriture
 *
 * Sans `APPLIQUER`, rien n'est écrit : le script COMPTE et montre des exemples.
 * Chaque valeur d'origine part dans `MediaUrl_backup_017` avant écriture — une
 * seule fois, la migration étant idempotente (une valeur déjà préfixée
 * `static:` n'est plus une URL absolue et n'est donc jamais revue).
 */

const APPLIQUER_ECRITURE = typeof APPLIQUER !== 'undefined' && APPLIQUER === true;
const SCHEMA = 'static:';
const SAUVEGARDE = 'MediaUrl_backup_017';

/** Les champs qui portent l'avatar d'une identité. */
const CIBLES = [
  { collection: 'Participant', champ: 'avatar' },
  { collection: 'User', champ: 'avatar' },
  { collection: 'Community', champ: 'avatar' },
];

/**
 * Rend la clé du magasin statique, ou null quand la valeur n'en vient pas.
 *
 * L'hôte est reconnu à son PREMIER label (`static.`), jamais à un domaine écrit
 * ici : c'est précisément le littéral d'hôte que cette migration retire de la
 * donnée, et il n'a pas plus sa place dans le code qui l'en retire. Une URL
 * EXTERNE — un avatar Google, Gravatar, une photo distante — est une donnée
 * métier et ne doit jamais être réécrite.
 *
 * Miroir de `staticKeyFromAbsoluteUrl` (`packages/shared/api/media-ref.ts`).
 */
function cleStatiqueDepuisAdresse(valeur) {
  if (typeof valeur !== 'string') return null;
  const i = valeur.indexOf('://');
  if (i === -1) return null;
  const apresSchema = valeur.substring(i + 3);
  const barre = apresSchema.indexOf('/');
  if (barre === -1) return null;

  const hote = apresSchema.substring(0, barre).split(':')[0];
  if (hote.indexOf('static.') !== 0) return null;

  let chemin = apresSchema.substring(barre + 1);
  const interro = chemin.indexOf('?');
  if (interro !== -1) chemin = chemin.substring(0, interro);
  if (chemin.length === 0) return null;

  try {
    return decodeURIComponent(chemin);
  } catch (e) {
    return chemin;
  }
}

print('=== Migration 017 : un avatar statique dit son magasin (#4625) ===');
print('Base    : ' + db.getName());
print('Mode    : ' + (APPLIQUER_ECRITURE ? 'ÉCRITURE' : 'SIMULATION (aucune écriture)'));
print('');

let totalVus = 0;
let totalReecrits = 0;
let totalExternes = 0;

CIBLES.forEach(function (cible) {
  const col = db.getCollection(cible.collection);
  const filtre = {};
  filtre[cible.champ] = /:\/\//;

  const curseur = col.find(filtre, { _id: 1, [cible.champ]: 1 });
  let vus = 0;
  let reecrits = 0;
  let externes = 0;
  let exemple = null;
  let exempleExterne = null;

  while (curseur.hasNext()) {
    const doc = curseur.next();
    const cle = cleStatiqueDepuisAdresse(doc[cible.champ]);
    if (cle === null) {
      externes++;
      if (exempleExterne === null) exempleExterne = doc[cible.champ];
      continue;
    }
    vus++;
    const apres = SCHEMA + cle;
    if (exemple === null) exemple = { avant: doc[cible.champ], apres: apres };

    if (APPLIQUER_ECRITURE) {
      db.getCollection(SAUVEGARDE).updateOne(
        { collection: cible.collection, docId: doc._id, champ: cible.champ },
        { $setOnInsert: { valeurOrigine: doc[cible.champ], migreLe: new Date() } },
        { upsert: true }
      );
      const maj = {};
      maj[cible.champ] = apres;
      col.updateOne({ _id: doc._id }, { $set: maj });
      reecrits++;
    }
  }

  totalVus += vus;
  totalReecrits += reecrits;
  totalExternes += externes;
  print('  ' + cible.collection + '.' + cible.champ + ' : ' + vus + ' à réécrire, ' +
        externes + ' adresses EXTERNES laissées intactes' +
        (APPLIQUER_ECRITURE ? ', ' + reecrits + ' réécrits' : ''));
  if (exemple) {
    print('      avant : ' + exemple.avant);
    print('      après : ' + exemple.apres);
  }
  if (exempleExterne) {
    print('      externe (intacte) : ' + exempleExterne);
  }
});

print('');
print('Total à réécrire        : ' + totalVus);
print('Total réécrits          : ' + totalReecrits);
print('Total externes intacts  : ' + totalExternes);
if (!APPLIQUER_ECRITURE) {
  print('');
  print('SIMULATION — relancer avec  --eval \'var APPLIQUER=true\'  pour écrire.');
  print('⚠ Ne l\'appliquer qu\'où les clients savent lire `static:` (commit 6e8b004a9f).');
}
