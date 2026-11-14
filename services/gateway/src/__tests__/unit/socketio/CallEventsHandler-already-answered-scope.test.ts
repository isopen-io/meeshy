/**
 * CallEventsHandler — CALL_EVENTS.ALREADY_ANSWERED scope (audit calls, Vague 104)
 *
 * Item F changed what `call:join` MEANS: joinCallAttempt only ever
 * transitions the call to `ringing` (the callee's device is ringing,
 * receiving the SDP offer while the user hasn't answered yet) — never
 * `active`. iOS auto-early-joins the call room on `call:initiated`, BEFORE
 * the user answers, so it can receive the SDP offer while still ringing
 * (`joinCallRoomReliably`).
 *
 * The `call:join` handler used to emit `CALL_EVENTS.ALREADY_ANSWERED`
 * unconditionally to the joining user's other sockets on every successful
 * join. With a user signed into two devices, whichever device early-joins
 * first made the OTHER, still-ringing, never-answered device immediately
 * dismiss its incoming-call UI as "answered elsewhere" — a real call could
 * be missed entirely although both devices were genuinely ringing.
 *
 * The genuine "callee answered" transition happens on the SDP `answer`
 * signal. This suite locks: (1) join no longer emits ALREADY_ANSWERED at
 * all, regardless of call state; (2) the first real answer DOES emit it,
 * from both the normal-relay and the target-socketless branches; (3) a
 * later renegotiation answer and the initiator's own answer do NOT
 * re-trigger it — mirroring the existing `shouldMirrorAnsweredElsewhere`
 * predicate already proven for the push twin.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

type SyncFn = (...args: unknown[]) => unknown;
type AsyncFn = (...args: unknown[]) => Promise<unknown>;
type SocketHandler = (...args: unknown[]) => unknown;

// ---------------------------------------------------------------------------
// Module-level mocks — must precede all imports
// ---------------------------------------------------------------------------

const mockJoinCall = jest.fn<AsyncFn>();
const mockGenerateIceServers = jest.fn<SyncFn>().mockReturnValue([]);
const mockClearRingingTimeout = jest.fn<SyncFn>();
const mockGetCallSession = jest.fn<AsyncFn>();
const mockUpdateCallStatus = jest.fn<AsyncFn>().mockResolvedValue(undefined);

jest.mock('../../../services/CallService', () => ({
  ...(jest.requireActual('../../../services/CallService') as object),
  CallService: jest.fn().mockImplementation(() => ({
    joinCall: mockJoinCall,
    generateIceServers: mockGenerateIceServers,
    clearRingingTimeout: mockClearRingingTimeout,
    getCallSession: mockGetCallSession,
    updateCallStatus: mockUpdateCallStatus,
    getIceServerTtl: jest.fn<SyncFn>().mockReturnValue(86400),
  })),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

const mockSendToUser = jest.fn<AsyncFn>().mockResolvedValue(undefined);
jest.mock('../../../services/PushNotificationService', () => ({
  PushNotificationService: jest.fn().mockImplementation(() => ({
    sendToUser: mockSendToUser,
  })),
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn((_schema: unknown, data: unknown) => ({ success: true, data })),
  isValidationFailure: jest.fn((r: { success: boolean }) => !r.success),
}));

const mockCheckRateLimit = jest.fn<AsyncFn>().mockResolvedValue(true);
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({
    checkLimit: mockCheckRateLimit,
    destroy: jest.fn(),
  })),
  getSocketRateLimiter: jest.fn().mockReturnValue({
    checkLimit: mockCheckRateLimit,
    destroy: jest.fn(),
  }),
  checkSocketRateLimit: jest.fn<AsyncFn>().mockResolvedValue(true),
  callSignalBudgetId: jest.requireActual<typeof import('../../../utils/socket-rate-limiter')>('../../../utils/socket-rate-limiter').callSignalBudgetId,
  SOCKET_RATE_LIMITS: {
    MESSAGE_SEND: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:send' },
    CALL_LEAVE: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:leave' },
    CALL_JOIN: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:join' },
    CALL_SIGNAL: { maxRequests: 100, windowMs: 10000, keyPrefix: 'socket:call:signal' },
    CALL_ICE_CANDIDATE: { maxRequests: 60, windowMs: 10000, keyPrefix: 'socket:call:ice' },
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { updateManyIn, type MongoDocument } from '../../helpers/mongo-where';

// ---------------------------------------------------------------------------
// Constants & factories
// ---------------------------------------------------------------------------

const CALLEE_ID = 'user-callee-abc';
const CALLER_ID = 'user-caller-xyz';
const CALL_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const CALLEE_PARTICIPANT_ROW_ID = 'participant-callee-row-001';
const CALLER_PARTICIPANT_ROW_ID = 'participant-caller-row-002';

const JOIN_DATA = { callId: CALL_ID };

function makeCalleeParticipant(leftAt: Date | null = null) {
  return {
    id: CALLEE_PARTICIPANT_ROW_ID,
    callSessionId: CALL_ID,
    participantId: CALLEE_ID,
    participant: { userId: CALLEE_ID, displayName: 'Callee', user: { username: 'callee', avatar: null } },
    role: 'callee',
    joinedAt: new Date(),
    leftAt,
    isAudioEnabled: true,
    isVideoEnabled: false,
    connectionQuality: 'good',
  };
}

function makeCallerParticipant(leftAt: Date | null = null) {
  return {
    id: CALLER_PARTICIPANT_ROW_ID,
    callSessionId: CALL_ID,
    participantId: CALLER_ID,
    participant: { userId: CALLER_ID, displayName: 'Caller', user: { username: 'caller', avatar: null } },
    role: 'caller',
    joinedAt: new Date(),
    leftAt,
    isAudioEnabled: true,
    isVideoEnabled: false,
    connectionQuality: 'good',
  };
}

/** Session shape returned by CallService.joinCall (call:join handler). */
function makeJoinedCallSession(status: 'ringing' | 'active' = 'ringing') {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    mode: 'audio',
    status,
    participants: [makeCallerParticipant(null), makeCalleeParticipant(null)],
  };
}

