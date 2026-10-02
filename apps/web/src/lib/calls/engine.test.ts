import { afterEach, describe, expect, test } from 'bun:test';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { DIRECT, flush, harness, ME, PEER, stream, track, type FakeLink, type FakeTrack } from '@/test-support/call-engine-harness';

import type { CameraEffectsPort } from './camera-effects';
import { callLayout } from './call-view';
import { resetCallTransportForTests } from './call-transport';
import type { QualityTick } from './call-quality-loop';
import { OUTGOING_RING_TIMEOUT_MS, type StartCallRequest } from './engine';

/**
 * LE MOTEUR D'APPEL, DE BOUT EN BOUT SANS NAVIGATEUR (#6382, #8044) — la
 * passerelle, les liens WebRTC, les médias et l'horloge sont des doublures :
 * ces témoins prouvent le PROTOCOLE (qui émet quoi, dans quel ordre) et les
 * ÉTATS que l'écran lit, miroirs de `CallManager.swift`. Le banc d'essai est
 * `test-support/call-engine-harness.ts`.
 */

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

  test('un appel VIDÉO entrant montre la caméra de l’appelant dès le décroché (#8295)', async () => {
    const h = harness();
    h.engine.handle(SERVER_EVENTS.CALL_INITIATED, initiated);
    expect(h.call()?.members[PEER]?.cameraOn).toBe(true);
    await h.engine.accept();
    expect(h.call()?.members[PEER]?.cameraOn).toBe(true);
  });

  test('un appel AUDIO entrant garde la caméra de l’appelant éteinte (#8295)', () => {
    const h = harness();
    h.engine.handle(SERVER_EVENTS.CALL_INITIATED, { ...initiated, type: 'audio' });
    expect(h.call()?.members[PEER]?.cameraOn).toBe(false);
  });

  test('la session rendue par call:join porte l’état caméra et micro de ses membres (#8295)', async () => {
    const callSession = { participants: [{ id: 'p-9', userId: PEER, leftAt: null, isAudioEnabled: false, isVideoEnabled: true, user: { username: 'amina', displayName: 'Amina' } }] };
    const h = harness({ acks: { [CLIENT_EVENTS.CALL_JOIN]: { success: true, data: { callSession, iceServers: [] } } } });
    h.engine.handle(SERVER_EVENTS.CALL_INITIATED, { ...initiated, type: 'audio' });
    await h.engine.accept();
    expect(h.call()?.members[PEER]).toMatchObject({ cameraOn: true, micMuted: true });
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

  test('#8072 — un appel tiré dans l’échantillon demande sa note ; la note part et la demande se ferme', async () => {
    const h = harness({ random: 0.05 });
    await h.engine.start(DIRECT);
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, { callId: 'call-1', participant: { id: 'p-2', userId: PEER, username: 'amina', displayName: 'Amina' } });
    h.linkState(h.links[0] as FakeLink, 'connected');
    h.advance(30_000);
    h.engine.hangup();
    expect(h.store.getState().feedback).toEqual({ callId: 'call-1', title: 'Amina', media: 'audio' });
    h.engine.rate(2, ['echo']);
    expect(h.emitted).toContainEqual([CLIENT_EVENTS.CALL_QUALITY_FEEDBACK, { callId: 'call-1', rating: 2, issues: ['echo'] }]);
    expect(h.store.getState().feedback).toBeNull();
  });

  test('#8072 — hors échantillon, un appel sans souci ne demande rien ; une reprise suffit à demander', async () => {
    const calm = await connected();
    calm.advance(30_000);
    calm.engine.hangup();
    expect(calm.store.getState().feedback).toBeNull();
    const shaky = await connected();
    shaky.linkState(shaky.links[0] as FakeLink, 'reconnecting');
    shaky.linkState(shaky.links[0] as FakeLink, 'connected');
    shaky.advance(30_000);
    shaky.engine.hangup();
    expect(shaky.store.getState().feedback?.callId).toBe('call-1');
    shaky.engine.skipRating();
    expect(shaky.store.getState().feedback).toBeNull();
    expect(shaky.names(shaky.emitted)).not.toContain(CLIENT_EVENTS.CALL_QUALITY_FEEDBACK);
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

  test('les sous-titres traduits entrent au journal de l’appel, dans l’ordre de capture (#8048)', async () => {
    const h = await connected();
    for (const n of [3, 1, 2]) {
      h.engine.handle(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, { callId: 'call-1', segment: { id: `s${n}`, speakerId: PEER, text: `line ${n}`, translatedText: `phrase ${n}`, startMs: n, endMs: n + 1, isFinal: true, sourceLanguage: 'en', targetLanguage: 'fr', capturedAtMs: n } });
    }
    expect(h.call()?.captions.map((caption) => caption.translated)).toEqual(['phrase 1', 'phrase 2', 'phrase 3']);
    h.engine.handle(SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE, { callId: 'call-1', speakerId: PEER, active: true });
    expect(h.call()?.captionPeers).toEqual([PEER]);
  });

  test('le canal de données d’un lien est remis aux sous-titres ; un « bye » du pair raccroche aussitôt (#8048)', async () => {
    const h = await connected();
    const channel = { readyState: 'open', send: () => undefined, onmessage: null as ((event: { data: string }) => void) | null, onclose: null };
    h.links[0]?.deps.onChannel?.(channel as unknown as RTCDataChannel);
    channel.onmessage?.({ data: '{"type":"bye","reason":"completed"}' });
    expect(h.call()?.phase).toEqual({ kind: 'ended', reason: 'remote', detail: null });
  });

  test('raccrocher prévient le pair en bande avant de fermer les liens (#8048)', async () => {
    const h = await connected();
    const sent: string[] = [];
    h.links[0]?.deps.onChannel?.({ readyState: 'open', send: (raw: string) => void sent.push(raw), onmessage: null, onclose: null } as unknown as RTCDataChannel);
    h.engine.hangup();
    expect(sent.map((raw) => JSON.parse(raw) as unknown)).toContainEqual({ type: 'bye', reason: 'completed' });
  });

  test('éteindre la caméra repasse l’appel en vocal, sans le couper, et le pair l’apprend (D3)', async () => {
    const h = await connected();
    await h.engine.toggleCamera();
    await h.engine.toggleCamera();
    expect(h.call()?.cameraOn).toBe(false);
    expect(h.call()?.localStream?.getVideoTracks()).toEqual([]);
    expect(h.call()?.phase.kind).toBe('connected');
    expect(h.emitted.at(-1)).toEqual([CLIENT_EVENTS.CALL_TOGGLE_VIDEO, { callId: 'call-1', enabled: false }]);
  });

  test('changer de micro remplace la piste sur chaque lien, relâche l’ancienne et garde le micro coupé (D5)', async () => {
    const h = await connected();
    h.engine.toggleMic();
    const old = h.call()?.localStream?.getAudioTracks()[0] as unknown as FakeTrack;
    const next = track('audio');
    await h.engine.replaceInput('microphone', next as unknown as MediaStreamTrack);
    expect(h.call()?.localStream?.getAudioTracks()).toEqual([next] as unknown as MediaStreamTrack[]);
    expect(next.enabled).toBe(false);
    expect(old.readyState).toBe('ended');
    expect(h.links[0]?.sent.at(-1)).toBe(next);
  });

  test('changer de caméra quand elle tourne remplace la piste vidéo ; caméra éteinte, le choix ne l’allume pas (D5)', async () => {
    const h = await connected();
    const idle = track('video');
    await h.engine.replaceInput('camera', idle as unknown as MediaStreamTrack);
    expect(h.call()?.cameraOn).toBe(false);
    expect(idle.readyState).toBe('ended');
    await h.engine.toggleCamera();
    const chosen = track('video');
    await h.engine.replaceInput('camera', chosen as unknown as MediaStreamTrack);
    expect(h.call()?.localStream?.getVideoTracks()).toEqual([chosen] as unknown as MediaStreamTrack[]);
    expect(h.call()?.facing).toBe('user');
    expect(h.links[0]?.sent.at(-1)).toBe(chosen);
  });

  test('un périphérique choisi sans appel vivant est relâché aussitôt', async () => {
    const h = harness();
    const stray = track('audio');
    await h.engine.replaceInput('microphone', stray as unknown as MediaStreamTrack);
    expect(stray.readyState).toBe('ended');
    expect(h.call()).toBeNull();
  });

  test('la bulle est un affichage réduit comme la pastille : l’appel continue', async () => {
    const h = await connected();
    h.engine.setDisplay('bubble');
    expect(h.call()?.display).toBe('bubble');
    expect(h.call()?.phase.kind).toBe('connected');
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

  test('un « bye » en bande dans un groupe retire son seul émetteur, l’appel continue (#9085)', async () => {
    const h = harness();
    await h.engine.start({ ...DIRECT, isGroup: true });
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, { callId: 'call-1', participant: { id: 'p-2', userId: 'u-a', username: 'a' } });
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, { callId: 'call-1', participant: { id: 'p-3', userId: 'u-b', username: 'b' } });
    for (const link of h.links) h.linkState(link, 'connected');
    const channel = { readyState: 'open', send: () => undefined, onmessage: null as ((event: { data: string }) => void) | null, onclose: null };
    h.links[0]?.deps.onChannel?.(channel as unknown as RTCDataChannel);
    channel.onmessage?.({ data: '{"type":"bye","reason":"completed"}' });
    expect(h.call()?.phase.kind).toBe('connected');
    expect(Object.keys(h.call()?.members ?? {})).toEqual(['u-b']);
  });
});

describe('partage d’écran (#8063)', () => {
  const connected = async (request: StartCallRequest = DIRECT) => {
    const h = harness();
    await h.engine.start(request);
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, { callId: 'call-1', participant: { id: 'p-2', userId: PEER, username: 'amina', displayName: 'Amina' } });
    h.linkState(h.links[0] as FakeLink, 'connected');
    return h;
  };

  test('dans un appel vocal, partager envoie l’écran sur chaque lien et l’annonce', async () => {
    const h = await connected();
    await h.engine.toggleScreen();
    const display = h.displays[0];
    expect(display).toBeDefined();
    expect(h.links[0]?.sent.at(-1)).toBe(display);
    expect(h.call()?.screenSharing).toBe(true);
    expect(h.call()?.cameraOn).toBe(false);
    expect(h.call()?.localStream?.getVideoTracks()).toEqual([display] as unknown as MediaStreamTrack[]);
    expect(h.emitted.at(-1)).toEqual([CLIENT_EVENTS.CALL_TOGGLE_SCREEN, { callId: 'call-1', enabled: true }]);
  });

  test('arrêter un partage d’appel vocal retire la piste vidéo et repasse en audio', async () => {
    const h = await connected();
    await h.engine.toggleScreen();
    const display = h.displays[0] as FakeTrack;
    await h.engine.toggleScreen();
    expect(display.readyState).toBe('ended');
    expect(h.links[0]?.sent.at(-1)).toBeNull();
    expect(h.call()?.screenSharing).toBe(false);
    expect(h.call()?.cameraOn).toBe(false);
    expect(h.call()?.localStream?.getVideoTracks()).toEqual([]);
    expect(h.emitted.at(-1)).toEqual([CLIENT_EVENTS.CALL_TOGGLE_SCREEN, { callId: 'call-1', enabled: false }]);
  });

  test('la caméra qui tournait avant le partage revient à son arrêt', async () => {
    const h = await connected({ ...DIRECT, media: 'video' });
    const before = h.call()?.localStream?.getVideoTracks()[0] as unknown as FakeTrack;
    await h.engine.toggleScreen();
    expect(before.readyState).toBe('ended');
    expect(h.call()?.cameraOn).toBe(false);
    await h.engine.toggleScreen();
    const camera = h.cameras.at(-1);
    expect(camera).toBeDefined();
    expect(h.links[0]?.sent.at(-1)).toBe(camera);
    expect(h.call()?.cameraOn).toBe(true);
    expect(h.call()?.screenSharing).toBe(false);
  });

  test('« Arrêter le partage » du navigateur (fin de la piste) arrête le partage comme le bouton', async () => {
    const h = await connected();
    await h.engine.toggleScreen();
    const display = h.displays[0] as FakeTrack;
    display.readyState = 'ended';
    display.onended?.();
    await flush();
    expect(h.call()?.screenSharing).toBe(false);
    expect(h.emitted.at(-1)).toEqual([CLIENT_EVENTS.CALL_TOGGLE_SCREEN, { callId: 'call-1', enabled: false }]);
  });

  test('un choix d’écran annulé ne change rien et n’annonce rien', async () => {
    const h = harness({ displayError: Object.assign(new Error('cancel'), { name: 'NotAllowedError' }) });
    await h.engine.start(DIRECT);
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, { callId: 'call-1', participant: { id: 'p-2', userId: PEER, username: 'amina' } });
    h.linkState(h.links[0] as FakeLink, 'connected');
    const before = h.emitted.length;
    await h.engine.toggleScreen();
    expect(h.call()?.screenSharing).toBe(false);
    expect(h.call()?.phase.kind).toBe('connected');
    expect(h.emitted.length).toBe(before);
  });

  test('avant la connexion, le partage n’est pas offert', async () => {
    const h = harness();
    await h.engine.start(DIRECT);
    await h.engine.toggleScreen();
    expect(h.displays).toHaveLength(0);
    expect(h.call()?.screenSharing).toBe(false);
  });

  test('la caméra ne se rallume pas par-dessus un partage', async () => {
    const h = await connected();
    await h.engine.toggleScreen();
    await h.engine.toggleCamera();
    expect(h.call()?.screenSharing).toBe(true);
    expect(h.call()?.cameraOn).toBe(false);
    expect(h.call()?.localStream?.getVideoTracks()).toEqual([h.displays[0]] as unknown as MediaStreamTrack[]);
  });

  test('raccrocher pendant un partage relâche la piste de l’écran', async () => {
    const h = await connected();
    await h.engine.toggleScreen();
    h.engine.hangup();
    expect((h.displays[0] as FakeTrack).readyState).toBe('ended');
  });

  test('le partage du pair se lit sur son membre, et sa fin rend l’état de sa caméra', async () => {
    const h = await connected();
    h.engine.handle(SERVER_EVENTS.CALL_MEDIA_TOGGLED, { callId: 'call-1', participantId: 'p-2', mediaType: 'screen', enabled: true });
    expect(h.call()?.members[PEER]?.screenSharing).toBe(true);
    expect(h.call()?.members[PEER]?.cameraOn).toBe(false);
    h.engine.handle(SERVER_EVENTS.CALL_MEDIA_TOGGLED, { callId: 'call-1', participantId: 'p-2', mediaType: 'screen', enabled: false });
    expect(h.call()?.members[PEER]?.screenSharing).toBe(false);
  });

  test('deux touchers pendant que le sélecteur est ouvert n’ouvrent qu’un sélecteur', async () => {
    const h = await connected();
    await Promise.all([h.engine.toggleScreen(), h.engine.toggleScreen()]);
    expect(h.displays).toHaveLength(1);
    expect(h.call()?.screenSharing).toBe(true);
  });

  test('un pair qui arrive pendant le partage apprend qu’il regarde un écran', async () => {
    const h = await connected({ ...DIRECT, isGroup: true });
    await h.engine.toggleScreen();
    const announced = () => h.emitted.filter(([event]) => event === CLIENT_EVENTS.CALL_TOGGLE_SCREEN);
    expect(announced()).toHaveLength(1);
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, { callId: 'call-1', participant: { id: 'p-3', userId: 'u-late', username: 'late' } });
    expect(announced()).toEqual([
      [CLIENT_EVENTS.CALL_TOGGLE_SCREEN, { callId: 'call-1', enabled: true }],
      [CLIENT_EVENTS.CALL_TOGGLE_SCREEN, { callId: 'call-1', enabled: true }],
    ]);
  });

  test('en appel vocal, pair sans caméra : l’écran reçu s’affiche dès que screen arrive, dans un ordre comme dans l’autre', async () => {
    const h = await connected();
    const link = h.links[0] as FakeLink;
    h.engine.handle(SERVER_EVENTS.CALL_MEDIA_TOGGLED, { callId: 'call-1', participantId: 'p-2', mediaType: 'screen', enabled: true });
    expect(callLayout(h.call() as NonNullable<ReturnType<typeof h.call>>)).toBe('portrait');
    link.deps.onRemoteStream(stream([track('audio'), track('video')]));
    expect(h.call()?.members[PEER]?.cameraOn).toBe(false);
    expect(callLayout(h.call() as NonNullable<ReturnType<typeof h.call>>)).toBe('screen');
  });
});

