/**
 * ConversationStatsService Comprehensive Unit Tests
 *
 * This test suite provides thorough coverage of the ConversationStatsService including:
 * - Singleton pattern behavior (getInstance)
 * - Cache management (invalidate, isValid, getActiveConversationIds)
 * - Stats computation (getOrCompute, computeStats)
 * - Incremental updates (updateOnNewMessage)
 * - Force recomputation (recompute)
 * - Online users calculation (computeOnlineUsers)
 * - Global conversation handling (meeshy identifier)
 * - Edge cases and error handling
 *
 * Coverage target: > 65%
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// Mock logger to avoid console noise during tests
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// We need to mock the module before importing to control the singleton
// But first, we'll import the class directly for testing
import { ConversationStatsService, ConversationStats, OnlineUserInfo } from '../../../services/ConversationStatsService';

describe('ConversationStatsService', () => {
  let mockPrisma: any;

  // Sample test data
  const testConversationId = '507f1f77bcf86cd799439011';
  const testUserId1 = '507f1f77bcf86cd799439022';
  const testUserId2 = '507f1f77bcf86cd799439033';
  const testUserId3 = '507f1f77bcf86cd799439044';

  const createMockUser = (id: string, overrides: any = {}): OnlineUserInfo => ({
    id,
    username: `user_${id.slice(-4)}`,
    firstName: 'Test',
    lastName: 'User',
    avatar: undefined,
    systemLanguage: 'en',
    displayName: undefined,
    ...overrides
  });

  const createMockConversation = (id: string, overrides: any = {}) => ({
    id,
    identifier: `conv_${id.slice(-4)}`,
    type: 'private',
    ...overrides
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Create mock Prisma client with all necessary methods
    mockPrisma = {
      conversation: {
        findFirst: jest.fn(),
        findUnique: jest.fn()
      },
      message: {
        groupBy: jest.fn()
      },
      user: {
        findMany: jest.fn()
      },
      conversationMember: {
        findMany: jest.fn()
      }
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // ==============================================
  // SINGLETON PATTERN TESTS
  // ==============================================

  describe('getInstance', () => {
    it('should return a ConversationStatsService instance', () => {
      const instance = ConversationStatsService.getInstance();
      expect(instance).toBeInstanceOf(ConversationStatsService);
    });

    it('should return the same instance on subsequent calls', () => {
      const instance1 = ConversationStatsService.getInstance();
      const instance2 = ConversationStatsService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  // ==============================================
  // CACHE MANAGEMENT TESTS
  // ==============================================

  describe('Cache Management', () => {
    let service: ConversationStatsService;

    beforeEach(() => {
      service = ConversationStatsService.getInstance();
    });

    describe('invalidate', () => {
      it('should remove cached entry for given conversation', async () => {
        // Setup: First compute stats to populate cache
        mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
        mockPrisma.message.groupBy.mockResolvedValue([
          { originalLanguage: 'en', _count: { _all: 5 } }
        ]);
        mockPrisma.conversationMember.findMany.mockResolvedValue([
          { user: { id: testUserId1, systemLanguage: 'en' } }
        ]);
        mockPrisma.user.findMany.mockResolvedValue([]);

        const getConnectedUserIds = () => [];
        await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

        // Clear mocks to verify recomputation happens after invalidation
        mockPrisma.conversation.findFirst.mockClear();
        mockPrisma.message.groupBy.mockClear();

        // Invalidate cache
        service.invalidate(testConversationId);

        // Setup mocks again for recomputation
        mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
        mockPrisma.message.groupBy.mockResolvedValue([
          { originalLanguage: 'fr', _count: { _all: 10 } }
        ]);
        mockPrisma.conversationMember.findMany.mockResolvedValue([
          { user: { id: testUserId1, systemLanguage: 'fr' } }
        ]);
        mockPrisma.user.findMany.mockResolvedValue([]);

        // Next call should recompute
        const newStats = await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

        expect(mockPrisma.conversation.findFirst).toHaveBeenCalled();
        expect(newStats.messagesPerLanguage['fr']).toBe(10);
      });

      it('should not throw when invalidating non-existent cache entry', () => {
        expect(() => service.invalidate('non-existent-id')).not.toThrow();
      });
    });

    describe('getActiveConversationIds', () => {
      it('should return empty array when cache is empty', () => {
        // Invalidate any existing entries
        const existingIds = service.getActiveConversationIds();
        existingIds.forEach(id => service.invalidate(id));

        const activeIds = service.getActiveConversationIds();
        expect(activeIds).toEqual([]);
      });

      it('should return conversation IDs with valid cache entries', async () => {
        mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
        mockPrisma.message.groupBy.mockResolvedValue([]);
        mockPrisma.conversationMember.findMany.mockResolvedValue([]);
        mockPrisma.user.findMany.mockResolvedValue([]);

        const getConnectedUserIds = () => [];
        await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

        const activeIds = service.getActiveConversationIds();
        expect(activeIds).toContain(testConversationId);
      });

      it('should not return expired cache entries', async () => {
        mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
        mockPrisma.message.groupBy.mockResolvedValue([]);
        mockPrisma.conversationMember.findMany.mockResolvedValue([]);
        mockPrisma.user.findMany.mockResolvedValue([]);

        const getConnectedUserIds = () => [];
        await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

        // Advance time beyond TTL (1 hour default)
        jest.advanceTimersByTime(60 * 60 * 1000 + 1000);

        const activeIds = service.getActiveConversationIds();
        expect(activeIds).not.toContain(testConversationId);
      });
    });
  });

  // ==============================================
  // getOrCompute TESTS
  // ==============================================

  describe('getOrCompute', () => {
    let service: ConversationStatsService;

    beforeEach(() => {
      service = ConversationStatsService.getInstance();
      // Clear cache before each test
      const existingIds = service.getActiveConversationIds();
      existingIds.forEach(id => service.invalidate(id));
    });

    it('should compute stats when cache is empty', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([
        { originalLanguage: 'en', _count: { _all: 10 } },
        { originalLanguage: 'fr', _count: { _all: 5 } }
      ]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([
        { user: { id: testUserId1, systemLanguage: 'en' } },
        { user: { id: testUserId2, systemLanguage: 'fr' } }
      ]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [];
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      expect(stats).toBeDefined();
      expect(stats.messagesPerLanguage).toEqual({ en: 10, fr: 5 });
      expect(stats.participantCount).toBe(2);
      expect(stats.participantsPerLanguage).toEqual({ en: 1, fr: 1 });
      expect(stats.onlineUsers).toEqual([]);
      expect(stats.updatedAt).toBeInstanceOf(Date);
    });

    it('should return cached stats when cache is valid', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([
        { originalLanguage: 'en', _count: { _all: 10 } }
      ]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([
        { user: { id: testUserId1, systemLanguage: 'en' } }
      ]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [];

      // First call - computes
      const stats1 = await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      // Clear mock to verify second call uses cache
      mockPrisma.conversation.findFirst.mockClear();
      mockPrisma.message.groupBy.mockClear();

      // Second call - should use cache
      const stats2 = await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      expect(mockPrisma.conversation.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.message.groupBy).not.toHaveBeenCalled();
      expect(stats1).toEqual(stats2);
    });

    it('should recompute stats when cache is expired', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([
        { originalLanguage: 'en', _count: { _all: 10 } }
      ]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([
        { user: { id: testUserId1, systemLanguage: 'en' } }
      ]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [];

      // First call
      await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      // Advance time beyond TTL
      jest.advanceTimersByTime(60 * 60 * 1000 + 1000);

      // Update mock to return different data
      mockPrisma.message.groupBy.mockResolvedValue([
        { originalLanguage: 'es', _count: { _all: 20 } }
      ]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([
        { user: { id: testUserId1, systemLanguage: 'es' } }
      ]);

      // Second call - should recompute
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      expect(stats.messagesPerLanguage).toEqual({ es: 20 });
    });

    it('should return empty stats when conversation not found', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      const getConnectedUserIds = () => [];
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, 'non-existent-id', getConnectedUserIds);

      expect(stats.messagesPerLanguage).toEqual({});
      expect(stats.participantCount).toBe(0);
      expect(stats.participantsPerLanguage).toEqual({});
      expect(stats.onlineUsers).toEqual([]);
    });

    it('should include online users in stats', async () => {
      const connectedUsers = [testUserId1, testUserId2];

      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([
        { user: { id: testUserId1, systemLanguage: 'en' }, userId: testUserId1 },
        { user: { id: testUserId2, systemLanguage: 'fr' }, userId: testUserId2 }
      ]);
      mockPrisma.user.findMany.mockResolvedValue([
        createMockUser(testUserId1, { username: 'user1', systemLanguage: 'en' }),
        createMockUser(testUserId2, { username: 'user2', systemLanguage: 'fr' })
      ]);

      const getConnectedUserIds = () => connectedUsers;
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      expect(stats.onlineUsers.length).toBe(2);
      expect(stats.onlineUsers.map(u => u.id)).toEqual(expect.arrayContaining([testUserId1, testUserId2]));
    });
  });

  // ==============================================
  // updateOnNewMessage TESTS
  // ==============================================

  describe('updateOnNewMessage', () => {
    let service: ConversationStatsService;

    beforeEach(() => {
      service = ConversationStatsService.getInstance();
      // Clear cache
      const existingIds = service.getActiveConversationIds();
      existingIds.forEach(id => service.invalidate(id));
    });

    it('should increment message count for language when cache exists', async () => {
      // First, populate cache
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([
        { originalLanguage: 'en', _count: { _all: 10 } }
      ]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([
        { user: { id: testUserId1, systemLanguage: 'en' }, userId: testUserId1 }
      ]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [];
      await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      // Now update with new message
      const stats = await service.updateOnNewMessage(
        mockPrisma as PrismaClient,
        testConversationId,
        'en',
        getConnectedUserIds
      );

      expect(stats.messagesPerLanguage['en']).toBe(11);
    });

    it('should add new language when message is in new language', async () => {
      // First, populate cache
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([
        { originalLanguage: 'en', _count: { _all: 10 } }
      ]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([
        { user: { id: testUserId1, systemLanguage: 'en' }, userId: testUserId1 }
      ]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [];
      await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      // Now update with new message in French
      const stats = await service.updateOnNewMessage(
        mockPrisma as PrismaClient,
        testConversationId,
        'fr',
        getConnectedUserIds
      );

      expect(stats.messagesPerLanguage['en']).toBe(10);
      expect(stats.messagesPerLanguage['fr']).toBe(1);
    });

    it('should recompute when cache is expired', async () => {
      // First, populate cache
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([
        { originalLanguage: 'en', _count: { _all: 10 } }
      ]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([
        { user: { id: testUserId1, systemLanguage: 'en' }, userId: testUserId1 }
      ]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [];
      await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      // Expire the cache
      jest.advanceTimersByTime(60 * 60 * 1000 + 1000);

      // Setup new mock values for recomputation
      mockPrisma.message.groupBy.mockResolvedValue([
        { originalLanguage: 'en', _count: { _all: 50 } }
      ]);

      // Update should trigger full recompute
      const stats = await service.updateOnNewMessage(
        mockPrisma as PrismaClient,
        testConversationId,
        'en',
        getConnectedUserIds
      );

      // Should have recomputed (50) + 1 = 51? No, it recomputes fully first
      // Actually when cache is invalid, it calls getOrCompute which returns new stats
      expect(stats.messagesPerLanguage['en']).toBe(50);
    });

    it('should refresh online users on update', async () => {
      // First, populate cache with no online users
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([
        { originalLanguage: 'en', _count: { _all: 10 } }
      ]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([
        { user: { id: testUserId1, systemLanguage: 'en' }, userId: testUserId1 }
      ]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, () => []);

      // Now update with connected user
      mockPrisma.user.findMany.mockResolvedValue([
        createMockUser(testUserId1)
      ]);

      const stats = await service.updateOnNewMessage(
        mockPrisma as PrismaClient,
        testConversationId,
        'en',
        () => [testUserId1]
      );

      expect(stats.onlineUsers.length).toBe(1);
      expect(stats.onlineUsers[0].id).toBe(testUserId1);
    });

    it('should update updatedAt timestamp', async () => {
      // Populate cache
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([
        { user: { id: testUserId1, systemLanguage: 'en' }, userId: testUserId1 }
      ]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [];
      const stats1 = await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);
      const originalUpdatedAt = stats1.updatedAt;

      // Advance time slightly
      jest.advanceTimersByTime(1000);

      const stats2 = await service.updateOnNewMessage(
        mockPrisma as PrismaClient,
        testConversationId,
        'en',
        getConnectedUserIds
      );

      expect(stats2.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  // ==============================================
  // recompute TESTS
  // ==============================================

  describe('recompute', () => {
    let service: ConversationStatsService;

    beforeEach(() => {
      service = ConversationStatsService.getInstance();
      // Clear cache
      const existingIds = service.getActiveConversationIds();
      existingIds.forEach(id => service.invalidate(id));
    });

    it('should force recompute stats even when cache is valid', async () => {
      // Populate cache
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([
        { originalLanguage: 'en', _count: { _all: 10 } }
      ]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([
        { user: { id: testUserId1, systemLanguage: 'en' } }
      ]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [];
      await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      // Update mocks for recompute
      mockPrisma.message.groupBy.mockResolvedValue([
        { originalLanguage: 'en', _count: { _all: 100 } }
      ]);

      // Force recompute
      const stats = await service.recompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      expect(stats.messagesPerLanguage['en']).toBe(100);
    });

    it('should update cache with new stats', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([
        { originalLanguage: 'de', _count: { _all: 25 } }
      ]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([
        { user: { id: testUserId1, systemLanguage: 'de' } }
      ]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [];
      await service.recompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      // Clear mocks
      mockPrisma.conversation.findFirst.mockClear();
      mockPrisma.message.groupBy.mockClear();

      // Next getOrCompute should use cache
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      expect(mockPrisma.conversation.findFirst).not.toHaveBeenCalled();
      expect(stats.messagesPerLanguage['de']).toBe(25);
    });
  });

  // ==============================================
  // GLOBAL CONVERSATION (meeshy) TESTS
  // ==============================================

  describe('Global Conversation Handling', () => {
    let service: ConversationStatsService;

    beforeEach(() => {
      service = ConversationStatsService.getInstance();
      // Clear cache
      const existingIds = service.getActiveConversationIds();
      existingIds.forEach(id => service.invalidate(id));
    });

    it('should resolve meeshy identifier to actual conversation ID', async () => {
      const globalConvId = '507f1f77bcf86cd799439099';

      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: globalConvId,
        identifier: 'meeshy'
      });
      mockPrisma.message.groupBy.mockResolvedValue([
        { originalLanguage: 'en', _count: { _all: 100 } },
        { originalLanguage: 'fr', _count: { _all: 50 } }
      ]);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: testUserId1, systemLanguage: 'en' },
        { id: testUserId2, systemLanguage: 'fr' }
      ]);

      const getConnectedUserIds = () => [];
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, 'meeshy', getConnectedUserIds);

      expect(stats.messagesPerLanguage).toEqual({ en: 100, fr: 50 });
      // For global conversation, participantCount = all active users
      expect(stats.participantCount).toBe(2);
    });

    it('should return empty stats when meeshy conversation not found', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      const getConnectedUserIds = () => [];
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, 'meeshy', getConnectedUserIds);

      expect(stats.messagesPerLanguage).toEqual({});
      expect(stats.participantCount).toBe(0);
      expect(stats.onlineUsers).toEqual([]);
    });

    it('should use all active users for global conversation participants', async () => {
      const globalConvId = '507f1f77bcf86cd799439099';

      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: globalConvId,
        identifier: 'meeshy'
      });
      mockPrisma.message.groupBy.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: testUserId1, systemLanguage: 'en' },
        { id: testUserId2, systemLanguage: 'fr' },
        { id: testUserId3, systemLanguage: 'en' }
      ]);

      const getConnectedUserIds = () => [];
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, 'meeshy', getConnectedUserIds);

      expect(stats.participantCount).toBe(3);
      expect(stats.participantsPerLanguage).toEqual({ en: 2, fr: 1 });
    });
  });

  // ==============================================
  // computeOnlineUsers TESTS (via public methods)
  // ==============================================

  describe('Online Users Computation', () => {
    let service: ConversationStatsService;

    beforeEach(() => {
      service = ConversationStatsService.getInstance();
      // Clear cache
      const existingIds = service.getActiveConversationIds();
      existingIds.forEach(id => service.invalidate(id));
    });

    it('should return empty array when no connected users', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([
        { user: { id: testUserId1, systemLanguage: 'en' } }
      ]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [];
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      expect(stats.onlineUsers).toEqual([]);
    });

    it('should filter online users to conversation members only', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([]);
      // Only testUserId1 is a member
      mockPrisma.conversationMember.findMany.mockResolvedValue([
        { user: { id: testUserId1, systemLanguage: 'en' }, userId: testUserId1 }
      ]);
      mockPrisma.user.findMany.mockResolvedValue([
        createMockUser(testUserId1)
      ]);

      // Both users are connected, but only testUserId1 is a member
      const getConnectedUserIds = () => [testUserId1, testUserId2];
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      expect(stats.onlineUsers.length).toBe(1);
      expect(stats.onlineUsers[0].id).toBe(testUserId1);
    });

    it('should include user details in online users', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([
        { user: { id: testUserId1, systemLanguage: 'en' }, userId: testUserId1 }
      ]);
      mockPrisma.user.findMany.mockResolvedValue([{
        id: testUserId1,
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        avatar: 'https://example.com/avatar.jpg',
        systemLanguage: 'en',
        displayName: 'TestDisplay'
      }]);

      const getConnectedUserIds = () => [testUserId1];
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      expect(stats.onlineUsers.length).toBe(1);
      expect(stats.onlineUsers[0]).toEqual({
        id: testUserId1,
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        avatar: 'https://example.com/avatar.jpg',
        systemLanguage: 'en',
        displayName: 'TestDisplay'
      });
    });

    it('should handle null avatar and displayName', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([
        { user: { id: testUserId1, systemLanguage: 'en' }, userId: testUserId1 }
      ]);
      mockPrisma.user.findMany.mockResolvedValue([{
        id: testUserId1,
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        avatar: null,
        systemLanguage: null,
        displayName: null
      }]);

      const getConnectedUserIds = () => [testUserId1];
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      expect(stats.onlineUsers[0].avatar).toBeUndefined();
      expect(stats.onlineUsers[0].displayName).toBeUndefined();
      expect(stats.onlineUsers[0].systemLanguage).toBe('fr'); // Default fallback
    });

    it('should return empty online users when conversation not found for meeshy', async () => {
      // When meeshy identifier is used but global conversation doesn't exist
      mockPrisma.conversation.findFirst.mockResolvedValue(null);
      mockPrisma.message.groupBy.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [testUserId1, testUserId2];
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, 'meeshy', getConnectedUserIds);

      expect(stats.onlineUsers).toEqual([]);
    });

    it('should return empty online users when normal conversation not found', async () => {
      // First call for computeStats finds the conversation
      // But computeOnlineUsers needs its own conversation lookup
      mockPrisma.conversation.findFirst
        .mockResolvedValueOnce(createMockConversation(testConversationId)) // for computeStats
        .mockResolvedValueOnce(null); // for computeOnlineUsers - conversation not found
      mockPrisma.message.groupBy.mockResolvedValue([]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [testUserId1];
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      expect(stats.onlineUsers).toEqual([]);
    });

    it('should return empty when no conversation members are connected', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([]);
      // Member lookup returns empty (no connected members are in the conversation)
      mockPrisma.conversationMember.findMany
        .mockResolvedValueOnce([{ user: { id: testUserId1, systemLanguage: 'en' } }]) // for participants count
        .mockResolvedValueOnce([]); // for online users - no matching members
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [testUserId3]; // User not a member
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      expect(stats.onlineUsers).toEqual([]);
    });

    it('should handle global conversation online users lookup with member intersection', async () => {
      const globalConvId = '507f1f77bcf86cd799439099';

      // Mock needs to handle findFirst calls for both identifier and id lookups
      mockPrisma.conversation.findFirst.mockImplementation((args: any) => {
        if (args.where?.identifier === 'meeshy') {
          return Promise.resolve({ id: globalConvId, identifier: 'meeshy' });
        }
        if (args.where?.id === globalConvId) {
          return Promise.resolve({ id: globalConvId, identifier: 'meeshy' });
        }
        return Promise.resolve(null);
      });
      mockPrisma.message.groupBy.mockResolvedValue([]);
      // For participant count in global conversation
      mockPrisma.user.findMany.mockResolvedValue([
        createMockUser(testUserId1),
        createMockUser(testUserId2)
      ]);
      // computeOnlineUsers will check members since the conversationId passed is the real ID
      // not "meeshy", so it goes through the member check path
      mockPrisma.conversationMember.findMany.mockResolvedValue([
        { userId: testUserId1 },
        { userId: testUserId2 }
      ]);

      const getConnectedUserIds = () => [testUserId1, testUserId2];
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, 'meeshy', getConnectedUserIds);

      // Since the code passes realConversationId to computeOnlineUsers,
      // it will go through member check path and find both users
      expect(stats.onlineUsers.length).toBe(2);
    });
  });

  // ==============================================
  // ERROR HANDLING TESTS
  // ==============================================

  describe('Error Handling', () => {
    let service: ConversationStatsService;

    beforeEach(() => {
      service = ConversationStatsService.getInstance();
      // Clear cache
      const existingIds = service.getActiveConversationIds();
      existingIds.forEach(id => service.invalidate(id));
    });

    it('should handle message.groupBy errors gracefully', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockRejectedValue(new Error('Database error'));
      mockPrisma.conversationMember.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [];
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      // Should return empty messagesPerLanguage due to catch
      expect(stats.messagesPerLanguage).toEqual({});
    });

    it('should handle conversationMember.findMany errors gracefully', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([]);
      mockPrisma.conversationMember.findMany.mockRejectedValue(new Error('Database error'));
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [];
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      // Should return 0 participants due to catch
      expect(stats.participantCount).toBe(0);
    });

    it('should handle user.findMany errors gracefully for online users', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([
        { user: { id: testUserId1, systemLanguage: 'en' }, userId: testUserId1 }
      ]);
      mockPrisma.user.findMany.mockRejectedValue(new Error('Database error'));

      const getConnectedUserIds = () => [testUserId1];
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      // Should return empty onlineUsers due to catch
      expect(stats.onlineUsers).toEqual([]);
    });

    it('should handle conversationMember.findMany errors gracefully in computeOnlineUsers', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([]);
      // First call for participant count succeeds
      mockPrisma.conversationMember.findMany
        .mockResolvedValueOnce([{ user: { id: testUserId1, systemLanguage: 'en' } }])
        // Second call in computeOnlineUsers fails
        .mockRejectedValueOnce(new Error('Database error'));
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [testUserId1];
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      // Should return empty onlineUsers due to catch in computeOnlineUsers
      expect(stats.onlineUsers).toEqual([]);
    });
  });

  // ==============================================
  // EDGE CASES
  // ==============================================

  describe('Edge Cases', () => {
    let service: ConversationStatsService;

    beforeEach(() => {
      service = ConversationStatsService.getInstance();
      // Clear cache
      const existingIds = service.getActiveConversationIds();
      existingIds.forEach(id => service.invalidate(id));
    });

    it('should handle conversation with no messages', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([
        { user: { id: testUserId1, systemLanguage: 'en' } }
      ]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [];
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      expect(stats.messagesPerLanguage).toEqual({});
      expect(stats.participantCount).toBe(1);
    });

    it('should handle conversation with no members', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([
        { originalLanguage: 'en', _count: { _all: 5 } }
      ]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [];
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      expect(stats.participantCount).toBe(0);
      expect(stats.participantsPerLanguage).toEqual({});
    });

    it('should handle multiple languages in messages', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([
        { originalLanguage: 'en', _count: { _all: 100 } },
        { originalLanguage: 'fr', _count: { _all: 50 } },
        { originalLanguage: 'es', _count: { _all: 25 } },
        { originalLanguage: 'de', _count: { _all: 10 } },
        { originalLanguage: 'ja', _count: { _all: 5 } }
      ]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [];
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      expect(stats.messagesPerLanguage).toEqual({
        en: 100,
        fr: 50,
        es: 25,
        de: 10,
        ja: 5
      });
    });

    it('should handle same user language for multiple participants', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([
        { user: { id: testUserId1, systemLanguage: 'en' } },
        { user: { id: testUserId2, systemLanguage: 'en' } },
        { user: { id: testUserId3, systemLanguage: 'en' } }
      ]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [];
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      expect(stats.participantCount).toBe(3);
      expect(stats.participantsPerLanguage).toEqual({ en: 3 });
    });

    it('should handle conversation lookup by direct ID', async () => {
      // When ID looks like ObjectId, it should try findUnique first (based on code logic)
      mockPrisma.conversation.findFirst.mockResolvedValue(null);
      mockPrisma.conversation.findUnique.mockResolvedValue(null);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [];
      const stats = await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      // Should return empty stats since conversation not found
      expect(stats.participantCount).toBe(0);
    });
  });

  // ==============================================
  // CACHE TTL BOUNDARY TESTS
  // ==============================================

  describe('Cache TTL Boundaries', () => {
    let service: ConversationStatsService;

    beforeEach(() => {
      service = ConversationStatsService.getInstance();
      // Clear cache
      const existingIds = service.getActiveConversationIds();
      existingIds.forEach(id => service.invalidate(id));
    });

    it('should use cache when just under TTL', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([
        { originalLanguage: 'en', _count: { _all: 10 } }
      ]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [];
      await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      // Advance time to just under TTL (1 hour - 1 second)
      jest.advanceTimersByTime(60 * 60 * 1000 - 1000);

      mockPrisma.conversation.findFirst.mockClear();

      await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      // Should use cache
      expect(mockPrisma.conversation.findFirst).not.toHaveBeenCalled();
    });

    it('should recompute when exactly at TTL', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([
        { originalLanguage: 'en', _count: { _all: 10 } }
      ]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [];
      await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      // Advance time to exactly TTL
      jest.advanceTimersByTime(60 * 60 * 1000);

      mockPrisma.conversation.findFirst.mockClear();
      mockPrisma.message.groupBy.mockClear();

      await service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds);

      // Should recompute
      expect(mockPrisma.conversation.findFirst).toHaveBeenCalled();
    });
  });

  // ==============================================
  // CONCURRENT ACCESS TESTS
  // ==============================================

  describe('Concurrent Access', () => {
    let service: ConversationStatsService;

    beforeEach(() => {
      service = ConversationStatsService.getInstance();
      // Clear cache
      const existingIds = service.getActiveConversationIds();
      existingIds.forEach(id => service.invalidate(id));
    });

    it('should handle multiple simultaneous getOrCompute calls', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(createMockConversation(testConversationId));
      mockPrisma.message.groupBy.mockResolvedValue([
        { originalLanguage: 'en', _count: { _all: 10 } }
      ]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [];

      // Make multiple concurrent calls
      const promises = [
        service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds),
        service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds),
        service.getOrCompute(mockPrisma as PrismaClient, testConversationId, getConnectedUserIds)
      ];

      const results = await Promise.all(promises);

      // All should return valid stats
      results.forEach(stats => {
        expect(stats.messagesPerLanguage).toEqual({ en: 10 });
      });
    });

    it('should handle multiple different conversations concurrently', async () => {
      const conv1 = '507f1f77bcf86cd799439001';
      const conv2 = '507f1f77bcf86cd799439002';

      mockPrisma.conversation.findFirst.mockImplementation((args: any) => {
        if (args.where?.id === conv1) {
          return Promise.resolve({ id: conv1, identifier: 'conv1' });
        }
        if (args.where?.id === conv2) {
          return Promise.resolve({ id: conv2, identifier: 'conv2' });
        }
        return Promise.resolve(null);
      });

      mockPrisma.message.groupBy.mockResolvedValue([]);
      mockPrisma.conversationMember.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const getConnectedUserIds = () => [];

      const [stats1, stats2] = await Promise.all([
        service.getOrCompute(mockPrisma as PrismaClient, conv1, getConnectedUserIds),
        service.getOrCompute(mockPrisma as PrismaClient, conv2, getConnectedUserIds)
      ]);

      expect(stats1).toBeDefined();
      expect(stats2).toBeDefined();

      const activeIds = service.getActiveConversationIds();
      expect(activeIds).toContain(conv1);
      expect(activeIds).toContain(conv2);
    });
  });
});

// ==============================================
// EXPORTED SINGLETON TESTS
// ==============================================

describe('conversationStatsService (exported singleton)', () => {
  it('should be exported and be an instance of ConversationStatsService', async () => {
    // Import the exported singleton
    const { conversationStatsService } = await import('../../../services/ConversationStatsService');
    expect(conversationStatsService).toBeDefined();
    expect(conversationStatsService).toBeInstanceOf(ConversationStatsService);
  });

  it('should be the same instance as getInstance()', async () => {
    const { conversationStatsService } = await import('../../../services/ConversationStatsService');
    const instance = ConversationStatsService.getInstance();
    expect(conversationStatsService).toBe(instance);
  });
});