/** Session shape returned by CallService.getCallSession (call:signal handler). */
function makeSignalSession(overrides: Partial<{ answeredAt: Date | null; initiatorId: string }> = {}) {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    initiatorId: overrides.initiatorId ?? CALLER_ID,
    answeredAt: 'answeredAt' in overrides ? overrides.answeredAt : null,
    status: 'ringing',
    participants: [
      { participantId: CALLER_PARTICIPANT_ROW_ID, leftAt: null, participant: { userId: CALLER_ID } },
      { participantId: CALLEE_PARTICIPANT_ROW_ID, leftAt: null, participant: { userId: CALLEE_ID } },
    ],
  };
}

function makeAnswerSignal(from: string, to: string) {
  return {
    callId: CALL_ID,
    signal: { type: 'answer' as const, from, to, sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' },
  };
}

function makePrisma() {
  return {
    callSession: { findUnique: jest.fn<AsyncFn>().mockResolvedValue({ conversationId: CONV_ID }) },
    participant: { findFirst: jest.fn<AsyncFn>().mockResolvedValue({ id: CALLEE_PARTICIPANT_ROW_ID }) },
  } as unknown as PrismaClient;
}

function makeSocket(socketId = 'socket-1') {
  const handlers: Record<string, SocketHandler> = {};
  const directEmit = jest.fn<SyncFn>();
  const toEmit = jest.fn<SyncFn>();
  const socket = {
    id: socketId,
    on: jest.fn((event: string, fn: SocketHandler) => {
      handlers[event] = fn;
    }),
    join: jest.fn<SyncFn>(),
    leave: jest.fn<SyncFn>(),
    emit: directEmit,
    to: jest.fn<SyncFn>().mockReturnValue({ emit: toEmit }),
    data: {},
  };
  return { socket, handlers, directEmit, toEmit };
}

function makeIo() {
  const roomEmit = jest.fn<SyncFn>();
  const fetchSockets = jest.fn<AsyncFn>().mockResolvedValue([]);
  const io = {
    to: jest.fn<SyncFn>().mockReturnValue({ emit: roomEmit }),
    in: jest.fn<SyncFn>().mockReturnValue({ fetchSockets }),
  };
  return { io, roomEmit, fetchSockets };
}

/** All ALREADY_ANSWERED calls emitted via `socket.to(...).emit(...)`. */
function alreadyAnsweredCalls(toEmit: jest.Mock<SyncFn>) {
  return toEmit.mock.calls.filter(([ev]) => ev === CALL_EVENTS.ALREADY_ANSWERED);
}

describe('CallEventsHandler — call:join no longer emits ALREADY_ANSWERED', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not emit ALREADY_ANSWERED on an ordinary (first) join', async () => {
    mockJoinCall.mockResolvedValue({ callSession: makeJoinedCallSession('ringing'), iceServers: [] });
    const prisma = makePrisma();
    const { socket, handlers, toEmit } = makeSocket();
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as never, io, () => CALLEE_ID);
    await handlers[CALL_EVENTS.JOIN](JOIN_DATA, jest.fn());

    expect(alreadyAnsweredCalls(toEmit)).toHaveLength(0);
  });

  it('does not emit ALREADY_ANSWERED even when a second device joins the same still-ringing call', async () => {
    // This is the exact multi-device scenario the bug produced: two of the
    // callee's devices both received call:initiated and both auto-early-
    // join. Neither join may dismiss the other's ringing UI.
    mockJoinCall.mockResolvedValue({ callSession: makeJoinedCallSession('ringing'), iceServers: [] });
    const prisma = makePrisma();
    const { socket, handlers, toEmit } = makeSocket('socket-device-2');
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as never, io, () => CALLEE_ID);
    await handlers[CALL_EVENTS.JOIN](JOIN_DATA, jest.fn());

    expect(alreadyAnsweredCalls(toEmit)).toHaveLength(0);
  });
});

