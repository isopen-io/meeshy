/**
 * `runMessagePostSaveEffects` — ce que TOUT message committé doit à sa
 * conversation, quel que soit le tuyau par lequel il est arrivé.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockUpdateOnNewMessage = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: {
    updateOnNewMessage: (...a: any[]) => mockUpdateOnNewMessage(...a),
  },
}));

import { runMessagePostSaveEffects } from '../../../services/messaging/messagePostSaveEffects';

const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439044';
const PART_ID = '507f1f77bcf86cd799439033';

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: MSG_ID,
    conversationId: CONV_ID,
    senderId: PART_ID,
    content: 'Bonjour',
    messageType: 'text',
    replyToId: null,
    ...overrides,
  };
}

function makePrisma() {
  return {
    conversation: { update: jest.fn<any>().mockResolvedValue(undefined) },
  } as any;
}

function makeTranslationService() {
  return { handleNewMessage: jest.fn<any>().mockResolvedValue({ status: 'queued' }) };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  mockUpdateOnNewMessage.mockClear();
});

describe('runMessagePostSaveEffects — les trois effets', () => {
  it('remonte la conversation en bumpant lastMessageAt', async () => {
    const prisma = makePrisma();

    runMessagePostSaveEffects({
      prisma,
      translationService: makeTranslationService(),
      message: makeMessage(),
      originalLanguage: 'fr',
    });
    await flush();

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: CONV_ID },
      data: { lastMessageAt: expect.any(Date) },
    });
  });

  it('pousse le message au translator avec son id persisté', async () => {
    const translationService = makeTranslationService();

    runMessagePostSaveEffects({
      prisma: makePrisma(),
      translationService,
      message: makeMessage({ content: 'Hola', replyToId: 'reply-1' }),
      originalLanguage: 'es',
    });
    await flush();

    expect(translationService.handleNewMessage).toHaveBeenCalledWith({
      id: MSG_ID,
      conversationId: CONV_ID,
      senderId: PART_ID,
      content: 'Hola',
      originalLanguage: 'es',
      messageType: 'text',
      replyToId: 'reply-1',
    });
  });

  it('comptabilise le message dans les statistiques de langue de la conversation', async () => {
    runMessagePostSaveEffects({
      prisma: makePrisma(),
      translationService: makeTranslationService(),
      message: makeMessage(),
      originalLanguage: 'de',
    });
    await flush();

    expect(mockUpdateOnNewMessage).toHaveBeenCalledWith(
      expect.anything(),
      CONV_ID,
      'de',
      expect.any(Function)
    );
  });
});

describe('runMessagePostSaveEffects — isolation des pannes', () => {
  it('bumpe quand même la conversation si le translator est en panne', async () => {
    const prisma = makePrisma();
    const translationService = {
      handleNewMessage: jest.fn<any>().mockRejectedValue(new Error('ZMQ down')),
    };
    const onError = jest.fn();

    runMessagePostSaveEffects({
      prisma,
      translationService,
      message: makeMessage(),
      originalLanguage: 'fr',
      onError,
    });
    await flush();

    expect(prisma.conversation.update).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('translation', expect.any(Error));
  });

  it('pousse quand même la traduction si le bump échoue', async () => {
    const prisma = { conversation: { update: jest.fn<any>().mockRejectedValue(new Error('mongo down')) } } as any;
    const translationService = makeTranslationService();
    const onError = jest.fn();

    runMessagePostSaveEffects({
      prisma,
      translationService,
      message: makeMessage(),
      originalLanguage: 'fr',
      onError,
    });
    await flush();

    expect(translationService.handleNewMessage).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('lastMessageAt', expect.any(Error));
  });

  it('ne rejette jamais quand aucun service de traduction n\'est câblé', async () => {
    const prisma = makePrisma();
    const onError = jest.fn();

    expect(() =>
      runMessagePostSaveEffects({
        prisma,
        translationService: undefined,
        message: makeMessage(),
        originalLanguage: 'fr',
        onError,
      })
    ).not.toThrow();
    await flush();

    expect(prisma.conversation.update).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalledWith('translation', expect.anything());
  });

  it('signale la panne de statistiques sans toucher aux deux autres effets', async () => {
    mockUpdateOnNewMessage.mockRejectedValueOnce(new Error('stats down'));
    const prisma = makePrisma();
    const translationService = makeTranslationService();
    const onError = jest.fn();

    runMessagePostSaveEffects({
      prisma,
      translationService,
      message: makeMessage(),
      originalLanguage: 'fr',
      onError,
    });
    await flush();

    expect(prisma.conversation.update).toHaveBeenCalled();
    expect(translationService.handleNewMessage).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('stats', expect.any(Error));
  });
});
