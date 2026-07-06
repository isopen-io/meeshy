/**
 * CommentReactionService Comprehensive Unit Tests
 *
 * This test suite provides thorough coverage of the CommentReactionService including:
 * - Adding reactions with emoji validation
 * - Removing reactions
 * - Comment existence checking (not participant-of-conversation)
 * - Reaction aggregation by emoji
 * - Getting comment reactions with sync data
 * - Getting user reactions
 * - Checking if user has reacted
 * - Deleting all reactions for a comment
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
import { CommentReactionService, createCommentReactionService } from '../../../services/CommentReactionService';
import type { PrismaClient, CommentReaction } from '@meeshy/shared/prisma/client';
import { sanitizeEmoji, isValidEmoji } from '@meeshy/shared/types/reaction';

describe('CommentReactionService', () => {
  let service: CommentReactionService;
  let mockPrisma: any;

  // Sample test data
  const testUserId = '507f1f77bcf86cd799439011';
  const testUserId2 = '507f1f77bcf86cd799439012';
  const testCommentId = '507f1f77bcf86cd799439022';
  const testPostId = '507f1f77bcf86cd799439033';
  const testReactionId = '507f1f77bcf86cd799439044';

  const createMockCommentReaction = (overrides: Partial<CommentReaction> = {}): CommentReaction => ({
    id: testReactionId,
    commentId: testCommentId,
    userId: testUserId,
    emoji: '👍',
    createdAt: new Date('2025-01-06T12:00:00Z'),
    updatedAt: new Date('2025-01-06T12:00:00Z'),
    ...overrides
  } as CommentReaction);

  const createMockPostComment = (overrides: any = {}) => ({
    id: testCommentId,
    postId: testPostId,
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
      postComment: {
        findUnique: jest.fn(),
        update: jest.fn()
      },
      commentReaction: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        // Compteur autoritaire lu dans updateCommentReactionSummary (sync likeCount).
        count: jest.fn().mockResolvedValue(1),
        // Ventilation + total autoritaires recomputés dans updateCommentReactionSummary.
        groupBy: jest.fn().mockResolvedValue([])
      },
      user: {
        findMany: jest.fn().mockResolvedValue([])
      },
      // $transaction executes the callback with a transaction client (same shape).
      $transaction: jest.fn(),
    };

    // Create service instance
    service = new CommentReactionService(mockPrisma as unknown as PrismaClient);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==============================================
  // FACTORY FUNCTION TESTS
  // ==============================================

  describe('createCommentReactionService', () => {
    it('should create a CommentReactionService instance', () => {
      const commentReactionService = createCommentReactionService(mockPrisma as unknown as PrismaClient);
      expect(commentReactionService).toBeInstanceOf(CommentReactionService);
    });
  });

  // ==============================================
  // ADD REACTION TESTS
  // ==============================================

  describe('addReaction', () => {
    beforeEach(() => {
      mockPrisma.postComment.findUnique.mockResolvedValue(createMockPostComment());
      mockPrisma.commentReaction.findMany.mockResolvedValue([]);
      mockPrisma.commentReaction.findFirst.mockResolvedValue(null);
      mockPrisma.commentReaction.create.mockResolvedValue(createMockCommentReaction());
      mockPrisma.postComment.update.mockResolvedValue(createMockPostComment());
      // Wire $transaction to execute callback with a tx that delegates to the same mocks
      mockPrisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => {
        return fn({
          postComment: {
            findUnique: mockPrisma.postComment.findUnique,
            update: mockPrisma.postComment.update,
          },
          commentReaction: { count: mockPrisma.commentReaction.count, groupBy: mockPrisma.commentReaction.groupBy },
        });
      });
    });

    it('should add a reaction successfully', async () => {
      const result = await service.addReaction({
        commentId: testCommentId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(result).toBeDefined();
      expect(result?.emoji).toBe('👍');
      expect(result?.commentId).toBe(testCommentId);
      expect(result?.userId).toBe(testUserId);
      expect(mockPrisma.commentReaction.create).toHaveBeenCalledTimes(1);
    });

    it('should add a reaction successfully for another user', async () => {
      mockPrisma.commentReaction.create.mockResolvedValue(
        createMockCommentReaction({
          userId: testUserId2
        })
      );

      const result = await service.addReaction({
        commentId: testCommentId,
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
          commentId: testCommentId,
          userId: testUserId,
          emoji: 'invalid'
        })
      ).rejects.toThrow('Invalid emoji format');
    });

    it('should throw error when userId not provided', async () => {
      await expect(
        service.addReaction({
          commentId: testCommentId,
          userId: '',
          emoji: '👍'
        })
      ).rejects.toThrow('userId must be provided');
    });

    it('should throw error when comment not found', async () => {
      mockPrisma.postComment.findUnique.mockResolvedValue(null);

      await expect(
        service.addReaction({
          commentId: '507f1f77bcf86cd799439099',
          userId: testUserId,
          emoji: '👍'
        })
      ).rejects.toThrow('Comment not found');
    });

    it('should throw error when comment is deleted', async () => {
      mockPrisma.postComment.findUnique.mockResolvedValue(
        createMockPostComment({ deletedAt: new Date() })
      );

      await expect(
        service.addReaction({
          commentId: testCommentId,
          userId: testUserId,
          emoji: '👍'
        })
      ).rejects.toThrow('Comment has been deleted');
    });

    it('should return existing reaction if already exists (idempotent)', async () => {
      const existingReaction = createMockCommentReaction();
      mockPrisma.commentReaction.findFirst.mockResolvedValue(existingReaction);

      const result = await service.addReaction({
        commentId: testCommentId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(result).toBeDefined();
      expect(mockPrisma.commentReaction.create).not.toHaveBeenCalled();
    });

    it('should throw error when max reactions per user reached', async () => {
      // User has already 1 different emoji (MAX_REACTIONS_PER_USER = 1)
      mockPrisma.commentReaction.findMany.mockResolvedValue([
        { emoji: '👍' }
      ]);

      await expect(
        service.addReaction({
          commentId: testCommentId,
          userId: testUserId,
          emoji: '❤️' // Trying to add 2nd different emoji
        })
      ).rejects.toThrow('Maximum 1 different reactions per comment reached');
    });

    it('should allow adding same emoji again (returns existing)', async () => {
      // User has 1 emoji
      mockPrisma.commentReaction.findMany.mockResolvedValue([
        { emoji: '👍' }
      ]);

      const existingReaction = createMockCommentReaction({ emoji: '👍' });
      mockPrisma.commentReaction.findFirst.mockResolvedValue(existingReaction);

      const result = await service.addReaction({
        commentId: testCommentId,
        userId: testUserId,
        emoji: '👍' // Same emoji, should not fail
      });

      expect(result).toBeDefined();
      expect(result?.emoji).toBe('👍');
    });

    it('should sanitize emoji before creating reaction', async () => {
      const result = await service.addReaction({
        commentId: testCommentId,
        userId: testUserId,
        emoji: '  👍  ' // With whitespace
      });

      expect(sanitizeEmoji).toHaveBeenCalledWith('  👍  ');
      expect(result).toBeDefined();
    });

    it('should update reactionSummary and reactionCount on successful add', async () => {
      await service.addReaction({
        commentId: testCommentId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(mockPrisma.postComment.update).toHaveBeenCalled();
    });
  });

  // ==============================================
  // REMOVE REACTION TESTS
  // ==============================================

  describe('removeReaction', () => {
    beforeEach(() => {
      mockPrisma.commentReaction.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.postComment.findUnique.mockResolvedValue(createMockPostComment());
      mockPrisma.postComment.update.mockResolvedValue(createMockPostComment());
      mockPrisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => {
        return fn({
          postComment: {
            findUnique: mockPrisma.postComment.findUnique,
            update: mockPrisma.postComment.update,
          },
          commentReaction: { count: mockPrisma.commentReaction.count, groupBy: mockPrisma.commentReaction.groupBy },
        });
      });
    });

    it('should remove a reaction successfully', async () => {
      const result = await service.removeReaction({
        commentId: testCommentId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(result).toBe(true);
      expect(mockPrisma.commentReaction.deleteMany).toHaveBeenCalledWith({
        where: {
          commentId: testCommentId,
          userId: testUserId,
          emoji: '👍'
        }
      });
    });

    it('should remove a reaction for another user', async () => {
      const result = await service.removeReaction({
        commentId: testCommentId,
        userId: testUserId2,
        emoji: '❤️'
      });

      expect(result).toBe(true);
      expect(mockPrisma.commentReaction.deleteMany).toHaveBeenCalledWith({
        where: {
          commentId: testCommentId,
          userId: testUserId2,
          emoji: '❤️'
        }
      });
    });

    it('should throw error for invalid emoji format', async () => {
      (sanitizeEmoji as jest.Mock).mockReturnValue(null);

      await expect(
        service.removeReaction({
          commentId: testCommentId,
          userId: testUserId,
          emoji: 'invalid'
        })
      ).rejects.toThrow('Invalid emoji format');
    });

    it('should return false when no reaction was deleted', async () => {
      mockPrisma.commentReaction.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.removeReaction({
        commentId: testCommentId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(result).toBe(false);
    });

    it('should update reactionSummary and reactionCount when a reaction is deleted', async () => {
      await service.removeReaction({
        commentId: testCommentId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(mockPrisma.postComment.update).toHaveBeenCalled();
    });

    it('should NOT update comment when no reaction was deleted', async () => {
      mockPrisma.commentReaction.deleteMany.mockResolvedValue({ count: 0 });

      await service.removeReaction({
        commentId: testCommentId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(mockPrisma.postComment.update).not.toHaveBeenCalled();
    });
  });

  // ==============================================
  // GET COMMENT REACTIONS TESTS
  // ==============================================

  describe('getCommentReactions', () => {
    it('should return aggregated reactions for a comment', async () => {
      mockPrisma.commentReaction.findMany.mockResolvedValue([
        createMockCommentReaction({ emoji: '👍', userId: 'user1' }),
        createMockCommentReaction({ emoji: '👍', userId: 'user2' }),
        createMockCommentReaction({ emoji: '❤️', userId: 'user3' }),
        createMockCommentReaction({ emoji: '❤️', userId: 'user4' })
      ]);

      const result = await service.getCommentReactions({
        commentId: testCommentId
      });

      expect(result.commentId).toBe(testCommentId);
      expect(result.totalCount).toBe(4);
      expect(result.reactions.length).toBe(2);
    });

    it('should include the owning postId so clients can locate the comment cache', async () => {
      mockPrisma.postComment.findUnique.mockResolvedValue(createMockPostComment());
      mockPrisma.commentReaction.findMany.mockResolvedValue([
        createMockCommentReaction({ emoji: '👍', userId: 'user1' })
      ]);

      const result = await service.getCommentReactions({
        commentId: testCommentId
      });

      expect(result.postId).toBe(testPostId);
    });

    it('should correctly aggregate reactions by emoji', async () => {
      mockPrisma.commentReaction.findMany.mockResolvedValue([
        createMockCommentReaction({ emoji: '👍', userId: 'user1' }),
        createMockCommentReaction({ emoji: '👍', userId: 'user2' }),
        createMockCommentReaction({ emoji: '👍', userId: 'user3' })
      ]);

      const result = await service.getCommentReactions({
        commentId: testCommentId
      });

      const thumbsUpAggregation = result.reactions.find(r => r.emoji === '👍');
      expect(thumbsUpAggregation?.count).toBe(3);
      expect(thumbsUpAggregation?.userIds.length).toBe(3);
    });

    it('should mark hasCurrentUser correctly for current user', async () => {
      mockPrisma.commentReaction.findMany.mockResolvedValue([
        createMockCommentReaction({ emoji: '👍', userId: testUserId }),
        createMockCommentReaction({ emoji: '❤️', userId: 'other-user' })
      ]);

      const result = await service.getCommentReactions({
        commentId: testCommentId,
        currentUserId: testUserId
      });

      const thumbsUp = result.reactions.find(r => r.emoji === '👍');
      const heart = result.reactions.find(r => r.emoji === '❤️');

      expect(thumbsUp?.hasCurrentUser).toBe(true);
      expect(heart?.hasCurrentUser).toBeFalsy();
    });

    it('should return userReactions list for current user', async () => {
      mockPrisma.commentReaction.findMany.mockResolvedValue([
        createMockCommentReaction({ emoji: '👍', userId: testUserId }),
        createMockCommentReaction({ emoji: '❤️', userId: testUserId }),
        createMockCommentReaction({ emoji: '🎉', userId: 'other-user' })
      ]);

      const result = await service.getCommentReactions({
        commentId: testCommentId,
        currentUserId: testUserId
      });

      expect(result.userReactions).toContain('👍');
      expect(result.userReactions).toContain('❤️');
      expect(result.userReactions).not.toContain('🎉');
    });

    it('should deduplicate userReactions', async () => {
      mockPrisma.commentReaction.findMany.mockResolvedValue([
        createMockCommentReaction({ id: 'r1', emoji: '👍', userId: testUserId }),
        createMockCommentReaction({ id: 'r2', emoji: '👍', userId: testUserId })
      ]);

      const result = await service.getCommentReactions({
        commentId: testCommentId,
        currentUserId: testUserId
      });

      const thumbsUpCount = result.userReactions.filter(e => e === '👍').length;
      expect(thumbsUpCount).toBe(1);
    });

    it('should return empty reactions when no reactions exist', async () => {
      mockPrisma.commentReaction.findMany.mockResolvedValue([]);

      const result = await service.getCommentReactions({
        commentId: testCommentId
      });

      expect(result.reactions).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.userReactions).toEqual([]);
    });
  });

  // ==============================================
  // GET EMOJI AGGREGATION TESTS
  // ==============================================

  describe('getEmojiAggregation', () => {
    it('should return aggregation for specific emoji', async () => {
      mockPrisma.commentReaction.findMany.mockResolvedValue([
        createMockCommentReaction({ emoji: '👍', userId: 'user1' }),
        createMockCommentReaction({ emoji: '👍', userId: 'user2' }),
        createMockCommentReaction({ emoji: '👍', userId: 'user3' })
      ]);

      const result = await service.getEmojiAggregation(
        testCommentId,
        '👍'
      );

      expect(result.emoji).toBe('👍');
      expect(result.count).toBe(3);
      expect(result.userIds.length).toBe(3);
    });

    it('should throw error for invalid emoji', async () => {
      (sanitizeEmoji as jest.Mock).mockReturnValue(null);

      await expect(
        service.getEmojiAggregation(testCommentId, 'invalid')
      ).rejects.toThrow('Invalid emoji format');
    });

    it('should mark hasCurrentUser correctly', async () => {
      mockPrisma.commentReaction.findMany.mockResolvedValue([
        createMockCommentReaction({ emoji: '👍', userId: testUserId }),
        createMockCommentReaction({ emoji: '👍', userId: 'other-user' })
      ]);

      const result = await service.getEmojiAggregation(
        testCommentId,
        '👍',
        testUserId
      );

      expect(result.hasCurrentUser).toBe(true);
    });

    it('should mark hasCurrentUser for second user', async () => {
      mockPrisma.commentReaction.findMany.mockResolvedValue([
        createMockCommentReaction({ emoji: '👍', userId: testUserId2 })
      ]);

      const result = await service.getEmojiAggregation(
        testCommentId,
        '👍',
        testUserId2
      );

      expect(result.hasCurrentUser).toBe(true);
    });

    it('should return empty aggregation when no reactions exist', async () => {
      mockPrisma.commentReaction.findMany.mockResolvedValue([]);

      const result = await service.getEmojiAggregation(
        testCommentId,
        '👍'
      );

      expect(result.count).toBe(0);
      expect(result.userIds).toEqual([]);
      expect(result.hasCurrentUser).toBe(false);
    });
  });

  // ==============================================
  // GET USER REACTIONS TESTS
  // ==============================================

  describe('getUserReactions', () => {
    it('should return reactions for a user', async () => {
      mockPrisma.commentReaction.findMany.mockResolvedValue([
        createMockCommentReaction({ emoji: '👍' }),
        createMockCommentReaction({ emoji: '❤️' })
      ]);

      const result = await service.getUserReactions(testUserId);

      expect(result.length).toBe(2);
      expect(mockPrisma.commentReaction.findMany).toHaveBeenCalledWith({
        where: { userId: testUserId },
        orderBy: { createdAt: 'desc' },
        take: 100
      });
    });

    it('should return empty array when user has no reactions', async () => {
      mockPrisma.commentReaction.findMany.mockResolvedValue([]);

      const result = await service.getUserReactions(testUserId);

      expect(result).toEqual([]);
    });

    it('should limit results to 100 for performance', async () => {
      mockPrisma.commentReaction.findMany.mockResolvedValue([]);

      await service.getUserReactions(testUserId);

      expect(mockPrisma.commentReaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 })
      );
    });
  });

  // ==============================================
  // HAS USER REACTED TESTS
  // ==============================================

  describe('hasUserReacted', () => {
    it('should return true if user has reacted with emoji', async () => {
      mockPrisma.commentReaction.findFirst.mockResolvedValue(createMockCommentReaction());

      const result = await service.hasUserReacted(
        testCommentId,
        '👍',
        testUserId
      );

      expect(result).toBe(true);
    });

    it('should return false if user has not reacted with emoji', async () => {
      mockPrisma.commentReaction.findFirst.mockResolvedValue(null);

      const result = await service.hasUserReacted(
        testCommentId,
        '👍',
        testUserId
      );

      expect(result).toBe(false);
    });

    it('should return false for invalid emoji', async () => {
      (sanitizeEmoji as jest.Mock).mockReturnValue(null);

      const result = await service.hasUserReacted(
        testCommentId,
        'invalid',
        testUserId
      );

      expect(result).toBe(false);
    });

    it('should check for different user', async () => {
      mockPrisma.commentReaction.findFirst.mockResolvedValue(
        createMockCommentReaction({ userId: testUserId2 })
      );

      const result = await service.hasUserReacted(
        testCommentId,
        '👍',
        testUserId2
      );

      expect(result).toBe(true);
      expect(mockPrisma.commentReaction.findFirst).toHaveBeenCalledWith({
        where: {
          commentId: testCommentId,
          emoji: '👍',
          userId: testUserId2
        }
      });
    });
  });

  // ==============================================
  // DELETE COMMENT REACTIONS TESTS
  // ==============================================

  describe('deleteCommentReactions', () => {
    it('should delete all reactions for a comment', async () => {
      mockPrisma.commentReaction.deleteMany.mockResolvedValue({ count: 5 });
      mockPrisma.postComment.update.mockResolvedValue(createMockPostComment());

      const result = await service.deleteCommentReactions(testCommentId);

      expect(result).toBe(5);
      expect(mockPrisma.commentReaction.deleteMany).toHaveBeenCalledWith({
        where: { commentId: testCommentId }
      });
    });

    it('should return 0 when no reactions to delete', async () => {
      mockPrisma.commentReaction.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.deleteCommentReactions(testCommentId);

      expect(result).toBe(0);
    });

    it('should update comment reactionSummary and reactionCount when reactions deleted', async () => {
      mockPrisma.commentReaction.deleteMany.mockResolvedValue({ count: 3 });
      mockPrisma.postComment.update.mockResolvedValue(createMockPostComment());

      await service.deleteCommentReactions(testCommentId);

      expect(mockPrisma.postComment.update).toHaveBeenCalledWith({
        where: { id: testCommentId },
        data: {
          reactionSummary: {},
          reactionCount: 0
        }
      });
    });

    it('should NOT update comment when no reactions deleted', async () => {
      mockPrisma.commentReaction.deleteMany.mockResolvedValue({ count: 0 });

      await service.deleteCommentReactions(testCommentId);

      expect(mockPrisma.postComment.update).not.toHaveBeenCalled();
    });
  });

  // ==============================================
  // CREATE UPDATE EVENT TESTS
  // ==============================================

  describe('createUpdateEvent', () => {
    beforeEach(() => {
      mockPrisma.commentReaction.findMany.mockResolvedValue([
        createMockCommentReaction({ emoji: '👍', userId: testUserId })
      ]);
    });

    it('should create add event with aggregation', async () => {
      const result = await service.createUpdateEvent(
        testCommentId,
        '👍',
        'add',
        testUserId,
        testPostId
      );

      expect(result.commentId).toBe(testCommentId);
      expect(result.emoji).toBe('👍');
      expect(result.action).toBe('add');
      expect(result.userId).toBe(testUserId);
      expect(result.postId).toBe(testPostId);
      expect(result.aggregation).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should create remove event with aggregation', async () => {
      mockPrisma.commentReaction.findMany.mockResolvedValue([]);

      const result = await service.createUpdateEvent(
        testCommentId,
        '👍',
        'remove',
        testUserId,
        testPostId
      );

      expect(result.action).toBe('remove');
      expect(result.aggregation.count).toBe(0);
    });

    it('should create event for different user', async () => {
      mockPrisma.commentReaction.findMany.mockResolvedValue([
        createMockCommentReaction({ userId: testUserId2 })
      ]);

      const result = await service.createUpdateEvent(
        testCommentId,
        '👍',
        'add',
        testUserId2,
        testPostId
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
          commentId: testCommentId,
          userId: testUserId,
          emoji: '👍'
        });
      }).not.toThrow();
    });

    it('should throw error when commentId is missing', () => {
      expect(() => {
        service.validateAddReactionOptions({
          commentId: '',
          userId: testUserId,
          emoji: '👍'
        });
      }).toThrow('commentId is required');
    });

    it('should throw error when userId not provided', () => {
      expect(() => {
        service.validateAddReactionOptions({
          commentId: testCommentId,
          userId: '',
          emoji: '👍'
        });
      }).toThrow('userId must be provided');
    });

    it('should throw error when emoji is missing', () => {
      expect(() => {
        service.validateAddReactionOptions({
          commentId: testCommentId,
          userId: testUserId,
          emoji: ''
        });
      }).toThrow('emoji is required');
    });

    it('should throw error for invalid emoji format', () => {
      (isValidEmoji as jest.Mock).mockReturnValue(false);

      expect(() => {
        service.validateAddReactionOptions({
          commentId: testCommentId,
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
          commentId: testCommentId,
          userId: testUserId,
          emoji: '👍'
        });
      }).not.toThrow();
    });

    it('should throw error when commentId is missing', () => {
      expect(() => {
        service.validateRemoveReactionOptions({
          commentId: '',
          userId: testUserId,
          emoji: '👍'
        });
      }).toThrow('commentId is required');
    });

    it('should throw error when userId not provided', () => {
      expect(() => {
        service.validateRemoveReactionOptions({
          commentId: testCommentId,
          userId: '',
          emoji: '👍'
        });
      }).toThrow('userId must be provided');
    });

    it('should throw error when emoji is missing', () => {
      expect(() => {
        service.validateRemoveReactionOptions({
          commentId: testCommentId,
          userId: testUserId,
          emoji: ''
        });
      }).toThrow('emoji is required');
    });

    it('should throw error for invalid emoji format', () => {
      (isValidEmoji as jest.Mock).mockReturnValue(false);

      expect(() => {
        service.validateRemoveReactionOptions({
          commentId: testCommentId,
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
      mockPrisma.postComment.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(
        service.addReaction({
          commentId: testCommentId,
          userId: testUserId,
          emoji: '👍'
        })
      ).rejects.toThrow('Database error');
    });

    it('should handle database errors in removeReaction gracefully', async () => {
      mockPrisma.commentReaction.deleteMany.mockRejectedValue(new Error('Database error'));

      await expect(
        service.removeReaction({
          commentId: testCommentId,
          userId: testUserId,
          emoji: '👍'
        })
      ).rejects.toThrow('Database error');
    });

    it('should handle database errors in getCommentReactions gracefully', async () => {
      mockPrisma.commentReaction.findMany.mockRejectedValue(new Error('Database error'));

      await expect(
        service.getCommentReactions({
          commentId: testCommentId
        })
      ).rejects.toThrow('Database error');
    });

    it('should handle empty comment ID', async () => {
      mockPrisma.postComment.findUnique.mockResolvedValue(null);

      await expect(
        service.addReaction({
          commentId: '',
          userId: testUserId,
          emoji: '👍'
        })
      ).rejects.toThrow();
    });

    it('should handle whitespace-only emoji', async () => {
      (sanitizeEmoji as jest.Mock).mockReturnValue(null);

      await expect(
        service.addReaction({
          commentId: testCommentId,
          userId: testUserId,
          emoji: '   '
        })
      ).rejects.toThrow('Invalid emoji format');
    });

    it('should correctly map comment reaction data', async () => {
      const mockReaction = createMockCommentReaction({
        userId: testUserId2
      });

      mockPrisma.commentReaction.findMany.mockResolvedValue([mockReaction]);

      const result = await service.getUserReactions(testUserId);

      expect(result[0].userId).toBe(testUserId2);
    });
  });

  // ==============================================
  // REACTION DATA MAPPING TESTS
  // ==============================================

  describe('CommentReaction Data Mapping', () => {
    it('should correctly map all comment reaction fields', async () => {
      const mockReaction = createMockCommentReaction({
        id: 'reaction-123',
        commentId: 'comment-456',
        userId: 'user-789',
        emoji: '🎉',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-02T00:00:00Z')
      });

      mockPrisma.commentReaction.findMany.mockResolvedValue([mockReaction]);

      const result = await service.getUserReactions('user-789');

      expect(result[0]).toEqual({
        id: 'reaction-123',
        commentId: 'comment-456',
        userId: 'user-789',
        emoji: '🎉',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-02T00:00:00Z')
      });
    });
  });

  // ==============================================
  // P2002 CONCURRENT INSERT IDEMPOTENCY (Fix 2)
  // ==============================================

  describe('addReaction — P2002 concurrent insert', () => {
    beforeEach(() => {
      mockPrisma.postComment.findUnique.mockResolvedValue(createMockPostComment());
      mockPrisma.commentReaction.findMany.mockResolvedValue([]);
      mockPrisma.commentReaction.findFirst.mockResolvedValue(null);
      mockPrisma.postComment.update.mockResolvedValue(createMockPostComment());
      mockPrisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => {
        return fn({
          postComment: {
            findUnique: mockPrisma.postComment.findUnique,
            update: mockPrisma.postComment.update,
          },
          commentReaction: { count: mockPrisma.commentReaction.count, groupBy: mockPrisma.commentReaction.groupBy },
        });
      });
    });

    it('test_addReaction_P2002_concurrentInsert_returnsExistingRecordWithoutThrowing', async () => {
      const existingReaction = createMockCommentReaction();
      const p2002Error = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

      // First findFirst (pre-check) returns null — concurrent race condition
      mockPrisma.commentReaction.findFirst
        .mockResolvedValueOnce(null)    // pre-check: not found
        .mockResolvedValueOnce(existingReaction); // recovery lookup after P2002

      mockPrisma.commentReaction.create.mockRejectedValue(p2002Error);

      const result = await service.addReaction({
        commentId: testCommentId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(result).toBeDefined();
      expect(result?.id).toBe(existingReaction.id);
      // updateCommentReactionSummary must NOT be called (race winner already updated it)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('test_addReaction_otherDbError_rethrows', async () => {
      const dbError = Object.assign(new Error('Connection timeout'), { code: 'P1001' });

      mockPrisma.commentReaction.findFirst.mockResolvedValueOnce(null);
      mockPrisma.commentReaction.create.mockRejectedValue(dbError);

      await expect(
        service.addReaction({
          commentId: testCommentId,
          userId: testUserId,
          emoji: '👍'
        })
      ).rejects.toThrow('Connection timeout');
    });
  });

  // ==============================================
  // TRANSACTION WRAPS REACTION SUMMARY (Fix 3)
  // ==============================================

  describe('updateCommentReactionSummary — $transaction + authoritative groupBy recompute', () => {
    beforeEach(() => {
      mockPrisma.postComment.findUnique.mockResolvedValue(createMockPostComment());
      mockPrisma.commentReaction.findMany.mockResolvedValue([]);
      mockPrisma.commentReaction.findFirst.mockResolvedValue(null);
      mockPrisma.commentReaction.create.mockResolvedValue(createMockCommentReaction());
      mockPrisma.postComment.update.mockResolvedValue(createMockPostComment());
      mockPrisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => {
        return fn({
          postComment: {
            findUnique: mockPrisma.postComment.findUnique,
            update: mockPrisma.postComment.update,
          },
          commentReaction: { count: mockPrisma.commentReaction.count, groupBy: mockPrisma.commentReaction.groupBy },
        });
      });
    });

    it('test_addReaction_callsPrismaTransaction_forSummaryUpdate', async () => {
      await service.addReaction({
        commentId: testCommentId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('test_removeReaction_callsPrismaTransaction_forSummaryUpdate', async () => {
      mockPrisma.commentReaction.deleteMany.mockResolvedValue({ count: 1 });

      await service.removeReaction({
        commentId: testCommentId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('test_removeReaction_noDeletedRow_doesNotCallTransaction', async () => {
      mockPrisma.commentReaction.deleteMany.mockResolvedValue({ count: 0 });

      await service.removeReaction({
        commentId: testCommentId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('test_addReaction_writesReactionSummaryFromGroupBy_notDelta', async () => {
      // La carte reactionSummary DOIT être recomputée depuis groupBy(CommentReaction),
      // pas dérivée par delta de la valeur préalable (auto-réparant vs emoji fantôme).
      mockPrisma.postComment.findUnique.mockResolvedValue(
        createMockPostComment({ reactionSummary: { '🔥': 99 }, reactionCount: 99 })
      );
      mockPrisma.commentReaction.groupBy.mockResolvedValue([
        { emoji: '👍', _count: { emoji: 3 } },
        { emoji: '❤️', _count: { emoji: 2 } }
      ]);

      await service.addReaction({
        commentId: testCommentId,
        userId: testUserId,
        emoji: '❤️'
      });

      expect(mockPrisma.commentReaction.groupBy).toHaveBeenCalledWith({
        by: ['emoji'],
        where: { commentId: testCommentId },
        _count: { emoji: true }
      });
      expect(mockPrisma.postComment.update).toHaveBeenCalledWith({
        where: { id: testCommentId },
        data: { reactionSummary: { '👍': 3, '❤️': 2 }, reactionCount: 5, likeCount: 5 }
      });
    });

    it('test_removeReaction_writesReactionSummaryFromGroupBy_notDelta', async () => {
      mockPrisma.commentReaction.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.postComment.findUnique.mockResolvedValue(
        createMockPostComment({ reactionSummary: { '👍': 3 }, reactionCount: 3 })
      );
      mockPrisma.commentReaction.groupBy.mockResolvedValue([
        { emoji: '👍', _count: { emoji: 2 } }
      ]);

      await service.removeReaction({
        commentId: testCommentId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(mockPrisma.postComment.update).toHaveBeenCalledWith({
        where: { id: testCommentId },
        data: { reactionSummary: { '👍': 2 }, reactionCount: 2, likeCount: 2 }
      });
    });

    it('test_lastReactionRemoved_writesEmptySummaryAndZeroCounts', async () => {
      mockPrisma.commentReaction.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.postComment.findUnique.mockResolvedValue(
        createMockPostComment({ reactionSummary: { '👍': 1 }, reactionCount: 1 })
      );
      mockPrisma.commentReaction.groupBy.mockResolvedValue([]);

      await service.removeReaction({
        commentId: testCommentId,
        userId: testUserId,
        emoji: '👍'
      });

      expect(mockPrisma.postComment.update).toHaveBeenCalledWith({
        where: { id: testCommentId },
        data: { reactionSummary: {}, reactionCount: 0, likeCount: 0 }
      });
    });
  });

  // ==============================================
  // AGGREGATION EDGE CASES
  // ==============================================

  describe('Aggregation Edge Cases', () => {
    it('should handle multiple users with same emoji correctly', async () => {
      mockPrisma.commentReaction.findMany.mockResolvedValue([
        createMockCommentReaction({ userId: 'user1', emoji: '👍' }),
        createMockCommentReaction({ userId: 'user2', emoji: '👍' }),
        createMockCommentReaction({ userId: 'user3', emoji: '👍' }),
        createMockCommentReaction({ userId: 'user4', emoji: '👍' }),
        createMockCommentReaction({ userId: 'user5', emoji: '👍' })
      ]);

      const result = await service.getCommentReactions({
        commentId: testCommentId
      });

      const thumbsUp = result.reactions.find(r => r.emoji === '👍');
      expect(thumbsUp?.count).toBe(5);
      expect(thumbsUp?.userIds.length).toBe(5);
    });

    it('should handle reactions ordered by createdAt', async () => {
      mockPrisma.commentReaction.findMany.mockResolvedValue([]);

      await service.getCommentReactions({
        commentId: testCommentId
      });

      expect(mockPrisma.commentReaction.findMany).toHaveBeenCalledWith({
        where: { commentId: testCommentId },
        orderBy: { createdAt: 'asc' }
      });
    });

    it('should handle hasCurrentUser with currentUserId', async () => {
      mockPrisma.commentReaction.findMany.mockResolvedValue([
        createMockCommentReaction({ userId: testUserId, emoji: '👍' }),
        createMockCommentReaction({ userId: testUserId2, emoji: '❤️' })
      ]);

      const result = await service.getCommentReactions({
        commentId: testCommentId,
        currentUserId: testUserId
      });

      const thumbsUp = result.reactions.find(r => r.emoji === '👍');
      const heart = result.reactions.find(r => r.emoji === '❤️');

      expect(thumbsUp?.hasCurrentUser).toBe(true);
      expect(heart?.hasCurrentUser).toBe(false);
    });
  });
});
