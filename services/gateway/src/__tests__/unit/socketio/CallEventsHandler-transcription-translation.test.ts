/**
 * CallEventsHandler — call:transcription-segment ZMQ translation path
 *
 * Regression guard for the EventEmitter listener leak: translateAndEmitSegment
 * used to subscribe to the process-wide `translationCompleted` event and
 * filter by taskId, so a listener for every in-flight (segment × target
 * language) translation sat on the SAME global bus for up to 10s — and every
 * unrelated translation completing anywhere in the process (chat messages,
 * stories, other calls) re-ran every pending call's taskId filter. This
 * suite guards that the handler instead subscribes to the scoped
 * `translationCompleted:${messageId}` event (mirroring the pattern already
 * used by ZmqMessageHandler/PostService), so listener count is bounded by
 * this call's active target languages, not global traffic.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { EventEmitter } from 'events';

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

const mockCheckSocketRateLimit = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({
    checkLimit: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
    destroy: jest.fn(),
  })),
  getSocketRateLimiter: jest.fn().mockReturnValue({
    checkLimit: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
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

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { validateSocketEvent } from '../../../middleware/validation';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ZmqTranslationClient } from '../../../services/zmq-translation';

const VALID_CALL_ID = '507f1f77bcf86cd799439011';
const SPEAKER_ID = 'user-speaker-abc';
const LISTENER_ID = 'user-listener-def';
const MESSAGE_ID = `call-${VALID_CALL_ID}-0`;

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

// The authenticated sender is SPEAKER_ID, but the client-controlled segment
// claims to be spoken by LISTENER_ID — a different, real participant.
const SPOOFED_SEGMENT = {
  callId: VALID_CALL_ID,
  segment: {
    text: 'Bonjour le monde',
    speakerId: LISTENER_ID,
    startMs: 0,
    endMs: 1500,
    isFinal: true,
    confidence: 0.95,
    language: 'fr',
  },
};

function makePrisma() {
  return {
    callSession: {
      findUnique: jest.fn<any>().mockResolvedValue({
        status: 'active',
        metadata: { translationEnabled: true },
      }),
    },
    participant: {
      findFirst: jest.fn<any>(),
    },
    callParticipant: {
      findMany: jest.fn<any>().mockResolvedValue([
        { participant: { userId: SPEAKER_ID, user: { systemLanguage: 'fr' } } },
        { participant: { userId: LISTENER_ID, user: { systemLanguage: 'en' } } },
      ]),
    },
    transcription: {
      create: jest.fn<any>().mockResolvedValue({ id: 'transcription-row-1' }),
    },
    translationCall: {
      create: jest.fn<any>().mockResolvedValue({ id: 'translation-row-1' }),
    },
  } as unknown as PrismaClient;
}

function activeCallSession(userId: string) {
  return {
    participants: [
      { participantId: 'participant-1', participant: { userId }, leftAt: null },
    ],
  };
}

function makeCallService() {
  return {
    getCallSession: jest.fn<any>().mockResolvedValue(activeCallSession(SPEAKER_ID)),
  } as unknown as import('../../../services/CallService').CallService;
}

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const roomEmit = jest.fn<any>();
  const socket = {
    id: 'socket-test-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: roomEmit }),
    data: {},
  };
  return { socket, handlers, roomEmit };
}

/** A minimal fake standing in for ZmqTranslationClient — a real EventEmitter
 * plus a controllable translateText, exactly the surface CallEventsHandler
 * actually uses. */
function makeFakeZmqClient(taskId = 'task-xyz') {
  const emitter = new EventEmitter() as EventEmitter & { translateText: jest.MockedFunction<any> };
  emitter.translateText = jest.fn<any>().mockResolvedValue(taskId);
  return emitter as unknown as ZmqTranslationClient;
}

/** Same fake, but `translateText` resolves to a taskId derived from the
 * target language — needed to disambiguate `onResult` for tests that
 * exercise MORE THAN ONE target language on the same segment. */
