/**
 * **LES VIGNETTES DE LA GALERIE D'EXPORT** — chaque template montré par sa
 * VRAIE carte, peinte sur le message de l'utilisateur, jamais sur un exemple.
 *
 * Une vignette coûte une peinture : le cache les produit À LA DEMANDE (la
 * galerie ne demande que ce qui entre à l'écran), DEUX à la fois pour ne
 * jamais tenir le fil principal, la PLUS RÉCENTE demande d'abord (le doigt
 * qui défile vite veut ce qu'il voit, pas ce qu'il a dépassé). Le cache est
 * BORNÉ : au-delà de `limit` vignettes, la plus ancienne rend son URL.
 *
 * Une clé nomme le template ET tout ce qui change la carte (langue, titre,
 * anonymat) : changer un détail ne ressert jamais une vignette périmée.
 */

export type ThumbnailRender = () => Promise<Blob | null>;

export type ThumbnailCache = {
  readonly get: (key: string) => string | null;
  readonly request: (key: string, render: ThumbnailRender) => void;
  readonly subscribe: (listener: () => void) => () => void;
  readonly dispose: () => void;
};

export function createThumbnailCache(options: {
  readonly createObjectURL: (blob: Blob) => string;
  readonly revokeObjectURL: (url: string) => void;
  readonly concurrency?: number;
  readonly limit?: number;
}): ThumbnailCache {
  const concurrency = options.concurrency ?? 2;
  const limit = options.limit ?? 240;
  const urls = new Map<string, string>();
  const asked = new Set<string>();
  const waiting: { readonly key: string; readonly render: ThumbnailRender }[] = [];
  const listeners = new Set<() => void>();
  let running = 0;
  let disposed = false;

  const store = (key: string, blob: Blob) => {
    urls.set(key, options.createObjectURL(blob));
    for (const [oldest, url] of urls) {
      if (urls.size <= limit) break;
      options.revokeObjectURL(url);
      urls.delete(oldest);
      asked.delete(oldest);
    }
    for (const listener of listeners) listener();
  };

  const pump = () => {
    while (!disposed && running < concurrency && waiting.length > 0) {
      const next = waiting.pop();
      if (next === undefined) return;
      running += 1;
      void next
        .render()
        .catch(() => null)
        .then((blob) => {
          if (disposed) return;
          if (blob === null) asked.delete(next.key);
          else store(next.key, blob);
        })
        .finally(() => {
          running -= 1;
          pump();
        });
    }
  };

  return {
    get: (key) => urls.get(key) ?? null,
    request: (key, render) => {
      if (disposed || asked.has(key)) return;
      asked.add(key);
      waiting.push({ key, render });
      pump();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: () => {
      disposed = true;
      waiting.length = 0;
      for (const url of urls.values()) options.revokeObjectURL(url);
      urls.clear();
      listeners.clear();
    },
  };
}
