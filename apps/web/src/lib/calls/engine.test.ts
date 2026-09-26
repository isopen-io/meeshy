import { afterEach, describe, expect, test } from 'bun:test';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { createCallStore, type CallStoreApi } from './call-store';
import { bindCallTransport, resetCallTransportForTests, type CallTransport } from './call-transport';
import { createCallEngine, OUTGOING_RING_TIMEOUT_MS, type CallEngineDeps, type StartCallRequest } from './engine';
import type { LinkState, PeerLink, PeerLinkDeps } from './peer-link';

/**
 * LE MOTEUR D'APPEL, DE BOUT EN BOUT SANS NAVIGATEUR (#6382, #8044) — la
 * passerelle, les liens WebRTC, les médias et l'horloge sont des doublures :
 * ces témoins prouvent le PROTOCOLE (qui émet quoi, dans quel ordre) et les
 * ÉTATS que l'écran lit, miroirs de `CallManager.swift`.
 */

const ME = 'u-me';
const PEER = 'u-peer';

type FakeTrack = { kind: 'audio' | 'video'; enabled: boolean; readyState: 'live' | 'ended'; stop: () => void };

const track = (kind: 'audio' | 'video'): FakeTrack => {
  const self: FakeTrack = { kind, enabled: true, readyState: 'live', stop: () => (self.readyState = 'ended') };
  return self;
};

/* Doublure de `MediaStream` : happy-dom n'en fournit pas. */
const stream = (tracks: readonly FakeTrack[]): MediaStream => {
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

type FakeLink = PeerLink & { readonly deps: PeerLinkDeps; offers: number; closed: boolean; received: string[] };

function harness(options: { readonly acks?: Record<string, unknown>; readonly activeCallId?: string | null; readonly mediaError?: Error } = {}) {
  resetCallTransportForTests();
  const store: CallStoreApi = createCallStore();
  const emitted: Array<readonly [string, unknown]> = [];
  const requested: Array<readonly [string, unknown]> = [];
  const links: FakeLink[] = [];
  const timers = new Map<number, { fn: () => void; at: number }>();
  const tones: string[] = [];
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
    acquireCamera: async () => track('video') as unknown as MediaStreamTrack,
    createLink: (linkDeps) => {
      const link: FakeLink = {
        deps: linkDeps,
        offers: 0,
        closed: false,
        received: [],
        offer: async () => void (link.offers += 1),
        receiveDescription: async (description) => void link.received.push(description.type),
        receiveCandidate: async () => void link.received.push('candidate'),
        setVideoTrack: async () => undefined,
        setAudioTrack: async () => undefined,
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
    repeat: () => -1,
    stopRepeat: () => undefined,
    tones: { start: (kind) => void tones.push(`start:${kind}`), stop: () => void tones.push('stop'), cue: (kind) => void tones.push(`cue:${kind}`), prime: () => undefined },
    ringLabel: () => 'Appel entrant',
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

  return { engine, store, emitted, requested, links, tones, advance, call, names, linkState, binding };
}

const DIRECT: StartCallRequest = { conversationId: 'c-1', media: 'audio', title: 'Amina', avatar: null, isGroup: false };

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => resetCallTransportForTests());

describe('appel sortant', () => {
  test('force-leave, puis initiate ; sonnerie de retour et callId reçu', async () => {
    const h = harness();
    await h.engine.start(DIRECT);
    expect(h.names(h.emitted)).toContain(CLIENT_EVENTS.CALL_FORCE_LEAVE);
    expect(h.names(h.requested)).toEqual([CLIENT_EVENTS.CALL_INITIATE]);
    expect(h.requested[0]?.[1]).toMatchObject({ conversationId: 'c-1', type: 'audio' });
    expect(h.call()?.callId).toBe('call-1');
    expect(h.call()?.phase.kind).toBe('outgoing');
    expect(h.tones).toContain('start:ringback');
  });

  test('le pair qui rejoint reçoit L’OFFRE de celui qui est déjà là, et la connexion passe l’appel en « connecté »', async () => {
    const h = harness();
    await h.engine.start(DIRECT);
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, { callId: 'call-1', participant: { id: 'p-2', userId: PEER, username: 'amina', displayName: 'Amina', isAudioEnabled: true, isVideoEnabled: false } });
    expect(h.links).toHaveLength(1);
    expect(h.links[0]?.offers).toBe(1);
    expect(h.call()?.phase.kind).toBe('connecting');
    h.linkState(h.links[0] as FakeLink, 'connected');
    expect(h.call()?.phase.kind).toBe('connected');
    expect(h.call()?.connectedAt).not.toBeNull();
    expect(h.tones).toContain('cue:connected');
  });

  test('les signaux sortants portent from/to et le callId', async () => {
    const h = harness();
    await h.engine.start(DIRECT);
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, { callId: 'call-1', participant: { id: 'p-2', userId: PEER, username: 'amina' } });
    h.links[0]?.deps.send({ type: 'offer', sdp: 'v=0', negotiationId: 1 });
    const signal = h.emitted.find(([event]) => event === CLIENT_EVENTS.CALL_SIGNAL);
    expect(signal?.[1]).toEqual({ callId: 'call-1', signal: { type: 'offer', sdp: 'v=0', negotiationId: 1, from: ME, to: PEER } });
  });

  test('sans réponse en 45 s, l’appel se termine « sans réponse » et le serveur l’apprend', async () => {
    const h = harness();
    await h.engine.start(DIRECT);
    h.advance(OUTGOING_RING_TIMEOUT_MS);
    expect(h.call()?.phase).toEqual({ kind: 'ended', reason: 'missed', detail: null });
    expect(h.names(h.requested)).toContain(CLIENT_EVENTS.CALL_END);
  });

  test('un micro refusé termine l’appel sur « permission » sans rien émettre', async () => {
    const h = harness({ mediaError: Object.assign(new Error('denied'), { name: 'NotAllowedError' }) });
    await h.engine.start(DIRECT);
    expect(h.call()?.phase).toMatchObject({ kind: 'ended', reason: 'permission' });
    expect(h.requested).toHaveLength(0);
  });

  test('CALL_ALREADY_ACTIVE : l’appel en cours de la conversation est REJOINT', async () => {
    const h = harness({ acks: { [CLIENT_EVENTS.CALL_INITIATE]: { success: false, error: { code: 'CALL_ALREADY_ACTIVE' } } }, activeCallId: 'call-live' });
    await h.engine.start(DIRECT);
    expect(h.names(h.requested)).toEqual([CLIENT_EVENTS.CALL_INITIATE, CLIENT_EVENTS.CALL_JOIN]);
    expect(h.requested[1]?.[1]).toMatchObject({ callId: 'call-live' });
    expect(h.call()?.callId).toBe('call-live');
  });

  test('un deuxième appel pendant un appel vivant est refusé par un avis', async () => {
    const h = harness();
    await h.engine.start(DIRECT);
    await h.engine.start({ ...DIRECT, conversationId: 'c-2' });
    expect(h.store.getState().notice).toBe('already-in-call');
    expect(h.call()?.conversationId).toBe('c-1');
  });
});

