/**
 * CallEventsHandler — call:check-active rate limiting
 *
 * `call:check-active` (added 2026-06-06 to replay a missed `call:initiated`
 * on reconnect — see tasks/calls-fonctionnel-todo.md) was the last call:*
 * handler left with NO rate limit at all: it is registered as a raw string
 * literal rather than a CALL_EVENTS constant, which let it slide past the
 * 2026-07-03 rate-limit sweep (audit calling-feature routine 2026-07-05).
 * It requires no client payload and fans out into 2-4 Prisma queries plus
 * one `generateIceServers()` TURN-secret HMAC mint PER matching in-progress
 * call — a bigger amplification surface per invocation than the
 * already-limited CALL_ICE_SERVERS_REFRESH.
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

const mockCheckSocketRateLimit = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({
    checkLimit: jest.fn().mockResolvedValue(true),
    destroy: jest.fn(),
  })),
  getSocketRateLimiter: jest.fn().mockReturnValue({
    checkLimit: jest.fn().mockResolvedValue(true),
    destroy: jest.fn(),
  }),
  checkSocketRateLimit: (...args: any[]) => mockCheckSocketRateLimit(...args),
  SOCKET_RATE_LIMITS: {
    CALL_CHECK_ACTIVE: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:check-active' },
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
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const USER_ID = 'user-check-active-abc';

function makePrisma() {
  return {
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    callSession: { findMany: jest.fn<any>().mockResolvedValue([]) },
    callParticipant: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as unknown as PrismaClient;
}

function makeCallService() {
  return {
    getCallSession: jest.fn<any>(),
    generateIceServers: jest.fn<any>(),
  } as any;
}

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const socket = {
    id: 'socket-id-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    rooms: new Set<string>(['socket-id-1']),
    data: {},
  };
  const io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  return { socket, io, handlers };
}

describe('CallEventsHandler — call:check-active rate limiting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckSocketRateLimit.mockResolvedValue(true);
  });

  it('is rate-limited via SOCKET_RATE_LIMITS.CALL_CHECK_ACTIVE', async () => {
    const prisma = makePrisma();
    const callService = makeCallService();
    const { socket, io, handlers } = makeSocket();

    const handler = new CallEventsHandler(prisma, callService);
    handler.setupCallEvents(socket as any, io as any, () => USER_ID);

    await handlers['call:check-active']();

    expect(mockCheckSocketRateLimit).toHaveBeenCalledWith(
      socket,
      USER_ID,
      expect.objectContaining({ keyPrefix: 'socket:call:check-active' }),
      expect.anything(),
      CALL_EVENTS.ERROR
    );
    expect((prisma as any).participant.findMany).toHaveBeenCalled();
  });

  it('drops the event when the rate limit is exceeded, without querying the DB', async () => {
    mockCheckSocketRateLimit.mockResolvedValueOnce(false);
    const prisma = makePrisma();
    const callService = makeCallService();
    const { socket, io, handlers } = makeSocket();

    const handler = new CallEventsHandler(prisma, callService);
    handler.setupCallEvents(socket as any, io as any, () => USER_ID);

    await handlers['call:check-active']();

    expect((prisma as any).participant.findMany).not.toHaveBeenCalled();
  });
});
