/**
 * Règle de composition d'un RÉEL — prédicat PUR.
 *
 * Règle produit (directive user 2026-08-02) : un post n'est un RÉEL que si sa
 * composition porte UNE VIDÉO, UN AUDIO, ou AU MOINS DEUX IMAGES. Une image
 * seule, un document ou un lieu restent un post de base (POST).
 *
 * Miroir EXACT du SDK iOS : `ReelComposition.qualifiesAsReel`
 * (packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift). Toute
 * évolution de la règle touche les deux sites — c'est la seule doctrine.
 *
 * Consommateurs : `PostService.createPost` (dégradation silencieuse en POST),
 * `PostService.updatePost` (422 sur la liste FINALE des médias), et le
 * backfill `scripts/migrations/reclassify-nonqualifying-reels-to-post.ts`.
 */

export type ReelMediaLike = { mimeType: string | null };

export function qualifiesAsReel(media: ReadonlyArray<ReelMediaLike>): boolean {
  const mimes = media.map((m) => (m.mimeType ?? '').toLowerCase());
  const hasVideo = mimes.some((mime) => mime.startsWith('video/'));
  const hasAudio = mimes.some((mime) => mime.startsWith('audio/'));
  const imageCount = mimes.filter((mime) => mime.startsWith('image/')).length;
  return hasVideo || hasAudio || imageCount >= 2;
}
