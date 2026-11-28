/**
 * La bulle de résumé d'appel reçoit les dernières mesures (#20709) : quand un
 * relevé tardif — reçu après le raccroché, dans la fenêtre de grâce de #20459
 * — a fait grandir les octets ou changé la qualité persistés, le résumé
 * terminal déjà posté est édité EN PLACE et rediffusé par le chemin
 * `message:edited` existant, avec la même forme de métadonnée.
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import { Prisma } from '@meeshy/shared/prisma/client';
import { buildCallSummaryMetadata, callSummaryClientMessageId } from '@meeshy/shared/utils/call-summary';
import { createLateCallSummaryRefresher } from '../callSummaryLateRefresh';

const CALL_ID = '6650000000000000000000cc';
const CONVERSATION_ID = '6650000000000000000000dd';
const INITIATOR_ID = '6650000000000000000000ee';
const PEER_ID = '6650000000000000000000ff';
const MESSAGE_ID = '665000000000000000000011';

type CallRow = Record<string, unknown>;

const endedCall = (over: CallRow = {}): CallRow => ({
  id: CALL_ID,
  conversationId: CONVERSATION_ID,
  initiatorId: INITIATOR_ID,
  status: 'ended',
  endReason: 'completed',
  duration: 125,
  answeredAt: new Date('2026-11-27T10:00:00Z'),
  metadata: { type: 'video', endedBy: PEER_ID },
  bytesSent: 1_000_000,
  bytesReceived: 2_000_000,
  bytesSentTotal: 1_000_000,
  bytesReceivedTotal: 2_000_000,
  networkQuality: 'good',
  ...over
});

const postedSummaryMetadata = (call: CallRow) => ({
  ...buildCallSummaryMetadata({
    status: call.status as string,
    endReason: call.endReason as string,
    callType: 'video',
    durationSeconds: call.duration as number,
    callId: CALL_ID,
    initiatorId: INITIATOR_ID,
    bytesSent: call.bytesSentTotal as number,
    bytesReceived: call.bytesReceivedTotal as number,
    networkQuality: call.networkQuality as string,
    answeredAt: call.answeredAt as Date,
    endedById: PEER_ID,
    participantUserIds: [INITIATOR_ID, PEER_ID]
  })
});

const world = (options: { call: CallRow; summaryMetadata: unknown }) => {
  const state = { metadata: options.summaryMetadata };
  const updatedAt = new Date('2026-11-27T10:02:10Z');
  const message = () => ({
    id: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    content: 'Appel vidéo · 02:05',
    metadata: state.metadata,
    updatedAt,
    sender: null,
    attachments: []
  });
  const prisma = {
    callSession: { findUnique: jest.fn(async () => options.call) },
    message: {
      findFirst: jest.fn(async (args: { where: Record<string, unknown> }) =>
        args.where.clientMessageId === callSummaryClientMessageId(CALL_ID) ? message() : null),
      update: jest.fn(async (args: { data: { metadata: unknown } }) => {
        state.metadata = args.data.metadata;
        return message();
      })
    },
    participant: { findMany: jest.fn(async () => []) }
  };
  const broadcast = jest.fn(async (_message: unknown, _conversationId: string) => undefined);
  const refresh = createLateCallSummaryRefresher({ prisma: () => prisma as never, broadcastEdited: () => broadcast });
  return { prisma, broadcast, refresh, metadata: () => state.metadata as Record<string, unknown> };
};

describe('createLateCallSummaryRefresher — un relevé tardif met la bulle de résumé à jour', () => {
  it('édite en place les octets et la qualité, sans toucher au reste de la métadonnée', async () => {
    const posted = postedSummaryMetadata(endedCall());
    const w = world({
      call: endedCall({ bytesSentTotal: 4_000_000, bytesReceivedTotal: 6_000_000, networkQuality: 'poor' }),
      summaryMetadata: posted
    });

    await w.refresh(CALL_ID);

    expect(w.metadata()).toEqual({ ...posted, bytesTotal: 10_000_000, bytesEstimated: false, networkQuality: 'poor' });
    expect(Object.keys(w.metadata()).sort()).toEqual(Object.keys(posted).sort());
  });

  it('rediffuse le résumé édité par le chemin message:edited, une seule fois', async () => {
    const w = world({
      call: endedCall({ bytesReceivedTotal: 3_000_000 }),
      summaryMetadata: postedSummaryMetadata(endedCall())
    });

    await w.refresh(CALL_ID);

    expect(w.broadcast).toHaveBeenCalledTimes(1);
    const [served, conversationId] = w.broadcast.mock.calls[0];
    expect(conversationId).toBe(CONVERSATION_ID);
    expect((served as { id: string; metadata: Record<string, unknown> }).id).toBe(MESSAGE_ID);
    expect((served as { metadata: Record<string, unknown> }).metadata.bytesTotal).toBe(4_000_000);
  });

  it('n’écrit ni ne diffuse rien quand les mesures n’ont pas changé', async () => {
    const call = endedCall();
    const w = world({ call, summaryMetadata: postedSummaryMetadata(call) });

    await w.refresh(CALL_ID);

    expect(w.prisma.message.update).not.toHaveBeenCalled();
    expect(w.broadcast).not.toHaveBeenCalled();
  });

  it('laisse intacte une bulle encore « en cours »', async () => {
    const w = world({
      call: endedCall({ status: 'active', endReason: null, bytesReceivedTotal: 9_000_000 }),
      summaryMetadata: { kind: 'call-live', callId: CALL_ID, initiatorId: INITIATOR_ID }
    });

    await w.refresh(CALL_ID);

    expect(w.prisma.message.update).not.toHaveBeenCalled();
    expect(w.broadcast).not.toHaveBeenCalled();
  });

  it('ne fait rien tant qu’aucun résumé n’a été posté', async () => {
    const w = world({ call: endedCall({ bytesReceivedTotal: 9_000_000 }), summaryMetadata: null });
    w.prisma.message.findFirst.mockResolvedValue(null);

    await w.refresh(CALL_ID);

    expect(w.prisma.message.update).not.toHaveBeenCalled();
    expect(w.broadcast).not.toHaveBeenCalled();
  });

  it('coalesce des relevés simultanés : au plus une édition en cours et une de rattrapage', async () => {
    const w = world({
      call: endedCall({ bytesReceivedTotal: 3_000_000 }),
      summaryMetadata: postedSummaryMetadata(endedCall())
    });

    await Promise.all([w.refresh(CALL_ID), w.refresh(CALL_ID), w.refresh(CALL_ID), w.refresh(CALL_ID)]);

    expect(w.prisma.message.findFirst.mock.calls.length).toBeLessThanOrEqual(2);
    expect(w.broadcast).toHaveBeenCalledTimes(1);
  });

  it('renonce sans diffuser quand une écriture concurrente a changé la bulle depuis sa lecture', async () => {
    const w = world({
      call: endedCall({ bytesReceivedTotal: 3_000_000 }),
      summaryMetadata: postedSummaryMetadata(endedCall())
    });
    w.prisma.message.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record to update not found.', { code: 'P2025', clientVersion: 'test' })
    );

    await w.refresh(CALL_ID);

    expect(w.prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: MESSAGE_ID, updatedAt: expect.any(Date) }) })
    );
    expect(w.broadcast).not.toHaveBeenCalled();
  });

  it('n’échoue jamais : une lecture en panne ne remonte pas', async () => {
    const w = world({ call: endedCall(), summaryMetadata: postedSummaryMetadata(endedCall()) });
    w.prisma.callSession.findUnique.mockRejectedValue(new Error('DB down'));

    await expect(w.refresh(CALL_ID)).resolves.toBeUndefined();
    expect(w.broadcast).not.toHaveBeenCalled();
  });
});
