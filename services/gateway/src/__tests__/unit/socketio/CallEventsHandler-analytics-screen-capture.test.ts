/**
 * CallEventsHandler — call:analytics / call:screen-capture-detected hardening
 *
 * Audit 2026-07-02: both handlers were missing a rate limit (unlike every
 * sibling call:* handler), and `call:analytics` had NO authorization check at
 * all — any authenticated user could submit lifecycle telemetry against an
 * arbitrary callId. `resolveActiveCallParticipantId` can't be used here
 * (analytics fires after the client has already left the call, so `leftAt`
 * is already set) — it's scoped to conversation membership instead via
 * `resolveParticipantIdFromCall`.
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

const mockCheckLimit = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
const mockCheckSocketRateLimit = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({
    checkLimit: mockCheckLimit,
    destroy: jest.fn(),
  })),
  getSocketRateLimiter: jest.fn().mockReturnValue({
    checkLimit: mockCheckLimit,
    destroy: jest.fn(),
  }),
  checkSocketRateLimit: (...args: any[]) => mockCheckSocketRateLimit(...args),
  SOCKET_RATE_LIMITS: {
    CALL_ANALYTICS: { maxRequests: 10, windowMs: 60000, keyPrefix: 'socket:call:analytics' },
    CALL_SCREEN_CAPTURE: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:screen-capture' },
  },
}));

const mockLoggerInfo = jest.fn();
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { validateSocketEvent } from '../../../middleware/validation';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const VALID_CALL_ID = '507f1f77bcf86cd799439011';
const VALID_CONV_ID = '507f1f77bcf86cd799439012';
const USER_ID = 'user-analytics-abc';

const ANALYTICS_PAYLOAD = {
  callId: VALID_CALL_ID,
  setupTimeMs: 500,
  durationSeconds: 42,
  reconnectionCount: 0,
  networkTransitions: 0,
  averageRtt: 50,
  averagePacketLoss: 0,
  maxPacketLoss: 0,
  codec: 'opus',
  effectsUsed: [],
  filtersUsed: false,
  transcriptionUsed: false,
  qualityDistribution: { excellent: 1, good: 0, fair: 0, poor: 0 },
  platform: 'ios',
  deviceModel: 'iPhone15,3',
  isVideo: false,
  endReason: 'completed',
};

function makePrisma(overrides: { hasParticipant?: boolean } = {}) {
  return {
    callSession: {
      findUnique: jest.fn<any>().mockResolvedValue({ conversationId: VALID_CONV_ID }),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(
        overrides.hasParticipant === false ? null : { id: 'participant-1' }
      ),
    },
  } as unknown as PrismaClient;
}

function makeCallServiceWithParticipant(participantId: string | null) {
  return {
    getCallSession: jest.fn<any>().mockResolvedValue({
      participants: participantId
        ? [{ participantId, participant: { userId: USER_ID }, leftAt: null }]
        : [],
    }),
  } as any;
}

function makeSocket(rooms: string[] = []) {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const socket = {
    id: 'socket-test-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    rooms: new Set(rooms),
    data: {},
  };
  const io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  return { socket, io, handlers };
}

describe('CallEventsHandler — call:analytics / call:screen-capture-detected hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
    mockCheckSocketRateLimit.mockResolvedValue(true);
  });

  describe('call:analytics', () => {
    it('is rate-limited via SOCKET_RATE_LIMITS.CALL_ANALYTICS', async () => {
      const prisma = makePrisma();
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.ANALYTICS](ANALYTICS_PAYLOAD);

      expect(mockCheckSocketRateLimit).toHaveBeenCalledWith(
        socket,
        USER_ID,
        expect.objectContaining({ keyPrefix: 'socket:call:analytics' }),
        expect.anything(),
        CALL_EVENTS.ERROR
      );
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        '📞 Socket: call:analytics received',
        expect.objectContaining({ callId: VALID_CALL_ID, userId: USER_ID })
      );
    });

    it('drops the event when the rate limit is exceeded', async () => {
      mockCheckSocketRateLimit.mockResolvedValueOnce(false);
      const prisma = makePrisma();
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.ANALYTICS](ANALYTICS_PAYLOAD);

      expect(mockLoggerInfo).not.toHaveBeenCalled();
    });

    it('is dropped when the caller is not a member of the call conversation', async () => {
      const prisma = makePrisma({ hasParticipant: false });
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.ANALYTICS](ANALYTICS_PAYLOAD);

      expect(mockLoggerInfo).not.toHaveBeenCalled();
    });
  });

  describe('call:screen-capture-detected', () => {
    it('is rate-limited via SOCKET_RATE_LIMITS.CALL_SCREEN_CAPTURE', async () => {
      const prisma = makePrisma();
      const { socket, io, handlers } = makeSocket([`call:${VALID_CALL_ID}`]);

      const handler = new CallEventsHandler(prisma, makeCallServiceWithParticipant('participant-1'));
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.SCREEN_CAPTURE_DETECTED]({
        callId: VALID_CALL_ID,
        participantId: 'participant-1',
        isCapturing: true,
      });

      expect(mockCheckSocketRateLimit).toHaveBeenCalledWith(
        socket,
        USER_ID,
        expect.objectContaining({ keyPrefix: 'socket:call:screen-capture' }),
        expect.anything(),
        CALL_EVENTS.ERROR
      );
      expect(socket.to).toHaveBeenCalledWith(`call:${VALID_CALL_ID}`);
    });

    it('drops the event and does not relay when the rate limit is exceeded', async () => {
      mockCheckSocketRateLimit.mockResolvedValueOnce(false);
      const prisma = makePrisma();
      const { socket, io, handlers } = makeSocket([`call:${VALID_CALL_ID}`]);

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.SCREEN_CAPTURE_DETECTED]({
        callId: VALID_CALL_ID,
        participantId: 'participant-1',
        isCapturing: true,
      });

      expect(socket.to).not.toHaveBeenCalled();
    });

    // Security fix 2026-07-03: unlike call:backgrounded/call:foregrounded
    // (which resolve the caller's own participantId server-side), this
    // handler used to trust the client-supplied participantId verbatim —
    // letting a participant impersonate the OTHER participant in the room
    // and forge/suppress their screen-capture alert.
    it('relays the caller-resolved participantId, ignoring a spoofed client-supplied one', async () => {
      const emitSpy = jest.fn();
      const prisma = makePrisma();
      const { socket, io, handlers } = makeSocket([`call:${VALID_CALL_ID}`]);
      socket.to = jest.fn().mockReturnValue({ emit: emitSpy });

      const mockCallService = {
        getCallSession: jest.fn<any>().mockResolvedValue({
          participants: [
            { participantId: 'participant-mine', participant: { userId: USER_ID }, leftAt: null },
            { participantId: 'participant-victim', participant: { userId: 'victim-user' }, leftAt: null },
          ],
        }),
      };

      const handler = new CallEventsHandler(prisma, mockCallService as any);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.SCREEN_CAPTURE_DETECTED]({
        callId: VALID_CALL_ID,
        participantId: 'participant-victim',
        isCapturing: true,
      });

      expect(emitSpy).toHaveBeenCalledWith(
        CALL_EVENTS.SCREEN_CAPTURE_ALERT,
        expect.objectContaining({ participantId: 'participant-mine' })
      );
    });

    it('drops the event when the caller has no active participant record in the call', async () => {
      const prisma = makePrisma();
      const { socket, io, handlers } = makeSocket([`call:${VALID_CALL_ID}`]);

      const handler = new CallEventsHandler(prisma, makeCallServiceWithParticipant(null));
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.SCREEN_CAPTURE_DETECTED]({
        callId: VALID_CALL_ID,
        participantId: 'participant-victim',
        isCapturing: true,
      });

      expect(socket.to).not.toHaveBeenCalled();
    });
  });
});
