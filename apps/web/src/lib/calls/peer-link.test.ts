import { describe, expect, test } from 'bun:test';

import { createPeerLink, ICE_DISCONNECT_GRACE_MS, ICE_RESTART_MAX_ATTEMPTS, isPolitePeer, isStaleEpoch, restartBackoffMs, type LinkState, type OutgoingSignal } from './peer-link';

/**
 * LE LIEN PAIR-À-PAIR (#6382, #8044) — les trois règles d'iOS
 * (`CallManager.swift` § 3.5) sur une `RTCPeerConnection` simulée : la
 * négociation parfaite, l'époque de négociation et la reprise ICE bornée.
 */

type Track = { readonly kind: 'audio' | 'video' };
type Transceiver = { direction: string; readonly sender: { track: Track | null; replaceTrack: (t: Track | null) => Promise<void> }; readonly receiver: { readonly track: Track } };

function fakeConnection() {
  const calls: string[] = [];
  const transceivers: Transceiver[] = [];
  const addTransceiver = (trackOrKind: Track | 'audio' | 'video', init: { direction: string }): Transceiver => {
    const kind = typeof trackOrKind === 'string' ? trackOrKind : trackOrKind.kind;
    const sender = { track: typeof trackOrKind === 'string' ? null : trackOrKind, replaceTrack: async (t: Track | null) => void (sender.track = t) };
    const transceiver: Transceiver = { direction: init.direction, sender, receiver: { track: { kind } } };
    transceivers.push(transceiver);
    calls.push(`add:${kind}:${init.direction}`);
    return transceiver;
  };
  const pc = {
    signalingState: 'stable',
    connectionState: 'new',
    localDescription: null as { type: string; sdp: string } | null,
    remoteDescription: null as { type: string; sdp: string } | null,
    onicecandidate: null as ((event: { candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null } | null }) => void) | null,
    ontrack: null as ((event: { track: Track }) => void) | null,
    onnegotiationneeded: null as (() => void) | null,
    onconnectionstatechange: null as (() => void) | null,
    onsignalingstatechange: null as (() => void) | null,
    addTransceiver,
    getTransceivers: () => transceivers,
    createOffer: async (options?: { iceRestart?: boolean }) => {
      calls.push(options?.iceRestart === true ? 'createOffer:restart' : 'createOffer');
      return { type: 'offer', sdp: 'restart-offer' };
    },
    setLocalDescription: async (description?: { type: string; sdp: string }) => {
      const next = description ?? (pc.remoteDescription?.type === 'offer' && pc.signalingState === 'have-remote-offer' ? { type: 'answer', sdp: 'answer-sdp' } : { type: 'offer', sdp: 'offer-sdp' });
      pc.localDescription = next;
      pc.signalingState = next.type === 'offer' ? 'have-local-offer' : 'stable';
      calls.push(`setLocal:${next.type}`);
    },
    setRemoteDescription: async (description: { type: string; sdp: string }) => {
      pc.remoteDescription = description;
      pc.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
      calls.push(`setRemote:${description.type}`);
    },
    addIceCandidate: async (candidate: { candidate?: string }) => void calls.push(`candidate:${candidate.candidate ?? ''}`),
    getConfiguration: () => ({ iceServers: [] }),
    setConfiguration: (config: { iceServers: unknown[] }) => void calls.push(`config:${config.iceServers.length}`),
    close: () => void calls.push('close'),
  };
  const setState = (state: string) => {
    pc.connectionState = state;
    pc.onconnectionstatechange?.();
  };
  return { pc, calls, setState };
}

