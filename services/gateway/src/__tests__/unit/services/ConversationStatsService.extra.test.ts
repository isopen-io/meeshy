/**
 * Extra tests for ConversationStatsService — targeting uncovered lines:
 *
 * Lines 39-41: cleanup interval callback (advances fake timers 15 min)
 * Line 189:    user.findMany rejection in computeStats (global conversation path)
 * Lines 239-247: computeOnlineUsers called with conversationId === "meeshy"
 *               (triggered via updateOnNewMessage with a "meeshy" cached entry)
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { ConversationStatsService } from '../../../services/ConversationStatsService';

// ---------------------------------------------------------------------------
// Prisma mock factories
// ---------------------------------------------------------------------------

function makePrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  return {
    conversation: { findFirst: jest.fn() },
    message: { groupBy: jest.fn().mockResolvedValue([]) },
    participant: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as PrismaClient;
}

// ---------------------------------------------------------------------------
// Helper: fresh singleton for each test
// ---------------------------------------------------------------------------

function freshService(): ConversationStatsService {
  (ConversationStatsService as unknown as { instance: null }).instance = null;
  return ConversationStatsService.getInstance();
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  // Reset singleton
  (ConversationStatsService as unknown as { instance: null }).instance = null;
});

// ---------------------------------------------------------------------------
// Lines 39-41: periodic cleanup callback
// ---------------------------------------------------------------------------

describe('startPeriodicCleanup (lines 39-41)', () => {
  it('test_cleanup_expired_entries_removed_after_15min', async () => {
    const service = freshService();

    // Use a very short TTL so the entry expires quickly
    // The instance is created with default 1h TTL, so we use fake timers
    // We populate cache by computing stats with a real conversationId
    const prisma = makePrisma();
    (prisma.conversation.findFirst as jest.Mock).mockResolvedValue({ id: 'conv-aaa', identifier: 'conv-aaa' });

    await service.getOrCompute(prisma, 'conv-aaa', () => []);
    expect(service.getActiveConversationIds()).toContain('conv-aaa');

    // Advance time past the 1h default TTL but NOT yet to the 15-min cleanup tick
    // The entry is now expired but not yet removed from the Map
    jest.advanceTimersByTime(60 * 60 * 1000 + 1); // past TTL

    // getActiveConversationIds filters by Date.now() < expiresAt — entry already gone from active view
    expect(service.getActiveConversationIds()).not.toContain('conv-aaa');

    // Now advance past 15min cleanup interval — the callback runs and calls cache.delete
    jest.advanceTimersByTime(15 * 60 * 1000);

    // After cleanup, the entry should be gone from cache (internal Map)
    // Verify by seeing that after invalidation a fresh getOrCompute re-queries DB
    const prisma2 = makePrisma();
    const findFirstMock = jest.fn().mockResolvedValue(null);
    (prisma2.conversation.findFirst as jest.Mock) = findFirstMock;

    await service.getOrCompute(prisma2, 'conv-aaa', () => []);
    expect(findFirstMock).toHaveBeenCalled();
  });

  it('test_cleanup_non_expired_entries_remain_after_15min', async () => {
    const service = freshService();
    const prisma = makePrisma();
    (prisma.conversation.findFirst as jest.Mock).mockResolvedValue({ id: 'conv-bbb', identifier: 'conv-bbb' });

    await service.getOrCompute(prisma, 'conv-bbb', () => []);

    // Advance only 10 min (less than TTL 60 min) then trigger the 15-min cleanup
    jest.advanceTimersByTime(15 * 60 * 1000);

    // Entry should still be active (TTL=1h, only 15min passed)
    expect(service.getActiveConversationIds()).toContain('conv-bbb');
  });
});

// ---------------------------------------------------------------------------
// Line 189: user.findMany rejection in global conversation path
// ---------------------------------------------------------------------------

describe('computeStats — global conversation user.findMany rejection (line 189)', () => {
  it('test_computeStats_meeshy_userFindManyRejects_participantCountZero', async () => {
    const service = freshService();
    const globalConvId = 'aaabbbcccdddeeefffaabbcc';

    const prisma = makePrisma();
    (prisma.conversation.findFirst as jest.Mock).mockResolvedValue({
      id: globalConvId,
      identifier: 'meeshy',
    });
    (prisma.message.groupBy as jest.Mock).mockResolvedValue([]);
    // user.findMany rejects — the .catch(() => []) on line 189 should swallow it
    (prisma.user.findMany as jest.Mock).mockRejectedValue(new Error('DB timeout'));

    const stats = await service.getOrCompute(prisma, 'meeshy', () => []);

    expect(stats.participantCount).toBe(0);
    expect(stats.participantsPerLanguage).toEqual({});
    // onlineUsers: no connected users passed so computeOnlineUsers returns [] early
    expect(stats.onlineUsers).toEqual([]);
  });

  it('test_computeStats_meeshy_userFindManySucceeds_participantsCountCorrectly', async () => {
    const service = freshService();
    const globalConvId = 'aaabbbcccdddeeefffaabbcc';

    const prisma = makePrisma();
    (prisma.conversation.findFirst as jest.Mock).mockResolvedValue({
      id: globalConvId,
      identifier: 'meeshy',
    });
    (prisma.message.groupBy as jest.Mock).mockResolvedValue([
      { originalLanguage: 'fr', _count: { _all: 5 } },
    ]);
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: 'u1', systemLanguage: 'fr' },
      { id: 'u2', systemLanguage: 'en' },
    ]);

    const stats = await service.getOrCompute(prisma, 'meeshy', () => []);

    expect(stats.participantCount).toBe(2);
    expect(stats.participantsPerLanguage).toEqual({ fr: 1, en: 1 });
    expect(stats.messagesPerLanguage).toEqual({ fr: 5 });
  });
});

// ---------------------------------------------------------------------------
// Lines 239-247: computeOnlineUsers with conversationId === "meeshy"
// ---------------------------------------------------------------------------

describe('computeOnlineUsers — meeshy conversationId path (lines 239-247)', () => {
  it('test_computeOnlineUsers_meeshyId_globalConvNotFound_returnsEmptyOnlineUsers', async () => {
    const service = freshService();

    // First populate the "meeshy" cache entry via getOrCompute
    const prisma1 = makePrisma();
    (prisma1.conversation.findFirst as jest.Mock).mockResolvedValue(null);

    // meeshy with no global conv → returns empty stats immediately (no cache set,
    // because empty stats path returns before setting cache)
    // We need to set a cache entry for "meeshy" to trigger the incremental update path.
    // Do this by computing stats with a mock that does find the global conv:
    const globalConvId = 'cccdddeeefffaaabbbcccddd';
    const prismaSetup = makePrisma();
    (prismaSetup.conversation.findFirst as jest.Mock).mockResolvedValue({ id: globalConvId, identifier: 'meeshy' });
    (prismaSetup.message.groupBy as jest.Mock).mockResolvedValue([]);
    (prismaSetup.user.findMany as jest.Mock).mockResolvedValue([]);

    await service.getOrCompute(prismaSetup, 'meeshy', () => []);

    // Now updateOnNewMessage with conversationId "meeshy" triggers computeOnlineUsers("meeshy", ...)
    // but this time the prisma.conversation.findFirst returns null for "meeshy"
    const prismaUpdate = makePrisma();
    (prismaUpdate.conversation.findFirst as jest.Mock).mockResolvedValue(null);
    (prismaUpdate.user.findMany as jest.Mock).mockResolvedValue([]);

    const stats = await service.updateOnNewMessage(prismaUpdate, 'meeshy', 'fr', () => ['user1']);

    // computeOnlineUsers hits "meeshy" branch, finds null global conv → returns []
    expect(stats.onlineUsers).toEqual([]);
  });

  it('test_computeOnlineUsers_meeshyId_globalConvFound_isGlobalConversation_returnsUsers', async () => {
    const service = freshService();
    const globalConvId = 'dddeeefff000111222333444';

    // Setup cache for "meeshy"
    const prismaSetup = makePrisma();
    (prismaSetup.conversation.findFirst as jest.Mock).mockResolvedValue({ id: globalConvId, identifier: 'meeshy' });
    (prismaSetup.message.groupBy as jest.Mock).mockResolvedValue([]);
    (prismaSetup.user.findMany as jest.Mock).mockResolvedValue([{ id: 'u1', systemLanguage: 'fr' }]);

    await service.getOrCompute(prismaSetup, 'meeshy', () => []);

    // Now updateOnNewMessage with "meeshy" as conversationId triggers computeOnlineUsers("meeshy", connectedIds)
    const prismaUpdate = makePrisma();
    (prismaUpdate.conversation.findFirst as jest.Mock).mockResolvedValue({ id: globalConvId, identifier: 'meeshy' });
    (prismaUpdate.user.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'user1',
        username: 'alice',
        firstName: 'Alice',
        lastName: 'Smith',
        avatar: null,
        systemLanguage: 'fr',
        displayName: null,
      },
    ]);

    const stats = await service.updateOnNewMessage(prismaUpdate, 'meeshy', 'fr', () => ['user1']);

    // For global conv (isGlobalConversation=true), all connectedIds are allowedIds → fetches users
    expect(stats.onlineUsers).toHaveLength(1);
    expect(stats.onlineUsers[0].id).toBe('user1');
    expect(stats.onlineUsers[0].username).toBe('alice');
    // null avatar and displayName map to undefined
    expect(stats.onlineUsers[0].avatar).toBeUndefined();
    expect(stats.onlineUsers[0].displayName).toBeUndefined();
    expect(stats.onlineUsers[0].systemLanguage).toBe('fr');
  });

  it('test_computeOnlineUsers_meeshyId_noConnectedUsers_returnsEarlyEmpty', async () => {
    const service = freshService();
    const globalConvId = 'eeefffaaa111222333444555';

    // Setup cache for "meeshy"
    const prismaSetup = makePrisma();
    (prismaSetup.conversation.findFirst as jest.Mock).mockResolvedValue({ id: globalConvId, identifier: 'meeshy' });
    (prismaSetup.message.groupBy as jest.Mock).mockResolvedValue([]);
    (prismaSetup.user.findMany as jest.Mock).mockResolvedValue([]);

    await service.getOrCompute(prismaSetup, 'meeshy', () => []);

    // Update with empty connected users array → computeOnlineUsers returns early (line 230)
    const prismaUpdate = makePrisma();
    const stats = await service.updateOnNewMessage(prismaUpdate, 'meeshy', 'en', () => []);

    expect(stats.onlineUsers).toEqual([]);
    // Should not have queried conversation at all due to early return
    expect((prismaUpdate.conversation.findFirst as jest.Mock)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateOnNewMessage with "meeshy" to exercise computeOnlineUsers meeshy path
// (lines 239-247: the "meeshy" branch inside computeOnlineUsers)
// ---------------------------------------------------------------------------

describe('updateOnNewMessage — meeshy triggers computeOnlineUsers meeshy path directly', () => {
  it('test_updateOnNewMessage_meeshyCached_globalConvFound_returnsOnlineUsers', async () => {
    const service = freshService();
    const globalConvId = 'fff000111222333444555666';

    // Step 1: populate cache for "meeshy" key
    const prismaSetup = makePrisma();
    (prismaSetup.conversation.findFirst as jest.Mock).mockResolvedValue({ id: globalConvId, identifier: 'meeshy' });
    (prismaSetup.message.groupBy as jest.Mock).mockResolvedValue([]);
    (prismaSetup.user.findMany as jest.Mock).mockResolvedValue([{ id: 'u1', systemLanguage: 'fr' }]);
    await service.getOrCompute(prismaSetup, 'meeshy', () => []);

    // Step 2: call updateOnNewMessage with "meeshy" and connected users
    // This calls computeOnlineUsers(prisma, "meeshy", ['u1'])
    // Inside computeOnlineUsers: conversationId === "meeshy" → finds global conv → isGlobalConversation=true
    // → allowedIds = connectedUserIds → fetches users
    const prismaUpdate = makePrisma();
    (prismaUpdate.conversation.findFirst as jest.Mock).mockResolvedValue({ id: globalConvId, identifier: 'meeshy' });
    (prismaUpdate.user.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'u1',
        username: 'alice',
        firstName: 'Alice',
        lastName: 'Test',
        avatar: 'img.jpg',
        systemLanguage: 'fr',
        displayName: 'Alice T',
      },
    ]);

    const stats = await service.updateOnNewMessage(prismaUpdate, 'meeshy', 'fr', () => ['u1']);

    // computeOnlineUsers hit the "meeshy" branch (lines 239-247)
    expect(stats.onlineUsers).toHaveLength(1);
    expect(stats.onlineUsers[0].id).toBe('u1');
    expect(stats.onlineUsers[0].avatar).toBe('img.jpg');
    expect(stats.onlineUsers[0].displayName).toBe('Alice T');
    expect(stats.onlineUsers[0].systemLanguage).toBe('fr');
  });
});
