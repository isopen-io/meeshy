import type { BlurStage } from './video-effects-frames';

/**
 * **LE FLOU D'ARRIÈRE-PLAN PAR SEGMENTATION** (#8471) — quand la caméra ne le
 * fait pas (`backgroundBlur`, toujours prioritaire). Il vit avec le traitement
 * des images, dans le worker :
 *
 * - le MODÈLE (selfie segmenter de MediaPipe, `video-effects-segmentation.ts`)
 *   ne se charge qu'au premier flou ;
 * - la personne est DÉCOUPÉE au plus quinze fois par seconde, sur une réduction
 *   de l'image, jamais sur le chemin d'une image : la découpe part dans une
 *   tâche à elle (`schedule`), l'image courante sort avec le dernier masque ;
 * - le masque est LISSÉ d'une découpe à l'autre (moyenne mobile), puis remis
 *   en octets au compositeur WebGL2 (`video-effects-compositor.ts`) ;
 * - tant qu'aucun masque n'est arrivé — modèle en chargement, ou qui a échoué
 *   — TOUT est flouté : l'arrière-plan ne fuit jamais.
 */

export type MaskFrame = { readonly width: number; readonly height: number; readonly data: Float32Array };

export type SegmenterPort = { readonly segment: (image: ImageBitmap, timestampMs: number) => MaskFrame | null; readonly close: () => void };

export type Compositor = {
  readonly render: (source: CanvasImageSource, width: number, height: number) => void;
  readonly mask: (bytes: Uint8Array, width: number, height: number) => void;
  readonly release: () => void;
};

export const SEGMENT_INTERVAL_MS = 1000 / 15;

const MASK_SMOOTHING = 0.5;

/** Le masque lissé : la découpe neuve mêlée à la précédente — écrit DANS la précédente (un tampon par flou, aucune allocation par découpe). */
export function blendMaskInto(target: Float32Array | null, next: Float32Array, alpha: number): Float32Array {
  if (target === null || target.length !== next.length) return Float32Array.from(next);
  next.forEach((value, index) => {
    target[index] = (target[index] ?? 0) + alpha * (value - (target[index] ?? 0));
  });
  return target;
}

/** Le masque en octets (0…255) pour la texture du compositeur — dans `out` quand il a la bonne taille. */
export function maskBytes(mask: Float32Array, out: Uint8Array | null): Uint8Array {
  const bytes = out !== null && out.length === mask.length ? out : new Uint8Array(mask.length);
  mask.forEach((value, index) => {
    bytes[index] = Math.round(Math.min(1, Math.max(0, value)) * 255);
  });
  return bytes;
}

export type GaussianTaps = { readonly center: number; readonly offsets: readonly number[]; readonly weights: readonly number[] };

const TAP_PAIRS = 4;

/**
 * Le noyau gaussien d'une passe, en prises BILINÉAIRES : deux texels voisins
 * se lisent en une prise placée entre eux, au prorata de leurs poids — neuf
 * lectures pour un noyau de dix-sept texels.
 */
export function gaussianTaps(sigma: number): GaussianTaps {
  const raw = Array.from({ length: TAP_PAIRS * 2 + 1 }, (_, index) => Math.exp(-(index * index) / (2 * sigma * sigma)));
  const total = (raw[0] ?? 0) + 2 * raw.slice(1).reduce((sum, weight) => sum + weight, 0);
  const weight = (index: number): number => (raw[index] ?? 0) / total;
  const pairs = Array.from({ length: TAP_PAIRS }, (_, pair) => {
    const first = pair * 2 + 1;
    const combined = weight(first) + weight(first + 1);
    return { offset: (first * weight(first) + (first + 1) * weight(first + 1)) / combined, weight: combined };
  });
  return { center: weight(0), offsets: pairs.map((pair) => pair.offset), weights: pairs.map((pair) => pair.weight) };
}

export type Rgb = readonly [number, number, number];

/** Les bits de mantisse d'une précision GLSL sur un GPU MOBILE : `mediump` y est un demi-flottant, `highp` un flottant. */
export const MANTISSA_BITS = { mediump: 10, highp: 23 } as const;

