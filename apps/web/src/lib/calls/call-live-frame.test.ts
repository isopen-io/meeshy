import { describe, expect, test } from 'bun:test';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { createCallLiveFrame, decodeLiveFrameSelected, isLiveFrameId, liveFrameDuo, liveFrameMayShowProposal, toggledHold, type LiveFrameDeps } from './call-live-frame';
import { createCallLiveFrameStore } from './call-live-frame-store';
import { createCallStore, type ActiveCall, type CallMember } from './call-store';

/**
 * LE CADRE EN DIRECT D'UN APPEL À DEUX, CÔTÉ WEB (#16943, loi 16) — mêmes
 * règles que `CallLiveFrameSession.swift`, même protocole
 * (`call:frame-select` → `call:frame-selected`, `packages/shared/types/call-live-frame.ts`).
 * Mon cadre s'applique tout de suite chez moi et part à l'autre comme une
 * PROPOSITION ; une proposition reçue ne touche jamais mon cadre.
 */

const CALL = '6650c0ffee0000000000c411';

const member = (userId: string, name: string): CallMember => ({ userId, name, avatar: null, micMuted: false, cameraOn: true, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected' });

const activeCall = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: CALL,
  conversationId: 'c-1',
  media: 'video',
  direction: 'outgoing',
  isGroup: false,
  title: 'Awa',
  avatar: null,
  callerName: null,
  initiatorId: null,
  invitedBy: null,
  phase: { kind: 'connected' },
  connectedAt: 0,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: true,
  facing: 'user',
  screenSharing: false,
  members: { 'u-awa': member('u-awa', 'Awa') },
  display: 'full',
  localStream: null,
  remoteStreams: {},
  captions: [],
  captionsMode: 'off',
  captionPeers: [],
  transcription: 'idle',
  quality: null,
  preview: null,
  previewed: false,
  ...overrides,
});

type Sent = { readonly event: string; readonly payload: Record<string, unknown> };

const harness = (options: { readonly ack?: unknown; readonly call?: ActiveCall | null } = {}) => {
  const calls = createCallStore();
  calls.setState({ call: options.call === undefined ? activeCall() : options.call });
  const store = createCallLiveFrameStore();
  const sent: Sent[] = [];
  const deps: LiveFrameDeps = {
    store,
    calls,
    myName: () => 'Sam',
    transport: () => ({
      connected: () => true,
      emit: () => undefined,
      request: async (event, payload) => {
        sent.push({ event, payload: payload as Record<string, unknown> });
        return options.ack ?? { success: true };
      },
    }),
  };
  const frame = createCallLiveFrame(deps);
  return { frame, store, calls, sent, state: () => store.getState() };
};

const selected = (overrides: Record<string, unknown> = {}) => ({ callId: CALL, userId: 'u-awa', frameId: 'jovial.confettis', texts: { name: 'Awa' }, at: '2026-11-08T12:00:00.000Z', ...overrides });

