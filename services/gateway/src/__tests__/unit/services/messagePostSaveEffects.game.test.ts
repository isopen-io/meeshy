/**
 * `runMessagePostSaveEffects` — les signaux du JEU observés à l'écriture
 * (#9375, #9377) : réponse dans une conversation distincte, autre langue,
 * réponse reçue d'un auteur distinct, +3 points à l'auteur répondu.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: { updateOnNewMessage: jest.fn<any>().mockResolvedValue(undefined) },
}));
jest.mock('../../../services/ConversationMessageStatsService', () => ({
  ...(jest.requireActual('../../../services/ConversationMessageStatsService') as object),
  conversationMessageStatsService: { onNewMessage: jest.fn<any>().mockResolvedValue(undefined) },
}));

import { runMessagePostSaveEffects, type PostSaveEffect } from '../../../services/messaging/messagePostSaveEffects';

const CONV_ID = '507f1f77bcf86cd799439022';
const USER_ID = '507f1f77bcf86cd799439055';
const AUTHOR_ID = '507f1f77bcf86cd799439077';

const prisma = () =>
  ({
    conversation: {
      update: jest.fn<any>().mockResolvedValue(undefined),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn<any>().mockResolvedValue({ type: 'group', communityId: null }),
    },
    message: { findMany: jest.fn<any>().mockResolvedValue([]) },
  }) as any;

const run = (params: { engagementService: Record<string, unknown>; message?: Record<string, unknown>; onError?: (e: PostSaveEffect, err: unknown) => void }) => {
  runMessagePostSaveEffects({
    prisma: prisma(),
    translationService: null,
    engagementService: params.engagementService as any,
    message: {
      id: '507f1f77bcf86cd799439044',
      conversationId: CONV_ID,
      senderId: '507f1f77bcf86cd799439033',
      senderUserId: USER_ID,
      attachmentMimeTypes: [] as readonly string[],
      hasSticker: false,
      content: 'bonjour',
      messageType: 'text',
      replyToId: null,
      ...params.message,
    },
    originalLanguage: 'es',
    ...(params.onError ? { onError: params.onError } : {}),
  });
};

const engagement = (extra: Record<string, unknown> = {}) => ({
  recordActivity: jest.fn<any>().mockResolvedValue(true),
  recordConversationActivity: jest.fn<any>().mockResolvedValue(undefined),
  recordMessageSignals: jest.fn<any>().mockResolvedValue(undefined),
  ...extra,
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('runMessagePostSaveEffects — un message que le crédit refuse ne fait avancer aucun défi (#9635)', () => {
  it('crédit refusé (garde d’abus, plafond du jour, quota) : aucun signal de jeu ne part', async () => {
    const service = engagement({ recordActivity: jest.fn<any>().mockResolvedValue(false) });

    run({ engagementService: service, message: { replyToId: 'orig-1', quoted: { authorUserId: AUTHOR_ID } } });
    await settle();

    expect(service.recordActivity).toHaveBeenCalled();
    expect(service.recordMessageSignals).not.toHaveBeenCalled();
  });

  it('un crédit qui lève vaut un refus : aucun signal', async () => {
    const service = engagement({ recordActivity: jest.fn<any>().mockRejectedValue(new Error('down')) });

    run({ engagementService: service });
    await settle();

    expect(service.recordMessageSignals).not.toHaveBeenCalled();
  });

  it('un crédit muet (rien ne dit qu’il a crédité) vaut un refus : fail-closed', async () => {
    const service = engagement({ recordActivity: jest.fn<any>().mockResolvedValue(undefined) });

    run({ engagementService: service });
    await settle();

    expect(service.recordMessageSignals).not.toHaveBeenCalled();
  });
});

describe('runMessagePostSaveEffects — les signaux du jeu', () => {
  it('remet au jeu le message, sa citation et sa langue détectée', async () => {
    const service = engagement();

    run({ engagementService: service, message: { replyToId: 'orig-1', quoted: { authorUserId: AUTHOR_ID } } });
    await settle();

    expect(service.recordMessageSignals).toHaveBeenCalledWith({
      senderUserId: USER_ID,
      conversationId: CONV_ID,
      messageId: '507f1f77bcf86cd799439044',
      replyToId: 'orig-1',
      quotedAuthorUserId: AUTHOR_ID,
      originalLanguage: 'es',
      content: 'bonjour',
      storyReplyToId: null,
    });
  });

  it('remet aussi la story citée : « répondre à une story » se lit sur le message (#9635)', async () => {
    const service = engagement();

    run({ engagementService: service, message: { storyReplyToId: 'story-1' } });
    await settle();

    expect(service.recordMessageSignals).toHaveBeenCalledWith(expect.objectContaining({ storyReplyToId: 'story-1' }));
  });

  it('un message qui ne répond à rien porte replyToId et auteur cité à null', async () => {
    const service = engagement();

    run({ engagementService: service });
    await settle();

    expect(service.recordMessageSignals).toHaveBeenCalledWith(expect.objectContaining({ replyToId: null, quotedAuthorUserId: null }));
  });

  it('un expéditeur anonyme n’a pas de jeu', async () => {
    const service = engagement();

    run({ engagementService: service, message: { senderUserId: null } });
    await settle();

    expect(service.recordMessageSignals).not.toHaveBeenCalled();
  });

  it('un service d’engagement sans signaux de jeu (double ancien) ne casse rien', async () => {
    const errors: unknown[] = [];

    run({
      engagementService: { recordActivity: jest.fn<any>().mockResolvedValue(undefined), recordConversationActivity: jest.fn<any>().mockResolvedValue(undefined) },
      onError: (_e, err) => errors.push(err),
    });
    await settle();

    expect(errors).toHaveLength(0);
  });

  it('un échec du jeu est rapporté sous son nom, sans retenir le reste', async () => {
    const failure = new Error('jeu en panne');
    const service = engagement({ recordMessageSignals: jest.fn<any>().mockRejectedValue(failure) });
    const reported: [PostSaveEffect, unknown][] = [];

    run({ engagementService: service, onError: (effect, err) => reported.push([effect, err]) });
    await settle();

    expect(reported).toContainEqual(['gameSignals', failure]);
    expect(service.recordActivity).toHaveBeenCalled();
  });
});
