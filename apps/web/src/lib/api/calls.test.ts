import { describe, expect, test } from 'bun:test';

import { callHistoryQueryKey, decodeCallRecord, loadCallHistory } from './calls';
import { createHttpTransport } from './http';

/**
 * LE PORT DU JOURNAL D'APPELS (#6362) — `GET /api/v1/calls/history`
 * (`services/gateway/src/routes/calls-consultation.ts`, `CallService.listHistory`).
 * Témoins écrits contre le transport RÉEL nourri d'un `fetch` bouchonné : le
 * chemin que la passerelle reçoit et la page qu'elle rend sont mesurés.
 */

const wireRecord = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  callId: '64f0c0ffee00000000000a01',
  conversationId: '64f0c0ffee00000000000c01',
  conversationType: 'direct',
  conversationTitle: null,
  conversationAvatar: null,
  mode: 'p2p',
  status: 'ended',
  endReason: 'completed',
  direction: 'outgoing',
  isVideo: false,
  startedAt: '2026-09-13T09:00:00.000Z',
  answeredAt: '2026-09-13T09:00:04.000Z',
  endedAt: '2026-09-13T09:03:09.000Z',
  durationSec: 185,
  bytesSent: 120000,
  bytesReceived: 118000,
  peer: {
    userId: '64f0c0ffee0000000000abcd',
    username: 'ada',
    displayName: 'Ada Lovelace',
    avatar: 'https://cdn.test/ada.jpg',
    phoneNumber: '+221770000000',
    isOnline: true,
  },
  ...overrides,
});

type RecordedCall = { readonly url: string; readonly method: string };

const gatewayReplying = (reply: { readonly status: number; readonly body: unknown }) => {
  const calls: RecordedCall[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(input), method: init?.method ?? 'GET' });
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } });
  };
  const transport = createHttpTransport({ base: 'https://gate.test', fetchImpl: fetchImpl as typeof fetch, timeoutMs: 0 });
  return { calls, deps: { source: 'gateway' as const, transport } };
};

describe('un appel décodé est une PROJECTION', () => {
  test('ni le numéro ni la présence du pair n’entrent dans le cache persisté ; les octets de l’appel, si', () => {
    expect(decodeCallRecord(wireRecord())).toEqual({
      callId: '64f0c0ffee00000000000a01',
      conversationId: '64f0c0ffee00000000000c01',
      conversationType: 'direct',
      conversationTitle: null,
      conversationAvatar: null,
      direction: 'outgoing',
      isVideo: false,
      startedAt: '2026-09-13T09:00:00.000Z',
      durationSec: 185,
      bytes: 238000,
      peer: { userId: '64f0c0ffee0000000000abcd', username: 'ada', displayName: 'Ada Lovelace', avatar: 'https://cdn.test/ada.jpg' },
      participants: [],
      reactionCounts: {},
    });
  });

  test('les réactions de l’appel (#8439) sont relues sans confiance : un emoji hors liste ou un compte faux tombe', () => {
    expect(decodeCallRecord(wireRecord({ reactionCounts: { '👍': 3, '💩': 9, '🎉': 'x', '🔥': 0 } }))?.reactionCounts).toEqual({ '👍': 3 });
    expect(decodeCallRecord(wireRecord({ reactionCounts: 'x' }))?.reactionCounts).toEqual({});
  });

  test('une direction inconnue se lit « reçu », comme `CallDirection(raw:)` d’iOS', () => {
    expect(decodeCallRecord(wireRecord({ direction: 'forwarded' }))?.direction).toBe('incoming');
  });

  test('un appel de groupe n’a pas de pair, et garde le titre de sa conversation', () => {
    const record = decodeCallRecord(wireRecord({ peer: null, conversationType: 'group', conversationTitle: 'Équipe' }));
    expect(record?.peer).toBeNull();
    expect(record?.conversationTitle).toBe('Équipe');
  });

  test('un appel de groupe nomme ses participants (#8066) — sans présence ni contact, une entrée illisible écartée', () => {
    const record = decodeCallRecord(
      wireRecord({
        peer: null,
        conversationType: 'group',
        participants: [
          { participantId: 'p-ada', userId: 'u-ada', username: 'ada', displayName: 'Ada', avatar: 'a.jpg', isOnline: true, phoneNumber: '+33600000000' },
          { participantId: 'p-guest', userId: null, username: null, displayName: 'Invité', avatar: null },
          { participantId: 'p-bad', displayName: 42 },
        ],
      }),
    );
    expect(record?.participants).toEqual([
      { participantId: 'p-ada', username: 'ada', displayName: 'Ada', avatar: 'a.jpg' },
      { participantId: 'p-guest', username: null, displayName: 'Invité', avatar: null },
    ]);
  });

  test('une charge sans participants (passerelle antérieure) se lit liste vide', () => {
    expect(decodeCallRecord(wireRecord({ participants: undefined }))?.participants).toEqual([]);
    expect(decodeCallRecord(wireRecord({ participants: 'x' }))?.participants).toEqual([]);
  });

  test('une date illisible écarte la ligne ; une durée négative se lit zéro', () => {
    expect(decodeCallRecord(wireRecord({ startedAt: 'hier' }))).toBeNull();
    expect(decodeCallRecord(wireRecord({ durationSec: -4 }))?.durationSec).toBe(0);
  });
});

