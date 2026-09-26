import { afterEach, describe, expect, test } from 'bun:test';

import { decodeAck, decodeInitiated, decodeSessionMembers, decodeSignal, mapServerEndReason } from './call-decode';
import { callNoticeTarget } from './call-notice';
import { formatCallClock, meshPhase, withCaption, type CallMember } from './call-store';
import { bindCallTransport, listenCallEvents, resetCallTransportForTests, setCallEngineWake } from './call-transport';
import { callLayout, callStatusKey, canRetry, gridColumns, orderedMembers, statusPills } from './call-view';

/**
 * LES RÈGLES DE L'APPEL SANS ÉCRAN (#6382, #8044) — ce que la passerelle
 * envoie, décodé sans jamais caster ; ce que l'écran dit selon l'état ; la
 * file des événements reçus avant que le moteur ne soit chargé.
 */

afterEach(() => resetCallTransportForTests());

const member = (overrides: Partial<CallMember> = {}): CallMember => ({ userId: 'u-a', name: 'Amina', avatar: null, micMuted: false, cameraOn: false, screenSharing: false, link: 'connected', ...overrides });

describe('décodage', () => {
  test('call:initiated : appelant, type, groupe', () => {
    expect(decodeInitiated({ callId: 'c', conversationId: 'v', type: 'video', conversationType: 'group', conversationTitle: 'Équipe', initiator: { userId: 'u', username: 'amina', displayName: 'Amina' } })).toMatchObject({
      callId: 'c',
      media: 'video',
      isGroup: true,
      conversationTitle: 'Équipe',
      initiator: { userId: 'u', name: 'Amina' },
    });
    expect(decodeInitiated({ callId: 'c' })).toBeNull();
    expect(decodeInitiated('nope')).toBeNull();
  });

  test('ice-restart se lit comme une offre ; l’époque absente vaut 0', () => {
    expect(decodeSignal({ callId: 'c', signal: { type: 'ice-restart', from: 'a', to: 'b', sdp: 'x' } })).toMatchObject({ kind: 'description', type: 'offer', epoch: 0 });
    expect(decodeSignal({ callId: 'c', signal: { type: 'ice-candidate', from: 'a', to: 'b', candidate: 'cand', sdpMLineIndex: 0, negotiationId: 3 } })).toMatchObject({ kind: 'candidate', sdpMLineIndex: 0, epoch: 3 });
    expect(decodeSignal({ callId: 'c', signal: { type: 'offer', from: 'a', to: 'b' } })).toBeNull();
  });

  test('un accusé en échec porte son code et le motif de fin', () => {
    expect(decodeAck({ success: false, error: { code: 'CALL_ENDED', endReason: 'missed' } })).toEqual({ ok: false, code: 'CALL_ENDED', endReason: 'missed' });
    expect(decodeAck(undefined)).toMatchObject({ ok: false, code: 'NO_ACK' });
    expect(decodeAck({ success: true, data: { callId: 'c' } })).toEqual({ ok: true, data: { callId: 'c' } });
  });

  test('les membres d’une session Prisma brute, départs exclus', () => {
    const members = decodeSessionMembers({ participants: [{ id: 'p1', userId: 'u1', leftAt: null, user: { username: 'a', displayName: 'A' } }, { id: 'p2', userId: 'u2', leftAt: '2026-09-26T00:00:00Z', user: { username: 'b' } }] });
    expect(members.map((m) => m.userId)).toEqual(['u1']);
  });

  test('les motifs de fin de la passerelle, miroir d’iOS', () => {
    expect(mapServerEndReason('no_answer')).toBe('missed');
    expect(mapServerEndReason('declined')).toBe('rejected');
    expect(mapServerEndReason('heartbeatTimeout')).toBe('connectionLost');
    expect(mapServerEndReason('completed')).toBe('remote');
  });
});

