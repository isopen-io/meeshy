import type { SceneCarrier } from '@/lib/canvas/carrier';
import type { CanvasDocument } from '@/lib/canvas/document';

import type { AppliedBranding } from './scene-export-branding';
import { decodeAnimatedImage, frameAt, type AnimatedImage } from './scene-export-animated';
import { grainTiles } from './scene-export-media';
import type { ExportAssets } from './scene-export-paint';
import { planSceneExport, sceneExportSources, type SceneExportPlan } from './scene-export-plan';

/**
 * **CE QUE L'EXPORT A EN MAIN AVANT SA PREMIÈRE IMAGE** (#13873) — chaque
 * pixel et chaque son de la composition, tirés en BLOB (un blob se peint sans
 * « salir » le canvas, que l'enregistreur refuserait de filmer), décodés
 * localement : les images, les vidéos (muettes : leur son part décodé dans la
 * piste mixée), les sons. Leurs durées réelles fixent le plan
 * (`planSceneExport`) — une vidéo de fond de 4 min fait une slide de 4 min.
 *
 * Une pièce qui n'arrive pas est NOMMÉE dans `missing` et n'arrête rien,
 * comme iOS (`hydratingLocalMedia` ne nullifie jamais) : le rendu peint ce
 * qui est là.
 */

export type SceneAssetDeps = {
  readonly doc: Document;
  readonly fetchBlob: (src: string) => Promise<Blob | null>;
  readonly createObjectURL: (blob: Blob) => string;
  readonly revokeObjectURL: (url: string) => void;
  readonly decodeImage?: ((blob: Blob) => Promise<CanvasImageSource | null>) | undefined;
  /** `null` : pas de Web Audio — l'export sort muet plutôt que pas du tout. */
  readonly decodeAudio: ((data: ArrayBuffer) => Promise<AudioBuffer>) | null;
  /** WebCodecs — le décodeur des images animées (#13880) ; absent, elles restent fixes. */
  readonly imageDecoder?: typeof ImageDecoder | undefined;
  readonly timeoutMs?: number;
};

export type PreparedSceneExport = {
  readonly plan: SceneExportPlan;
  readonly assets: ExportAssets;
  readonly videos: ReadonlyMap<string, HTMLVideoElement>;
  readonly buffers: ReadonlyMap<string, AudioBuffer>;
  readonly missing: readonly string[];
  /** L'intro, la carte de fin et leurs jingles (#13997) — présent pour une story, posé APRÈS la préparation. */
  readonly branding?: AppliedBranding;
  readonly dispose: () => void;
};

const DEFAULT_TIMEOUT_MS = 15_000;

function waitFor(target: EventTarget, events: readonly string[], timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      for (const event of events) target.removeEventListener(event, onEvent);
      target.removeEventListener('error', onError);
      resolve(ok);
    };
    const onEvent = () => finish(true);
    const onError = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);
    for (const event of events) target.addEventListener(event, onEvent);
    target.addEventListener('error', onError);
  });
}

async function imageFrom(url: string, doc: Document, timeoutMs: number): Promise<CanvasImageSource | null> {
  const image = doc.createElement('img');
  image.decoding = 'async';
  const loaded = waitFor(image, ['load'], timeoutMs);
  image.src = url;
  return (await loaded) ? image : null;
}

async function videoFrom(url: string, doc: Document, timeoutMs: number): Promise<HTMLVideoElement | null> {
  const video = doc.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const ready = waitFor(video, ['loadeddata'], timeoutMs);
  video.src = url;
  video.load();
  return (await ready) ? video : null;
}

const finiteMs = (seconds: number): number | null => (Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null);

