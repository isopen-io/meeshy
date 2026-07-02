/**
 * CallEventsHandler — call:force-leave handler
 *
 * Covers branch targets that were not exercised by earlier test suites:
 *
 * - Line 1130: `cleanupParticipantId || userId` — the `|| userId` fallback fires
 *   when `resolveParticipantIdFromCall` returns null (race: call deleted between
 *   findMany and findUnique).
 *
 * - Line 1178: `error.message || 'Failed to force leave calls'` — the fallback
 *   string is used when the thrown value has no `.message` property.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

const mockLeaveCall5 = jest.fn<any>();
const mockCreateCallSummaryMessage5 = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    leaveCall: mockLeaveCall5,
    createCallSummaryMessage: mockCreateCallSummaryMessage5,
    // Stubs for paths not exercised in these tests
    initiateCall: jest.fn<any>(),
    joinCall: jest.fn<any>(),
    endCall: jest.fn<any>(),
    getCallSession: jest.fn<any>(),
    generateIceServers: jest.fn<any>().mockReturnValue([]),
    clearRingingTimeout: jest.fn<any>(),
    scheduleRingingTimeout: jest.fn<any>(),
    listHistory: jest.fn<any>(),
    handleMissedCall: jest.fn<any>(),
  })),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

jest.mock('../../../services/PushNotificationService', () => ({
  PushNotificationService: jest.fn(),
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn(),
  isValidationFailure: jest.fn((r) => !r.success),
}));

const mockCheckRateLimit5 = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({
    checkLimit: mockCheckRateLimit5,
    destroy: jest.fn(),
  })),
  getSocketRateLimiter: jest.fn().mockReturnValue({
    checkLimit: mockCheckRateLimit5,
    destroy: jest.fn(),
  }),
  checkSocketRateLimit: jest.fn().mockResolvedValue(true),
  SOCKET_RATE_LIMITS: {
    MESSAGE_SEND: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:send' },
    CALL_LEAVE: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:leave' },
    CALL_JOIN: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:join' },
    CALL_INITIATE: { maxRequests: 5, windowMs: 60000, keyPrefix: 'socket:call:initiate' },
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
import { validateSocketEvent } from '../../../middleware/validation';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = 'user-abc';
const CALL_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const MEMBERSHIP_ID = 'membership-abc';
const CALL_PART_ID = 'call-participant-abc';

const FORCE_LEAVE_DATA = { conversationId: CONV_ID };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeActiveCallWithParticipant(participantUserId = USER_ID) {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    status: 'active',
    participants: [
      {
        id: CALL_PART_ID,
        participantId: MEMBERSHIP_ID,
        callSessionId: CALL_ID,
        leftAt: null,
        participant: { userId: participantUserId },
      },
    ],
  };
}

function makeEndedCallSession() {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    status: 'active',
    duration: 60,
    endReason: null,
    mode: 'p2p',
  };
}

function makePrisma(overrides: {
  participantFindFirst?: jest.MockedFunction<any>;
  callSessionFindMany?: jest.MockedFunction<any>;
  callSessionFindUnique?: jest.MockedFunction<any>;
} = {}) {
  return {
    participant: {
      findFirst: overrides.participantFindFirst
        ?? jest.fn<any>().mockResolvedValue({ id: MEMBERSHIP_ID }),
    },
    callSession: {
      findMany: overrides.callSessionFindMany
        ?? jest.fn<any>().mockResolvedValue([]),
      findUnique: overrides.callSessionFindUnique
        ?? jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }),
    },
  } as unknown as PrismaClient;
}

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const directEmit = jest.fn<any>();
  const socket = {
    id: 'socket-fl-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: directEmit,
    join: jest.fn<any>(),
    leave: jest.fn<any>(),
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
    data: {},
  };
  return { socket, handlers, directEmit };
}

function makeIo() {
  const roomEmit = jest.fn<any>();
  const io = {
    to: jest.fn<any>().mockReturnValue({ emit: roomEmit }),
    in: jest.fn<any>().mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) }),
  };
  return { io, roomEmit };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CallEventsHandler — call:force-leave handler', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
    mockCreateCallSummaryMessage5.mockResolvedValue(null);
  });

  // -------------------------------------------------------------------------
  // Line 1130: cleanupParticipantId || userId
  // -------------------------------------------------------------------------

  describe('cleanupParticipantId || userId fallback (line 1130)', () => {
    it('falls back to userId when resolveParticipantIdFromCall returns null', async () => {
      // callSession.findUnique returns null → resolveParticipantIdFromCall → null
      // → cleanupParticipantId is null → participantId: null || userId = userId
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([
          makeActiveCallWithParticipant(USER_ID),
        ]),
        callSessionFindUnique: jest.fn<any>().mockResolvedValue(null),
      });

      mockLeaveCall5.mockResolvedValue(makeEndedCallSession());

      const { socket, handlers } = makeSocket();
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers['call:force-leave'](FORCE_LEAVE_DATA);

      // leaveCall must have been called with participantId === USER_ID (the fallback)
      expect(mockLeaveCall5).toHaveBeenCalledWith(
        expect.objectContaining({ participantId: USER_ID })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Line 1178: error.message || 'Failed to force leave calls'
  // -------------------------------------------------------------------------

  describe('outer catch error.message fallback (line 1178)', () => {
    it('emits FORCE_LEAVE_ERROR with fallback message when thrown value has no .message', async () => {
      // Make the outer try throw a plain object so error.message is undefined
      // → triggers `|| 'Failed to force leave calls'` branch
      const prisma = makePrisma({
        // Membership check passes, then findMany throws
        participantFindFirst: jest.fn<any>().mockResolvedValue({ id: MEMBERSHIP_ID }),
        callSessionFindMany: jest.fn<any>().mockRejectedValue({ statusCode: 500 }),
      });

      const { socket, handlers, directEmit } = makeSocket();
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers['call:force-leave'](FORCE_LEAVE_DATA);

      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ message: 'Failed to force leave calls' })
      );
    });

    it('includes error.message when the thrown value has a .message', async () => {
      const prisma = makePrisma({
        participantFindFirst: jest.fn<any>().mockResolvedValue({ id: MEMBERSHIP_ID }),
        callSessionFindMany: jest.fn<any>().mockRejectedValue(new Error('DB connection lost')),
      });

      const { socket, handlers, directEmit } = makeSocket();
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers['call:force-leave'](FORCE_LEAVE_DATA);

      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ code: 'FORCE_LEAVE_ERROR', message: 'DB connection lost' })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Guard paths
  // -------------------------------------------------------------------------

  describe('guard: NOT_AUTHENTICATED when getUserId returns undefined', () => {
    it('emits NOT_AUTHENTICATED and skips findMany', async () => {
      const callSessionFindMany = jest.fn<any>().mockResolvedValue([]);
      const prisma = makePrisma({ callSessionFindMany });

      const { socket, handlers, directEmit } = makeSocket();
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => undefined);
      await handlers['call:force-leave'](FORCE_LEAVE_DATA);

      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ code: 'NOT_AUTHENTICATED' })
      );
      expect(callSessionFindMany).not.toHaveBeenCalled();
    });
  });

  describe('guard: NOT_A_PARTICIPANT when user is not a conversation member', () => {
    it('emits NOT_A_PARTICIPANT and skips findMany', async () => {
      const callSessionFindMany = jest.fn<any>().mockResolvedValue([]);
      const prisma = makePrisma({
        participantFindFirst: jest.fn<any>().mockResolvedValue(null),
        callSessionFindMany,
      });

      const { socket, handlers, directEmit } = makeSocket();
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers['call:force-leave'](FORCE_LEAVE_DATA);

      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ code: 'NOT_A_PARTICIPANT' })
      );
      expect(callSessionFindMany).not.toHaveBeenCalled();
    });
  });

  describe('no active calls: handler completes without calling leaveCall', () => {
    it('does not call leaveCall when no active calls in conversation', async () => {
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([]),
      });

      const { socket, handlers } = makeSocket();
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers['call:force-leave'](FORCE_LEAVE_DATA);

      expect(mockLeaveCall5).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Audit C7 (2026-07-02) — a pre-answer force-leave (idempotent leave)
  // resolves to `missed`, not `ended`. The handler used to only post a
  // summary / broadcast call:ended when status was exactly `ended`, so these
  // calls left the callee with no summary message and no missed-call
  // notification even though they had genuinely answered.
  // -------------------------------------------------------------------------

  describe('C7: pre-answer force-leave resolving to missed status', () => {
    it('broadcasts call:ended and posts a summary when leaveCall resolves to missed', async () => {
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([
          makeActiveCallWithParticipant(USER_ID),
        ]),
      });
      mockLeaveCall5.mockResolvedValue({
        id: CALL_ID,
        conversationId: CONV_ID,
        status: 'missed',
        duration: 0,
        endReason: 'missed',
        mode: 'p2p',
      });
      mockCreateCallSummaryMessage5.mockResolvedValue(null);

      const { socket, handlers } = makeSocket();
      const { io, roomEmit } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers['call:force-leave'](FORCE_LEAVE_DATA);

      expect(roomEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ENDED,
        expect.objectContaining({ callId: CALL_ID, reason: 'missed' })
      );
      expect(mockCreateCallSummaryMessage5).toHaveBeenCalledWith(CALL_ID);
    });

    it('does nothing extra (no crash) when leaveCall resolves to an active status', async () => {
      const prisma = makePrisma({
        callSessionFindMany: jest.fn<any>().mockResolvedValue([
          makeActiveCallWithParticipant(USER_ID),
        ]),
      });
      mockLeaveCall5.mockResolvedValue({
        id: CALL_ID,
        conversationId: CONV_ID,
        status: 'active',
        duration: 30,
        endReason: null,
        mode: 'p2p',
      });

      const { socket, handlers } = makeSocket();
      const { io, roomEmit } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers['call:force-leave'](FORCE_LEAVE_DATA);

      expect(roomEmit).not.toHaveBeenCalledWith(CALL_EVENTS.ENDED, expect.anything());
      expect(mockCreateCallSummaryMessage5).not.toHaveBeenCalled();
    });
  });
});