describe('appel entrant', () => {
  const initiated = { callId: 'call-9', conversationId: 'c-1', mode: 'p2p', type: 'video', initiator: { userId: PEER, username: 'amina', displayName: 'Amina', avatar: null }, participants: [] };

  test('sonne, puis « Accepter » rejoint avec la caméra', async () => {
    const h = harness();
    h.engine.handle(SERVER_EVENTS.CALL_INITIATED, initiated);
    expect(h.call()?.phase.kind).toBe('incoming');
    expect(h.call()?.title).toBe('Amina');
    expect(h.tones).toContain('start:ring');
    await h.engine.accept();
    expect(h.requested[0]).toEqual([CLIENT_EVENTS.CALL_JOIN, { callId: 'call-9', settings: { audioEnabled: true, videoEnabled: true } }]);
    expect(h.call()?.phase.kind).toBe('connecting');
  });

  test('« Répondre sans vidéo » rejoint un appel vidéo micro seul', async () => {
    const h = harness();
    h.engine.handle(SERVER_EVENTS.CALL_INITIATED, initiated);
    await h.engine.accept({ audioOnly: true });
    expect(h.requested[0]?.[1]).toMatchObject({ settings: { videoEnabled: false } });
    expect(h.call()?.cameraOn).toBe(false);
  });

  test('« Refuser » dit rejected au serveur et libère l’écran', () => {
    const h = harness();
    h.engine.handle(SERVER_EVENTS.CALL_INITIATED, initiated);
    h.engine.decline();
    expect(h.requested[0]).toEqual([CLIENT_EVENTS.CALL_END, { callId: 'call-9', reason: 'rejected' }]);
    expect(h.call()).toBeNull();
  });

  test('l’appel annulé par l’appelant avant la réponse disparaît sans écran de fin', () => {
    const h = harness();
    h.engine.handle(SERVER_EVENTS.CALL_INITIATED, initiated);
    h.engine.handle(SERVER_EVENTS.CALL_ENDED, { callId: 'call-9', duration: 0, endedBy: PEER, reason: 'cancelled' });
    expect(h.call()).toBeNull();
  });

  test('répondu sur un autre appareil : la sonnerie s’arrête', () => {
    const h = harness();
    h.engine.handle(SERVER_EVENTS.CALL_INITIATED, initiated);
    h.engine.handle(SERVER_EVENTS.CALL_ALREADY_ANSWERED, { callId: 'call-9' });
    expect(h.call()).toBeNull();
  });

  test('mon propre appel relayé sur mes autres onglets ne sonne pas', () => {
    const h = harness();
    h.engine.handle(SERVER_EVENTS.CALL_INITIATED, { ...initiated, initiator: { userId: ME, username: 'me' } });
    expect(h.call()).toBeNull();
  });

  test('un appel reçu pendant un appel vivant devient un appel EN ATTENTE', async () => {
    const h = harness();
    await h.engine.start(DIRECT);
    h.engine.handle(SERVER_EVENTS.CALL_INITIATED, { ...initiated, callId: 'call-2', conversationId: 'c-2' });
    expect(h.store.getState().waiting).toMatchObject({ callId: 'call-2', callerName: 'Amina' });
    h.engine.declineWaiting();
    expect(h.store.getState().waiting).toBeNull();
    expect(h.requested.at(-1)).toEqual([CLIENT_EVENTS.CALL_END, { callId: 'call-2', reason: 'rejected' }]);
  });

  test('un signal arrivé AVANT l’acceptation est ignoré (pas de lien créé)', () => {
    const h = harness();
    h.engine.handle(SERVER_EVENTS.CALL_INITIATED, initiated);
    h.engine.handle(SERVER_EVENTS.CALL_SIGNAL, { callId: 'call-9', signal: { type: 'offer', from: PEER, to: ME, sdp: 'v=0' } });
    expect(h.links).toHaveLength(0);
  });
});