describe('la qualité d’un appel se mesure, s’adapte et se voit (#8047)', () => {
  const total = (overrides: Partial<QualityTick['total']> = {}): QualityTick['total'] => ({ level: 'good', packetLoss: 1, rtt: 120, jitter: 8, audioKbps: 32, videoKbps: 480, bytesSent: 10_000, bytesReceived: 20_000, ...overrides });
  const connected = async (ticks: ReadonlyArray<QualityTick | null> = []) => {
    let index = 0;
    const h = harness({ quality: () => ticks[Math.min(index++, ticks.length - 1)] ?? null });
    await h.engine.start(DIRECT);
    h.advance(3_000);
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, { callId: 'call-1', participant: { id: 'p-2', userId: PEER, username: 'amina', displayName: 'Amina' } });
    h.advance(1_500);
    h.linkState(h.links[0] as FakeLink, 'connected');
    return h;
  };

  test('chaque relevé publie le niveau, le détail et le stade de survie ; le rapport part vers la passerelle, au plus toutes les 5 s', async () => {
    const h = await connected([{ total: total({ level: 'poor', packetLoss: 9, rtt: 480 }), stage: 'frozen', codec: 'VP8', profile: 'wifi', audioBitrate: 32_000, path: 'direct' }]);
    await h.sampleQuality();
    expect(h.call()?.quality).toEqual({ level: 'poor', packetLoss: 9, rtt: 480, jitter: 8, audioKbps: 32, videoKbps: 480, survival: 'frozen' });
    const reports = () => h.emitted.filter(([event]) => event === CLIENT_EVENTS.CALL_QUALITY_REPORT);
    expect(reports()[0]?.[1]).toMatchObject({ callId: 'call-1', stats: { level: 'poor', packetLoss: 9, rtt: 480, bitrate: { audio: 32, video: 480 }, bytesSent: 10_000 } });
    expect(typeof (reports()[0]?.[1] as { stats: { timestamp: unknown } }).stats.timestamp).toBe('string');
    h.advance(2_000);
    await h.sampleQuality();
    expect(reports()).toHaveLength(1);
    h.advance(3_000);
    await h.sampleQuality();
    expect(reports()).toHaveLength(2);
  });

  test('un relevé mauvais, même hors fenêtre de rapport, fait demander la note d’après-appel (#8072)', async () => {
    const good = { total: total({ level: 'good' }), stage: 'sending', codec: 'VP8', profile: 'wifi', audioBitrate: 32_000, path: 'direct' } as const;
    const h = await connected([good, { total: total({ level: 'poor', packetLoss: 9 }), stage: 'sending', codec: 'VP8', profile: 'wifi', audioBitrate: 32_000, path: 'direct' }, good]);
    await h.sampleQuality();
    h.advance(2_000);
    await h.sampleQuality();
    h.advance(2_000);
    await h.sampleQuality();
    h.advance(30_000);
    h.engine.hangup();
    expect(h.store.getState().feedback?.callId).toBe('call-1');
  });

  test('la boucle s’arrête avec l’appel : plus aucun relevé après le raccroché', async () => {
    const h = await connected([{ total: total(), stage: 'sending', codec: 'opus', profile: 'wifi', audioBitrate: 32_000, path: 'direct' }]);
    h.engine.hangup();
    const before = h.emitted.length;
    await h.sampleQuality();
    expect(h.emitted.length).toBe(before);
  });

  test('`call:quality-alert` allume l’alerte du pair, qui s’éteint seule après 15 s sans nouvel avis', async () => {
    const h = await connected();
    h.engine.handle(SERVER_EVENTS.CALL_QUALITY_ALERT, { callId: 'call-1', participantId: 'p-2', metric: 'packetLoss', value: 8, threshold: 5 });
    expect(h.call()?.members[PEER]?.weakNetwork).toBe(true);
    h.advance(10_000);
    h.engine.handle(SERVER_EVENTS.CALL_QUALITY_ALERT, { callId: 'call-1', userId: PEER, metric: 'rtt', value: 400, threshold: 300 });
    h.advance(10_000);
    expect(h.call()?.members[PEER]?.weakNetwork).toBe(true);
    h.advance(5_000);
    expect(h.call()?.members[PEER]?.weakNetwork).toBe(false);
  });

  test('`call:screen-capture-alert` : le pair capture l’écran, puis arrête ; l’alerte d’un autre appel est ignorée', async () => {
    const h = await connected();
    h.engine.handle(SERVER_EVENTS.CALL_SCREEN_CAPTURE_ALERT, { callId: 'autre', userId: PEER, isCapturing: true });
    expect(h.call()?.members[PEER]?.capturing).toBe(false);
    h.engine.handle(SERVER_EVENTS.CALL_SCREEN_CAPTURE_ALERT, { callId: 'call-1', participantId: 'p-2', isCapturing: true });
    expect(h.call()?.members[PEER]?.capturing).toBe(true);
    h.engine.handle(SERVER_EVENTS.CALL_SCREEN_CAPTURE_ALERT, { callId: 'call-1', userId: PEER, isCapturing: false });
    expect(h.call()?.members[PEER]?.capturing).toBe(false);
  });

  test('au raccroché, `call:analytics` part UNE fois, avec le codec lu, les reprises, les transitions réseau et la qualité', async () => {
    const h = await connected([{ total: total({ level: 'excellent', rtt: 60, packetLoss: 0 }), stage: 'sending', codec: 'VP8', profile: 'wifi', audioBitrate: 32_000, path: 'direct' }, { total: total({ level: 'poor', rtt: 500, packetLoss: 10 }), stage: 'sending', codec: 'VP8', profile: 'wifi', audioBitrate: 32_000, path: 'direct' }]);
    await h.sampleQuality();
    h.advance(2_000);
    await h.sampleQuality();
    h.linkState(h.links[0] as FakeLink, 'reconnecting');
    h.linkState(h.links[0] as FakeLink, 'connected');
    h.networkChanged();
    h.advance(60_000);
    h.engine.hangup();
    const analytics = h.emitted.filter(([event]) => event === CLIENT_EVENTS.CALL_ANALYTICS);
    expect(analytics).toHaveLength(1);
    expect(analytics[0]?.[1]).toMatchObject({
      callId: 'call-1',
      setupTimeMs: 4_500,
      negotiationTimeMs: 1_500,
      durationSeconds: 62,
      reconnectionCount: 1,
      networkTransitions: 1,
      averageRtt: 280,
      averagePacketLoss: 5,
      maxPacketLoss: 10,
      codec: 'VP8',
      transcriptionUsed: false,
      qualityDistribution: { excellent: 0.5, good: 0, fair: 0, poor: 0.5 },
      platform: 'web',
      deviceModel: 'Chrome · Linux',
      isVideo: false,
      endReason: 'local',
    });
  });

  test('des sous-titres AFFICHÉS comptent dans le rapport ; reçus mais masqués, non', async () => {
    const segment = { callId: 'call-1', segment: { id: 's1', speakerId: PEER, text: 'hello', translatedText: 'bonjour', startMs: 0, endMs: 1, isFinal: true, sourceLanguage: 'en', targetLanguage: 'fr' } };
    const hidden = await connected();
    hidden.engine.handle(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, segment);
    hidden.engine.hangup();
    expect(hidden.emitted.find(([event]) => event === CLIENT_EVENTS.CALL_ANALYTICS)?.[1]).toMatchObject({ transcriptionUsed: false });
    const shown = await connected();
    shown.engine.handle(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, segment);
    shown.engine.toggleCaptions();
    shown.engine.hangup();
    expect(shown.emitted.find(([event]) => event === CLIENT_EVENTS.CALL_ANALYTICS)?.[1]).toMatchObject({ transcriptionUsed: true });
  });

  test('un appel sans réponse rapporte un établissement à -1', async () => {
    const h = harness();
    await h.engine.start(DIRECT);
    h.advance(OUTGOING_RING_TIMEOUT_MS);
    expect(h.emitted.find(([event]) => event === CLIENT_EVENTS.CALL_ANALYTICS)?.[1]).toMatchObject({ setupTimeMs: -1, negotiationTimeMs: -1, durationSeconds: 0, endReason: 'missed' });
  });
});

