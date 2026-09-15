import { describe, expect, test } from 'bun:test';

import { decodeCallRecord, loadCallHistory } from './calls';
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
  test('ni le numéro, ni la présence, ni les octets du pair n’entrent dans le cache persisté', () => {
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
      peer: { userId: '64f0c0ffee0000000000abcd', username: 'ada', displayName: 'Ada Lovelace', avatar: 'https://cdn.test/ada.jpg' },
    });
  });

  test('une direction inconnue se lit « reçu », comme `CallDirection(raw:)` d’iOS', () => {
    expect(decodeCallRecord(wireRecord({ direction: 'forwarded' }))?.direction).toBe('incoming');
  });

  test('un appel de groupe n’a pas de pair, et garde le titre de sa conversation', () => {
    const record = decodeCallRecord(wireRecord({ peer: null, conversationType: 'group', conversationTitle: 'Équipe' }));
    expect(record?.peer).toBeNull();
    expect(record?.conversationTitle).toBe('Équipe');
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
