/**
 * #16625 — une traduction de sous-titre d'appel emprunte le bus de traduction
 * des messages, mais n'est PAS un message : ni ligne `Message` à relire ou à
 * sauvegarder, ni statistique de traduction de message, ni `translationReady`
 * ou `translationFailed` vers une conversation qui n'existe pas. Le relais doit
 * pourtant recevoir son résultat, sous le même identifiant.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';
import { Registry } from 'prom-client';
import type { CallTranscriptionSegmentEvent } from '@meeshy/shared/types/video-call';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { callCaptionMetrics } from '../../../services/metrics/callCaptionMetrics';
import { translateAndEmitSegment } from '../../../socketio/call-transcription-relay';
import type { CallTranscriptionRelayDeps } from '../../../socketio/call-transcription-relay';
import { MessageTranslationService } from '../../../services/message-translation/MessageTranslationService';
import type { MultiLevelJobMappingCache } from '../../../services/MultiLevelJobMappingCache';
import { deliverTextTranslation } from '../../../socketio/deliverTextTranslation';
import type { TextTranslationDeliveryDeps } from '../../../socketio/deliverTextTranslation';
import type { MeeshySocket } from '../../../socketio/typed-socket';

type CaptionZmq = EventEmitter & {
  translateText: jest.Mock<(...args: unknown[]) => Promise<string>>;
  close: jest.Mock<() => Promise<void>>;
};

const sharedZmq: { current: CaptionZmq | null } = { current: null };

jest.mock('../../../services/ZmqSingleton', () => ({
  ZMQSingleton: { getInstance: async () => sharedZmq.current },
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

const CALL_ID = '507f1f77bcf86cd799439011';
const SPEAKER = { userId: 'speaker', displayName: 'Awa' };

const finalSegment = (): CallTranscriptionSegmentEvent => ({
  callId: CALL_ID,
  segment: { id: 'utt-1', text: 'Bonjour', speakerId: SPEAKER.userId, startMs: 4200, endMs: 5100, isFinal: true, confidence: 0.9, language: 'fr', capturedAtMs: 1 },
});

const listener = (userId: string, systemLanguage: string) => ({ participant: { userId, user: { systemLanguage } } });

const captionZmq = (): CaptionZmq => {
  const zmq = new EventEmitter() as CaptionZmq;
  zmq.translateText = jest.fn(async () => 'task-en');
  zmq.close = jest.fn(async () => undefined);
  return zmq;
};

const recordingPrisma = (touched: string[]): PrismaClient =>
  new Proxy({}, {
    get: (_target, model) => new Proxy({}, {
      get: (_inner, method) => async () => {
        touched.push(`${String(model)}.${String(method)}`);
        return null;
      },
    }),
  }) as PrismaClient;

const recordingSocket = (emitted: { rooms: string[]; event: string; payload: unknown }[]): MeeshySocket => {
  const chain = (rooms: string[]) => ({
    to: (room: string) => chain([...rooms, room]),
    emit: (event: string, payload: unknown) => {
      emitted.push({ rooms, event, payload });
      return true;
    },
  });
  return { to: (room: string) => chain([room]) } as unknown as MeeshySocket;
};

const relayDeps = (zmq: CaptionZmq): CallTranscriptionRelayDeps => ({
  prisma: { callParticipant: { findMany: jest.fn(async () => [listener(SPEAKER.userId, 'fr'), listener('bob', 'en')]) } } as unknown as CallTranscriptionRelayDeps['prisma'],
  zmqClient: () => zmq as unknown as ReturnType<CallTranscriptionRelayDeps['zmqClient']>,
  captionMetrics: callCaptionMetrics({ registry: new Registry() }),
});

const settle = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

const services: MessageTranslationService[] = [];

const startService = async (zmq: CaptionZmq, touched: string[]) => {
  sharedZmq.current = zmq;
  const service = new MessageTranslationService(recordingPrisma(touched), {} as MultiLevelJobMappingCache);
  services.push(service);
  await service.initialize();
  const ready: unknown[] = [];
  const failed: unknown[] = [];
  service.on('translationReady', (event) => ready.push(event));
  service.on('translationFailed', (event) => failed.push(event));
  return { service, ready, failed };
};

const messageCounters = (service: MessageTranslationService) => {
  const { translations_received, messages_saved, errors, avg_processing_time } = service.getStats();
  return { translations_received, messages_saved, errors, avg_processing_time };
};

const requestedMessageId = (zmq: CaptionZmq): string => String(zmq.translateText.mock.calls[0][3]);

const completion = (messageId: string) => ({
  taskId: 'task-en',
  targetLanguage: 'en',
  result: { messageId, translatedText: 'Hello', sourceLanguage: 'fr', targetLanguage: 'en', confidenceScore: 0.95, processingTime: 0.1, modelType: 'basic' },
});

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()));
  sharedZmq.current = null;
});

describe("une traduction de sous-titre d'appel n'est pas une traduction de message", () => {
  it("réussie, elle atteint l'auditeur sans rien lire ni écrire côté messages", async () => {
    const zmq = captionZmq();
    const touched: string[] = [];
    const { service, ready } = await startService(zmq, touched);
    const countersBefore = messageCounters(service);
    const emitted: { rooms: string[]; event: string; payload: unknown }[] = [];

    const relay = translateAndEmitSegment(relayDeps(zmq), recordingSocket(emitted), finalSegment(), SPEAKER);
    await settle();
    const messageId = requestedMessageId(zmq);
    const event = completion(messageId);
    zmq.emit('translationCompleted', event);
    zmq.emit(`translationCompleted:${messageId}`, event);
    await relay;
    await settle();

    expect(touched).toEqual([]);
    expect(ready).toEqual([]);
    expect(messageCounters(service)).toEqual(countersBefore);
    const toBob = emitted.find((e) => e.rooms.some((room) => room.includes('bob')));
    expect(toBob?.payload).toMatchObject({ callId: CALL_ID, segment: { translatedText: 'Hello', targetLanguage: 'en' } });
  });

  it('abandonnée, elle ne compte aucune erreur de message et ne vise aucune conversation', async () => {
    const zmq = captionZmq();
    const touched: string[] = [];
    const { service, failed } = await startService(zmq, touched);
    const statsBefore = service.getStats();

    const relay = translateAndEmitSegment(relayDeps(zmq), recordingSocket([]), finalSegment(), SPEAKER);
    await settle();
    zmq.emit('translationError', { taskId: 'task-en', messageId: requestedMessageId(zmq), error: 'ZMQ timeout: no response from translator', conversationId: CALL_ID });
    zmq.emit(`translationCompleted:${requestedMessageId(zmq)}`, completion(requestedMessageId(zmq)));
    await relay;
    await settle();

    expect(failed).toEqual([]);
    expect(service.getStats().errors).toBe(statsBefore.errors);
    expect(touched).toEqual([]);
  });

  it('la livraison des traductions de messages la laisse passer sans relire de message', async () => {
    const zmq = captionZmq();
    const relay = translateAndEmitSegment(relayDeps(zmq), recordingSocket([]), finalSegment(), SPEAKER);
    await settle();
    const messageId = requestedMessageId(zmq);
    zmq.emit(`translationCompleted:${messageId}`, completion(messageId));
    await relay;

    const touched: string[] = [];
    const deps: TextTranslationDeliveryDeps = {
      prisma: recordingPrisma(touched),
      io: { to: () => ({ emit: () => true }) } as unknown as TextTranslationDeliveryDeps['io'],
      normalizeConversationId: async (id) => id,
      enqueueForOfflineParticipants: async () => undefined,
      stats: { translations_sent: 0, errors: 0 },
    };
    await deliverTextTranslation(deps, completion(messageId));

    expect(touched).toEqual([]);
    expect(deps.stats).toEqual({ translations_sent: 0, errors: 0 });
  });
});
