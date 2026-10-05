import { lookFilter } from '@/lib/media/photo-develop';

import { faceGrade } from './face-effects';
import { effectsFilter, type FrameSettings, type VideoEffects } from './video-effects';

/**
 * **LE TRAITEMENT D'UNE IMAGE** (#8442, #8551, #9099, #8471, #8441) — le MÊME
 * code dans le worker (`video-effects-worker.ts`, le chemin nominal) et dans
 * le repli du fil principal (`video-effects-pipeline.ts`). Il ne touche à
 * aucune API du document : le canevas, le flou et le calque de visage lui sont
 * remis.
 *
 * Une image, dans l'ordre :
 *
 * 1. le FLOU d'arrière-plan par segmentation (`BlurStage`, compositeur WebGL2),
 *    quand la caméra ne le fait pas elle-même ;
 * 2. sur le canevas 2D : le RECADRAGE du zoom numérique, la couleur
 *    (préréglage, luminosité, étalonnage de l'effet de visage, avec le look
 *    léger des photos, #8695), puis le CALQUE de l'effet de visage
 *    (`FaceLayer`, `face-effects-draw.ts`), piloté par l'heure de l'image.
 *
 * Rien à faire laisse passer l'image telle quelle ; une image qu'on n'a pas su
 * traiter part quand même, originale. Chaque image traitée compte son coût
 * (`timings`) : le relevé part une fois par seconde vers le fil principal.
 */

export type Surface2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type FaceTarget = { readonly context: Surface2D; readonly source: CanvasImageSource; readonly width: number; readonly height: number; readonly t: number };

export type FaceLayer = (target: FaceTarget, effects: VideoEffects) => void;

/** Le flou d'arrière-plan : rend l'image floutée hors de la personne (le canevas du compositeur). */
export type BlurStage = { readonly render: (source: CanvasImageSource, width: number, height: number, t: number) => CanvasImageSource; readonly close: () => void };

export type Surface = { readonly canvas: CanvasImageSource; readonly context: Surface2D; readonly resize: (width: number, height: number) => void };

export type FrameEnv = {
  readonly surface: () => Surface;
  readonly now: () => number;
  readonly face?: FaceLayer;
  /** Bâtit le flou au premier besoin — absent ou `null` : pas de segmentation ici. */
  readonly blur?: () => BlurStage | null;
};

export type Timings = { readonly frames: number; readonly p50: number; readonly p95: number; readonly max: number };

export type FrameEngine = {
  readonly settings: () => FrameSettings;
  readonly set: (settings: FrameSettings) => void;
  /** L'image traitée, ou `null` quand elle part telle quelle. */
  readonly draw: (source: CanvasImageSource, width: number, height: number, t: number) => CanvasImageSource | null;
  readonly record: (duration: number) => void;
  readonly timings: () => Timings;
  readonly close: () => void;
};

const graded = (effects: VideoEffects): readonly string[] => [effectsFilter(effects), faceGrade(effects.faceEffect)].filter((part) => part !== '' && part !== 'none');

const untouched = (effects: VideoEffects): boolean => graded(effects).length === 0 && effects.faceEffect === 'none';

/**
 * Le filtre de canevas de toute l'image : le look léger des photos (#8695,
 * `lookFilter`), la couleur choisie, puis l'étalonnage de l'effet de visage.
 * Le look ne vient qu'avec une couleur ou un visage : une image seulement
 * floutée ou recadrée garde ses couleurs.
 */
export function frameFilter(effects: VideoEffects): string {
  return untouched(effects) ? 'none' : [lookFilter(), ...graded(effects)].join(' ');
}

export type CropRect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** Le centre de l'image que le zoom numérique garde — jamais plus grand que l'image. */
export function cropRect(width: number, height: number, zoom: number): CropRect {
  const scale = Math.max(1, zoom);
  const w = Math.round(width / scale);
  const h = Math.round(height / scale);
  return { x: Math.round((width - w) / 2), y: Math.round((height - h) / 2), width: w, height: h };
}

const percentile = (sorted: readonly number[], rank: number): number => sorted[Math.max(0, Math.ceil(rank * sorted.length) - 1)] ?? 0;

const round = (value: number): number => Math.round(value * 100) / 100;

export function timingsOf(durations: readonly number[]): Timings {
  if (durations.length === 0) return { frames: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...durations].sort((a, b) => a - b);
  return { frames: durations.length, p50: round(percentile(sorted, 0.5)), p95: round(percentile(sorted, 0.95)), max: round(sorted[sorted.length - 1] ?? 0) };
}

const KEPT_TIMINGS = 150;

export function createFrameEngine(initial: FrameSettings, env: FrameEnv): FrameEngine {
  let current = initial;
  let filter = frameFilter(initial.effects);
  let surface: Surface | null = null;
  let blur: BlurStage | null | undefined;
  let durations: readonly number[] = [];

  const blurred = (source: CanvasImageSource, width: number, height: number, t: number): CanvasImageSource => {
    if (!current.segmentBlur) return source;
    blur ??= env.blur?.() ?? null;
    return blur === null ? source : blur.render(source, width, height, t);
  };

  return {
    settings: () => current,
    set: (next) => {
      current = next;
      filter = frameFilter(next.effects);
    },
    draw: (source, width, height, t) => {
      const image = blurred(source, width, height, t);
      const painted = filter !== 'none' || current.effects.faceEffect !== 'none' || current.zoom > 1;
      if (!painted) return image === source ? null : image;
      surface ??= env.surface();
      surface.resize(width, height);
      const { context } = surface;
      context.filter = filter;
      if (current.zoom > 1) {
        const crop = cropRect(width, height, current.zoom);
        context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
      } else context.drawImage(image, 0, 0);
      if (current.effects.faceEffect === 'none' || env.face === undefined) return surface.canvas;
      context.filter = 'none';
      env.face({ context, source: current.zoom > 1 ? surface.canvas : source, width, height, t }, current.effects);
      return surface.canvas;
    },
    record: (duration) => {
      durations = durations.length < KEPT_TIMINGS ? [...durations, duration] : [...durations.slice(1), duration];
    },
    timings: () => timingsOf(durations),
    close: () => {
      blur?.close();
      blur = null;
    },
  };
}

type TransformDeps = {
  readonly engine: FrameEngine;
  readonly frameFrom: (canvas: CanvasImageSource, init: { readonly timestamp: number }) => VideoFrame;
  readonly now: () => number;
  readonly report?: (timings: Timings) => void;
};

const REPORT_EVERY_MS = 1000;

/** Le transformateur d'un flux d'images (`MediaStreamTrackProcessor` → générateur) : chaque image traitée, horodatée, jamais perdue. */
export function frameTransform({ engine, frameFrom, now, report }: TransformDeps): Transformer<VideoFrame, VideoFrame> {
  let reported: number | null = null;
  return {
    transform: (frame, controller) => {
      const started = now();
      let next: VideoFrame = frame;
      try {
        const drawn = engine.draw(frame, frame.displayWidth, frame.displayHeight, frame.timestamp / 1000);
        if (drawn !== null) next = frameFrom(drawn, { timestamp: frame.timestamp });
      } catch {
        next = frame;
      }
      if (next !== frame) {
        frame.close();
        const ended = now();
        engine.record(ended - started);
        reported ??= started;
        if (report !== undefined && ended - reported >= REPORT_EVERY_MS) {
          reported = ended;
          report(engine.timings());
        }
      }
      controller.enqueue(next);
    },
  };
}
