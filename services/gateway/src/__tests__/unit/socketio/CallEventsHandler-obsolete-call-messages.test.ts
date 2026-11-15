/**
 * #14643 — un message d'appel (« Appel … en cours », puis son résumé) écrit
 * après l'obsolescence de sa conversation naît effacé et ne se diffuse pas : un
 * appel en cours quand la conversation devient obsolète ne fait pas revivre
 * son fil par son résumé.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockCreateLiveCallMessage = jest.fn<any>();
const mockCreateCallSummaryMessage = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  ...(jest.requireActual('../../../services/CallService') as object),
  CallService: jest.fn().mockImplementation(() => ({
    createLiveCallMessage: mockCreateLiveCallMessage,
    createCallSummaryMessage: mockCreateCallSummaryMessage,
  })),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';

const CONV_ID = '507f1f77bcf86cd799439112';
const CALL_ID = '507f1f77bcf86cd799439111';
const MSG_ID = '507f1f77bcf86cd799439113';
const OBSOLETED_AT = new Date('2026-11-02T10:00:00.000Z');
const message = { id: MSG_ID, conversationId: CONV_ID };

function harness(deletedAt: Date | null) {
  const prisma = {
    conversation: { findUnique: jest.fn<any>().mockResolvedValue({ deletedAt }) },
    message: { updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }) },
  };
  const handler = new CallEventsHandler(prisma as never);
  const broadcast = jest.fn<any>().mockResolvedValue(undefined);
  const broadcastEdit = jest.fn<any>().mockResolvedValue(undefined);
  handler.setMessageBroadcaster(broadcast);
  handler.setMessageUpdateBroadcaster(broadcastEdit);
  const internals = handler as unknown as {
    postLiveCallMessage(callId: string): Promise<void>;
    postCallSummary(callId: string): Promise<void>;
  };
  return { prisma, internals, broadcast, broadcastEdit };
}

const sealed = {
  where: { id: MSG_ID, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
  data: { deletedAt: OBSOLETED_AT },
};

describe('#14643 — les messages d\'appel d\'une conversation obsolète', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLiveCallMessage.mockResolvedValue(message);
  });

  it('le message « en cours » naît effacé et ne part pas', async () => {
    const h = harness(OBSOLETED_AT);
    await h.internals.postLiveCallMessage(CALL_ID);
    expect(h.prisma.message.updateMany).toHaveBeenCalledWith(sealed);
    expect(h.broadcast).not.toHaveBeenCalled();
  });

  it.each(['created', 'updated'] as const)('le résumé (%s) naît effacé et ne part pas', async (kind) => {
    mockCreateCallSummaryMessage.mockResolvedValue({ kind, message });
    const h = harness(OBSOLETED_AT);
    await h.internals.postCallSummary(CALL_ID);
    expect(h.prisma.message.updateMany).toHaveBeenCalledWith(sealed);
    expect(h.broadcast).not.toHaveBeenCalled();
    expect(h.broadcastEdit).not.toHaveBeenCalled();
  });

  it('une conversation vivante diffuse ses messages d\'appel', async () => {
    mockCreateCallSummaryMessage.mockResolvedValue({ kind: 'created', message });
    const h = harness(null);
    await h.internals.postLiveCallMessage(CALL_ID);
    await h.internals.postCallSummary(CALL_ID);
    expect(h.broadcast).toHaveBeenCalledTimes(2);
    expect(h.prisma.message.updateMany).not.toHaveBeenCalled();
  });
});
