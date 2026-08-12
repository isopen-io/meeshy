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

// Le singleton est doublé, mais `resolveAttachmentType` reste le VRAI : c'est
// la table MIME → compteur que `recompute()` applique, et une copie locale dans
// ce fichier prouverait la cohérence du double, jamais celle du système.
const mockOnNewMessage = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../services/ConversationMessageStatsService', () => ({
  ...(jest.requireActual('../../../services/ConversationMessageStatsService') as object),
  conversationMessageStatsService: {
    onNewMessage: (...a: any[]) => mockOnNewMessage(...a),
  },
}));

import { runMessagePostSaveEffects } from '../../../services/messaging/messagePostSaveEffects';

const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439044';
const PART_ID = '507f1f77bcf86cd799439033';

const USER_ID = '507f1f77bcf86cd799439055';

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: MSG_ID,
    conversationId: CONV_ID,
    senderId: PART_ID,
    senderUserId: USER_ID,
    attachmentMimeTypes: [] as readonly string[],
    content: 'Bonjour',
    messageType: 'text',
    replyToId: null,
    ...overrides,
  };
}

function makePrisma() {
  return {
    conversation: {
      update: jest.fn<any>().mockResolvedValue(undefined),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
  } as any;
}

function makeTranslationService() {
  return { handleNewMessage: jest.fn<any>().mockResolvedValue({ status: 'queued' }) };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  mockUpdateOnNewMessage.mockClear();
  mockOnNewMessage.mockClear();
  mockOnNewMessage.mockResolvedValue(undefined);
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

  it('flippe firstMessageSentAt via un updateMany gardé, distinct du bump inconditionnel', async () => {
    const prisma = makePrisma();

    runMessagePostSaveEffects({
      prisma,
      translationService: makeTranslationService(),
      message: makeMessage(),
      originalLanguage: 'fr',
    });
    await flush();

    // Le bump `update` reste inconditionnel — pas de `where.firstMessageSentAt`.
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: CONV_ID },
      data: { lastMessageAt: expect.any(Date) },
    });
    // Le flip est un `updateMany` SÉPARÉ, gardé sur `firstMessageSentAt: null`
    // (`count: 0` = pas le premier message ou conversation non concernée).
    expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: CONV_ID, firstMessageSentAt: null },
      data: { firstMessageSentAt: expect.any(Date) },
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

/**
 * Le comptage des messages est le quatrième effet, et le dernier arrivé : il
 * vivait recopié dans le SEUL handler socket, si bien que tout message envoyé
 * par REST — le chemin PRIMAIRE d'iOS — n'était jamais compté, pendant que sa
 * suppression, elle, décrémentait. Les compteurs ne descendaient donc pas vers
 * une erreur bornée : ils passaient sous zéro et y restaient, aucun recalcul
 * périodique n'existant pour les relever.
 */
describe('runMessagePostSaveEffects — comptage des messages', () => {
  it('compte le message quel que soit le tuyau qui l\'a apporté', async () => {
    const prisma = makePrisma();

    runMessagePostSaveEffects({
      prisma,
      translationService: makeTranslationService(),
      message: makeMessage({ content: 'Bonjour le monde' }),
      originalLanguage: 'fr',
    });
    await flush();

    expect(mockOnNewMessage).toHaveBeenCalledWith(
      prisma,
      CONV_ID,
      USER_ID,
      'Bonjour le monde',
      [],
      'fr',
      'text'
    );
  });

  it('crédite l\'utilisateur enregistré et non son Participant', async () => {
    runMessagePostSaveEffects({
      prisma: makePrisma(),
      translationService: makeTranslationService(),
      message: makeMessage({ senderUserId: USER_ID, senderId: PART_ID }),
      originalLanguage: 'fr',
    });
    await flush();

    expect(mockOnNewMessage.mock.calls[0][2]).toBe(USER_ID);
  });

  it('retombe sur le Participant pour un expéditeur anonyme', async () => {
    runMessagePostSaveEffects({
      prisma: makePrisma(),
      translationService: makeTranslationService(),
      message: makeMessage({ senderUserId: null }),
      originalLanguage: 'fr',
    });
    await flush();

    expect(mockOnNewMessage.mock.calls[0][2]).toBe(PART_ID);
  });

  it('traduit les MIME des pièces jointes en compteurs', async () => {
    runMessagePostSaveEffects({
      prisma: makePrisma(),
      translationService: makeTranslationService(),
      message: makeMessage({
        attachmentMimeTypes: ['image/jpeg', 'audio/mp4', 'video/mp4', 'application/pdf'],
      }),
      originalLanguage: 'fr',
    });
    await flush();

    expect(mockOnNewMessage.mock.calls[0][4]).toEqual(['image', 'audio', 'video', 'file']);
  });

  it('transmet le messageType, seul porteur du compteur de lieux', async () => {
    runMessagePostSaveEffects({
      prisma: makePrisma(),
      translationService: makeTranslationService(),
      message: makeMessage({ messageType: 'location' }),
      originalLanguage: 'fr',
    });
    await flush();

    expect(mockOnNewMessage.mock.calls[0][6]).toBe('location');
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

  it('bumpe et traduit quand même si le flip firstMessageSentAt échoue', async () => {
    const prisma = {
      conversation: {
        update: jest.fn<any>().mockResolvedValue(undefined),
        updateMany: jest.fn<any>().mockRejectedValue(new Error('flip down')),
      },
    } as any;
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
    expect(onError).toHaveBeenCalledWith('firstMessageSentAt', expect.any(Error));
  });

  it('signale la panne du comptage sans toucher aux trois autres effets', async () => {
    mockOnNewMessage.mockRejectedValueOnce(new Error('counters down'));
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
    expect(mockUpdateOnNewMessage).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('messageStats', expect.any(Error));
  });
});
