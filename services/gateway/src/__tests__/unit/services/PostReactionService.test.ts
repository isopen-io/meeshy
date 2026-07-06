/**
 * PostReactionService Comprehensive Unit Tests
 *
 * This test suite provides thorough coverage of the PostReactionService including:
 * - Adding reactions with emoji validation
 * - Removing reactions
 * - Post existence checking
 * - Reaction aggregation by emoji (NO userIds / hasCurrentUser — Phase 3 privacy)
 * - Getting post reactions with sync data
 * - Getting user reactions
 * - Checking if user has reacted
 * - Deleting all reactions for a post
 * - Creating WebSocket update events
 * - Validation helper methods
 * - Edge cases and error handling
 *
 * Coverage target: > 65%
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock the reaction utilities from shared types
jest.mock('@meeshy/shared/types/reaction', () => ({
  sanitizeEmoji: jest.fn((emoji: string) => {
    // Simulate emoji validation - only allow certain emojis
    const validEmojis = ['👍', '❤️', '🎉', '🔥', '😂', '⭐', '👏', '🚀'];
    const trimmed = emoji?.trim();
    return validEmojis.includes(trimmed) ? trimmed : null;
  }),
  isValidEmoji: jest.fn((emoji: string) => {
    const validEmojis = ['👍', '❤️', '🎉', '🔥', '😂', '⭐', '👏', '🚀'];
    return validEmojis.includes(emoji?.trim());
  })
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Import after mocks are set up
import { PostReactionService, createPostReactionService } from '../../../services/PostReactionService';
import type { PrismaClient, PostReaction } from '@meeshy/shared/prisma/client';
import { sanitizeEmoji, isValidEmoji } from '@meeshy/shared/types/reaction';

describe('PostReactionService', () => {
  let service: PostReactionService;
  let mockPrisma: any;

  // Sample test data
  const testUserId = '507f1f77bcf86cd799439011';
  const testUserId2 = '507f1f77bcf86cd799439012';
  const testPostId = '507f1f77bcf86cd799439033';
  const testReactionId = '507f1f77bcf86cd799439044';

  const createMockPostReaction = (overrides: Partial<PostReaction> = {}): PostReaction => ({
    id: testReactionId,
    postId: testPostId,
    userId: testUserId,
    emoji: '👍',
    createdAt: new Date('2025-01-06T12:00:00Z'),
    updatedAt: new Date('2025-01-06T12:00:00Z'),
    ...overrides
  } as PostReaction);

  const createMockPost = (overrides: any = {}) => ({
    id: testPostId,
    authorId: testUserId,
    deletedAt: null,
    reactionSummary: null,
    reactionCount: 0,
    ...overrides
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock implementations
    (sanitizeEmoji as jest.Mock).mockImplementation((emoji: string) => {
      const validEmojis = ['👍', '❤️', '🎉', '🔥', '😂', '⭐', '👏', '🚀'];
      const trimmed = emoji?.trim();
      return validEmojis.includes(trimmed) ? trimmed : null;
    });

    (isValidEmoji as jest.Mock).mockImplementation((emoji: string) => {
      const validEmojis = ['👍', '❤️', '🎉', '🔥', '😂', '⭐', '👏', '🚀'];
      return validEmojis.includes(emoji?.trim());
    });

    // Create mock Prisma client
    mockPrisma = {
      post: {
        findUnique: jest.fn(),
        update: jest.fn()
      },
      postReaction: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        // Compteur autoritaire lu dans updatePostReactionSummary (sync likeCount).
        count: jest.fn().mockResolvedValue(1),
        // Ventilation + total autoritaires recomputés dans updatePostReactionSummary.
        groupBy: jest.fn().mockResolvedValue([])
      },
      // $transaction executes the callback with a transaction client (same shape).
      $transaction: jest.fn(),
    };

    // Create service instance
    service = new PostReactionService(mockPrisma as unknown as PrismaClient);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==============================================
  // FACTORY FUNCTION TESTS
  // ==============================================

  describe('createPostReactionService', () => {
    it('should create a PostReactionService instance', () => {
      const postReactionService = createPostReactionService(mockPrisma as unknown as PrismaClient);
      expect(postReactionService).toBeInstanceOf(PostReactionService);
    });
  });

  // ==============================================
  // ADD REACTION TESTS
  // ==============================================

  describe('addReaction', () => {
    beforeEach(() => {
      mockPrisma.post.findUnique.mockResolvedValue(createMockPost());
      mockPrisma.postReaction.findMany.mockResolvedValue([]);
      mockPrisma.postReaction.findFirst.mockResolvedValue(null);
      mockPrisma.postReaction.create.mockResolvedValue(createMockPostReaction());
      mockPrisma.post.update.mockResolvedValue(createMockPost());
      // Wire $transaction to execute callback with a tx that delegates to the same mocks
      mockPrisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => {
        return fn({
          post: {
            findUnique: mockPrisma.post.findUnique,
            update: mockPrisma.post.update,
          },
          postReaction: { count: mockPrisma.postReaction.count, groupBy: mockPrisma.postReaction.groupBy },
        });
      });
    });

    it('should add a reaction successfully', async () => {
      const result = await service.addReaction({
        postId: testPostId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(result).toBeDefined();
      expect(result?.emoji).toBe('👍');
      expect(result?.postId).toBe(testPostId);
      expect(result?.userId).toBe(testUserId);
      expect(mockPrisma.postReaction.create).toHaveBeenCalledTimes(1);
    });

    it('should add a reaction successfully for another user', async () => {
      mockPrisma.postReaction.create.mockResolvedValue(
        createMockPostReaction({
          userId: testUserId2
        })
      );

      const result = await service.addReaction({
        postId: testPostId,
        userId: testUserId2,
        emoji: '❤️'
      });

      expect(result).toBeDefined();
      expect(result?.userId).toBe(testUserId2);
    });

    it('should throw error for invalid emoji format', async () => {
      (sanitizeEmoji as jest.Mock).mockReturnValue(null);

      await expect(
        service.addReaction({
          postId: testPostId,
          userId: testUserId,
          emoji: 'invalid'
        })
      ).rejects.toThrow('Invalid emoji format');
    });

    it('should throw error when userId not provided', async () => {
      await expect(
        service.addReaction({
          postId: testPostId,
          userId: '',
          emoji: '👍'
        })
      ).rejects.toThrow('userId must be provided');
    });

    it('should throw error when post not found', async () => {
      mockPrisma.post.findUnique.mockResolvedValue(null);

      await expect(
        service.addReaction({
          postId: '507f1f77bcf86cd799439099',
          userId: testUserId,
          emoji: '👍'
        })
      ).rejects.toThrow('Post not found');
    });

    it('should throw error when post is deleted', async () => {
      mockPrisma.post.findUnique.mockResolvedValue(
        createMockPost({ deletedAt: new Date() })
      );

      await expect(
        service.addReaction({
          postId: testPostId,
          userId: testUserId,
          emoji: '👍'
        })
      ).rejects.toThrow('Post has been deleted');
    });

    it('should return existing reaction if already exists (idempotent)', async () => {
      const existingReaction = createMockPostReaction();
      mockPrisma.postReaction.findFirst.mockResolvedValue(existingReaction);

      const result = await service.addReaction({
        postId: testPostId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(result).toBeDefined();
      expect(mockPrisma.postReaction.create).not.toHaveBeenCalled();
    });

    it('should throw error when max reactions per user reached', async () => {
      // User has already 1 different emoji (MAX_REACTIONS_PER_USER = 1)
      mockPrisma.postReaction.findMany.mockResolvedValue([
        { emoji: '👍' }
      ]);

      await expect(
        service.addReaction({
          postId: testPostId,
          userId: testUserId,
          emoji: '❤️' // Trying to add 2nd different emoji
        })
      ).rejects.toThrow('Maximum 1 different reactions per post reached');
    });

    it('should allow adding same emoji again (returns existing)', async () => {
      // User has 1 emoji
      mockPrisma.postReaction.findMany.mockResolvedValue([
        { emoji: '👍' }
      ]);

      const existingReaction = createMockPostReaction({ emoji: '👍' });
      mockPrisma.postReaction.findFirst.mockResolvedValue(existingReaction);

      const result = await service.addReaction({
        postId: testPostId,
        userId: testUserId,
        emoji: '👍' // Same emoji, should not fail
      });

      expect(result).toBeDefined();
      expect(result?.emoji).toBe('👍');
    });

    it('should sanitize emoji before creating reaction', async () => {
      const result = await service.addReaction({
        postId: testPostId,
        userId: testUserId,
        emoji: '  👍  ' // With whitespace
      });

      expect(sanitizeEmoji).toHaveBeenCalledWith('  👍  ');
      expect(result).toBeDefined();
    });

    it('should update reactionSummary and reactionCount on successful add', async () => {
      await service.addReaction({
        postId: testPostId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(mockPrisma.post.update).toHaveBeenCalled();
    });
  });

  // ==============================================
  // REMOVE REACTION TESTS
  // ==============================================

  describe('removeReaction', () => {
    beforeEach(() => {
      mockPrisma.postReaction.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.post.findUnique.mockResolvedValue(createMockPost());
      mockPrisma.post.update.mockResolvedValue(createMockPost());
      mockPrisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => {
        return fn({
          post: {
            findUnique: mockPrisma.post.findUnique,
            update: mockPrisma.post.update,
          },
          postReaction: { count: mockPrisma.postReaction.count, groupBy: mockPrisma.postReaction.groupBy },
        });
      });
    });

    it('should remove a reaction successfully', async () => {
      const result = await service.removeReaction({
        postId: testPostId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(result).toBe(true);
      expect(mockPrisma.postReaction.deleteMany).toHaveBeenCalledWith({
        where: {
          postId: testPostId,
          userId: testUserId,
          emoji: '👍'
        }
      });
    });

    it('should remove a reaction for another user', async () => {
      const result = await service.removeReaction({
        postId: testPostId,
        userId: testUserId2,
        emoji: '❤️'
      });

      expect(result).toBe(true);
      expect(mockPrisma.postReaction.deleteMany).toHaveBeenCalledWith({
        where: {
          postId: testPostId,
          userId: testUserId2,
          emoji: '❤️'
        }
      });
    });

    it('should throw error for invalid emoji format', async () => {
      (sanitizeEmoji as jest.Mock).mockReturnValue(null);

      await expect(
        service.removeReaction({
          postId: testPostId,
          userId: testUserId,
          emoji: 'invalid'
        })
      ).rejects.toThrow('Invalid emoji format');
    });

    it('should return false when no reaction was deleted', async () => {
      mockPrisma.postReaction.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.removeReaction({
        postId: testPostId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(result).toBe(false);
    });

    it('should update reactionSummary and reactionCount when a reaction is deleted', async () => {
      await service.removeReaction({
        postId: testPostId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(mockPrisma.post.update).toHaveBeenCalled();
    });

    it('should NOT update post when no reaction was deleted', async () => {
      mockPrisma.postReaction.deleteMany.mockResolvedValue({ count: 0 });

      await service.removeReaction({
        postId: testPostId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(mockPrisma.post.update).not.toHaveBeenCalled();
    });
  });

  // ==============================================
  // GET POST REACTIONS TESTS
  // ==============================================

  describe('getPostReactions', () => {
    it('should return aggregated reactions for a post', async () => {
      mockPrisma.postReaction.findMany.mockResolvedValue([
        createMockPostReaction({ emoji: '👍', userId: 'user1' }),
        createMockPostReaction({ emoji: '👍', userId: 'user2' }),
        createMockPostReaction({ emoji: '❤️', userId: 'user3' }),
        createMockPostReaction({ emoji: '❤️', userId: 'user4' })
      ]);

      const result = await service.getPostReactions({
        postId: testPostId
      });

      expect(result.postId).toBe(testPostId);
      expect(result.totalCount).toBe(4);
      expect(result.reactions.length).toBe(2);
    });

    it('should correctly aggregate reactions by emoji with count only (no userIds)', async () => {
      mockPrisma.postReaction.findMany.mockResolvedValue([
        createMockPostReaction({ emoji: '👍', userId: 'user1' }),
        createMockPostReaction({ emoji: '👍', userId: 'user2' }),
        createMockPostReaction({ emoji: '👍', userId: 'user3' })
      ]);

      const result = await service.getPostReactions({
        postId: testPostId
      });

      const thumbsUpAggregation = result.reactions.find(r => r.emoji === '👍');
      expect(thumbsUpAggregation?.count).toBe(3);
      // userIds must NOT be present (Phase 3 privacy decision)
      expect((thumbsUpAggregation as any)?.userIds).toBeUndefined();
      // hasCurrentUser must NOT be present (Phase 3 privacy decision)
      expect((thumbsUpAggregation as any)?.hasCurrentUser).toBeUndefined();
    });

    it('should return userReactions list for current user', async () => {
      mockPrisma.postReaction.findMany.mockResolvedValue([
        createMockPostReaction({ emoji: '👍', userId: testUserId }),
        createMockPostReaction({ emoji: '❤️', userId: testUserId }),
        createMockPostReaction({ emoji: '🎉', userId: 'other-user' })
      ]);

      const result = await service.getPostReactions({
        postId: testPostId,
        currentUserId: testUserId
      });

      expect(result.userReactions).toContain('👍');
      expect(result.userReactions).toContain('❤️');
      expect(result.userReactions).not.toContain('🎉');
    });

    it('should deduplicate userReactions', async () => {
      mockPrisma.postReaction.findMany.mockResolvedValue([
        createMockPostReaction({ id: 'r1', emoji: '👍', userId: testUserId }),
        createMockPostReaction({ id: 'r2', emoji: '👍', userId: testUserId })
      ]);

      const result = await service.getPostReactions({
        postId: testPostId,
        currentUserId: testUserId
      });

      const thumbsUpCount = result.userReactions.filter(e => e === '👍').length;
      expect(thumbsUpCount).toBe(1);
    });

    it('should return empty reactions when no reactions exist', async () => {
      mockPrisma.postReaction.findMany.mockResolvedValue([]);

      const result = await service.getPostReactions({
        postId: testPostId
      });

      expect(result.reactions).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.userReactions).toEqual([]);
    });

    it('should not include user enrichment (no users[] in reactions)', async () => {
      mockPrisma.postReaction.findMany.mockResolvedValue([
        createMockPostReaction({ emoji: '👍', userId: 'user1' })
      ]);

      const result = await service.getPostReactions({ postId: testPostId });

      const firstReaction = result.reactions[0];
      expect((firstReaction as any)?.users).toBeUndefined();
    });
  });

  // ==============================================
  // GET EMOJI AGGREGATION TESTS
  // ==============================================

  describe('getEmojiAggregation', () => {
    it('should return aggregation for specific emoji with count only (no userIds)', async () => {
      mockPrisma.postReaction.findMany.mockResolvedValue([
        createMockPostReaction({ emoji: '👍', userId: 'user1' }),
        createMockPostReaction({ emoji: '👍', userId: 'user2' }),
        createMockPostReaction({ emoji: '👍', userId: 'user3' })
      ]);

      const result = await service.getEmojiAggregation(
        testPostId,
        '👍'
      );

      expect(result.emoji).toBe('👍');
      expect(result.count).toBe(3);
      // userIds must NOT be present (Phase 3 privacy decision)
      expect((result as any).userIds).toBeUndefined();
      // hasCurrentUser must NOT be present (Phase 3 privacy decision)
      expect((result as any).hasCurrentUser).toBeUndefined();
    });

    it('should throw error for invalid emoji', async () => {
      (sanitizeEmoji as jest.Mock).mockReturnValue(null);

      await expect(
        service.getEmojiAggregation(testPostId, 'invalid')
      ).rejects.toThrow('Invalid emoji format');
    });

    it('should return zero count when no reactions exist', async () => {
      mockPrisma.postReaction.findMany.mockResolvedValue([]);

      const result = await service.getEmojiAggregation(
        testPostId,
        '👍'
      );

      expect(result.count).toBe(0);
    });

    it('should return aggregation for specific emoji regardless of currentUserId', async () => {
      mockPrisma.postReaction.findMany.mockResolvedValue([
        createMockPostReaction({ emoji: '👍', userId: testUserId2 })
      ]);

      const result = await service.getEmojiAggregation(
        testPostId,
        '👍',
        testUserId2
      );

      expect(result.count).toBe(1);
      expect((result as any).hasCurrentUser).toBeUndefined();
    });

    it('should return empty aggregation when no reactions exist', async () => {
      mockPrisma.postReaction.findMany.mockResolvedValue([]);

      const result = await service.getEmojiAggregation(
        testPostId,
        '👍'
      );

      expect(result.count).toBe(0);
    });
  });

  // ==============================================
  // GET USER REACTIONS TESTS
  // ==============================================

  describe('getUserReactions', () => {
    it('should return reactions for a user', async () => {
      mockPrisma.postReaction.findMany.mockResolvedValue([
        createMockPostReaction({ emoji: '👍' }),
        createMockPostReaction({ emoji: '❤️' })
      ]);

      const result = await service.getUserReactions(testUserId);

      expect(result.length).toBe(2);
      expect(mockPrisma.postReaction.findMany).toHaveBeenCalledWith({
        where: { userId: testUserId },
        orderBy: { createdAt: 'desc' },
        take: 100
      });
    });

    it('should return empty array when user has no reactions', async () => {
      mockPrisma.postReaction.findMany.mockResolvedValue([]);

      const result = await service.getUserReactions(testUserId);

      expect(result).toEqual([]);
    });

    it('should limit results to 100 for performance', async () => {
      mockPrisma.postReaction.findMany.mockResolvedValue([]);

      await service.getUserReactions(testUserId);

      expect(mockPrisma.postReaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 })
      );
    });
  });

  // ==============================================
  // HAS USER REACTED TESTS
  // ==============================================

  describe('hasUserReacted', () => {
    it('should return true if user has reacted with emoji', async () => {
      mockPrisma.postReaction.findFirst.mockResolvedValue(createMockPostReaction());

      const result = await service.hasUserReacted(
        testPostId,
        '👍',
        testUserId
      );

      expect(result).toBe(true);
    });

    it('should return false if user has not reacted with emoji', async () => {
      mockPrisma.postReaction.findFirst.mockResolvedValue(null);

      const result = await service.hasUserReacted(
        testPostId,
        '👍',
        testUserId
      );

      expect(result).toBe(false);
    });

    it('should return false for invalid emoji', async () => {
      (sanitizeEmoji as jest.Mock).mockReturnValue(null);

      const result = await service.hasUserReacted(
        testPostId,
        'invalid',
        testUserId
      );

      expect(result).toBe(false);
    });

    it('should check for different user', async () => {
      mockPrisma.postReaction.findFirst.mockResolvedValue(
        createMockPostReaction({ userId: testUserId2 })
      );

      const result = await service.hasUserReacted(
        testPostId,
        '👍',
        testUserId2
      );

      expect(result).toBe(true);
      expect(mockPrisma.postReaction.findFirst).toHaveBeenCalledWith({
        where: {
          postId: testPostId,
          emoji: '👍',
          userId: testUserId2
        }
      });
    });
  });

  // ==============================================
  // DELETE POST REACTIONS TESTS
  // ==============================================

  describe('deletePostReactions', () => {
    it('should delete all reactions for a post', async () => {
      mockPrisma.postReaction.deleteMany.mockResolvedValue({ count: 5 });
      mockPrisma.post.update.mockResolvedValue(createMockPost());

      const result = await service.deletePostReactions(testPostId);

      expect(result).toBe(5);
      expect(mockPrisma.postReaction.deleteMany).toHaveBeenCalledWith({
        where: { postId: testPostId }
      });
    });

    it('should return 0 when no reactions to delete', async () => {
      mockPrisma.postReaction.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.deletePostReactions(testPostId);

      expect(result).toBe(0);
    });

    it('should update post reactionSummary and reactionCount when reactions deleted', async () => {
      mockPrisma.postReaction.deleteMany.mockResolvedValue({ count: 3 });
      mockPrisma.post.update.mockResolvedValue(createMockPost());

      await service.deletePostReactions(testPostId);

      expect(mockPrisma.post.update).toHaveBeenCalledWith({
        where: { id: testPostId },
        data: {
          reactionSummary: {},
          reactionCount: 0
        }
      });
    });

    it('should NOT update post when no reactions deleted', async () => {
      mockPrisma.postReaction.deleteMany.mockResolvedValue({ count: 0 });

      await service.deletePostReactions(testPostId);

      expect(mockPrisma.post.update).not.toHaveBeenCalled();
    });
  });

  // ==============================================
  // CREATE UPDATE EVENT TESTS
  // ==============================================

  describe('createUpdateEvent', () => {
    beforeEach(() => {
      mockPrisma.postReaction.findMany.mockResolvedValue([
        createMockPostReaction({ emoji: '👍', userId: testUserId })
      ]);
    });

    it('should create add event with aggregation (no userIds/hasCurrentUser)', async () => {
      const result = await service.createUpdateEvent(
        testPostId,
        '👍',
        'add',
        testUserId
      );

      expect(result.postId).toBe(testPostId);
      expect(result.emoji).toBe('👍');
      expect(result.action).toBe('add');
      expect(result.userId).toBe(testUserId);
      expect(result.aggregation).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
      // aggregation must NOT have userIds or hasCurrentUser
      expect((result.aggregation as any).userIds).toBeUndefined();
      expect((result.aggregation as any).hasCurrentUser).toBeUndefined();
    });

    it('should create remove event with aggregation', async () => {
      mockPrisma.postReaction.findMany.mockResolvedValue([]);

      const result = await service.createUpdateEvent(
        testPostId,
        '👍',
        'remove',
        testUserId
      );

      expect(result.action).toBe('remove');
      expect(result.aggregation.count).toBe(0);
    });

    it('should create event for different user', async () => {
      mockPrisma.postReaction.findMany.mockResolvedValue([
        createMockPostReaction({ userId: testUserId2 })
      ]);

      const result = await service.createUpdateEvent(
        testPostId,
        '👍',
        'add',
        testUserId2
      );

      expect(result.userId).toBe(testUserId2);
    });
  });

  // ==============================================
  // VALIDATION METHODS TESTS
  // ==============================================

  describe('validateAddReactionOptions', () => {
    it('should pass for valid options', () => {
      expect(() => {
        service.validateAddReactionOptions({
          postId: testPostId,
          userId: testUserId,
          emoji: '👍'
        });
      }).not.toThrow();
    });

    it('should throw error when postId is missing', () => {
      expect(() => {
        service.validateAddReactionOptions({
          postId: '',
          userId: testUserId,
          emoji: '👍'
        });
      }).toThrow('postId is required');
    });

    it('should throw error when userId not provided', () => {
      expect(() => {
        service.validateAddReactionOptions({
          postId: testPostId,
          userId: '',
          emoji: '👍'
        });
      }).toThrow('userId must be provided');
    });

    it('should throw error when emoji is missing', () => {
      expect(() => {
        service.validateAddReactionOptions({
          postId: testPostId,
          userId: testUserId,
          emoji: ''
        });
      }).toThrow('emoji is required');
    });

    it('should throw error for invalid emoji format', () => {
      (isValidEmoji as jest.Mock).mockReturnValue(false);

      expect(() => {
        service.validateAddReactionOptions({
          postId: testPostId,
          userId: testUserId,
          emoji: 'invalid'
        });
      }).toThrow('Invalid emoji format');
    });
  });

  describe('validateRemoveReactionOptions', () => {
    it('should pass for valid options', () => {
      expect(() => {
        service.validateRemoveReactionOptions({
          postId: testPostId,
          userId: testUserId,
          emoji: '👍'
        });
      }).not.toThrow();
    });

    it('should throw error when postId is missing', () => {
      expect(() => {
        service.validateRemoveReactionOptions({
          postId: '',
          userId: testUserId,
          emoji: '👍'
        });
      }).toThrow('postId is required');
    });

    it('should throw error when userId not provided', () => {
      expect(() => {
        service.validateRemoveReactionOptions({
          postId: testPostId,
          userId: '',
          emoji: '👍'
        });
      }).toThrow('userId must be provided');
    });

    it('should throw error when emoji is missing', () => {
      expect(() => {
        service.validateRemoveReactionOptions({
          postId: testPostId,
          userId: testUserId,
          emoji: ''
        });
      }).toThrow('emoji is required');
    });

    it('should throw error for invalid emoji format', () => {
      (isValidEmoji as jest.Mock).mockReturnValue(false);

      expect(() => {
        service.validateRemoveReactionOptions({
          postId: testPostId,
          userId: testUserId,
          emoji: 'invalid'
        });
      }).toThrow('Invalid emoji format');
    });
  });

  // ==============================================
  // EDGE CASES AND ERROR HANDLING
  // ==============================================

  describe('Edge Cases', () => {
    it('should handle database errors in addReaction gracefully', async () => {
      mockPrisma.post.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(
        service.addReaction({
          postId: testPostId,
          userId: testUserId,
          emoji: '👍'
        })
      ).rejects.toThrow('Database error');
    });

    it('should handle database errors in removeReaction gracefully', async () => {
      mockPrisma.postReaction.deleteMany.mockRejectedValue(new Error('Database error'));

      await expect(
        service.removeReaction({
          postId: testPostId,
          userId: testUserId,
          emoji: '👍'
        })
      ).rejects.toThrow('Database error');
    });

    it('should handle database errors in getPostReactions gracefully', async () => {
      mockPrisma.postReaction.findMany.mockRejectedValue(new Error('Database error'));

      await expect(
        service.getPostReactions({
          postId: testPostId
        })
      ).rejects.toThrow('Database error');
    });

    it('should handle empty post ID', async () => {
      mockPrisma.post.findUnique.mockResolvedValue(null);

      await expect(
        service.addReaction({
          postId: '',
          userId: testUserId,
          emoji: '👍'
        })
      ).rejects.toThrow();
    });

    it('should handle whitespace-only emoji', async () => {
      (sanitizeEmoji as jest.Mock).mockReturnValue(null);

      await expect(
        service.addReaction({
          postId: testPostId,
          userId: testUserId,
          emoji: '   '
        })
      ).rejects.toThrow('Invalid emoji format');
    });

    it('should correctly map post reaction data', async () => {
      const mockReaction = createMockPostReaction({
        userId: testUserId2
      });

      mockPrisma.postReaction.findMany.mockResolvedValue([mockReaction]);

      const result = await service.getUserReactions(testUserId);

      expect(result[0].userId).toBe(testUserId2);
    });
  });

  // ==============================================
  // REACTION DATA MAPPING TESTS
  // ==============================================

  describe('PostReaction Data Mapping', () => {
    it('should correctly map all post reaction fields', async () => {
      const mockReaction = createMockPostReaction({
        id: 'reaction-123',
        postId: 'post-456',
        userId: 'user-789',
        emoji: '🎉',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-02T00:00:00Z')
      });

      mockPrisma.postReaction.findMany.mockResolvedValue([mockReaction]);

      const result = await service.getUserReactions('user-789');

      expect(result[0]).toEqual({
        id: 'reaction-123',
        postId: 'post-456',
        userId: 'user-789',
        emoji: '🎉',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-02T00:00:00Z')
      });
    });
  });

  // ==============================================
  // P2002 CONCURRENT INSERT IDEMPOTENCY
  // ==============================================

  describe('addReaction — P2002 concurrent insert', () => {
    beforeEach(() => {
      mockPrisma.post.findUnique.mockResolvedValue(createMockPost());
      mockPrisma.postReaction.findMany.mockResolvedValue([]);
      mockPrisma.postReaction.findFirst.mockResolvedValue(null);
      mockPrisma.post.update.mockResolvedValue(createMockPost());
      mockPrisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => {
        return fn({
          post: {
            findUnique: mockPrisma.post.findUnique,
            update: mockPrisma.post.update,
          },
          postReaction: { count: mockPrisma.postReaction.count, groupBy: mockPrisma.postReaction.groupBy },
        });
      });
    });

    it('test_addReaction_P2002_concurrentInsert_returnsExistingRecordWithoutThrowing', async () => {
      const existingReaction = createMockPostReaction();
      const p2002Error = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

      // First findFirst (pre-check) returns null — concurrent race condition
      mockPrisma.postReaction.findFirst
        .mockResolvedValueOnce(null)    // pre-check: not found
        .mockResolvedValueOnce(existingReaction); // recovery lookup after P2002

      mockPrisma.postReaction.create.mockRejectedValue(p2002Error);

      const result = await service.addReaction({
        postId: testPostId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(result).toBeDefined();
      expect(result?.id).toBe(existingReaction.id);
      // updatePostReactionSummary must NOT be called (race winner already updated it)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('test_addReaction_otherDbError_rethrows', async () => {
      const dbError = Object.assign(new Error('Connection timeout'), { code: 'P1001' });

      mockPrisma.postReaction.findFirst.mockResolvedValueOnce(null);
      mockPrisma.postReaction.create.mockRejectedValue(dbError);

      await expect(
        service.addReaction({
          postId: testPostId,
          userId: testUserId,
          emoji: '👍'
        })
      ).rejects.toThrow('Connection timeout');
    });
  });

  // ==============================================
  // TRANSACTION WRAPS REACTION SUMMARY
  // ==============================================

  describe('updatePostReactionSummary — $transaction + authoritative groupBy recompute', () => {
    beforeEach(() => {
      mockPrisma.post.findUnique.mockResolvedValue(createMockPost());
      mockPrisma.postReaction.findMany.mockResolvedValue([]);
      mockPrisma.postReaction.findFirst.mockResolvedValue(null);
      mockPrisma.postReaction.create.mockResolvedValue(createMockPostReaction());
      mockPrisma.post.update.mockResolvedValue(createMockPost());
      mockPrisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => {
        return fn({
          post: {
            findUnique: mockPrisma.post.findUnique,
            update: mockPrisma.post.update,
          },
          postReaction: { count: mockPrisma.postReaction.count, groupBy: mockPrisma.postReaction.groupBy },
        });
      });
    });

    it('test_addReaction_callsPrismaTransaction_forSummaryUpdate', async () => {
      await service.addReaction({
        postId: testPostId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('test_removeReaction_callsPrismaTransaction_forSummaryUpdate', async () => {
      mockPrisma.postReaction.deleteMany.mockResolvedValue({ count: 1 });

      await service.removeReaction({
        postId: testPostId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('test_removeReaction_noDeletedRow_doesNotCallTransaction', async () => {
      mockPrisma.postReaction.deleteMany.mockResolvedValue({ count: 0 });

      await service.removeReaction({
        postId: testPostId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('test_addReaction_writesReactionSummaryFromGroupBy_notDelta', async () => {
      // La carte reactionSummary DOIT être recomputée depuis groupBy(PostReaction),
      // pas dérivée par delta de la valeur préalable (auto-réparant vs emoji fantôme).
      mockPrisma.post.findUnique.mockResolvedValue(
        createMockPost({ reactionSummary: { '🔥': 99 }, reactionCount: 99 })
      );
      mockPrisma.postReaction.groupBy.mockResolvedValue([
        { emoji: '👍', _count: { emoji: 3 } },
        { emoji: '❤️', _count: { emoji: 2 } }
      ]);

      await service.addReaction({
        postId: testPostId,
        userId: testUserId,
        emoji: '❤️'
      });

      expect(mockPrisma.postReaction.groupBy).toHaveBeenCalledWith({
        by: ['emoji'],
        where: { postId: testPostId },
        _count: { emoji: true }
      });
      expect(mockPrisma.post.update).toHaveBeenCalledWith({
        where: { id: testPostId },
        data: { reactionSummary: { '👍': 3, '❤️': 2 }, reactionCount: 5, likeCount: 5 }
      });
    });

    it('test_removeReaction_writesReactionSummaryFromGroupBy_notDelta', async () => {
      mockPrisma.postReaction.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.post.findUnique.mockResolvedValue(
        createMockPost({ reactionSummary: { '👍': 3 }, reactionCount: 3 })
      );
      mockPrisma.postReaction.groupBy.mockResolvedValue([
        { emoji: '👍', _count: { emoji: 2 } }
      ]);

      await service.removeReaction({
        postId: testPostId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(mockPrisma.post.update).toHaveBeenCalledWith({
        where: { id: testPostId },
        data: { reactionSummary: { '👍': 2 }, reactionCount: 2, likeCount: 2 }
      });
    });

    it('test_lastReactionRemoved_writesEmptySummaryAndZeroCounts', async () => {
      mockPrisma.postReaction.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.post.findUnique.mockResolvedValue(
        createMockPost({ reactionSummary: { '👍': 1 }, reactionCount: 1 })
      );
      mockPrisma.postReaction.groupBy.mockResolvedValue([]);

      await service.removeReaction({
        postId: testPostId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(mockPrisma.post.update).toHaveBeenCalledWith({
        where: { id: testPostId },
        data: { reactionSummary: {}, reactionCount: 0, likeCount: 0 }
      });
    });
  });

  // ==============================================
  // AGGREGATION EDGE CASES
  // ==============================================

  describe('Aggregation Edge Cases', () => {
    it('should handle multiple users with same emoji correctly', async () => {
      mockPrisma.postReaction.findMany.mockResolvedValue([
        createMockPostReaction({ userId: 'user1', emoji: '👍' }),
        createMockPostReaction({ userId: 'user2', emoji: '👍' }),
        createMockPostReaction({ userId: 'user3', emoji: '👍' }),
        createMockPostReaction({ userId: 'user4', emoji: '👍' }),
        createMockPostReaction({ userId: 'user5', emoji: '👍' })
      ]);

      const result = await service.getPostReactions({
        postId: testPostId
      });

      const thumbsUp = result.reactions.find(r => r.emoji === '👍');
      expect(thumbsUp?.count).toBe(5);
      // No userIds — privacy
      expect((thumbsUp as any)?.userIds).toBeUndefined();
    });

    it('should handle reactions ordered by createdAt', async () => {
      mockPrisma.postReaction.findMany.mockResolvedValue([]);

      await service.getPostReactions({
        postId: testPostId
      });

      expect(mockPrisma.postReaction.findMany).toHaveBeenCalledWith({
        where: { postId: testPostId },
        orderBy: { createdAt: 'asc' }
      });
    });
  });
});
