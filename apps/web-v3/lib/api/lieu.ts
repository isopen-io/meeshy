import { chaine, nombre, objet } from './lecture';

/**
 * UN LIEU PARTAGÉ (#5061) — tel que la passerelle le SERT, hissé en champ
 * `location` de premier niveau par `sharedPlaceFromMetadata`
 * (`services/location/sharedPlace.ts`), site UNIQUE des DEUX transports REST
 * et socket (§ 2.1/§ 2.2 de la spécification). Un lieu se lit comme une
 * PLACE — nom, adresse — jamais comme deux nombres bruts : c'est la règle du
 * critère de fin, et la raison pour laquelle ce module existe à côté de
 * `lib/api/formes.ts` plutôt que dedans — un lieu n'est PAS une pièce
 * jointe : il n'a ni fichier, ni MIME, ni `attachments[]` (il voyage dans
 * `Message.location`, jamais dans `Message.attachments`).
 */
export type Lieu = {
  readonly latitude: number;
  readonly longitude: number;
  readonly nom: string | null;
  readonly adresse: string | null;
};

/**
 * `brut.location` D'ABORD — la forme HISSÉE que sert `GET .../messages` ET
 * `message:new` (§ 2.2). `brut.metadata.location` EN REPLI — la même
 * tolérance que `sharedPlaceFromMetadata` (`sharedPlace.ts:74-82`) : un
 * message rattrapé par `GET /sync` n'est PAS hissé (§ 2.2, « aucun hoist » —
 * aucun diff serveur, la v3 lit ce que le contrat expose déjà).
 */
export const lieuDeMessage = (brut: Readonly<Record<string, unknown>>): Lieu | null => {
  const source = objet(brut.location) ?? objet(objet(brut.metadata)?.location);
  if (source === null) return null;
  const latitude = nombre(source.latitude);
  const longitude = nombre(source.longitude);
  if (latitude === null || longitude === null) return null;
  return { latitude, longitude, nom: chaine(source.name), adresse: chaine(source.address) };
};

/**
 * `geo:` — LA SEULE adresse qui n'engage AUCUNE requête (§ 12.6, légèreté :
 * aucune tuile de carte ne se télécharge à la lecture d'un lieu). Un
 * navigateur ou système sans gestionnaire `geo:` ignore le lien sans y ouvrir
 * un onglet vide — c'est `adresseCarte` ci-dessous qui porte le repli.
 */
export const adresseGeo = (lieu: Pick<Lieu, 'latitude' | 'longitude'>): string => `geo:${lieu.latitude},${lieu.longitude}`;

/** Le SEUL nombre servi par `geo:` — utile pour relire un lien déjà posé (`bullesDuDocument`). */
export const lieuDeGeoUri = (uri: string): { readonly latitude: number; readonly longitude: number } | null => {
  const correspond = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(uri);
  if (correspond === null) return null;
  const latitude = Number(correspond[1]);
  const longitude = Number(correspond[2]);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
};

/**
 * LE REPLI — une carte ouverte dans un ONGLET (`target="_blank" rel="noopener"`),
 * pour qui n'a aucun gestionnaire `geo:` (la quasi-totalité des ordinateurs de
 * bureau). AUCUNE tuile ne se télécharge à la lecture du fil : c'est un lien
 * texte, jamais une `<img>`.
 */
export const adresseCarte = (lieu: Pick<Lieu, 'latitude' | 'longitude'>): string =>
  `https://www.openstreetmap.org/?mlat=${lieu.latitude}&mlon=${lieu.longitude}#map=16/${lieu.latitude}/${lieu.longitude}`;