describe('le micro coupé reste coupé, quel que soit le moment où on le coupe (#8434)', () => {
  const PEER_JOINED = { callId: 'call-1', participant: { id: 'p-2', userId: PEER, username: 'amina', displayName: 'Amina' } };
  const audioOf = (h: ReturnType<typeof harness>) => (h.call()?.localStream?.getAudioTracks() ?? []).map((t) => t.enabled);
  const settingsOf = (h: ReturnType<typeof harness>, event: string) => (h.requested.find(([name]) => name === event)?.[1] as { settings: { audioEnabled: boolean } } | undefined)?.settings;

  test('coupé AVANT que le micro soit prêt (appel sortant) : la piste naît coupée et le serveur l’apprend', async () => {
    const h = harness();
    const starting = h.engine.start(DIRECT);
    h.engine.toggleMic();
    await starting;
    expect(h.call()?.micMuted).toBe(true);
    expect(audioOf(h)).toEqual([false]);
    expect(settingsOf(h, CLIENT_EVENTS.CALL_INITIATE)?.audioEnabled).toBe(false);
  });

  test('coupé pendant le décroché (appel entrant) : la piste naît coupée et call:join le dit', async () => {
    const h = harness();
    h.engine.handle(SERVER_EVENTS.CALL_INITIATED, { callId: 'call-9', conversationId: 'c-1', mode: 'p2p', type: 'audio', initiator: { userId: PEER, username: 'amina', displayName: 'Amina', avatar: null }, participants: [] });
    const accepting = h.engine.accept();
    h.engine.toggleMic();
    await accepting;
    expect(audioOf(h)).toEqual([false]);
    expect(settingsOf(h, CLIENT_EVENTS.CALL_JOIN)?.audioEnabled).toBe(false);
  });

  test('coupé pendant qu’on rejoint un appel en cours : même chose', async () => {
    const h = harness();
    const joining = h.engine.join({ ...DIRECT, callId: 'call-1' });
    h.engine.toggleMic();
    await joining;
    expect(audioOf(h)).toEqual([false]);
    expect(settingsOf(h, CLIENT_EVENTS.CALL_JOIN)?.audioEnabled).toBe(false);
  });

  const mutedInCall = async (request: StartCallRequest = DIRECT) => {
    const h = harness();
    await h.engine.start(request);
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, PEER_JOINED);
    h.linkState(h.links[0] as FakeLink, 'connected');
    h.engine.toggleMic();
    return h;
  };

  test('partager l’écran puis l’arrêter ne rouvre pas le micro', async () => {
    const h = await mutedInCall({ ...DIRECT, media: 'video' });
    await h.engine.toggleScreen();
    expect(audioOf(h)).toEqual([false]);
    await h.engine.toggleScreen();
    expect(audioOf(h)).toEqual([false]);
    expect(h.call()?.micMuted).toBe(true);
  });

  test('allumer, retourner ou changer la caméra ne rouvre pas le micro', async () => {
    const h = await mutedInCall();
    await h.engine.toggleCamera();
    await h.engine.switchCamera();
    await h.engine.replaceInput('camera', track('video') as unknown as MediaStreamTrack);
    expect(audioOf(h)).toEqual([false]);
  });

  test('la reconnexion du socket re-rejoint micro coupé', async () => {
    const h = await mutedInCall();
    h.binding.authenticated();
    expect((h.requested.at(-1)?.[1] as { settings: { audioEnabled: boolean } }).settings.audioEnabled).toBe(false);
    expect(audioOf(h)).toEqual([false]);
  });

  test('une reprise ICE (renégociation) ne touche pas au micro', async () => {
    const h = await mutedInCall();
    h.linkState(h.links[0] as FakeLink, 'reconnecting');
    h.linkState(h.links[0] as FakeLink, 'connected');
    expect(audioOf(h)).toEqual([false]);
    expect(h.call()?.micMuted).toBe(true);
  });
});


