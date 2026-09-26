import { describe, expect, test } from 'bun:test';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { decodeMediaToggled, decodeParticipantJoined, decodeSignal } from '@/lib/calls/call-decode';

import { CALL_PEER_USER_ID, createFixtureCallPeer } from './fixtures-call-peer';

/**
 * LE PAIR DES GATES D'APPEL (#8063) — il parle la langue de la passerelle :
 * ce qu'il lève se décode par les MÊMES décodeurs que le moteur, sans quoi le
 * gate mesurerait un protocole que la vraie passerelle ne parle pas.
 */

type Fired = Array<readonly [string, unknown]>;

function fakeConnection() {
  const video = { direction: 'recvonly', receiver: { track: { kind: 'video' } }, sender: { replaced: [] as unknown[], replaceTrack: async (track: unknown) => void video.sender.replaced.push(track) } };
  const connection = {
    signalingState: 'stable',
    remoteDescription: null as unknown,
    localDescription: null as { sdp: string } | null,
    onicecandidate: null as unknown,
    onnegotiationneeded: null as unknown,
    setRemoteDescription: async (description: unknown) => void (connection.remoteDescription = description),
    setLocalDescription: async () => void (connection.localDescription = { sdp: 'answer-sdp' }),
    addIceCandidate: async () => undefined,
    getTransceivers: () => [video],
    getStats: async () => new Map([['v', { type: 'inbound-rtp', kind: 'video', framesDecoded: 12 }]]),
  };
  return { connection, video };
}

function peer() {
  const fired: Fired = [];
  const pending: Array<() => void> = [];
  const { connection, video } = fakeConnection();
  const screenTrack = { kind: 'video', stop: () => undefined };
  const created = createFixtureCallPeer({
    fire: (event, payload) => void fired.push([event, payload]),
    createConnection: () => connection as unknown as RTCPeerConnection,
    createScreenTrack: () => screenTrack as unknown as MediaStreamTrack,
    schedule: (fn) => void pending.push(fn),
  });
  return { created, fired, pending, video, screenTrack };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('le pair des gates d’appel', () => {
  test('rejoint l’appel initié, sous la forme que décode le moteur', () => {
    const h = peer();
    h.created.initiated('call-1');
    expect(h.fired).toHaveLength(0);
    h.pending.forEach((fn) => fn());
    const [event, payload] = h.fired[0] ?? [];
    expect(event).toBe(SERVER_EVENTS.CALL_PARTICIPANT_JOINED);
    expect(decodeParticipantJoined(payload)).toMatchObject({ callId: 'call-1', person: { userId: CALL_PEER_USER_ID } });
  });

  test('répond à l’offre qui lui est adressée, et à elle seule', async () => {
    const h = peer();
    h.created.initiated('call-1');
    h.created.emitted(CLIENT_EVENTS.CALL_SIGNAL, { callId: 'call-1', signal: { type: 'offer', sdp: 'offer-sdp', negotiationId: 1, from: 'u-other', to: 'u-somebody' } });
    await flush();
    expect(h.fired).toHaveLength(0);
    h.created.emitted(CLIENT_EVENTS.CALL_SIGNAL, { callId: 'call-1', signal: { type: 'offer', sdp: 'offer-sdp', negotiationId: 1, from: 'u-me', to: CALL_PEER_USER_ID } });
    await flush();
    const answer = decodeSignal(h.fired.at(-1)?.[1]);
    expect(answer).toMatchObject({ callId: 'call-1', kind: 'description', type: 'answer', from: CALL_PEER_USER_ID, to: 'u-me', epoch: 1 });
  });

  test('retient les annonces du client et compte les images reçues', async () => {
    const h = peer();
    h.created.initiated('call-1');
    h.created.emitted(CLIENT_EVENTS.CALL_SIGNAL, { callId: 'call-1', signal: { type: 'offer', sdp: 'o', from: 'u-me', to: CALL_PEER_USER_ID } });
    await flush();
    h.created.emitted(CLIENT_EVENTS.CALL_TOGGLE_SCREEN, { callId: 'call-1', enabled: true });
    expect(h.created.probe.toggles).toEqual([{ event: CLIENT_EVENTS.CALL_TOGGLE_SCREEN, enabled: true }]);
    expect(await h.created.probe.videoFrames()).toBe(12);
  });

  test('partage à son tour un écran, puis l’arrête, et l’annonce comme la passerelle', async () => {
    const h = peer();
    h.created.initiated('call-1');
    h.created.emitted(CLIENT_EVENTS.CALL_SIGNAL, { callId: 'call-1', signal: { type: 'offer', sdp: 'o', from: 'u-me', to: CALL_PEER_USER_ID } });
    await flush();
    h.created.probe.share();
    await flush();
    expect(h.video.direction).toBe('sendrecv');
    expect(h.video.sender.replaced).toEqual([h.screenTrack]);
    expect(decodeMediaToggled(h.fired.at(-1)?.[1])).toMatchObject({ callId: 'call-1', userId: CALL_PEER_USER_ID, mediaType: 'screen', enabled: true });
    h.created.probe.stopShare();
    await flush();
    expect(h.video.sender.replaced.at(-1)).toBeNull();
    expect(decodeMediaToggled(h.fired.at(-1)?.[1])).toMatchObject({ mediaType: 'screen', enabled: false });
  });
});
