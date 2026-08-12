/**
 * CallEventsHandler — call:check-active must find ringing calls whose
 * `endedAt` was never written (MongoDB/Prisma: field absent, not explicit
 * `null`).
 *
 * `call:check-active` replays a missed `call:initiated` to a socket that
 * just (re)connected mid-ring (see tasks/calls-fonctionnel-todo.md, CALL-FIX
 * 2026-06-06). Its query filtered `endedAt: null` — but `CallService` never
 * writes `endedAt: null` at call creation, it simply omits the field, and
 * Prisma-on-MongoDB equality filters (`{ field: null }`) only match
 * documents where the field is explicitly set to null, never documents
 * where it was never written (the same class of bug already fixed for
 * `leftAt` and `Conversation.activeCallId` throughout this codebase — see
 * every other terminal-field guard here: `OR: [{ field: null }, { field: {
 * isSet: false } }]`). The result: this ANDed condition never matched any
 * real ringing call, so the replay loop was permanently dead — a user who
 * reconnects mid-ring never sees the incoming-call banner and the call
 * silently rings out to `missed`.
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

const USER_ID = 'user-reconnect-abc';
const CONVERSATION_ID = 'conv-1';
const CALL_ID = 'call-still-ringing';

/**
 * Real MongoDB/Prisma equality semantics for a field that was NEVER
 * written at document-creation time: `{ field: null }` does not match
 * (the field is unset, not explicitly null); `{ field: { isSet: false } }`
 * does. This fake mirrors just enough of that to make the test meaningful
 * without pulling in a real Mongo instance.
 */
function matchesWhere(doc: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') {
      return (cond as Array<Record<string, unknown>>).some((sub) => matchesWhere(doc, sub));
    }
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>;
      if ('in' in c) return (c.in as unknown[]).includes(doc[key]);
      if ('not' in c) return doc[key] !== c.not;
      if ('gte' in c) return doc[key] instanceof Date && (doc[key] as Date).getTime() >= (c.gte as Date).getTime();
      if ('isSet' in c) {
        const isSet = Object.prototype.hasOwnProperty.call(doc, key);
        return c.isSet ? isSet : !isSet;
      }
    }
    if (cond === null) {
      // Plain `{ field: null }` — real Mongo only matches an EXPLICIT null,
      // never an absent field.
      if (!Object.prototype.hasOwnProperty.call(doc, key)) return false;
      return doc[key] === null;
    }
    return doc[key] === cond;
  });
}

function makePrisma() {
  // A call session created moments ago, still ringing — `endedAt` was
  // never written (CallService.initiateCall omits it entirely), so the
  // key is genuinely absent from this fixture, not set to `null`.
  const ringingCallSession: Record<string, unknown> = {
    id: CALL_ID,
    conversationId: CONVERSATION_ID,
    initiatorId: 'other-user',
    status: 'ringing',
    startedAt: new Date(),
  };

  return {
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([{ conversationId: CONVERSATION_ID }]),
    },
    callSession: {
      findMany: jest.fn<any>().mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
        return matchesWhere(ringingCallSession, where) ? [{ id: CALL_ID }] : [];
      }),
    },
    callParticipant: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
  } as unknown as PrismaClient;
}

function makeCallService() {
  return {
    getCallSession: jest.fn<any>().mockResolvedValue({
      id: CALL_ID,
      conversationId: CONVERSATION_ID,
      mode: 'p2p',
      metadata: { type: 'audio' },
      initiator: { id: 'other-user', username: 'other', displayName: 'Other', avatar: null },
      participants: [],
    }),
    generateIceServers: jest.fn<any>().mockReturnValue([]),
  } as any;
}

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const socket = {
    id: 'socket-id-reconnect',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    rooms: new Set<string>(['socket-id-reconnect']),
    data: {},
  };
  const io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  return { socket, io, handlers };
}

describe('CallEventsHandler — call:check-active finds calls with unset endedAt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckSocketRateLimit.mockResolvedValue(true);
  });

  it('replays call:initiated for a ringing call whose endedAt was never written', async () => {
    const prisma = makePrisma();
    const callService = makeCallService();
    const { socket, io, handlers } = makeSocket();

    const handler = new CallEventsHandler(prisma, callService);
    handler.setupCallEvents(socket as any, io as any, () => USER_ID);

    await handlers[CALL_EVENTS.CHECK_ACTIVE ?? 'call:check-active']();

    expect(socket.emit).toHaveBeenCalledWith(
      CALL_EVENTS.INITIATED,
      expect.objectContaining({ callId: CALL_ID })
    );
  });
});
