import { lookFilter } from '@/lib/media/photo-develop';

import { faceGrade } from './face-effects';
import { createFaceLayer } from './face-effects-draw';
import { browserFaceDetector } from './face-tracker';
import { effectsFilter, type VideoEffects } from './video-effects';

/**
 * **LE TRAITEMENT DES IMAGES ENVOYÉES** (#8442, #8551) — un chunk à part
 * (`budgets.json` › `call_video_effects`), chargé par `camera-effects.ts` au
 * premier effet de couleur ou de visage : qui n'en pose aucun ne le
 * télécharge jamais.
 *
 * Deux chemins, le plus sûr d'abord :
 *
 * - **les images traitables** (`MediaStreamTrackProcessor` → un générateur,
 *   Chrome et la coque Android) : chaque `VideoFrame` est redessinée sur un
 *   `OffscreenCanvas` et sort avec SON horodatage. Le flux n'est pas rythmé
 *   par l'affichage : un onglet caché continue d'envoyer ;
 * - **le canevas filmé** (`captureStream`) ailleurs, rythmé par chaque image de
 *   la caméra (`requestVideoFrameCallback`) quand le navigateur le sait.
 *
 * Chaque image reçoit la couleur (préréglage, luminosité, étalonnage de
 * l'effet de visage), puis le CALQUE de l'effet de visage (`FaceLayer`,
 * `face-effects-draw.ts`), piloté par l'heure de l'image. Aucune image
 * perdue : un effet change l'image SUIVANTE sans rebâtir la piste, rien à
 * faire laisse passer l'image telle quelle, et une image qu'on n'a pas su
 * traiter part quand même, originale.
 */

type Surface2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type FaceTarget = { readonly context: Surface2D; readonly source: CanvasImageSource; readonly width: number; readonly height: number; readonly t: number };

export type FaceLayer = (target: FaceTarget, effects: VideoEffects) => void;

export type EffectsPipeline = {
  readonly output: MediaStreamTrack;
  readonly filter: () => string;
  readonly update: (effects: VideoEffects) => void;
  readonly stop: () => void;
};

type FramesEnv = {
  readonly processor: (camera: MediaStreamTrack) => { readonly readable: ReadableStream<VideoFrame> };
  readonly generator: () => { readonly track: MediaStreamTrack; readonly writable: WritableStream<VideoFrame> };
  readonly surface: () => { readonly canvas: CanvasImageSource; readonly context: OffscreenCanvasRenderingContext2D; readonly resize: (width: number, height: number) => void };
  readonly frameFrom: (canvas: CanvasImageSource, init: { readonly timestamp: number }) => VideoFrame;
};

type CanvasEnv = {
  readonly video: (camera: MediaStreamTrack) => HTMLVideoElement;
  readonly surface: (frameRate: number) => { readonly context: CanvasRenderingContext2D; readonly resize: (width: number, height: number) => void; readonly capture: () => MediaStreamTrack };
  readonly nextFrame: (video: HTMLVideoElement, draw: () => void) => void;
};

export type PipelineEnv = { readonly frames: FramesEnv | null; readonly canvas: CanvasEnv | null; readonly face?: FaceLayer };

const graded = (effects: VideoEffects): readonly string[] => [effectsFilter(effects), faceGrade(effects.faceEffect)].filter((part) => part !== '' && part !== 'none');

const untouched = (effects: VideoEffects): boolean => graded(effects).length === 0 && effects.faceEffect === 'none';

/**
 * Le filtre de canevas de toute l'image : le look léger des photos (#8695,
 * `lookFilter`), la couleur choisie, puis l'étalonnage de l'effet de visage.
 * Le look ne vient qu'avec une image DÉJÀ repeinte : il ne coûte aucun
 * traitement de plus, et une image intacte part intacte.
 */
export function frameFilter(effects: VideoEffects): string {
  return untouched(effects) ? 'none' : [lookFilter(), ...graded(effects)].join(' ');
}

type Painter = { readonly effects: () => VideoEffects; readonly set: (effects: VideoEffects) => void; readonly paint: (context: Surface2D, source: CanvasImageSource, width: number, height: number, t: number) => void };

function painter(initial: VideoEffects, face: FaceLayer | undefined): Painter {
  let current = initial;
  let filter = frameFilter(initial);
  return {
    effects: () => current,
    set: (next) => {
      current = next;
      filter = frameFilter(next);
    },
    paint: (context, source, width, height, t) => {
      context.filter = filter;
      context.drawImage(source, 0, 0);
      if (current.faceEffect === 'none' || face === undefined) return;
      context.filter = 'none';
      face({ context, source, width, height, t }, current);
    },
  };
}