describe('les règles pures', () => {
  test('un identifiant du catalogue a la forme que la passerelle exige', () => {
    expect(isLiveFrameId('jovial.confettis')).toBe(true);
    expect(isLiveFrameId('jovial.confettis.duo')).toBe(true);
    expect(isLiveFrameId('jovial')).toBe(false);
    expect(isLiveFrameId('Jovial.Confettis')).toBe(false);
    expect(isLiveFrameId(`a.${'b'.repeat(96)}`)).toBe(false);
  });

  test('toucher le cadre déjà gardé le retire ; toucher un autre le garde à sa place', () => {
    expect(toggledHold(null, 'jovial.a')).toBe('jovial.a');
    expect(toggledHold('jovial.a', 'jovial.a')).toBeNull();
    expect(toggledHold('jovial.a', 'jovial.b')).toBe('jovial.b');
  });

  test('le cadre en direct n’existe qu’à deux, en vidéo', () => {
    expect(liveFrameDuo(activeCall())).toBe(true);
    expect(liveFrameDuo(activeCall({ media: 'audio', cameraOn: false, members: { 'u-awa': { ...member('u-awa', 'Awa'), cameraOn: false } } }))).toBe(false);
    expect(liveFrameDuo(activeCall({ isGroup: true, members: { 'u-awa': member('u-awa', 'Awa'), 'u-k': member('u-k', 'Karim') } }))).toBe(false);
    expect(liveFrameDuo(activeCall({ phase: { kind: 'incoming' } }))).toBe(false);
    expect(liveFrameDuo(null)).toBe(false);
  });

  test('ce que la passerelle relaie se relit champ par champ ; une forme étrangère est ignorée', () => {
    expect(decodeLiveFrameSelected(selected())).toEqual({ callId: CALL, userId: 'u-awa', frameId: 'jovial.confettis', name: 'Awa', reply: null });
    expect(decodeLiveFrameSelected(selected({ frameId: null, texts: undefined }))).toEqual({ callId: CALL, userId: 'u-awa', frameId: null, name: null, reply: null });
    expect(decodeLiveFrameSelected(selected({ reply: 'declined' }))?.reply).toBe('declined');
    expect(decodeLiveFrameSelected(selected({ frameId: '../../etc' }))).toBeNull();
    expect(decodeLiveFrameSelected(selected({ reply: 'maybe' }))).toBeNull();
    expect(decodeLiveFrameSelected('nope')).toBeNull();
  });
});

describe('mon cadre (C1)', () => {
  test('il s’applique tout de suite chez moi et part comme une proposition, avec le prénom que je partage', async () => {
    const h = harness();
    await h.frame.apply('jovial.confettis');
    expect(h.state().frameId).toBe('jovial.confettis');
    expect(h.state().sentProposal).toBe('jovial.confettis');
    expect(h.sent).toEqual([{ event: CLIENT_EVENTS.CALL_FRAME_SELECT, payload: { callId: CALL, frameId: 'jovial.confettis', texts: { name: 'Sam' } } }]);
  });

  test('un refus de la passerelle me laisse mon cadre, mais dit qu’il n’a pas été proposé', async () => {
    const h = harness({ ack: { success: false, code: 'CALL_NOT_ACTIVE' } });
    await h.frame.apply('jovial.confettis');
    expect(h.state().frameId).toBe('jovial.confettis');
    expect(h.state().sentProposal).toBeNull();
    expect(h.state().notice).toBe('not-proposed');
  });

  test('retirer mon cadre retire ma proposition tant qu’elle attend sa réponse', async () => {
    const h = harness();
    await h.frame.apply('jovial.confettis');
    await h.frame.apply(null);
    expect(h.state().frameId).toBeNull();
    expect(h.sent.at(-1)).toEqual({ event: CLIENT_EVENTS.CALL_FRAME_SELECT, payload: { callId: CALL, frameId: null } });
  });

  test('retirer un cadre que je n’ai jamais proposé n’envoie rien', async () => {
    const h = harness();
    await h.frame.apply(null);
    expect(h.sent).toHaveLength(0);
  });

  test('un cadre que l’autre montre déjà ne se repropose pas', async () => {
    const h = harness();
    h.frame.receive(SERVER_EVENTS.CALL_FRAME_SELECTED, selected());
    await h.frame.decline();
    h.sent.length = 0;
    await h.frame.apply('jovial.confettis');
    expect(h.state().frameId).toBe('jovial.confettis');
    expect(h.sent).toHaveLength(0);
  });

  test('hors d’un appel, ou un identifiant mal formé : rien ne change', async () => {
    const h = harness({ call: null });
    await h.frame.apply('jovial.confettis');
    expect(h.state().frameId).toBeNull();
    const g = harness();
    await g.frame.apply('pas un cadre');
    expect(g.state().frameId).toBeNull();
    expect(g.sent).toHaveLength(0);
  });
});

