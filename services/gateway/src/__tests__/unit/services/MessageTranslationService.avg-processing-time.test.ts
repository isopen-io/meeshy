/**
 * Le temps de traitement MOYEN du traducteur est alimenté à chaque
 * traduction reçue (audit 2026-10-04) : `TranslationStats.updateAvgProcessingTime`
 * n'était appelé nulle part, et la supervision affichait 0 ms pour toujours.
 *
 * Le traducteur mesure `processingTime` en SECONDES (`time.time()` Python) ;
 * la statistique est en MILLISECONDES (`avgProcessingTimeMs`).
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { EventEmitter } from 'events';

type MockFn = jest.Mock<any>;

/** `jest.fn<T>()` n'accepte pas un seul paramètre de type dans cette version. */
const mockFn = (impl: (...args: any[]) => any): MockFn => jest.fn(impl) as unknown as MockFn;

class MockZMQClient extends EventEmitter {
  sendTranslationRequest: MockFn = jest.fn();
  healthCheck: MockFn = jest.fn();
  close: MockFn = jest.fn();
  testReception: MockFn = jest.fn();
}

const mockZmqClient = new MockZMQClient();

jest.mock('../../../services/ZmqSingleton', () => ({
  ZMQSingleton: {
    getInstance: jest.fn().mockResolvedValue(mockZmqClient)
  }
}));

jest.mock('@meeshy/shared/types/attachment-audio', () => ({
  toSocketIOTranslation: jest.fn()
}));

import { MessageTranslationService } from '../../../services/message-translation/MessageTranslationService';

const MSG_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';

type Translations = Record<string, { text: string } & Record<string, unknown>>;

/**
 * Une ligne Message unique, mutée par les écritures et relue par les lectures.
 * Les participants parlent en/es/it : c'est le prisme de la conversation.
 */
function buildStatefulPrisma(initialTranslations: Translations) {
  const row = {
    id: MSG_ID,
    conversationId: CONV_ID,
    senderId: 'sender-1',
    content: 'the text',
    originalLanguage: 'fr',
    encryptionMode: 'none',
    isEncrypted: false,
    deletedAt: null as Date | null,
    translations: { ...initialTranslations } as Translations
  };

  return {
    row,
    client: {
      message: {
        findFirst: mockFn(async () => ({ ...row })),
        findUnique: mockFn(async () => ({ ...row })),
        update: mockFn(async ({ data }: any) => {
          Object.assign(row, data);
          return { ...row };
        })
      },
      conversation: {
        findUnique: mockFn(async () => ({ autoTranslateEnabled: true }))
      },
      participant: {
        findMany: mockFn(async () => [
          { id: 'p-en', type: 'anonymous', displayName: 'en reader', language: 'en', user: null },
          { id: 'p-es', type: 'anonymous', displayName: 'es reader', language: 'es', user: null },
          { id: 'p-it', type: 'anonymous', displayName: 'it reader', language: 'it', user: null }
        ]),
        findUnique: mockFn(async () => null)
      },
      userStats: { upsert: mockFn(async () => ({})) }
    }
  };
}

async function buildService(initialTranslations: Translations = {}) {
  const prisma = buildStatefulPrisma(initialTranslations);
  const service = new MessageTranslationService(prisma.client as any);
  await service.initialize();
  return { service, prisma };
}

/** Le résultat que le translator renvoie pour UNE langue d'une requête. */
const completionFor = (taskId: string, targetLanguage: string, text: string) => ({
  taskId,
  targetLanguage,
  result: {
    messageId: MSG_ID,
    sourceLanguage: 'fr',
    targetLanguage,
    translatedText: text,
    translatorModel: 'basic',
    confidenceScore: 0.9
  },
  metadata: {}
});

const flushAsync = () => new Promise<void>(resolve => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  mockZmqClient.removeAllListeners();
  mockZmqClient.sendTranslationRequest.mockImplementation(async () => 'task-generated');
});


describe('le temps moyen de traduction est alimenté', () => {
  it('chaque traduction reçue entre dans la moyenne, en millisecondes', async () => {
    const { service } = await buildService();
    const avec = (taskId: string, lang: string, seconds: number) => {
      const c = completionFor(taskId, lang, `texte ${lang}`);
      return { ...c, result: { ...c.result, processingTime: seconds } };
    };
    mockZmqClient.emit('translationCompleted', avec('t1', 'en', 0.2));
    await flushAsync(); await flushAsync();
    mockZmqClient.emit('translationCompleted', avec('t2', 'es', 0.4));
    await flushAsync(); await flushAsync();

    const stats = service.getStats();
    expect(stats.translations_received).toBe(2);
    expect(stats.avg_processing_time).toBeCloseTo(300, 5);
  });

  it('une durée absente ou invalide ne fausse pas la moyenne', async () => {
    const { service } = await buildService();
    mockZmqClient.emit('translationCompleted', completionFor('t1', 'en', 'texte'));
    await flushAsync(); await flushAsync();
    expect(service.getStats().avg_processing_time).toBe(0);
  });
});
