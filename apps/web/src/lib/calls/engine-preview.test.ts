import { afterEach, describe, expect, test } from 'bun:test';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { DIRECT, flush, harness, ME, PEER, stream, track, type FakeLink } from '@/test-support/call-engine-harness';

import { CALL_SERVER_EVENTS } from './call-socket-bridge';
import { resetCallTransportForTests } from './call-transport';

/**
 * L'APERÇU AVANT DÉCROCHÉ (#8480) — l'appelé voit l'appelant, et l'entend s'il
 * active le son, pendant que l'appel sonne. Le lien d'aperçu passe par
 * `call:preview-*`, jamais par `call:signal` (qui décrocherait), et l'appelé
 * n'y met AUCUNE piste : ses médias ne partent qu'au décroché.
 */

afterEach(() => resetCallTransportForTests());

const INITIATED = (type: 'audio' | 'video', extra: Record<string, unknown> = {}) => ({
  callId: 'call-9',
  conversationId: 'c-1',
  mode: 'p2p',
  type,
  initiator: { userId: PEER, username: 'amina', displayName: 'Amina', avatar: null },
  participants: [],
  ...extra,
});

const OFFER = { callId: 'call-9', signal: { type: 'offer', from: PEER, to: ME, sdp: 'v=0 m=video', negotiationId: 1 } };
const PEER_JOINED = { callId: 'call-1', participant: { id: 'p-2', userId: PEER, username: 'amina', displayName: 'Amina' } };

describe('côté appelé : voir qui appelle avant de décrocher', () => {
  test('un appel qui sonne demande l’aperçu à la passerelle', () => {
    const h = harness();
    h.engine.handle(SERVER_EVENTS.CALL_INITIATED, INITIATED('video'));
    expect(h.emitted).toContainEqual([CLIENT_EVENTS.CALL_PREVIEW_REQUEST, { callId: 'call-9' }]);
  });

  test('un appel de groupe ne demande pas d’aperçu', () => {
    const h = harness();
    h.engine.handle(SERVER_EVENTS.CALL_INITIATED, INITIATED('video', { isGroup: true, conversationTitle: 'Équipe' }));
    expect(h.names(h.emitted)).not.toContain(CLIENT_EVENTS.CALL_PREVIEW_REQUEST);
  });

  test('l’offre de l’appelant ouvre un lien en RÉCEPTION SEULE, sans aucune piste de l’appelé', async () => {
    const h = harness();
    h.engine.handle(SERVER_EVENTS.CALL_INITIATED, INITIATED('video'));
    h.engine.handle(SERVER_EVENTS.CALL_PREVIEW_SIGNAL, OFFER);
    await flush();
    const link = h.links[0] as FakeLink;
    expect(link.deps.receiveOnly).toBe(true);
    expect(link.deps.localStream.getTracks()).toEqual([]);
    expect(link.received).toEqual(['offer']);
    expect(h.call()?.phase.kind).toBe('incoming');
  });

  test('la vidéo reçue s’affiche sur l’écran de sonnerie', async () => {
    const h = harness();
    h.engine.handle(SERVER_EVENTS.CALL_INITIATED, INITIATED('video'));
    h.engine.handle(SERVER_EVENTS.CALL_PREVIEW_SIGNAL, OFFER);
    await flush();
    const link = h.links[0] as FakeLink;
    link.deps.onRemoteStream(stream([track('video'), track('audio')]));
    expect(h.call()?.preview?.getVideoTracks()).toHaveLength(1);
  });

  test('la réponse repart par le canal d’aperçu, jamais par call:signal', async () => {
    const h = harness();
    h.engine.handle(SERVER_EVENTS.CALL_INITIATED, INITIATED('video'));
    h.engine.handle(SERVER_EVENTS.CALL_PREVIEW_SIGNAL, OFFER);
    await flush();
    (h.links[0] as FakeLink).deps.send({ type: 'answer', sdp: 'v=0', negotiationId: 1 });
    expect(h.emitted).toContainEqual([CLIENT_EVENTS.CALL_PREVIEW_SIGNAL, { callId: 'call-9', signal: { type: 'answer', sdp: 'v=0', negotiationId: 1, from: ME, to: PEER } }]);
    expect(h.names(h.emitted)).not.toContain(CLIENT_EVENTS.CALL_SIGNAL);
  });

  test('un signal d’aperçu d’un autre que l’appelant est ignoré', async () => {
    const h = harness();
    h.engine.handle(SERVER_EVENTS.CALL_INITIATED, INITIATED('video'));
    h.engine.handle(SERVER_EVENTS.CALL_PREVIEW_SIGNAL, { ...OFFER, signal: { ...OFFER.signal, from: 'u-eve' } });
    await flush();
    expect(h.links).toEqual([]);
  });

  test('refuser ferme l’aperçu', async () => {
    const h = harness();
    h.engine.handle(SERVER_EVENTS.CALL_INITIATED, INITIATED('video'));
    h.engine.handle(SERVER_EVENTS.CALL_PREVIEW_SIGNAL, OFFER);
    await flush();
    h.engine.decline();
    expect((h.links[0] as FakeLink).closed).toBe(true);
  });

  test('au décroché, l’aperçu reste affiché jusqu’à ce que le vrai lien soit connecté, puis se ferme', async () => {
    const h = harness();
    h.engine.handle(SERVER_EVENTS.CALL_INITIATED, INITIATED('video'));
    h.engine.handle(SERVER_EVENTS.CALL_PREVIEW_SIGNAL, OFFER);
    await flush();
    const preview = h.links[0] as FakeLink;
    preview.deps.onRemoteStream(stream([track('video')]));
    await h.engine.accept();
    expect(preview.closed).toBe(false);
    expect(h.call()?.preview).not.toBeNull();
    h.engine.handle(SERVER_EVENTS.CALL_SIGNAL, { ...OFFER, signal: { ...OFFER.signal } });
    await flush();
    const real = h.links[1] as FakeLink;
    expect(real.deps.receiveOnly).not.toBe(true);
    h.linkState(real, 'connected');
    expect(preview.closed).toBe(true);
    expect(h.call()?.preview).toBeNull();
  });

  test('un lien d’aperçu qui échoue se ferme sans toucher à l’appel', async () => {
    const h = harness();
    h.engine.handle(SERVER_EVENTS.CALL_INITIATED, INITIATED('video'));
    h.engine.handle(SERVER_EVENTS.CALL_PREVIEW_SIGNAL, OFFER);
    await flush();
    h.linkState(h.links[0] as FakeLink, 'failed');
    expect((h.links[0] as FakeLink).closed).toBe(true);
    expect(h.call()?.phase.kind).toBe('incoming');
  });
});

