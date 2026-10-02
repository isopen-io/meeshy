import type { FrameSettings } from './video-effects';
import type { LocalFrameEnv } from './video-effects-browser';
import { createFrameEngine, frameTransform, type FrameEngine, type Timings } from './video-effects-frames';
import type { HostMessage, HostReply } from './video-effects-host';

export type { FaceLayer, FaceTarget } from './video-effects-frames';

/**
 * **LE TRAITEMENT DES IMAGES ENVOYÉES** (#8442, #8551, #9099) — un chunk à part
 * (`budgets.json` › `call_video_effects`), chargé par `camera-effects.ts`
 * quand une image doit changer : qui ne pose aucun effet ne le télécharge
 * jamais, et une caméra sans effet part BRUTE.
 *
 * Le traitement vit dans un WORKER (`video-effects-worker.ts`), le plus sûr
 * d'abord :
 *
 * - **les flux transférés** (Chrome, la coque Android) : le
 *   `MediaStreamTrackProcessor` et le générateur naissent ici, leurs flux
 *   partent au worker — plus aucune image ne passe par le fil principal ;
 * - **la piste transférée** (Safari, où les images ne se lisent que dans un
 *   worker) : une COPIE de la caméra part, le worker renvoie sa piste.
 *
 * Le fil principal ne traite lui-même qu'en REPLI — pas de worker, un worker
 * qui refuse ou se tait (`readyTimeoutMs`) : les images traitables ici, sinon
 * le canevas filmé (`captureStream`), qui rend à l'arrêt sa vidéo et son
 * canevas. Le MÊME traitement (`video-effects-frames.ts`) sert partout.
 *
 * Le coût de chaque image est publié une fois par seconde en marque
 * `meeshy-call-effects` (la dernière seule est gardée) :
 * `check-calls-effects-perf.mjs` la lit.
 */

export type EffectsPipeline = {
  readonly output: MediaStreamTrack;
  readonly update: (settings: FrameSettings) => void;
  readonly stop: () => void;
};

export type WorkerPort = {
  readonly post: (message: HostMessage, transfer: readonly Transferable[]) => void;
  readonly listen: (handler: (reply: HostReply) => void) => void;
  readonly terminate: () => void;
};

type MotionPort = { readonly read: () => boolean; readonly watch: (listener: (reduced: boolean) => void) => () => void };

type FramesEnv = {
  readonly processor: (camera: MediaStreamTrack) => { readonly readable: ReadableStream<VideoFrame> };
  readonly generator: () => { readonly track: MediaStreamTrack; readonly writable: WritableStream<VideoFrame> };
};

type CanvasEnv = {
  readonly video: (camera: MediaStreamTrack) => HTMLVideoElement;
  readonly surface: (frameRate: number) => {
    readonly canvas: CanvasImageSource;
    readonly context: CanvasRenderingContext2D;
    readonly resize: (width: number, height: number) => void;
    readonly capture: () => MediaStreamTrack;
    readonly release: () => void;
  };
  readonly nextFrame: (video: HTMLVideoElement, draw: () => void) => void;
};

export type PipelineEnv = {
  readonly worker: (() => WorkerPort) | null;
  readonly frames: FramesEnv | null;
  readonly canvas: CanvasEnv | null;
  /** Ce que le fil principal reçoit pour traiter lui-même, en repli — chargé alors seulement. */
  readonly local: () => Promise<LocalFrameEnv>;
  readonly motion?: MotionPort;
  readonly mark?: (timings: Timings) => void;
  readonly readyTimeoutMs?: number;
};

const READY_TIMEOUT_MS = 3000;

type Ready = { readonly kind: 'ready'; readonly track: MediaStreamTrack | null } | { readonly kind: 'refused' };

