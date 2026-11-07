/**
 * #16557 — un retrait purge la copie EN MÉMOIRE des traductions du message.
 *
 * Le cache du traducteur est servi avant la base, sans TTL, et seule la
 * retraduction le purgeait. Les témoins utilisent le VRAI `TranslationCache` :
 * c'est l'entrée servie qui doit disparaître, pas un appel qui doit avoir eu lieu.
 *
 * @jest-environment node
 */

import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('../../../../services/ConversationMessageStatsService', () => ({
  ...(jest.requireActual('../../../../services/ConversationMessageStatsService') as object),
  conversationMessageStatsService: { onMessageDeleted: jest.fn<any>().mockResolvedValue(undefined) },
}));

import { TranslationCache } from '../../../../services/message-translation/TranslationCache';
import {
  purgeTranslationCacheFor,
  setSharedTranslationCache,
} from '../../../../services/message-translation/translationCacheRegistry';
import { applyMessageRemovalEffects } from '../../../../services/messaging/messageRemovalEffects';
import { purgeDueViewOnceContent } from '../../../../services/messaging/purgeViewOnceContent';

const RECALLED = '507f1f77bcf86cd799439011';
const SURVIVOR = '507f1f77bcf86cd799439012';
const CONVERSATION = '507f1f77bcf86cd799439022';

const translated = (messageId: string) => ({
  messageId,
  sourceLanguage: 'fr',
  targetLanguage: 'en',
  translatedText: `secret of ${messageId}`,
  confidenceScore: 0.9,
  processingTime: 0,
  modelType: 'basic',
});

function warmCache() {
  const cache = new TranslationCache(100);
  [RECALLED, SURVIVOR].forEach((id) => {
    cache.set(TranslationCache.generateKey(id, 'en', 'fr'), translated(id) as never);
    cache.set(TranslationCache.generateKey(id, 'es'), translated(id) as never);
  });
  setSharedTranslationCache({ invalidateCacheForMessage: (id) => cache.deleteByMessageId(id) });
  return cache;
}

const served = (cache: TranslationCache, id: string) =>
  [cache.get(TranslationCache.generateKey(id, 'en', 'fr')), cache.get(TranslationCache.generateKey(id, 'es'))].filter(Boolean);

const removalPrisma = () =>
  ({
    message: { findRaw: async () => [], findFirst: async () => null },
    conversation: { findUnique: async () => null, updateMany: async () => ({ count: 0 }) },
    trackingLink: { updateMany: async () => ({ count: 0 }) },
    notification: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    sharedTranslation: { deleteMany: async () => ({ count: 0 }) },
  }) as never;

afterEach(() => setSharedTranslationCache(undefined));

describe('le retrait d’un message purge ses traductions en mémoire (#16557)', () => {
  it('ne laisse servir aucune traduction en cache d’un message rappelé, et garde celles des autres', async () => {
    const cache = warmCache();

    await applyMessageRemovalEffects(
      removalPrisma(),
      { id: RECALLED, conversationId: CONVERSATION, senderId: 'p-1', senderUserId: null, messageType: 'text', attachmentMimeTypes: [] },
      undefined,
    );

    expect(served(cache, RECALLED)).toEqual([]);
    expect(served(cache, SURVIVOR)).toHaveLength(2);
  });

  it('purge aussi le contenu d’une vue unique dont la passe de purge est passée', async () => {
    const cache = warmCache();
    const prisma = {
      message: {
        findMany: async () => [{ id: RECALLED, conversationId: CONVERSATION, viewOnceBurnedAt: null, attachments: [] }],
        updateMany: async () => ({ count: 1 }),
        update: async () => ({}),
      },
      messageAttachment: { updateMany: async () => ({ count: 0 }), findMany: async () => [] },
      sharedTranslation: { deleteMany: async () => ({ count: 0 }) },
    } as never;

    await purgeDueViewOnceContent(prisma, { now: new Date('2026-11-07T10:00:00Z') });

    expect(served(cache, RECALLED)).toEqual([]);
    expect(served(cache, SURVIVOR)).toHaveLength(2);
  });

  it('ne lève jamais : un cache qui refuse ne transforme pas un retrait réussi en échec', () => {
    setSharedTranslationCache({
      invalidateCacheForMessage: () => {
        throw new Error('boom');
      },
    });

    expect(() => purgeTranslationCacheFor([RECALLED])).not.toThrow();
  });

  it('ne fait rien dans un processus qui n’a enregistré aucun cache', () => {
    expect(() => purgeTranslationCacheFor([RECALLED])).not.toThrow();
  });

  it('le processus enregistre SON service de traduction comme cache à purger', () => {
    const server = readFileSync(join(__dirname, '../../../../server.ts'), 'utf8');

    expect(server).toMatch(/setSharedTranslationCache\(this\.translationService\)/);
  });
});