export type ShaderPrecision = keyof typeof MANTISSA_BITS;

/**
 * La précision des passes du compositeur (#9203) : la coordonnée de l'image
 * nette doit tomber sur SON pixel jusqu'en 4K — en demi-flottant, elle dérive
 * d'un demi-pixel dès 1920 de large, et la personne prend la couleur de ses
 * voisins.
 */
export const FRAGMENT_PRECISION: ShaderPrecision = 'highp';

const quantized = (value: number, precision: ShaderPrecision): number => {
  if (value === 0) return 0;
  const step = 2 ** (Math.floor(Math.log2(Math.abs(value))) - MANTISSA_BITS[precision]);
  return Math.round(value / step) * step;
};

/** La couleur qu'une prise BILINÉAIRE lit au centre du pixel `x` d'une rangée, la coordonnée passée par la précision du fragment. */
export function sampledPixel(row: readonly Rgb[], x: number, precision: ShaderPrecision): Rgb {
  const texel = quantized((x + 0.5) / row.length, precision) * row.length - 0.5;
  const at = (index: number): Rgb => row[Math.min(row.length - 1, Math.max(0, index))] ?? [0, 0, 0];
  const left = Math.floor(texel);
  const weight = texel - left;
  const [a, b] = [at(left), at(left + 1)];
  const channel = (index: 0 | 1 | 2): number => Math.round(a[index] * (1 - weight) + b[index] * weight);
  return [channel(0), channel(1), channel(2)];
}

type BlurDeps = {
  readonly compositor: Compositor;
  readonly canvas: CanvasImageSource;
  readonly loadSegmenter: () => Promise<SegmenterPort>;
  /** Une réduction de l'image, prise AVANT que l'image ne soit relâchée. */
  readonly snapshot: (source: CanvasImageSource, width: number, height: number) => Promise<ImageBitmap>;
  readonly schedule: (task: () => void) => void;
  readonly now: () => number;
};

type SegmenterState = { readonly kind: 'idle' } | { readonly kind: 'loading' } | { readonly kind: 'ready'; readonly segmenter: SegmenterPort } | { readonly kind: 'failed' };

export function createSegmentedBlur(deps: BlurDeps): BlurStage {
  let state: SegmenterState = { kind: 'idle' };
  let busy = false;
  let last = Number.NEGATIVE_INFINITY;
  let smoothed: Float32Array | null = null;
  let bytes: Uint8Array | null = null;
  let closed = false;

  const load = (): void => {
    state = { kind: 'loading' };
    deps.loadSegmenter().then(
      (segmenter) => {
        if (closed) segmenter.close();
        else state = { kind: 'ready', segmenter };
      },
      () => void (state = { kind: 'failed' }),
    );
  };

  const segment = (segmenter: SegmenterPort, bitmap: ImageBitmap): void => {
    try {
      if (closed) return;
      const mask = segmenter.segment(bitmap, deps.now());
      if (mask === null) return;
      smoothed = blendMaskInto(smoothed, mask.data, MASK_SMOOTHING);
      bytes = maskBytes(smoothed, bytes);
      deps.compositor.mask(bytes, mask.width, mask.height);
    } catch {
      return;
    } finally {
      bitmap.close();
      busy = false;
    }
  };

  const maybeSegment = (source: CanvasImageSource, width: number, height: number): void => {
    if (state.kind === 'idle') load();
    if (state.kind !== 'ready' || busy || deps.now() - last < SEGMENT_INTERVAL_MS) return;
    const { segmenter } = state;
    busy = true;
    last = deps.now();
    deps.snapshot(source, width, height).then(
      (bitmap) => deps.schedule(() => segment(segmenter, bitmap)),
      () => void (busy = false),
    );
  };

  return {
    render: (source, width, height) => {
      deps.compositor.render(source, width, height);
      maybeSegment(source, width, height);
      return deps.canvas;
    },
    close: () => {
      closed = true;
      if (state.kind === 'ready') state.segmenter.close();
      deps.compositor.release();
    },
  };
}
