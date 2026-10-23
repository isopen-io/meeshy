/**
 * #12518 — un message d'une conversation chiffrée de bout en bout ne part pas
 * au translator : aucune traduction serveur, aucun aller-retour ZMQ, même pour
 * un `content` vide. Le Prisme y est l'affaire de l'appareil (#9229).
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

import { queueMessageTranslation, runMessagePostSaveEffects } from '../../../services/messaging/messagePostSaveEffects';

const message = (encryptionMode: string | null) => ({
  id: '507f1f77bcf86cd799439044',
  conversationId: '507f1f77bcf86cd799439022',
  senderId: '507f1f77bcf86cd799439033',
  senderUserId: '507f1f77bcf86cd799439055',
  attachmentMimeTypes: [] as readonly string[],
  hasSticker: false,
  content: '',
  messageType: 'text',
  replyToId: null,
  encryptionMode,
});

const prisma = () => ({
  conversation: {
    update: jest.fn<any>().mockResolvedValue(undefined),
    updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    findUnique: jest.fn<any>().mockResolvedValue({ type: 'direct', communityId: null, participants: [] }),
  },
}) as any;

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('effets post-commit — la traduction serveur ne voit pas une conversation e2ee', () => {
  it.each(['e2ee', 'E2EE'])('un message en mode %s ne part pas au translator', async (mode) => {
    const translationService = { handleNewMessage: jest.fn<any>().mockResolvedValue({}) };

    runMessagePostSaveEffects({ prisma: prisma(), translationService, message: message(mode), originalLanguage: 'fr' });
    await flush();

    expect(translationService.handleNewMessage).not.toHaveBeenCalled();
  });

  it('la re-poussée d’un doublon ne le traduit pas non plus', async () => {
    const translationService = { handleNewMessage: jest.fn<any>().mockResolvedValue({}) };

    await queueMessageTranslation({ translationService, message: message('e2ee'), originalLanguage: 'fr' });

    expect(translationService.handleNewMessage).not.toHaveBeenCalled();
  });

  it.each([null, 'server', 'hybrid'])('un message en mode %s part toujours au translator (non-régression)', async (mode) => {
    const translationService = { handleNewMessage: jest.fn<any>().mockResolvedValue({}) };

    runMessagePostSaveEffects({
      prisma: prisma(),
      translationService,
      message: { ...message(mode), content: 'Bonjour' },
      originalLanguage: 'fr',
    });
    await flush();

    expect(translationService.handleNewMessage).toHaveBeenCalledTimes(1);
  });
});
