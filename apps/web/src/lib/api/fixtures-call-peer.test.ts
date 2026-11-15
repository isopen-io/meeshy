import { describe, expect, test } from 'bun:test';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { decodeMediaToggled, decodeMutedByModerator, decodeParticipantInvited, decodeParticipantJoined, decodeReactionReceived, decodeSignal } from '@/lib/calls/call-decode';
import { decodeChannelMessage, decodeTranscriptionActive, decodeTranslatedSegment } from '@/lib/calls/call-captions';
import { peerAlert } from '@/lib/calls/call-peer-alerts';

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
    ondatachannel: null as ((event: { channel: unknown }) => void) | null,
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
  return { created, fired, pending, video, screenTrack, pc: () => connection };
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

  test('retient les rapports de qualité et de fin d’appel du client, et compte ses paquets audio (#8047)', async () => {
    const h = peer();
    h.created.emitted(CLIENT_EVENTS.CALL_QUALITY_REPORT, { callId: 'call-1', stats: { level: 'poor' } });
    h.created.emitted(CLIENT_EVENTS.CALL_ANALYTICS, { callId: 'call-1', codec: 'VP8' });
    h.created.emitted(CLIENT_EVENTS.CALL_HEARTBEAT, { callId: 'call-1' });
    expect(h.created.probe.reports.map((report) => report.event)).toEqual([CLIENT_EVENTS.CALL_QUALITY_REPORT, CLIENT_EVENTS.CALL_ANALYTICS]);
    expect(await h.created.probe.audioPackets()).toBe(0);
  });

  test('lève les alertes de la passerelle à son sujet, sous la forme que décode le moteur (#8047)', () => {
    const h = peer();
    h.created.initiated('call-1');
    const resolve = (userId: string | null) => userId;
    h.created.probe.alertQuality();
    const [qualityEvent, qualityPayload] = h.fired.at(-1) ?? [];
    expect(peerAlert(String(qualityEvent), qualityPayload, resolve)).toMatchObject({ callId: 'call-1', userId: CALL_PEER_USER_ID, patch: { weakNetwork: true } });
    h.created.probe.capture(true);
    const [captureEvent, capturePayload] = h.fired.at(-1) ?? [];
    expect(peerAlert(String(captureEvent), capturePayload, resolve)).toMatchObject({ userId: CALL_PEER_USER_ID, patch: { capturing: true } });
  });

  test('parle SOUS-TITRÉ et dit qu’il transcrit, sous la forme que décode le moteur (#8048)', () => {
    const h = peer();
    expect(h.created.probe.callId()).toBeNull();
    h.created.initiated('call-1');
    expect(h.created.probe.callId()).toBe('call-1');
    h.created.probe.speak({ id: 'n-1', text: 'Hello, can you hear me?', translatedText: 'Bonjour, tu m’entends ?' });
    const segment = decodeTranslatedSegment(h.fired.at(-1)?.[1]);
    expect(segment).toMatchObject({ callId: 'call-1', caption: { id: 'n-1', speakerId: CALL_PEER_USER_ID, original: 'Hello, can you hear me?', translated: 'Bonjour, tu m’entends ?', isFinal: true } });
    h.created.probe.transcribing(true);
    expect(h.fired.at(-1)?.[0]).toBe(SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE);
    expect(decodeTranscriptionActive(h.fired.at(-1)?.[1])).toEqual({ callId: 'call-1', speakerId: CALL_PEER_USER_ID, active: true });
  });

  test('retient ce que le client transcrit : les segments au socket, les entrées au canal `transcription` (#8048)', async () => {
    const h = peer();
    h.created.initiated('call-1');
    h.created.emitted(CLIENT_EVENTS.CALL_SIGNAL, { callId: 'call-1', signal: { type: 'offer', sdp: 'o', from: 'u-me', to: CALL_PEER_USER_ID } });
    await flush();
    h.created.emitted(CLIENT_EVENTS.CALL_TRANSCRIPTION_SEGMENT, { callId: 'call-1', segment: { text: 'Bonjour' } });
    h.created.emitted(CLIENT_EVENTS.CALL_TRANSCRIPTION_ACTIVE, { callId: 'call-1', active: true });
    expect(h.created.probe.transcripts.map((entry) => entry.event)).toEqual([CLIENT_EVENTS.CALL_TRANSCRIPTION_SEGMENT, CLIENT_EVENTS.CALL_TRANSCRIPTION_ACTIVE]);
    const channel = { label: 'transcription', onmessage: null as ((event: { data: unknown }) => void) | null };
    const other = { label: 'autre', onmessage: null as ((event: { data: unknown }) => void) | null };
    const pc = h.pc();
    pc.ondatachannel?.({ channel: other });
    pc.ondatachannel?.({ channel });
    expect(other.onmessage).toBeNull();
    channel.onmessage?.({ data: JSON.stringify({ type: 'transcript-entry', entry: { id: 'w', callId: 'call-1', speakerId: 'u-me', speakerDisplayName: 'Moi', text: 'Bonjour', language: 'fr', capturedAtMs: 1, isFinal: true, confidence: 0.9 } }) });
    channel.onmessage?.({ data: 'pas du json' });
    expect(h.created.probe.channelMessages.map((message) => decodeChannelMessage(message))).toMatchObject([{ kind: 'entry', id: 'w', text: 'Bonjour' }, null]);
  });
});

describe('le pair des gates, et les contrôles d’un appel (#8433, #8438, #8439)', () => {
  test('une invitation accusée est diffusée à tout l’appel, sous la forme que décode le moteur', () => {
    const h = peer();
    h.created.initiated('call-1');
    h.created.controlled(CLIENT_EVENTS.CALL_INVITE_PARTICIPANT, { callId: 'call-1', userId: 'u-bruno' });
    const [event, payload] = h.fired.at(-1) ?? [];
    expect(event).toBe(SERVER_EVENTS.CALL_PARTICIPANT_INVITED);
    expect(decodeParticipantInvited(payload)).toMatchObject({ callId: 'call-1', invitee: { userId: 'u-bruno' } });
    expect(h.created.probe.controls.map((control) => control.event)).toEqual([CLIENT_EVENTS.CALL_INVITE_PARTICIPANT]);
  });

  test('le pair coupe mon micro et réagit, comme la passerelle le relaie', () => {
    const h = peer();
    h.created.initiated('call-1');
    h.created.probe.muteMe();
    h.created.probe.react('🎉');
    expect(decodeMutedByModerator(h.fired[0]?.[1])).toEqual({ callId: 'call-1', byUserId: CALL_PEER_USER_ID });
    expect(decodeReactionReceived(h.fired[1]?.[1])).toEqual({ callId: 'call-1', userId: CALL_PEER_USER_ID, emoji: '🎉' });
  });

  test('une troisième personne rejoint l’appel, caméra coupée, sous la forme que décode le moteur (#8743)', () => {
    const h = peer();
    h.created.probe.join({ userId: 'u-lina', name: 'Lina' });
    expect(h.fired).toHaveLength(0);
    h.created.initiated('call-1');
    h.created.probe.join({ userId: 'u-lina', name: 'Lina' });
    const [event, payload] = h.fired.at(-1) ?? [];
    expect(event).toBe(SERVER_EVENTS.CALL_PARTICIPANT_JOINED);
    expect(decodeParticipantJoined(payload)).toMatchObject({ callId: 'call-1', person: { userId: 'u-lina', name: 'Lina' }, video: false });
  });
});
