/**
 * ConversationStatsService — language canonicalization pins.
 *
 * `messagesPerLanguage` and `participantsPerLanguage` key on raw persisted
 * columns (`Message.originalLanguage`, `User.systemLanguage`), which are stored
 * verbatim (`z.string().optional()`, no write-time normalization). Region-tagged
 * / mixed-case values produced by web (`Accept-Language`) and iOS
 * (`Locale.current.identifier`) — `'en-US'`, `'pt-BR'`, `'FR'`, `'fr_FR'` —
 * therefore reach these aggregations intact and MUST be folded through the shared
 * canonicalization SSOT (`normalizeLanguageForDedup`) so `'fr'`/`'fr-FR'`/`'FR'`
 * count as ONE language, not three. Sibling of the already-fixed
 * `PostService.audienceLanguages` (iteration 287). The incremental twin
 * (`updateOnNewMessage`) receives the raw `originalLanguage` from its callers and
 * must apply the SAME SSOT, or the two paths diverge for region-tagged codes.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

import { ConversationStatsService } from '../../../services/ConversationStatsService';

describe('ConversationStatsService — language canonicalization', () => {
  const conversationId = '507f1f77bcf86cd799439011';
  const noConnected = () => [] as string[];
  let service: ConversationStatsService;
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    service = ConversationStatsService.getInstance();
    service.invalidate(conversationId);
    service.invalidate('meeshy');
    mockPrisma = {
      conversation: { findFirst: jest.fn(), findUnique: jest.fn() },
      message: { groupBy: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      participant: { findMany: jest.fn().mockResolvedValue([]) }
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('folds region/case variants of originalLanguage into one canonical bucket and accumulates', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: conversationId, identifier: 'c', type: 'group' });
    mockPrisma.message.groupBy.mockResolvedValue([
      { originalLanguage: 'fr', _count: { _all: 5 } },
      { originalLanguage: 'fr-FR', _count: { _all: 3 } },
      { originalLanguage: 'FR', _count: { _all: 1 } },
      { originalLanguage: 'en-US', _count: { _all: 2 } }
    ]);

    const stats = await service.getOrCompute(mockPrisma as PrismaClient, conversationId, noConnected);

    expect(stats.messagesPerLanguage).toEqual({ fr: 9, en: 2 });
  });

  it('skips null/empty originalLanguage rows rather than bucketing them', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: conversationId, identifier: 'c', type: 'group' });
    mockPrisma.message.groupBy.mockResolvedValue([
      { originalLanguage: 'de', _count: { _all: 4 } },
      { originalLanguage: null, _count: { _all: 7 } },
      { originalLanguage: '', _count: { _all: 9 } }
    ]);

    const stats = await service.getOrCompute(mockPrisma as PrismaClient, conversationId, noConnected);

    expect(stats.messagesPerLanguage).toEqual({ de: 4 });
  });

  it('folds region/case variants of participant systemLanguage into one bucket', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: conversationId, identifier: 'c', type: 'group' });
    mockPrisma.participant.findMany.mockResolvedValue([
      { user: { id: 'u1', systemLanguage: 'fr' } },
      { user: { id: 'u2', systemLanguage: 'fr-FR' } },
      { user: { id: 'u3', systemLanguage: 'EN' } },
      { user: { id: 'u4', systemLanguage: 'en' } },
      { user: { id: 'u5', systemLanguage: null } }
    ]);

    const stats = await service.getOrCompute(mockPrisma as PrismaClient, conversationId, noConnected);

    expect(stats.participantsPerLanguage).toEqual({ fr: 2, en: 2 });
  });

  it('folds region/case variants of global-conversation systemLanguage into one bucket', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: conversationId, identifier: 'meeshy', type: 'global' });
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'u1', systemLanguage: 'pt-BR' },
      { id: 'u2', systemLanguage: 'pt' },
      { id: 'u3', systemLanguage: 'FR' },
      { id: 'u4', systemLanguage: null }
    ]);

    const stats = await service.getOrCompute(mockPrisma as PrismaClient, 'meeshy', noConnected);

    expect(stats.participantsPerLanguage).toEqual({ pt: 2, fr: 1 });
    expect(stats.participantCount).toBe(4);
  });

  it('canonicalizes the incremental updateOnNewMessage twin so a region-tagged code hits the same bucket', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: conversationId, identifier: 'c', type: 'group' });
    mockPrisma.message.groupBy.mockResolvedValue([{ originalLanguage: 'fr', _count: { _all: 5 } }]);

    // Warm the cache with a canonical baseline.
    const base = await service.getOrCompute(mockPrisma as PrismaClient, conversationId, noConnected);
    expect(base.messagesPerLanguage).toEqual({ fr: 5 });

    // A new message arrives labeled 'fr-FR' (raw, as callers pass it): it must
    // bump the existing 'fr' bucket, never create a distinct 'fr-fr' one.
    const updated = await service.updateOnNewMessage(
      mockPrisma as PrismaClient,
      conversationId,
      'fr-FR',
      noConnected
    );

    expect(updated.messagesPerLanguage).toEqual({ fr: 6 });
  });
});
