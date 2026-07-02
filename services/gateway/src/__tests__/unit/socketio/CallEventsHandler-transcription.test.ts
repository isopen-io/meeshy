/**
 * CallEventsHandler — call:transcription-segment relay
 *
 * Regression guards for the transcription relay behaviour:
 *
 * 1. The relay MUST NOT echo translatedText back to participants when ZMQ
 *    translation is unavailable (would mislead consumers into thinking the
 *    source text was a real translation).
 * 2. Non-participants MUST receive a NOT_A_PARTICIPANT error; no segment
 *    is relayed.
 * 3. Ended calls MUST silently ignore segments (no relay, no error).
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks — must precede all imports that transitively load
// CallService / TURNCredentialService / SocketRateLimiter (setInterval hazard)
// ---------------------------------------------------------------------------

const mockGetCallSession = jest.fn<any>();
jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    getCallSession: mockGetCallSession,
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

const mockCheckLimit = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
const mockCheckSocketRateLimit = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({
    checkLimit: mockCheckLimit,
    destroy: jest.fn(),
  })),
  getSocketRateLimiter: jest.fn().mockReturnValue({
    checkLimit: mockCheckLimit,
    destroy: jest.fn(),
  }),
  checkSocketRateLimit: mockCheckSocketRateLimit,
  SOCKET_RATE_LIMITS: {
    MESSAGE_SEND: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:send' },
    CALL_TRANSCRIPTION_SEGMENT: { maxRequests: 60, windowMs: 10000, keyPrefix: 'socket:call:transcription' },
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

// Import after mocks
import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS, CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';
import { validateSocketEvent } from '../../../middleware/validation';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_CALL_ID = '507f1f77bcf86cd799439011';
const SPEAKER_ID = 'user-speaker-abc';

const VALID_SEGMENT = {
  callId: VALID_CALL_ID,
  segment: {
    text: 'Bonjour le monde',
    speakerId: SPEAKER_ID,
    startMs: 0,
    endMs: 1500,
    isFinal: true,
    confidence: 0.95,
    language: 'fr',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePrisma(overrides: {
  callSessionFindUnique?: jest.MockedFunction<any>;
  participantFindFirst?: jest.MockedFunction<any>;
} = {}) {
  return {
    callSession: {
      findUnique: overrides.callSessionFindUnique ?? jest.fn<any>(),
    },
    participant: {
      findFirst: overrides.participantFindFirst ?? jest.fn<any>(),
    },
  } as unknown as PrismaClient;
}

// Authorization now runs through resolveActiveCallParticipantId →
// callService.getCallSession(callId) (the membership-bypass fix), NOT the old
// prisma.participant.findFirst path. Tests inject a CallService whose
// getCallSession reports whether the sender is an ACTIVE participant of THIS call.
function activeCallSession(userId: string) {
  return {
    participants: [
      { participantId: 'participant-1', participant: { userId }, leftAt: null },
    ],
  };
}

function makeCallService(
  getCallSession: jest.MockedFunction<any> = jest.fn<any>().mockResolvedValue(activeCallSession(SPEAKER_ID))
) {
  return { getCallSession } as unknown as import('../../../services/CallService').CallService;
}

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const directEmit = jest.fn<any>();
  const roomEmit = jest.fn<any>();
  const socket = {
    id: 'socket-test-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: directEmit,
    to: jest.fn().mockReturnValue({ emit: roomEmit }),
    data: {},
  };
  return { socket, handlers, directEmit, roomEmit };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CallEventsHandler — call:transcription-segment relay', () => {

  beforeEach(() => {
    // Default: validateSocketEvent returns success for well-formed data
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
    mockCheckSocketRateLimit.mockClear();
    mockCheckSocketRateLimit.mockResolvedValue(true);
    // Default: no active call participant — scenarios that construct
    // CallEventsHandler without an explicit CallService fall through to this
    // module-mocked getCallSession and opt in by overriding it; scenarios
    // that pass makeCallService() explicitly bypass this mock entirely.
    mockGetCallSession.mockReset();
    mockGetCallSession.mockResolvedValue({ participants: [] });
  });

  describe('rate limiting', () => {
    it('checks the rate limit before relaying a segment', async () => {
      const prisma = makePrisma({
        callSessionFindUnique: jest.fn<any>().mockResolvedValue({ status: 'active', metadata: null }),
      });
      const { socket, handlers, roomEmit } = makeSocket();

      const handler = new CallEventsHandler(prisma, makeCallService());
      handler.setupCallEvents(socket as any, {} as any, () => SPEAKER_ID);

      await handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](VALID_SEGMENT);

      expect(mockCheckSocketRateLimit).toHaveBeenCalledTimes(1);
      expect(roomEmit).toHaveBeenCalledTimes(1);
    });

    it('does NOT relay the segment when the rate limit is exceeded', async () => {
      mockCheckSocketRateLimit.mockResolvedValueOnce(false);
      const prisma = makePrisma();
      const { socket, handlers, roomEmit, directEmit } = makeSocket();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, {} as any, () => SPEAKER_ID);

      await handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](VALID_SEGMENT);

      expect(roomEmit).not.toHaveBeenCalled();
      // The handler itself must not emit a second error on top of whatever
      // checkSocketRateLimit already reports to the sender.
      expect(directEmit).not.toHaveBeenCalled();
    });
  });

  describe('happy path: participant in active call', () => {
    let roomEmit: jest.MockedFunction<any>;
    let directEmit: jest.MockedFunction<any>;

    beforeEach(async () => {
      // Authorization resolves via callService.getCallSession (active participant);
      // the single prisma.callSession.findUnique reports call status + metadata.
      const prisma = makePrisma({
        callSessionFindUnique: jest.fn<any>().mockResolvedValue({ status: 'active', metadata: null }),
      });
      const { socket, handlers, roomEmit: r, directEmit: d } = makeSocket();
      roomEmit = r;
      directEmit = d;

      const handler = new CallEventsHandler(prisma, makeCallService());
      handler.setupCallEvents(socket as any, {} as any, () => SPEAKER_ID);

      await handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](VALID_SEGMENT);
    });

    it('relays the segment to the call room', () => {
      expect(roomEmit).toHaveBeenCalledTimes(1);
    });

    it('relays with event name TRANSLATED_SEGMENT', () => {
      const [eventName] = roomEmit.mock.calls[0];
      expect(eventName).toBe(CALL_EVENTS.TRANSLATED_SEGMENT);
    });

    it('relayed segment does NOT include translatedText', () => {
      const [, payload] = roomEmit.mock.calls[0];
      expect(payload.segment).not.toHaveProperty('translatedText');
    });

    it('relayed segment preserves original text', () => {
      const [, payload] = roomEmit.mock.calls[0];
      expect(payload.segment.text).toBe(VALID_SEGMENT.segment.text);
    });

    it('relayed segment preserves speakerId', () => {
      const [, payload] = roomEmit.mock.calls[0];
      expect(payload.segment.speakerId).toBe(SPEAKER_ID);
    });

    it('relayed segment includes sourceLanguage from the segment language', () => {
      const [, payload] = roomEmit.mock.calls[0];
      expect(payload.segment.sourceLanguage).toBe(VALID_SEGMENT.segment.language);
    });

    it('does not emit an error to the sender', () => {
      expect(directEmit).not.toHaveBeenCalled();
    });
  });

  describe('non-participant: user not in the call', () => {
    let roomEmit: jest.MockedFunction<any>;
    let directEmit: jest.MockedFunction<any>;

    beforeEach(async () => {
      // Sender is not an active participant of this call: getCallSession has no
      // matching active participant → resolveActiveCallParticipantId returns null.
      const prisma = makePrisma();
      const { socket, handlers, roomEmit: r, directEmit: d } = makeSocket();
      roomEmit = r;
      directEmit = d;

      const callService = makeCallService(
        jest.fn<any>().mockResolvedValue({ participants: [] })
      );
      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, {} as any, () => SPEAKER_ID);

      await handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](VALID_SEGMENT);
    });

    it('does NOT relay the segment to the room', () => {
      expect(roomEmit).not.toHaveBeenCalled();
    });

    it('emits NOT_A_PARTICIPANT error to the sender', () => {
      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ code: CALL_ERROR_CODES.NOT_A_PARTICIPANT })
      );
    });
  });

  describe('ended call: segment silently dropped', () => {
    let roomEmit: jest.MockedFunction<any>;
    let directEmit: jest.MockedFunction<any>;

    beforeEach(async () => {
      // Sender IS an active participant, but the call has ended → the handler
      // reaches the status check and silently drops the segment (no relay, no error).
      const prisma = makePrisma({
        callSessionFindUnique: jest.fn<any>().mockResolvedValue({ status: 'ended', metadata: null }),
      });
      const { socket, handlers, roomEmit: r, directEmit: d } = makeSocket();
      roomEmit = r;
      directEmit = d;

      const handler = new CallEventsHandler(prisma, makeCallService());
      handler.setupCallEvents(socket as any, {} as any, () => SPEAKER_ID);

      await handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](VALID_SEGMENT);
    });

    it('does NOT relay the segment', () => {
      expect(roomEmit).not.toHaveBeenCalled();
    });

    it('does NOT emit an error (silent drop for ended calls)', () => {
      expect(directEmit).not.toHaveBeenCalled();
    });
  });

  describe('anonymous socket: no userId', () => {
    let roomEmit: jest.MockedFunction<any>;
    let directEmit: jest.MockedFunction<any>;

    beforeEach(async () => {
      const prisma = makePrisma();
      const { socket, handlers, roomEmit: r, directEmit: d } = makeSocket();
      roomEmit = r;
      directEmit = d;

      const handler = new CallEventsHandler(prisma);
      // getUserId returns undefined → anonymous / unauthenticated
      handler.setupCallEvents(socket as any, {} as any, () => undefined);

      await handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](VALID_SEGMENT);
    });

    it('does NOT relay the segment', () => {
      expect(roomEmit).not.toHaveBeenCalled();
    });

    it('does NOT emit any error (silent guard for unauthenticated sockets)', () => {
      expect(directEmit).not.toHaveBeenCalled();
    });
  });
});
