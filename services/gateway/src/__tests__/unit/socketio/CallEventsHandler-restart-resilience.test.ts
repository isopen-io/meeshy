/**
 * CallEventsHandler — restart / transient-disconnect resilience
 *
 * A voice/video call's MEDIA is a direct peer-to-peer RTCPeerConnection
 * (DTLS-SRTP) the gateway never carries. A transient loss of the signaling
 * socket — a network blip, or the gateway restarting (deploy) — does NOT sever
 * the media. Previously the per-socket `disconnect` handler treated ANY socket
 * drop as a hangup (`leaveCall` → `call:ended`), so a gateway restart cut every
 * in-progress call even though the P2P media was still alive.
 *
 * These tests pin the two resilience mechanisms:
 *   1. `prepareForShutdown()` — during a graceful shutdown the disconnect storm
 *      leaves active calls untouched (no leaveCall, no call:ended).
 *   2. reconnect grace window — an involuntary disconnect of an ANSWERED call
 *      arms a timer instead of ending immediately; a re-join cancels it, expiry
 *      ends it. Pre-answer (ringing) disconnects still end immediately.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks — must precede all imports
// ---------------------------------------------------------------------------

const mockLeaveCall = jest.fn<any>();
const mockCreateCallSummaryMessage = jest.fn<any>();
const mockJoinCall = jest.fn<any>();
const mockGenerateIceServers = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    leaveCall: mockLeaveCall,
    createCallSummaryMessage: mockCreateCallSummaryMessage,
    joinCall: mockJoinCall,
    generateIceServers: mockGenerateIceServers,
    getIceServerTtl: jest.fn<any>().mockReturnValue(86400),
    scheduleRingingTimeout: jest.fn<any>(),
    clearRingingTimeout: jest.fn<any>(),
    initiateCall: jest.fn<any>(),
    endCall: jest.fn<any>(),
    getCallSession: jest.fn<any>(),
    listHistory: jest.fn<any>(),
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
import { validateSocketEvent } from '../../../middleware/validation';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = 'user-abc';
const CALL_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const PARTICIPANT_ID = 'conv-participant-abc';
const PARTICIPANT_DBID = 'call-participant-row-abc';
const GRACE_MS = 30_000;
const PRE_ANSWER_GRACE_MS = 10_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParticipation(status: string) {
  return {
    id: PARTICIPANT_DBID,
    participantId: PARTICIPANT_ID,
    callSessionId: CALL_ID,
    callSession: { mode: 'p2p', conversationId: CONV_ID, status },
  };
}

function makePrisma(overrides: {
  activeParticipations?: unknown[];
  freshParticipant?: unknown;
  callSessionForJoin?: unknown;
} = {}) {
  return {
    callParticipant: {
      findMany: jest.fn<any>().mockResolvedValue(overrides.activeParticipations ?? []),
      findUnique: jest.fn<any>().mockResolvedValue(
        'freshParticipant' in overrides
          ? overrides.freshParticipant
          : { leftAt: null, callSession: { status: 'active' } }
      ),
      update: jest.fn<any>(),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    callSession: {
      findUnique: jest.fn<any>().mockResolvedValue(
        'callSessionForJoin' in overrides ? overrides.callSessionForJoin : null
      ),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
    },
    $transaction: jest.fn<any>(async (fn: any) => fn({
      callParticipant: { update: jest.fn(), count: jest.fn<any>().mockResolvedValue(0) },
      callSession: { findUnique: jest.fn(), update: jest.fn() },
    })),
  } as unknown as PrismaClient;
}

type RoomEmission = { room: string; event: string; payload: unknown };

function makeIo(socketsInRoom: Array<{ id: string }> = []) {
  const emissions: RoomEmission[] = [];
  const io = {
    to: jest.fn((room: string) => ({
      emit: jest.fn((event: string, payload: unknown) => {
        emissions.push({ room, event, payload });
      }),
    })),
    in: jest.fn(() => ({
      fetchSockets: jest.fn<any>().mockResolvedValue(socketsInRoom),
    })),
  };
  return { io, emissions };
}

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const socket = {
    id: 'socket-restart-1',
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

function setup(opts: {
  prisma?: PrismaClient;
  socketsInRoom?: Array<{ id: string }>;
} = {}) {
  const prisma = opts.prisma ?? makePrisma();
  const { io, emissions } = makeIo(opts.socketsInRoom ?? []);
  const { socket, handlers } = makeSocket();
  const handler = new CallEventsHandler(prisma);
  handler.setupCallEvents(socket as any, io as any, () => USER_ID);
  return { handler, handlers, io, emissions, prisma, socket };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CallEventsHandler — restart / disconnect resilience', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
    mockCreateCallSummaryMessage.mockResolvedValue(null);
    mockLeaveCall.mockResolvedValue({
      id: CALL_ID,
      status: 'ended',
      duration: 42,
      endReason: 'completed',
      conversationId: CONV_ID,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('graceful shutdown', () => {
    it('preserves active calls on disconnect after prepareForShutdown()', async () => {
      const prisma = makePrisma({ activeParticipations: [makeParticipation('active')] });
      const { handler, handlers, emissions } = setup({ prisma });

      handler.prepareForShutdown();
      await handlers['disconnect']();

      expect(mockLeaveCall).not.toHaveBeenCalled();
      expect((prisma.callParticipant.findMany as jest.Mock)).not.toHaveBeenCalled();
      expect(emissions).toHaveLength(0);
    });

    it('clears an already-armed grace timer so it never fires during shutdown', async () => {
      const prisma = makePrisma({ activeParticipations: [makeParticipation('active')] });
      const { handler, handlers } = setup({ prisma });

      await handlers['disconnect']();       // arms grace (active call)
      handler.prepareForShutdown();          // must clear it
      await jest.advanceTimersByTimeAsync(GRACE_MS + 1000);

      expect(mockLeaveCall).not.toHaveBeenCalled();
    });
  });

  describe('grace extension when the user still has a live socket (chaos-test prod 2026-07-02)', () => {
    // Prod run (callId 6a46713b…): the caller's socket.io reconnect backoff
    // grew past the 30s grace; the server ended a call whose BOTH apps were
    // alive and whose P2P media was healthy — the re-join landed 18s too late.
    // If the user still has ANY connected socket (user room), the re-join is
    // coming: extend the grace instead of killing healthy media, up to a cap
    // that stays under the heartbeat GC tier.

    function setupWithUserSocket(opts: { userSocketsAtExpiry: Array<{ id: string }> }) {
      const prisma = makePrisma({ activeParticipations: [makeParticipation('active')] });
      const emissions: RoomEmission[] = [];
      const io = {
        to: jest.fn((room: string) => ({
          emit: jest.fn((event: string, payload: unknown) => {
            emissions.push({ room, event, payload });
          }),
        })),
        in: jest.fn((room: string) => ({
          fetchSockets: jest.fn<any>().mockImplementation(async () =>
            room === `user:${USER_ID}` ? opts.userSocketsAtExpiry : []
          ),
        })),
      };
      const { socket, handlers } = makeSocket();
      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);
      return { handler, handlers, io, emissions, prisma };
    }

    it('extends the grace instead of ending when the user still has a connected socket', async () => {
      const { handlers } = setupWithUserSocket({ userSocketsAtExpiry: [{ id: 'sock-alive' }] });

      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(GRACE_MS + 100);

      expect(mockLeaveCall).not.toHaveBeenCalled();
    });

    it('ends the call once the extension budget is exhausted with no re-join', async () => {
      const { handlers } = setupWithUserSocket({ userSocketsAtExpiry: [{ id: 'sock-alive' }] });

      await handlers['disconnect']();
      // initial grace + every extension + margin — the cap must eventually fire
      await jest.advanceTimersByTimeAsync(GRACE_MS + 10 * 15_000 + 1000);

      expect(mockLeaveCall).toHaveBeenCalled();
    });

    it('still ends at the first expiry when the user has no socket at all', async () => {
      const { handlers } = setupWithUserSocket({ userSocketsAtExpiry: [] });

      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(GRACE_MS + 100);

      expect(mockLeaveCall).toHaveBeenCalled();
    });
  });

  describe('reconnect grace window (active call)', () => {
    it('does NOT end the call immediately when the socket drops', async () => {
      const prisma = makePrisma({ activeParticipations: [makeParticipation('active')] });
      const { handlers, emissions } = setup({ prisma });

      await handlers['disconnect']();

      expect(mockLeaveCall).not.toHaveBeenCalled();
      expect(emissions.filter(e => e.event === CALL_EVENTS.ENDED)).toHaveLength(0);
    });

    it('ends the call when the grace window expires without a re-join', async () => {
      const prisma = makePrisma({ activeParticipations: [makeParticipation('active')] });
      const { handlers, emissions } = setup({ prisma });   // no sockets back in room

      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(GRACE_MS + 100);

      expect(mockLeaveCall).toHaveBeenCalledWith({
        callId: CALL_ID,
        userId: USER_ID,
        participantId: PARTICIPANT_ID,
      });
      const ended = emissions.filter(e => e.event === CALL_EVENTS.ENDED);
      expect(ended).toHaveLength(1);
      expect(ended[0].room).toEqual(
        expect.arrayContaining([`call:${CALL_ID}`, `conversation:${CONV_ID}`])
      );
    });

    it('does NOT end the call if the participant reconnected to the room by expiry', async () => {
      const prisma = makePrisma({ activeParticipations: [makeParticipation('active')] });
      // getUserId(socket.id) === USER_ID for any socket id → user is "back".
      const { handlers } = setup({ prisma, socketsInRoom: [{ id: 'reconnected-socket' }] });

      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(GRACE_MS + 100);

      expect(mockLeaveCall).not.toHaveBeenCalled();
    });

    it('does NOT end the call if it was already ended elsewhere during the grace window', async () => {
      const prisma = makePrisma({
        activeParticipations: [makeParticipation('active')],
        freshParticipant: { leftAt: null, callSession: { status: 'ended' } },
      });
      const { handlers } = setup({ prisma });

      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(GRACE_MS + 100);

      expect(mockLeaveCall).not.toHaveBeenCalled();
    });

    // Probe prod 2026-07-02 22:41Z: a call resolved `missed` by the ringing
    // timeout was rewritten ended/completed because both terminal guards
    // only checked 'ended'. Every terminal status must behave like 'ended'.
    it.each(['missed', 'failed', 'rejected'])(
      'does NOT end the call if it resolved %s during the grace window',
      async (terminalStatus) => {
        const prisma = makePrisma({
          activeParticipations: [makeParticipation('active')],
          freshParticipant: { leftAt: null, callSession: { status: terminalStatus } },
        });
        const { handlers } = setup({ prisma });

        await handlers['disconnect']();
        await jest.advanceTimersByTimeAsync(GRACE_MS + 100);

        expect(mockLeaveCall).not.toHaveBeenCalled();
      }
    );

    it.each(['missed', 'failed', 'rejected', 'ended'])(
      'does not even arm a grace when the participation call is already %s at disconnect',
      async (terminalStatus) => {
        const prisma = makePrisma({
          activeParticipations: [makeParticipation(terminalStatus)],
        });
        const { handlers } = setup({ prisma });

        await handlers['disconnect']();
        // No timer should have been armed at all — the expiry re-check
        // (callParticipant.findUnique) must never run.
        await jest.advanceTimersByTimeAsync(GRACE_MS + 10 * 15_000 + 1000);

        expect(mockLeaveCall).not.toHaveBeenCalled();
        expect((prisma.callParticipant.findUnique as jest.Mock)).not.toHaveBeenCalled();
      }
    );

    it('does NOT end the call if the participant already left by expiry', async () => {
      const prisma = makePrisma({
        activeParticipations: [makeParticipation('active')],
        freshParticipant: { leftAt: new Date(), callSession: { status: 'active' } },
      });
      const { handlers } = setup({ prisma });

      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(GRACE_MS + 100);

      expect(mockLeaveCall).not.toHaveBeenCalled();
    });

    it('does NOT end the call if the participant row is gone by expiry', async () => {
      const prisma = makePrisma({
        activeParticipations: [makeParticipation('active')],
        freshParticipant: null,
      });
      const { handlers } = setup({ prisma });

      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(GRACE_MS + 100);

      expect(mockLeaveCall).not.toHaveBeenCalled();
    });

    it('swallows a DB error during the grace-expiry re-check (no crash, no end)', async () => {
      const prisma = makePrisma({ activeParticipations: [makeParticipation('active')] });
      (prisma.callParticipant.findUnique as jest.Mock).mockRejectedValue(new Error('DB down'));
      const { handlers } = setup({ prisma });

      await handlers['disconnect']();
      await expect(jest.advanceTimersByTimeAsync(GRACE_MS + 100)).resolves.toBeUndefined();

      expect(mockLeaveCall).not.toHaveBeenCalled();
    });

    it('re-arms (replaces) the grace timer on a repeat disconnect for the same call', async () => {
      const prisma = makePrisma({ activeParticipations: [makeParticipation('active')] });
      const { handlers } = setup({ prisma });

      await handlers['disconnect']();            // arm
      await handlers['disconnect']();            // re-arm (clears the first timer)
      await jest.advanceTimersByTimeAsync(GRACE_MS + 100);

      // A single call ends once — the replaced timer does not double-fire.
      expect(mockLeaveCall).toHaveBeenCalledTimes(1);
    });

    it('re-join (call:join) within the window cancels the pending end', async () => {
      const prisma = makePrisma({ activeParticipations: [makeParticipation('active')] });
      const { handlers } = setup({ prisma });

      await handlers['disconnect']();                 // arm grace
      // call:join bails after cancel (callSession.findUnique → null makes
      // resolveParticipantIdFromCall return null), but the cancel already ran.
      await handlers[CALL_EVENTS.JOIN]({ callId: CALL_ID, settings: {} }, jest.fn());
      await jest.advanceTimersByTimeAsync(GRACE_MS + 100);

      expect(mockLeaveCall).not.toHaveBeenCalled();
    });
  });

  describe('pre-answer disconnect gets a SHORT grace (chaos-test prod 2026-07-02)', () => {
    // Prod (callId 6a466a60…): the caller's two sockets churned within 100ms
    // during RINGING — the immediate pre-answer end resolved the call missed
    // while the caller's app was alive; its re-join 3s later hit "Call is in
    // terminal state". A REAL cancel goes through an explicit call:end — the
    // disconnect path only serves crash/force-quit, for which a few extra
    // seconds of ringing are harmless.

    beforeEach(() => {
      mockLeaveCall.mockResolvedValue({
        id: CALL_ID,
        status: 'missed',
        duration: 0,
        endReason: 'missed',
        conversationId: CONV_ID,
      });
    });

    it('does NOT end a ringing call at the instant the socket drops', async () => {
      const prisma = makePrisma({ activeParticipations: [makeParticipation('ringing')] });
      const { handlers } = setup({ prisma });

      await handlers['disconnect']();

      expect(mockLeaveCall).not.toHaveBeenCalled();
    });

    it('resolves the ringing call missed once the short grace expires without re-join', async () => {
      const prisma = makePrisma({ activeParticipations: [makeParticipation('ringing')] });
      const { handlers } = setup({ prisma });

      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(PRE_ANSWER_GRACE_MS + 100);

      expect(mockLeaveCall).toHaveBeenCalledWith({
        callId: CALL_ID,
        userId: USER_ID,
        participantId: PARTICIPANT_ID,
      });
    });

  });
});
