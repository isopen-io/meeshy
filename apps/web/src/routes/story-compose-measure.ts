import type { StudioMediaKind } from '@/lib/stories/story-document';

/**
 * LES MESURES DU FICHIER LOCAL (§ 0, défauts 7 et #7497 — extrait de
 * `story-compose.tsx` par #7683 pour tenir le budget de taille). Connues SANS
 * réseau, dès la sélection : c'est elles, jamais une mesure serveur, que le
 * document (aperçu ET publication) porte.
 */

/** Le rapport largeur/hauteur du fichier LOCAL — `null` sur tout échec de
 * décodage (fichier corrompu, format non supporté par ce navigateur) : le
 * document part alors SANS le champ, jamais avec une valeur inventée. */
export function measureAspectRatio(previewUrl: string, mediaType: StudioMediaKind): Promise<number | null> {
  return new Promise((resolve) => {
    if (mediaType === 'video') {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        resolve(video.videoWidth > 0 && video.videoHeight > 0 ? video.videoWidth / video.videoHeight : null);
      };
      video.onerror = () => resolve(null);
      video.src = previewUrl;
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth > 0 && image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : null);
    image.onerror = () => resolve(null);
    image.src = previewUrl;
  });
}

/** La durée du fichier local — connue SANS réseau, dès la sélection : c'est
 * elle que la règle du réel compare à ses trois secondes. `null` sur tout
 * échec de décodage — une durée inconnue ne qualifie jamais. */
export function measureDurationMs(previewUrl: string, element: 'video' | 'audio'): Promise<number | null> {
  return new Promise((resolve) => {
    const media = document.createElement(element);
    media.preload = 'metadata';
    media.onloadedmetadata = () => {
      resolve(Number.isFinite(media.duration) && media.duration > 0 ? Math.round(media.duration * 1000) : null);
    };
    media.onerror = () => resolve(null);
    media.src = previewUrl;
  });
}