/** Le premier mot du worker : prêt (et sa piste, s'il l'a bâtie), ou refusé — un silence passé le délai vaut refus. */
function firstWord(worker: WorkerPort, env: PipelineEnv): Promise<Ready> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ kind: 'refused' }), env.readyTimeoutMs ?? READY_TIMEOUT_MS);
    worker.listen((reply) => {
      if (reply.kind === 'timings') {
        env.mark?.(reply.timings);
        return;
      }
      clearTimeout(timer);
      resolve(reply.kind === 'ready' ? { kind: 'ready', track: reply.track } : { kind: 'refused' });
    });
  });
}

function workerPipeline(output: MediaStreamTrack, worker: WorkerPort, unwatch: () => void): EffectsPipeline {
  return {
    output,
    update: (settings) => worker.post({ kind: 'update', settings }, []),
    stop: () => {
      unwatch();
      worker.post({ kind: 'stop' }, []);
      worker.terminate();
      output.stop();
    },
  };
}

type Handoff = { readonly start: (worker: WorkerPort, reducedMotion: boolean) => MediaStreamTrack | null; readonly abandon: () => void };

async function inWorker(handoff: Handoff, settings: FrameSettings, env: PipelineEnv & { readonly worker: () => WorkerPort }): Promise<EffectsPipeline | null> {
  const worker = env.worker();
  const reducedMotion = env.motion?.read() ?? false;
  const word = firstWord(worker, env);
  const local = (() => {
    try {
      return { posted: handoff.start(worker, reducedMotion) };
    } catch {
      return null;
    }
  })();
  const answer = local === null ? ({ kind: 'refused' } as const) : await word;
  const output = answer.kind === 'ready' ? (answer.track ?? local?.posted ?? null) : null;
  if (output === null) {
    worker.terminate();
    handoff.abandon();
    return null;
  }
  const unwatch = env.motion?.watch((reduced) => worker.post({ kind: 'motion', reduced }, [])) ?? (() => undefined);
  return workerPipeline(output, worker, unwatch);
}

function streamsHandoff(camera: MediaStreamTrack, settings: FrameSettings, frames: FramesEnv): Handoff {
  const generated = frames.generator();
  return {
    start: (worker, reducedMotion) => {
      const { readable } = frames.processor(camera);
      worker.post({ kind: 'start', settings, reducedMotion, readable, writable: generated.writable }, [readable, generated.writable]);
      return generated.track;
    },
    abandon: () => generated.track.stop(),
  };
}

function trackHandoff(camera: MediaStreamTrack, settings: FrameSettings): Handoff {
  const copy = camera.clone();
  return {
    start: (worker, reducedMotion) => {
      worker.post({ kind: 'start', settings, reducedMotion, track: copy }, [copy]);
      return null;
    },
    abandon: () => copy.stop(),
  };
}

const marked = (engine: FrameEngine, env: PipelineEnv, now: () => number) => {
  let reported: number | null = null;
  return (duration: number): void => {
    engine.record(duration);
    const at = now();
    reported ??= at;
    if (env.mark === undefined || at - reported < 1000) return;
    reported = at;
    env.mark(engine.timings());
  };
};

function framesPipeline(camera: MediaStreamTrack, initial: FrameSettings, frames: FramesEnv, env: PipelineEnv, local: LocalFrameEnv): EffectsPipeline {
  const engine = createFrameEngine(initial, local);
  const { track, writable } = frames.generator();
  const abort = new AbortController();
  const transform = new TransformStream<VideoFrame, VideoFrame>(frameTransform({ engine, frameFrom: local.frameFrom, now: local.now, ...(env.mark === undefined ? {} : { report: env.mark }) }));
  void frames
    .processor(camera)
    .readable.pipeThrough(transform, { signal: abort.signal })
    .pipeTo(writable, { signal: abort.signal })
    .catch(() => undefined);
  return {
    output: track,
    update: engine.set,
    stop: () => {
      abort.abort();
      engine.close();
      track.stop();
    },
  };
}