describe('les effets de ma vidéo partent sur la piste ENVOYÉE (#8442)', () => {
  const PEER_JOINED = { callId: 'call-1', participant: { id: 'p-2', userId: PEER, username: 'amina', displayName: 'Amina' } };

  /* Un port d'effets doublé : chaque caméra devient une piste « traitée » ; `refresh` en bâtit une neuve. */
  function effectsPort() {
    const released: FakeTrack[] = [];
    const wrapped: FakeTrack[] = [];
    let used: readonly string[] = [];
    const port: CameraEffectsPort = {
      wrap: async (camera) => {
        wrapped.push(camera as unknown as FakeTrack);
        return track('video') as unknown as MediaStreamTrack;
      },
      refresh: async () => track('video') as unknown as MediaStreamTrack,
      release: (sent) => void released.push(sent as unknown as FakeTrack),
      used: () => used,
    };
    return { port, released, wrapped, use: (names: readonly string[]) => void (used = names) };
  }

  const inVideoCall = async (fx: ReturnType<typeof effectsPort>) => {
    const h = harness({ cameraEffects: fx.port });
    await h.engine.start({ ...DIRECT, media: 'video' });
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, PEER_JOINED);
    h.linkState(h.links[0] as FakeLink, 'connected');
    return h;
  };

  test('la caméra acquise au départ passe par les effets : c’est la piste traitée qui part', async () => {
    const fx = effectsPort();
    const h = await inVideoCall(fx);
    expect(fx.wrapped).toHaveLength(1);
    const sent = h.call()?.localStream?.getVideoTracks()[0];
    expect(sent).not.toBe(fx.wrapped[0] as unknown as MediaStreamTrack);
    expect(h.links[0]?.deps.localStream.getVideoTracks()[0]).toBe(sent as MediaStreamTrack);
  });

  test('changer d’effet remplace la piste sur chaque lien, sans relâcher la caméra', async () => {
    const fx = effectsPort();
    const h = await inVideoCall(fx);
    const before = h.call()?.localStream?.getVideoTracks()[0];
    await h.engine.refreshEffects();
    const after = h.call()?.localStream?.getVideoTracks()[0];
    expect(after).not.toBe(before as MediaStreamTrack);
    expect(h.links[0]?.sent.at(-1)).toBe(after);
    expect(fx.released).toEqual([]);
  });

  test('éteindre la caméra relâche la piste traitée par les effets', async () => {
    const fx = effectsPort();
    const h = await inVideoCall(fx);
    const sent = h.call()?.localStream?.getVideoTracks()[0];
    await h.engine.toggleCamera();
    expect(fx.released).toEqual([sent as unknown as FakeTrack]);
  });

  test('un écran partagé ne passe pas par les effets, et les effets ne s’y appliquent pas', async () => {
    const fx = effectsPort();
    const h = await inVideoCall(fx);
    await h.engine.toggleScreen();
    const display = h.displays[0];
    expect(fx.wrapped).toHaveLength(1);
    await h.engine.refreshEffects();
    expect(h.call()?.localStream?.getVideoTracks()).toEqual([display] as unknown as MediaStreamTrack[]);
  });

  test('raccrocher relâche la piste traitée (caméra comprise)', async () => {
    const fx = effectsPort();
    const h = await inVideoCall(fx);
    const sent = h.call()?.localStream?.getVideoTracks()[0];
    h.engine.hangup();
    expect(fx.released).toContain(sent as unknown as FakeTrack);
  });

  test('le micro coupé reste coupé quand on pose un effet (#8434)', async () => {
    const fx = effectsPort();
    const h = await inVideoCall(fx);
    h.engine.toggleMic();
    await h.engine.refreshEffects();
    expect(h.call()?.localStream?.getAudioTracks().map((t) => t.enabled)).toEqual([false]);
  });

  test('call:analytics nomme les effets posés pendant l’appel — effectsUsed et filtersUsed', async () => {
    const fx = effectsPort();
    const h = await inVideoCall(fx);
    fx.use(['filter:warm', 'background-blur']);
    await h.engine.refreshEffects();
    fx.use([]);
    await h.engine.refreshEffects();
    h.engine.hangup();
    expect(h.emitted.find(([event]) => event === CLIENT_EVENTS.CALL_ANALYTICS)?.[1]).toMatchObject({ effectsUsed: ['filter:warm', 'background-blur'], filtersUsed: true });
  });

  test('sans effet, l’analytique le dit', async () => {
    const h = harness();
    await h.engine.start(DIRECT);
    h.engine.hangup();
    expect(h.emitted.find(([event]) => event === CLIENT_EVENTS.CALL_ANALYTICS)?.[1]).toMatchObject({ effectsUsed: [], filtersUsed: false });
  });
});

