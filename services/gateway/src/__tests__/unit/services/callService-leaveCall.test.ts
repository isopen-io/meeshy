/**
 * CallService.leaveCall() — heartbeat cleanup regression tests
 *
 * Regression for the memory leak where clearHeartbeats(callId) was never
 * called from leaveCall() terminal paths (last participant leaves, or the
 * idempotent-leave direct-call force-end path).
 *
 * These tests mock Prisma at the module level so no DB is needed.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@meeshy/shared/types/video-call', () => ({
  CALL_EVENTS: { ENDED: 'call:ended' },
  CALL_ERROR_CODES: {
    CALL_NOT_FOUND: 'CALL_NOT_FOUND',
    NOT_A_PARTICIPANT: 'NOT_A_PARTICIPANT',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
  },
  ACTIVE_STATUSES: ['initiated', 'ringing', 'connecting', 'active', 'reconnecting'],
  TERMINAL_STATUSES: ['ended', 'missed', 'rejected', 'failed'],
  CALL_HISTORY_WINDOW_MS: 3 * 30 * 24 * 60 * 60 * 1000,
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  ROOMS: {
    call: (id: string) => `call:${id}`,
    conversation: (id: string) => `conversation:${id}`,
  },
}));

import { CallService } from '../../../services/CallService';
import { CallStatus } from '@meeshy/shared/prisma/client';

type MockFn = jest.Mock<any>;

const buildMockPrisma = () => ({
  callParticipant: {
    findFirst: jest.fn() as MockFn,
    update: jest.fn() as MockFn,
    updateMany: jest.fn() as MockFn,
  },
  callSession: {
    findUnique: jest.fn() as MockFn,
    findFirst: jest.fn() as MockFn,
    update: jest.fn() as MockFn,
  },
  conversation: {
    findUnique: jest.fn() as MockFn,
  },
  $transaction: jest.fn() as MockFn,
});

const setupTransactionPassthrough = (prisma: ReturnType<typeof buildMockPrisma>) => {
  prisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
    const tx = {
      callParticipant: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      callSession: {
        update: jest.fn().mockResolvedValue({ id: 'call-1', status: CallStatus.ended }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    return cb(tx);
  });
};

describe('CallService.leaveCall() — clearHeartbeats memory leak regression', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let service: CallService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    service = new CallService(prisma as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('calls clearHeartbeats after the last participant leaves a direct call', async () => {
    const callId = 'call-direct-1';
    const participantId = 'part-1';
    const userId = 'user-1';

    const callParticipantRow = { id: 'cp-1', callSessionId: callId, participantId, leftAt: null };
    const callRow = {
      id: callId,
      conversationId: 'conv-1',
      status: CallStatus.active,
      startedAt: new Date(Date.now() - 60_000),
      answeredAt: new Date(Date.now() - 30_000),
      participants: [callParticipantRow],
      metadata: null,
    };

    prisma.callParticipant.findFirst.mockResolvedValue(callParticipantRow);
    prisma.callSession.findUnique
      .mockResolvedValueOnce(callRow)
      .mockResolvedValue({ ...callRow, status: CallStatus.ended });
    prisma.conversation.findUnique.mockResolvedValue({ type: 'direct' });
    setupTransactionPassthrough(prisma);

    const clearSpy = jest.spyOn(service as any, 'clearHeartbeats');

    await service.leaveCall({ callId, userId, participantId });

    expect(clearSpy).toHaveBeenCalledWith(callId);
  });

  it('calls clearHeartbeats when last participant leaves a group call', async () => {
    const callId = 'call-group-1';
    const participantId = 'part-1';
    const userId = 'user-1';

    const callParticipantRow = { id: 'cp-1', callSessionId: callId, participantId, leftAt: null };
    const callRow = {
      id: callId,
      conversationId: 'conv-group',
      status: CallStatus.active,
      startedAt: new Date(Date.now() - 120_000),
      answeredAt: new Date(Date.now() - 60_000),
      participants: [callParticipantRow], // only one left
      metadata: null,
    };

    prisma.callParticipant.findFirst.mockResolvedValue(callParticipantRow);
    prisma.callSession.findUnique
      .mockResolvedValueOnce(callRow)
      .mockResolvedValue({ ...callRow, status: CallStatus.ended });
    prisma.conversation.findUnique.mockResolvedValue({ type: 'group' });
    setupTransactionPassthrough(prisma);

    const clearSpy = jest.spyOn(service as any, 'clearHeartbeats');

    await service.leaveCall({ callId, userId, participantId });

    expect(clearSpy).toHaveBeenCalledWith(callId);
  });

  it('does NOT call clearHeartbeats when a non-last participant leaves a group call', async () => {
    const callId = 'call-group-2';
    const participantId = 'part-1';
    const userId = 'user-1';

    const callParticipantRow = { id: 'cp-1', callSessionId: callId, participantId, leftAt: null };
    const otherParticipant = { id: 'cp-2', callSessionId: callId, participantId: 'part-2', leftAt: null };
    const callRow = {
      id: callId,
      conversationId: 'conv-group',
      status: CallStatus.active,
      startedAt: new Date(Date.now() - 120_000),
      answeredAt: new Date(Date.now() - 60_000),
      participants: [callParticipantRow, otherParticipant],
      metadata: null,
    };

    prisma.callParticipant.findFirst.mockResolvedValue(callParticipantRow);
    prisma.callSession.findUnique
      .mockResolvedValueOnce(callRow)
      .mockResolvedValue({ ...callRow, participants: [otherParticipant] });
    prisma.conversation.findUnique.mockResolvedValue({ type: 'group' });
    setupTransactionPassthrough(prisma);

    const clearSpy = jest.spyOn(service as any, 'clearHeartbeats');

    await service.leaveCall({ callId, userId, participantId });

    expect(clearSpy).not.toHaveBeenCalled();
  });

  it('calls clearHeartbeats on the idempotent-leave direct-call force-end path', async () => {
    const callId = 'call-idem-1';
    const participantId = 'part-missing';
    const userId = 'user-1';

    const existingCall = {
      id: callId,
      conversationId: 'conv-direct',
      status: CallStatus.active,
      startedAt: new Date(Date.now() - 30_000),
      endedAt: null,
      participants: [],
    };

    // findFirst returns null (participant row already gone)
    prisma.callParticipant.findFirst.mockResolvedValue(null);
    prisma.callSession.findUnique
      .mockResolvedValueOnce(existingCall)
      .mockResolvedValue({ ...existingCall, status: CallStatus.ended, endedAt: new Date() });
    prisma.conversation.findUnique.mockResolvedValue({ type: 'direct' });
    setupTransactionPassthrough(prisma);

    const clearSpy = jest.spyOn(service as any, 'clearHeartbeats');

    await service.leaveCall({ callId, userId, participantId });

    expect(clearSpy).toHaveBeenCalledWith(callId);
  });
});
