/**
 * Lieu partagé — validation d'entrée et extraction depuis `metadata`.
 *
 * Le client n'envoie JAMAIS de `metadata` brut : cette enveloppe porte des
 * champs à autorité serveur (postReplyTo, trackingLinks, résumés d'appel)
 * qu'un passthrough permettrait de forger. Les requêtes portent un champ
 * `location` dédié, que `parseSharedPlace` valide et que le serveur seul
 * écrit dans `metadata.location`.
 *
 * Chiffrement : hors bout en bout (conversation en clair, `server`, `hybrid`),
 * la position se stocke EN CLAIR dans `metadata.location`, au même titre que
 * `postReplyTo` et `trackingLinks` — le serveur y lit déjà le texte.
 *
 * En bout en bout, plus jamais (#12526). Le choix du 2026-07-29 (spec
 * docs/superpowers/specs/2026-07-29-partage-position-design.md, table
 * « Décisions ») qui la rangeait en clair même là est RÉVOQUÉ par la directive
 * du 2026-10-03 (#9224, #9229) : avec E2EE, le serveur ne voit jamais le
 * clair, et un lieu est un contenu au même titre qu'un texte.
 * `admitSharedPlace` est la loi : en `e2ee`, le lieu en clair est RETENU —
 * ni écrit, ni diffusé — pendant que le message chiffré qui l'accompagne
 * passe. Rejeter l'envoi entier casserait les clients iOS antérieurs qui
 * joignent encore le lieu en clair à côté du chiffré (rétrocompatibilité,
 * #9223) ; le retrait se journalise sous `E2EE_PLAINTEXT_LOCATION_WITHHELD`
 * pour mesurer cet usage jusqu'à zéro. Les clients actuels ne l'envoient
 * plus : iOS retire la tuile « Lieu » et refuse l'envoi avant tout octet
 * (`EndToEndSendGate.carriesUnsealableContent`).
 *
 * Miroir de `postReplySnapshot.ts` pour la relecture.
 */
import { hoistStickerOnto } from '../stickers/messageSticker';

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

/** Code stable du retrait d'un lieu en clair dans une conversation e2ee (#12526). */
export const E2EE_PLAINTEXT_LOCATION_WITHHELD = 'E2EE_PLAINTEXT_LOCATION_WITHHELD';

export type SharedPlaceAdmission = {
  /** Le lieu à écrire, ou `null` : absent, malformé, ou retenu. */
  readonly place: SharedPlace | null;
  /** Un lieu VALIDE a été retenu parce que la conversation est chiffrée de bout en bout. */
  readonly withheld: boolean;
};

/**
 * Le lieu déclaré par le client, admis au régime de sa conversation. En bout en
 * bout, aucun lieu en clair ne s'écrit : il est retenu, et `withheld` le dit
 * pour que l'appelant mesure l'usage. Un lieu malformé n'est jamais « retenu » :
 * rien n'aurait été écrit de toute façon.
 */
export function admitSharedPlace(input: unknown, regime: { readonly endToEnd: boolean }): SharedPlaceAdmission {
  const place = parseSharedPlace(input);
  if (!regime.endToEnd) return { place, withheld: false };
  return { place: null, withheld: place !== null };
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
  // Un commentaire embarqué se sert comme la liste complète
  // (`hoistCommentCarriers`, routes/posts/comments.ts) : son lieu ET son
  // sticker (#9080) hissés — sinon le sticker disparaît selon la surface.
  const hoistedComments = comments.map((comment) =>
    comment && typeof comment === 'object' && !Array.isArray(comment)
      ? hoistStickerOnto(hoistLocationOnto(comment as Record<string, unknown>))
      : comment
  );
  return { ...hoisted, comments: hoistedComments } as T;
}