describe('les contrôles d’un appel en cours passent par le moteur (#8433, #8438)', () => {
  const connectedCall = async () => {
    const h = harness();
    await h.engine.start(DIRECT);
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, { callId: 'call-1', participant: { id: 'p-2', userId: PEER, username: 'amina', displayName: 'Amina' } });
    h.linkState(h.links[0] as FakeLink, 'connected');
    return h;
  };

  test('qui lance l’appel en est l’initiateur ; qui décroche lit l’initiateur de l’appel', async () => {
    const h = await connectedCall();
    expect(h.call()?.initiatorId).toBe(ME);
    const joined = harness({ acks: { [CLIENT_EVENTS.CALL_JOIN]: { success: true, data: { callSession: { initiatorId: PEER, participants: [] }, iceServers: [] } } } });
    joined.engine.handle(SERVER_EVENTS.CALL_INITIATED, { callId: 'call-9', conversationId: 'c-1', type: 'audio', initiator: { userId: PEER, username: 'amina' }, participants: [] });
    await joined.engine.accept();
    expect(joined.call()?.initiatorId).toBe(PEER);
  });

  test('une invitation sonne « X vous invite à un appel de groupe » : qui invite, et un groupe', () => {
    const h = harness();
    h.engine.handle(SERVER_EVENTS.CALL_INITIATED, { callId: 'call-9', conversationId: 'c-1', type: 'audio', conversationType: 'direct', initiator: { userId: PEER, username: 'amina', displayName: 'Amina' }, invitedBy: { userId: 'u-b', username: 'bruno', displayName: 'Bruno' }, isGroup: true, participants: [] });
    expect(h.call()).toMatchObject({ phase: { kind: 'incoming' }, invitedBy: 'Bruno', callerName: 'Bruno', isGroup: true, initiatorId: PEER });
  });

  test('coupé par l’admin : la piste se coupe et les autres l’apprennent par call:toggle-audio', async () => {
    const h = await connectedCall();
    h.engine.handle(SERVER_EVENTS.CALL_MUTED_BY_MODERATOR, { callId: 'call-1', byUserId: PEER });
    expect(h.call()?.micMuted).toBe(true);
    expect(h.call()?.localStream?.getAudioTracks().every((audio) => !audio.enabled)).toBe(true);
    expect(h.emitted.find(([event]) => event === CLIENT_EVENTS.CALL_TOGGLE_AUDIO)?.[1]).toEqual({ callId: 'call-1', enabled: false });
    h.engine.toggleMic();
    expect(h.call()?.micMuted).toBe(false);
  });

  test('l’invité d’un duo sonne chez moi, et le duo devient groupe', async () => {
    const h = await connectedCall();
    await h.engine.invite({ userId: 'u-b', name: 'Bruno', avatar: null });
    expect(h.call()?.members['u-b']?.link).toBe('ringing');
    expect(h.call()?.isGroup).toBe(true);
    expect(h.call()?.phase.kind).toBe('connected');
  });
});

