import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { CameraEffectsPort } from '@/lib/calls/camera-effects';
import { createCaptions } from '@/lib/calls/call-captions-controller';
import { createCallStore, type CallStoreApi } from '@/lib/calls/call-store';
import { bindCallTransport, resetCallTransportForTests, type CallTransport } from '@/lib/calls/call-transport';
import type { QualityTick } from '@/lib/calls/call-quality-loop';
import { createCallEngine, QUALITY_INTERVAL_MS, type CallEngineDeps, type StartCallRequest } from '@/lib/calls/engine';
import type { LinkState, PeerLink, PeerLinkDeps } from '@/lib/calls/peer-link';

/**
 * LE MOTEUR D'APPEL SANS NAVIGATEUR — la passerelle, les liens WebRTC, les
 * médias et l'horloge en doublures, partagés par `engine.test.ts` et
 * `engine-preview.test.ts` (#8480) : ces témoins prouvent le PROTOCOLE (qui
 * émet quoi, dans quel ordre) et les ÉTATS que l'écran lit.
 */

export const ME = 'u-me';
export const PEER = 'u-peer';

export type FakeTrack = { kind: 'audio' | 'video'; enabled: boolean; readyState: 'live' | 'ended'; onended: (() => void) | null; stop: () => void };

export const track = (kind: 'audio' | 'video'): FakeTrack => {
  const self: FakeTrack = { kind, enabled: true, readyState: 'live', onended: null, stop: () => (self.readyState = 'ended') };
  return self;
};

/* Doublure de `MediaStream` : happy-dom n'en fournit pas. */
export const stream = (tracks: readonly FakeTrack[]): MediaStream => {
  let list = [...tracks];
  const fake = {
    getTracks: () => list,
    getAudioTracks: () => list.filter((t) => t.kind === 'audio'),
    getVideoTracks: () => list.filter((t) => t.kind === 'video'),
    addTrack: (t: FakeTrack) => (list = [...list, t]),
    removeTrack: (t: FakeTrack) => (list = list.filter((x) => x !== t)),
  };
  return fake as unknown as MediaStream;
};

export type FakeLink = PeerLink & { readonly deps: PeerLinkDeps; offers: number; closed: boolean; received: string[]; sent: unknown[] };

