/**
 * CallEventsHandler — ringing timeout: call:missed contract payload
 *
 * Prod bug: the scheduleRingingTimeout callback (call:initiate handler)
 * emitted `{ callId }` only, while the shared contract `CallMissedEvent`
 * (packages/shared/types/video-call.ts) requires
 * `{ callId, conversationId, callerId, callerName }` — all strings.
 * iOS decode failed with:
 *   decode FAILED type=CallMissedData: keyNotFound conversationId — keys: [callId]
 *
 * These tests trigger call:initiate, capture the callback handed to
 * scheduleRingingTimeout, fire it, and assert the CALL_EVENTS.MISSED
 * emission carries the full contract. They also pin the existing
 * CALL_EVENTS.ENDED payload so the fix cannot regress it.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks — must precede all imports
// ---------------------------------------------------------------------------

const mockInitiateCall = jest.fn<any>();
const mockGenerateIceServers = jest.fn<any>();
const mockScheduleRingingTimeout = jest.fn<any>();
const mockCreateCallSummaryMessage = jest.fn<any>();
const mockMarkCallAsMissed = jest.fn<any>();
const mockReleaseActiveCallClaim = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    initiateCall: mockInitiateCall,
    generateIceServers: mockGenerateIceServers,
    scheduleRingingTimeout: mockScheduleRingingTimeout,
    createCallSummaryMessage: mockCreateCallSummaryMessage,
    markCallAsMissed: mockMarkCallAsMissed,
    releaseActiveCallClaim: mockReleaseActiveCallClaim,
    getUnrespondedParticipants: jest.fn<any>().mockResolvedValue([]),
    clearRingingTimeout: jest.fn<any>(),
    endCall: jest.fn<any>(),
    leaveCall: jest.fn<any>(),
    joinCall: jest.fn<any>(),
    listHistory: jest.fn<any>(),
    getIceServerTtl: jest.fn<any>().mockReturnValue(86400),
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

const mockCheckRateLimit = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({
    checkLimit: mockCheckRateLimit,
    destroy: jest.fn(),
  })),
  getSocketRateLimiter: jest.fn().mockReturnValue({
    checkLimit: mockCheckRateLimit,
    destroy: jest.fn(),
  }),
  checkSocketRateLimit: jest.fn().mockResolvedValue(true),
  SOCKET_RATE_LIMITS: {
    MESSAGE_SEND: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:send' },
    CALL_INITIATE: { maxRequests: 5, windowMs: 60000, keyPrefix: 'socket:call:initiate' },
    CALL_JOIN: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:join' },
    CALL_LEAVE: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:leave' },
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
import type { CallMissedEvent } from '@meeshy/shared/types/video-call';
import { validateSocketEvent } from '../../../middleware/validation';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = 'user-initiator-abc';
const CALL_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const PARTICIPANT_ID = 'participant-abc';

const INITIATE_DATA = {
  conversationId: CONV_ID,
  type: 'audio' as const,
  settings: {},
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCallSession() {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    mode: 'p2p',
    metadata: { type: 'audio' },
    initiator: {
      id: USER_ID,
      username: 'alice',
      displayName: 'Alice Smith',
      avatar: null,
    },
    participants: [],
  };
}

function makePrisma(overrides: {
  missedContext?: {
    conversationId: string;
    initiatorId: string;
    initiator: { displayName: string | null; username: string | null };
  } | null;
  updateManyCount?: number;
} = {}) {
  const missedContext = 'missedContext' in overrides
    ? overrides.missedContext
    : {
        conversationId: CONV_ID,
        initiatorId: USER_ID,
        initiator: { displayName: 'Alice Smith', username: 'alice' },
      };
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    callSession: {
      updateMany: jest.fn<any>().mockResolvedValue({
        count: overrides.updateManyCount ?? 1,
      }),
      findUnique: jest.fn<any>().mockResolvedValue(missedContext),
    },
  } as unknown as PrismaClient;
}

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const socket = {
    id: 'socket-ringing-timeout-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: jest.fn<any>(),
    join: jest.fn<any>(),
    leave: jest.fn<any>(),
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
    data: {},
  };
  return { socket, handlers };
}

type RoomEmission = { room: string; event: string; payload: unknown };

function makeIo() {
  const emissions: RoomEmission[] = [];
  const fetchSockets = jest.fn<any>().mockResolvedValue([]);
  const io = {
    to: jest.fn((room: string) => ({
      emit: jest.fn((event: string, payload: unknown) => {
        emissions.push({ room, event, payload });
      }),
    })),
    in: jest.fn<any>().mockReturnValue({ fetchSockets }),
  };
  return { io, emissions };
}

async function fireRingingTimeout(prisma: PrismaClient) {
  mockInitiateCall.mockResolvedValue(makeCallSession());

  const { socket, handlers } = makeSocket();
  const { io, emissions } = makeIo();

  const handler = new CallEventsHandler(prisma);
  handler.setupCallEvents(socket as any, io, () => USER_ID);
  await handlers[CALL_EVENTS.INITIATE](INITIATE_DATA, jest.fn<any>());

  expect(mockScheduleRingingTimeout).toHaveBeenCalledWith(
    CALL_ID,
    expect.any(Function)
  );
  const timeoutCallback =
    mockScheduleRingingTimeout.mock.calls[0][1] as () => Promise<void>;
  await timeoutCallback();

  return { emissions };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CallEventsHandler — ringing timeout call:missed contract', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
    mockGenerateIceServers.mockReturnValue([]);
    mockScheduleRingingTimeout.mockReturnValue(undefined);
    mockCreateCallSummaryMessage.mockResolvedValue(null);
    mockMarkCallAsMissed.mockResolvedValue(undefined);
  });

  describe('call:missed payload honors the CallMissedEvent contract', () => {
    it('emits all 4 contract fields to the call room', async () => {
      const { emissions } = await fireRingingTimeout(makePrisma());

      const missed = emissions.find(e => e.event === CALL_EVENTS.MISSED);
      expect(missed).toBeDefined();
      expect(missed!.room).toBe(`call:${CALL_ID}`);

      const expected: CallMissedEvent = {
        callId: CALL_ID,
        conversationId: CONV_ID,
        callerId: USER_ID,
        callerName: 'Alice Smith',
      };
      expect(missed!.payload).toEqual(expected);
    });

    it('falls back to username as callerName when displayName is null', async () => {
      const prisma = makePrisma({
        missedContext: {
          conversationId: CONV_ID,
          initiatorId: USER_ID,
          initiator: { displayName: null, username: 'alice' },
        },
      });
      const { emissions } = await fireRingingTimeout(prisma);

      const missed = emissions.find(e => e.event === CALL_EVENTS.MISSED);
      expect((missed!.payload as CallMissedEvent).callerName).toBe('alice');
    });

    it('falls back to empty-string callerName when displayName and username are null', async () => {
      const prisma = makePrisma({
        missedContext: {
          conversationId: CONV_ID,
          initiatorId: USER_ID,
          initiator: { displayName: null, username: null },
        },
      });
      const { emissions } = await fireRingingTimeout(prisma);

      const missed = emissions.find(e => e.event === CALL_EVENTS.MISSED);
      expect((missed!.payload as CallMissedEvent).callerName).toBe('');
    });
  });

  describe('call:ended payload is preserved', () => {
    it('emits the existing ended payload to both call and conversation rooms', async () => {
      const { emissions } = await fireRingingTimeout(makePrisma());

      const ended = emissions.filter(e => e.event === CALL_EVENTS.ENDED);
      expect(ended.map(e => e.room)).toEqual([
        `call:${CALL_ID}`,
        `conversation:${CONV_ID}`,
      ]);
      ended.forEach(e => {
        expect(e.payload).toEqual({
          callId: CALL_ID,
          duration: 0,
          endedBy: undefined,
          reason: 'missed',
        });
      });
    });
  });

  describe('lost transition race: updateMany count is 0', () => {
    it('emits nothing when another path already moved the call off ringing', async () => {
      const { emissions } = await fireRingingTimeout(
        makePrisma({ updateManyCount: 0 })
      );

      expect(emissions).toHaveLength(0);
    });

    it('does not release the active-call claim when the transition was lost', async () => {
      await fireRingingTimeout(makePrisma({ updateManyCount: 0 }));

      expect(mockReleaseActiveCallClaim).not.toHaveBeenCalled();
    });
  });

  describe('active-call claim release on won transition', () => {
    // Prod incident 2026-07-02 21:30Z: the handler won the atomic
    // missed-transition but the claim release was delegated to
    // handleMissedCall → markCallAsMissed, whose non-ringing guard returned
    // before releasing. Conversation.activeCallId stayed pointed at the
    // missed call and every initiateCall was rejected CALL_ALREADY_ACTIVE.
    it('releases the conversation active-call claim after winning the missed transition', async () => {
      await fireRingingTimeout(makePrisma());

      expect(mockReleaseActiveCallClaim).toHaveBeenCalledWith(CONV_ID, CALL_ID);
    });

    it('releases the claim even when posting the call summary throws', async () => {
      mockCreateCallSummaryMessage.mockRejectedValue(new Error('db down'));

      await fireRingingTimeout(makePrisma());

      expect(mockReleaseActiveCallClaim).toHaveBeenCalledWith(CONV_ID, CALL_ID);
    });
  });
});
