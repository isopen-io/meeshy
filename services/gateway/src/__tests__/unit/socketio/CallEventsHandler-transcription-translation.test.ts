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
});
