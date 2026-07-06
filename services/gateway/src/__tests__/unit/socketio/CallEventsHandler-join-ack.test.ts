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

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    joinCall: mockJoinCall,
    generateIceServers: mockGenerateIceServers,
    clearRingingTimeout: jest.fn(),
  })),
}));

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
});
