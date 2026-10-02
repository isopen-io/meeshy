import type { FrameSettings } from './video-effects';
import { createFrameEngine, frameTransform, type FrameEngine, type FrameEnv, type Timings } from './video-effects-frames';

/**
 * **LE WORKER DES EFFETS, SANS LE WORKER** (#9099) — ce que le worker
 * (`video-effects-worker.ts`) fait de chaque message, écrit sans `self` pour
 * être témoigné. Le fil principal lui remet, au choix :
 *
 * - les FLUX de la caméra (`MediaStreamTrackProcessor.readable`) et du
 *   générateur (`writable`), transférés — Chrome et la coque Android, où ces
 *   deux objets vivent sur le fil principal ;
 * - une copie de la PISTE caméra, transférée — Safari, où les images ne se
 *   lisent et ne s'écrivent que DANS un worker : le worker bâtit alors sa
 *   piste (`VideoTrackGenerator`) et la renvoie.
 *
 * Dans les deux cas, plus aucune image ne passe par le fil principal : un
 * rendu de l'écran d'appel (un glissé du carrousel) ne peut plus en coûter
 * une. Le worker possède le canevas, le compositeur du flou et le calque de
 * visage, et renvoie son relevé de coût une fois par seconde. Ce que seul le
 * fil principal sait lire — le mouvement réduit — lui arrive par message.
 */

type Start = { readonly kind: 'start'; readonly settings: FrameSettings; readonly reducedMotion?: boolean };

export type HostMessage =
  | (Start & { readonly readable: ReadableStream<VideoFrame>; readonly writable: WritableStream<VideoFrame> })
  | (Start & { readonly track: MediaStreamTrack })
  | { readonly kind: 'update'; readonly settings: FrameSettings }
  | { readonly kind: 'motion'; readonly reduced: boolean }
  | { readonly kind: 'stop' };

export type HostReply = { readonly kind: 'ready'; readonly track: MediaStreamTrack | null } | { readonly kind: 'failed' } | { readonly kind: 'timings'; readonly timings: Timings };

export type HostEnv = FrameEnv & {
  readonly frameFrom: (canvas: CanvasImageSource, init: { readonly timestamp: number }) => VideoFrame;
  readonly processor?: (track: MediaStreamTrack) => { readonly readable: ReadableStream<VideoFrame> };
  readonly generator?: () => { readonly track: MediaStreamTrack; readonly writable: WritableStream<VideoFrame> };
  /** Le mouvement réduit, lu sur le fil principal (`matchMedia` n'existe pas dans un worker) et relayé au calque de visage. */
  readonly motion?: (reduced: boolean) => void;
};

type HostDeps = { readonly env: HostEnv; readonly post: (reply: HostReply, transfer: readonly Transferable[]) => void };

type Running = { readonly engine: FrameEngine; readonly abort: AbortController; readonly tracks: readonly MediaStreamTrack[] };

export function createEffectsHost({ env, post }: HostDeps): { readonly receive: (message: HostMessage) => void } {
  let running: Running | null = null;

  const pump = (settings: FrameSettings, readable: ReadableStream<VideoFrame>, writable: WritableStream<VideoFrame>, tracks: readonly MediaStreamTrack[]): void => {
    const engine = createFrameEngine(settings, env);
    const abort = new AbortController();
    const transform = new TransformStream<VideoFrame, VideoFrame>(frameTransform({ engine, frameFrom: env.frameFrom, now: env.now, report: (timings) => post({ kind: 'timings', timings }, []) }));
    void readable
      .pipeThrough(transform, { signal: abort.signal })
      .pipeTo(writable, { signal: abort.signal })
      .catch(() => undefined);
    running = { engine, abort, tracks };
  };

  const start = (message: Extract<HostMessage, { readonly kind: 'start' }>): void => {
    if (message.reducedMotion !== undefined) env.motion?.(message.reducedMotion);
    if ('readable' in message) {
      pump(message.settings, message.readable, message.writable, []);
      post({ kind: 'ready', track: null }, []);
      return;
    }
    if (env.processor === undefined || env.generator === undefined) {
      message.track.stop();
      post({ kind: 'failed' }, []);
      return;
    }
    const generated = env.generator();
    pump(message.settings, env.processor(message.track).readable, generated.writable, [generated.track, message.track]);
    post({ kind: 'ready', track: generated.track }, [generated.track]);
  };

  const stop = (): void => {
    if (running === null) return;
    running.abort.abort();
    running.engine.close();
    running.tracks.forEach((track) => track.stop());
    running = null;
  };

  return {
    receive: (message) => {
      if (message.kind === 'start') start(message);
      else if (message.kind === 'update') running?.engine.set(message.settings);
      else if (message.kind === 'motion') env.motion?.(message.reduced);
      else stop();
    },
  };
}
