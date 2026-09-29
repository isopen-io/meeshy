import type { Rect, Size } from './call-montage';

/**
 * **CE QUE L'ÉCRAN MONTRE, POUR LE CAPTURER** (#8552) — les vidéos de l'appel
 * AFFICHÉES : une tuile hors de la fenêtre (la bande d'une mosaïque qu'on a
 * fait défiler), sans image encore (`videoWidth` nul) ou effacée n'est pas
 * capturée. Chacune garde sa place à l'écran (normalisée à la scène), son
 * miroir (ma caméra frontale se voit comme dans une glace, et se capture
 * pareil) et son cadrage (`cover` pour un visage, `contain` pour un écran
 * partagé). Rangées de la plus grande à la plus petite : la première est
 * celle qu'on regarde.
 */

export type CaptureTile = {
  readonly source: HTMLVideoElement;
  readonly size: Size;
  readonly onScreen: Rect;
  readonly mirrored: boolean;
  readonly fit: 'cover' | 'contain';
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
      mirrored: video.hasAttribute('data-call-mirrored'),
      fit: video.getAttribute('data-call-stream') === 'contain' ? 'contain' : 'cover',
    }));
}
