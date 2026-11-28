/**
 * Témoins ajoutés par la QA de #20709 : ils tuent des mutants que la suite du
 * lot laissait vivre (rattrapage coalescé perdu, bulle effacée rééditée, bulle
 * « en cours » d'un appel terminé réécrite, appel `failed` traité comme vivant,
 * écriture de qualité absente quand l'appel a disparu).
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import { buildCallSummaryMetadata, callSummaryClientMessageId } from '@meeshy/shared/utils/call-summary';
import { createLateCallSummaryRefresher } from '../callSummaryLateRefresh';
import { persistCallStats } from '../callStatsPersistence';

const CALL_ID = '6650000000000000000000c1';
const CONVERSATION_ID = '6650000000000000000000d1';
const INITIATOR_ID = '6650000000000000000000e1';
const MESSAGE_ID = '665000000000000000000021';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const matchesField = (row: Row, field: string, condition: unknown): boolean => {
  const value = row[field];
  if (condition === null) return value === null;
  if (typeof condition !== 'object') return value === condition;
  const ops = condition as Record<string, unknown>;
  if ('isSet' in ops) return ops.isSet === (field in row);
  if ('in' in ops) return (ops.in as ReadonlyArray<unknown>).includes(value);
  if ('notIn' in ops) return !(ops.notIn as ReadonlyArray<unknown>).includes(value);
  return false;
};

const matches = (row: Row, where: Where): boolean =>
  Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') return (condition as ReadonlyArray<Where>).every((w) => matches(row, w));
    if (key === 'OR') return (condition as ReadonlyArray<Where>).some((w) => matches(row, w));
    return matchesField(row, key, condition);
  });

const endedCall = (over: Row = {}): Row => ({
  id: CALL_ID,
  conversationId: CONVERSATION_ID,
  initiatorId: INITIATOR_ID,
  status: 'ended',
  endReason: 'completed',
  duration: 60,
  answeredAt: new Date('2026-11-27T10:00:00Z'),
  metadata: { type: 'audio' },
  bytesSent: 1_000,
  bytesReceived: 2_000,
  bytesSentTotal: 1_000,
  bytesReceivedTotal: 2_000,
  networkQuality: 'good',
  ...over
});

const terminalMetadata = (call: Row) => buildCallSummaryMetadata({
  status: call.status as string,
  endReason: call.endReason as string,
  callType: 'audio',
  durationSeconds: call.duration as number,
  callId: CALL_ID,
  initiatorId: INITIATOR_ID,
  bytesSent: call.bytesSentTotal as number,
  bytesReceived: call.bytesReceivedTotal as number,
  networkQuality: call.networkQuality as string,
  answeredAt: call.answeredAt as Date
});

const world = (options: { call: Row; message: Row }) => {
  const state = { call: options.call, message: { id: MESSAGE_ID, conversationId: CONVERSATION_ID, clientMessageId: callSummaryClientMessageId(CALL_ID), updatedAt: new Date('2026-11-27T10:01:00Z'), sender: null, attachments: [], ...options.message } as Row };
  const prisma = {
    callSession: { findUnique: jest.fn(async () => ({ ...state.call })) },
    message: {
      findFirst: jest.fn(async (args: { where: Where }) => (matches(state.message, { ...args.where }) ? { ...state.message } : null)),
      update: jest.fn(async (args: { data: { metadata: unknown } }) => {
        state.message = { ...state.message, metadata: args.data.metadata, updatedAt: new Date(Date.now()) };
        return { ...state.message };
      })
    },
    participant: { findMany: jest.fn(async () => []) }
  };
  const broadcast = jest.fn(async (_message: unknown, _conversationId: string) => undefined);
  const refresh = createLateCallSummaryRefresher({ prisma: () => prisma as never, broadcastEdited: () => broadcast, sealed: async () => false });
  return {
    prisma,
    broadcast,
    refresh,
    setCall: (over: Row) => { state.call = { ...state.call, ...over }; },
    metadata: () => state.message.metadata as Record<string, unknown>
  };
};

describe('QA #20709 — rafraîchissement tardif de la bulle de résumé', () => {
  it('le rattrapage coalescé publie les mesures du DERNIER relevé, pas seulement celles du premier', async () => {
    const posted = endedCall();
    const w = world({ call: endedCall({ bytesReceivedTotal: 3_000 }), message: { metadata: terminalMetadata(posted) } });

    const first = w.refresh(CALL_ID);
    w.setCall({ bytesReceivedTotal: 9_000 });
    const second = w.refresh(CALL_ID);
    await Promise.all([first, second]);

    expect(w.metadata().bytesTotal).toBe(10_000);
    const lastBroadcast = w.broadcast.mock.calls.at(-1)?.[0] as { metadata: Record<string, unknown> } | undefined;
    expect(lastBroadcast?.metadata.bytesTotal).toBe(10_000);
  });

  it('une bulle de résumé EFFACÉE n’est ni rééditée ni rediffusée', async () => {
    const posted = endedCall();
    const w = world({
      call: endedCall({ bytesReceivedTotal: 9_000 }),
      message: { metadata: terminalMetadata(posted), deletedAt: new Date('2026-11-27T10:01:30Z') }
    });

    await w.refresh(CALL_ID);

    expect(w.prisma.message.findFirst).toHaveBeenCalledTimes(1);
    expect(w.prisma.message.update).not.toHaveBeenCalled();
    expect(w.broadcast).not.toHaveBeenCalled();
  });

  it('une bulle encore « en cours » d’un appel déjà TERMINÉ n’est pas réécrite (la pose du résumé s’en charge)', async () => {
    const w = world({
      call: endedCall({ bytesReceivedTotal: 9_000 }),
      message: { metadata: { kind: 'call-live', callId: CALL_ID, initiatorId: INITIATOR_ID } }
    });

    await w.refresh(CALL_ID);

    expect(w.prisma.message.update).not.toHaveBeenCalled();
    expect(w.broadcast).not.toHaveBeenCalled();
    expect(w.metadata()).toEqual({ kind: 'call-live', callId: CALL_ID, initiatorId: INITIATOR_ID });
  });
});

const callSessionStore = (initial: Row) => {
  const state = { row: { id: CALL_ID, ...initial } as Row };
  const callSession = {
    findUnique: jest.fn(async () => ({ ...state.row })),
    updateMany: jest.fn(async (args: { where: Where; data: Row }) => {
      if (!matches(state.row, args.where)) return { count: 0 };
      state.row = { ...state.row, ...args.data };
      return { count: 1 };
    })
  };
  return { prisma: { callSession }, row: () => state.row };
};

describe('QA #20709 — règle de qualité sur chaque statut terminal', () => {
  it.each(['ended', 'missed', 'rejected', 'failed'])('un appel « %s » ne s’embellit pas après coup', async (status) => {
    const store = callSessionStore({ status, bytesSent: 1, bytesReceived: 1, bytesSentTotal: 1, bytesReceivedTotal: 1, networkQuality: 'poor' });

    await expect(persistCallStats(store.prisma as never, CALL_ID, { level: 'excellent' })).resolves.toBe(false);

    expect(store.row().networkQuality).toBe('poor');
  });

  it('un appel disparu reçoit quand même une tentative d’écriture de qualité scopée par id', async () => {
    const prisma = { callSession: { findUnique: jest.fn(async () => null), updateMany: jest.fn(async () => ({ count: 0 })) } };

    await persistCallStats(prisma as never, CALL_ID, { bytesSent: 1, bytesReceived: 1, level: 'good' });

    const writes = prisma.callSession.updateMany.mock.calls.map((call) => (call as unknown as [{ where: { id: string }; data: Row }])[0]);
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every((w) => w.where.id === CALL_ID && Object.keys(w.data).join() === 'networkQuality')).toBe(true);
  });
});