/**
 * LA CAMÉRA RÉPOND AU PREMIER TOUCHER (#8735) — couper, allumer ou retourner
 * la caméra attendait `getUserMedia`, les effets et chaque lien avant que
 * l'écran ne bouge : rien ne changeait pendant des centaines de millisecondes,
 * on touchait encore, et le second geste partait d'un état périmé. L'écran
 * bascule désormais AUSSITÔT ; un geste en vol en ignore un second ; un échec
 * rend l'état d'avant. Retourner relâche la caméra en cours quand l'appareil
 * ne sait pas en ouvrir deux, et rouvre celle d'avant si l'autre ne vient pas.
 */
describe('la caméra bascule aussitôt, un geste à la fois (#8735)', () => {
  type Pending = { readonly facing: string; readonly resolve: (camera: FakeTrack) => void; readonly reject: (error: Error) => void };

  const deferredCameras = () => {
    const pending: Pending[] = [];
    const acquireCamera = (facing: string) =>
      new Promise<MediaStreamTrack>((resolve, reject) => {
        pending.push({ facing, resolve: (camera) => resolve(camera as unknown as MediaStreamTrack), reject });
      });
    return { pending, acquireCamera };
  };

  const connectedWith = async (acquireCamera: (facing: 'user' | 'environment') => Promise<MediaStreamTrack>) => {
    const h = harness({ acquireCamera });
    await h.engine.start(DIRECT);
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, { callId: 'call-1', participant: { id: 'p-2', userId: PEER, username: 'amina', displayName: 'Amina' } });
    h.linkState(h.links[0] as FakeLink, 'connected');
    return h;
  };

  const videoToggles = (h: Awaited<ReturnType<typeof connectedWith>>) => h.emitted.filter(([event]) => event === CLIENT_EVENTS.CALL_TOGGLE_VIDEO);

  test('allumer : l’écran montre la caméra allumée AVANT que getUserMedia ne réponde, et un second toucher en vol est ignoré', async () => {
    const cameras = deferredCameras();
    const h = await connectedWith(cameras.acquireCamera);
    const first = h.engine.toggleCamera();
    expect(h.call()?.cameraOn).toBe(true);
    const second = h.engine.toggleCamera();
    expect(h.call()?.cameraOn).toBe(true);
    expect(cameras.pending).toHaveLength(1);
    const camera = track('video');
    cameras.pending[0]?.resolve(camera);
    await Promise.all([first, second]);
    expect(h.call()?.cameraOn).toBe(true);
    expect(h.call()?.localStream?.getVideoTracks()).toEqual([camera] as unknown as MediaStreamTrack[]);
    expect(videoToggles(h)).toEqual([[CLIENT_EVENTS.CALL_TOGGLE_VIDEO, { callId: 'call-1', enabled: true }]]);
  });

  test('allumer : un refus rend l’état d’avant — caméra éteinte, appel vocal, rien d’annoncé', async () => {
    const cameras = deferredCameras();
    const h = await connectedWith(cameras.acquireCamera);
    const pending = h.engine.toggleCamera();
    expect(h.call()?.cameraOn).toBe(true);
    cameras.pending[0]?.reject(new Error('NotAllowedError'));
    await pending;
    expect(h.call()?.cameraOn).toBe(false);
    expect(h.call()?.media).toBe('audio');
    expect(videoToggles(h)).toEqual([]);
    const retry = h.engine.toggleCamera();
    expect(cameras.pending).toHaveLength(2);
    cameras.pending[1]?.reject(new Error('NotAllowedError'));
    await retry;
  });

  test('couper : l’écran montre la caméra coupée aussitôt', async () => {
    const h = await connectedWith(async () => track('video') as unknown as MediaStreamTrack);
    await h.engine.toggleCamera();
    const off = h.engine.toggleCamera();
    expect(h.call()?.cameraOn).toBe(false);
    await off;
    expect(h.call()?.localStream?.getVideoTracks()).toEqual([]);
  });

  test('l’appel fini pendant que la caméra s’ouvre : la caméra ouverte trop tard est relâchée', async () => {
    const cameras = deferredCameras();
    const h = await connectedWith(cameras.acquireCamera);
    const pending = h.engine.toggleCamera();
    h.engine.hangup();
    const late = track('video');
    cameras.pending[0]?.resolve(late);
    await pending;
    expect(late.readyState).toBe('ended');
  });

  test('retourner : l’écran se retourne aussitôt, un second toucher en vol est ignoré', async () => {
    const cameras = deferredCameras();
    const h = await connectedWith(cameras.acquireCamera);
    const on = h.engine.toggleCamera();
    cameras.pending[0]?.resolve(track('video'));
    await on;
    const flip = h.engine.switchCamera();
    expect(h.call()?.facing).toBe('environment');
    const again = h.engine.switchCamera();
    expect(cameras.pending).toHaveLength(2);
    const rear = track('video');
    cameras.pending[1]?.resolve(rear);
    await Promise.all([flip, again]);
    expect(h.call()?.facing).toBe('environment');
    expect(h.call()?.localStream?.getVideoTracks()).toEqual([rear] as unknown as MediaStreamTrack[]);
  });

  /* Un téléphone qui n'ouvre qu'une caméra à la fois refuse la seconde tant
     que la première tourne : Retourner ne faisait RIEN, à chaque fois. */
  const oneCameraAtATime = () => {
    const opened: Array<{ readonly facing: string; readonly camera: FakeTrack }> = [];
    const refusals: string[] = [];
    const acquireCamera = async (facing: string) => {
      if (opened.some((entry) => entry.camera.readyState === 'live')) {
        refusals.push(facing);
        throw new Error('NotReadableError');
      }
      const camera = track('video');
      opened.push({ facing, camera });
      return camera as unknown as MediaStreamTrack;
    };
    return { opened, refusals, acquireCamera };
  };

  test('retourner sur un appareil qui n’ouvre qu’une caméra : l’ancienne est relâchée, puis l’autre s’ouvre', async () => {
    const device = oneCameraAtATime();
    const h = await connectedWith(device.acquireCamera);
    await h.engine.toggleCamera();
    await h.engine.switchCamera();
    expect(device.refusals).toEqual(['environment']);
    expect(device.opened.map((entry) => [entry.facing, entry.camera.readyState])).toEqual([
      ['user', 'ended'],
      ['environment', 'live'],
    ]);
    expect(h.call()?.facing).toBe('environment');
    expect(h.call()?.cameraOn).toBe(true);
  });

  test('retourner vers une caméra qui ne vient pas : celle d’avant se rouvre, et l’écran revient à elle', async () => {
    const device = oneCameraAtATime();
    const h = await connectedWith((facing) => (facing === 'environment' ? Promise.reject(new Error('NotFoundError')) : device.acquireCamera(facing)));
    await h.engine.toggleCamera();
    await h.engine.switchCamera();
    expect(h.call()?.facing).toBe('user');
    expect(h.call()?.cameraOn).toBe(true);
    expect(h.call()?.localStream?.getVideoTracks()).toHaveLength(1);
    expect(h.call()?.localStream?.getVideoTracks()[0]?.readyState).toBe('live');
  });
});
