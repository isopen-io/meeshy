/**
 * `runMessagePostSaveEffects` dans Meeshy Global (type `global`) :
 * - l'axe « conversation distincte » crédite l'engagement PUBLIC, jamais le
 *   privé (#7739) ;
 * - un texte identique à l'un des 50 derniers messages de Global de moins de
 *   10 minutes ne crédite PAS `content.text_message` — le message part quand
 *   même (#7740).
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

const GLOBAL_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439044';
const PART_ID = '507f1f77bcf86cd799439033';
const USER_ID = '507f1f77bcf86cd799439055';

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: MSG_ID,
    conversationId: GLOBAL_ID,
    senderId: PART_ID,
    senderUserId: USER_ID,
    attachmentMimeTypes: [] as readonly string[],
    hasSticker: false,
    content: 'Salut tout le monde',
    messageType: 'text',
    replyToId: null,
    ...overrides,
  };
}

function makePrisma(params: { type?: string; recentContents?: string[]; findManyError?: Error } = {}) {
  const findMany = params.findManyError
    ? jest.fn<any>().mockRejectedValue(params.findManyError)
    : jest.fn<any>().mockResolvedValue((params.recentContents ?? []).map((content) => ({ content })));
  return {
    conversation: {
      update: jest.fn<any>().mockResolvedValue(undefined),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn<any>().mockResolvedValue({ type: params.type ?? 'global', communityId: null }),
    },
    message: { findMany },
  } as any;
}

function makeEngagementService() {
  return {
    recordActivity: jest.fn<any>().mockResolvedValue(undefined),
    recordConversationActivity: jest.fn<any>().mockResolvedValue(undefined),
  };
}

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

function run(params: { prisma: any; engagementService: any; message?: Record<string, unknown>; onError?: any }) {
  runMessagePostSaveEffects({
    prisma: params.prisma,
    translationService: null,
    engagementService: params.engagementService,
    message: makeMessage(params.message),
    originalLanguage: 'fr',
    onError: params.onError,
  });
}

describe('Meeshy Global — axe « conversation distincte » (#7739)', () => {
  it('crédite conversation.public, jamais conversation.private', async () => {
    const engagementService = makeEngagementService();

    run({ prisma: makePrisma(), engagementService });
    await flush();

    expect(engagementService.recordConversationActivity).toHaveBeenCalledWith(USER_ID, 'conversation.public', GLOBAL_ID);
    expect(engagementService.recordConversationActivity).not.toHaveBeenCalledWith(
      USER_ID,
      'conversation.private',
      expect.anything(),
    );
  });
});