describe('ce que l’écran dit', () => {
  const base = { callId: null, direction: 'outgoing' as const, media: 'audio' as const };

  test('sortant : « Appel… » avant le callId, « Sonnerie » après', () => {
    expect(callStatusKey({ ...base, phase: { kind: 'outgoing' } })).toBe('call.outgoing.ringing');
    expect(callStatusKey({ ...base, callId: 'c', phase: { kind: 'outgoing' } })).toBe('call.outgoing.waiting');
    expect(callStatusKey({ ...base, phase: { kind: 'connected' } })).toBeNull();
  });

  test('Réessayer après un échec passager, jamais après un raccroché ni en entrant', () => {
    expect(canRetry({ direction: 'outgoing', phase: { kind: 'ended', reason: 'busy', detail: null } })).toBe(true);
    expect(canRetry({ direction: 'outgoing', phase: { kind: 'ended', reason: 'local', detail: null } })).toBe(false);
    expect(canRetry({ direction: 'incoming', phase: { kind: 'ended', reason: 'failed', detail: null } })).toBe(false);
  });

  test('disposition : portrait, vidéo à deux, grille', () => {
    expect(callLayout({ members: { a: member() }, cameraOn: false, remoteStreams: {}, isGroup: false })).toBe('portrait');
    expect(callLayout({ members: { a: member() }, cameraOn: true, remoteStreams: {}, isGroup: false })).toBe('video-duo');
    expect(callLayout({ members: { a: member(), b: member({ userId: 'b' }) }, cameraOn: false, remoteStreams: {}, isGroup: true })).toBe('grid');
    expect([1, 2, 4, 5, 9].map(gridColumns)).toEqual([1, 2, 2, 3, 3]);
  });

  test('pastilles : micro coupé, pair muet (en direct seulement), réseau faible', () => {
    expect(statusPills({ micMuted: true, screenSharing: false, members: { a: member({ micMuted: true }) }, quality: 'poor', isGroup: false })).toEqual(['mic-muted', 'peer-muted', 'poor-network']);
    expect(statusPills({ micMuted: false, screenSharing: false, members: { a: member({ micMuted: true }) }, quality: 'good', isGroup: true })).toEqual([]);
  });

  test('la grille range les connectés d’abord, puis par nom', () => {
    const ordered = orderedMembers({ z: member({ userId: 'z', name: 'Zoé' }), b: member({ userId: 'b', name: 'Bob', link: 'connecting' }), a: member({ userId: 'a', name: 'Ana' }) });
    expect(ordered.map((m) => m.name)).toEqual(['Ana', 'Zoé', 'Bob']);
  });

  test('horloge d’appel et phase du maillage', () => {
    expect(formatCallClock(65)).toBe('1:05');
    expect(formatCallClock(3_725)).toBe('1:02:05');
    expect(meshPhase({})).toBeNull();
    expect(meshPhase({ a: member(), b: member({ link: 'reconnecting' }) })).toBe('connected');
    expect(meshPhase({ a: member({ link: 'reconnecting' }) })).toBe('reconnecting');
  });

  test('un segment final remplace son brouillon, trois restent', () => {
    const at = 0;
    const one = withCaption([], { id: 's', speakerId: 'a', speakerName: 'A', text: 'bon', original: 'good', isFinal: false, at });
    const two = withCaption(one, { id: 's', speakerId: 'a', speakerName: 'A', text: 'bonjour', original: 'good morning', isFinal: true, at });
    expect(two.map((c) => c.text)).toEqual(['bonjour']);
  });
});

describe('la file des événements', () => {
  test('un événement reçu sans moteur est gardé, réveille le chargement, puis rendu dans l’ordre', () => {
    let woken = 0;
    setCallEngineWake(() => (woken += 1));
    const binding = bindCallTransport({ connected: () => true, emit: () => undefined, request: async () => null });
    binding.dispatch('call:initiated', 1);
    binding.dispatch('call:signal', 2);
    expect(woken).toBe(2);
    const seen: unknown[] = [];
    listenCallEvents((event, payload) => seen.push([event, payload]), () => undefined);
    expect(seen).toEqual([['call:initiated', 1], ['call:signal', 2]]);
  });

  test('une connexion remplacée ne livre plus rien', () => {
    const first = bindCallTransport({ connected: () => true, emit: () => undefined, request: async () => null });
    bindCallTransport({ connected: () => true, emit: () => undefined, request: async () => null });
    const seen: unknown[] = [];
    listenCallEvents((event) => seen.push(event), () => undefined);
    first.dispatch('call:ended', {});
    expect(seen).toEqual([]);
  });
});

describe('la bulle d’appel', () => {
  test('un résumé terminé se rappelle ; un appel en cours se rejoint', () => {
    expect(callNoticeTarget({ conversationId: 'c', metadata: { kind: 'call', callId: 'k', callType: 'video' } })).toEqual({ conversationId: 'c', callId: 'k', media: 'video', live: false });
    expect(callNoticeTarget({ conversationId: 'c', metadata: { kind: 'call-live', callId: 'k', callType: 'audio' } })).toMatchObject({ live: true, media: 'audio' });
    expect(callNoticeTarget({ conversationId: 'c', metadata: { kind: 'join' } })).toBeNull();
  });
});

