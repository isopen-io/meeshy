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

/**
 * Hisse `metadata.location` en champ top-level `location` sur UNE entité
 * (message, post ou commentaire). Miroir exact du hoist `postReplyTo` —
 * source UNIQUE réutilisée par tous les payloads REST/socket, pour éviter
 * qu'une surface de lecture oublie le hoist qu'une autre applique déjà (voir
 * `hoistLocationDeep` ci-dessous : c'est exactement ce qui manquait à
 * l'aperçu des commentaires embarqué dans un post). No-op si absent/invalide.
 */
export function hoistLocationOnto<T extends Record<string, unknown>>(entity: T): T {
  const place = sharedPlaceFromMetadata(entity?.metadata);
  if (place) {
    return { ...entity, location: place } as T;
  }
  return entity;
}

/**
 * Hisse la position d'une entité ET de ses relations embarquées : chaque item
 * de `comments` (l'aperçu des 3 premiers commentaires attaché à tout `Post`
 * via `postInclude`/`storyPostInclude` — voir `postIncludes.ts`) et le post
 * SOURCE `repostOf`.
 *
 * Sans le niveau `comments`, un commentaire géolocalisé restitue sa position
 * dans la liste complète (`GET /posts/:postId/comments`) mais pas dans
 * l'aperçu embarqué sur le post. Sans le niveau `repostOf`, un repost perd la
 * position de l'original (`repostOf.location` n'existe jamais côté client —
 * reste ouvert du lot 2, clos 2026-07-30). La position semble alors
 * disparaître selon la surface consultée. `hoistLocationOnto` seul ne couvre
 * QUE le post lui-même ; utiliser cette fonction partout où un `Post` complet
 * est renvoyé à un client.
 */
export function hoistLocationDeep<T extends Record<string, unknown>>(entity: T): T {
  let hoisted: T = hoistLocationOnto(entity);

  const repostOf = (hoisted as { repostOf?: unknown }).repostOf;
  if (repostOf && typeof repostOf === 'object' && !Array.isArray(repostOf)) {
    hoisted = { ...hoisted, repostOf: hoistLocationOnto(repostOf as Record<string, unknown>) } as T;
  }

  const comments = (hoisted as { comments?: unknown }).comments;
  if (!Array.isArray(comments) || comments.length === 0) {
    return hoisted;
  }
  const hoistedComments = comments.map((comment) =>
    comment && typeof comment === 'object' && !Array.isArray(comment)
      ? hoistLocationOnto(comment as Record<string, unknown>)
      : comment
  );
  return { ...hoisted, comments: hoistedComments } as T;
}