describe('la proposition de l’autre (C2)', () => {
  test('elle se pose sans toucher à mon cadre, avec le prénom qu’il partage', async () => {
    const h = harness();
    await h.frame.apply('signature.trait');
    h.frame.receive(SERVER_EVENTS.CALL_FRAME_SELECTED, selected());
    expect(h.state().proposal).toEqual({ frameId: 'jovial.confettis', from: 'Awa' });
    expect(h.state().frameId).toBe('signature.trait');
  });

  test('« Appliquer » pose son cadre chez moi et le lui dit', async () => {
    const h = harness();
    h.frame.receive(SERVER_EVENTS.CALL_FRAME_SELECTED, selected());
    await h.frame.accept();
    expect(h.state().frameId).toBe('jovial.confettis');
    expect(h.state().proposal).toBeNull();
    expect(h.sent).toEqual([{ event: CLIENT_EVENTS.CALL_FRAME_SELECT, payload: { callId: CALL, frameId: 'jovial.confettis', texts: { name: 'Sam' }, reply: 'accepted' } }]);
  });

  test('« Non merci » garde mon affichage et le lui dit', async () => {
    const h = harness();
    h.frame.receive(SERVER_EVENTS.CALL_FRAME_SELECTED, selected());
    await h.frame.decline();
    expect(h.state().frameId).toBeNull();
    expect(h.state().proposal).toBeNull();
    expect(h.sent.at(-1)?.payload.reply).toBe('declined');
  });

  test('une proposition du cadre que je montre déjà s’accepte d’elle-même, sans carte', async () => {
    const h = harness();
    await h.frame.apply('jovial.confettis');
    h.sent.length = 0;
    h.frame.receive(SERVER_EVENTS.CALL_FRAME_SELECTED, selected());
    await h.frame.settle();
    expect(h.state().proposal).toBeNull();
    expect(h.sent.at(-1)?.payload.reply).toBe('accepted');
  });

  test('une proposition retirée (`frameId: null`) efface la carte', () => {
    const h = harness();
    h.frame.receive(SERVER_EVENTS.CALL_FRAME_SELECTED, selected());
    h.frame.receive(SERVER_EVENTS.CALL_FRAME_SELECTED, selected({ frameId: null }));
    expect(h.state().proposal).toBeNull();
  });

  test('un événement d’un autre appel est ignoré', () => {
    const h = harness();
    h.frame.receive(SERVER_EVENTS.CALL_FRAME_SELECTED, selected({ callId: '6650c0ffee0000000000aaaa' }));
    expect(h.state().proposal).toBeNull();
  });
});

