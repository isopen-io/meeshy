/**
 * **LES MINIATURES DES EFFETS VISUELS** (#8794, jumelle de
 * `StoryFilterThumbnails` iOS, #8792 — « les effets visuels doivent avoir une
 * miniature visible »). Chaque tuile du carrousel montre le FOND RÉEL de la
 * scène, filtré par l'effet qu'elle nomme.
 *
 * Le coût est le décodage d'une photo pleine taille : il est fait UNE fois
 * par fichier, HORS du fil principal (`createImageBitmap` avec
 * `resizeWidth` / `resizeHeight` décode et réduit en tâche de fond), rendu en
 * une petite image JPEG gardée dans un cache BORNÉ qui révoque ce qu'il
 * évince. Chaque tuile peint ensuite cette même petite image sous la chaîne
 * de filtres CSS du player (`storyFilterCss`, `lib/canvas/media-filter.ts`) :
 * appliquée par le compositeur, et identique au pixel près à ce que la scène
 * publiée montrera (loi 6).
 */

export type ThumbnailCache = {
  readonly get: (key: string) => string | null;
  readonly set: (key: string, url: string) => void;
};

export function createThumbnailCache({ limit, revoke }: { readonly limit: number; readonly revoke: (url: string) => void }): ThumbnailCache {
  const entries = new Map<string, string>();
  return {
    get: (key) => {
      const url = entries.get(key);
      if (url === undefined) return null;
      entries.delete(key);
      entries.set(key, url);
      return url;
    },
    set: (key, url) => {
      const previous = entries.get(key);
      if (previous !== undefined && previous !== url) revoke(previous);
      entries.delete(key);
      entries.set(key, url);
      while (entries.size > limit) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        const evicted = entries.get(oldest);
        entries.delete(oldest);
        if (evicted !== undefined) revoke(evicted);
      }
    },
  };
}

/** Le format de la scène quand le fond n'a pas encore été mesuré. */
const SCENE_ASPECT = 9 / 16;

export function filterThumbnailSize({ aspectRatio, edge }: { readonly aspectRatio: number | undefined; readonly edge: number }): {
  readonly width: number;
  readonly height: number;
} {
  const ratio = aspectRatio !== undefined && Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : SCENE_ASPECT;
  return ratio >= 1 ? { width: edge, height: Math.round(edge / ratio) } : { width: Math.round(edge * ratio), height: edge };
}

/** Le bord long d'une miniature, en pixels d'image (deux fois la tuile de
 * 64 px, pour un écran à haute densité). */
export const FILTER_THUMBNAIL_EDGE = 160;

const cache = createThumbnailCache({ limit: 6, revoke: (url) => URL.revokeObjectURL(url) });

/** Les rendus EN COURS — deux tuiles qui demandent le même fond ne le
 * décodent qu'une fois. */
const pending = new Map<string, Promise<string | null>>();

export function cachedFilterThumbnail(source: string): string | null {
  return cache.get(source);
}

/**
 * Le rendu réduit du fond `source` (URL locale `blob:` ou adresse servie).
 * `null` quand le navigateur ne sait pas le faire (pas de `createImageBitmap`,
 * média refusé) : la tuile peint alors le fond lui-même, filtré de la même
 * façon.
 */
export function filterThumbnail({ source, aspectRatio }: { readonly source: string; readonly aspectRatio: number | undefined }): Promise<string | null> {
  const cached = cache.get(source);
  if (cached !== null) return Promise.resolve(cached);
  const running = pending.get(source);
  if (running !== undefined) return running;
  const render = renderThumbnail({ source, aspectRatio })
    .then((url) => {
      if (url !== null) cache.set(source, url);
      return url;
    })
    .catch(() => null)
    .finally(() => pending.delete(source));
  pending.set(source, render);
  return render;
}

async function renderThumbnail({ source, aspectRatio }: { readonly source: string; readonly aspectRatio: number | undefined }): Promise<string | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  const blob = await (await fetch(source)).blob();
  const size = filterThumbnailSize({ aspectRatio, edge: FILTER_THUMBNAIL_EDGE });
  const bitmap = await createImageBitmap(blob, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'medium' });
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  bitmap.close();
  const reduced = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  return reduced === null ? null : URL.createObjectURL(reduced);
}