describe('la page du journal', () => {
  test('le filtre et le curseur partent dans la requête, et le curseur suivant revient', async () => {
    const gateway = gatewayReplying({
      status: 200,
      body: { success: true, data: [wireRecord(), { callId: 42 }], pagination: { limit: 30, hasMore: true, nextCursor: '64f0c0ffee00000000000a01' } },
    });
    const result = await loadCallHistory({ ...gateway.deps, filter: 'missed', cursor: '64f0c0ffee00000000000a00' });
    expect(gateway.calls).toEqual([
      { url: 'https://gate.test/api/v1/calls/history?limit=30&filter=missed&cursor=64f0c0ffee00000000000a00', method: 'GET' },
    ]);
    expect(result.ok && result.data.records.map((record) => record.callId)).toEqual(['64f0c0ffee00000000000a01']);
    expect(result.ok && result.data.nextCursor).toBe('64f0c0ffee00000000000a01');
  });

  test('la dernière page n’a pas de curseur, même si la passerelle en répète un', async () => {
    const gateway = gatewayReplying({ status: 200, body: { success: true, data: [wireRecord()], pagination: { limit: 30, hasMore: false, nextCursor: 'x' } } });
    const result = await loadCallHistory({ ...gateway.deps, filter: 'all', cursor: null });
    expect(gateway.calls[0]?.url).toBe('https://gate.test/api/v1/calls/history?limit=30&filter=all');
    expect(result.ok && result.data.nextCursor).toBeNull();
  });

  test('un refus de la passerelle reste un ÉCHEC, jamais un journal vide', async () => {
    const gateway = gatewayReplying({ status: 500, body: { success: false, error: 'INTERNAL_ERROR' } });
    const result = await loadCallHistory({ ...gateway.deps, filter: 'all', cursor: null });
    expect(result.ok).toBe(false);
  });
});

describe('filtre par type et recherche serveur (#8203)', () => {
  test('le type et la recherche partent dans la requête, la recherche débarrassée de ses blancs', async () => {
    const gateway = gatewayReplying({ status: 200, body: { success: true, data: [], pagination: { hasMore: false } } });
    await loadCallHistory({ ...gateway.deps, filter: 'all', cursor: null, refine: { type: 'video', q: '  Éloi ' } });
    expect(gateway.calls[0]?.url).toBe('https://gate.test/api/v1/calls/history?limit=30&filter=all&type=video&q=%C3%89loi');
  });

  test('sans type ni recherche, la requête reste celle du journal entier', async () => {
    const gateway = gatewayReplying({ status: 200, body: { success: true, data: [], pagination: { hasMore: false } } });
    await loadCallHistory({ ...gateway.deps, filter: 'missed', cursor: null, refine: { type: 'all', q: '   ' } });
    expect(gateway.calls[0]?.url).toBe('https://gate.test/api/v1/calls/history?limit=30&filter=missed');
  });

  test('le journal entier garde sa clé de cache ; une recherche ou un type en a une à part', () => {
    expect(callHistoryQueryKey('all')).toEqual(['calls', 'history', 'all']);
    expect(callHistoryQueryKey('all', { type: 'all', q: ' ' })).toEqual(['calls', 'history', 'all']);
    expect(callHistoryQueryKey('missed', { type: 'video', q: 'Ada ' })).toEqual(['calls', 'history', 'missed', { type: 'video', q: 'Ada' }]);
  });
});