describe('CallEventsHandler — call:signal answer emits ALREADY_ANSWERED (relocated gate)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('emits ALREADY_ANSWERED to the answerer room on the first real answer', async () => {
    mockGetCallSession.mockResolvedValue(makeSignalSession({ answeredAt: null, initiatorId: CALLER_ID }));
    const prisma = makePrisma();
    const { socket, handlers, toEmit } = makeSocket();
    const { io, fetchSockets } = makeIo();
    fetchSockets.mockResolvedValue([{ id: 'caller-socket', leave: jest.fn() }]);

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as never, io, (sid: string) =>
      sid === 'caller-socket' ? CALLER_ID : CALLEE_ID
    );
    await handlers[CALL_EVENTS.SIGNAL](makeAnswerSignal(CALLEE_ID, CALLER_ID), jest.fn());

    const calls = alreadyAnsweredCalls(toEmit);
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({ callId: CALL_ID });
  });

  it('does NOT re-emit ALREADY_ANSWERED on a renegotiation answer (already answered before)', async () => {
    mockGetCallSession.mockResolvedValue(
      makeSignalSession({ answeredAt: new Date(), initiatorId: CALLER_ID })
    );
    const prisma = makePrisma();
    const { socket, handlers, toEmit } = makeSocket();
    const { io, fetchSockets } = makeIo();
    fetchSockets.mockResolvedValue([{ id: 'caller-socket', leave: jest.fn() }]);

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as never, io, (sid: string) =>
      sid === 'caller-socket' ? CALLER_ID : CALLEE_ID
    );
    await handlers[CALL_EVENTS.SIGNAL](makeAnswerSignal(CALLEE_ID, CALLER_ID), jest.fn());

    expect(alreadyAnsweredCalls(toEmit)).toHaveLength(0);
  });

  it('does NOT emit ALREADY_ANSWERED when the initiator "answers" their own call', async () => {
    mockGetCallSession.mockResolvedValue(makeSignalSession({ answeredAt: null, initiatorId: CALLER_ID }));
    const prisma = makePrisma();
    const { socket, handlers, toEmit } = makeSocket();
    const { io, fetchSockets } = makeIo();
    fetchSockets.mockResolvedValue([{ id: 'callee-socket', leave: jest.fn() }]);

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as never, io, (sid: string) =>
      sid === 'callee-socket' ? CALLEE_ID : CALLER_ID
    );
    // The "from" identity is the socket's own resolved userId (CALLER_ID here).
    await handlers[CALL_EVENTS.SIGNAL](makeAnswerSignal(CALLER_ID, CALLEE_ID), jest.fn());

    expect(alreadyAnsweredCalls(toEmit)).toHaveLength(0);
  });

  it('emits ALREADY_ANSWERED on the first answer even when the target has no active socket', async () => {
    // Mirrors the push mirror's own "no active sockets" branch (audit
    // 2026-07-11 #3) — the direct-socket twin must fire from here too, for
    // the answerer's OTHER, still-connected devices.
    mockGetCallSession.mockResolvedValue(makeSignalSession({ answeredAt: null, initiatorId: CALLER_ID }));
    const prisma = makePrisma();
    const { socket, handlers, toEmit } = makeSocket();
    const { io, fetchSockets } = makeIo();
    fetchSockets.mockResolvedValue([]); // target (caller) has no live socket

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as never, io, () => CALLEE_ID);
    await handlers[CALL_EVENTS.SIGNAL](makeAnswerSignal(CALLEE_ID, CALLER_ID), jest.fn());

    const calls = alreadyAnsweredCalls(toEmit);
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({ callId: CALL_ID });
  });
});