describe('en appel', () => {
  const connected = async () => {
    const h = harness();
    await h.engine.start(DIRECT);
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, { callId: 'call-1', participant: { id: 'p-2', userId: PEER, username: 'amina', displayName: 'Amina' } });
    h.linkState(h.links[0] as FakeLink, 'connected');
    return h;
  };

  test('un signal du pair est remis au lien de CE pair', async () => {
    const h = await connected();
    h.engine.handle(SERVER_EVENTS.CALL_SIGNAL, { callId: 'call-1', signal: { type: 'answer', from: PEER, to: ME, sdp: 'v=0', negotiationId: 1 } });
    await flush();
    expect(h.links[0]?.received).toEqual(['answer']);
  });

  test('un signal adressé à quelqu’un d’autre est écarté', async () => {
    const h = await connected();
    h.engine.handle(SERVER_EVENTS.CALL_SIGNAL, { callId: 'call-1', signal: { type: 'answer', from: PEER, to: 'u-other', sdp: 'v=0' } });
    await flush();
    expect(h.links[0]?.received).toEqual([]);
  });

  test('couper le micro coupe la piste et prévient le serveur', async () => {
    const h = await connected();
    h.engine.toggleMic();
    expect(h.call()?.micMuted).toBe(true);
    expect(h.call()?.localStream?.getAudioTracks()[0]?.enabled).toBe(false);
    expect(h.emitted.at(-1)).toEqual([CLIENT_EVENTS.CALL_TOGGLE_AUDIO, { callId: 'call-1', enabled: false }]);
  });

  test('allumer la caméra dans un appel vocal le passe en vidéo', async () => {
    const h = await connected();
    await h.engine.toggleCamera();
    expect(h.call()?.cameraOn).toBe(true);
    expect(h.call()?.media).toBe('video');
    expect(h.emitted.at(-1)).toEqual([CLIENT_EVENTS.CALL_TOGGLE_VIDEO, { callId: 'call-1', enabled: true }]);
  });

  test('le micro coupé du pair se lit sur son membre', async () => {
    const h = await connected();
    h.engine.handle(SERVER_EVENTS.CALL_MEDIA_TOGGLED, { callId: 'call-1', participantId: 'p-2', mediaType: 'audio', enabled: false });
    expect(h.call()?.members[PEER]?.micMuted).toBe(true);
  });

  test('raccrocher : end au serveur, liens fermés, écran « Appel terminé » avec la durée', async () => {
    const h = await connected();
    h.advance(65_000);
    h.engine.hangup();
    expect(h.names(h.requested)).toContain(CLIENT_EVENTS.CALL_END);
    expect(h.links[0]?.closed).toBe(true);
    expect(h.call()?.phase).toEqual({ kind: 'ended', reason: 'local', detail: null });
    expect(h.call()?.endedDurationSec).toBe(65);
    expect(h.tones).toContain('cue:ended');
  });

  test('le pair raccroche : fin « remote » avec la durée servie par la passerelle', async () => {
    const h = await connected();
    h.engine.handle(SERVER_EVENTS.CALL_ENDED, { callId: 'call-1', duration: 42, endedBy: PEER, reason: 'completed' });
    expect(h.call()?.phase).toMatchObject({ kind: 'ended', reason: 'remote' });
    expect(h.call()?.endedDurationSec).toBe(42);
  });

  test('exclu par un modérateur : fin « retiré de l’appel », et une autre fin forcée reste « remote »', async () => {
    const removed = await connected();
    removed.engine.handle(SERVER_EVENTS.CALL_FORCE_LEAVE, { callId: 'call-1', reason: 'removed' });
    expect(removed.call()?.phase).toMatchObject({ kind: 'ended', reason: 'removed' });
    const cleaned = await connected();
    cleaned.engine.handle(SERVER_EVENTS.CALL_FORCE_LEAVE, { callId: 'call-1', reason: 'membership_ended' });
    expect(cleaned.call()?.phase).toMatchObject({ kind: 'ended', reason: 'remote' });
  });

  test('un lien perdu dans un appel DIRECT termine l’appel sur « connexion perdue »', async () => {
    const h = await connected();
    h.linkState(h.links[0] as FakeLink, 'failed');
    expect(h.call()?.phase).toMatchObject({ kind: 'ended', reason: 'connectionLost' });
  });

  test('une reprise ICE passe l’appel en « reconnexion » puis le rend « connecté »', async () => {
    const h = await connected();
    h.linkState(h.links[0] as FakeLink, 'reconnecting');
    expect(h.call()?.phase.kind).toBe('reconnecting');
    expect(h.names(h.emitted)).toContain(CLIENT_EVENTS.CALL_RECONNECTING);
    h.linkState(h.links[0] as FakeLink, 'connected');
    expect(h.call()?.phase.kind).toBe('connected');
    expect(h.names(h.emitted)).toContain(CLIENT_EVENTS.CALL_RECONNECTED);
  });

  test('la reconnexion du socket re-rejoint l’appel en cours', async () => {
    const h = await connected();
    h.binding.authenticated();
    expect(h.requested.at(-1)?.[0]).toBe(CLIENT_EVENTS.CALL_JOIN);
  });

  test('les sous-titres traduits gardent les trois derniers segments', async () => {
    const h = await connected();
    for (const n of [1, 2, 3, 4]) {
      h.engine.handle(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, { callId: 'call-1', segment: { id: `s${n}`, speakerId: PEER, text: `line ${n}`, translatedText: `phrase ${n}`, startMs: n, endMs: n + 1, isFinal: true, sourceLanguage: 'en', targetLanguage: 'fr' } });
    }
    expect(h.call()?.captions.map((caption) => caption.text)).toEqual(['phrase 2', 'phrase 3', 'phrase 4']);
  });

  test('réduire puis agrandir ne touche pas à l’appel', async () => {
    const h = await connected();
    h.engine.setDisplay('pill');
    expect(h.call()?.display).toBe('pill');
    expect(h.call()?.phase.kind).toBe('connected');
  });
});