function canvasPipeline(camera: MediaStreamTrack, initial: FrameSettings, canvas: CanvasEnv, env: PipelineEnv, local: LocalFrameEnv): EffectsPipeline {
  const video = canvas.video(camera);
  const surface = canvas.surface(camera.getSettings().frameRate ?? 24);
  const engine = createFrameEngine(initial, { ...local, surface: () => surface });
  const record = marked(engine, env, local.now);
  const output = surface.capture();
  let stopped = false;
  const draw = (): void => {
    if (stopped) return;
    const { videoWidth: width, videoHeight: height } = video;
    if (width > 0) {
      const started = local.now();
      surface.resize(width, height);
      const drawn = engine.draw(video, width, height, started);
      if (drawn !== surface.canvas) {
        surface.context.filter = 'none';
        surface.context.drawImage(drawn ?? video, 0, 0);
      }
      record(local.now() - started);
    }
    canvas.nextFrame(video, draw);
  };
  canvas.nextFrame(video, draw);
  return {
    output,
    update: engine.set,
    stop: () => {
      stopped = true;
      engine.close();
      video.pause();
      video.srcObject = null;
      surface.release();
      output.stop();
    },
  };
}

export async function createEffectsPipeline(camera: MediaStreamTrack, settings: FrameSettings, env: PipelineEnv = browserPipelineEnv()): Promise<EffectsPipeline> {
  const spawn = env.worker;
  if (spawn !== null) {
    const handoff = env.frames !== null ? streamsHandoff(camera, settings, env.frames) : trackHandoff(camera, settings);
    const pipeline = await inWorker(handoff, settings, { ...env, worker: spawn });
    if (pipeline !== null) return pipeline;
  }
  if (env.frames === null && env.canvas === null) throw new Error('video-effects: no pipeline');
  const local = await env.local();
  if (env.frames !== null) return framesPipeline(camera, settings, env.frames, env, local);
  return canvasPipeline(camera, settings, env.canvas as CanvasEnv, env, local);
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
        canvas,
        context,
        resize: (width, height) => void (canvas.width !== width || canvas.height !== height ? Object.assign(canvas, { width, height }) : undefined),
        capture: () => canvas.captureStream(frameRate).getVideoTracks()[0] as MediaStreamTrack,
        release: () => void Object.assign(canvas, { width: 0, height: 0 }),
      };
    },
    nextFrame: (video, draw) => {
      const rvfc = (video as RvfcVideo).requestVideoFrameCallback;
      if (typeof rvfc === 'function') rvfc.call(video, draw);
      else setTimeout(draw, 1000 / 30);
    },
  };
}

function browserWorker(): (() => WorkerPort) | null {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof VideoFrame === 'undefined') return null;
  return () => {
    const worker = new Worker(new URL('./video-effects-worker.ts', import.meta.url), { type: 'module', name: 'meeshy-call-effects' });
    return {
      post: (message, transfer) => worker.postMessage(message, [...transfer]),
      listen: (handler) => {
        worker.onmessage = (event: MessageEvent<HostReply>) => handler(event.data);
        worker.onerror = () => handler({ kind: 'failed' });
      },
      terminate: () => worker.terminate(),
    };
  };
}

function browserMotion(): MotionPort | undefined {
  if (typeof matchMedia !== 'function') return undefined;
  const query = matchMedia('(prefers-reduced-motion: reduce)');
  return {
    read: () => query.matches,
    watch: (listener) => {
      const changed = (event: MediaQueryListEvent): void => listener(event.matches);
      query.addEventListener('change', changed);
      return () => query.removeEventListener('change', changed);
    },
  };
}

const MARK = 'meeshy-call-effects';

function browserMark(timings: Timings): void {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return;
  performance.clearMarks(MARK);
  performance.mark(MARK, { detail: timings });
}

export function browserPipelineEnv(): PipelineEnv {
  const motion = browserMotion();
  return {
    worker: browserWorker(),
    frames: browserFrames(globalThis as unknown as Record<string, unknown>),
    canvas: browserCanvas(),
    local: () => import('./video-effects-browser').then((module) => module.browserMainFrameEnv()),
    mark: browserMark,
    ...(motion === undefined ? {} : { motion }),
  };
}
