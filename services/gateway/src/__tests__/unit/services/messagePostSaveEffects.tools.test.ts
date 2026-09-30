/**
 * `runMessagePostSaveEffects` — les outils de messagerie crédités à l'envoi
 * (#8959) : citer un message, transférer, partager un lieu fixe.
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

import { postSaveToolFields, runMessagePostSaveEffects, type PostSaveEffect } from '../../../services/messaging/messagePostSaveEffects';

const CONV_ID = '507f1f77bcf86cd799439022';
const USER_ID = '507f1f77bcf86cd799439055';
const QUOTED_ID = '507f1f77bcf86cd799439066';
const QUOTED_AUTHOR = '507f1f77bcf86cd799439077';
const SOURCE_ID = '507f1f77bcf86cd799439088';

function makeEngagementService() {
  return {
    recordActivity: jest.fn<any>().mockResolvedValue(undefined),
    recordConversationActivity: jest.fn<any>().mockResolvedValue(undefined),
  };
}

function makePrisma() {
  return {
    conversation: {
      update: jest.fn<any>().mockResolvedValue(undefined),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn<any>().mockResolvedValue({ type: 'group', communityId: null }),
    },
    message: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
}

function run(
  overrides: Record<string, unknown> = {},
  options: {
    onError?: (effect: PostSaveEffect, error: unknown) => void;
    failOn?: string;
    failure?: Error;
  } = {},
) {
  const engagementService = makeEngagementService();
  if (options.failOn) {
    engagementService.recordActivity.mockImplementation(async (_user: string, operation: string) => {
      if (operation === options.failOn) throw options.failure;
    });
  }
  const prisma = makePrisma();
  runMessagePostSaveEffects({
    prisma: prisma as any,
    translationService: null,
    engagementService,
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
      ...overrides,
    },
    originalLanguage: 'fr',
    ...(options.onError ? { onError: options.onError } : {}),
  });
  return { engagementService, prisma };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

const creditsOf = (service: ReturnType<typeof makeEngagementService>, operation: string) =>
  service.recordActivity.mock.calls.filter((call) => call[1] === operation);

describe('tool.quote_reply', () => {
  it('crédite la citation dans sa conversation, en nommant l\'auteur du message cité', async () => {
    const { engagementService } = run({ replyToId: QUOTED_ID, quoted: { authorUserId: QUOTED_AUTHOR } });
    await flush();

    expect(creditsOf(engagementService, 'tool.quote_reply')).toEqual([
      [USER_ID, 'tool.quote_reply', { conversationId: CONV_ID, targetOwnerId: QUOTED_AUTHOR }],
    ]);
  });

  it('transmet l\'auteur même quand c\'est l\'expéditeur — le moteur refuse de payer sa propre citation', async () => {
    const { engagementService } = run({ replyToId: QUOTED_ID, quoted: { authorUserId: USER_ID } });
    await flush();

    expect(creditsOf(engagementService, 'tool.quote_reply')).toEqual([
      [USER_ID, 'tool.quote_reply', { conversationId: CONV_ID, targetOwnerId: USER_ID }],
    ]);
  });

  it('ne crédite rien sans message cité', async () => {
    const { engagementService } = run();
    await flush();

    expect(creditsOf(engagementService, 'tool.quote_reply')).toEqual([]);
  });

  it('ne crédite rien quand le message cité est illisible (disparu)', async () => {
    const { engagementService } = run({ replyToId: QUOTED_ID, quoted: null });
    await flush();

    expect(creditsOf(engagementService, 'tool.quote_reply')).toEqual([]);
  });

  it('signale sa panne sous son propre nom', async () => {
    const onError = jest.fn();
    const engagementFailure = new Error('down');
    const { engagementService } = run({ replyToId: QUOTED_ID, quoted: { authorUserId: QUOTED_AUTHOR } }, { onError, failOn: 'tool.quote_reply', failure: engagementFailure });
    await flush();

    expect(engagementService.recordActivity).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('quoteEngagement', engagementFailure);
  });
});

describe('tool.forward', () => {
  it('crédite un transfert dans sa conversation', async () => {
    const { engagementService } = run({ forwardedFromId: SOURCE_ID });
    await flush();

    expect(creditsOf(engagementService, 'tool.forward')).toEqual([
      [USER_ID, 'tool.forward', { conversationId: CONV_ID }],
    ]);
  });

  it('ne crédite rien pour un message qui n\'est pas un transfert', async () => {
    const { engagementService } = run({ forwardedFromId: null });
    await flush();

    expect(creditsOf(engagementService, 'tool.forward')).toEqual([]);
  });
});

describe('tool.location (lieu fixe)', () => {
  it('crédite la variante statique d\'un message portant un lieu', async () => {
    const { engagementService } = run({ hasLocation: true, content: '' });
    await flush();

    expect(creditsOf(engagementService, 'tool.location')).toEqual([
      [USER_ID, 'tool.location', { conversationId: CONV_ID, variant: 'static' }],
    ]);
  });

  it('ne crédite rien sans lieu', async () => {
    const { engagementService } = run({ hasLocation: false });
    await flush();

    expect(creditsOf(engagementService, 'tool.location')).toEqual([]);
  });
});

describe('expéditeur anonyme', () => {
  it('ne crédite aucun outil', async () => {
    const { engagementService } = run({
      senderUserId: null,
      replyToId: QUOTED_ID,
      quoted: { authorUserId: QUOTED_AUTHOR },
      forwardedFromId: SOURCE_ID,
      hasLocation: true,
    });
    await flush();

    expect(engagementService.recordActivity).not.toHaveBeenCalled();
  });
});

describe('postSaveToolFields — ce que le message persisté dit de ses outils', () => {
  it('lit la source d\'un transfert et un lieu valide', () => {
    expect(
      postSaveToolFields({ forwardedFromId: SOURCE_ID, metadata: { location: { latitude: 48.85, longitude: 2.35 } } }),
    ).toEqual({ forwardedFromId: SOURCE_ID, hasLocation: true, quoted: null });
  });

  it('ignore un lieu malformé et un message ordinaire', () => {
    expect(postSaveToolFields({ forwardedFromId: null, metadata: { location: { latitude: 'x' } } })).toEqual({
      forwardedFromId: null,
      hasLocation: false,
      quoted: null,
    });
    expect(postSaveToolFields({ metadata: null })).toEqual({ forwardedFromId: null, hasLocation: false, quoted: null });
  });

  it('lit l\'auteur du message cité dans l\'include de l\'écriture', () => {
    expect(postSaveToolFields({ replyTo: { sender: { userId: QUOTED_AUTHOR } } }).quoted).toEqual({ authorUserId: QUOTED_AUTHOR });
    expect(postSaveToolFields({ replyTo: { sender: { userId: null } } }).quoted).toEqual({ authorUserId: null });
    expect(postSaveToolFields({ replyTo: null }).quoted).toBeNull();
  });
});