describe('appel de groupe', () => {
  test('chaque arrivant reçoit son propre lien ; un départ n’arrête pas l’appel', async () => {
    const h = harness();
    await h.engine.start({ ...DIRECT, isGroup: true, title: 'Équipe' });
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, { callId: 'call-1', participant: { id: 'p-2', userId: 'u-a', username: 'a' } });
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, { callId: 'call-1', participant: { id: 'p-3', userId: 'u-b', username: 'b' } });
    expect(h.links.map((link) => link.deps.remoteUserId)).toEqual(['u-a', 'u-b']);
    for (const link of h.links) h.linkState(link, 'connected');
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, { callId: 'call-1', participantId: 'p-2', userId: 'u-a' });
    expect(Object.keys(h.call()?.members ?? {})).toEqual(['u-b']);
    expect(h.call()?.phase.kind).toBe('connected');
  });

  test('un lien perdu dans un groupe retire le membre, pas l’appel', async () => {
    const h = harness();
    await h.engine.start({ ...DIRECT, isGroup: true });
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, { callId: 'call-1', participant: { id: 'p-2', userId: 'u-a', username: 'a' } });
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, { callId: 'call-1', participant: { id: 'p-3', userId: 'u-b', username: 'b' } });
    for (const link of h.links) h.linkState(link, 'connected');
    h.linkState(h.links[0] as FakeLink, 'failed');
    expect(h.call()?.members['u-a']).toBeUndefined();
    expect(h.call()?.phase.kind).toBe('connected');
  });
});
