/**
 * Lieu partagé — validation d'entrée et extraction depuis `metadata`.
 *
 * Le client n'envoie JAMAIS de `metadata` brut : cette enveloppe porte des
 * champs à autorité serveur (postReplyTo, trackingLinks, résumés d'appel)
 * qu'un passthrough permettrait de forger. Les requêtes portent un champ
 * `location` dédié, que `parseSharedPlace` valide et que le serveur seul
 * écrit dans `metadata.location`.
 *
 * Chiffrement : décision de conception assumée (voir
 * docs/superpowers/specs/2026-07-29-partage-position-design.md, table
 * « Décisions ») — la position voyage et se stocke EN CLAIR dans
 * `metadata.location`, au même titre que les autres blocs `metadata`
 * existants (`postReplyTo`, `trackingLinks`). Une position partagée en
 * conversation E2EE reste donc lisible par le serveur ; ce n'est pas un
 * oubli mais un choix explicite, à ne pas « corriger » silencieusement.
 *
 * Miroir de `postReplySnapshot.ts` pour la relecture.
 */

export interface SharedPlace {
  latitude: number;
  longitude: number;
  name: string | null;
  address: string | null;
  category: string | null;
}

const MAX_TEXT_LENGTH = 200;

function boundedText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, MAX_TEXT_LENGTH);
}

/** `NaN` échoue toute comparaison, ce qui rejette bien les non-nombres. */
function validCoordinates(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === 'number' && typeof longitude === 'number' &&
    latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180
  );
}

/**
 * Valide une entrée CLIENT (le champ `location` d'une requête de message,
 * de post ou de commentaire). Rejette tout objet sans coordonnées valides ;
 * tronque les champs texte trop longs plutôt que de rejeter le lieu entier.
 */
export function parseSharedPlace(input: unknown): SharedPlace | null {
  if (input === null || input === undefined || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  const obj = input as Record<string, unknown>;
  if (!validCoordinates(obj['latitude'], obj['longitude'])) return null;

  return {
    latitude: obj['latitude'] as number,
    longitude: obj['longitude'] as number,
    name: boundedText(obj['name']),
    address: boundedText(obj['address']),
    category: boundedText(obj['category']),
  };
}

/**
 * Relit `metadata.location` tel que le serveur l'a écrit (Prisma `Json?`,
 * forme inconnue au type). Retourne `null` si absent ou malformé.
 */
export function sharedPlaceFromMetadata(metadata: unknown): SharedPlace | null {
  if (metadata === null || metadata === undefined || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const obj = metadata as Record<string, unknown>;
  if (!('location' in obj)) return null;
  return parseSharedPlace(obj['location']);
}