function link(options: { readonly local?: string; readonly remote?: string; readonly video?: boolean } = {}) {
  const fake = fakeConnection();
  const sent: OutgoingSignal[] = [];
  const states: LinkState[] = [];
  const timers: Array<{ fn: () => void; ms: number; active: boolean }> = [];
  const tracks: Track[] = [{ kind: 'audio' }, ...(options.video === true ? [{ kind: 'video' as const }] : [])];
  const localStream = { getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'), getVideoTracks: () => tracks.filter((t) => t.kind === 'video') } as unknown as MediaStream;
  const remoteTracks: Track[] = [];
  const remoteStream = { getTracks: () => remoteTracks, addTrack: (t: Track) => void remoteTracks.push(t) } as unknown as MediaStream;
  const peer = createPeerLink({
    localUserId: options.local ?? 'u-a',
    remoteUserId: options.remote ?? 'u-b',
    iceServers: [],
    localStream,
    send: (signal) => void sent.push(signal),
    onRemoteStream: () => undefined,
    onState: (state) => void states.push(state),
    createConnection: () => fake.pc as unknown as RTCPeerConnection,
    createStream: () => remoteStream,
    schedule: (fn, ms) => {
      const timer = { fn, ms, active: true };
      timers.push(timer);
      return timer;
    },
    cancel: (handle) => void ((handle as { active: boolean }).active = false),
  });
  const runTimers = () => {
    for (const timer of timers.splice(0)) if (timer.active) timer.fn();
  };
  return { peer, fake, sent, states, timers, runTimers, remoteTracks };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('règles pures', () => {
  test('le plus petit identifiant est poli ; soi-même et le vide ne le sont jamais', () => {
    expect(isPolitePeer('a', 'b')).toBe(true);
    expect(isPolitePeer('b', 'a')).toBe(false);
    expect(isPolitePeer('a', 'a')).toBe(false);
    expect(isPolitePeer('', 'b')).toBe(false);
  });

  test('une époque plus ancienne que la plus haute vue est périmée', () => {
    expect(isStaleEpoch(1, 2)).toBe(true);
    expect(isStaleEpoch(2, 2)).toBe(false);
    expect(isStaleEpoch(3, 2)).toBe(false);
  });

  test('la reprise ICE : immédiate, puis 2, 4, 8, 16 s', () => {
    expect([1, 2, 3, 4, 5, 6].map(restartBackoffMs)).toEqual([0, 2_000, 4_000, 8_000, 16_000, 16_000]);
  });
});

describe('offre et réponse', () => {
  test('l’offrant pose une ligne audio sendrecv et une ligne vidéo recvonly sans caméra', async () => {
    const { peer, fake, sent, states } = link();
    await peer.offer();
    expect(fake.calls.slice(0, 2)).toEqual(['add:audio:sendrecv', 'add:video:recvonly']);
    expect(sent).toEqual([{ type: 'offer', sdp: 'offer-sdp', negotiationId: 1 }]);
    expect(states).toEqual(['connecting']);
  });

  test('avec la caméra, la ligne vidéo émet', async () => {
    const { peer, fake } = link({ video: true });
    await peer.offer();
    expect(fake.calls).toContain('add:video:sendrecv');
  });

  test('le répondant accroche ses pistes aux lignes de l’offre et répond à la MÊME époque', async () => {
    const { peer, fake, sent } = link({ local: 'u-b', remote: 'u-a' });
    fake.pc.addTransceiver('audio', { direction: 'recvonly' });
    fake.calls.length = 0;
    await peer.receiveDescription({ type: 'offer', sdp: 'remote-offer' }, 4);
    expect(fake.calls).toEqual(['setRemote:offer', 'setLocal:answer']);
    expect(fake.pc.getTransceivers()[0]?.direction).toBe('sendrecv');
    expect(sent).toEqual([{ type: 'answer', sdp: 'answer-sdp', negotiationId: 4 }]);
  });

  test('un candidat arrivé avant la description attend, puis passe', async () => {
    const { peer, fake } = link();
    await peer.receiveCandidate({ candidate: 'c1' }, 0);
    expect(fake.calls).not.toContain('candidate:c1');
    await peer.receiveDescription({ type: 'offer', sdp: 'x' }, 1);
    expect(fake.calls).toContain('candidate:c1');
  });

  test('un signal d’une époque périmée est écarté', async () => {
    const { peer, fake } = link();
    await peer.offer();
    await peer.offer().catch(() => undefined);
    fake.calls.length = 0;
    await peer.receiveDescription({ type: 'answer', sdp: 'old' }, 0);
    expect(fake.calls).toEqual([]);
  });

  test('les candidats locaux partent avec l’époque courante', async () => {
    const { peer, fake, sent } = link();
    await peer.offer();
    fake.pc.onicecandidate?.({ candidate: { candidate: 'cand', sdpMid: '0', sdpMLineIndex: 0 } });
    fake.pc.onicecandidate?.({ candidate: null });
    expect(sent.at(-1)).toEqual({ type: 'ice-candidate', candidate: 'cand', sdpMid: '0', sdpMLineIndex: 0, negotiationId: 1 });
    expect(sent).toHaveLength(2);
  });

  test('les pistes distantes rejoignent UN flux', () => {
    const { fake, remoteTracks } = link();
    fake.pc.ontrack?.({ track: { kind: 'audio' } });
    fake.pc.ontrack?.({ track: { kind: 'video' } });
    expect(remoteTracks.map((t) => t.kind)).toEqual(['audio', 'video']);
  });
});

describe('négociation parfaite', () => {
  test('collision : le pair IMPOLI ignore l’offre entrante', async () => {
    const { peer, fake, sent } = link({ local: 'u-b', remote: 'u-a' });
    await peer.offer();
    fake.calls.length = 0;
    await peer.receiveDescription({ type: 'offer', sdp: 'theirs' }, 1);
    expect(fake.calls).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  test('collision : le pair POLI cède et répond', async () => {
    const { peer, fake, sent } = link({ local: 'u-a', remote: 'u-b' });
    await peer.offer();
    await peer.receiveDescription({ type: 'offer', sdp: 'theirs' }, 1);
    expect(fake.calls).toContain('setRemote:offer');
    expect(sent.at(-1)?.type).toBe('answer');
  });

  test('la renégociation automatique n’est ouverte qu’après la première connexion', async () => {
    const { fake, sent } = link();
    fake.pc.onnegotiationneeded?.();
    await flush();
    expect(sent).toHaveLength(0);
    fake.setState('connected');
    fake.pc.onnegotiationneeded?.();
    await flush();
    expect(sent.at(-1)?.type).toBe('offer');
  });
});

describe('reprise ICE', () => {
  test('déconnecté : 3 s de grâce, puis une offre de redémarrage ICE', async () => {
    const { fake, states, timers, runTimers } = link();
    fake.setState('connected');
    fake.setState('disconnected');
    expect(states.at(-1)).toBe('reconnecting');
    expect(timers[0]?.ms).toBe(ICE_DISCONNECT_GRACE_MS);
    runTimers();
    runTimers();
    await flush();
    expect(fake.calls).toContain('createOffer:restart');
  });

  test('revenu pendant la grâce : aucune reprise', () => {
    const { fake, states, runTimers } = link();
    fake.setState('connected');
    fake.setState('disconnected');
    fake.setState('connected');
    runTimers();
    expect(fake.calls).not.toContain('createOffer:restart');
    expect(states.at(-1)).toBe('connected');
  });

  test(`après ${ICE_RESTART_MAX_ATTEMPTS} reprises ratées, le lien est « failed »`, () => {
    const { fake, states } = link();
    fake.setState('connected');
    for (let attempt = 0; attempt <= ICE_RESTART_MAX_ATTEMPTS; attempt += 1) fake.setState('failed');
    expect(states.at(-1)).toBe('failed');
  });

  test('fermer coupe les écouteurs et la connexion', () => {
    const { peer, fake } = link();
    peer.close();
    expect(fake.calls).toContain('close');
    expect(fake.pc.onconnectionstatechange).toBeNull();
  });
});