describe('la proposition n’est montrée qu’en duo vidéo (C2.10)', () => {
  const audio = () => activeCall({ media: 'audio', cameraOn: false, members: { 'u-awa': { ...member('u-awa', 'Awa'), cameraOn: false } } });

  test('la loi : duo vidéo seulement — ni duo audio, ni groupe, ni appel pas encore joint (table de `CallLiveFrameRule.mayShowProposal`)', () => {
    expect(liveFrameMayShowProposal(activeCall())).toBe(true);
    expect(liveFrameMayShowProposal(audio())).toBe(false);
    expect(liveFrameMayShowProposal(activeCall({ isGroup: true, members: { 'u-awa': member('u-awa', 'Awa'), 'u-k': member('u-k', 'Karim') } }))).toBe(false);
    expect(liveFrameMayShowProposal(activeCall({ members: { 'u-awa': member('u-awa', 'Awa'), 'u-k': member('u-k', 'Karim') } }))).toBe(false);
    expect(liveFrameMayShowProposal(activeCall({ phase: { kind: 'incoming' } }))).toBe(false);
    expect(liveFrameMayShowProposal(null)).toBe(false);
  });

  test('un appel qui bouge sans toucher la proposition ne réécrit pas l’état du cadre', () => {
    const h = harness();
    h.frame.start();
    h.frame.receive(SERVER_EVENTS.CALL_FRAME_SELECTED, selected());
    let writes = 0;
    h.store.subscribe(() => {
      writes += 1;
    });
    h.calls.setState({ call: activeCall({ micMuted: true }) });
    h.calls.setState({ call: activeCall({ micMuted: false }) });
    expect(writes).toBe(0);
  });

  test('en duo audio, une proposition reçue ne se montre pas', () => {
    const h = harness({ call: audio() });
    h.frame.start();
    h.frame.receive(SERVER_EVENTS.CALL_FRAME_SELECTED, selected());
    expect(h.state().proposal).toBeNull();
  });

  test('en duo audio, aucune carte : rien n’est à appliquer, aucun cadre ne se pose', async () => {
    const h = harness({ call: audio() });
    h.frame.start();
    h.frame.receive(SERVER_EVENTS.CALL_FRAME_SELECTED, selected());
    await h.frame.accept();
    expect(h.state().frameId).toBeNull();
    expect(h.sent).toHaveLength(0);
  });

  test('la proposition masquée en audio réapparaît au retour en duo vidéo', () => {
    const h = harness({ call: audio() });
    h.frame.start();
    h.frame.receive(SERVER_EVENTS.CALL_FRAME_SELECTED, selected());
    h.calls.setState({ call: activeCall() });
    expect(h.state().proposal).toEqual({ frameId: 'jovial.confettis', from: 'Awa' });
  });

  test('une proposition montrée se range quand l’appel passe en audio', () => {
    const h = harness();
    h.frame.start();
    h.frame.receive(SERVER_EVENTS.CALL_FRAME_SELECTED, selected());
    h.calls.setState({ call: audio() });
    expect(h.state().proposal).toBeNull();
    h.calls.setState({ call: activeCall() });
    expect(h.state().proposal?.frameId).toBe('jovial.confettis');
  });

  test('retirée par l’autre pendant qu’elle est masquée, elle ne revient pas', () => {
    const h = harness({ call: audio() });
    h.frame.start();
    h.frame.receive(SERVER_EVENTS.CALL_FRAME_SELECTED, selected());
    h.frame.receive(SERVER_EVENTS.CALL_FRAME_SELECTED, selected({ frameId: null }));
    h.calls.setState({ call: activeCall() });
    expect(h.state().proposal).toBeNull();
  });
});

describe('la réponse à ma proposition (C3)', () => {
  test('« appliqué » chez l’autre : une capsule le dit, puis s’efface', async () => {
    const h = harness();
    await h.frame.apply('jovial.confettis');
    h.frame.receive(SERVER_EVENTS.CALL_FRAME_SELECTED, selected({ reply: 'accepted' }));
    expect(h.state().answer).toEqual({ frameId: 'jovial.confettis', reply: 'accepted', from: 'Awa' });
    expect(h.state().sentProposal).toBeNull();
    h.frame.dismissAnswer();
    expect(h.state().answer).toBeNull();
  });

  test('une réponse à une proposition que je n’ai pas faite est ignorée', () => {
    const h = harness();
    h.frame.receive(SERVER_EVENTS.CALL_FRAME_SELECTED, selected({ reply: 'declined' }));
    expect(h.state().answer).toBeNull();
  });
});

describe('le cadre suit l’appel', () => {
  test('l’appel passe à trois : le cadre tombe, localement, sans rien envoyer', async () => {
    const h = harness();
    h.frame.start();
    await h.frame.apply('jovial.confettis');
    h.sent.length = 0;
    h.calls.setState({ call: activeCall({ isGroup: true, members: { 'u-awa': member('u-awa', 'Awa'), 'u-k': member('u-k', 'Karim') } }) });
    expect(h.state().frameId).toBeNull();
    expect(h.sent).toHaveLength(0);
    h.frame.stop();
  });

  test('un autre appel, ou plus d’appel : rien de l’ancien ne reste', async () => {
    const h = harness();
    h.frame.start();
    await h.frame.apply('jovial.confettis');
    h.calls.setState({ call: null });
    expect(h.state().frameId).toBeNull();
    expect(h.state().callId).toBeNull();
    h.frame.stop();
  });
});
