/**
 * Règle de composition d'un RÉEL — prédicat PUR, SOURCE UNIQUE partagée.
 *
 * Règle produit (directive user 2026-08-02) : un post n'est un RÉEL que si sa
 * composition porte UNE VIDÉO, UN AUDIO, ou AU MOINS DEUX IMAGES. Une image
 * seule, un document ou un lieu restent un post de base (POST).
 *
 * Directive durée minimale : une vidéo ou un audio ne qualifie QUE si sa
 * durée est CONNUE (en millisecondes) et >= `MIN_QUALIFYING_DURATION_MS`
 * (3s). Une durée absente/nulle est traitée comme non-qualifiante (jamais un
 * fallback permissif). Les images ne sont jamais soumises à cette condition.
 *
 * Miroir EXACT du SDK iOS : `ReelComposition.qualifiesAsReel`
 * (packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift). Toute
 * évolution de la règle touche les deux sites — c'est la seule doctrine.
 *
 * Consommateurs : `PostService.createPost`/`updatePost` (gateway, import
 * direct), `PostComposer` (web, classification client avant publication) et
 * le backfill `scripts/migrations/reclassify-nonqualifying-reels-to-post.ts`.
 */

export const MIN_QUALIFYING_DURATION_MS = 3000;

export type ReelMediaLike = { mimeType: string | null; duration?: number | null };

function meetsMinDuration(duration: number | null | undefined): boolean {
  return typeof duration === 'number' && duration >= MIN_QUALIFYING_DURATION_MS;
}

export function qualifiesAsReel(media: ReadonlyArray<ReelMediaLike>): boolean {
  const normalized = media.map((m) => ({
    mime: (m.mimeType ?? '').toLowerCase(),
    duration: m.duration,
  }));
  const hasQualifyingVideo = normalized.some((m) => m.mime.startsWith('video/') && meetsMinDuration(m.duration));
  const hasQualifyingAudio = normalized.some((m) => m.mime.startsWith('audio/') && meetsMinDuration(m.duration));
  const imageCount = normalized.filter((m) => m.mime.startsWith('image/')).length;
  return hasQualifyingVideo || hasQualifyingAudio || imageCount >= 2;
}