function makeMultiLanguageFakeZmqClient() {
  const emitter = new EventEmitter() as EventEmitter & { translateText: jest.MockedFunction<any> };
  emitter.translateText = jest.fn<any>().mockImplementation(
    async (_text: string, _source: string, targetLanguage: string) => `task-${targetLanguage}`
  );
  return emitter as unknown as ZmqTranslationClient;
}

/**
 * A room-aware socket double: `to(room)` accumulates the addressed rooms
 * (chained `.to().to()...` collapses to ONE recorded emission, mirroring
 * Socket.IO's own at-most-once delivery), and `.emit()` records the rooms
 * alongside the event/payload so a test can assert exactly who received it.
 */
function makeRoomAwareSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const emissions: Array<{ rooms: string[]; event: string; payload: any }> = [];
  const toSpy = jest.fn<any>();
  function broadcastOperator(rooms: string[]) {
    return {
      to: (room: string) => {
        toSpy(room);
        return broadcastOperator([...rooms, room]);
      },
      emit: (event: string, payload: unknown) => {
        emissions.push({ rooms, event, payload });
      },
    };
  }
  const socket = {
    id: 'socket-test-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: jest.fn(),
    to: jest.fn((room: string) => {
      toSpy(room);
      return broadcastOperator([room]);
    }),
    data: {},
  };
  return { socket, handlers, emissions, toSpy };
}

