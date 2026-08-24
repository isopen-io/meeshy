/**
 * CallEventsHandler — `call:check-active` must still replay `call:initiated`
 * for a user who left and REJOINED the same ringing call before this
 * (re)connect fired.
 *
 * A leave-then-rejoin (network blip, app relaunch mid-ring, tab reload) never
 * reuses the departed `CallParticipant` row — `CallService.joinCall` only
 * reuses a row while `!leftAt` (documented on `toCallSessionResponse` /
 * `call-session-response.ts`) — it inserts a FRESH row and leaves the
 * departed one in place. A user in this state therefore owns TWO
 * `CallParticipant` rows for the SAME `callSessionId`: one with `leftAt` set
 * (the dropped connection), one without (the successful rejoin).
 *
 * The handler collapsed `myParticipants` into a `Map<callSessionId, row>` —
 * for two rows sharing the same key, the LAST one written into the Map wins,
 * discarding the other entirely. `Prisma.findMany` makes no ordering promise
 * without an explicit `orderBy`, so whichever row Mongo happens to return
 * last decides whether the replay loop sees this call as "left" or "active" —
 * a leave-then-rejoin is exactly the moment `call:check-active` fires (it
 * runs on socket reconnect), so this is not a corner case, it is the target
 * scenario. When the departed row lands last in the Map, the handler treats
 * a currently active participant as having left and silently skips their
 * `call:initiated` replay — the incoming-call banner never reappears after
 * the user reconnects, and the call rings out to `missed` under them.
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

const USER_ID = 'user-rejoined-abc';
const CONVERSATION_ID = 'conv-1';
const CALL_ID = 'call-still-ringing';

function makePrisma(participantRows: Array<{ callSessionId: string; leftAt: Date | null }>) {
  const ringingCallSession: Record<string, unknown> = {
    id: CALL_ID,
    conversationId: CONVERSATION_ID,
  };

  return {
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([{ conversationId: CONVERSATION_ID }]),
    },
    callSession: {
      findMany: jest.fn<any>().mockResolvedValue([{ id: ringingCallSession.id }]),
    },
    callParticipant: {
      findMany: jest.fn<any>().mockResolvedValue(participantRows),
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
    id: 'socket-id-rejoined',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    rooms: new Set<string>(['socket-id-rejoined']),
    data: {},
  };
  const io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  return { socket, io, handlers };
}

describe('CallEventsHandler — call:check-active survives a leave-then-rejoin on the same call', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckSocketRateLimit.mockResolvedValue(true);
  });

  it('still replays call:initiated when the departed row is returned AFTER the active row', async () => {
    // Realistic ordering hazard: the departed row (leave) sorts after the
    // rejoin row in whatever order Mongo happens to return them, since no
    // `orderBy` is specified on this query.
    const prisma = makePrisma([
      { callSessionId: CALL_ID, leftAt: null }, // the rejoin — currently active
      { callSessionId: CALL_ID, leftAt: new Date() }, // the earlier, departed row
    ]);
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

  it('still skips the replay when EVERY row for this call has left', async () => {
    const prisma = makePrisma([
      { callSessionId: CALL_ID, leftAt: new Date() },
      { callSessionId: CALL_ID, leftAt: new Date() },
    ]);
    const callService = makeCallService();
    const { socket, io, handlers } = makeSocket();

    const handler = new CallEventsHandler(prisma, callService);
    handler.setupCallEvents(socket as any, io as any, () => USER_ID);

    await handlers[CALL_EVENTS.CHECK_ACTIVE ?? 'call:check-active']();

    expect(socket.emit).not.toHaveBeenCalledWith(
      CALL_EVENTS.INITIATED,
      expect.anything()
    );
  });
});
