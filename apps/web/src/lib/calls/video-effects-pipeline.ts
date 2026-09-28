import { effectsFilter, type VideoEffects } from './video-effects';

/**
 * **LE TRAITEMENT DES IMAGES ENVOYÉES** (#8442) — un chunk à part
 * (`budgets.json` › `call_video_effects`), chargé par `camera-effects.ts` au
 * premier effet de couleur : qui n'en pose aucun ne le télécharge jamais.
 *
 * Deux chemins, le plus sûr d'abord :
 *
 * - **les images traitables** (`MediaStreamTrackProcessor` → un générateur,
 *   Chrome et la coque Android) : chaque `VideoFrame` est redessinée filtrée
 *   sur un `OffscreenCanvas` et sort avec SON horodatage. Le flux n'est pas
 *   rythmé par l'affichage : un onglet caché continue d'envoyer ;
 * - **le canevas filmé** (`captureStream`) ailleurs, rythmé par chaque image de
 *   la caméra (`requestVideoFrameCallback`) quand le navigateur le sait.
 *
 * Aucune image perdue : un effet change l'image SUIVANTE sans rebâtir la
 * piste, le filtre neutre laisse passer l'image telle quelle, et une image
 * qu'on n'a pas su filtrer part quand même, originale.
 */

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

export type PipelineEnv = { readonly frames: FramesEnv | null; readonly canvas: CanvasEnv | null };

function framesPipeline(camera: MediaStreamTrack, initial: VideoEffects, env: FramesEnv): EffectsPipeline {
  let filter = effectsFilter(initial);
  const { track, writable } = env.generator();
  const surface = env.surface();
  const abort = new AbortController();
  const filtered = (frame: VideoFrame): VideoFrame => {
    if (filter === 'none') return frame;
    try {
      surface.resize(frame.displayWidth, frame.displayHeight);
      surface.context.filter = filter;
      surface.context.drawImage(frame, 0, 0);
      const next = env.frameFrom(surface.canvas, { timestamp: frame.timestamp });
      frame.close();
      return next;
    } catch {
      return frame;
    }
  };
  const transform = new TransformStream<VideoFrame, VideoFrame>({ transform: (frame, controller) => controller.enqueue(filtered(frame)) });
  void env
    .processor(camera)
    .readable.pipeThrough(transform, { signal: abort.signal })
    .pipeTo(writable, { signal: abort.signal })
    .catch(() => undefined);
  return {
    output: track,
    filter: () => filter,
    update: (effects) => void (filter = effectsFilter(effects)),
    stop: () => {
      abort.abort();
      track.stop();
    },
  };
}

function canvasPipeline(camera: MediaStreamTrack, initial: VideoEffects, env: CanvasEnv): EffectsPipeline {
  let filter = effectsFilter(initial);
  let stopped = false;
  const video = env.video(camera);
  const surface = env.surface(camera.getSettings().frameRate ?? 24);
  const output = surface.capture();
  const draw = (): void => {
    if (stopped) return;
    if (video.videoWidth > 0) {
      surface.resize(video.videoWidth, video.videoHeight);
      surface.context.filter = filter;
      surface.context.drawImage(video, 0, 0);
    }
    env.nextFrame(video, draw);
  };
  env.nextFrame(video, draw);
  return {
    output,
    filter: () => filter,
    update: (effects) => void (filter = effectsFilter(effects)),
    stop: () => {
      stopped = true;
      video.pause();
      output.stop();
    },
  };
}

export function createEffectsPipeline(camera: MediaStreamTrack, effects: VideoEffects, env: PipelineEnv = browserPipelineEnv()): EffectsPipeline {
  if (env.frames !== null) return framesPipeline(camera, effects, env.frames);
  if (env.canvas !== null) return canvasPipeline(camera, effects, env.canvas);
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
  return { frames: browserFrames(globalThis as unknown as Record<string, unknown>), canvas: browserCanvas() };
}
