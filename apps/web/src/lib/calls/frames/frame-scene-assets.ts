import type { FrameImageStore } from './frame-scene-image';

/**
 * **LES FICHIERS DES ILLUSTRATIONS** (#12683) — les `.webp` de
 * `packages/shared/design/call-capture-frames/assets/call-frames/`, les mêmes
 * octets qu'iOS embarque, que Vite emporte comme fichiers empreints et dont il
 * rend ici l'adresse. Le magasin PARESSEUX ne demande une image que la
 * première fois qu'un cadre la peint — un appel où l'on ne choisit aucune
 * déclinaison illustrée ne télécharge rien —, et prévient quand elle arrive,
 * pour que les couches peintes sans elle se repeignent. La table des adresses
 * elle-même (`frame-scene-urls.ts`) n'arrive qu'à la première illustration
 * demandée : l'atelier ne la paie pas tant qu'aucune déclinaison illustrée
 * n'est peinte.
 */

export type ImageLoader = (url: string) => Promise<CanvasImageSource>;

/** Charge une image par le navigateur, décodée hors du fil de rendu. */
export const browserImageLoader: ImageLoader = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`image introuvable : ${url}`));
    image.src = url;
  });

type LazyOptions = {
  readonly urls: Readonly<Record<string, string>>;
  readonly load: ImageLoader;
  /** Une image vient d'arriver : ce qui a été peint sans elle est à repeindre. */
  readonly onLoaded?: (src: string) => void;
};

/**
 * Un magasin qui se remplit à la demande : `get` rend l'image si elle est là, sinon
 * `null` — et lance son chargement la première fois, une seule fois, même en échec.
 */
export function lazyFrameImages({ urls, load, onLoaded }: LazyOptions): FrameImageStore {
  const loaded = new Map<string, CanvasImageSource>();
  const asked = new Set<string>();
  return {
    get: (src) => {
      const image = loaded.get(src);
      if (image !== undefined) return image;
      const url = urls[src];
      if (url === undefined || asked.has(src)) return null;
      asked.add(src);
      load(url).then(
        (arrived) => {
          loaded.set(src, arrived);
          onLoaded?.(src);
        },
        () => undefined,
      );
      return null;
    },
  };
}

type DeferredOptions = Omit<LazyOptions, 'urls'> & {
  /** La table des adresses, demandée à la première illustration et une seule fois. */
  readonly urls: () => Promise<Readonly<Record<string, string>>>;
};

/**
 * Le magasin paresseux dont la TABLE aussi est paresseuse : la première demande la fait
 * venir et rend `null` ; à son arrivée, `onLoaded` fait repeindre, et la demande suivante
 * lance le chargement de l'image. Une table introuvable laisse les cadres sans illustration.
 */
export function deferredFrameImages({ urls, load, onLoaded }: DeferredOptions): FrameImageStore {
  let inner: FrameImageStore | null = null;
  let asked = false;
  return {
    get: (src) => {
      if (inner !== null) return inner.get(src);
      if (asked) return null;
      asked = true;
      urls().then(
        (table) => {
          inner = lazyFrameImages({ urls: table, load, ...(onLoaded === undefined ? {} : { onLoaded }) });
          onLoaded?.(src);
        },
        () => undefined,
      );
      return null;
    },
  };
}
