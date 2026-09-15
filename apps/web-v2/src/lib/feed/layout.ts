/**
 * LA GÉOMÉTRIE DU MÉDIA D'UNE CARTE (#5893) — miroir
 * `FeedPostCardLayout.swift:26-38` (`postCardMediaHeight`) et
 * `ReelFeedLayout.swift:31-44` (`reelCardHeight`) : un ratio `h/w` BORNÉ,
 * jamais la valeur brute — une image très large ou très haute romprait sinon
 * la hiérarchie de la carte. Le REPLI (dimensions absentes) diffère entre les
 * deux familles : `0.75` pour un post (large, sous le texte), `1.25` pour un
 * réel (plein cadre, presque un portrait) — la même asymétrie qu'iOS.
 */
export function clampRatio(ratio: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, ratio));
}

const POST_MEDIA_RATIO_BOUNDS = { min: 0.75, max: 1.4 } as const;
const REEL_CARD_RATIO_BOUNDS = { min: 0.75, max: 1.25 } as const;

/** UNE CÔTE UTILISABLE — la passerelle sert `width`/`height` en `null` quand
 * elle ne les a pas mesurées (`schema.prisma:3603-3604`), et un `0` ou un
 * `NaN` rendrait une division absurde. */
function positiveSide(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function postMediaRatio(width: number | null | undefined, height: number | null | undefined): number {
  const w = positiveSide(width);
  const h = positiveSide(height);
  if (w === null || h === null) return POST_MEDIA_RATIO_BOUNDS.min;
  return clampRatio(h / w, POST_MEDIA_RATIO_BOUNDS.min, POST_MEDIA_RATIO_BOUNDS.max);
}

export function reelCardRatio(width: number | null | undefined, height: number | null | undefined): number {
  const w = positiveSide(width);
  const h = positiveSide(height);
  if (w === null || h === null) return REEL_CARD_RATIO_BOUNDS.max;
  return clampRatio(h / w, REEL_CARD_RATIO_BOUNDS.min, REEL_CARD_RATIO_BOUNDS.max);
}

/** `FeedPostCard+Media.swift` ne distingue le média que par `mimeType` — le
 * même préfixe que `attachment-blocks.tsx` emploie déjà pour les pièces
 * jointes du fil, jamais une seconde énumération. */
export type FeedMediaKind = 'image' | 'video' | 'audio' | 'other';

export function feedMediaKindOf(mimeType: string | null | undefined): FeedMediaKind {
  // `null` ET `undefined` : la passerelle sert l'absence en `null` (voir
  // `FeedAuthor`, `api/feed-pages.ts`) — `mimeType === undefined` seul
  // laissait `null.startsWith` lever.
  if (typeof mimeType !== 'string') return 'other';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('image/')) return 'image';
  return 'other';
}
