/**
 * CallEventsHandler — call:join must invoke its ack on every failure branch
 *
 * Vague 19 (2026-07-06): `call:join` declared an `ack` callback in its
 * `CallJoinAck` contract but only ever invoked it on success. Every failure
 * branch (not authenticated, anonymous, rate-limited, validation error,
 * not-a-participant, and the outer catch) only did `socket.emit(CALL_EVENTS.ERROR, ...)`
 * — a client awaiting the ack (the only channel `apps/web/components/video-call/CallManager.tsx`
 * actually listens to before committing its UI to "in call") would hang, or
 * (on iOS) fall back to a 3s client-side timeout instead of an immediate,
 * informative failure. This mirrors the already-correct `call:initiate`
 * handler, which acks `success: false` on every one of its own failure
 * branches.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

const mockJoinCall = jest.fn<any>();
const mockGenerateIceServers = jest.fn<any>().mockReturnValue([]);

jest.mock('../../../services/CallService', () => {
  // Mirrors the real CallAlreadyEndedError (services/CallService.ts) — same
  // message shape `parseCallHandlerError` splits on, plus the `endReason`
  // the production class carries on top of it.
  class CallAlreadyEndedError extends Error {
    readonly endReason: string;
    constructor(endReason: string) {
      super('CALL_ENDED: This call has already ended');
      this.name = 'CallAlreadyEndedError';
      this.endReason = endReason;
    }
  }
  return {
    CallService: jest.fn().mockImplementation(() => ({
      joinCall: mockJoinCall,
      generateIceServers: mockGenerateIceServers,
      clearRingingTimeout: jest.fn(),
    })),
    CallAlreadyEndedError,
  };
});

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

jest.mock('../../../services/PushNotificationService', () => ({
  PushNotificationService: jest.fn(),
}));

const mockValidateSocketEvent = jest.fn<any>();
jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: mockValidateSocketEvent,
  isValidationFailure: jest.fn((r: any) => !r.success),
}));

const mockCheckSocketRateLimit = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({
    checkLimit: jest.fn(),
    destroy: jest.fn(),
  })),
  getSocketRateLimiter: jest.fn().mockReturnValue({
    checkLimit: jest.fn(),
    destroy: jest.fn(),
  }),
  checkSocketRateLimit: mockCheckSocketRateLimit,
  SOCKET_RATE_LIMITS: {
    CALL_JOIN: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:join' },
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

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CallAlreadyEndedError } from '../../../services/CallService';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const USER_ID = 'user-abc';
const CALL_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    callSession: {
      findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(null), // NOT_A_PARTICIPANT by default
    },
    ...overrides,
  } as unknown as PrismaClient;
}

function makeSocket(getUserInfoResult?: { id: string; isAnonymous: boolean }) {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const socket = {
    id: 'socket-test-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: jest.fn(),
    join: jest.fn<any>(),
    leave: jest.fn<any>(),
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
    data: {},
  };
  return { socket, handlers };
}

function makeIo() {
  const fetchSockets = jest.fn<any>().mockResolvedValue([]);
  return {
    io: {
      to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
      in: jest.fn<any>().mockReturnValue({ fetchSockets }),
    },
  };
}

async function setupAndJoin(opts: {
  prisma?: PrismaClient;
  getUserId?: (socketId: string) => string | undefined;
  getUserInfo?: (socketId: string) => { id: string; isAnonymous: boolean } | undefined;
  data?: Record<string, any>;
}) {
  const prisma = opts.prisma ?? makePrisma();
  const { socket, handlers } = makeSocket();
  const { io } = makeIo();
  const ack = jest.fn<any>();

  const handler = new CallEventsHandler(prisma);
  handler.setupCallEvents(
    socket as any,
    io as any,
    opts.getUserId ?? (() => USER_ID),
    opts.getUserInfo
  );
  await handlers[CALL_EVENTS.JOIN](opts.data ?? { callId: CALL_ID }, ack);
  return { ack, socket };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CallEventsHandler — call:join acks every failure branch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateSocketEvent.mockReturnValue({ success: true });
    mockCheckSocketRateLimit.mockResolvedValue(true);
    mockGenerateIceServers.mockReturnValue([]);
  });

  it('acks success:false when the socket has no authenticated user', async () => {
    const { ack } = await setupAndJoin({ getUserId: () => undefined });
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('acks success:false when the user is anonymous', async () => {
    const { ack } = await setupAndJoin({
      getUserInfo: () => ({ id: USER_ID, isAnonymous: true }),
    });
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('acks success:false when rate-limited', async () => {
    mockCheckSocketRateLimit.mockResolvedValue(false);
    const { ack } = await setupAndJoin({});
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('acks success:false on validation failure', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: false, error: 'Invalid payload' });
    const { ack } = await setupAndJoin({});
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('acks success:false when the user is not a participant in the conversation', async () => {
    const prisma = makePrisma();
    (prisma.participant.findFirst as any).mockResolvedValue(null);
    const { ack } = await setupAndJoin({ prisma });
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('acks success:false when CallService.joinCall throws', async () => {
    const prisma = makePrisma();
    (prisma.participant.findFirst as any).mockResolvedValue({ id: 'participant-abc' });
    mockJoinCall.mockRejectedValue(new Error('CALL_NOT_FOUND: gone'));
    const { ack } = await setupAndJoin({ prisma });
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  // -------------------------------------------------------------------------
  // Audit gateway (2026-07-28) — the ack's `error` field must be the
  // documented `{code, message}` object (packages/shared/types/video-call.ts
  // `CallJoinAck`), never a bare string. A bare string previously reached
  // this ack via `as unknown as CallJoinAck` casts, which silently broke
  // `apps/web/components/video-call/CallManager.tsx`'s reconnect-rejoin
  // cleanup — it gates on `ack.error.code === 'CALL_ENDED'`, which can only
  // ever be `undefined` on a plain string.
  // -------------------------------------------------------------------------

  describe('ack.error is always a {code, message} object, never a bare string', () => {
    it('acks {code: NOT_AUTHENTICATED, message} when the socket has no authenticated user', async () => {
      const { ack } = await setupAndJoin({ getUserId: () => undefined });
      expect(ack).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: { code: 'NOT_AUTHENTICATED', message: 'User not authenticated' }
        })
      );
    });

    it('acks {code: PERMISSION_DENIED, message} when the user is anonymous', async () => {
      const { ack } = await setupAndJoin({
        getUserInfo: () => ({ id: USER_ID, isAnonymous: true }),
      });
      expect(ack).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: { code: 'PERMISSION_DENIED', message: 'Anonymous users cannot join calls' }
        })
      );
    });

    it('acks {code: RATE_LIMIT_EXCEEDED, message} when rate-limited', async () => {
      mockCheckSocketRateLimit.mockResolvedValue(false);
      const { ack } = await setupAndJoin({});
      expect(ack).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' }
        })
      );
    });

    it('acks {code: VALIDATION_ERROR, message} on validation failure', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'Invalid payload' });
      const { ack } = await setupAndJoin({});
      expect(ack).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' }
        })
      );
    });

    it('acks {code: NOT_A_PARTICIPANT, message} when the user is not a participant', async () => {
      const prisma = makePrisma();
      (prisma.participant.findFirst as any).mockResolvedValue(null);
      const { ack } = await setupAndJoin({ prisma });
      expect(ack).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: { code: 'NOT_A_PARTICIPANT', message: 'You are not a participant in this conversation' }
        })
      );
    });

    it('preserves the CODE:message split from a thrown Error in the ack, matching the parallel call:error emit', async () => {
      const prisma = makePrisma();
      (prisma.participant.findFirst as any).mockResolvedValue({ id: 'participant-abc' });
      mockJoinCall.mockRejectedValue(new Error('CALL_NOT_FOUND: gone'));
      const { ack } = await setupAndJoin({ prisma });
      expect(ack).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: { code: 'CALL_NOT_FOUND', message: 'gone' }
        })
      );
    });

    it('regression: rejoin-after-reconnect on an already-ended call surfaces error.code === CALL_ENDED in the ack (not just the sibling call:error event)', async () => {
      // Reproduces the exact scenario apps/web/components/video-call/CallManager.tsx's
      // rejoinActiveCallAfterReconnect depends on: joinCall() rejects because the
      // call already ended while this client was disconnected. Before this fix,
      // the ack carried only the bare message string, so `ack.error?.code` was
      // always undefined and the web client's cleanup branch never ran.
      const prisma = makePrisma();
      (prisma.participant.findFirst as any).mockResolvedValue({ id: 'participant-abc' });
      mockJoinCall.mockRejectedValue(new Error('CALL_ENDED: The call has already ended'));
      const { ack, socket } = await setupAndJoin({ prisma });

      expect(ack).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: { code: 'CALL_ENDED', message: 'The call has already ended' }
        })
      );
      // The ack and the sibling call:error event must agree — same code/message.
      expect(socket.emit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ code: 'CALL_ENDED', message: 'The call has already ended' })
      );
    });

    it('Vague 161 — forwards the real endReason from CallAlreadyEndedError on the ack, so a reconnect can distinguish a transient failure from a benign hangup', async () => {
      // Without this, apps/web/components/video-call/CallManager.tsx's
      // rejoinActiveCallAfterReconnect hardcoded reason: 'completed' on every
      // CALL_ENDED ack — including one caused by connectionLost/
      // heartbeatTimeout — silently defeating isRetryableCallFailure's retry
      // offer for the one case a reconnect-rejoin exists to catch.
      const prisma = makePrisma();
      (prisma.participant.findFirst as any).mockResolvedValue({ id: 'participant-abc' });
      mockJoinCall.mockRejectedValue(new CallAlreadyEndedError('connectionLost'));
      const { ack } = await setupAndJoin({ prisma });

      expect(ack).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: { code: 'CALL_ENDED', message: 'This call has already ended', endReason: 'connectionLost' }
        })
      );
    });
  });
});
