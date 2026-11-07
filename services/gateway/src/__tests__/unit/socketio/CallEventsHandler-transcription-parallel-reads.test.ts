/**
 * #16575 — un sous-titre FINAL part vers la traduction après UNE attente de la
 * base, pas trois.
 *
 * Le locuteur (`getCallSession`), l'admission e2ee (`callSession.findUnique`)
 * et les auditeurs (`callParticipant.findMany`) ne dépendent pas l'un de
 * l'autre : les trois lectures partent ensemble. Les DÉCISIONS, elles, restent
 * prises dans le même ordre — locuteur, puis admission, puis relais — et une
 * lecture d'auditeurs qui échoue ne perd plus le segment : l'original part à
 * la salle.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { EventEmitter } from 'events';

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

jest.mock('../../../services/PushNotificationService', () => ({
  PushNotificationService: jest.fn(),
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn(),
  isValidationFailure: jest.fn((r: { success: boolean }) => !r.success),
}));

const mockCheckSocketRateLimit = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({ checkLimit: jest.fn(), destroy: jest.fn() })),
  getSocketRateLimiter: jest.fn().mockReturnValue({ checkLimit: jest.fn(), destroy: jest.fn() }),
  checkSocketRateLimit: mockCheckSocketRateLimit,
  SOCKET_RATE_LIMITS: {
    CALL_TRANSCRIPTION_SEGMENT: { maxRequests: 60, windowMs: 10000, keyPrefix: 'socket:call:transcription' },
  },
}));

const mockLogger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock('../../../utils/logger', () => ({ logger: mockLogger }));

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS, CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { validateSocketEvent } from '../../../middleware/validation';
import { processCallCaptionMetrics } from '../../../services/metrics/callCaptionMetrics';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ZmqTranslationClient } from '../../../services/zmq-translation';
import type { CallService } from '../../../services/CallService';

const CALL_ID = '507f1f77bcf86cd799439011';
const SPEAKER_ID = 'user-speaker-abc';
const LISTENER_ID = 'user-listener-def';

const segmentOf = (isFinal: boolean) => ({
  callId: CALL_ID,
  segment: {
    text: 'Bonjour le monde',
    speakerId: SPEAKER_ID,
    startMs: 0,
    endMs: 1500,
    isFinal,
    confidence: 0.95,
    language: 'fr',
  },
});

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const SPEAKER_SESSION = {
  participants: [
    { participantId: 'participant-speaker', participant: { userId: SPEAKER_ID, user: { displayName: 'Ana' } }, leftAt: null },
  ],
};
const STRANGER_SESSION = { participants: [] };
const PLAINTEXT_CALL = { status: 'active', conversation: { encryptionMode: null } };
const E2EE_CALL = { status: 'active', conversation: { encryptionMode: 'e2ee' } };
const LISTENERS = [
  { participant: { userId: SPEAKER_ID, user: { systemLanguage: 'fr' } } },
  { participant: { userId: LISTENER_ID, user: { systemLanguage: 'en' } } },
];

type Reads = {
  readonly speaker: () => Promise<unknown>;
  readonly admission: () => Promise<unknown>;
  readonly listeners: () => Promise<unknown>;
};

function harness(reads: Reads) {
  const getCallSession = jest.fn(reads.speaker);
  const findUnique = jest.fn(reads.admission);
  const findMany = jest.fn(reads.listeners);
  const prisma = {
    callSession: { findUnique },
    callParticipant: { findMany },
    transcription: { create: jest.fn<any>().mockResolvedValue({ id: 'transcription-1' }) },
    translationCall: { create: jest.fn<any>().mockResolvedValue({ id: 'translation-1' }) },
  } as unknown as PrismaClient;
  const callService = { getCallSession } as unknown as CallService;

  const handlers: Record<string, (...args: any[]) => any> = {};
  const emissions: Array<{ rooms: string[]; event: string; payload: any }> = [];
  const operator = (rooms: string[]): any => ({
    to: (room: string) => operator([...rooms, room]),
    emit: (event: string, payload: unknown) => { emissions.push({ rooms, event, payload }); },
  });
  const socket = {
    id: 'socket-speaker',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => { handlers[event] = fn; }),
    emit: jest.fn(),
    to: jest.fn((room: string) => operator([room])),
    data: {},
  };

  const zmq = new EventEmitter() as EventEmitter & { translateText: jest.Mock<any> };
  zmq.translateText = jest.fn<any>().mockResolvedValue('task-en');

  const handler = new CallEventsHandler(prisma, callService);
  handler.setZmqClient(zmq as unknown as ZmqTranslationClient);
  handler.setupCallEvents(socket as any, {} as any, () => SPEAKER_ID);

  const send = (payload: unknown, ack?: (r: unknown) => void) =>
    handlers[CALL_EVENTS.TRANSCRIPTION_SEGMENT](payload, ack);

  return { send, socket, emissions, zmq, getCallSession, findUnique, findMany, prisma };
}

async function untranslatedDeliveries(): Promise<number> {
  const line = (await processCallCaptionMetrics.registry.metrics())
    .split('\n')
    .find((row) => row.startsWith('call_caption_deliveries_total{path="untranslated"}'));
  return line ? Number(line.split(' ').pop()) : 0;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

async function captureUnhandledRejections(body: () => Promise<void>): Promise<unknown[]> {
  const captured: unknown[] = [];
  const onUnhandled = (reason: unknown) => { captured.push(reason); };
  process.on('unhandledRejection', onUnhandled);
  try {
    await body();
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  return captured;
}

describe('call:transcription-segment — les lectures partent ensemble (#16575)', () => {
  beforeEach(() => {
    (validateSocketEvent as jest.MockedFunction<any>).mockImplementation((_s: unknown, data: unknown) => ({ success: true, data }));
    mockCheckSocketRateLimit.mockResolvedValue(true);
    jest.clearAllMocks();
  });

  it('émet les trois lectures avant que la première ne réponde', async () => {
    const speaker = deferred<unknown>();
    const admission = deferred<unknown>();
    const listeners = deferred<unknown>();
    const h = harness({ speaker: () => speaker.promise, admission: () => admission.promise, listeners: () => listeners.promise });

    const done = h.send(segmentOf(true));
    await flush();

    expect(h.getCallSession).toHaveBeenCalledTimes(1);
    expect(h.findUnique).toHaveBeenCalledTimes(1);
    expect(h.findMany).toHaveBeenCalledTimes(1);

    speaker.resolve(SPEAKER_SESSION);
    admission.resolve(PLAINTEXT_CALL);
    listeners.resolve(LISTENERS);
    await flush();
    expect(h.zmq.translateText).toHaveBeenCalledWith('Bonjour le monde', 'fr', 'en', `call-${CALL_ID}-0`, CALL_ID);
    h.zmq.emit(`translationCompleted:call-${CALL_ID}-0`, { taskId: 'task-en', result: { translatedText: 'Hello world', targetLanguage: 'en' } });
    await done;

    const served = h.emissions.filter((e) => e.event === CALL_EVENTS.TRANSLATED_SEGMENT);
    expect(served).toHaveLength(2);
    expect(served[0].rooms).toEqual([ROOMS.call(CALL_ID)]);
    expect(served[1].rooms).toEqual([ROOMS.user(LISTENER_ID)]);
    expect(served[1].payload.segment.translatedText).toBe('Hello world');
  });

  it('ne lit pas les auditeurs pour un segment partiel', async () => {
    const h = harness({
      speaker: () => Promise.resolve(SPEAKER_SESSION),
      admission: () => Promise.resolve(PLAINTEXT_CALL),
      listeners: () => Promise.resolve(LISTENERS),
    });

    await h.send(segmentOf(false));

    expect(h.findMany).not.toHaveBeenCalled();
    expect(h.emissions.map((e) => e.rooms)).toEqual([[ROOMS.call(CALL_ID)]]);
  });

  it('un non-participant reçoit NOT_A_PARTICIPANT, et aucun refus e2ee ni relais ne part', async () => {
    const ack = jest.fn();
    const h = harness({
      speaker: () => Promise.resolve(STRANGER_SESSION),
      admission: () => Promise.resolve(E2EE_CALL),
      listeners: () => Promise.reject(new Error('mongo down')),
    });

    const unhandled = await captureUnhandledRejections(() => h.send(segmentOf(true), ack));

    expect(unhandled).toEqual([]);
    expect(h.socket.emit).toHaveBeenCalledWith(CALL_EVENTS.ERROR, expect.objectContaining({ code: CALL_ERROR_CODES.NOT_A_PARTICIPANT }));
    expect(ack).not.toHaveBeenCalled();
    expect(h.emissions).toEqual([]);
    expect((h.prisma as any).transcription.create).not.toHaveBeenCalled();
  });

  it('un appel e2ee est refusé par l\'acquittement avant toute écriture, traduction ou relais', async () => {
    const ack = jest.fn();
    const h = harness({
      speaker: () => Promise.resolve(SPEAKER_SESSION),
      admission: () => Promise.resolve(E2EE_CALL),
      listeners: () => Promise.resolve(LISTENERS),
    });

    await h.send(segmentOf(true), ack);

    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ success: false, code: CALL_ERROR_CODES.E2EE_CAPTIONS_REFUSED }));
    expect(h.emissions).toEqual([]);
    expect(h.zmq.translateText).not.toHaveBeenCalled();
    expect((h.prisma as any).transcription.create).not.toHaveBeenCalled();
  });

  it('une lecture d\'auditeurs en échec sert l\'original à la salle, sans rejet non géré', async () => {
    const h = harness({
      speaker: () => Promise.resolve(SPEAKER_SESSION),
      admission: () => Promise.resolve(PLAINTEXT_CALL),
      listeners: () => Promise.reject(new Error('mongo down')),
    });

    const before = await untranslatedDeliveries();
    const unhandled = await captureUnhandledRejections(() => h.send(segmentOf(true)));

    expect(unhandled).toEqual([]);
    expect(h.zmq.translateText).not.toHaveBeenCalled();
    const served = h.emissions.filter((e) => e.event === CALL_EVENTS.TRANSLATED_SEGMENT);
    expect(served.map((e) => e.rooms)).toEqual([[ROOMS.call(CALL_ID)]]);
    expect(served[0].payload.segment.text).toBe('Bonjour le monde');
    expect(await untranslatedDeliveries()).toBe(before + 1);
  });
});
