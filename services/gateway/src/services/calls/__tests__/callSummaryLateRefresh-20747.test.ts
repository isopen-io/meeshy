/**
 * Réserves de la QA de #20709, soldées par #20747 : l'instantané des mesures
 * est lu APRÈS la bulle qu'il réécrit (une instance concurrente ne se fait
 * jamais écraser par un relevé plus ancien), une conversation devenue
 * obsolète ne reçoit aucune rediffusion, et la bulle miroir du tête-à-tête
 * d'origine (#19650) reçoit les mêmes mesures que celle du groupe.
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import { Prisma } from '@meeshy/shared/prisma/client';
import { buildCallSummaryMetadata, callSummaryClientMessageId } from '@meeshy/shared/utils/call-summary';
import { createLateCallSummaryRefresher } from '../callSummaryLateRefresh';

const CALL_ID = '6650000000000000000000c7';
const GROUP_ID = '6650000000000000000000d7';
const ORIGIN_ID = '6650000000000000000000a7';
const INITIATOR_ID = '6650000000000000000000e7';

type Row = Record<string, unknown>;

const endedCall = (over: Row = {}): Row => ({
  id: CALL_ID,
  conversationId: GROUP_ID,
  originConversationId: null,
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

const bubble = (id: string, conversationId: string, metadata: unknown): Row => ({
  id,
  conversationId,
  clientMessageId: callSummaryClientMessageId(CALL_ID),
  content: 'Appel audio · 01:00',
  metadata,
  updatedAt: new Date('2026-11-27T10:01:00Z'),
  sender: null,
  attachments: []
});

const world = (options: {
  readonly call: Row;
  readonly messages: ReadonlyArray<Row>;
  readonly sealed?: (message: { id: string; conversationId: string }) => Promise<boolean>;
  readonly afterFirstCallRead?: (state: { call: Row; messages: Row[] }) => void;
}) => {
  const state = { call: options.call, messages: [...options.messages] };
  const reads = { call: 0 };
  const prisma = {
    callSession: {
      findUnique: jest.fn(async () => {
        const snapshot = { ...state.call };
        reads.call += 1;
        if (reads.call === 1) options.afterFirstCallRead?.(state);
        return snapshot;
      })
    },
    message: {
      findFirst: jest.fn(async (args: { where: Row }) => {
        const found = state.messages.find((m) =>
          m.conversationId === args.where.conversationId && m.clientMessageId === args.where.clientMessageId);
        return found ? { ...found } : null;
      }),
      update: jest.fn(async (args: { where: { id: string; updatedAt: Date }; data: { metadata: unknown } }) => {
        const current = state.messages.find((m) => m.id === args.where.id);
        if (!current || (current.updatedAt as Date).getTime() !== args.where.updatedAt.getTime()) {
          throw new Prisma.PrismaClientKnownRequestError('Record to update not found.', { code: 'P2025', clientVersion: 'test' });
        }
        const next = { ...current, metadata: args.data.metadata, updatedAt: new Date((current.updatedAt as Date).getTime() + 1_000) };
        state.messages = state.messages.map((m) => (m.id === next.id ? next : m));
        return { ...next };
      })
    },
    participant: { findMany: jest.fn(async () => []) }
  };
  const broadcast = jest.fn(async (_message: unknown, _conversationId: string) => undefined);
  const sealed = jest.fn(options.sealed ?? (async () => false));
  const refresh = createLateCallSummaryRefresher({ prisma: () => prisma as never, broadcastEdited: () => broadcast, sealed });
  const metadataOf = (id: string) => state.messages.find((m) => m.id === id)?.metadata as Record<string, unknown>;
  return { prisma, broadcast, sealed, refresh, metadataOf };
};

describe('#20747 R2 — l’instantané des mesures est postérieur à la bulle lue', () => {
  it('une instance qui a écrit un relevé plus récent entre les deux lectures n’est pas écrasée', async () => {
    const v1 = endedCall({ bytesReceivedTotal: 3_000 });
    const v2 = endedCall({ bytesReceivedTotal: 9_000 });
    const w = world({
      call: v1,
      messages: [bubble('m-group', GROUP_ID, terminalMetadata(endedCall()))],
      afterFirstCallRead: (state) => {
        state.call = v2;
        state.messages = state.messages.map((m) => ({
          ...m,
          metadata: terminalMetadata(v2),
          updatedAt: new Date('2026-11-27T10:01:30Z')
        }));
      }
    });

    await w.refresh(CALL_ID);

    expect(w.metadataOf('m-group').bytesTotal).toBe(10_000);
    expect(w.broadcast).not.toHaveBeenCalled();
  });
});

describe('#20747 R4 — une conversation obsolète ne reçoit aucune rediffusion', () => {
  it('le scellé d’obsolescence est consulté sur la bulle éditée, et un scellé retient la diffusion', async () => {
    const w = world({
      call: endedCall({ bytesReceivedTotal: 3_000 }),
      messages: [bubble('m-group', GROUP_ID, terminalMetadata(endedCall()))],
      sealed: async () => true
    });

    await w.refresh(CALL_ID);

    expect(w.sealed).toHaveBeenCalledWith(expect.objectContaining({ id: 'm-group', conversationId: GROUP_ID }));
    expect(w.broadcast).not.toHaveBeenCalled();
  });

  it('une bulle non scellée part comme avant', async () => {
    const w = world({
      call: endedCall({ bytesReceivedTotal: 3_000 }),
      messages: [bubble('m-group', GROUP_ID, terminalMetadata(endedCall()))]
    });

    await w.refresh(CALL_ID);

    expect(w.broadcast).toHaveBeenCalledTimes(1);
    expect(w.broadcast.mock.calls[0][1]).toBe(GROUP_ID);
  });
});

describe('#20747 R3 — la bulle miroir du tête-à-tête d’origine suit les mêmes mesures', () => {
  it('édite et rediffuse aussi la bulle terminale de la conversation d’origine', async () => {
    const posted = terminalMetadata(endedCall());
    const w = world({
      call: endedCall({ originConversationId: ORIGIN_ID, bytesReceivedTotal: 3_000, networkQuality: 'poor' }),
      messages: [bubble('m-group', GROUP_ID, posted), bubble('m-origin', ORIGIN_ID, posted)]
    });

    await w.refresh(CALL_ID);

    expect(w.metadataOf('m-group')).toMatchObject({ bytesTotal: 4_000, networkQuality: 'poor' });
    expect(w.metadataOf('m-origin')).toEqual({ ...posted, bytesTotal: 4_000, networkQuality: 'poor' });
    expect(w.broadcast.mock.calls.map(([, conversationId]) => conversationId)).toEqual([GROUP_ID, ORIGIN_ID]);
  });

  it('laisse à la pose du résumé une bulle d’origine encore « en cours »', async () => {
    const live = { kind: 'call-live', callId: CALL_ID, initiatorId: INITIATOR_ID };
    const w = world({
      call: endedCall({ originConversationId: ORIGIN_ID, bytesReceivedTotal: 3_000 }),
      messages: [bubble('m-group', GROUP_ID, terminalMetadata(endedCall())), bubble('m-origin', ORIGIN_ID, live)]
    });

    await w.refresh(CALL_ID);

    expect(w.metadataOf('m-origin')).toEqual(live);
    expect(w.broadcast.mock.calls.map(([, conversationId]) => conversationId)).toEqual([GROUP_ID]);
  });
});