describe('CallEventsHandler — une réponse SDP marque QUI a décroché (#18242 B1, C1)', () => {
  const ANSWERED_BEFORE = new Date('2026-11-14T10:00:05.000Z');

  const sessionWithRows = () => ({
    ...makeSignalSession({ answeredAt: null, initiatorId: CALLER_ID }),
    participants: [
      { id: CALLER_PARTICIPANT_ROW_ID, participantId: CALLER_PARTICIPANT_ROW_ID, leftAt: null, participant: { userId: CALLER_ID } },
      { id: CALLEE_PARTICIPANT_ROW_ID, participantId: CALLEE_PARTICIPANT_ROW_ID, leftAt: null, participant: { userId: CALLEE_ID } },
    ],
  });

  /** Lignes Mongo NUES : `answeredAt` n'y est pas écrit, comme à la création d'avant le correctif. */
  const prismaWithRows = (rows: ReadonlyArray<MongoDocument>) => {
    const { updateMany, touched } = updateManyIn(rows);
    const prisma = {
      callSession: { findUnique: jest.fn<AsyncFn>().mockResolvedValue({ conversationId: CONV_ID }) },
      participant: { findFirst: jest.fn<AsyncFn>().mockResolvedValue({ id: CALLEE_PARTICIPANT_ROW_ID }) },
      callParticipant: { updateMany },
    } as unknown as PrismaClient;
    return { prisma, touched };
  };

  const twoSockets = (handler: CallEventsHandler) => {
    const caller = makeSocket('caller-socket');
    const callee = makeSocket('callee-socket');
    const { io, fetchSockets } = makeIo();
    fetchSockets.mockResolvedValue([{ id: 'caller-socket', leave: jest.fn() }, { id: 'callee-socket', leave: jest.fn() }]);
    const userOf = (sid: string) => (sid === 'caller-socket' ? CALLER_ID : CALLEE_ID);
    handler.setupCallEvents(caller.socket as never, io as never, userOf);
    handler.setupCallEvents(callee.socket as never, io as never, userOf);
    return { caller, callee };
  };

  const offer = { callId: CALL_ID, signal: { type: 'offer' as const, from: CALLER_ID, to: CALLEE_ID, sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' } };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCallSession.mockResolvedValue(sessionWithRows());
  });

  it('une réponse à une offre CONNUE de l\'offrant marque les deux bouts, même écrits sans la clé', async () => {
    const { prisma, touched } = prismaWithRows([{ id: CALLER_PARTICIPANT_ROW_ID }, { id: CALLEE_PARTICIPANT_ROW_ID }]);
    const handler = new CallEventsHandler(prisma);
    const { caller, callee } = twoSockets(handler);

    await caller.handlers[CALL_EVENTS.SIGNAL](offer, jest.fn());
    await callee.handlers[CALL_EVENTS.SIGNAL](makeAnswerSignal(CALLEE_ID, CALLER_ID), jest.fn());

    expect(touched.map((row) => row.id).sort()).toEqual([CALLEE_PARTICIPANT_ROW_ID, CALLER_PARTICIPANT_ROW_ID].sort());
  });

  it('sans offre connue de la cible, seul celui qui répond est marqué', async () => {
    const { prisma, touched } = prismaWithRows([{ id: CALLER_PARTICIPANT_ROW_ID }, { id: CALLEE_PARTICIPANT_ROW_ID }]);
    const handler = new CallEventsHandler(prisma);
    const { callee } = twoSockets(handler);

    await callee.handlers[CALL_EVENTS.SIGNAL](makeAnswerSignal(CALLEE_ID, CALLER_ID), jest.fn());

    expect(touched.map((row) => row.id)).toEqual([CALLEE_PARTICIPANT_ROW_ID]);
  });

  it('une renégociation entre deux bouts déjà marqués ne redate rien', async () => {
    const { prisma, touched } = prismaWithRows([
      { id: CALLER_PARTICIPANT_ROW_ID, answeredAt: ANSWERED_BEFORE },
      { id: CALLEE_PARTICIPANT_ROW_ID, answeredAt: ANSWERED_BEFORE },
    ]);
    const handler = new CallEventsHandler(prisma);
    const { caller, callee } = twoSockets(handler);

    await caller.handlers[CALL_EVENTS.SIGNAL](offer, jest.fn());
    await callee.handlers[CALL_EVENTS.SIGNAL](makeAnswerSignal(CALLEE_ID, CALLER_ID), jest.fn());

    expect(touched).toEqual([]);
  });

  it('R1 — une offre d\'un AUTRE offrant dans le tampon ne marque pas la cible : C répond à B pendant que l\'offre de A attend chez C', async () => {
    const THIRD_ID = 'user-third-def';
    const THIRD_ROW = 'participant-third-row-003';
    mockGetCallSession.mockResolvedValue({
      ...sessionWithRows(),
      participants: [
        ...sessionWithRows().participants,
        { id: THIRD_ROW, participantId: THIRD_ROW, leftAt: null, participant: { userId: THIRD_ID } },
      ],
    });
    const { prisma, touched } = prismaWithRows([{ id: CALLER_PARTICIPANT_ROW_ID }, { id: CALLEE_PARTICIPANT_ROW_ID }, { id: THIRD_ROW }]);
    const handler = new CallEventsHandler(prisma);
    const caller = makeSocket('caller-socket');
    const callee = makeSocket('callee-socket');
    const third = makeSocket('third-socket');
    const { io, fetchSockets } = makeIo();
    fetchSockets.mockResolvedValue([{ id: 'caller-socket', leave: jest.fn() }, { id: 'callee-socket', leave: jest.fn() }, { id: 'third-socket', leave: jest.fn() }]);
    const userOf = (sid: string) => ({ 'caller-socket': CALLER_ID, 'callee-socket': CALLEE_ID, 'third-socket': THIRD_ID })[sid];
    for (const side of [caller, callee, third]) handler.setupCallEvents(side.socket as never, io as never, userOf);

    await caller.handlers[CALL_EVENTS.SIGNAL](offer, jest.fn());
    await callee.handlers[CALL_EVENTS.SIGNAL](makeAnswerSignal(CALLEE_ID, THIRD_ID), jest.fn());

    expect(touched.map((row) => row.id)).toEqual([CALLEE_PARTICIPANT_ROW_ID]);
  });

  it('R4 — une réponse dont l\'offrant n\'a plus de socket (réponse mise en tampon) marque quand même celui qui répond', async () => {
    const { prisma, touched } = prismaWithRows([{ id: CALLER_PARTICIPANT_ROW_ID }, { id: CALLEE_PARTICIPANT_ROW_ID }]);
    const handler = new CallEventsHandler(prisma);
    const callee = makeSocket('callee-socket');
    const { io, fetchSockets } = makeIo();
    fetchSockets.mockResolvedValue([]);
    handler.setupCallEvents(callee.socket as never, io as never, () => CALLEE_ID);

    await callee.handlers[CALL_EVENTS.SIGNAL](makeAnswerSignal(CALLEE_ID, CALLER_ID), jest.fn());

    expect(touched.map((row) => row.id)).toEqual([CALLEE_PARTICIPANT_ROW_ID]);
  });

  it('R4 — et l\'offrant aussi, quand SON offre vers celui qui répond est dans le tampon', async () => {
    const { prisma, touched } = prismaWithRows([{ id: CALLER_PARTICIPANT_ROW_ID }, { id: CALLEE_PARTICIPANT_ROW_ID }]);
    const handler = new CallEventsHandler(prisma);
    const caller = makeSocket('caller-socket');
    const callee = makeSocket('callee-socket');
    const { io, fetchSockets } = makeIo();
    const userOf = (sid: string) => (sid === 'caller-socket' ? CALLER_ID : CALLEE_ID);
    handler.setupCallEvents(caller.socket as never, io as never, userOf);
    handler.setupCallEvents(callee.socket as never, io as never, userOf);

    fetchSockets.mockResolvedValueOnce([{ id: 'callee-socket', leave: jest.fn() }]);
    await caller.handlers[CALL_EVENTS.SIGNAL](offer, jest.fn());
    fetchSockets.mockResolvedValue([]);
    await callee.handlers[CALL_EVENTS.SIGNAL](makeAnswerSignal(CALLEE_ID, CALLER_ID), jest.fn());

    expect(touched.map((row) => row.id).sort()).toEqual([CALLEE_PARTICIPANT_ROW_ID, CALLER_PARTICIPANT_ROW_ID].sort());
  });
});
