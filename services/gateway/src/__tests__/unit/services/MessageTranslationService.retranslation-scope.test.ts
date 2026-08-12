/**
 * Ce qu'une retraduction a le droit de PÉRIMER, et ce qu'elle a le droit de
 * DÉTRUIRE — deux libertés que le service prenait à l'échelle du message alors
 * qu'il ne travaille jamais que sur des LANGUES.
 *
 * 1. Le garde d'ordonnancement (`_isStaleTranslationResult`) compare un `taskId`
 *    par MESSAGE. Toute retraduction, même ne visant qu'UNE langue, supplante
 *    donc les résultats encore en vol de TOUTES les autres. Ces lecteurs-là
 *    restent sur l'original pour toujours : rien ne retente une traduction que
 *    le gateway a lui-même jetée.
 *
 * 2. La retraduction SUPPRIME `Message.translations[lang]` et persiste la
 *    suppression AVANT l'envoi ZMQ, sans rollback. Si le remplacement se perd
 *    — translator muet, timeout épuisé, circuit ouvert — la traduction correcte
 *    est perdue définitivement, alors qu'aucun des quatre transports d'édition
 *    n'a besoin de cette suppression : ils écrivent tous `translations: null`
 *    dans l'écriture du contenu elle-même, et `_saveTranslationToDatabase`
 *    remplace la clé de langue quoi qu'il arrive.
 *
 * Le fake Prisma est STATEFUL : les deux défauts sont des problèmes d'ORDRE
 * entre des écritures et des lectures, qu'un mock à valeur fixe ne peut pas
 * exprimer.
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

describe('Une retraduction ne périme que les LANGUES qu\'elle redemande', () => {
  it('garde le résultat encore en vol d\'une langue que la nouvelle tâche ne couvre pas', async () => {
    const { service, prisma } = await buildService();

    // La tâche initiale couvre en/es/it — elle est encore en vol.
    // Puis une demande ciblée « traduis en italien » part avec un nouveau taskId.
    mockZmqClient.sendTranslationRequest.mockResolvedValueOnce('task-it-only');
    await service.retranslateMessageAsync(MSG_ID, {
      id: MSG_ID,
      content: 'the text',
      originalLanguage: 'fr',
      conversationId: CONV_ID,
      targetLanguage: 'it'
    } as any);

    // L'anglais de la tâche initiale arrive maintenant : la demande italienne
    // ne dit RIEN sur l'anglais, ce résultat est valide.
    mockZmqClient.emit('translationCompleted', completionFor('task-initial', 'en', 'the text (en)'));
    await flushAsync();

    expect(prisma.row.translations.en).toBeDefined();
    expect(prisma.row.translations.en.text).toBe('the text (en)');
  });

  it('périme toujours le résultat d\'une langue que la nouvelle tâche REDEMANDE', async () => {
    const { service, prisma } = await buildService();

    mockZmqClient.sendTranslationRequest.mockResolvedValueOnce('task-it-only');
    await service.retranslateMessageAsync(MSG_ID, {
      id: MSG_ID,
      content: 'the text',
      originalLanguage: 'fr',
      conversationId: CONV_ID,
      targetLanguage: 'it'
    } as any);

    // L'italien d'une tâche PRÉCÉDENTE traduisait un contenu supplanté.
    mockZmqClient.emit('translationCompleted', completionFor('task-initial', 'it', 'il testo VECCHIO'));
    await flushAsync();

    expect(prisma.row.translations.it).toBeUndefined();
  });

  it('compare les langues sous leur forme canonique, pas sous la forme reçue', async () => {
    const { service, prisma } = await buildService();

    mockZmqClient.sendTranslationRequest.mockResolvedValueOnce('task-pt');
    await service.retranslateMessageAsync(MSG_ID, {
      id: MSG_ID,
      content: 'the text',
      originalLanguage: 'fr',
      conversationId: CONV_ID,
      targetLanguage: 'pt-BR'
    } as any);

    // Le translator renvoie 'pt' pour une cible demandée 'pt-BR' : c'est la MÊME
    // langue, donc un résultat d'une tâche antérieure doit bien être périmé.
    mockZmqClient.emit('translationCompleted', completionFor('task-ancienne', 'pt', 'o texto VELHO'));
    await flushAsync();

    expect(prisma.row.translations.pt).toBeUndefined();
  });

  it('n\'a jamais rien à périmer pour un message jamais retraduit', async () => {
    const { service, prisma } = await buildService();

    mockZmqClient.emit('translationCompleted', completionFor('task-initial', 'en', 'the text (en)'));
    await flushAsync();

    expect(prisma.row.translations.en?.text).toBe('the text (en)');
  });
});

describe('Une retraduction ne détruit pas la traduction qu\'elle prétend remplacer', () => {
  it('laisse la traduction existante en place tant que le remplacement n\'est pas revenu', async () => {
    const { service, prisma } = await buildService({
      en: { text: 'the previous english' } as any
    });

    await service.retranslateMessageAsync(MSG_ID, {
      id: MSG_ID,
      content: 'the text',
      originalLanguage: 'fr',
      conversationId: CONV_ID
    } as any);

    // Le translator n'a rien renvoyé : perdre l'anglais ici, c'est le perdre
    // définitivement — aucun chemin ne le retente.
    expect(prisma.row.translations.en?.text).toBe('the previous english');
  });

  it('n\'écrit pas la ligne du tout pour préparer une retraduction', async () => {
    const { service, prisma } = await buildService({ en: { text: 'the previous english' } as any });

    await service.retranslateMessageAsync(MSG_ID, {
      id: MSG_ID,
      content: 'the text',
      originalLanguage: 'fr',
      conversationId: CONV_ID
    } as any);

    expect(prisma.client.message.update).not.toHaveBeenCalled();
  });

  it('remplace bien la traduction quand le résultat, lui, arrive', async () => {
    const { service, prisma } = await buildService({ en: { text: 'the previous english' } as any });

    mockZmqClient.sendTranslationRequest.mockResolvedValueOnce('task-new');
    await service.retranslateMessageAsync(MSG_ID, {
      id: MSG_ID,
      content: 'the text',
      originalLanguage: 'fr',
      conversationId: CONV_ID
    } as any);

    mockZmqClient.emit('translationCompleted', completionFor('task-new', 'en', 'the NEW english'));
    await flushAsync();

    expect(prisma.row.translations.en.text).toBe('the NEW english');
  });
});
