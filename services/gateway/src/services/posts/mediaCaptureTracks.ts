import type { CaptureTrack } from './SoundCaptureService';

/**
 * Pistes de capture SYNTHÉTISÉES depuis les `PostMedia` d'un post — le chemin
 * des posts/réels « vocaux » (AudioPostComposer), qui attachent leur audio via
 * `mediaIds` SANS blob `storyEffects`. Sans cette synthèse, un post audio
 * public n'alimentait JAMAIS la bibliothèque de sons : seule la lecture de
 * `storyEffects.audioPlayerObjects` (`extractCaptureTracks`) déclenchait une
 * capture, et ce chemin-là n'en produit aucun.
 *
 * Fonction PURE, même doctrine que `extractCaptureTracks` : c'est elle qui
 * décide ce qui entre dans la bibliothèque, donc elle se teste seule.
 *
 * Règles :
 * - un média `audio/*` produit une piste de capture (fenêtre = fichier entier) ;
 * - un média `video/*` n'en produit une que si l'AUTEUR a opté pour
 *   l'extraction de bande-son (`Post.allowSoundExtraction`) — la piste porte
 *   alors `extractFromVideo` et `SoundCaptureService` démuxe l'audio ;
 * - un média déjà référencé par une piste `storyEffects` est laissé à cette
 *   piste-là (composer riche) : synthétiser en double créerait deux usages
 *   pour le même son sur le même post.
 *
 * `trackId` est DÉTERMINISTE (`media:<postMediaId>`) : `SoundUsage` est unique
 * par `[postId, trackId]`, donc une republication/édition UPSERT la même ligne
 * au lieu d'en empiler une nouvelle, et `dropRemovedUsages` retire celle d'un
 * média détaché.
 */
export const MEDIA_TRACK_PREFIX = 'media:';

export type CapturableMedia = {
  id: string;
  mimeType: string | null;
  /** Durée en millisecondes (convention `PostMedia.duration`). */
  duration?: number | null;
};

export function mediaCaptureTracks(input: {
  media: ReadonlyArray<CapturableMedia>;
  /** Pistes lues de `storyEffects` — leurs `postMediaId` priment. */
  storyEffectsTracks?: ReadonlyArray<CaptureTrack>;
  /** `Post.allowSoundExtraction` — ne gouverne QUE les médias vidéo. */
  allowVideoExtraction?: boolean;
}): CaptureTrack[] {
  const claimed = new Set(
    (input.storyEffectsTracks ?? [])
      .map((t) => t.postMediaId)
      .filter((id): id is string => Boolean(id)),
  );

  return input.media
    .filter((m) => m.id && !claimed.has(m.id))
    .map((m): CaptureTrack | null => {
      const mime = (m.mimeType ?? '').toLowerCase();
      const window = typeof m.duration === 'number' && Number.isFinite(m.duration) && m.duration > 0
        ? { startMs: 0, endMs: Math.round(m.duration) }
        : { startMs: 0 };
      if (mime.startsWith('audio/')) {
        return { trackId: `${MEDIA_TRACK_PREFIX}${m.id}`, postMediaId: m.id, ...window };
      }
      if (mime.startsWith('video/') && input.allowVideoExtraction === true) {
        return {
          trackId: `${MEDIA_TRACK_PREFIX}${m.id}`,
          postMediaId: m.id,
          extractFromVideo: true,
          ...window,
        };
      }
      return null;
    })
    .filter((t): t is CaptureTrack => t !== null);
}