function framesPipeline(camera: MediaStreamTrack, initial: VideoEffects, env: FramesEnv, face: FaceLayer | undefined): EffectsPipeline {
  const paint = painter(initial, face);
  const { track, writable } = env.generator();
  const surface = env.surface();
  const abort = new AbortController();
  const processed = (frame: VideoFrame): VideoFrame => {
    if (untouched(paint.effects())) return frame;
    try {
      surface.resize(frame.displayWidth, frame.displayHeight);
      paint.paint(surface.context, frame, frame.displayWidth, frame.displayHeight, frame.timestamp / 1000);
      const next = env.frameFrom(surface.canvas, { timestamp: frame.timestamp });
      frame.close();
      return next;
    } catch {
      return frame;
    }
  };
  const transform = new TransformStream<VideoFrame, VideoFrame>({ transform: (frame, controller) => controller.enqueue(processed(frame)) });
  void env
    .processor(camera)
    .readable.pipeThrough(transform, { signal: abort.signal })
    .pipeTo(writable, { signal: abort.signal })
    .catch(() => undefined);
  return {
    output: track,
    filter: () => frameFilter(paint.effects()),
    update: paint.set,
    stop: () => {
      abort.abort();
      track.stop();
    },
  };
}

function canvasPipeline(camera: MediaStreamTrack, initial: VideoEffects, env: CanvasEnv, face: FaceLayer | undefined): EffectsPipeline {
  const paint = painter(initial, face);
  let stopped = false;
  const video = env.video(camera);
  const surface = env.surface(camera.getSettings().frameRate ?? 24);
  const output = surface.capture();
  const draw = (): void => {
    if (stopped) return;
    if (video.videoWidth > 0) {
      surface.resize(video.videoWidth, video.videoHeight);
      paint.paint(surface.context, video, video.videoWidth, video.videoHeight, typeof performance === 'undefined' ? Date.now() : performance.now());
    }
    env.nextFrame(video, draw);
  };
  env.nextFrame(video, draw);
  return {
    output,
    filter: () => frameFilter(paint.effects()),
    update: paint.set,
    stop: () => {
      stopped = true;
      video.pause();
      output.stop();
    },
  };
}

export function createEffectsPipeline(camera: MediaStreamTrack, effects: VideoEffects, env: PipelineEnv = browserPipelineEnv()): EffectsPipeline {
  if (env.frames !== null) return framesPipeline(camera, effects, env.frames, env.face);
  if (env.canvas !== null) return canvasPipeline(camera, effects, env.canvas, env.face);
  throw new Error('video-effects: no pipeline');
}

type ProcessorCtor = new (init: { readonly track: MediaStreamTrack }) => { readonly readable: ReadableStream<VideoFrame> };
type TrackGeneratorCtor = new (init: { readonly kind: 'video' }) => MediaStreamTrack & { readonly writable: WritableStream<VideoFrame> };
type VideoGeneratorCtor = new () => { readonly track: MediaStreamTrack; readonly writable: WritableStream<VideoFrame> };
type RvfcVideo = HTMLVideoElement & { readonly requestVideoFrameCallback?: (callback: () => void) => number };

function browserFrames(scope: Record<string, unknown>): FramesEnv | null {
  const Processor = scope.MediaStreamTrackProcessor as ProcessorCtor | undefined;
  const TrackGenerator = scope.MediaStreamTrackGenerator as TrackGeneratorCtor | undefined;
  const VideoGenerator = scope.VideoTrackGenerator as VideoGeneratorCtor | undefined;
  if (Processor === undefined || (TrackGenerator === undefined && VideoGenerator === undefined) || typeof OffscreenCanvas === 'undefined') return null;
  return {
    processor: (track) => new Processor({ track }),
    generator: () => {
      if (VideoGenerator !== undefined) return new VideoGenerator();
      const generator = new (TrackGenerator as TrackGeneratorCtor)({ kind: 'video' });
      return { track: generator, writable: generator.writable };
    },
    surface: () => {
      const canvas = new OffscreenCanvas(1, 1);
      const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
      return { canvas, context, resize: (width, height) => void (canvas.width !== width || canvas.height !== height ? Object.assign(canvas, { width, height }) : undefined) };
    },
    frameFrom: (canvas, init) => new VideoFrame(canvas, init),
  };
}

function browserCanvas(): CanvasEnv | null {
  if (typeof document === 'undefined') return null;
  return {
    video: (camera) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = new MediaStream([camera]);
      void video.play().catch(() => undefined);
      return video;
    },
    surface: (frameRate) => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d') as CanvasRenderingContext2D;
      return {
        context,
        resize: (width, height) => void (canvas.width !== width || canvas.height !== height ? Object.assign(canvas, { width, height }) : undefined),
        capture: () => canvas.captureStream(frameRate).getVideoTracks()[0] as MediaStreamTrack,
      };
    },
    nextFrame: (video, draw) => {
      const rvfc = (video as RvfcVideo).requestVideoFrameCallback;
      if (typeof rvfc === 'function') rvfc.call(video, draw);
      else setTimeout(draw, 1000 / 30);
    },
  };
}

export function browserPipelineEnv(): PipelineEnv {
  return { frames: browserFrames(globalThis as unknown as Record<string, unknown>), canvas: browserCanvas(), face: createFaceLayer(browserFaceDetector()) };
}
