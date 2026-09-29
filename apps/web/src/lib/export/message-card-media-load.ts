import type { CardSource } from './message-card-paint';
import type { MessageCardMediaItem } from './message-card-subject';

/**
 * **LES PIXELS DES MÉDIAS D'UNE CARTE** (#8693) — aller chercher chaque pièce
 * en BLOB puis la décoder localement. Un blob se dessine sans jamais « salir »
 * le canvas : une image tirée d'une autre origine sans en-têtes CORS rendrait
 * `toBlob` impossible, et l'export échouerait après coup.
 *
 * Une vidéo se montre par son IMAGE D'ATTENTE quand la passerelle en sert une
 * (la première image), sinon par sa première frame, décodée ici. Un audio n'a
 * pas de pixels : sa représentation est une loi (`message-card-media.ts`).
 *
 * Chargé à la demande avec le peintre ; chaque URL d'objet créée est rendue
 * par `dispose`, appelé à la fermeture de l'atelier.
 */

export type CardMediaDeps = {
  readonly fetchBlob: (url: string, id: string) => Promise<Blob | null>;
  readonly doc: Document;
  readonly createObjectURL: (blob: Blob) => string;
  readonly revokeObjectURL: (url: string) => void;
  /** Le décodeur d'image — `createImageBitmap` quand il existe. */
  readonly decodeImage?: (blob: Blob) => Promise<CardSource | null>;
  readonly timeoutMs?: number;
};

export type LoadedCardSources = {
  readonly sources: readonly (CardSource | null)[];
  readonly dispose: () => void;
};

const waitFor = (target: EventTarget, event: string, timeoutMs: number): Promise<boolean> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      target.removeEventListener(event, done);
      resolve(false);
    }, timeoutMs);
    function done() {
      clearTimeout(timer);
      target.removeEventListener(event, done);
      resolve(true);
    }
    target.addEventListener(event, done);
  });

async function imageFromUrl(url: string, doc: Document, timeoutMs: number): Promise<CardSource | null> {
  const image = doc.createElement('img');
  image.decoding = 'async';
  const loaded = waitFor(image, 'load', timeoutMs);
  image.src = url;
  return (await loaded) ? image : null;
}

/** Une vidéo prête à se dessiner à la seconde `at` — muette, jamais affichée. */
export async function videoAt(url: string, doc: Document, at: number, timeoutMs = 8000): Promise<HTMLVideoElement | null> {
  const video = doc.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const ready = waitFor(video, 'loadeddata', timeoutMs);
  video.src = url;
  video.load();
  if (!(await ready)) return null;
  const seeked = waitFor(video, 'seeked', timeoutMs);
  video.currentTime = at;
  await seeked;
  return video;
}

export async function loadCardSources(items: readonly MessageCardMediaItem[], deps: CardMediaDeps): Promise<LoadedCardSources> {
  const urls: string[] = [];
  const timeoutMs = deps.timeoutMs ?? 8000;
  const toUrl = (blob: Blob) => {
    const url = deps.createObjectURL(blob);
    urls.push(url);
    return url;
  };
  const decode = async (blob: Blob): Promise<CardSource | null> => {
    if (deps.decodeImage !== undefined) return deps.decodeImage(blob).catch(() => null);
    return imageFromUrl(toUrl(blob), deps.doc, timeoutMs);
  };
  const one = async (item: MessageCardMediaItem): Promise<CardSource | null> => {
    if (item.card.kind === 'audio') return null;
    if (item.card.kind === 'video' && item.posterUrl !== null) {
      const poster = await deps.fetchBlob(item.posterUrl, item.id).catch(() => null);
      if (poster !== null) {
        const decoded = await decode(poster);
        if (decoded !== null) return decoded;
      }
    }
    const blob = await deps.fetchBlob(item.url, item.id).catch(() => null);
    if (blob === null) return null;
    if (item.card.kind === 'image') return decode(blob);
    return videoAt(toUrl(blob), deps.doc, 0, timeoutMs);
  };
  const sources = await Promise.all(items.map((item) => one(item).catch(() => null)));
  return {
    sources,
    dispose: () => {
      for (const url of urls.splice(0)) deps.revokeObjectURL(url);
    },
  };
}

/** Le décodeur du navigateur — `createImageBitmap` décode hors du fil principal. */
export const browserDecodeImage = (win: { readonly createImageBitmap?: (blob: Blob) => Promise<ImageBitmap> }): CardMediaDeps['decodeImage'] =>
  win.createImageBitmap === undefined ? undefined : (blob) => (win.createImageBitmap?.(blob) ?? Promise.resolve(null));
