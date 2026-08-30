/**
 * Migration 013 : la base porte la CLÉ d'un média, jamais son adresse (#4324)
 *
 * ## Ce que cette migration retire
 *
 * Une adresse de média — `https://gate.meeshy.me/api/v1/attachments/file/…` ou
 * `/api/v1/attachments/file/…` — porte trois décisions de DÉPLOIEMENT : l'hôte,
 * le préfixe d'API et sa version. Une donnée qui les porte devient fausse le
 * jour où l'une d'elles change, sans que rien ne le signale : un passage à `v2`
 * casse les médias, et un dump staging → production sert des URL staging.
 *
 * Ce qui identifie un média est sa clé de stockage : `2025/10/<id>/photo.png`.
 * Les trois clients savent poser la route qui la sert — `buildAttachmentUrl`
 * (web), `MeeshyConfig.resolveMediaURL` (iOS), `me.meeshy.sdk.util.resolveMediaUrl`
 * (Android) — et le serveur ne persiste plus que la clé depuis le lot A1.
 *
 * ## Pourquoi elle est SÛRE
 *
 * 514 attachements portent déjà cette forme (migration antérieure, dont
 * `MessageAttachment_backup_urls` garde la trace) : la cible est en production
 * et fonctionne. Cette migration finit ce qui avait été commencé — et A1, livré
 * avant elle, empêche la dette de repousser derrière.
 *
 * ## Usage
 *
 *   mongosh <uri> --file 013_store_media_keys_not_urls.js              # SIMULATION
 *   mongosh <uri> --eval 'var APPLIQUER=true' --file 013_…js           # écriture
 *
 * Sans `APPLIQUER`, rien n'est écrit : le script COMPTE et montre des exemples.
 * Chaque valeur d'origine est sauvegardée dans `MediaUrl_backup_013` avant
 * écriture — une seule fois, la migration étant idempotente.
 */

const APPLIQUER_ECRITURE = typeof APPLIQUER !== 'undefined' && APPLIQUER === true;
const SEGMENT = '/attachments/file/';
const SAUVEGARDE = 'MediaUrl_backup_013';

/** Les champs qui portent l'adresse d'un média servi par NOUS. */
const CIBLES = [
  { collection: 'MessageAttachment', champ: 'fileUrl' },
  { collection: 'MessageAttachment', champ: 'thumbnailUrl' },
  { collection: 'Participant', champ: 'avatar' },
  { collection: 'User', champ: 'avatar' },
  { collection: 'Community', champ: 'avatar' },
];

/**
 * Rend la clé de stockage, ou null quand la valeur n'est pas une adresse de nos
 * fichiers — une URL EXTERNE (`TrackingLink.originalUrl`, une photo distante)
 * est une donnée métier et ne doit jamais être réécrite.
 */
function cleDepuisAdresse(valeur) {
  if (typeof valeur !== 'string' || valeur.length === 0) return null;

  let chemin = valeur;
  if (valeur.indexOf('://') !== -1) {
    const apresSchema = valeur.substring(valeur.indexOf('://') + 3);
    const barre = apresSchema.indexOf('/');
    if (barre === -1) return null;
    chemin = apresSchema.substring(barre);
  }

  const i = chemin.indexOf(SEGMENT);
  if (i === -1) return null;

  const encode = chemin.substring(i + SEGMENT.length);
  if (encode.length === 0) return null;
  try {
    return decodeURIComponent(encode);
  } catch (e) {
    return encode;
  }
}

print('=== Migration 013 : la base porte la clé, pas l\'adresse ===');
print('Base    : ' + db.getName());
print('Mode    : ' + (APPLIQUER_ECRITURE ? 'ÉCRITURE' : 'SIMULATION (aucune écriture)'));
print('');

let totalVus = 0;
let totalReecrits = 0;

CIBLES.forEach(function (cible) {
  const col = db.getCollection(cible.collection);
  const filtre = {};
  filtre[cible.champ] = new RegExp(SEGMENT.replace(/\//g, '\\/'));

  const curseur = col.find(filtre, { _id: 1, [cible.champ]: 1 });
  let vus = 0;
  let reecrits = 0;
  let exemple = null;

  while (curseur.hasNext()) {
    const doc = curseur.next();
    const cle = cleDepuisAdresse(doc[cible.champ]);
    if (cle === null) continue;
    vus++;
    if (exemple === null) exemple = { avant: doc[cible.champ], apres: cle };

    if (APPLIQUER_ECRITURE) {
      db.getCollection(SAUVEGARDE).updateOne(
        { collection: cible.collection, docId: doc._id, champ: cible.champ },
        { $setOnInsert: { valeurOrigine: doc[cible.champ], migreLe: new Date() } },
        { upsert: true }
      );
      const maj = {};
      maj[cible.champ] = cle;
      col.updateOne({ _id: doc._id }, { $set: maj });
      reecrits++;
    }
  }

  totalVus += vus;
  totalReecrits += reecrits;
  print('  ' + cible.collection + '.' + cible.champ + ' : ' + vus + ' à réécrire' +
        (APPLIQUER_ECRITURE ? ', ' + reecrits + ' réécrits' : ''));
  if (exemple) {
    print('      avant : ' + exemple.avant);
    print('      après : ' + exemple.apres);
  }
});

print('');
print('Total vus      : ' + totalVus);
print('Total réécrits : ' + totalReecrits);
if (!APPLIQUER_ECRITURE) {
  print('');
  print('SIMULATION — relancer avec  --eval \'var APPLIQUER=true\'  pour écrire.');
}
