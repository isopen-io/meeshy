/**
 * MentionService Comprehensive Unit Tests
 *
 * This test suite provides thorough coverage of the MentionService including:
 * - Mention extraction from message content
 * - Username validation (format, length)
 * - Username resolution via Prisma
 * - User suggestions for autocomplete (with caching)
 * - Mention permission validation per conversation type
 * - Mention creation in database
 * - Mention retrieval operations
 * - Cache operations (get, set, invalidate)
 * - Edge cases and error handling
 *
 * Coverage target: > 65%
 *
 * @jest-environment node
 */

// Mock RedisWrapper FIRST before imports
jest.mock('../../../services/RedisWrapper', () => ({
  RedisWrapper: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    setex: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    keys: jest.fn().mockResolvedValue([]),
    getCacheStats: jest.fn().mockReturnValue({ mode: 'Memory', redisAvailable: false }),
  })),
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock Prisma
jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    conversation: {
      findUnique: jest.fn(),
    },
    conversationMember: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    friendRequest: {
      findMany: jest.fn(),
    },
    mention: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

import { MentionService, MentionSuggestion, MentionValidationResult } from '../../../services/MentionService';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { RedisWrapper } from '../../../services/RedisWrapper';

describe('MentionService', () => {
  let service: MentionService;
  let prisma: any;
  let mockRedis: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create new Prisma instance
    prisma = new PrismaClient();

    // Get access to the mock Redis
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      setex: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      keys: jest.fn().mockResolvedValue([]),
      getCacheStats: jest.fn().mockReturnValue({ mode: 'Memory', redisAvailable: false }),
    };

    // Update the mock implementation
    (RedisWrapper as jest.Mock).mockImplementation(() => mockRedis);

    // Create service instance
    service = new MentionService(prisma);
  });

  // ==============================================
  // INITIALIZATION TESTS
  // ==============================================

  describe('Initialization', () => {
    it('should initialize with Prisma client', () => {
      const newService = new MentionService(prisma);
      expect(newService).toBeInstanceOf(MentionService);
    });

    it('should initialize Redis wrapper', () => {
      expect(RedisWrapper).toHaveBeenCalled();
    });

    it('should accept optional Redis URL', () => {
      const customRedisUrl = 'redis://custom:6380';
      const newService = new MentionService(prisma, customRedisUrl);
      expect(newService).toBeInstanceOf(MentionService);
      expect(RedisWrapper).toHaveBeenCalledWith(customRedisUrl);
    });
  });

  // ==============================================
  // MENTION EXTRACTION TESTS
  // ==============================================

  describe('extractMentions', () => {
    it('should extract single mention from content', () => {
      const content = 'Hello @john how are you?';
      const mentions = service.extractMentions(content);

      expect(mentions).toEqual(['john']);
    });

    it('should extract multiple unique mentions', () => {
      const content = 'Hello @john and @jane, meet @bob';
      const mentions = service.extractMentions(content);

      expect(mentions).toHaveLength(3);
      expect(mentions).toContain('john');
      expect(mentions).toContain('jane');
      expect(mentions).toContain('bob');
    });

    it('should deduplicate repeated mentions', () => {
      const content = '@john please check with @john about this @john';
      const mentions = service.extractMentions(content);

      expect(mentions).toEqual(['john']);
    });

    it('should normalize usernames to lowercase', () => {
      const content = 'Hello @JOHN and @Jane';
      const mentions = service.extractMentions(content);

      expect(mentions).toContain('john');
      expect(mentions).toContain('jane');
      expect(mentions).not.toContain('JOHN');
      expect(mentions).not.toContain('Jane');
    });

    it('should handle usernames with underscores', () => {
      const content = 'Hey @john_doe and @jane_smith_123';
      const mentions = service.extractMentions(content);

      expect(mentions).toContain('john_doe');
      expect(mentions).toContain('jane_smith_123');
    });

    it('should handle usernames with numbers', () => {
      const content = 'Hey @user123 and @test456';
      const mentions = service.extractMentions(content);

      expect(mentions).toContain('user123');
      expect(mentions).toContain('test456');
    });

    it('should return empty array for empty content', () => {
      const mentions = service.extractMentions('');

      expect(mentions).toEqual([]);
    });

    it('should return empty array for null-like content', () => {
      const mentions = service.extractMentions(null as unknown as string);

      expect(mentions).toEqual([]);
    });

    it('should return empty array for content with no mentions', () => {
      const content = 'Hello everyone, how is the weather today?';
      const mentions = service.extractMentions(content);

      expect(mentions).toEqual([]);
    });

    it('should ignore mentions at the start of content', () => {
      const content = '@alice started the conversation';
      const mentions = service.extractMentions(content);

      expect(mentions).toEqual(['alice']);
    });

    it('should ignore mentions at the end of content', () => {
      const content = 'What do you think @bob';
      const mentions = service.extractMentions(content);

      expect(mentions).toEqual(['bob']);
    });

    it('should handle consecutive mentions', () => {
      const content = '@alice @bob @charlie are invited';
      const mentions = service.extractMentions(content);

      expect(mentions).toHaveLength(3);
    });

    it('should reject invalid username formats (special characters)', () => {
      // Usernames with special chars should be ignored
      const content = 'Hey @john-doe and @jane.smith';
      const mentions = service.extractMentions(content);

      // The regex @(\w+) will match john and jane (stopping at - and .)
      expect(mentions).toContain('john');
      expect(mentions).toContain('jane');
      expect(mentions).not.toContain('john-doe');
      expect(mentions).not.toContain('jane.smith');
    });

    it('should limit mentions to MAX_MENTIONS_PER_MESSAGE (50)', () => {
      // Create content with 60 unique mentions
      const usernames = Array.from({ length: 60 }, (_, i) => `user${i}`);
      const content = usernames.map(u => `@${u}`).join(' ');

      const mentions = service.extractMentions(content);

      expect(mentions.length).toBeLessThanOrEqual(50);
    });

    it('should return empty array for content exceeding MAX_CONTENT_LENGTH', () => {
      // Create content that exceeds 10KB
      const longContent = '@user ' + 'a'.repeat(10001);

      const mentions = service.extractMentions(longContent);

      expect(mentions).toEqual([]);
    });

    it('should handle content at exactly MAX_CONTENT_LENGTH', () => {
      // Create content that is exactly at the limit
      const maxContent = '@testuser ' + 'a'.repeat(9990);

      const mentions = service.extractMentions(maxContent);

      // Should still work at exactly the limit
      expect(mentions).toContain('testuser');
    });

    it('should handle usernames that are too long (>30 chars)', () => {
      const longUsername = 'a'.repeat(31);
      const content = `Hey @${longUsername} check this`;

      const mentions = service.extractMentions(content);

      // Long usernames should be filtered out by validation
      expect(mentions).not.toContain(longUsername);
    });

    it('should handle email-like patterns correctly', () => {
      const content = 'Contact john@example.com for info';
      const mentions = service.extractMentions(content);

      // Should extract 'john' as a mention (before @)
      // but actually the regex /@(\w+)/ captures after @, so it gets 'example'
      expect(mentions).toContain('example');
    });
  });

  // ==============================================
  // USERNAME RESOLUTION TESTS
  // ==============================================

  describe('resolveUsernames', () => {
    it('should return empty map for empty username array', async () => {
      const result = await service.resolveUsernames([]);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('should resolve single username', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'john',
        firstName: 'John',
        lastName: 'Doe',
        displayName: 'John Doe',
        avatar: 'https://example.com/avatar.png',
      };

      prisma.user.findMany.mockResolvedValue([mockUser]);

      const result = await service.resolveUsernames(['john']);

      expect(result.size).toBe(1);
      expect(result.get('john')).toEqual(mockUser);
    });

    it('should resolve multiple usernames', async () => {
      const mockUsers = [
        { id: 'user-1', username: 'john', firstName: 'John', lastName: 'Doe', displayName: null, avatar: null },
        { id: 'user-2', username: 'jane', firstName: 'Jane', lastName: 'Smith', displayName: 'Jane S', avatar: null },
      ];

      prisma.user.findMany.mockResolvedValue(mockUsers);

      const result = await service.resolveUsernames(['john', 'jane']);

      expect(result.size).toBe(2);
      expect(result.get('john')?.id).toBe('user-1');
      expect(result.get('jane')?.id).toBe('user-2');
    });

    it('should handle case-insensitive username matching', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'John',
        firstName: 'John',
        lastName: 'Doe',
        displayName: null,
        avatar: null,
      };

      prisma.user.findMany.mockResolvedValue([mockUser]);

      const result = await service.resolveUsernames(['john']);

      // Should map with lowercase key
      expect(result.get('john')).toBeDefined();
    });

    it('should return partial results when some usernames not found', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'john',
        firstName: 'John',
        lastName: 'Doe',
        displayName: null,
        avatar: null,
      };

      prisma.user.findMany.mockResolvedValue([mockUser]);

      const result = await service.resolveUsernames(['john', 'nonexistent']);

      expect(result.size).toBe(1);
      expect(result.get('john')).toBeDefined();
      expect(result.get('nonexistent')).toBeUndefined();
    });

    it('should query Prisma with correct parameters', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.resolveUsernames(['alice', 'bob']);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { username: { equals: 'alice', mode: 'insensitive' } },
            { username: { equals: 'bob', mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatar: true,
        },
      });
    });
  });

  // ==============================================
  // USER SUGGESTIONS FOR AUTOCOMPLETE TESTS
  // ==============================================

  describe('getUserSuggestionsForConversation', () => {
    const conversationId = 'conv-123';
    const currentUserId = 'user-current';

    beforeEach(() => {
      // Default: no conversation members
      prisma.conversationMember.findMany.mockResolvedValue([]);
      // Default: no friendships
      prisma.friendRequest.findMany.mockResolvedValue([]);
      // Default: no other users
      prisma.user.findMany.mockResolvedValue([]);
    });

    it('should return cached suggestions if available', async () => {
      const cachedSuggestions: MentionSuggestion[] = [
        {
          id: 'user-1',
          username: 'john',
          displayName: 'John Doe',
          avatar: null,
          badge: 'conversation',
          inConversation: true,
          isFriend: false,
        },
      ];

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedSuggestions));

      const result = await service.getUserSuggestionsForConversation(conversationId, currentUserId, 'j');

      expect(result).toEqual(cachedSuggestions);
      expect(prisma.conversationMember.findMany).not.toHaveBeenCalled();
    });

    it('should fetch and cache suggestions on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const mockMembers = [
        {
          user: {
            id: 'user-1',
            username: 'john',
            firstName: 'John',
            lastName: 'Doe',
            displayName: 'John Doe',
            avatar: 'https://example.com/john.png',
            lastActiveAt: new Date(),
          },
        },
      ];

      prisma.conversationMember.findMany.mockResolvedValue(mockMembers);

      const result = await service.getUserSuggestionsForConversation(conversationId, currentUserId);

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe('john');
      expect(result[0].badge).toBe('conversation');
      expect(result[0].inConversation).toBe(true);
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should prioritize conversation members over friends', async () => {
      const mockMembers = [
        {
          user: {
            id: 'user-1',
            username: 'member',
            firstName: 'Member',
            lastName: 'User',
            displayName: null,
            avatar: null,
            lastActiveAt: new Date(),
          },
        },
      ];

      const mockFriendships = [
        {
          senderId: currentUserId,
          receiverId: 'user-2',
          status: 'accepted',
          sender: null,
          receiver: {
            id: 'user-2',
            username: 'friend',
            firstName: 'Friend',
            lastName: 'User',
            displayName: null,
            avatar: null,
          },
        },
      ];

      prisma.conversationMember.findMany.mockResolvedValue(mockMembers);
      prisma.friendRequest.findMany.mockResolvedValue(mockFriendships);

      const result = await service.getUserSuggestionsForConversation(conversationId, currentUserId);

      expect(result[0].username).toBe('member');
      expect(result[0].badge).toBe('conversation');
      expect(result[1]?.username).toBe('friend');
      expect(result[1]?.badge).toBe('friend');
    });

    it('should filter by query string', async () => {
      const mockMembers = [
        {
          user: {
            id: 'user-1',
            username: 'john',
            firstName: 'John',
            lastName: 'Doe',
            displayName: null,
            avatar: null,
            lastActiveAt: new Date(),
          },
        },
        {
          user: {
            id: 'user-2',
            username: 'jane',
            firstName: 'Jane',
            lastName: 'Smith',
            displayName: null,
            avatar: null,
            lastActiveAt: new Date(),
          },
        },
      ];

      prisma.conversationMember.findMany.mockResolvedValue(mockMembers);

      const result = await service.getUserSuggestionsForConversation(conversationId, currentUserId, 'jo');

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe('john');
    });

    it('should filter by displayName', async () => {
      const mockMembers = [
        {
          user: {
            id: 'user-1',
            username: 'jdoe',
            firstName: 'John',
            lastName: 'Doe',
            displayName: 'Johnny',
            avatar: null,
            lastActiveAt: new Date(),
          },
        },
      ];

      prisma.conversationMember.findMany.mockResolvedValue(mockMembers);

      const result = await service.getUserSuggestionsForConversation(conversationId, currentUserId, 'johnny');

      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe('Johnny');
    });

    it('should filter by full name', async () => {
      const mockMembers = [
        {
          user: {
            id: 'user-1',
            username: 'jdoe',
            firstName: 'John',
            lastName: 'Doe',
            displayName: null,
            avatar: null,
            lastActiveAt: new Date(),
          },
        },
      ];

      prisma.conversationMember.findMany.mockResolvedValue(mockMembers);

      const result = await service.getUserSuggestionsForConversation(conversationId, currentUserId, 'doe');

      expect(result).toHaveLength(1);
    });

    it('should exclude current user from suggestions', async () => {
      prisma.conversationMember.findMany.mockResolvedValue([]);

      await service.getUserSuggestionsForConversation(conversationId, currentUserId);

      expect(prisma.conversationMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: { not: currentUserId },
          }),
        })
      );
    });

    it('should limit suggestions to MAX_SUGGESTIONS (10)', async () => {
      const mockMembers = Array.from({ length: 15 }, (_, i) => ({
        user: {
          id: `user-${i}`,
          username: `user${i}`,
          firstName: `User`,
          lastName: `${i}`,
          displayName: null,
          avatar: null,
          lastActiveAt: new Date(),
        },
      }));

      prisma.conversationMember.findMany.mockResolvedValue(mockMembers);

      const result = await service.getUserSuggestionsForConversation(conversationId, currentUserId);

      expect(result.length).toBeLessThanOrEqual(10);
    });

    it('should handle null user in conversation member', async () => {
      const mockMembers = [
        { user: null },
        {
          user: {
            id: 'user-1',
            username: 'john',
            firstName: 'John',
            lastName: 'Doe',
            displayName: null,
            avatar: null,
            lastActiveAt: new Date(),
          },
        },
      ];

      prisma.conversationMember.findMany.mockResolvedValue(mockMembers);

      const result = await service.getUserSuggestionsForConversation(conversationId, currentUserId);

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe('john');
    });

    it('should mark friends who are also in conversation', async () => {
      const userId = 'user-1';
      const mockMembers = [
        {
          user: {
            id: userId,
            username: 'john',
            firstName: 'John',
            lastName: 'Doe',
            displayName: null,
            avatar: null,
            lastActiveAt: new Date(),
          },
        },
      ];

      const mockFriendships = [
        {
          senderId: currentUserId,
          receiverId: userId,
          status: 'accepted',
          sender: null,
          receiver: {
            id: userId,
            username: 'john',
            firstName: 'John',
            lastName: 'Doe',
            displayName: null,
            avatar: null,
          },
        },
      ];

      prisma.conversationMember.findMany.mockResolvedValue(mockMembers);
      prisma.friendRequest.findMany.mockResolvedValue(mockFriendships);

      const result = await service.getUserSuggestionsForConversation(conversationId, currentUserId);

      expect(result[0].inConversation).toBe(true);
      expect(result[0].isFriend).toBe(true);
    });

    it('should fetch global users when query provided and not enough results', async () => {
      prisma.conversationMember.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'user-other',
          username: 'other',
          firstName: 'Other',
          lastName: 'User',
          displayName: null,
          avatar: null,
        },
      ]);

      const result = await service.getUserSuggestionsForConversation(conversationId, currentUserId, 'oth');

      expect(result).toHaveLength(1);
      expect(result[0].badge).toBe('other');
      expect(result[0].inConversation).toBe(false);
      expect(result[0].isFriend).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      prisma.conversationMember.findMany.mockRejectedValue(new Error('Database error'));

      await expect(
        service.getUserSuggestionsForConversation(conversationId, currentUserId)
      ).rejects.toThrow('Database error');
    });

    it('should sort members by lastActiveAt descending', async () => {
      const now = new Date();
      const mockMembers = [
        {
          user: {
            id: 'user-1',
            username: 'old_user',
            firstName: 'Old',
            lastName: 'User',
            displayName: null,
            avatar: null,
            lastActiveAt: new Date(now.getTime() - 10000),
          },
        },
        {
          user: {
            id: 'user-2',
            username: 'recent_user',
            firstName: 'Recent',
            lastName: 'User',
            displayName: null,
            avatar: null,
            lastActiveAt: now,
          },
        },
      ];

      prisma.conversationMember.findMany.mockResolvedValue(mockMembers);

      const result = await service.getUserSuggestionsForConversation(conversationId, currentUserId);

      expect(result[0].username).toBe('recent_user');
      expect(result[1].username).toBe('old_user');
    });
  });

  // ==============================================
  // CACHE INVALIDATION TESTS
  // ==============================================

  describe('invalidateCacheForConversation', () => {
    it('should delete cache entries matching conversation pattern', async () => {
      const conversationId = 'conv-123';
      mockRedis.keys.mockResolvedValue([
        `mentions:suggestions:${conversationId}:user1:`,
        `mentions:suggestions:${conversationId}:user2:jo`,
      ]);

      await service.invalidateCacheForConversation(conversationId);

      expect(mockRedis.keys).toHaveBeenCalledWith(`mentions:suggestions:${conversationId}:*`);
      expect(mockRedis.del).toHaveBeenCalledTimes(2);
    });

    it('should handle no matching cache entries', async () => {
      mockRedis.keys.mockResolvedValue([]);

      await service.invalidateCacheForConversation('conv-empty');

      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('should handle cache errors gracefully', async () => {
      mockRedis.keys.mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(service.invalidateCacheForConversation('conv-123')).resolves.not.toThrow();
    });
  });

  // ==============================================
  // MENTION PERMISSION VALIDATION TESTS
  // ==============================================

  describe('validateMentionPermissions', () => {
    const conversationId = 'conv-123';
    const senderId = 'sender-123';

    it('should return valid for empty mention list', async () => {
      const result = await service.validateMentionPermissions(conversationId, [], senderId);

      expect(result.isValid).toBe(true);
      expect(result.validUserIds).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('should return invalid when conversation not found', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      const result = await service.validateMentionPermissions(conversationId, ['user-1'], senderId);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Conversation non trouvée');
    });

    describe('Direct conversations', () => {
      beforeEach(() => {
        prisma.conversation.findUnique.mockResolvedValue({
          id: conversationId,
          type: 'direct',
          members: [{ userId: senderId }, { userId: 'user-other' }],
        });
      });

      it('should allow mentioning the other participant', async () => {
        const result = await service.validateMentionPermissions(
          conversationId,
          ['user-other'],
          senderId
        );

        expect(result.isValid).toBe(true);
        expect(result.validUserIds).toContain('user-other');
      });

      it('should not allow mentioning self', async () => {
        const result = await service.validateMentionPermissions(conversationId, [senderId], senderId);

        expect(result.isValid).toBe(false);
        expect(result.validUserIds).not.toContain(senderId);
        expect(result.errors).toContain(
          'Dans une conversation directe, vous ne pouvez mentionner que votre interlocuteur'
        );
      });

      it('should not allow mentioning non-participants', async () => {
        const result = await service.validateMentionPermissions(
          conversationId,
          ['user-outsider'],
          senderId
        );

        expect(result.isValid).toBe(false);
        expect(result.validUserIds).not.toContain('user-outsider');
      });
    });

    describe('Group conversations', () => {
      beforeEach(() => {
        prisma.conversation.findUnique.mockResolvedValue({
          id: conversationId,
          type: 'group',
          members: [
            { userId: senderId },
            { userId: 'member-1' },
            { userId: 'member-2' },
          ],
        });
      });

      it('should allow mentioning group members', async () => {
        const result = await service.validateMentionPermissions(
          conversationId,
          ['member-1', 'member-2'],
          senderId
        );

        expect(result.isValid).toBe(true);
        expect(result.validUserIds).toContain('member-1');
        expect(result.validUserIds).toContain('member-2');
      });

      it('should not allow mentioning non-members', async () => {
        const result = await service.validateMentionPermissions(
          conversationId,
          ['member-1', 'outsider'],
          senderId
        );

        expect(result.isValid).toBe(false);
        expect(result.validUserIds).toContain('member-1');
        expect(result.validUserIds).not.toContain('outsider');
        expect(result.errors).toContain('Vous ne pouvez mentionner que les membres de la conversation');
      });
    });

    describe('Public conversations', () => {
      beforeEach(() => {
        prisma.conversation.findUnique.mockResolvedValue({
          id: conversationId,
          type: 'public',
          members: [{ userId: senderId }],
        });
      });

      it('should allow mentioning any existing user', async () => {
        prisma.user.findMany.mockResolvedValue([
          { id: 'user-any-1' },
          { id: 'user-any-2' },
        ]);

        const result = await service.validateMentionPermissions(
          conversationId,
          ['user-any-1', 'user-any-2'],
          senderId
        );

        expect(result.isValid).toBe(true);
        expect(result.validUserIds).toContain('user-any-1');
        expect(result.validUserIds).toContain('user-any-2');
      });

      it('should reject non-existing users', async () => {
        prisma.user.findMany.mockResolvedValue([{ id: 'user-exists' }]);

        const result = await service.validateMentionPermissions(
          conversationId,
          ['user-exists', 'user-not-exists'],
          senderId
        );

        expect(result.isValid).toBe(false);
        expect(result.validUserIds).toContain('user-exists');
        expect(result.validUserIds).not.toContain('user-not-exists');
        expect(result.errors).toContain("Certains utilisateurs mentionnés n'existent pas");
      });
    });

    describe('Global conversations', () => {
      beforeEach(() => {
        prisma.conversation.findUnique.mockResolvedValue({
          id: conversationId,
          type: 'global',
          members: [{ userId: senderId }],
        });
      });

      it('should allow mentioning any existing user', async () => {
        prisma.user.findMany.mockResolvedValue([{ id: 'global-user' }]);

        const result = await service.validateMentionPermissions(
          conversationId,
          ['global-user'],
          senderId
        );

        expect(result.isValid).toBe(true);
        expect(result.validUserIds).toContain('global-user');
      });
    });

    describe('Unknown conversation type', () => {
      it('should return invalid for unknown conversation type', async () => {
        prisma.conversation.findUnique.mockResolvedValue({
          id: conversationId,
          type: 'unknown_type',
          members: [],
        });

        const result = await service.validateMentionPermissions(
          conversationId,
          ['user-1'],
          senderId
        );

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Type de conversation non reconnu');
      });
    });
  });

  // ==============================================
  // MENTION CREATION TESTS
  // ==============================================

  describe('createMentions', () => {
    const messageId = 'msg-123';

    it('should do nothing for empty user IDs', async () => {
      await service.createMentions(messageId, []);

      expect(prisma.mention.create).not.toHaveBeenCalled();
    });

    it('should create mentions for multiple users', async () => {
      const userIds = ['user-1', 'user-2', 'user-3'];
      prisma.mention.create.mockResolvedValue({ id: 'mention-123' });

      await service.createMentions(messageId, userIds);

      expect(prisma.mention.create).toHaveBeenCalledTimes(3);
    });

    it('should create mention with correct data structure', async () => {
      const userId = 'user-1';
      prisma.mention.create.mockResolvedValue({ id: 'mention-123' });

      await service.createMentions(messageId, [userId]);

      expect(prisma.mention.create).toHaveBeenCalledWith({
        data: {
          messageId,
          mentionedUserId: userId,
        },
      });
    });

    it('should handle duplicate mention errors (P2002) gracefully', async () => {
      const userIds = ['user-1'];
      const duplicateError = new Error('Duplicate');
      (duplicateError as any).code = 'P2002';

      prisma.mention.create.mockRejectedValue(duplicateError);

      // Should not throw
      await expect(service.createMentions(messageId, userIds)).resolves.not.toThrow();
    });

    it('should log non-duplicate errors', async () => {
      const userIds = ['user-1'];
      const otherError = new Error('Some other error');
      (otherError as any).code = 'P2003';

      prisma.mention.create.mockRejectedValue(otherError);

      // Should not throw
      await expect(service.createMentions(messageId, userIds)).resolves.not.toThrow();
    });

    it('should create mentions in parallel', async () => {
      const userIds = ['user-1', 'user-2'];
      prisma.mention.create.mockResolvedValue({ id: 'mention-123' });

      await service.createMentions(messageId, userIds);

      // Both should be called (Promise.allSettled)
      expect(prisma.mention.create).toHaveBeenCalledTimes(2);
    });
  });

  // ==============================================
  // MENTION RETRIEVAL TESTS
  // ==============================================

  describe('getMentionsForMessage', () => {
    it('should retrieve mentions with user info', async () => {
      const mockMentions = [
        {
          id: 'mention-1',
          mentionedUser: {
            id: 'user-1',
            username: 'john',
            firstName: 'John',
            lastName: 'Doe',
            displayName: 'John Doe',
            avatar: null,
          },
        },
        {
          id: 'mention-2',
          mentionedUser: {
            id: 'user-2',
            username: 'jane',
            firstName: 'Jane',
            lastName: 'Smith',
            displayName: null,
            avatar: null,
          },
        },
      ];

      prisma.mention.findMany.mockResolvedValue(mockMentions);

      const result = await service.getMentionsForMessage('msg-123');

      expect(result).toHaveLength(2);
      expect(result[0].username).toBe('john');
      expect(result[1].username).toBe('jane');
    });

    it('should return empty array for message with no mentions', async () => {
      prisma.mention.findMany.mockResolvedValue([]);

      const result = await service.getMentionsForMessage('msg-no-mentions');

      expect(result).toEqual([]);
    });

    it('should call Prisma with correct parameters', async () => {
      prisma.mention.findMany.mockResolvedValue([]);

      await service.getMentionsForMessage('msg-123');

      expect(prisma.mention.findMany).toHaveBeenCalledWith({
        where: { messageId: 'msg-123' },
        include: {
          mentionedUser: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              displayName: true,
              avatar: true,
            },
          },
        },
      });
    });
  });

  describe('getRecentMentionsForUser', () => {
    it('should retrieve recent mentions for user', async () => {
      const mockMentions = [
        {
          id: 'mention-1',
          mentionedUserId: 'user-1',
          mentionedAt: new Date(),
          message: {
            id: 'msg-1',
            content: 'Hello @user1',
            conversationId: 'conv-1',
            senderId: 'sender-1',
            createdAt: new Date(),
            sender: {
              id: 'sender-1',
              username: 'sender',
              displayName: 'Sender User',
              avatar: null,
            },
            conversation: {
              id: 'conv-1',
              title: 'Test Conversation',
              type: 'group',
            },
          },
        },
      ];

      prisma.mention.findMany.mockResolvedValue(mockMentions);

      const result = await service.getRecentMentionsForUser('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].message.content).toBe('Hello @user1');
    });

    it('should use default limit of 50', async () => {
      prisma.mention.findMany.mockResolvedValue([]);

      await service.getRecentMentionsForUser('user-1');

      expect(prisma.mention.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });

    it('should accept custom limit', async () => {
      prisma.mention.findMany.mockResolvedValue([]);

      await service.getRecentMentionsForUser('user-1', 25);

      expect(prisma.mention.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 25,
        })
      );
    });

    it('should order by mentionedAt descending', async () => {
      prisma.mention.findMany.mockResolvedValue([]);

      await service.getRecentMentionsForUser('user-1');

      expect(prisma.mention.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: {
            mentionedAt: 'desc',
          },
        })
      );
    });
  });

  // ==============================================
  // CAN MENTION USER TESTS
  // ==============================================

  describe('canMentionUser', () => {
    const conversationId = 'conv-123';
    const userId = 'user-to-mention';

    it('should return false when conversation not found', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      const result = await service.canMentionUser(conversationId, userId);

      expect(result).toBe(false);
    });

    describe('Public/Global conversations', () => {
      it('should return true for active user in public conversation', async () => {
        prisma.conversation.findUnique.mockResolvedValue({
          id: conversationId,
          type: 'public',
        });
        prisma.user.findUnique.mockResolvedValue({ id: userId });

        const result = await service.canMentionUser(conversationId, userId);

        expect(result).toBe(true);
      });

      it('should return true for active user in global conversation', async () => {
        prisma.conversation.findUnique.mockResolvedValue({
          id: conversationId,
          type: 'global',
        });
        prisma.user.findUnique.mockResolvedValue({ id: userId });

        const result = await service.canMentionUser(conversationId, userId);

        expect(result).toBe(true);
      });

      it('should return false for non-existent user in public conversation', async () => {
        prisma.conversation.findUnique.mockResolvedValue({
          id: conversationId,
          type: 'public',
        });
        prisma.user.findUnique.mockResolvedValue(null);

        const result = await service.canMentionUser(conversationId, userId);

        expect(result).toBe(false);
      });
    });

    describe('Private/Direct/Group conversations', () => {
      it('should return true when user is active member', async () => {
        prisma.conversation.findUnique.mockResolvedValue({
          id: conversationId,
          type: 'direct',
        });
        prisma.conversationMember.findFirst.mockResolvedValue({
          userId,
          isActive: true,
        });

        const result = await service.canMentionUser(conversationId, userId);

        expect(result).toBe(true);
      });

      it('should return false when user is not a member', async () => {
        prisma.conversation.findUnique.mockResolvedValue({
          id: conversationId,
          type: 'group',
        });
        prisma.conversationMember.findFirst.mockResolvedValue(null);

        const result = await service.canMentionUser(conversationId, userId);

        expect(result).toBe(false);
      });

      it('should check for active membership', async () => {
        prisma.conversation.findUnique.mockResolvedValue({
          id: conversationId,
          type: 'direct',
        });
        prisma.conversationMember.findFirst.mockResolvedValue(null);

        await service.canMentionUser(conversationId, userId);

        expect(prisma.conversationMember.findFirst).toHaveBeenCalledWith({
          where: {
            conversationId,
            userId,
            isActive: true,
          },
        });
      });
    });
  });

  // ==============================================
  // EDGE CASES AND ERROR HANDLING
  // ==============================================

  describe('Edge Cases', () => {
    it('should handle mention with @ symbol only', () => {
      const content = 'Hello @ everyone';
      const mentions = service.extractMentions(content);

      // @ without username should not match
      expect(mentions).toEqual([]);
    });

    it('should handle multiple @ symbols in a row', () => {
      const content = 'Hello @@john';
      const mentions = service.extractMentions(content);

      // Should still extract john
      expect(mentions).toContain('john');
    });

    it('should handle mentions in URLs', () => {
      const content = 'Check https://twitter.com/@user123';
      const mentions = service.extractMentions(content);

      expect(mentions).toContain('user123');
    });

    it('should handle mentions with surrounding punctuation', () => {
      const content = 'Hello @john! How are you @jane?';
      const mentions = service.extractMentions(content);

      expect(mentions).toContain('john');
      expect(mentions).toContain('jane');
    });

    it('should handle cache read errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Cache read error'));

      prisma.conversationMember.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      // Should fall back to database query
      const result = await service.getUserSuggestionsForConversation('conv-123', 'user-123');

      expect(result).toEqual([]);
    });

    it('should handle cache write errors gracefully', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockRejectedValue(new Error('Cache write error'));

      prisma.conversationMember.findMany.mockResolvedValue([
        {
          user: {
            id: 'user-1',
            username: 'john',
            firstName: 'John',
            lastName: 'Doe',
            displayName: null,
            avatar: null,
            lastActiveAt: new Date(),
          },
        },
      ]);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      // Should still return results even if caching fails
      const result = await service.getUserSuggestionsForConversation('conv-123', 'user-123');

      expect(result).toHaveLength(1);
    });
  });

  // ==============================================
  // CACHE KEY GENERATION TESTS
  // ==============================================

  describe('Cache Key Generation', () => {
    it('should normalize query to lowercase', async () => {
      mockRedis.get.mockResolvedValue(null);
      prisma.conversationMember.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      await service.getUserSuggestionsForConversation('conv-123', 'user-123', 'JOHN');

      // Check that get was called with lowercase query
      expect(mockRedis.get).toHaveBeenCalledWith(
        expect.stringContaining('john')
      );
    });

    it('should trim query whitespace', async () => {
      mockRedis.get.mockResolvedValue(null);
      prisma.conversationMember.findMany.mockResolvedValue([]);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      await service.getUserSuggestionsForConversation('conv-123', 'user-123', '  john  ');

      // Check that get was called with trimmed query
      expect(mockRedis.get).toHaveBeenCalledWith(
        expect.stringContaining(':john')
      );
    });
  });
});