describe('côté appelant : l’appelé me voit pendant que ça sonne', () => {
  const requested = { callId: 'call-1', userId: PEER };

  test('la demande d’aperçu ouvre un lien qui OFFRE mon média, par le canal d’aperçu', async () => {
    const h = harness();
    await h.engine.start({ ...DIRECT, media: 'video' });
    h.engine.handle(SERVER_EVENTS.CALL_PREVIEW_REQUESTED, requested);
    await flush();
    const link = h.links[0] as FakeLink;
    expect(link.offers).toBe(1);
    expect(link.deps.localStream.getVideoTracks()).toHaveLength(1);
    link.deps.send({ type: 'offer', sdp: 'v=0', negotiationId: 1 });
    expect(h.emitted).toContainEqual([CLIENT_EVENTS.CALL_PREVIEW_SIGNAL, { callId: 'call-1', signal: { type: 'offer', sdp: 'v=0', negotiationId: 1, from: ME, to: PEER } }]);
  });

  test('l’écran dit que l’appelé me voit, une fois l’aperçu connecté', async () => {
    const h = harness();
    await h.engine.start({ ...DIRECT, media: 'video' });
    h.engine.handle(SERVER_EVENTS.CALL_PREVIEW_REQUESTED, requested);
    await flush();
    expect(h.call()?.previewed).toBe(false);
    h.linkState(h.links[0] as FakeLink, 'connected');
    expect(h.call()?.previewed).toBe(true);
    expect(h.call()?.phase.kind).toBe('outgoing');
  });

  test('la réponse de l’appelé arrive sur le lien d’aperçu', async () => {
    const h = harness();
    await h.engine.start({ ...DIRECT, media: 'video' });
    h.engine.handle(SERVER_EVENTS.CALL_PREVIEW_REQUESTED, requested);
    await flush();
    h.engine.handle(SERVER_EVENTS.CALL_PREVIEW_SIGNAL, { callId: 'call-1', signal: { type: 'answer', from: PEER, to: ME, sdp: 'v=0', negotiationId: 1 } });
    await flush();
    expect((h.links[0] as FakeLink).received).toEqual(['answer']);
  });

  test('une demande pour un autre appel, ou un appel de groupe, reste sans suite', async () => {
    const other = harness();
    await other.engine.start({ ...DIRECT, media: 'video' });
    other.engine.handle(SERVER_EVENTS.CALL_PREVIEW_REQUESTED, { callId: 'call-2', userId: PEER });
    const group = harness();
    await group.engine.start({ ...DIRECT, media: 'video', isGroup: true });
    group.engine.handle(SERVER_EVENTS.CALL_PREVIEW_REQUESTED, requested);
    await flush();
    expect(other.links).toEqual([]);
    expect(group.links).toEqual([]);
  });

  test('le décroché remplace l’aperçu par le vrai lien, et l’aperçu se ferme à la connexion', async () => {
    const h = harness();
    await h.engine.start({ ...DIRECT, media: 'video' });
    h.engine.handle(SERVER_EVENTS.CALL_PREVIEW_REQUESTED, requested);
    await flush();
    const preview = h.links[0] as FakeLink;
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, PEER_JOINED);
    const real = h.links[1] as FakeLink;
    expect(real.offers).toBe(1);
    h.linkState(real, 'connected');
    expect(preview.closed).toBe(true);
    expect(h.call()?.previewed).toBe(false);
  });

  test('raccrocher pendant la sonnerie ferme l’aperçu', async () => {
    const h = harness();
    await h.engine.start({ ...DIRECT, media: 'video' });
    h.engine.handle(SERVER_EVENTS.CALL_PREVIEW_REQUESTED, requested);
    await flush();
    h.engine.hangup();
    expect((h.links[0] as FakeLink).closed).toBe(true);
  });

  test('allumer la caméra pendant la sonnerie la montre aussi dans l’aperçu', async () => {
    const h = harness();
    await h.engine.start(DIRECT);
    h.engine.handle(SERVER_EVENTS.CALL_PREVIEW_REQUESTED, requested);
    await flush();
    await h.engine.toggleCamera();
    expect((h.links[0] as FakeLink).sent).toHaveLength(1);
  });
});

