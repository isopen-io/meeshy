import type { Rect, Size } from './call-montage';

/**
 * **CE QUE L'ÉCRAN MONTRE, POUR LE CAPTURER** (#8552) — les vidéos de l'appel
 * AFFICHÉES : une tuile hors de la fenêtre (la bande d'une mosaïque qu'on a
 * fait défiler), sans image encore (`videoWidth` nul) ou effacée n'est pas
 * capturée. Chacune garde sa place à l'écran (normalisée à la scène) et son
 * cadrage (`cover` pour un visage, `contain` pour un écran partagé) ; aucune
 * n'est en miroir, une capture montre ce que l'autre voit (#8696). Rangées de la plus grande à la plus petite : la première est
 * celle qu'on regarde.
 *
 * Chaque tuile sait À QUI elle est (#8743) : `data-call-member` nomme le
 * membre qu'elle montre, `data-call-self` marque la mienne (`StreamVideo`) —
 * c'est ce qui pose chaque visage dans SA case d'un cadre de capture.
 */

export type CaptureTile = {
  readonly source: HTMLVideoElement;
  readonly size: Size;
  readonly onScreen: Rect;
  readonly fit: 'cover' | 'contain';
  /** Le membre montré (`userId`), `null` si la vidéo ne le dit pas. */
  readonly member: string | null;
  /** Ma propre vidéo. */
  readonly self: boolean;
};

export const CAPTURE_VIDEO = 'video[data-call-stream]';

const visibleArea = (rect: Rect, stage: Rect): number => {
  const width = Math.min(rect.x + rect.width, stage.x + stage.width) - Math.max(rect.x, stage.x);
  const height = Math.min(rect.y + rect.height, stage.y + stage.height) - Math.max(rect.y, stage.y);
  return width > 0 && height > 0 ? width * height : 0;
};

const shown = (video: HTMLVideoElement): boolean => {
  if (typeof getComputedStyle !== 'function') return true;
  const style = getComputedStyle(video);
  return style.visibility !== 'hidden' && style.display !== 'none';
};

export function visibleTiles(stage: Element): readonly CaptureTile[] {
  const bounds = stage.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return [];
  return [...stage.querySelectorAll<HTMLVideoElement>(CAPTURE_VIDEO)]
    .map((video) => ({ video, rect: video.getBoundingClientRect() }))
    .filter(({ video, rect }) => video.videoWidth > 0 && video.videoHeight > 0 && shown(video) && visibleArea(rect, bounds) > rect.width * rect.height * 0.25)
    .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)
    .map(({ video, rect }) => ({
      source: video,
      size: { width: video.videoWidth, height: video.videoHeight },
      onScreen: { x: (rect.left - bounds.left) / bounds.width, y: (rect.top - bounds.top) / bounds.height, width: rect.width / bounds.width, height: rect.height / bounds.height },
      fit: video.getAttribute('data-call-stream') === 'contain' ? 'contain' : 'cover',
      member: video.getAttribute('data-call-member'),
      self: video.hasAttribute('data-call-self'),
    }));
}