export async function prepareSceneExport(params: {
  readonly document: CanvasDocument;
  readonly carrier: SceneCarrier;
  readonly deps: SceneAssetDeps;
  readonly signal: AbortSignal;
}): Promise<PreparedSceneExport | 'cancelled'> {
  const { document, carrier, deps, signal } = params;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sources = sceneExportSources({ document, carrier });
  const urls: string[] = [];
  const blobs = new Map<string, Promise<Blob | null>>();
  const blobOf = (src: string): Promise<Blob | null> => {
    const known = blobs.get(src);
    if (known !== undefined) return known;
    const request = deps.fetchBlob(src).catch(() => null);
    blobs.set(src, request);
    return request;
  };
  const urlOf = (blob: Blob): string => {
    const url = deps.createObjectURL(blob);
    urls.push(url);
    return url;
  };
  const dispose = () => {
    for (const url of urls.splice(0)) deps.revokeObjectURL(url);
  };

  const animations = new Map<string, AnimatedImage>();
  const loadImage = async (src: string): Promise<readonly [string, CanvasImageSource | null]> => {
    const blob = await blobOf(src);
    if (blob === null) return [src, null];
    const [decoded, animated] = await Promise.all([
      deps.decodeImage === undefined ? imageFrom(urlOf(blob), deps.doc, timeoutMs) : deps.decodeImage(blob).catch(() => null),
      decodeAnimatedImage(blob, deps.imageDecoder),
    ]);
    if (animated !== null) animations.set(src, animated);
    return [src, decoded];
  };
  const loadVideo = async (src: string): Promise<readonly [string, HTMLVideoElement | null]> => {
    const blob = await blobOf(src);
    return [src, blob === null ? null : await videoFrom(urlOf(blob), deps.doc, timeoutMs)];
  };
  const loadSound = async (src: string): Promise<readonly [string, AudioBuffer | null]> => {
    const decode = deps.decodeAudio;
    if (decode === null) return [src, null];
    const blob = await blobOf(src);
    if (blob === null) return [src, null];
    const buffer = await blob
      .arrayBuffer()
      .then((data) => decode(data))
      .catch(() => null);
    return [src, buffer];
  };

  const [images, videos, sounds] = await Promise.all([
    Promise.all(sources.images.map(loadImage)),
    Promise.all(sources.videos.map(loadVideo)),
    Promise.all(sources.sounds.map(loadSound)),
  ]);
  if (signal.aborted) {
    dispose();
    return 'cancelled';
  }

  const imageMap = new Map(images.flatMap(([src, image]) => (image === null ? [] : [[src, image] as const])));
  const videoMap = new Map(videos.flatMap(([src, video]) => (video === null ? [] : [[src, video] as const])));
  const bufferMap = new Map(sounds.flatMap(([src, buffer]) => (buffer === null ? [] : [[src, buffer] as const])));
  /* La durée de l'ÉLÉMENT vidéo l'emporte sur celle de sa piste décodée : c'est elle que le lecteur lit. */
  const durations = new Map<string, number>([
    ...[...bufferMap].flatMap(([src, buffer]) => {
      const ms = finiteMs(buffer.duration);
      return ms === null ? [] : [[src, ms] as const];
    }),
    ...[...videoMap].flatMap(([src, video]) => {
      const ms = finiteMs(video.duration);
      return ms === null ? [] : [[src, ms] as const];
    }),
  ]);
  const missing = [
    ...images.filter(([, image]) => image === null).map(([src]) => src),
    ...videos.filter(([, video]) => video === null).map(([src]) => src),
  ];
  const plan = planSceneExport({ document, carrier, durations });
  return {
    plan: animations.size > 0 && plan.still ? { ...plan, still: false } : plan,
    assets: {
      image: (src) => imageMap.get(src) ?? null,
      imageAt: (src, tMs) => {
        const animation = animations.get(src);
        return animation === undefined ? null : frameAt(animation, tMs);
      },
      video: (src) => videoMap.get(src) ?? null,
      grainTile: grainTiles(deps.doc),
    },
    videos: videoMap,
    buffers: bufferMap,
    missing,
    dispose: () => {
      for (const video of videoMap.values()) {
        video.pause();
        video.removeAttribute('src');
      }
      for (const animation of animations.values()) animation.close();
      dispose();
    },
  };
}