describe('le micro de l’appelant pendant la sonnerie', () => {
  const audioOf = (h: ReturnType<typeof harness>) => (h.call()?.localStream?.getAudioTracks() ?? []).map((t) => t.enabled);

  test('coupé pendant la sonnerie, il se rouvre quand l’appel est établi', async () => {
    const h = harness();
    await h.engine.start(DIRECT);
    h.engine.toggleMic();
    expect(audioOf(h)).toEqual([false]);
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, PEER_JOINED);
    h.linkState(h.links[0] as FakeLink, 'connected');
    expect(h.call()?.micMuted).toBe(false);
    expect(audioOf(h)).toEqual([true]);
    expect(h.emitted).toContainEqual([CLIENT_EVENTS.CALL_TOGGLE_AUDIO, { callId: 'call-1', enabled: true }]);
  });

  test('coupé puis rouvert pendant la sonnerie : rien à rouvrir à la connexion', async () => {
    const h = harness();
    await h.engine.start(DIRECT);
    h.engine.toggleMic();
    h.engine.toggleMic();
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, PEER_JOINED);
    const toggles = h.emitted.filter(([event]) => event === CLIENT_EVENTS.CALL_TOGGLE_AUDIO).length;
    h.linkState(h.links[0] as FakeLink, 'connected');
    expect(h.emitted.filter(([event]) => event === CLIENT_EVENTS.CALL_TOGGLE_AUDIO)).toHaveLength(toggles);
    expect(h.call()?.micMuted).toBe(false);
  });

  test('coupé APRÈS la connexion, il reste coupé (#8434)', async () => {
    const h = harness();
    await h.engine.start(DIRECT);
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, PEER_JOINED);
    h.linkState(h.links[0] as FakeLink, 'connected');
    h.engine.toggleMic();
    h.linkState(h.links[0] as FakeLink, 'reconnecting');
    h.linkState(h.links[0] as FakeLink, 'connected');
    expect(h.call()?.micMuted).toBe(true);
  });
});

test('le pont du socket remet les deux événements d’aperçu au moteur', () => {
  expect(CALL_SERVER_EVENTS).toContain(SERVER_EVENTS.CALL_PREVIEW_REQUESTED);
  expect(CALL_SERVER_EVENTS).toContain(SERVER_EVENTS.CALL_PREVIEW_SIGNAL);
});
