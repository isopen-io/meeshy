import { describe, expect, test } from 'bun:test';

import { ANSWER_INTENT_TTL_MS, answerCallIdFromMessage, answerCallIdFromSearch, listenCallAnswerIntents } from './call-answer-intent';
import { createCallStore, type ActiveCall, type CallPhase } from './call-store';

/**
 * RÉPONDRE DEPUIS LA NOTIFICATION DÉCROCHE (#8043) — le fil ouvert par le
 * worker décroche l'appel qu'il désigne, une fois, pendant la sonnerie ; et la
 * notification suit l'appel quand il quitte la sonnerie dans l'application.
 */

const ringingCall = (callId: string, phase: CallPhase = { kind: 'incoming' }): ActiveCall => ({
  callId,
  conversationId: 'conv-1',
  media: 'audio',
  direction: 'incoming',
  isGroup: false,
  title: 'Awa',
  avatar: null,
  callerName: null,
  phase,
  connectedAt: null,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: false,
  facing: 'user',
  screenSharing: false,
  members: {},
  display: 'full',
  localStream: null,
  remoteStreams: {},
  captions: [],
  captionsMode: 'off',
  captionPeers: [],
  preview: null,
  previewed: false,
  transcription: 'idle',
  initiatorId: null,
  invitedBy: null,
  quality: null,
});

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * `confirmable` : les appels dont le worker a posé la confirmation. Le bouchon
 * la CONSOMME, comme la vraie lecture (`call-answer-confirmation.ts`) : une
 * confirmation ne sert qu'une fois.
 */
function harness(options: { readonly search?: string; readonly confirmable?: readonly string[] } = {}) {
  const store = createCallStore();
  const accepted: number[] = [];
  const closed: string[] = [];
  const forgotten: number[] = [];
  const confirmable = new Set(options.confirmable ?? []);
  const listeners: Array<(event: { data: unknown }) => void> = [];
  let clock = 1_000;
  listenCallAnswerIntents({
    search: options.search ?? '',
    forgetParam: () => void forgotten.push(1),
    container: { addEventListener: (_type, listener) => void listeners.push(listener) },
    store,
    accept: () => void accepted.push(clock),
    closeRinging: (callId) => void closed.push(callId),
    now: () => clock,
    confirm: async (callId) => confirmable.delete(callId),
  });
  return {
    store,
    accepted,
    closed,
    forgotten,
    post: (data: unknown) => listeners.forEach((listener) => listener({ data })),
    ring: (callId: string) => store.setState({ call: ringingCall(callId) }),
    advance: (ms: number) => void (clock += ms),
  };
}

describe('lire l’intention', () => {
  test('dans l’adresse d’un onglet neuf', () => {
    expect(answerCallIdFromSearch('?repondre=call-1')).toBe('call-1');
    expect(answerCallIdFromSearch('?autre=1')).toBeNull();
    expect(answerCallIdFromSearch('?repondre=')).toBeNull();
  });

  test('dans le message du worker, et seulement le sien', () => {
    expect(answerCallIdFromMessage({ type: 'NOTIFICATION_CLICKED', url: '/c/x', answerCallId: 'call-1' })).toBe('call-1');
    expect(answerCallIdFromMessage({ type: 'NOTIFICATION_CLICKED', url: '/c/x' })).toBeNull();
    expect(answerCallIdFromMessage({ type: 'AUTRE', answerCallId: 'call-1' })).toBeNull();
    expect(answerCallIdFromMessage(null)).toBeNull();
  });
});

describe('décrocher l’appel désigné', () => {
  test('onglet neuf : l’appel désigné par une adresse CONFIRMÉE par le worker décroche dès qu’il sonne, et l’adresse est nettoyée', async () => {
    const h = harness({ search: '?repondre=call-1', confirmable: ['call-1'] });
    expect(h.forgotten).toHaveLength(1);
    await settle();
    expect(h.accepted).toEqual([]);
    h.ring('call-1');
    expect(h.accepted).toHaveLength(1);
  });

  test('une adresse forgée, que le worker n’a pas posée, ne décroche JAMAIS : l’appel sonne et attend un toucher', async () => {
    const h = harness({ search: '?repondre=call-1' });
    await settle();
    h.ring('call-1');
    expect(h.accepted).toEqual([]);
    expect(h.forgotten).toHaveLength(1);
  });

  test('la confirmation du worker ne sert qu’une fois : la même adresse rejouée ne décroche plus', async () => {
    const first = harness({ search: '?repondre=call-1', confirmable: ['call-1'] });
    await settle();
    first.ring('call-1');
    expect(first.accepted).toHaveLength(1);
    const replay = harness({ search: '?repondre=call-1' });
    await settle();
    replay.ring('call-1');
    expect(replay.accepted).toEqual([]);
  });

  test('la confirmation d’un AUTRE appel ne vaut pas pour celui que l’adresse désigne', async () => {
    const h = harness({ search: '?repondre=call-1', confirmable: ['call-2'] });
    await settle();
    h.ring('call-1');
    expect(h.accepted).toEqual([]);
  });

  test('onglet ouvert : l’appel qui sonne déjà décroche à la réception du message', () => {
    const h = harness();
    h.ring('call-1');
    h.post({ type: 'NOTIFICATION_CLICKED', url: '/c/conv-1', answerCallId: 'call-1' });
    expect(h.accepted).toHaveLength(1);
  });

  test('un AUTRE appel qui sonne ne décroche pas', async () => {
    const h = harness({ search: '?repondre=call-1', confirmable: ['call-1'] });
    await settle();
    h.ring('call-2');
    expect(h.accepted).toEqual([]);
  });

  test('l’intention ne sert qu’une fois', async () => {
    const h = harness({ search: '?repondre=call-1', confirmable: ['call-1'] });
    await settle();
    h.ring('call-1');
    h.store.setState({ call: null });
    h.ring('call-1');
    expect(h.accepted).toHaveLength(1);
  });

  test('passé la sonnerie, l’intention expire', async () => {
    const h = harness({ search: '?repondre=call-1', confirmable: ['call-1'] });
    await settle();
    h.advance(ANSWER_INTENT_TTL_MS + 1);
    h.ring('call-1');
    expect(h.accepted).toEqual([]);
  });

  test('un toucher du corps (sans appel à décrocher) ne décroche rien', () => {
    const h = harness();
    h.ring('call-1');
    h.post({ type: 'NOTIFICATION_CLICKED', url: '/c/conv-1' });
    expect(h.accepted).toEqual([]);
  });
});

describe('la notification suit l’appel', () => {
  test('décroché, refusé ou terminé dans l’application : la notification de cet appel est retirée', () => {
    const h = harness();
    h.ring('call-1');
    h.store.setState({ call: ringingCall('call-1', { kind: 'connecting' }) });
    h.ring('call-2');
    h.store.setState({ call: null });
    expect(h.closed).toEqual(['call-1', 'call-2']);
  });

  test('un appel qui sonne toujours ne retire rien', () => {
    const h = harness();
    h.ring('call-1');
    h.store.setState({ call: { ...ringingCall('call-1'), micMuted: true } });
    expect(h.closed).toEqual([]);
  });
});
