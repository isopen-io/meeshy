/**
 * CallEventsHandler — call:heartbeat / call:quality-report hardening
 *
 * Both handlers previously had no rate limit at all (unlike every sibling
 * call:* handler), and `call:quality-report` persisted `bytesSent` /
 * `bytesReceived` / `level` to ANY caller-supplied callId with no membership
 * check — only the (conditional) quality-alert broadcast further down ever
 * resolved the caller's participantId. An authenticated user could flood-write
 * bogus stats onto a call they aren't in, or spam either event unrate-limited.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn(),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

jest.mock('../../../services/PushNotificationService', () => ({
  PushNotificationService: jest.fn(),
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn(),
  isValidationFailure: jest.fn((r: any) => !r.success),
}));

const mockCheckLimit = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
const mockCheckSocketRateLimit = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({
    checkLimit: mockCheckLimit,
    destroy: jest.fn(),
  })),
  getSocketRateLimiter: jest.fn().mockReturnValue({
    checkLimit: mockCheckLimit,
    destroy: jest.fn(),
  }),
  checkSocketRateLimit: (...args: any[]) => mockCheckSocketRateLimit(...args),
  SOCKET_RATE_LIMITS: {
    CALL_HEARTBEAT: { maxRequests: 12, windowMs: 60000, keyPrefix: 'socket:call:heartbeat' },
    CALL_QUALITY_REPORT: { maxRequests: 30, windowMs: 60000, keyPrefix: 'socket:call:quality' },
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { validateSocketEvent } from '../../../middleware/validation';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const VALID_CALL_ID = '507f1f77bcf86cd799439011';
const VALID_CONV_ID = '507f1f77bcf86cd799439012';
const USER_ID = 'user-quality-abc';

function makePrisma() {
  return {
    callSession: {
      findUnique: jest.fn<any>().mockResolvedValue({ conversationId: VALID_CONV_ID }),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: 'participant-1' }),
    },
  } as unknown as PrismaClient;
}

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const socket = {
    id: 'socket-test-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    data: {},
  };
  const io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  return { socket, io, handlers };
}

function makeCallService(overrides: { participants?: Array<{ participantId: string; userId?: string; leftAt?: Date | null }> } = {}) {
  const participants = overrides.participants ?? [
    { participantId: 'participant-1', userId: USER_ID, leftAt: null },
  ];
  return {
    recordHeartbeat: jest.fn<any>(),
    persistCallStats: jest.fn<any>().mockResolvedValue(undefined),
    getCallSession: jest.fn<any>().mockResolvedValue({
      participants: participants.map((p) => ({
        participantId: p.participantId,
        leftAt: p.leftAt ?? null,
        participant: p.userId ? { userId: p.userId } : undefined,
      })),
    }),
  } as any;
}

describe('CallEventsHandler — call:heartbeat / call:quality-report hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
    mockCheckSocketRateLimit.mockResolvedValue(true);
  });

  describe('call:heartbeat', () => {
    it('is rate-limited via SOCKET_RATE_LIMITS.CALL_HEARTBEAT', async () => {
      const prisma = makePrisma();
      const callService = makeCallService();
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.HEARTBEAT]({ callId: VALID_CALL_ID });

      expect(mockCheckSocketRateLimit).toHaveBeenCalledWith(
        socket,
        USER_ID,
        expect.objectContaining({ keyPrefix: 'socket:call:heartbeat' }),
        expect.anything(),
        CALL_EVENTS.ERROR
      );
      expect(callService.recordHeartbeat).toHaveBeenCalledWith(VALID_CALL_ID, 'participant-1');
    });

    it('drops the event when the rate limit is exceeded', async () => {
      mockCheckSocketRateLimit.mockResolvedValueOnce(false);
      const prisma = makePrisma();
      const callService = makeCallService();
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.HEARTBEAT]({ callId: VALID_CALL_ID });

      expect(callService.recordHeartbeat).not.toHaveBeenCalled();
    });
  });

  describe('call:quality-report', () => {
    it('is rate-limited via SOCKET_RATE_LIMITS.CALL_QUALITY_REPORT', async () => {
      const prisma = makePrisma();
      const callService = makeCallService();
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.QUALITY_REPORT]({
        callId: VALID_CALL_ID,
        stats: { bytesSent: 100, bytesReceived: 200, level: 'good', rtt: 50, packetLoss: 0 },
      });

      expect(mockCheckSocketRateLimit).toHaveBeenCalledWith(
        socket,
        USER_ID,
        expect.objectContaining({ keyPrefix: 'socket:call:quality' }),
        expect.anything(),
        CALL_EVENTS.ERROR
      );
      expect(callService.persistCallStats).toHaveBeenCalledWith(VALID_CALL_ID, {
        bytesSent: 100,
        bytesReceived: 200,
        level: 'good',
      });
    });

    it('drops the event when the rate limit is exceeded, without persisting stats', async () => {
      mockCheckSocketRateLimit.mockResolvedValueOnce(false);
      const prisma = makePrisma();
      const callService = makeCallService();
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.QUALITY_REPORT]({
        callId: VALID_CALL_ID,
        stats: { bytesSent: 100, bytesReceived: 200, level: 'good', rtt: 50, packetLoss: 0 },
      });

      expect(callService.persistCallStats).not.toHaveBeenCalled();
    });

    it('never persists stats for a callId the caller is not a participant of', async () => {
      const prisma = makePrisma();
      const callService = makeCallService({ participants: [] });
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.QUALITY_REPORT]({
        callId: VALID_CALL_ID,
        stats: { bytesSent: 100, bytesReceived: 200, level: 'good', rtt: 50, packetLoss: 0 },
      });

      expect(callService.persistCallStats).not.toHaveBeenCalled();
    });

    it('never persists stats when the caller is a member of the conversation but not an active participant of THIS call', async () => {
      // Regression: `resolveActiveCallParticipantId` must check the caller is
      // an active CallParticipant of the specific callId, not merely a member
      // of the underlying conversation (calls are capped at 2 participants
      // even inside group conversations — other conversation members must
      // not be able to write stats onto someone else's active call).
      const prisma = makePrisma();
      const callService = makeCallService({
        participants: [{ participantId: 'someone-elses-participant-id', userId: 'other-user', leftAt: null }],
      });
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.QUALITY_REPORT]({
        callId: VALID_CALL_ID,
        stats: { bytesSent: 100, bytesReceived: 200, level: 'good', rtt: 50, packetLoss: 0 },
      });

      expect(callService.persistCallStats).not.toHaveBeenCalled();
    });

    it('never persists stats when the caller already left THIS call (leftAt set)', async () => {
      const prisma = makePrisma();
      const callService = makeCallService({
        participants: [{ participantId: 'participant-1', userId: USER_ID, leftAt: new Date() }],
      });
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.QUALITY_REPORT]({
        callId: VALID_CALL_ID,
        stats: { bytesSent: 100, bytesReceived: 200, level: 'good', rtt: 50, packetLoss: 0 },
      });

      expect(callService.persistCallStats).not.toHaveBeenCalled();
    });
  });
});
