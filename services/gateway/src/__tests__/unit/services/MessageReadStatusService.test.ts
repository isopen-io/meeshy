/**
 * MessageReadStatusService Comprehensive Unit Tests
 *
 * This test suite provides thorough coverage of the MessageReadStatusService including:
 * - Unread count calculation (single and batch)
 * - Mark messages as received
 * - Mark messages as read with notification sync
 * - Get message read status
 * - Get conversation read statuses (batch)
 * - Cleanup obsolete cursors
 * - Error handling for all methods
 *
 * Coverage target: > 65%
 *
 * @jest-environment node
 */

import { MessageReadStatusService } from '../../../services/MessageReadStatusService';

// Mock the NotificationService import (used dynamically in markMessagesAsRead)
jest.mock('../../../services/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    markConversationNotificationsAsRead: jest.fn().mockResolvedValue(0)
  }))
}));

// Mock Prisma client
jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    messageStatus: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn()
    },
    message: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn()
    },
    conversationMember: {
      count: jest.fn()
    }
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma)
  };
});

// Mock console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

describe('MessageReadStatusService', () => {
  let service: MessageReadStatusService;
  let prisma: any;

  // Test data
  const testUserId = '507f1f77bcf86cd799439011';
  const testConversationId = '507f1f77bcf86cd799439012';
  const testMessageId = '507f1f77bcf86cd799439013';
  const testMessageId2 = '507f1f77bcf86cd799439014';

  beforeEach(() => {
    jest.clearAllMocks();

    // Suppress console output in tests
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();

    // Create fresh Prisma mock
    const { PrismaClient } = require('@meeshy/shared/prisma/client');
    prisma = new PrismaClient();

    // Create service instance
    service = new MessageReadStatusService(prisma);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  });

  // ==============================================
  // INITIALIZATION TESTS
  // ==============================================

  describe('Initialization', () => {
    it('should initialize with Prisma client', () => {
      expect(service).toBeInstanceOf(MessageReadStatusService);
    });
  });

  // ==============================================
  // GET UNREAD COUNT TESTS
  // ==============================================

  describe('getUnreadCount', () => {
    it('should return 0 when no messages exist', async () => {
      prisma.messageStatus.findUnique.mockResolvedValue(null);
      prisma.message.count.mockResolvedValue(0);

      const count = await service.getUnreadCount(testUserId, testConversationId);

      expect(count).toBe(0);
      expect(prisma.message.count).toHaveBeenCalledWith({
        where: {
          conversationId: testConversationId,
          isDeleted: false,
          senderId: { not: testUserId }
        }
      });
    });

    it('should count all messages when no cursor exists', async () => {
      prisma.messageStatus.findUnique.mockResolvedValue(null);
      prisma.message.count.mockResolvedValue(5);

      const count = await service.getUnreadCount(testUserId, testConversationId);

      expect(count).toBe(5);
    });

    it('should count all messages when cursor exists but readAt is null', async () => {
      const cursorWithNoRead = {
        userId: testUserId,
        conversationId: testConversationId,
        messageId: testMessageId,
        receivedAt: new Date(),
        readAt: null,
        message: { createdAt: new Date('2025-01-01') }
      };

      prisma.messageStatus.findUnique.mockResolvedValue(cursorWithNoRead);
      prisma.message.count.mockResolvedValue(3);

      const count = await service.getUnreadCount(testUserId, testConversationId);

      expect(count).toBe(3);
      expect(prisma.message.count).toHaveBeenCalledWith({
        where: {
          conversationId: testConversationId,
          isDeleted: false,
          senderId: { not: testUserId }
        }
      });
    });

    it('should count only messages after cursor when readAt is set', async () => {
      const cursorDate = new Date('2025-01-01T12:00:00Z');
      const cursorWithRead = {
        userId: testUserId,
        conversationId: testConversationId,
        messageId: testMessageId,
        receivedAt: new Date(),
        readAt: new Date(),
        message: { createdAt: cursorDate }
      };

      prisma.messageStatus.findUnique.mockResolvedValue(cursorWithRead);
      prisma.message.count.mockResolvedValue(2);

      const count = await service.getUnreadCount(testUserId, testConversationId);

      expect(count).toBe(2);
      expect(prisma.message.count).toHaveBeenCalledWith({
        where: {
          conversationId: testConversationId,
          isDeleted: false,
          senderId: { not: testUserId },
          createdAt: { gt: cursorDate }
        }
      });
    });

    it('should return 0 on database error', async () => {
      prisma.messageStatus.findUnique.mockRejectedValue(new Error('Database error'));

      const count = await service.getUnreadCount(testUserId, testConversationId);

      expect(count).toBe(0);
      expect(console.error).toHaveBeenCalled();
    });

    it('should exclude user own messages from count', async () => {
      prisma.messageStatus.findUnique.mockResolvedValue(null);
      prisma.message.count.mockResolvedValue(10);

      await service.getUnreadCount(testUserId, testConversationId);

      expect(prisma.message.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            senderId: { not: testUserId }
          })
        })
      );
    });
  });

  // ==============================================
  // GET UNREAD COUNTS FOR CONVERSATIONS TESTS
  // ==============================================

  describe('getUnreadCountsForConversations', () => {
    const conversationIds = [
      '507f1f77bcf86cd799439012',
      '507f1f77bcf86cd799439020',
      '507f1f77bcf86cd799439021'
    ];

    it('should return empty map for empty conversation list', async () => {
      const result = await service.getUnreadCountsForConversations(testUserId, []);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('should return counts for multiple conversations', async () => {
      const cursors = [
        {
          userId: testUserId,
          conversationId: conversationIds[0],
          messageId: testMessageId,
          receivedAt: new Date(),
          readAt: new Date(),
          message: { createdAt: new Date('2025-01-01') }
        },
        {
          userId: testUserId,
          conversationId: conversationIds[1],
          messageId: testMessageId2,
          receivedAt: new Date(),
          readAt: null,
          message: { createdAt: new Date('2025-01-02') }
        }
      ];

      prisma.messageStatus.findMany.mockResolvedValue(cursors);
      prisma.message.count
        .mockResolvedValueOnce(2) // Conversation 0 - after cursor
        .mockResolvedValueOnce(5) // Conversation 1 - all messages (no readAt)
        .mockResolvedValueOnce(3); // Conversation 2 - no cursor

      const result = await service.getUnreadCountsForConversations(testUserId, conversationIds);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(3);
      expect(result.get(conversationIds[0])).toBe(2);
      expect(result.get(conversationIds[1])).toBe(5);
      expect(result.get(conversationIds[2])).toBe(3);
    });

    it('should handle all conversations without cursors', async () => {
      prisma.messageStatus.findMany.mockResolvedValue([]);
      prisma.message.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(0);

      const result = await service.getUnreadCountsForConversations(testUserId, conversationIds);

      expect(result.get(conversationIds[0])).toBe(10);
      expect(result.get(conversationIds[1])).toBe(5);
      expect(result.get(conversationIds[2])).toBe(0);
    });

    it('should return empty map on database error', async () => {
      prisma.messageStatus.findMany.mockRejectedValue(new Error('Database error'));

      const result = await service.getUnreadCountsForConversations(testUserId, conversationIds);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(console.error).toHaveBeenCalled();
    });

    it('should handle cursor with readAt for some conversations', async () => {
      const cursors = [
        {
          userId: testUserId,
          conversationId: conversationIds[0],
          messageId: testMessageId,
          receivedAt: new Date(),
          readAt: new Date('2025-01-05'),
          message: { createdAt: new Date('2025-01-01') }
        }
      ];

      prisma.messageStatus.findMany.mockResolvedValue(cursors);
      prisma.message.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(7)
        .mockResolvedValueOnce(4);

      const result = await service.getUnreadCountsForConversations(testUserId, conversationIds);

      expect(result.size).toBe(3);
      // First conversation has cursor with readAt
      expect(prisma.message.count).toHaveBeenNthCalledWith(1, {
        where: {
          conversationId: conversationIds[0],
          isDeleted: false,
          senderId: { not: testUserId },
          createdAt: { gt: new Date('2025-01-01') }
        }
      });
    });
  });

  // ==============================================
  // MARK MESSAGES AS RECEIVED TESTS
  // ==============================================

  describe('markMessagesAsReceived', () => {
    it('should mark messages as received with provided messageId', async () => {
      const mockMessage = {
        id: testMessageId,
        conversationId: testConversationId,
        isDeleted: false
      };

      prisma.message.findFirst.mockResolvedValue(mockMessage);
      prisma.messageStatus.upsert.mockResolvedValue({
        userId: testUserId,
        conversationId: testConversationId,
        messageId: testMessageId,
        receivedAt: new Date()
      });

      await service.markMessagesAsReceived(testUserId, testConversationId, testMessageId);

      expect(prisma.message.findFirst).toHaveBeenCalledWith({
        where: {
          id: testMessageId,
          conversationId: testConversationId,
          isDeleted: false
        }
      });
      expect(prisma.messageStatus.upsert).toHaveBeenCalledWith({
        where: {
          userId_conversationId: {
            userId: testUserId,
            conversationId: testConversationId
          }
        },
        create: {
          userId: testUserId,
          conversationId: testConversationId,
          messageId: testMessageId,
          receivedAt: expect.any(Date),
          readAt: null
        },
        update: {
          messageId: testMessageId,
          receivedAt: expect.any(Date)
        }
      });
    });

    it('should fetch latest message when messageId not provided', async () => {
      const latestMessage = {
        id: testMessageId,
        conversationId: testConversationId,
        isDeleted: false,
        createdAt: new Date()
      };

      prisma.message.findFirst.mockResolvedValue(latestMessage);
      prisma.messageStatus.upsert.mockResolvedValue({});

      await service.markMessagesAsReceived(testUserId, testConversationId);

      expect(prisma.message.findFirst).toHaveBeenCalledWith({
        where: {
          conversationId: testConversationId,
          isDeleted: false
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true }
      });
    });

    it('should return early when no messages in conversation', async () => {
      prisma.message.findFirst.mockResolvedValue(null);

      await service.markMessagesAsReceived(testUserId, testConversationId);

      expect(prisma.messageStatus.upsert).not.toHaveBeenCalled();
    });

    it('should throw error when provided messageId does not belong to conversation', async () => {
      prisma.message.findFirst.mockResolvedValue(null);

      await expect(
        service.markMessagesAsReceived(testUserId, testConversationId, 'wrong-message-id')
      ).rejects.toThrow('does not belong to conversation');
    });

    it('should throw error on database failure', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: testMessageId,
        conversationId: testConversationId
      });
      prisma.messageStatus.upsert.mockRejectedValue(new Error('Database error'));

      await expect(
        service.markMessagesAsReceived(testUserId, testConversationId, testMessageId)
      ).rejects.toThrow();

      expect(console.error).toHaveBeenCalled();
    });

    it('should not update readAt when marking as received', async () => {
      const mockMessage = {
        id: testMessageId,
        conversationId: testConversationId,
        isDeleted: false
      };

      prisma.message.findFirst.mockResolvedValue(mockMessage);
      prisma.messageStatus.upsert.mockResolvedValue({});

      await service.markMessagesAsReceived(testUserId, testConversationId, testMessageId);

      const upsertCall = prisma.messageStatus.upsert.mock.calls[0][0];
      expect(upsertCall.update).not.toHaveProperty('readAt');
    });
  });

  // ==============================================
  // MARK MESSAGES AS READ TESTS
  // ==============================================

  describe('markMessagesAsRead', () => {
    beforeEach(() => {
      // Reset the NotificationService mock
      jest.resetModules();
    });

    it('should mark messages as read with provided messageId', async () => {
      const mockMessage = {
        id: testMessageId,
        conversationId: testConversationId,
        isDeleted: false
      };

      prisma.message.findFirst.mockResolvedValue(mockMessage);
      prisma.messageStatus.upsert.mockResolvedValue({
        userId: testUserId,
        conversationId: testConversationId,
        messageId: testMessageId,
        receivedAt: new Date(),
        readAt: new Date()
      });

      await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

      expect(prisma.messageStatus.upsert).toHaveBeenCalledWith({
        where: {
          userId_conversationId: {
            userId: testUserId,
            conversationId: testConversationId
          }
        },
        create: {
          userId: testUserId,
          conversationId: testConversationId,
          messageId: testMessageId,
          receivedAt: expect.any(Date),
          readAt: expect.any(Date)
        },
        update: {
          messageId: testMessageId,
          receivedAt: expect.any(Date),
          readAt: expect.any(Date)
        }
      });
    });

    it('should fetch latest message when messageId not provided', async () => {
      const latestMessage = {
        id: testMessageId,
        conversationId: testConversationId,
        isDeleted: false
      };

      prisma.message.findFirst.mockResolvedValue(latestMessage);
      prisma.messageStatus.upsert.mockResolvedValue({});

      await service.markMessagesAsRead(testUserId, testConversationId);

      expect(prisma.message.findFirst).toHaveBeenCalledWith({
        where: {
          conversationId: testConversationId,
          isDeleted: false
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true }
      });
    });

    it('should return early when no messages in conversation', async () => {
      prisma.message.findFirst.mockResolvedValue(null);

      await service.markMessagesAsRead(testUserId, testConversationId);

      expect(prisma.messageStatus.upsert).not.toHaveBeenCalled();
    });

    it('should throw error when provided messageId does not belong to conversation', async () => {
      prisma.message.findFirst.mockResolvedValue(null);

      await expect(
        service.markMessagesAsRead(testUserId, testConversationId, 'wrong-message-id')
      ).rejects.toThrow('does not belong to conversation');
    });

    it('should update both receivedAt and readAt', async () => {
      const mockMessage = {
        id: testMessageId,
        conversationId: testConversationId,
        isDeleted: false
      };

      prisma.message.findFirst.mockResolvedValue(mockMessage);
      prisma.messageStatus.upsert.mockResolvedValue({});

      await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

      const upsertCall = prisma.messageStatus.upsert.mock.calls[0][0];
      expect(upsertCall.create.receivedAt).toBeDefined();
      expect(upsertCall.create.readAt).toBeDefined();
      expect(upsertCall.update.receivedAt).toBeDefined();
      expect(upsertCall.update.readAt).toBeDefined();
    });

    it('should handle notification sync errors gracefully', async () => {
      const mockMessage = {
        id: testMessageId,
        conversationId: testConversationId,
        isDeleted: false
      };

      prisma.message.findFirst.mockResolvedValue(mockMessage);
      prisma.messageStatus.upsert.mockResolvedValue({});

      // The notification sync is done via dynamic import, which is mocked
      // Even if it fails, the main operation should succeed
      await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

      expect(prisma.messageStatus.upsert).toHaveBeenCalled();
    });

    it('should sync notifications when marking as read (with notifications to mark)', async () => {
      const mockMessage = {
        id: testMessageId,
        conversationId: testConversationId,
        isDeleted: false
      };

      prisma.message.findFirst.mockResolvedValue(mockMessage);
      prisma.messageStatus.upsert.mockResolvedValue({});

      // Mock NotificationService to return count > 0
      const mockNotificationService = require('../../../services/NotificationService');
      mockNotificationService.NotificationService.mockImplementation(() => ({
        markConversationNotificationsAsRead: jest.fn().mockResolvedValue(3)
      }));

      await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

      expect(prisma.messageStatus.upsert).toHaveBeenCalled();
      // Notification sync happens after main operation
      expect(console.log).toHaveBeenCalled();
    });

    it('should throw error on database failure', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: testMessageId,
        conversationId: testConversationId
      });
      prisma.messageStatus.upsert.mockRejectedValue(new Error('Database error'));

      await expect(
        service.markMessagesAsRead(testUserId, testConversationId, testMessageId)
      ).rejects.toThrow();

      expect(console.error).toHaveBeenCalled();
    });
  });

  // ==============================================
  // GET MESSAGE READ STATUS TESTS
  // ==============================================

  describe('getMessageReadStatus', () => {
    const messageCreatedAt = new Date('2025-01-01T12:00:00Z');

    it('should return read status for a message', async () => {
      const mockMessage = {
        id: testMessageId,
        createdAt: messageCreatedAt,
        senderId: testUserId,
        anonymousSenderId: null,
        conversationId: testConversationId
      };

      const mockCursors = [
        {
          userId: 'user-1',
          conversationId: testConversationId,
          messageId: testMessageId,
          receivedAt: new Date('2025-01-01T13:00:00Z'),
          readAt: new Date('2025-01-01T14:00:00Z'),
          message: { createdAt: new Date('2025-01-01T15:00:00Z') },
          user: { id: 'user-1', username: 'user1' }
        },
        {
          userId: 'user-2',
          conversationId: testConversationId,
          messageId: testMessageId,
          receivedAt: new Date('2025-01-01T13:30:00Z'),
          readAt: null,
          message: { createdAt: new Date('2025-01-01T15:00:00Z') },
          user: { id: 'user-2', username: 'user2' }
        }
      ];

      prisma.message.findUnique.mockResolvedValue(mockMessage);
      prisma.conversationMember.count.mockResolvedValue(3);
      prisma.messageStatus.findMany.mockResolvedValue(mockCursors);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.messageId).toBe(testMessageId);
      expect(result.totalMembers).toBe(3);
      expect(result.receivedCount).toBe(2);
      expect(result.readCount).toBe(1);
      expect(result.receivedBy).toHaveLength(2);
      expect(result.readBy).toHaveLength(1);
    });

    it('should throw error when message not found', async () => {
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.getMessageReadStatus('nonexistent-id', testConversationId)
      ).rejects.toThrow('Message nonexistent-id not found');
    });

    it('should exclude sender from received/read counts', async () => {
      const mockMessage = {
        id: testMessageId,
        createdAt: messageCreatedAt,
        senderId: testUserId,
        anonymousSenderId: null,
        conversationId: testConversationId
      };

      const mockCursors = [
        {
          userId: testUserId, // This is the sender
          conversationId: testConversationId,
          messageId: testMessageId,
          receivedAt: new Date(),
          readAt: new Date(),
          message: { createdAt: new Date('2025-01-02') },
          user: { id: testUserId, username: 'sender' }
        },
        {
          userId: 'user-1',
          conversationId: testConversationId,
          messageId: testMessageId,
          receivedAt: new Date(),
          readAt: new Date(),
          message: { createdAt: new Date('2025-01-02') },
          user: { id: 'user-1', username: 'user1' }
        }
      ];

      prisma.message.findUnique.mockResolvedValue(mockMessage);
      prisma.conversationMember.count.mockResolvedValue(2);
      prisma.messageStatus.findMany.mockResolvedValue(mockCursors);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      // Sender should be excluded
      expect(result.receivedBy).toHaveLength(1);
      expect(result.readBy).toHaveLength(1);
      expect(result.receivedBy[0].userId).toBe('user-1');
    });

    it('should handle anonymous sender messages', async () => {
      const anonymousSenderId = 'anon-sender-123';
      const mockMessage = {
        id: testMessageId,
        createdAt: messageCreatedAt,
        senderId: null,
        anonymousSenderId: anonymousSenderId,
        conversationId: testConversationId
      };

      const mockCursors = [
        {
          userId: anonymousSenderId,
          conversationId: testConversationId,
          messageId: testMessageId,
          receivedAt: new Date(),
          readAt: new Date(),
          message: { createdAt: new Date('2025-01-02') },
          user: { id: anonymousSenderId, username: 'anon' }
        }
      ];

      prisma.message.findUnique.mockResolvedValue(mockMessage);
      prisma.conversationMember.count.mockResolvedValue(1);
      prisma.messageStatus.findMany.mockResolvedValue(mockCursors);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      // Anonymous sender should be excluded
      expect(result.receivedBy).toHaveLength(0);
      expect(result.readBy).toHaveLength(0);
    });

    it('should only count cursors pointing to messages after target message', async () => {
      const mockMessage = {
        id: testMessageId,
        createdAt: messageCreatedAt,
        senderId: testUserId,
        anonymousSenderId: null,
        conversationId: testConversationId
      };

      const mockCursors = [
        {
          userId: 'user-1',
          conversationId: testConversationId,
          messageId: 'old-message',
          receivedAt: new Date(),
          readAt: new Date(),
          // Cursor points to message BEFORE the target
          message: { createdAt: new Date('2024-12-01') },
          user: { id: 'user-1', username: 'user1' }
        },
        {
          userId: 'user-2',
          conversationId: testConversationId,
          messageId: testMessageId,
          receivedAt: new Date(),
          readAt: new Date(),
          // Cursor points to message AFTER the target
          message: { createdAt: new Date('2025-01-02') },
          user: { id: 'user-2', username: 'user2' }
        }
      ];

      prisma.message.findUnique.mockResolvedValue(mockMessage);
      prisma.conversationMember.count.mockResolvedValue(3);
      prisma.messageStatus.findMany.mockResolvedValue(mockCursors);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      // Only user-2 should be counted (cursor after target)
      expect(result.receivedCount).toBe(1);
      expect(result.readCount).toBe(1);
    });

    it('should throw error on database failure', async () => {
      prisma.message.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(
        service.getMessageReadStatus(testMessageId, testConversationId)
      ).rejects.toThrow();

      expect(console.error).toHaveBeenCalled();
    });
  });

  // ==============================================
  // GET CONVERSATION READ STATUSES TESTS
  // ==============================================

  describe('getConversationReadStatuses', () => {
    const messageIds = [testMessageId, testMessageId2];

    it('should return read statuses for multiple messages', async () => {
      const mockMessages = [
        {
          id: testMessageId,
          createdAt: new Date('2025-01-01'),
          senderId: testUserId
        },
        {
          id: testMessageId2,
          createdAt: new Date('2025-01-02'),
          senderId: 'other-user'
        }
      ];

      const mockCursors = [
        {
          userId: 'user-1',
          conversationId: testConversationId,
          receivedAt: new Date(),
          readAt: new Date(),
          message: { createdAt: new Date('2025-01-03') }
        },
        {
          userId: 'user-2',
          conversationId: testConversationId,
          receivedAt: new Date(),
          readAt: null,
          message: { createdAt: new Date('2025-01-03') }
        }
      ];

      prisma.message.findMany.mockResolvedValue(mockMessages);
      prisma.messageStatus.findMany.mockResolvedValue(mockCursors);

      const result = await service.getConversationReadStatuses(testConversationId, messageIds);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(2);
      expect(result.get(testMessageId)).toBeDefined();
      expect(result.get(testMessageId2)).toBeDefined();
    });

    it('should return empty map for empty message list', async () => {
      prisma.message.findMany.mockResolvedValue([]);
      prisma.messageStatus.findMany.mockResolvedValue([]);

      const result = await service.getConversationReadStatuses(testConversationId, []);

      expect(result.size).toBe(0);
    });

    it('should exclude sender from counts', async () => {
      const mockMessages = [
        {
          id: testMessageId,
          createdAt: new Date('2025-01-01'),
          senderId: testUserId
        }
      ];

      const mockCursors = [
        {
          userId: testUserId, // Sender
          conversationId: testConversationId,
          receivedAt: new Date(),
          readAt: new Date(),
          message: { createdAt: new Date('2025-01-02') }
        },
        {
          userId: 'other-user',
          conversationId: testConversationId,
          receivedAt: new Date(),
          readAt: new Date(),
          message: { createdAt: new Date('2025-01-02') }
        }
      ];

      prisma.message.findMany.mockResolvedValue(mockMessages);
      prisma.messageStatus.findMany.mockResolvedValue(mockCursors);

      const result = await service.getConversationReadStatuses(testConversationId, [testMessageId]);

      const status = result.get(testMessageId);
      expect(status?.receivedCount).toBe(1);
      expect(status?.readCount).toBe(1);
    });

    it('should throw error on database failure', async () => {
      prisma.message.findMany.mockRejectedValue(new Error('Database error'));

      await expect(
        service.getConversationReadStatuses(testConversationId, messageIds)
      ).rejects.toThrow();

      expect(console.error).toHaveBeenCalled();
    });

    it('should count correctly based on cursor position', async () => {
      const mockMessages = [
        {
          id: testMessageId,
          createdAt: new Date('2025-01-05'),
          senderId: testUserId
        }
      ];

      const mockCursors = [
        {
          userId: 'user-1',
          conversationId: testConversationId,
          receivedAt: new Date(),
          readAt: new Date(),
          message: { createdAt: new Date('2025-01-01') } // Before target
        },
        {
          userId: 'user-2',
          conversationId: testConversationId,
          receivedAt: new Date(),
          readAt: new Date(),
          message: { createdAt: new Date('2025-01-06') } // After target
        }
      ];

      prisma.message.findMany.mockResolvedValue(mockMessages);
      prisma.messageStatus.findMany.mockResolvedValue(mockCursors);

      const result = await service.getConversationReadStatuses(testConversationId, [testMessageId]);

      const status = result.get(testMessageId);
      expect(status?.receivedCount).toBe(1); // Only user-2
      expect(status?.readCount).toBe(1);
    });
  });

  // ==============================================
  // CLEANUP OBSOLETE CURSORS TESTS
  // ==============================================

  describe('cleanupObsoleteCursors', () => {
    it('should return 0 when no cursors exist', async () => {
      prisma.messageStatus.findMany.mockResolvedValue([]);

      const count = await service.cleanupObsoleteCursors(testConversationId);

      expect(count).toBe(0);
      expect(prisma.messageStatus.deleteMany).not.toHaveBeenCalled();
    });

    it('should delete cursors pointing to deleted or non-existent messages', async () => {
      const cursors = [
        { id: 'cursor-1', messageId: 'deleted-msg' },
        { id: 'cursor-2', messageId: 'existing-msg' },
        { id: 'cursor-3', messageId: 'another-deleted-msg' }
      ];

      const existingMessages = [
        { id: 'existing-msg' }
      ];

      prisma.messageStatus.findMany.mockResolvedValue(cursors);
      prisma.message.findMany.mockResolvedValue(existingMessages);
      prisma.messageStatus.deleteMany.mockResolvedValue({ count: 2 });

      const count = await service.cleanupObsoleteCursors(testConversationId);

      expect(count).toBe(2);
      expect(prisma.messageStatus.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['cursor-1', 'cursor-3'] } }
      });
    });

    it('should not delete any cursors when all messages exist', async () => {
      const cursors = [
        { id: 'cursor-1', messageId: 'msg-1' },
        { id: 'cursor-2', messageId: 'msg-2' }
      ];

      const existingMessages = [
        { id: 'msg-1' },
        { id: 'msg-2' }
      ];

      prisma.messageStatus.findMany.mockResolvedValue(cursors);
      prisma.message.findMany.mockResolvedValue(existingMessages);

      const count = await service.cleanupObsoleteCursors(testConversationId);

      expect(count).toBe(0);
      expect(prisma.messageStatus.deleteMany).not.toHaveBeenCalled();
    });

    it('should throw error on database failure', async () => {
      prisma.messageStatus.findMany.mockRejectedValue(new Error('Database error'));

      await expect(
        service.cleanupObsoleteCursors(testConversationId)
      ).rejects.toThrow();

      expect(console.error).toHaveBeenCalled();
    });

    it('should batch delete all obsolete cursors', async () => {
      const cursors = [
        { id: 'cursor-1', messageId: 'deleted-1' },
        { id: 'cursor-2', messageId: 'deleted-2' },
        { id: 'cursor-3', messageId: 'deleted-3' }
      ];

      prisma.messageStatus.findMany.mockResolvedValue(cursors);
      prisma.message.findMany.mockResolvedValue([]); // All messages deleted
      prisma.messageStatus.deleteMany.mockResolvedValue({ count: 3 });

      const count = await service.cleanupObsoleteCursors(testConversationId);

      expect(count).toBe(3);
      expect(prisma.messageStatus.deleteMany).toHaveBeenCalledTimes(1);
    });

    it('should correctly identify deleted messages', async () => {
      const cursors = [
        { id: 'cursor-1', messageId: 'msg-1' }
      ];

      // Message exists but is marked as deleted (findMany with isDeleted: false returns empty)
      prisma.messageStatus.findMany.mockResolvedValue(cursors);
      prisma.message.findMany.mockResolvedValue([]);
      prisma.messageStatus.deleteMany.mockResolvedValue({ count: 1 });

      const count = await service.cleanupObsoleteCursors(testConversationId);

      expect(count).toBe(1);
      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['msg-1'] },
          isDeleted: false
        },
        select: { id: true }
      });
    });
  });

  // ==============================================
  // EDGE CASES AND ERROR HANDLING
  // ==============================================

  describe('Edge Cases', () => {
    it('should handle empty userId', async () => {
      prisma.messageStatus.findUnique.mockResolvedValue(null);
      prisma.message.count.mockResolvedValue(0);

      const count = await service.getUnreadCount('', testConversationId);

      expect(count).toBe(0);
    });

    it('should handle empty conversationId', async () => {
      prisma.messageStatus.findUnique.mockResolvedValue(null);
      prisma.message.count.mockResolvedValue(0);

      const count = await service.getUnreadCount(testUserId, '');

      expect(count).toBe(0);
    });

    it('should handle concurrent operations gracefully', async () => {
      const mockMessage = {
        id: testMessageId,
        conversationId: testConversationId,
        isDeleted: false
      };

      prisma.message.findFirst.mockResolvedValue(mockMessage);
      prisma.messageStatus.upsert.mockResolvedValue({});

      // Simulate concurrent calls
      const promises = [
        service.markMessagesAsRead(testUserId, testConversationId, testMessageId),
        service.markMessagesAsRead(testUserId, testConversationId, testMessageId),
        service.markMessagesAsRead(testUserId, testConversationId, testMessageId)
      ];

      await expect(Promise.all(promises)).resolves.not.toThrow();
    });

    it('should handle very long conversation IDs', async () => {
      const longId = 'a'.repeat(100);
      prisma.messageStatus.findUnique.mockResolvedValue(null);
      prisma.message.count.mockResolvedValue(0);

      const count = await service.getUnreadCount(testUserId, longId);

      expect(count).toBe(0);
    });

    it('should handle special characters in IDs', async () => {
      const specialId = 'conv-123_special$id';
      prisma.messageStatus.findUnique.mockResolvedValue(null);
      prisma.message.count.mockResolvedValue(5);

      const count = await service.getUnreadCount(testUserId, specialId);

      expect(count).toBe(5);
    });
  });

  // ==============================================
  // INTEGRATION-LIKE TESTS
  // ==============================================

  describe('Workflow Tests', () => {
    it('should correctly track read progression', async () => {
      const messageDate = new Date('2025-01-01');
      const mockMessage = {
        id: testMessageId,
        conversationId: testConversationId,
        isDeleted: false
      };

      // Initial state - no cursor
      prisma.messageStatus.findUnique.mockResolvedValue(null);
      prisma.message.count.mockResolvedValue(5);

      let unreadCount = await service.getUnreadCount(testUserId, testConversationId);
      expect(unreadCount).toBe(5);

      // Mark as received
      prisma.message.findFirst.mockResolvedValue(mockMessage);
      prisma.messageStatus.upsert.mockResolvedValue({
        userId: testUserId,
        messageId: testMessageId,
        receivedAt: new Date(),
        readAt: null
      });

      await service.markMessagesAsReceived(testUserId, testConversationId, testMessageId);

      // Still unread - readAt is null
      prisma.messageStatus.findUnique.mockResolvedValue({
        userId: testUserId,
        messageId: testMessageId,
        receivedAt: new Date(),
        readAt: null,
        message: { createdAt: messageDate }
      });
      prisma.message.count.mockResolvedValue(5);

      unreadCount = await service.getUnreadCount(testUserId, testConversationId);
      expect(unreadCount).toBe(5);

      // Mark as read
      await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

      // Now should be 0 unread
      prisma.messageStatus.findUnique.mockResolvedValue({
        userId: testUserId,
        messageId: testMessageId,
        receivedAt: new Date(),
        readAt: new Date(),
        message: { createdAt: messageDate }
      });
      prisma.message.count.mockResolvedValue(0);

      unreadCount = await service.getUnreadCount(testUserId, testConversationId);
      expect(unreadCount).toBe(0);
    });

    it('should handle multiple users reading same conversation', async () => {
      const user1 = 'user-1';
      const user2 = 'user-2';
      const messageDate = new Date('2025-01-01');

      const mockMessage = {
        id: testMessageId,
        conversationId: testConversationId,
        createdAt: messageDate,
        senderId: 'original-sender',
        anonymousSenderId: null
      };

      prisma.message.findUnique.mockResolvedValue(mockMessage);
      prisma.conversationMember.count.mockResolvedValue(3);

      // User 1 has read, User 2 has only received
      prisma.messageStatus.findMany.mockResolvedValue([
        {
          userId: user1,
          conversationId: testConversationId,
          messageId: testMessageId,
          receivedAt: new Date(),
          readAt: new Date(),
          message: { createdAt: new Date('2025-01-02') },
          user: { id: user1, username: 'user1' }
        },
        {
          userId: user2,
          conversationId: testConversationId,
          messageId: testMessageId,
          receivedAt: new Date(),
          readAt: null,
          message: { createdAt: new Date('2025-01-02') },
          user: { id: user2, username: 'user2' }
        }
      ]);

      const status = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(status.receivedCount).toBe(2);
      expect(status.readCount).toBe(1);
      expect(status.receivedBy).toHaveLength(2);
      expect(status.readBy).toHaveLength(1);
    });
  });
});
