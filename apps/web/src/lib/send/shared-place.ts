/**
 * LE LIEU PARTAGÉ (#7280) — ce que le composeur attache à un message quand on
 * touche « Position ».
 *
 * ## LA FORME EST CELLE DE LA PASSERELLE, PAS UNE INVENTION DU WEB
 *
 * `services/gateway/src/services/location/sharedPlace.ts` est la LOI :
 * `parseSharedPlace` rejette tout objet sans coordonnées valides
 * (`latitude ∈ [-90, 90]`, `longitude ∈ [-180, 180]`), tronque les champs
 * texte à 200 caractères, et le serveur SEUL écrit le résultat dans
 * `Message.metadata.location`. Le champ voyage DÉDIÉ (`location` sur le corps
 * du POST), jamais fusionné dans un `metadata` brut — c'est ce que
 * `MessageRequest.location` (`packages/shared/types/messaging.ts:171-175`)
 * documente, et la raison pour laquelle `packages/shared` n'en donne AUCUN
 * type : « les bornes vivraient alors à deux endroits ».
 *
 * Ce module ne recopie donc pas la loi, il produit ce qu'elle accepte : les
 * deux bornes, et rien de plus. `name`/`address`/`category` ne sont pas
 * servis par ce lot — le web n'a pas de géocodeur inverse, et INVENTER un nom
 * serait pire qu'aucun : iOS les tient de son `LocationPickerView`, qui reste
 * à porter (§ « ce qui reste » de la PR).
 *
 * ## POURQUOI UN CONSTRUCTEUR ET PAS UN LITTÉRAL
 *
 * `GeolocationCoordinates` rend des `number` qui peuvent être `NaN` sur un
 * appareil sans correctif — et `NaN` échoue toute comparaison, donc le passe
 * par la porte d'un `typeof === 'number'`. Un lieu invalide attaché au
 * composeur partirait, serait REJETÉ en silence par `parseSharedPlace`, et
 * l'utilisateur verrait une puce « LIEU » sur un message qui n'en porte
 * aucun : exactement le contrôle qui ment que la loi 4 interdit.
 */
export type SharedPlace = {
  readonly latitude: number;
  readonly longitude: number;
};

const inRange = (value: number, bound: number): boolean => value >= -bound && value <= bound;

/** `null` ⇒ ces coordonnées ne sont pas un lieu : ne rien attacher. Miroir
 * exact de `validCoordinates` (`sharedPlace.ts:271-277` côté passerelle). */
export function sharedPlaceOf(coordinates: {
  readonly latitude: number;
  readonly longitude: number;
}): SharedPlace | null {
  const { latitude, longitude } = coordinates;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (!inRange(latitude, 90) || !inRange(longitude, 180)) return null;
  return { latitude, longitude };
}