describe('CallEventsHandler — call:transcription-segment ZMQ translation', () => {
  beforeEach(() => {
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
    mockCheckSocketRateLimit.mockClear();
    mockCheckSocketRateLimit.mockResolvedValue(true);
    mockGetCallSession.mockReset();
    mockGetCallSession.mockResolvedValue({ participants: [] });
  });

  it('subscribes to the scoped translationCompleted:<messageId> event, not the global one, then relays via it and removes the listener', async () => {
    const prisma = makePrisma();
    const { socket, handlers, roomEmit } = makeSocket();
    const taskId = 'task-xyz';
    const zmqClient = makeFakeZmqClient(taskId);
    const emitter = zmqClient as unknown as EventEmitter;
    const onSpy = jest.spyOn(emitter, 'on');

    const handler = new CallEventsHandler(prisma, makeCallService());
    handler.setZmqClient(zmqClient);
    handler.setupCallEvents(socket as any, {} as any, () => SPEAKER_ID);

    const segmentPromise = handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](VALID_SEGMENT);

    // Give translateText's microtasks (and the awaits ahead of it in the
    // handler chain: rate limit, participant resolution, callSession lookup,
    // callParticipant.findMany) time to resolve and register the listener.
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
    await new Promise((resolve) => setImmediate(resolve));

    const subscribedEvents = onSpy.mock.calls.map((c) => c[0]);
    expect(subscribedEvents).toContain(`translationCompleted:${MESSAGE_ID}`);
    expect(subscribedEvents).not.toContain('translationCompleted');

    emitter.emit(`translationCompleted:${MESSAGE_ID}`, {
      taskId,
      result: { translatedText: 'Hello world', messageId: MESSAGE_ID },
      targetLanguage: 'en',
    });

    await segmentPromise;

    expect(roomEmit).toHaveBeenCalledTimes(1);
    const [eventName, payload] = roomEmit.mock.calls[0];
    expect(eventName).toBe(CALL_EVENTS.TRANSLATED_SEGMENT);
    expect(payload.segment.translatedText).toBe('Hello world');
    expect(payload.segment.targetLanguage).toBe('en');

    // The scoped listener must be removed once resolved — no leak.
    expect(emitter.listenerCount(`translationCompleted:${MESSAGE_ID}`)).toBe(0);
  });

  it('stamps the relayed speakerId with the authenticated sender, ignoring a spoofed client-supplied speakerId', async () => {
    const prisma = makePrisma();
    const { socket, handlers, roomEmit } = makeSocket();
    const taskId = 'task-spoof';
    const zmqClient = makeFakeZmqClient(taskId);
    const emitter = zmqClient as unknown as EventEmitter;

    const handler = new CallEventsHandler(prisma, makeCallService());
    handler.setZmqClient(zmqClient);
    // Authenticated sender is SPEAKER_ID; SPOOFED_SEGMENT.segment.speakerId
    // claims LISTENER_ID instead.
    handler.setupCallEvents(socket as any, {} as any, () => SPEAKER_ID);

    const segmentPromise = handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](SPOOFED_SEGMENT);
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
    await new Promise((resolve) => setImmediate(resolve));

    emitter.emit(`translationCompleted:${MESSAGE_ID}`, {
      taskId,
      result: { translatedText: 'Hello world', messageId: MESSAGE_ID },
      targetLanguage: 'en',
    });
    await segmentPromise;

    expect(roomEmit).toHaveBeenCalledTimes(1);
    const [, payload] = roomEmit.mock.calls[0];
    expect(payload.segment.speakerId).toBe(SPEAKER_ID);
    expect(payload.segment.speakerId).not.toBe(LISTENER_ID);
  });

  it('attempts translation even when callSession.metadata has no translationEnabled flag', async () => {
    const prisma = makePrisma();
    // Override the default mock to prove the gate is gone: no
    // translationEnabled anywhere on metadata (not even `false`).
    (prisma.callSession.findUnique as jest.Mock).mockResolvedValue({
      status: 'active',
      metadata: {},
    });
    const { socket, handlers, roomEmit } = makeSocket();
    const taskId = 'task-no-gate';
    const zmqClient = makeFakeZmqClient(taskId);
    const emitter = zmqClient as unknown as EventEmitter;

    const handler = new CallEventsHandler(prisma, makeCallService());
    handler.setZmqClient(zmqClient);
    handler.setupCallEvents(socket as any, {} as any, () => SPEAKER_ID);

    const segmentPromise = handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](VALID_SEGMENT);
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
    await new Promise((resolve) => setImmediate(resolve));

    emitter.emit(`translationCompleted:${MESSAGE_ID}`, {
      taskId,
      result: { translatedText: 'Hello world', messageId: MESSAGE_ID },
      targetLanguage: 'en',
    });
    await segmentPromise;

    expect(roomEmit).toHaveBeenCalledTimes(1);
    const [eventName, payload] = roomEmit.mock.calls[0];
    expect(eventName).toBe(CALL_EVENTS.TRANSLATED_SEGMENT);
    expect(payload.segment.translatedText).toBe('Hello world');
  });

  it('carries the journal metadata (id, speakerDisplayName, capturedAtMs) on the translated emission', async () => {
    const prisma = makePrisma();
    const { socket, handlers, roomEmit } = makeSocket();
    const taskId = 'task-journal';
    const zmqClient = makeFakeZmqClient(taskId);
    const emitter = zmqClient as unknown as EventEmitter;

    const callService = {
      getCallSession: jest.fn<any>().mockResolvedValue({
        participants: [
          {
            participantId: 'participant-1',
            participant: {
              userId: SPEAKER_ID,
              user: { id: SPEAKER_ID, username: 'alice', displayName: 'Alice Doe' },
            },
            leftAt: null,
          },
        ],
      }),
    } as unknown as import('../../../services/CallService').CallService;

    const handler = new CallEventsHandler(prisma, callService);
    handler.setZmqClient(zmqClient);
    handler.setupCallEvents(socket as any, {} as any, () => SPEAKER_ID);

    const segmentPromise = handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT]({
      callId: VALID_CALL_ID,
      segment: {
        ...VALID_SEGMENT.segment,
        id: 'f81d4fae-7dec-4b57-b93a-2c675ddac001',
        capturedAtMs: 1765650000000,
      },
    });
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
    await new Promise((resolve) => setImmediate(resolve));

    emitter.emit(`translationCompleted:${MESSAGE_ID}`, {
      taskId,
      result: { translatedText: 'Hello world', messageId: MESSAGE_ID },
      targetLanguage: 'en',
    });
    await segmentPromise;

    expect(roomEmit).toHaveBeenCalledTimes(1);
    const [, payload] = roomEmit.mock.calls[0];
    expect(payload.segment.id).toBe('f81d4fae-7dec-4b57-b93a-2c675ddac001');
    expect(payload.segment.speakerDisplayName).toBe('Alice Doe');
    expect(payload.segment.capturedAtMs).toBe(1765650000000);
    expect(payload.segment.translatedText).toBe('Hello world');
    expect(payload.segment.sourceLanguage).toBe('fr');
  });

  it('persists the successful translation onto the stored transcript row (TranslationCall)', async () => {
    const prisma = makePrisma();
    const { socket, handlers } = makeSocket();
    const taskId = 'task-persist';
    const zmqClient = makeFakeZmqClient(taskId);
    const emitter = zmqClient as unknown as EventEmitter;

    const handler = new CallEventsHandler(prisma, makeCallService());
    handler.setZmqClient(zmqClient);
    handler.setupCallEvents(socket as any, {} as any, () => SPEAKER_ID);

    const segmentPromise = handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](VALID_SEGMENT);
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
    await new Promise((resolve) => setImmediate(resolve));

    emitter.emit(`translationCompleted:${MESSAGE_ID}`, {
      taskId,
      result: { translatedText: 'Hello world', messageId: MESSAGE_ID },
      targetLanguage: 'en',
    });
    await segmentPromise;
    await new Promise((resolve) => setImmediate(resolve));

    expect((prisma as any).transcription.create).toHaveBeenCalledTimes(1);
    expect((prisma as any).translationCall.create).toHaveBeenCalledTimes(1);
    const { data } = (prisma as any).translationCall.create.mock.calls[0][0];
    expect(data.transcriptionId).toBe('transcription-row-1');
    expect(data.targetLanguage).toBe('en');
    expect(data.translatedText).toBe('Hello world');
  });

  it('resolves the target language via the full Prisme chain (regionalLanguage), not a bare systemLanguage ?? "fr" fallback', async () => {
    // Prisme Linguistique: a listener with no systemLanguage but a configured
    // regionalLanguage must be translated into THAT language, not French.
    // `translateAndEmitSegment` used to read only `user.systemLanguage` and
    // fall back to the literal 'fr' — skipping regionalLanguage,
    // customDestinationLanguage and deviceLocale entirely, unlike every
    // sibling resolver in this file (resolveNotificationLangs).
    const prisma = makePrisma();
    (prisma.callParticipant.findMany as jest.Mock).mockResolvedValue([
      { participant: { userId: SPEAKER_ID, user: { systemLanguage: 'fr' } } },
      {
        participant: {
          userId: LISTENER_ID,
          user: {
            systemLanguage: null,
            regionalLanguage: 'es',
            customDestinationLanguage: null,
            deviceLocale: 'en-US',
          },
        },
      },
    ]);
    const { socket, handlers } = makeSocket();
    const zmqClient = makeFakeZmqClient('task-prisme');

    const handler = new CallEventsHandler(prisma, makeCallService());
    handler.setZmqClient(zmqClient);
    handler.setupCallEvents(socket as any, {} as any, () => SPEAKER_ID);

    const segmentPromise = handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](VALID_SEGMENT);
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
    await new Promise((resolve) => setImmediate(resolve));

    expect(zmqClient.translateText).toHaveBeenCalledWith(
      VALID_SEGMENT.segment.text,
      VALID_SEGMENT.segment.language,
      'es',
      MESSAGE_ID,
      VALID_CALL_ID
    );
    expect(zmqClient.translateText).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'fr',
      expect.anything(),
      expect.anything()
    );

    // Unstick the pending promise so the test doesn't hang on the handler's
    // internal Promise.allSettled — resolve via the scoped translation event.
    (zmqClient as unknown as EventEmitter).emit(`translationCompleted:${MESSAGE_ID}`, {
      taskId: 'task-prisme',
      result: { translatedText: 'Hola mundo', messageId: MESSAGE_ID },
      targetLanguage: 'es',
    });
    await segmentPromise;
  });

  describe('group call, 3+ distinct languages — per-language targeting (Prisme cross-contamination guard)', () => {
    const EN_LISTENER_ID = 'user-en-listener';
    const ES_LISTENER_ID = 'user-es-listener';

    function setupThreeWayCall() {
      const prisma = makePrisma();
      (prisma.callParticipant.findMany as jest.Mock).mockResolvedValue([
        { participant: { userId: SPEAKER_ID, user: { systemLanguage: 'fr' } } },
        { participant: { userId: EN_LISTENER_ID, user: { systemLanguage: 'en' } } },
        { participant: { userId: ES_LISTENER_ID, user: { systemLanguage: 'es' } } },
      ]);
      const { socket, handlers, emissions } = makeRoomAwareSocket();
      const zmqClient = makeMultiLanguageFakeZmqClient();
      const emitter = zmqClient as unknown as EventEmitter;

      const handler = new CallEventsHandler(prisma, makeCallService());
      handler.setZmqClient(zmqClient);
      handler.setupCallEvents(socket as any, {} as any, () => SPEAKER_ID);

      const segmentPromise = handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](VALID_SEGMENT);
      return { emitter, emissions, segmentPromise };
    }

    async function resolveBothLanguages(emitter: EventEmitter, segmentPromise: Promise<void>) {
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
      await new Promise((resolve) => setImmediate(resolve));

      emitter.emit(`translationCompleted:${MESSAGE_ID}`, {
        taskId: 'task-en',
        result: { translatedText: 'Hello world', messageId: MESSAGE_ID },
        targetLanguage: 'en',
      });
      emitter.emit(`translationCompleted:${MESSAGE_ID}`, {
        taskId: 'task-es',
        result: { translatedText: 'Hola mundo', messageId: MESSAGE_ID },
        targetLanguage: 'es',
      });
      await segmentPromise;
    }

    it('sends the English translation ONLY to the English listener\'s personal room, never the call room', async () => {
      const { emitter, emissions, segmentPromise } = setupThreeWayCall();
      await resolveBothLanguages(emitter, segmentPromise);

      const englishEmission = emissions.find((e) => e.payload.segment.translatedText === 'Hello world');
      expect(englishEmission).toBeDefined();
      expect(englishEmission!.rooms).toEqual([ROOMS.user(EN_LISTENER_ID)]);
      expect(englishEmission!.rooms).not.toContain(ROOMS.call(VALID_CALL_ID));
      expect(englishEmission!.rooms).not.toContain(ROOMS.user(ES_LISTENER_ID));
    });

    it('sends the Spanish translation ONLY to the Spanish listener\'s personal room, never the call room', async () => {
      const { emitter, emissions, segmentPromise } = setupThreeWayCall();
      await resolveBothLanguages(emitter, segmentPromise);

      const spanishEmission = emissions.find((e) => e.payload.segment.translatedText === 'Hola mundo');
      expect(spanishEmission).toBeDefined();
      expect(spanishEmission!.rooms).toEqual([ROOMS.user(ES_LISTENER_ID)]);
      expect(spanishEmission!.rooms).not.toContain(ROOMS.call(VALID_CALL_ID));
      expect(spanishEmission!.rooms).not.toContain(ROOMS.user(EN_LISTENER_ID));
    });

    it('emits exactly two segments total — one per distinct target language, never a call-room broadcast', async () => {
      const { emitter, emissions, segmentPromise } = setupThreeWayCall();
      await resolveBothLanguages(emitter, segmentPromise);

      expect(emissions).toHaveLength(2);
      expect(emissions.every((e) => !e.rooms.includes(ROOMS.call(VALID_CALL_ID)))).toBe(true);
    });
  });
  describe('group call, listener sharing the SPEAKER\'s language (same-language starvation guard)', () => {
    const FR_LISTENER_ID = 'user-fr-listener';
    const EN_LISTENER_ID = 'user-en-listener';

    /**
     * Speaker speaks 'fr'. One listener resolves to 'fr' (needs NO translation),
     * another to 'en' (needs one). The same-language listener used to be dropped
     * from `listenersByLanguage` and the whole-room fallback only fired when
     * `targetLanguages.length === 0` — so as soon as ONE listener needed a
     * translation, every same-language listener received nothing at all.
     */
    function setupMixedCall() {
      const prisma = makePrisma();
      (prisma.callParticipant.findMany as jest.Mock).mockResolvedValue([
        { participant: { userId: SPEAKER_ID, user: { systemLanguage: 'fr' } } },
        { participant: { userId: FR_LISTENER_ID, user: { systemLanguage: 'fr' } } },
        { participant: { userId: EN_LISTENER_ID, user: { systemLanguage: 'en' } } },
      ]);
      const { socket, handlers, emissions } = makeRoomAwareSocket();
      const zmqClient = makeMultiLanguageFakeZmqClient();
      const emitter = zmqClient as unknown as EventEmitter;

      const handler = new CallEventsHandler(prisma, makeCallService());
      handler.setZmqClient(zmqClient);
      handler.setupCallEvents(socket as any, {} as any, () => SPEAKER_ID);

      const segmentPromise = handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](VALID_SEGMENT);
      return { emitter, emissions, segmentPromise };
    }

    async function resolveEnglish(emitter: EventEmitter, segmentPromise: Promise<void>) {
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
      await new Promise((resolve) => setImmediate(resolve));
      emitter.emit(`translationCompleted:${MESSAGE_ID}`, {
        taskId: 'task-en',
        result: { translatedText: 'Hello world', messageId: MESSAGE_ID },
        targetLanguage: 'en',
      });
      await segmentPromise;
    }

    it('still delivers the ORIGINAL segment to the listener who shares the speaker\'s language', async () => {
      const { emitter, emissions, segmentPromise } = setupMixedCall();
      await resolveEnglish(emitter, segmentPromise);

      const frEmission = emissions.find((e) => e.rooms.includes(ROOMS.user(FR_LISTENER_ID)));
      expect(frEmission).toBeDefined();
      expect(frEmission!.payload.segment.text).toBe('Bonjour le monde');
      expect(frEmission!.payload.segment.translatedText).toBeUndefined();
      expect(frEmission!.payload.segment.targetLanguage).toBe('fr');
    });

    it('does not leak the same-language original into the English listener\'s room', async () => {
      const { emitter, emissions, segmentPromise } = setupMixedCall();
      await resolveEnglish(emitter, segmentPromise);

      const frEmission = emissions.find((e) => e.rooms.includes(ROOMS.user(FR_LISTENER_ID)));
      expect(frEmission!.rooms).not.toContain(ROOMS.user(EN_LISTENER_ID));
      expect(frEmission!.rooms).not.toContain(ROOMS.call(VALID_CALL_ID));
    });

    it('still translates for the English listener', async () => {
      const { emitter, emissions, segmentPromise } = setupMixedCall();
      await resolveEnglish(emitter, segmentPromise);

      const enEmission = emissions.find((e) => e.payload.segment.translatedText === 'Hello world');
      expect(enEmission).toBeDefined();
      expect(enEmission!.rooms).toEqual([ROOMS.user(EN_LISTENER_ID)]);
    });
  });

  /**
   * The client-declared segment language reaches the handler VERBATIM
   * (`socketTranscriptionSegmentSchema` accepts `z.string().min(2).max(10)`, so
   * `'fr-FR'`, `'en-US'`, mixed case all pass — speech recognizers emit locale
   * identifiers). The listener languages, by contrast, are canonical
   * (`resolveUserLanguage` → 2-letter lowercase). The chat twin
   * (`MessageTranslationService._normalizeSourceLanguage`) already canonicalises
   * its ZMQ source (`fr-FR` → `fr`); this path must match it, else the ZMQ
   * SOURCE is an invalid NLLB code for the whole segment, and the same-language
   * check misfires.
   */
  describe('canonicalises the client-declared segment language (twin of chat _normalizeSourceLanguage)', () => {
    const EN_LISTENER_ID = 'user-en-listener';

    function regionTaggedSegment(language: string) {
      return {
        callId: VALID_CALL_ID,
        segment: {
          text: 'Bonjour le monde',
          speakerId: SPEAKER_ID,
          startMs: 0,
          endMs: 1500,
          isFinal: true,
          confidence: 0.95,
          language,
        },
      };
    }

    it('passes a CANONICAL source language (fr) to ZMQ when the client declares a region-tagged code (fr-FR)', async () => {
      const prisma = makePrisma();
      (prisma.callParticipant.findMany as jest.Mock).mockResolvedValue([
        { participant: { userId: SPEAKER_ID, user: { systemLanguage: 'fr' } } },
        { participant: { userId: EN_LISTENER_ID, user: { systemLanguage: 'en' } } },
      ]);
      const { socket, handlers } = makeRoomAwareSocket();
      const zmqClient = makeMultiLanguageFakeZmqClient();
      const translateText = (zmqClient as unknown as { translateText: jest.Mock }).translateText;
      const emitter = zmqClient as unknown as EventEmitter;

      const handler = new CallEventsHandler(prisma, makeCallService());
      handler.setZmqClient(zmqClient);
      handler.setupCallEvents(socket as any, {} as any, () => SPEAKER_ID);

      const segmentPromise = handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](regionTaggedSegment('fr-FR'));
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
      await new Promise((resolve) => setImmediate(resolve));
      emitter.emit(`translationCompleted:${MESSAGE_ID}`, {
        taskId: 'task-en',
        result: { translatedText: 'Hello world', messageId: MESSAGE_ID },
        targetLanguage: 'en',
      });
      await segmentPromise;

      expect(translateText).toHaveBeenCalledTimes(1);
      const sourceLanguageArg = translateText.mock.calls[0][1];
      expect(sourceLanguageArg).toBe('fr');
    });

    it('serves the ORIGINAL (no ZMQ request) to a listener whose canonical language matches a region-tagged speaker code (en-US)', async () => {
      const prisma = makePrisma();
      (prisma.callParticipant.findMany as jest.Mock).mockResolvedValue([
        { participant: { userId: SPEAKER_ID, user: { systemLanguage: 'en' } } },
        { participant: { userId: EN_LISTENER_ID, user: { systemLanguage: 'en' } } },
      ]);
      const { socket, handlers, emissions } = makeRoomAwareSocket();
      const zmqClient = makeMultiLanguageFakeZmqClient();
      const translateText = (zmqClient as unknown as { translateText: jest.Mock }).translateText;

      const handler = new CallEventsHandler(prisma, makeCallService());
      handler.setZmqClient(zmqClient);
      handler.setupCallEvents(socket as any, {} as any, () => SPEAKER_ID);

      const segmentPromise = handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](regionTaggedSegment('en-US'));
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
      await new Promise((resolve) => setImmediate(resolve));
      await segmentPromise;

      // The English listener speaks the (canonical) speaker language — no
      // translation must be requested. With NO listener needing a translation
      // the original broadcasts to the whole call room (targetLanguages empty).
      expect(translateText).not.toHaveBeenCalled();
      const original = emissions.find((e) => e.rooms.includes(ROOMS.call(VALID_CALL_ID)));
      expect(original).toBeDefined();
      expect(original!.payload.segment.text).toBe('Bonjour le monde');
      expect(original!.payload.segment.translatedText).toBeUndefined();
      // And the source label the client receives is canonical, not `en-US`.
      expect(original!.payload.segment.sourceLanguage).toBe('en');
    });
  });
});
