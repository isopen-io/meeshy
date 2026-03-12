/**
 * ReactionService Comprehensive Unit Tests
 *
 * This test suite provides thorough coverage of the ReactionService including:
 * - Adding reactions with emoji validation
 * - Removing reactions
 * - Permission checking for authenticated and anonymous users
 * - Reaction aggregation by emoji
 * - Getting message reactions with sync data
 * - Getting user reactions (authenticated and anonymous)
 * - Checking if user has reacted
 * - Deleting all reactions for a message
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
import { ReactionService, createReactionService } from '../../../services/ReactionService';
import type { PrismaClient, Reaction } from '@meeshy/shared/prisma/client';
import { sanitizeEmoji, isValidEmoji } from '@meeshy/shared/types/reaction';

describe('ReactionService', () => {
  let service: ReactionService;
  let mockPrisma: any;

  // Sample test data
  const testParticipantId = '507f1f77bcf86cd799439011';
  const testParticipantId2 = 'anon-participant-123';
  const testMessageId = '507f1f77bcf86cd799439022';
  const testConversationId = '507f1f77bcf86cd799439033';
  const testReactionId = '507f1f77bcf86cd799439044';

  const createMockReaction = (overrides: Partial<Reaction> = {}): Reaction => ({
    id: testReactionId,
    messageId: testMessageId,
    participantId: testParticipantId,
    emoji: '👍',
    createdAt: new Date('2025-01-06T12:00:00Z'),
    updatedAt: new Date('2025-01-06T12:00:00Z'),
    ...overrides
  } as Reaction);

  const createMockMessage = (overrides: any = {}) => ({
    id: testMessageId,
    conversationId: testConversationId,
    conversation: {
      id: testConversationId,
      participants: [
        { id: testParticipantId, isActive: true },
        { id: testParticipantId2, isActive: true }
      ]
    },
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
      message: {
        findUnique: jest.fn(),
        update: jest.fn()
      },
      reaction: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn()
      },
      participant: {
        findMany: jest.fn().mockResolvedValue([])
      }
    };

    // Create service instance
    service = new ReactionService(mockPrisma as unknown as PrismaClient);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==============================================
  // FACTORY FUNCTION TESTS
  // ==============================================

  describe('createReactionService', () => {
    it('should create a ReactionService instance', () => {
      const reactionService = createReactionService(mockPrisma as unknown as PrismaClient);
      expect(reactionService).toBeInstanceOf(ReactionService);
    });
  });

  // ==============================================
  // ADD REACTION TESTS
  // ==============================================

  describe('addReaction', () => {
    beforeEach(() => {
      mockPrisma.message.findUnique.mockResolvedValue(createMockMessage());
      mockPrisma.reaction.findMany.mockResolvedValue([]);
      mockPrisma.reaction.findFirst.mockResolvedValue(null);
      mockPrisma.reaction.create.mockResolvedValue(createMockReaction());
    });

    it('should add a reaction successfully for authenticated user', async () => {
      const result = await service.addReaction({
        messageId: testMessageId,
        participantId: testParticipantId,
        emoji: '👍'
      });

      expect(result).toBeDefined();
      expect(result?.emoji).toBe('👍');
      expect(result?.messageId).toBe(testMessageId);
      expect(result?.participantId).toBe(testParticipantId);
      expect(mockPrisma.reaction.create).toHaveBeenCalledTimes(1);
    });

    it('should add a reaction successfully for another participant', async () => {
      mockPrisma.reaction.create.mockResolvedValue(
        createMockReaction({
          participantId: testParticipantId2
        })
      );

      const result = await service.addReaction({
        messageId: testMessageId,
        participantId: testParticipantId2,
        emoji: '❤️'
      });

      expect(result).toBeDefined();
      expect(result?.participantId).toBe(testParticipantId2);
    });

    it('should throw error for invalid emoji format', async () => {
      (sanitizeEmoji as jest.Mock).mockReturnValue(null);

      await expect(
        service.addReaction({
          messageId: testMessageId,
          participantId: testParticipantId,
          emoji: 'invalid'
        })
      ).rejects.toThrow('Invalid emoji format');
    });

    it('should throw error when participantId not provided', async () => {
      await expect(
        service.addReaction({
          messageId: testMessageId,
          participantId: '',
          emoji: '👍'
        })
      ).rejects.toThrow('participantId must be provided');
    });

    it('should throw error when message not found', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.addReaction({
          messageId: 'non-existent',
          participantId: testParticipantId,
          emoji: '👍'
        })
      ).rejects.toThrow('Message not found');
    });

    it('should throw error when user is not a participant of conversation', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(
        createMockMessage({
          conversation: {
            participants: [{ id: 'other-user', isActive: true }]
          }
        })
      );

      await expect(
        service.addReaction({
          messageId: testMessageId,
          participantId: testParticipantId,
          emoji: '👍'
        })
      ).rejects.toThrow('User is not a participant of this conversation');
    });

    it('should throw error when anonymous user is not a participant', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(
        createMockMessage({
          conversation: {
            members: [],
            participants: [{ id: 'other-anon', isActive: true }]
          }
        })
      );

      await expect(
        service.addReaction({
          messageId: testMessageId,
          participantId: testParticipantId2,
          emoji: '👍'
        })
      ).rejects.toThrow('User is not a participant of this conversation');
    });

    it('should return existing reaction if already exists', async () => {
      const existingReaction = createMockReaction();
      mockPrisma.reaction.findFirst.mockResolvedValue(existingReaction);

      const result = await service.addReaction({
        messageId: testMessageId,
        participantId: testParticipantId,
        emoji: '👍'
      });

      expect(result).toBeDefined();
      expect(mockPrisma.reaction.create).not.toHaveBeenCalled();
    });

    it('should throw error when max reactions per user reached', async () => {
      // User has already 3 different emojis
      mockPrisma.reaction.findMany.mockResolvedValue([
        { emoji: '👍' },
        { emoji: '❤️' },
        { emoji: '🎉' }
      ]);

      await expect(
        service.addReaction({
          messageId: testMessageId,
          participantId: testParticipantId,
          emoji: '🔥' // Trying to add 4th different emoji
        })
      ).rejects.toThrow('Maximum 3 different reactions per message reached');
    });

    it('should allow adding same emoji again (returns existing)', async () => {
      // User has 3 different emojis
      mockPrisma.reaction.findMany.mockResolvedValue([
        { emoji: '👍' },
        { emoji: '❤️' },
        { emoji: '🎉' }
      ]);

      const existingReaction = createMockReaction({ emoji: '👍' });
      mockPrisma.reaction.findFirst.mockResolvedValue(existingReaction);

      const result = await service.addReaction({
        messageId: testMessageId,
        participantId: testParticipantId,
        emoji: '👍' // Same emoji, should not fail
      });

      expect(result).toBeDefined();
      expect(result?.emoji).toBe('👍');
    });

    it('should allow adding reaction when user has less than 3 emojis', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([
        { emoji: '👍' },
        { emoji: '❤️' }
      ]);

      const result = await service.addReaction({
        messageId: testMessageId,
        participantId: testParticipantId,
        emoji: '🎉'
      });

      expect(result).toBeDefined();
      expect(mockPrisma.reaction.create).toHaveBeenCalled();
    });

    it('should sanitize emoji before creating reaction', async () => {
      const result = await service.addReaction({
        messageId: testMessageId,
        participantId: testParticipantId,
        emoji: '  👍  ' // With whitespace
      });

      expect(sanitizeEmoji).toHaveBeenCalledWith('  👍  ');
      expect(result).toBeDefined();
    });
  });

  // ==============================================
  // REMOVE REACTION TESTS
  // ==============================================

  describe('removeReaction', () => {
    beforeEach(() => {
      mockPrisma.reaction.deleteMany.mockResolvedValue({ count: 1 });
    });

    it('should remove a reaction successfully for authenticated user', async () => {
      const result = await service.removeReaction({
        messageId: testMessageId,
        participantId: testParticipantId,
        emoji: '👍'
      });

      expect(result).toBe(true);
      expect(mockPrisma.reaction.deleteMany).toHaveBeenCalledWith({
        where: {
          messageId: testMessageId,
          participantId: testParticipantId,
          emoji: '👍'
        }
      });
    });

    it('should remove a reaction successfully for anonymous user', async () => {
      const result = await service.removeReaction({
        messageId: testMessageId,
        participantId: testParticipantId2,
        emoji: '❤️'
      });

      expect(result).toBe(true);
      expect(mockPrisma.reaction.deleteMany).toHaveBeenCalledWith({
        where: {
          messageId: testMessageId,
          participantId: testParticipantId2,
          emoji: '❤️'
        }
      });
    });

    it('should throw error for invalid emoji format', async () => {
      (sanitizeEmoji as jest.Mock).mockReturnValue(null);

      await expect(
        service.removeReaction({
          messageId: testMessageId,
          participantId: testParticipantId,
          emoji: 'invalid'
        })
      ).rejects.toThrow('Invalid emoji format');
    });

    it('should return false when no reaction was deleted', async () => {
      mockPrisma.reaction.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.removeReaction({
        messageId: testMessageId,
        participantId: testParticipantId,
        emoji: '👍'
      });

      expect(result).toBe(false);
    });
  });

  // ==============================================
  // GET MESSAGE REACTIONS TESTS
  // ==============================================

  describe('getMessageReactions', () => {
    it('should return aggregated reactions for a message', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([
        createMockReaction({ emoji: '👍', participantId: 'user1' }),
        createMockReaction({ emoji: '👍', participantId: 'user2' }),
        createMockReaction({ emoji: '❤️', participantId: 'user3' }),
        createMockReaction({ emoji: '❤️', participantId: 'anon1' })
      ]);

      const result = await service.getMessageReactions({
        messageId: testMessageId
      });

      expect(result.messageId).toBe(testMessageId);
      expect(result.totalCount).toBe(4);
      expect(result.reactions.length).toBe(2);
    });

    it('should correctly aggregate reactions by emoji', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([
        createMockReaction({ emoji: '👍', participantId: 'user1' }),
        createMockReaction({ emoji: '👍', participantId: 'user2' }),
        createMockReaction({ emoji: '👍', participantId: 'anon1' })
      ]);

      const result = await service.getMessageReactions({
        messageId: testMessageId
      });

      const thumbsUpAggregation = result.reactions.find(r => r.emoji === '👍');
      expect(thumbsUpAggregation?.count).toBe(3);
      expect(thumbsUpAggregation?.participantIds.length).toBe(3);
    });

    it('should mark hasCurrentUser correctly for authenticated user', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([
        createMockReaction({ emoji: '👍', participantId: testParticipantId }),
        createMockReaction({ emoji: '❤️', participantId: 'other-user' })
      ]);

      const result = await service.getMessageReactions({
        messageId: testMessageId,
        currentParticipantId: testParticipantId
      });

      const thumbsUp = result.reactions.find(r => r.emoji === '👍');
      const heart = result.reactions.find(r => r.emoji === '❤️');

      expect(thumbsUp?.hasCurrentUser).toBe(true);
      // When currentParticipantId doesn't match, hasCurrentUser is false
      expect(heart?.hasCurrentUser).toBeFalsy();
    });

    it('should mark hasCurrentUser correctly for anonymous user', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([
        createMockReaction({ emoji: '👍', participantId: testParticipantId2 }),
        createMockReaction({ emoji: '❤️', participantId: 'some-user' })
      ]);

      const result = await service.getMessageReactions({
        messageId: testMessageId,
        currentParticipantId: testParticipantId2
      });

      const thumbsUp = result.reactions.find(r => r.emoji === '👍');
      const heart = result.reactions.find(r => r.emoji === '❤️');

      expect(thumbsUp?.hasCurrentUser).toBe(true);
      expect(heart?.hasCurrentUser).toBe(false);
    });

    it('should return userReactions list for current user', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([
        createMockReaction({ emoji: '👍', participantId: testParticipantId }),
        createMockReaction({ emoji: '❤️', participantId: testParticipantId }),
        createMockReaction({ emoji: '🎉', participantId: 'other-user' })
      ]);

      const result = await service.getMessageReactions({
        messageId: testMessageId,
        currentParticipantId: testParticipantId
      });

      expect(result.userReactions).toContain('👍');
      expect(result.userReactions).toContain('❤️');
      expect(result.userReactions).not.toContain('🎉');
    });

    it('should deduplicate userReactions', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([
        createMockReaction({ id: 'r1', emoji: '👍', participantId: testParticipantId }),
        createMockReaction({ id: 'r2', emoji: '👍', participantId: testParticipantId }) // Duplicate shouldn't happen but test dedup
      ]);

      const result = await service.getMessageReactions({
        messageId: testMessageId,
        currentParticipantId: testParticipantId
      });

      // Should be deduplicated
      const thumbsUpCount = result.userReactions.filter(e => e === '👍').length;
      expect(thumbsUpCount).toBe(1);
    });

    it('should return empty reactions when no reactions exist', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([]);

      const result = await service.getMessageReactions({
        messageId: testMessageId
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
      mockPrisma.reaction.findMany.mockResolvedValue([
        createMockReaction({ emoji: '👍', participantId: 'user1' }),
        createMockReaction({ emoji: '👍', participantId: 'user2' }),
        createMockReaction({ emoji: '👍', participantId: 'anon1' })
      ]);

      const result = await service.getEmojiAggregation(
        testMessageId,
        '👍'
      );

      expect(result.emoji).toBe('👍');
      expect(result.count).toBe(3);
      expect(result.participantIds.length).toBe(3);
    });

    it('should throw error for invalid emoji', async () => {
      (sanitizeEmoji as jest.Mock).mockReturnValue(null);

      await expect(
        service.getEmojiAggregation(testMessageId, 'invalid')
      ).rejects.toThrow('Invalid emoji format');
    });

    it('should mark hasCurrentUser correctly', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([
        createMockReaction({ emoji: '👍', participantId: testParticipantId }),
        createMockReaction({ emoji: '👍', participantId: 'other-user' })
      ]);

      const result = await service.getEmojiAggregation(
        testMessageId,
        '👍',
        testParticipantId
      );

      expect(result.hasCurrentUser).toBe(true);
    });

    it('should mark hasCurrentUser for anonymous user', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([
        createMockReaction({ emoji: '👍', participantId: testParticipantId2 })
      ]);

      const result = await service.getEmojiAggregation(
        testMessageId,
        '👍',
        testParticipantId2
      );

      expect(result.hasCurrentUser).toBe(true);
    });

    it('should return empty aggregation when no reactions exist', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([]);

      const result = await service.getEmojiAggregation(
        testMessageId,
        '👍'
      );

      expect(result.count).toBe(0);
      expect(result.participantIds).toEqual([]);
      // anonymous no longer separate;
      expect(result.hasCurrentUser).toBe(false);
    });
  });

  // ==============================================
  // GET USER REACTIONS TESTS
  // ==============================================

  describe('getParticipantReactions', () => {
    it('should return reactions for authenticated user', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([
        createMockReaction({ emoji: '👍' }),
        createMockReaction({ emoji: '❤️' })
      ]);

      const result = await service.getParticipantReactions(testParticipantId);

      expect(result.length).toBe(2);
      expect(mockPrisma.reaction.findMany).toHaveBeenCalledWith({
        where: { participantId: testParticipantId },
        orderBy: { createdAt: 'desc' },
        take: 100
      });
    });

    it('should return empty array when user has no reactions', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([]);

      const result = await service.getParticipantReactions(testParticipantId);

      expect(result).toEqual([]);
    });

    it('should limit results to 100 for performance', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([]);

      await service.getParticipantReactions(testParticipantId);

      expect(mockPrisma.reaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 })
      );
    });
  });

  // ==============================================
  // GET ANONYMOUS USER REACTIONS TESTS
  // ==============================================

  describe('getParticipantReactions (formerly anonymous)', () => {
    it('should return reactions for anonymous user', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([
        createMockReaction({ participantId: testParticipantId2, emoji: '👍' })
      ]);

      const result = await service.getParticipantReactions(testParticipantId2);

      expect(result.length).toBe(1);
      expect(mockPrisma.reaction.findMany).toHaveBeenCalledWith({
        where: { participantId: testParticipantId2 },
        orderBy: { createdAt: 'desc' },
        take: 100
      });
    });

    it('should return empty array when anonymous user has no reactions', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([]);

      const result = await service.getParticipantReactions(testParticipantId2);

      expect(result).toEqual([]);
    });
  });

  // ==============================================
  // HAS USER REACTED TESTS
  // ==============================================

  describe('hasParticipantReacted', () => {
    it('should return true if user has reacted with emoji', async () => {
      mockPrisma.reaction.findFirst.mockResolvedValue(createMockReaction());

      const result = await service.hasParticipantReacted(
        testMessageId,
        '👍',
        testParticipantId
      );

      expect(result).toBe(true);
    });

    it('should return false if user has not reacted with emoji', async () => {
      mockPrisma.reaction.findFirst.mockResolvedValue(null);

      const result = await service.hasParticipantReacted(
        testMessageId,
        '👍',
        testParticipantId
      );

      expect(result).toBe(false);
    });

    it('should return false for invalid emoji', async () => {
      (sanitizeEmoji as jest.Mock).mockReturnValue(null);

      const result = await service.hasParticipantReacted(
        testMessageId,
        'invalid',
        testParticipantId
      );

      expect(result).toBe(false);
    });

    it('should check for different participant', async () => {
      mockPrisma.reaction.findFirst.mockResolvedValue(
        createMockReaction({ participantId: testParticipantId2 })
      );

      const result = await service.hasParticipantReacted(
        testMessageId,
        '👍',
        testParticipantId2
      );

      expect(result).toBe(true);
      expect(mockPrisma.reaction.findFirst).toHaveBeenCalledWith({
        where: {
          messageId: testMessageId,
          emoji: '👍',
          participantId: testParticipantId2
        }
      });
    });
  });

  // ==============================================
  // DELETE MESSAGE REACTIONS TESTS
  // ==============================================

  describe('deleteMessageReactions', () => {
    it('should delete all reactions for a message', async () => {
      mockPrisma.reaction.deleteMany.mockResolvedValue({ count: 5 });

      const result = await service.deleteMessageReactions(testMessageId);

      expect(result).toBe(5);
      expect(mockPrisma.reaction.deleteMany).toHaveBeenCalledWith({
        where: { messageId: testMessageId }
      });
    });

    it('should return 0 when no reactions to delete', async () => {
      mockPrisma.reaction.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.deleteMessageReactions(testMessageId);

      expect(result).toBe(0);
    });
  });

  // ==============================================
  // CREATE UPDATE EVENT TESTS
  // ==============================================

  describe('createUpdateEvent', () => {
    beforeEach(() => {
      mockPrisma.reaction.findMany.mockResolvedValue([
        createMockReaction({ emoji: '👍', participantId: testParticipantId })
      ]);
    });

    it('should create add event with aggregation', async () => {
      const result = await service.createUpdateEvent(
        testMessageId,
        '👍',
        'add',
        testParticipantId,
        'conv123'
      );

      expect(result.messageId).toBe(testMessageId);
      expect(result.emoji).toBe('👍');
      expect(result.action).toBe('add');
      expect(result.participantId).toBe(testParticipantId);
      expect(result.conversationId).toBe('conv123');
      expect(result.aggregation).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should create remove event with aggregation', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([]);

      const result = await service.createUpdateEvent(
        testMessageId,
        '👍',
        'remove',
        testParticipantId,
        'conv123'
      );

      expect(result.action).toBe('remove');
      expect(result.aggregation.count).toBe(0);
    });

    it('should create event for different participant', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([
        createMockReaction({ participantId: testParticipantId2 })
      ]);

      const result = await service.createUpdateEvent(
        testMessageId,
        '👍',
        'add',
        testParticipantId2,
        'conv456'
      );

      expect(result.participantId).toBe(testParticipantId2);
    });
  });

  // ==============================================
  // VALIDATION METHODS TESTS
  // ==============================================

  describe('validateAddReactionOptions', () => {
    it('should pass for valid options', () => {
      expect(() => {
        service.validateAddReactionOptions({
          messageId: testMessageId,
          participantId: testParticipantId,
          emoji: '👍'
        });
      }).not.toThrow();
    });

    it('should throw error when messageId is missing', () => {
      expect(() => {
        service.validateAddReactionOptions({
          messageId: '',
          participantId: testParticipantId,
          emoji: '👍'
        });
      }).toThrow('messageId is required');
    });

    it('should throw error when participantId not provided', () => {
      expect(() => {
        service.validateAddReactionOptions({
          messageId: testMessageId,
          participantId: '',
          emoji: '👍'
        });
      }).toThrow('participantId must be provided');
    });

    it('should throw error when emoji is missing', () => {
      expect(() => {
        service.validateAddReactionOptions({
          messageId: testMessageId,
          participantId: testParticipantId,
          emoji: ''
        });
      }).toThrow('emoji is required');
    });

    it('should throw error for invalid emoji format', () => {
      (isValidEmoji as jest.Mock).mockReturnValue(false);

      expect(() => {
        service.validateAddReactionOptions({
          messageId: testMessageId,
          participantId: testParticipantId,
          emoji: 'invalid'
        });
      }).toThrow('Invalid emoji format');
    });
  });

  describe('validateRemoveReactionOptions', () => {
    it('should pass for valid options', () => {
      expect(() => {
        service.validateRemoveReactionOptions({
          messageId: testMessageId,
          participantId: testParticipantId,
          emoji: '👍'
        });
      }).not.toThrow();
    });

    it('should throw error when messageId is missing', () => {
      expect(() => {
        service.validateRemoveReactionOptions({
          messageId: '',
          participantId: testParticipantId,
          emoji: '👍'
        });
      }).toThrow('messageId is required');
    });

    it('should throw error when participantId not provided', () => {
      expect(() => {
        service.validateRemoveReactionOptions({
          messageId: testMessageId,
          participantId: '',
          emoji: '👍'
        });
      }).toThrow('participantId must be provided');
    });

    it('should throw error when emoji is missing', () => {
      expect(() => {
        service.validateRemoveReactionOptions({
          messageId: testMessageId,
          participantId: testParticipantId,
          emoji: ''
        });
      }).toThrow('emoji is required');
    });

    it('should throw error for invalid emoji format', () => {
      (isValidEmoji as jest.Mock).mockReturnValue(false);

      expect(() => {
        service.validateRemoveReactionOptions({
          messageId: testMessageId,
          participantId: testParticipantId,
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
      mockPrisma.message.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(
        service.addReaction({
          messageId: testMessageId,
          participantId: testParticipantId,
          emoji: '👍'
        })
      ).rejects.toThrow('Database error');
    });

    it('should handle database errors in removeReaction gracefully', async () => {
      mockPrisma.reaction.deleteMany.mockRejectedValue(new Error('Database error'));

      await expect(
        service.removeReaction({
          messageId: testMessageId,
          participantId: testParticipantId,
          emoji: '👍'
        })
      ).rejects.toThrow('Database error');
    });

    it('should handle database errors in getMessageReactions gracefully', async () => {
      mockPrisma.reaction.findMany.mockRejectedValue(new Error('Database error'));

      await expect(
        service.getMessageReactions({
          messageId: testMessageId
        })
      ).rejects.toThrow('Database error');
    });

    it('should handle empty message ID', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.addReaction({
          messageId: '',
          participantId: testParticipantId,
          emoji: '👍'
        })
      ).rejects.toThrow();
    });

    it('should handle whitespace-only emoji', async () => {
      (sanitizeEmoji as jest.Mock).mockReturnValue(null);

      await expect(
        service.addReaction({
          messageId: testMessageId,
          participantId: testParticipantId,
          emoji: '   '
        })
      ).rejects.toThrow('Invalid emoji format');
    });

    it('should correctly map reaction data with different participantId', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([
        createMockReaction({ participantId: testParticipantId2 })
      ]);

      const result = await service.getParticipantReactions(testParticipantId);

      expect(result[0].participantId).toBe(testParticipantId2);
      
    });

    it('should correctly map reaction data with participantId', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([
        createMockReaction({ participantId: testParticipantId })
      ]);

      const result = await service.getParticipantReactions(testParticipantId);

      expect(result[0].participantId).toBe(testParticipantId);
      
    });
  });

  // ==============================================
  // REACTION DATA MAPPING TESTS
  // ==============================================

  describe('Reaction Data Mapping', () => {
    it('should correctly map all reaction fields', async () => {
      const mockReaction = createMockReaction({
        id: 'reaction-123',
        messageId: 'msg-456',
        participantId: 'user-789',
        emoji: '🎉',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-02T00:00:00Z')
      });

      mockPrisma.reaction.findMany.mockResolvedValue([mockReaction]);

      const result = await service.getParticipantReactions('user-789');

      expect(result[0]).toEqual({
        id: 'reaction-123',
        messageId: 'msg-456',
        participantId: 'user-789',
        emoji: '🎉',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-02T00:00:00Z')
      });
    });

    it('should handle reaction participantId correctly', async () => {
      const mockReaction = createMockReaction({
        participantId: testParticipantId
      });

      mockPrisma.reaction.findMany.mockResolvedValue([mockReaction]);

      const result = await service.getParticipantReactions(testParticipantId);

      expect(result[0].participantId).toBe(testParticipantId);
    });
  });

  // ==============================================
  // AGGREGATION EDGE CASES
  // ==============================================

  describe('Aggregation Edge Cases', () => {
    it('should handle multiple users with same emoji correctly', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([
        createMockReaction({ participantId: 'user1', emoji: '👍' }),
        createMockReaction({ participantId: 'user2', emoji: '👍' }),
        createMockReaction({ participantId: 'user3', emoji: '👍' }),
        createMockReaction({ participantId: 'anon1', emoji: '👍' }),
        createMockReaction({ participantId: 'anon2', emoji: '👍' })
      ]);

      const result = await service.getMessageReactions({
        messageId: testMessageId
      });

      const thumbsUp = result.reactions.find(r => r.emoji === '👍');
      expect(thumbsUp?.count).toBe(5);
      expect(thumbsUp?.participantIds.length).toBe(5);
    });

    it('should handle reactions ordered by createdAt', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([]);

      await service.getMessageReactions({
        messageId: testMessageId
      });

      expect(mockPrisma.reaction.findMany).toHaveBeenCalledWith({
        where: { messageId: testMessageId },
        orderBy: { createdAt: 'asc' }
      });
    });

    it('should handle hasCurrentUser with currentParticipantId', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([
        createMockReaction({ participantId: testParticipantId, emoji: '👍' }),
        createMockReaction({ participantId: testParticipantId2, emoji: '❤️' })
      ]);

      const result = await service.getMessageReactions({
        messageId: testMessageId,
        currentParticipantId: testParticipantId
      });

      const thumbsUp = result.reactions.find(r => r.emoji === '👍');
      const heart = result.reactions.find(r => r.emoji === '❤️');

      expect(thumbsUp?.hasCurrentUser).toBe(true);
      expect(heart?.hasCurrentUser).toBe(false);
    });
  });
});
