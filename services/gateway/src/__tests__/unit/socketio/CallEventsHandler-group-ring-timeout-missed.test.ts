/**
 * CallEventsHandler — group-calls gap analysis S3: per-member missed
 * notification survives the first answer in a group call.
 *
 * `ringingTimeouts` is keyed by callId, not by pair. Before this fix, the
 * `call:signal` "answer" handler unconditionally cleared the call-wide ring
 * timer on the FIRST successful SDP negotiation between any two
 * participants — so in a group call to N callees, one callee answering
 * permanently cancelled the only mechanism that would eventually notify the
 * OTHER invited members who never answered at all
 * (`createMissedCallNotifications` via `getUnrespondedParticipants`, driven
 * by `buildRingingTimeoutHandler`).
 *
 * Two independent fixes, tested here:
 *  1. `call:signal` (type: 'answer') no longer clears the ring timer for a
 *     GROUP call — only for a DIRECT (1:1) call, where nothing is left to
 *     wait for once the only callee answers.
 *  2. `buildRingingTimeoutHandler`'s "already transitioned" branch
 *     (`updateMany` count === 0 — the call left ringing/initiated via a real
 *     answer) now runs the notify-only path for whoever never joined,
 *     WITHOUT touching call state: no status write beyond the guard read, no
 *     ENDED/MISSED broadcast, no active-call-claim release.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks — must precede all imports
// ---------------------------------------------------------------------------

const mockInitiateCall = jest.fn<any>();
const mockGenerateIceServers = jest.fn<any>();
const mockScheduleRingingTimeout = jest.fn<any>();
const mockGetUnrespondedParticipants = jest.fn<any>();
const mockClearRingingTimeout = jest.fn<any>();
const mockUpdateCallStatus = jest.fn<any>().mockResolvedValue(undefined);
const mockGetCallSession = jest.fn<any>();
const mockCreateMissedCallNotification = jest.fn<any>().mockResolvedValue(null);
const mockReleaseActiveCallClaim = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    initiateCall: mockInitiateCall,
    generateIceServers: mockGenerateIceServers,
    scheduleRingingTimeout: mockScheduleRingingTimeout,
    createCallSummaryMessage: jest.fn<any>().mockResolvedValue(null),
    createLiveCallMessage: jest.fn<any>().mockResolvedValue(null),
    markCallAsMissed: jest.fn<any>().mockResolvedValue(undefined),
    releaseActiveCallClaim: mockReleaseActiveCallClaim,
    getUnrespondedParticipants: mockGetUnrespondedParticipants,
    clearRingingTimeout: mockClearRingingTimeout,
    updateCallStatus: mockUpdateCallStatus,
    getCallSession: mockGetCallSession,
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
  validateSocketEvent: jest.fn((_schema: unknown, data: unknown) => ({ success: true, data })),
  isValidationFailure: jest.fn((r: any) => !r.success),
}));

jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({
    checkLimit: jest.fn<any>().mockResolvedValue(true),
    destroy: jest.fn(),
  })),
  getSocketRateLimiter: jest.fn().mockReturnValue({
    checkLimit: jest.fn<any>().mockResolvedValue(true),
    destroy: jest.fn(),
  }),
  checkSocketRateLimit: jest.fn<any>().mockResolvedValue(true),
  SOCKET_RATE_LIMITS: {
    MESSAGE_SEND: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:send' },
    CALL_INITIATE: { maxRequests: 5, windowMs: 60000, keyPrefix: 'socket:call:initiate' },
    CALL_JOIN: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:join' },
    CALL_LEAVE: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:leave' },
    CALL_SIGNAL: { maxRequests: 100, windowMs: 10000, keyPrefix: 'socket:call:signal' },
    CALL_ICE_CANDIDATE: { maxRequests: 60, windowMs: 10000, keyPrefix: 'socket:call:ice' },
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { validateSocketEvent } from '../../../middleware/validation';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_A = 'user-a-initiator';
const USER_B = 'user-b-callee';
const CALL_ID = '507f1f77bcf86cd799439031';
const CONV_ID = '507f1f77bcf86cd799439032';

// ---------------------------------------------------------------------------
// Part 1 — call:signal (answer) leaves the group-call ring timer armed
// ---------------------------------------------------------------------------

function makeSignalSession(conversationType: 'direct' | 'group') {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    initiatorId: USER_A,
    answeredAt: null,
    status: 'ringing',
    conversation: { id: CONV_ID, type: conversationType },
    participants: [
      { participantId: 'pa', leftAt: null, participant: { userId: USER_A } },
      { participantId: 'pb', leftAt: null, participant: { userId: USER_B } },
    ],
  };
}

function makeSignalHarness() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  // The sender's OWN socket must resolve to USER_A via getUserId — it is
  // looked up first, at the top of the handler, to authenticate the caller.
  const socket = {
    id: 'socket-a',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: jest.fn<any>(),
    join: jest.fn<any>(),
    leave: jest.fn<any>(),
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
    data: {},
  };
  // Two fake sockets already in the call room: one per user, so
  // resolveTargetSockets finds a live target for the answer.
  const socketsInRoom = [{ id: 'socket-a' }, { id: 'socket-b' }];
  const getUserId = (socketId: string) =>
    socketId === 'socket-a' ? USER_A : socketId === 'socket-b' ? USER_B : undefined;
  const io = {
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
    in: jest.fn<any>().mockReturnValue({
      fetchSockets: jest.fn<any>().mockResolvedValue(socketsInRoom),
    }),
  };
  const prisma = {} as unknown as PrismaClient;
  const handler = new CallEventsHandler(prisma);
  handler.setupCallEvents(socket as any, io as any, getUserId);
  return { handler, handlers };
}

describe('call:signal (answer) — ring-timer ownership by conversation type (S3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateSocketEvent as jest.MockedFunction<any>).mockImplementation(
      (_schema: unknown, data: unknown) => ({ success: true, data })
    );
  });

  it('does NOT clear the ring timer on answer in a group call', async () => {
    mockGetCallSession.mockResolvedValue(makeSignalSession('group'));
    const { handlers } = makeSignalHarness();

    await handlers[CALL_EVENTS.SIGNAL](
      { callId: CALL_ID, signal: { type: 'answer', from: USER_A, to: USER_B, payload: {} } },
      jest.fn<any>()
    );

    expect(mockClearRingingTimeout).not.toHaveBeenCalled();
    // The active transition itself is untouched by this fix.
    expect(mockUpdateCallStatus).toHaveBeenCalled();
  });

  it('still clears the ring timer on answer in a direct (1:1) call', async () => {
    mockGetCallSession.mockResolvedValue(makeSignalSession('direct'));
    const { handlers } = makeSignalHarness();

    await handlers[CALL_EVENTS.SIGNAL](
      { callId: CALL_ID, signal: { type: 'answer', from: USER_A, to: USER_B, payload: {} } },
      jest.fn<any>()
    );

    expect(mockClearRingingTimeout).toHaveBeenCalledWith(CALL_ID);
  });
});

// ---------------------------------------------------------------------------
// Part 2 — the ringing-timeout handler's "already transitioned" branch now
// notifies unresponded members instead of silently no-op'ing.
// ---------------------------------------------------------------------------

const INITIATE_DATA = {
  conversationId: CONV_ID,
  type: 'audio' as const,
  settings: {},
};

function makeCallSession() {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    initiatorId: USER_A,
    mode: 'p2p',
    metadata: { type: 'audio' },
    initiator: {
      id: USER_A,
      username: 'alice',
      displayName: 'Alice Smith',
      avatar: null,
    },
    participants: [],
  };
}

function makePrisma(overrides: { updateManyCount?: number } = {}) {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: 'participant-abc' }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    callSession: {
      updateMany: jest.fn<any>().mockResolvedValue({ count: overrides.updateManyCount ?? 0 }),
      findUnique: jest.fn<any>().mockResolvedValue(makeCallSession()),
    },
  } as unknown as PrismaClient;
}

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const socket = {
    id: 'socket-ringing-timeout-group-1',
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
  const io = {
    to: jest.fn((room: string) => ({
      emit: jest.fn((event: string, payload: unknown) => {
        emissions.push({ room, event, payload });
      }),
    })),
    in: jest.fn<any>().mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) }),
  };
  return { io, emissions };
}

async function fireRingingTimeout(prisma: PrismaClient, notificationService?: { createMissedCallNotification: jest.Mock }) {
  mockInitiateCall.mockResolvedValue(makeCallSession());

  const { socket, handlers } = makeSocket();
  const { io, emissions } = makeIo();

  const handler = new CallEventsHandler(prisma);
  if (notificationService) {
    handler.setNotificationService(notificationService as any);
  }
  handler.setupCallEvents(socket as any, io, () => USER_A);
  await handlers[CALL_EVENTS.INITIATE](INITIATE_DATA, jest.fn<any>());

  const timeoutCallback = mockScheduleRingingTimeout.mock.calls[0][1] as () => Promise<void>;
  await timeoutCallback();

  return { emissions };
}

describe('ringing-timeout handler — "already transitioned" branch (S3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
    mockGenerateIceServers.mockReturnValue([]);
    mockScheduleRingingTimeout.mockReturnValue(undefined);
  });

  it('notifies unresponded members of a group call that answered elsewhere without touching call state', async () => {
    mockGetUnrespondedParticipants.mockResolvedValue(['user-c-never-answered']);
    const createMissedCallNotification = jest.fn<any>().mockResolvedValue(null);

    const { emissions } = await fireRingingTimeout(
      makePrisma({ updateManyCount: 0 }),
      { createMissedCallNotification }
    );

    // No call-state broadcast: the call itself is unaffected.
    expect(emissions).toHaveLength(0);
    expect(mockReleaseActiveCallClaim).not.toHaveBeenCalled();

    // But the unresponded member IS notified.
    expect(createMissedCallNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: 'user-c-never-answered',
        callerId: USER_A,
        conversationId: CONV_ID,
        callSessionId: CALL_ID,
        callType: 'audio',
      })
    );
  });

  it('is a no-op once every invited member has already joined', async () => {
    mockGetUnrespondedParticipants.mockResolvedValue([]);
    const createMissedCallNotification = jest.fn<any>().mockResolvedValue(null);

    await fireRingingTimeout(makePrisma({ updateManyCount: 0 }), { createMissedCallNotification });

    expect(createMissedCallNotification).not.toHaveBeenCalled();
  });

  it('does not notify when the ring window is still live (count > 0, the pre-existing missed path runs instead)', async () => {
    mockGetUnrespondedParticipants.mockResolvedValue(['user-c-never-answered']);
    const createMissedCallNotification = jest.fn<any>().mockResolvedValue(null);

    await fireRingingTimeout(makePrisma({ updateManyCount: 1 }), { createMissedCallNotification });

    // The winning (count > 0) branch already calls handleMissedCall →
    // createMissedCallNotifications itself further down — this assertion
    // only pins that the NEW early-return branch didn't ALSO fire and
    // double-notify (the internal missedCallNotifiedAt dedup guard covers
    // that, but a fresh handler instance per test doesn't exercise it).
    expect(createMissedCallNotification).toHaveBeenCalledTimes(1);
  });
});