export function harness(options: { readonly acks?: Record<string, unknown>; readonly activeCallId?: string | null; readonly mediaError?: Error; readonly displayError?: Error; readonly quality?: () => QualityTick | null; readonly random?: number; readonly cameraEffects?: CameraEffectsPort } = {}) {
  resetCallTransportForTests();
  const store: CallStoreApi = createCallStore();
  const emitted: Array<readonly [string, unknown]> = [];
  const requested: Array<readonly [string, unknown]> = [];
  const links: FakeLink[] = [];
  const timers = new Map<number, { fn: () => void; at: number }>();
  const tones: string[] = [];
  const displays: FakeTrack[] = [];
  const cameras: FakeTrack[] = [];
  const repeats: Array<{ readonly fn: () => void; readonly ms: number; stopped: boolean }> = [];
  const networkListeners: Array<() => void> = [];
  let clock = 1_000;
  let nextTimer = 1;
  const acks: Record<string, unknown> = { [CLIENT_EVENTS.CALL_INITIATE]: { success: true, data: { callId: 'call-1', mode: 'p2p', iceServers: [{ urls: 'stun:stun.example' }] } }, [CLIENT_EVENTS.CALL_JOIN]: { success: true, data: { callSession: { participants: [] }, iceServers: [] } }, ...options.acks };

  const transport: CallTransport = {
    connected: () => true,
    emit: (event, payload) => void emitted.push([event, payload]),
    request: async (event, payload) => {
      requested.push([event, payload]);
      return acks[event] ?? { success: true, data: {} };
    },
  };
  const binding = bindCallTransport(transport);

  const deps: CallEngineDeps = {
    store,
    transport: () => transport,
    viewerId: () => ME,
    fetchActiveCallId: async () => options.activeCallId ?? null,
    acquireMedia: async ({ video }) => {
      if (options.mediaError !== undefined) throw options.mediaError;
      return stream(video ? [track('audio'), track('video')] : [track('audio')]);
    },
    acquireCamera: async () => {
      const camera = track('video');
      cameras.push(camera);
      return camera as unknown as MediaStreamTrack;
    },
    acquireDisplay: async () => {
      if (options.displayError !== undefined) throw options.displayError;
      const display = track('video');
      displays.push(display);
      return display as unknown as MediaStreamTrack;
    },
    createLink: (linkDeps) => {
      const link: FakeLink = {
        deps: linkDeps,
        offers: 0,
        closed: false,
        received: [],
        sent: [],
        offer: async () => void (link.offers += 1),
        receiveDescription: async (description) => void link.received.push(description.type),
        receiveCandidate: async () => void link.received.push('candidate'),
        setVideoTrack: async (sent) => void link.sent.push(sent),
        setAudioTrack: async (sent) => void link.sent.push(sent),
        setIceServers: () => undefined,
        connection: () => ({}) as RTCPeerConnection,
        close: () => void (link.closed = true),
      };
      links.push(link);
      return link;
    },
    createStream: (tracks) => stream(tracks as unknown as FakeTrack[]),
    now: () => clock,
    schedule: (fn, ms) => {
      const id = nextTimer++;
      timers.set(id, { fn, at: clock + ms });
      return id;
    },
    cancel: (handle) => void timers.delete(handle as number),
    repeat: (fn, ms) => repeats.push({ fn, ms, stopped: false }) - 1,
    stopRepeat: (handle) => {
      const entry = repeats[handle as number];
      if (entry !== undefined) entry.stopped = true;
    },
    createQualityLoop: () => ({ tick: async () => options.quality?.() ?? null }),
    watchNetwork: (onChange) => {
      networkListeners.push(onChange);
      return () => void networkListeners.splice(networkListeners.indexOf(onChange), 1);
    },
    platform: () => 'web',
    deviceModel: () => 'Chrome · Linux',
    tones: { start: (kind) => void tones.push(`start:${kind}`), stop: () => void tones.push('stop'), cue: (kind) => void tones.push(`cue:${kind}`), prime: () => undefined },
    ringLabel: () => 'Appel entrant',
    random: () => options.random ?? 0.99,
    createCaptions: (ctx) => createCaptions(ctx, { speech: null, language: () => 'fr', viewerName: () => 'Moi', newId: () => 'w-1' }),
    ...(options.cameraEffects === undefined ? {} : { cameraEffects: options.cameraEffects }),
  };
  const engine = createCallEngine(deps);

  const advance = (ms: number): void => {
    clock += ms;
    for (const [id, timer] of [...timers.entries()].sort((a, b) => a[1].at - b[1].at)) {
      if (timer.at <= clock) {
        timers.delete(id);
        timer.fn();
      }
    }
  };
  const call = () => store.getState().call;
  const names = (list: ReadonlyArray<readonly [string, unknown]>) => list.map(([event]) => event);
  const linkState = (link: FakeLink, state: LinkState) => link.deps.onState(state);
  const sampleQuality = async (): Promise<void> => {
    for (const entry of repeats.filter((candidate) => candidate.ms === QUALITY_INTERVAL_MS && !candidate.stopped)) entry.fn();
    await flush();
  };
  const networkChanged = (): void => networkListeners.forEach((listener) => listener());

  return { engine, store, emitted, requested, links, tones, displays, cameras, advance, call, names, linkState, binding, sampleQuality, networkChanged };
}

export const DIRECT: StartCallRequest = { conversationId: 'c-1', media: 'audio', title: 'Amina', avatar: null, isGroup: false };

export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
