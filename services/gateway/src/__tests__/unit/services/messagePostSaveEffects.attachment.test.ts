/**
 * `runMessagePostSaveEffects` — l'axe « pièce jointe » et la conversation que
 * chaque crédit porte (#8906).
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

import { runMessagePostSaveEffects } from '../../../services/messaging/messagePostSaveEffects';

const CONV_ID = '507f1f77bcf86cd799439022';
const USER_ID = '507f1f77bcf86cd799439055';

function run(overrides: Record<string, unknown> = {}, engagementService = makeEngagementService()) {
  runMessagePostSaveEffects({
    prisma: {
      conversation: {
        update: jest.fn<any>().mockResolvedValue(undefined),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn<any>().mockResolvedValue({ type: 'group', communityId: null }),
      },
    } as any,
    translationService: null,
    engagementService,
    message: {
      id: '507f1f77bcf86cd799439044',
      conversationId: CONV_ID,
      senderId: '507f1f77bcf86cd799439033',
      senderUserId: USER_ID,
      attachmentMimeTypes: [] as readonly string[],
      hasSticker: false,
      content: '',
      messageType: 'text',
      replyToId: null,
      ...overrides,
    },
    originalLanguage: 'fr',
  });
  return engagementService;
}

function makeEngagementService() {
  return {
    recordActivity: jest.fn<any>().mockResolvedValue(undefined),
    recordConversationActivity: jest.fn<any>().mockResolvedValue(undefined),
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

const attachmentCredits = (service: ReturnType<typeof makeEngagementService>) =>
  service.recordActivity.mock.calls.filter((call) => call[1] === 'tool.attachment');

describe('axe tool.attachment', () => {
  it('crédite UNE fois un message portant plusieurs pièces jointes non audio, dans sa conversation', async () => {
    const service = run({ attachmentMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'] });
    await flush();

    expect(attachmentCredits(service)).toEqual([[USER_ID, 'tool.attachment', { conversationId: CONV_ID }]]);
  });

  it('ne crédite pas un vocal seul — il a déjà son axe de contenu', async () => {
    const service = run({ attachmentMimeTypes: ['audio/mp4'] });
    await flush();

    expect(attachmentCredits(service)).toEqual([]);
  });

  it('ne crédite pas un sticker seul — un sticker n\'est pas une pièce jointe', async () => {
    const service = run({ hasSticker: true });
    await flush();

    expect(attachmentCredits(service)).toEqual([]);
    expect(service.recordActivity).toHaveBeenCalledWith(USER_ID, 'tool.sticker', { conversationId: CONV_ID });
  });

  it('ne crédite rien pour un expéditeur anonyme', async () => {
    const service = run({ senderUserId: null, attachmentMimeTypes: ['image/jpeg'] });
    await flush();

    expect(service.recordActivity).not.toHaveBeenCalled();
  });

  it('signale sa panne sous son propre nom', async () => {
    const service = makeEngagementService();
    service.recordActivity.mockImplementation(async (_u: string, axis: string) => {
      if (axis === 'tool.attachment') throw new Error('down');
    });
    const onError = jest.fn();
    runMessagePostSaveEffects({
      prisma: {
        conversation: {
          update: jest.fn<any>().mockResolvedValue(undefined),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
          findUnique: jest.fn<any>().mockResolvedValue({ type: 'group', communityId: null }),
        },
      } as any,
      translationService: null,
      engagementService: service,
      message: {
        id: '507f1f77bcf86cd799439044',
        conversationId: CONV_ID,
        senderId: '507f1f77bcf86cd799439033',
        senderUserId: USER_ID,
        attachmentMimeTypes: ['video/mp4'],
        hasSticker: false,
        content: '',
        messageType: 'text',
        replyToId: null,
      },
      originalLanguage: 'fr',
      onError,
    });
    await flush();

    expect(onError).toHaveBeenCalledWith('attachmentEngagement', expect.any(Error));
  });
});
