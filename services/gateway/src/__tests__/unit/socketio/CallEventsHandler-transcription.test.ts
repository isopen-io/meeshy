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
 * 3. Terminal calls (ended, missed, rejected, failed) MUST silently ignore
 *    segments (no relay, no error) — not just literal 'ended'.
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
const VICTIM_ID = 'user-victim-def';

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

// The authenticated sender is SPEAKER_ID, but the segment payload — entirely
// client-controlled — claims to be spoken by VICTIM_ID (another real
// participant). The gateway already authenticates SPEAKER_ID as an active
// participant; it must not also trust the free-form speakerId field.
const SPOOFED_SEGMENT = {
  callId: VALID_CALL_ID,
  segment: {
    text: 'Words the victim never said',
    speakerId: VICTIM_ID,
    startMs: 0,
    endMs: 1500,
    isFinal: false,
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
  transcriptionCreate?: jest.MockedFunction<any>;
} = {}) {
  return {
    callSession: {
      findUnique: overrides.callSessionFindUnique ?? jest.fn<any>(),
    },
    participant: {
      findFirst: overrides.participantFindFirst ?? jest.fn<any>(),
    },
    transcription: {
      create: overrides.transcriptionCreate ?? jest.fn<any>().mockResolvedValue({ id: 'transcription-row-1' }),
    },
    translationCall: {
      create: jest.fn<any>().mockResolvedValue({ id: 'translation-row-1' }),
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

// Same shape as CallService.callSessionInclude in production: each call
// participant carries its user record (username/displayName) — the server-side
// source the handler must stamp speakerDisplayName from.
function activeCallSessionWithUser(
  userId: string,
  user: { username?: string; displayName?: string | null }
) {
  return {
    participants: [
      {
        participantId: 'participant-1',
        participant: { userId, user: { id: userId, ...user } },
        leftAt: null,
      },
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

  describe('journal metadata: speakerDisplayName + id + capturedAtMs', () => {
    function setup(overrides: {
      callSession?: unknown;
      payload?: unknown;
    } = {}) {
      const prisma = makePrisma({
        callSessionFindUnique: jest.fn<any>().mockResolvedValue({ status: 'active', metadata: null }),
      });
      const { socket, handlers, roomEmit } = makeSocket();
      const callService = makeCallService(
        jest.fn<any>().mockResolvedValue(
          overrides.callSession ??
            activeCallSessionWithUser(SPEAKER_ID, { username: 'alice', displayName: 'Alice Doe' })
        )
      );
      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, {} as any, () => SPEAKER_ID);
      const run = () =>
        handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](overrides.payload ?? VALID_SEGMENT);
      return { roomEmit, run };
    }

    it('stamps speakerDisplayName server-side from the participant user record', async () => {
      const { roomEmit, run } = setup();
      await run();
      const [, payload] = roomEmit.mock.calls[0];
      expect(payload.segment.speakerDisplayName).toBe('Alice Doe');
    });

    it('falls back to the username when displayName is not set', async () => {
      const { roomEmit, run } = setup({
        callSession: activeCallSessionWithUser(SPEAKER_ID, { username: 'alice', displayName: null }),
      });
      await run();
      const [, payload] = roomEmit.mock.calls[0];
      expect(payload.segment.speakerDisplayName).toBe('alice');
    });

    it('omits speakerDisplayName when the participant has no user record', async () => {
      const { roomEmit, run } = setup({ callSession: activeCallSession(SPEAKER_ID) });
      await run();
      const [, payload] = roomEmit.mock.calls[0];
      expect(payload.segment).not.toHaveProperty('speakerDisplayName');
    });

    it('ignores a client-supplied speakerDisplayName (server-stamped, anti-spoof)', async () => {
      const { roomEmit, run } = setup({
        payload: {
          callId: VALID_CALL_ID,
          segment: { ...VALID_SEGMENT.segment, speakerDisplayName: 'Spoofed Name' },
        },
      });
      await run();
      const [, payload] = roomEmit.mock.calls[0];
      expect(payload.segment.speakerDisplayName).toBe('Alice Doe');
    });

    it('passes through the client segment id and capturedAtMs for cross-transport merge', async () => {
      const { roomEmit, run } = setup({
        payload: {
          callId: VALID_CALL_ID,
          segment: {
            ...VALID_SEGMENT.segment,
            id: 'f81d4fae-7dec-4b57-b93a-2c675ddac001',
            capturedAtMs: 1765650000000,
          },
        },
      });
      await run();
      const [, payload] = roomEmit.mock.calls[0];
      expect(payload.segment.id).toBe('f81d4fae-7dec-4b57-b93a-2c675ddac001');
      expect(payload.segment.capturedAtMs).toBe(1765650000000);
    });

    it('stamps capturedAtMs at reception when the client omits it (legacy clients)', async () => {
      const before = Date.now();
      const { roomEmit, run } = setup();
      await run();
      const after = Date.now();
      const [, payload] = roomEmit.mock.calls[0];
      expect(payload.segment.capturedAtMs).toBeGreaterThanOrEqual(before);
      expect(payload.segment.capturedAtMs).toBeLessThanOrEqual(after);
    });

    it('preserves the transcription language tag as sourceLanguage', async () => {
      const { roomEmit, run } = setup();
      await run();
      const [, payload] = roomEmit.mock.calls[0];
      expect(payload.segment.sourceLanguage).toBe('fr');
      expect(payload.segment.targetLanguage).toBe('fr');
    });
  });

  describe('security: speakerId spoofing protection', () => {
    let roomEmit: jest.MockedFunction<any>;

    beforeEach(async () => {
      // Sender authenticates as SPEAKER_ID and IS an active participant, but
      // crafts segment.speakerId to name VICTIM_ID (also a real participant)
      // instead of themselves.
      const prisma = makePrisma({
        callSessionFindUnique: jest.fn<any>().mockResolvedValue({ status: 'active', metadata: null }),
      });
      const { socket, handlers, roomEmit: r } = makeSocket();
      roomEmit = r;

      const handler = new CallEventsHandler(prisma, makeCallService());
      handler.setupCallEvents(socket as any, {} as any, () => SPEAKER_ID);

      await handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](SPOOFED_SEGMENT);
    });

    it('relays the segment stamped with the authenticated sender id, never the client-supplied speakerId', () => {
      const [, payload] = roomEmit.mock.calls[0];
      expect(payload.segment.speakerId).toBe(SPEAKER_ID);
      expect(payload.segment.speakerId).not.toBe(VICTIM_ID);
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

  describe.each(['ended', 'missed', 'rejected', 'failed'])(
    'terminal call (status=%s): segment silently dropped',
    (status) => {
      let roomEmit: jest.MockedFunction<any>;
      let directEmit: jest.MockedFunction<any>;

      beforeEach(async () => {
        // Sender IS an active participant, but the call is terminal → the
        // handler reaches the status check and silently drops the segment
        // (no relay, no error) — regardless of WHICH terminal status it
        // resolved to. A lagging socket still joined to the call room after
        // the call ended via missed/rejected/failed (not just the literal
        // 'ended' path) must not have its segment relayed or ZMQ-translated.
        const prisma = makePrisma({
          callSessionFindUnique: jest.fn<any>().mockResolvedValue({ status, metadata: null }),
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

      it('does NOT emit an error (silent drop for terminal calls)', () => {
        expect(directEmit).not.toHaveBeenCalled();
      });
    }
  );

  describe('server-side transcript persistence (replay post-appel)', () => {
    function setup(overrides: { transcriptionCreate?: jest.MockedFunction<any> } = {}) {
      const transcriptionCreate =
        overrides.transcriptionCreate ?? jest.fn<any>().mockResolvedValue({ id: 'transcription-row-1' });
      const prisma = makePrisma({
        callSessionFindUnique: jest.fn<any>().mockResolvedValue({ status: 'active', metadata: null }),
        transcriptionCreate,
      });
      const { socket, handlers, roomEmit } = makeSocket();
      const handler = new CallEventsHandler(prisma, makeCallService());
      handler.setupCallEvents(socket as any, {} as any, () => SPEAKER_ID);
      return { handlers, roomEmit, transcriptionCreate };
    }

    it('persists a FINAL segment with its journal metadata and the resolved participantId', async () => {
      const { handlers, transcriptionCreate } = setup();
      await handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT]({
        callId: VALID_CALL_ID,
        segment: {
          ...VALID_SEGMENT.segment,
          id: 'f81d4fae-7dec-4b57-b93a-2c675ddac001',
          capturedAtMs: 1765650000000,
        },
      });
      expect(transcriptionCreate).toHaveBeenCalledTimes(1);
      const { data } = transcriptionCreate.mock.calls[0][0];
      expect(data.callSessionId).toBe(VALID_CALL_ID);
      expect(data.participantId).toBe('participant-1');
      expect(data.source).toBe('client');
      expect(data.segmentId).toBe('f81d4fae-7dec-4b57-b93a-2c675ddac001');
      expect(data.text).toBe(VALID_SEGMENT.segment.text);
      expect(data.language).toBe('fr');
      expect(data.timestamp).toEqual(new Date(1765650000000));
    });

    it('never persists a partial revision — only the last spoken value of an utterance lands in storage', async () => {
      const { handlers, transcriptionCreate } = setup();
      await handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT]({
        callId: VALID_CALL_ID,
        segment: { ...VALID_SEGMENT.segment, isFinal: false },
      });
      expect(transcriptionCreate).not.toHaveBeenCalled();
    });

    it('still relays the segment when persistence fails (storage never blocks live captions)', async () => {
      const { handlers, roomEmit } = setup({
        transcriptionCreate: jest.fn<any>().mockRejectedValue(new Error('db down')),
      });
      await handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](VALID_SEGMENT);
      await new Promise((resolve) => setImmediate(resolve));
      expect(roomEmit).toHaveBeenCalledTimes(1);
    });
  });

  describe('call:transcription-active — presence signal relay', () => {
    function setup(overrides: { callSession?: unknown; status?: string } = {}) {
      const prisma = makePrisma({
        callSessionFindUnique: jest.fn<any>().mockResolvedValue({
          status: overrides.status ?? 'active',
          metadata: null,
        }),
      });
      const { socket, handlers, roomEmit, directEmit } = makeSocket();
      const callService = makeCallService(
        jest.fn<any>().mockResolvedValue(overrides.callSession ?? activeCallSession(SPEAKER_ID))
      );
      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, {} as any, () => SPEAKER_ID);
      return { socket, handlers, roomEmit, directEmit };
    }

    it('relays the activation to the call room, stamped with the authenticated sender', async () => {
      const { handlers, roomEmit } = setup();
      await handlers[CALL_EVENTS.TRANSCRIPTION_ACTIVE]({ callId: VALID_CALL_ID, active: true });
      expect(roomEmit).toHaveBeenCalledTimes(1);
      const [eventName, payload] = roomEmit.mock.calls[0];
      expect(eventName).toBe(CALL_EVENTS.TRANSCRIPTION_ACTIVE);
      expect(payload).toEqual({ callId: VALID_CALL_ID, speakerId: SPEAKER_ID, active: true });
    });

    it('relays the deactivation (active: false) so peers clear their invite badge', async () => {
      const { handlers, roomEmit } = setup();
      await handlers[CALL_EVENTS.TRANSCRIPTION_ACTIVE]({ callId: VALID_CALL_ID, active: false });
      const [, payload] = roomEmit.mock.calls[0];
      expect(payload.active).toBe(false);
    });

    it('excludes the sender from the relay (socket.to, never io-wide)', async () => {
      const { socket, handlers } = setup();
      await handlers[CALL_EVENTS.TRANSCRIPTION_ACTIVE]({ callId: VALID_CALL_ID, active: true });
      expect((socket.to as jest.Mock)).toHaveBeenCalledWith(`call:${VALID_CALL_ID}`);
    });

    it('silently drops the signal from a non-participant (no relay, no error)', async () => {
      const { handlers, roomEmit, directEmit } = setup({ callSession: { participants: [] } });
      await handlers[CALL_EVENTS.TRANSCRIPTION_ACTIVE]({ callId: VALID_CALL_ID, active: true });
      expect(roomEmit).not.toHaveBeenCalled();
      expect(directEmit).not.toHaveBeenCalled();
    });

    it('silently drops the signal on a terminal call', async () => {
      const { handlers, roomEmit } = setup({ status: 'ended' });
      await handlers[CALL_EVENTS.TRANSCRIPTION_ACTIVE]({ callId: VALID_CALL_ID, active: true });
      expect(roomEmit).not.toHaveBeenCalled();
    });

    it('does not relay when validation fails', async () => {
      (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: false });
      const { handlers, roomEmit } = setup();
      await handlers[CALL_EVENTS.TRANSCRIPTION_ACTIVE]({ callId: VALID_CALL_ID, active: 'yes' });
      expect(roomEmit).not.toHaveBeenCalled();
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
