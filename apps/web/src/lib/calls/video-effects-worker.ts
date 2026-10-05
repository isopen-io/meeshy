import { browserFrameEnv } from './video-effects-browser';
import { createEffectsHost, type HostMessage, type HostReply } from './video-effects-host';

/**
 * **LE WORKER DES EFFETS** (#9099) — la colle : `self`, les constructeurs que
 * seul un worker connaît (`VideoTrackGenerator` chez Safari), et l'hôte
 * (`video-effects-host.ts`), où vit toute la logique. Bâti par Vite en worker
 * MODULE (`video-effects-pipeline.ts`) : le modèle de segmentation y reste un
 * chunk chargé à la demande.
 */

type ProcessorCtor = new (init: { readonly track: MediaStreamTrack }) => { readonly readable: ReadableStream<VideoFrame> };
type VideoGeneratorCtor = new () => { readonly track: MediaStreamTrack; readonly writable: WritableStream<VideoFrame> };

type WorkerScope = {
  onmessage: ((event: MessageEvent<HostMessage>) => void) | null;
  readonly postMessage: (message: HostReply, transfer: readonly Transferable[]) => void;
  readonly MediaStreamTrackProcessor?: ProcessorCtor;
  readonly VideoTrackGenerator?: VideoGeneratorCtor;
};

const scope = self as unknown as WorkerScope;
let reduced = false;
const Processor = scope.MediaStreamTrackProcessor;
const Generator = scope.VideoTrackGenerator;

const host = createEffectsHost({
  env: {
    ...browserFrameEnv({ reducedMotion: () => reduced }),
    motion: (value) => void (reduced = value),
    ...(Processor === undefined || Generator === undefined ? {} : { processor: (track: MediaStreamTrack) => new Processor({ track }), generator: () => new Generator() }),
  },
  post: (reply, transfer) => scope.postMessage(reply, transfer),
});

scope.onmessage = (event) => host.receive(event.data);
