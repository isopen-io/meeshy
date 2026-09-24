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

describe('Meeshy Global — aucun point pour un texte répété (#7740)', () => {
  it('crédite content.text_message pour un texte neuf', async () => {
    const engagementService = makeEngagementService();

    run({ prisma: makePrisma({ recentContents: ['Bonjour à tous', 'Hola'] }), engagementService });
    await flush();

    expect(engagementService.recordActivity).toHaveBeenCalledWith(USER_ID, 'content.text_message');
  });

  it('ne crédite PAS content.text_message pour un texte identique, à la casse, aux espaces et à la ponctuation près', async () => {
    const engagementService = makeEngagementService();

    run({
      prisma: makePrisma({ recentContents: ['Bonjour à tous', '  salut   TOUT le monde !! '] }),
      engagementService,
    });
    await flush();

    expect(engagementService.recordActivity).not.toHaveBeenCalledWith(USER_ID, 'content.text_message');
  });

  it('crédite quand même l\'axe conversation et les autres effets pour un texte répété — le message part', async () => {
    const engagementService = makeEngagementService();
    const prisma = makePrisma({ recentContents: ['Salut tout le monde'] });

    run({ prisma, engagementService });
    await flush();

    expect(engagementService.recordConversationActivity).toHaveBeenCalledWith(USER_ID, 'conversation.public', GLOBAL_ID);
    expect(prisma.conversation.update).toHaveBeenCalled();
  });

  it('borne la lecture aux 50 derniers messages de Global de moins de 10 minutes, le message lui-même exclu', async () => {
    const prisma = makePrisma();
    const before = Date.now();

    run({ prisma, engagementService: makeEngagementService() });
    await flush();

    expect(prisma.message.findMany).toHaveBeenCalledTimes(1);
    const args = prisma.message.findMany.mock.calls[0][0];
    expect(args.where.conversationId).toBe(GLOBAL_ID);
    expect(args.where.id).toEqual({ not: MSG_ID });
    expect(args.where.deletedAt).toBeNull();
    const since = (args.where.createdAt.gte as Date).getTime();
    expect(before - since).toBeGreaterThanOrEqual(10 * 60 * 1000 - 50);
    expect(before - since).toBeLessThanOrEqual(10 * 60 * 1000 + 1000);
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    expect(args.take).toBe(50);
    expect(args.select).toEqual({ content: true });
  });

  it('ne lit jamais l\'historique hors de Global', async () => {
    const engagementService = makeEngagementService();
    const prisma = makePrisma({ type: 'public', recentContents: ['Salut tout le monde'] });

    run({ prisma, engagementService });
    await flush();

    expect(prisma.message.findMany).not.toHaveBeenCalled();
    expect(engagementService.recordActivity).toHaveBeenCalledWith(USER_ID, 'content.text_message');
  });

  it('ne compare pas un message sans texte (pièce jointe seule) : il reste crédité', async () => {
    const engagementService = makeEngagementService();
    const prisma = makePrisma({ recentContents: [''] });

    run({ prisma, engagementService, message: { content: '  ', attachmentMimeTypes: ['image/png'] } });
    await flush();

    expect(prisma.message.findMany).not.toHaveBeenCalled();
    expect(engagementService.recordActivity).toHaveBeenCalledWith(USER_ID, 'content.text_message');
  });

  it('ne touche pas au vocal : un audio répété crédite toujours content.audio_message', async () => {
    const engagementService = makeEngagementService();
    const prisma = makePrisma({ recentContents: ['Salut tout le monde'] });

    run({ prisma, engagementService, message: { attachmentMimeTypes: ['audio/m4a'] } });
    await flush();

    expect(engagementService.recordActivity).toHaveBeenCalledWith(USER_ID, 'content.audio_message');
  });

  it('une panne de lecture de l\'historique est signalée et ne crédite pas — une garde qui ne répond pas ne paie pas', async () => {
    const engagementService = makeEngagementService();
    const onError = jest.fn();

    run({ prisma: makePrisma({ findManyError: new Error('mongo down') }), engagementService, onError });
    await flush();

    expect(onError).toHaveBeenCalledWith('contentEngagement', expect.any(Error));
    expect(engagementService.recordActivity).not.toHaveBeenCalledWith(USER_ID, 'content.text_message');
  });
});
