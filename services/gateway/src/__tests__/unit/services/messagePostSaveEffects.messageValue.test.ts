/**
 * `runMessagePostSaveEffects` — un message TEXTE rapporte selon le type RÉEL
 * de sa conversation, lu par le serveur (#9666) : directe 2, groupe et autres
 * 4, publique 6, globale 8. Le vocal reste à 5, sans variante.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { DEFAULT_ENGAGEMENT_SCALE, pointsForOperation } from '@meeshy/shared/types/engagement-scale';

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

function makeEngagementService() {
  return {
    recordActivity: jest.fn<any>().mockResolvedValue(true),
    recordConversationActivity: jest.fn<any>().mockResolvedValue(undefined),
  };
}

function run(params: { conversation: { type: string } | null; message?: Record<string, unknown> }) {
  const engagementService = makeEngagementService();
  runMessagePostSaveEffects({
    prisma: {
      conversation: {
        update: jest.fn<any>().mockResolvedValue(undefined),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        findUnique: jest
          .fn<any>()
          .mockResolvedValue(params.conversation ? { ...params.conversation, communityId: null, participants: [] } : null),
      },
      message: { findMany: jest.fn<any>().mockResolvedValue([]) },
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
      content: 'Bonjour',
      messageType: 'text',
      replyToId: null,
      ...params.message,
    },
    originalLanguage: 'fr',
  });
  return engagementService;
}

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

const contentCredits = (service: ReturnType<typeof makeEngagementService>) =>
  service.recordActivity.mock.calls.filter((call) => String(call[1]).startsWith('content.'));

const creditedPoints = (service: ReturnType<typeof makeEngagementService>): number => {
  const [[, key, options]] = contentCredits(service) as [[string, 'content.text_message', { variant?: string }]];
  return pointsForOperation(DEFAULT_ENGAGEMENT_SCALE, key, 1, options.variant);
};

describe('la valeur d’un message texte suit le type de sa conversation (#9666)', () => {
  it.each([
    ['direct', 'direct', 2],
    ['group', 'group', 4],
    ['public', 'public', 6],
    ['global', 'global', 8],
    ['broadcast', 'other', 4],
    ['inconnu', 'other', 4],
  ])('une conversation %s crédite la variante %s, soit %i points', async (type, variant, points) => {
    const service = run({ conversation: { type } });
    await flush();

    expect(contentCredits(service)).toEqual([[USER_ID, 'content.text_message', { conversationId: CONV_ID, variant }]]);
    expect(creditedPoints(service)).toBe(points);
  });

  it('une conversation introuvable crédite « autres »', async () => {
    const service = run({ conversation: null });
    await flush();

    expect(contentCredits(service)).toEqual([[USER_ID, 'content.text_message', { conversationId: CONV_ID, variant: 'other' }]]);
  });

  it('le type vient de la base, jamais de ce que le message déclare', async () => {
    const service = run({ conversation: { type: 'direct' }, message: { conversationType: 'global', variant: 'global' } });
    await flush();

    expect(creditedPoints(service)).toBe(2);
  });

  it('le vocal garde sa valeur unique, sans variante', async () => {
    const service = run({ conversation: { type: 'global' }, message: { attachmentMimeTypes: ['audio/mp4'] } });
    await flush();

    expect(contentCredits(service)).toEqual([[USER_ID, 'content.audio_message', { conversationId: CONV_ID }]]);
  });
});
