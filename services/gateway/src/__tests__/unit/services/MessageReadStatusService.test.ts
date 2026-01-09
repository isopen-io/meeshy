/**
 * MessageReadStatusService Comprehensive Unit Tests
 *
 * Tests the new granular status tracking system:
 * - ConversationReadCursor: Fast unread count queries
 * - MessageStatusEntry: Per-message per-user status
 * - AttachmentStatusEntry: Per-attachment per-user status (audio, video, image, download)
 * - Computed fields: deliveredToAllAt, readByAllAt, viewedByAllAt, etc.
 *
 * Coverage target: > 80%
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

// Mock Prisma client with new models
const mockPrisma: any = {
  conversationReadCursor: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn()
  },
  messageStatusEntry: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    upsert: jest.fn(),
    count: jest.fn(),
    deleteMany: jest.fn()
  },
  attachmentStatusEntry: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    upsert: jest.fn(),
    count: jest.fn()
  },
  message: {
    count: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn()
  },
  messageAttachment: {
    findUnique: jest.fn(),
    update: jest.fn()
  },
  conversationMember: {
    count: jest.fn()
  },
  // Mock $transaction to pass the mock prisma to the callback
  $transaction: jest.fn().mockImplementation(async (callback: (tx: any) => Promise<any>) => {
    // Create a transaction mock that proxies to the main mock
    const txMock = {
      conversationReadCursor: mockPrisma.conversationReadCursor,
      messageStatusEntry: mockPrisma.messageStatusEntry,
      attachmentStatusEntry: mockPrisma.attachmentStatusEntry,
      message: mockPrisma.message,
      messageAttachment: mockPrisma.messageAttachment,
      conversationMember: mockPrisma.conversationMember
    };
    return callback(txMock);
  })
};

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma)
}));

// Mock console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

describe('MessageReadStatusService', () => {
  let service: MessageReadStatusService;

  // Test data
  const testUserId = '507f1f77bcf86cd799439011';
  const testUserId2 = '507f1f77bcf86cd799439015';
  const testConversationId = '507f1f77bcf86cd799439012';
  const testMessageId = '507f1f77bcf86cd799439013';
  const testMessageId2 = '507f1f77bcf86cd799439014';
  const testAttachmentId = '507f1f77bcf86cd799439016';

  beforeEach(() => {
    jest.clearAllMocks();

    // Suppress console output in tests
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();

    // Create service instance with mock Prisma
    service = new MessageReadStatusService(mockPrisma as any);
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
  // GET UNREAD COUNT TESTS (using ConversationReadCursor)
  // ==============================================

  describe('getUnreadCount', () => {
    it('should return cached unreadCount from cursor', async () => {
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
        userId: testUserId,
        conversationId: testConversationId,
        unreadCount: 5
      });

      const count = await service.getUnreadCount(testUserId, testConversationId);

      expect(count).toBe(5);
      expect(mockPrisma.conversationReadCursor.findUnique).toHaveBeenCalledWith({
        where: {
          conversation_user_cursor: { userId: testUserId, conversationId: testConversationId }
        }
      });
    });

    it('should count all messages when no cursor exists', async () => {
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.count.mockResolvedValue(10);

      const count = await service.getUnreadCount(testUserId, testConversationId);

      expect(count).toBe(10);
      expect(mockPrisma.message.count).toHaveBeenCalledWith({
        where: {
          conversationId: testConversationId,
          isDeleted: false,
          senderId: { not: testUserId }
        }
      });
    });

    it('should return 0 on database error', async () => {
      mockPrisma.conversationReadCursor.findUnique.mockRejectedValue(new Error('Database error'));

      const count = await service.getUnreadCount(testUserId, testConversationId);

      expect(count).toBe(0);
      expect(console.error).toHaveBeenCalled();
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

    it('should return cached counts from cursors', async () => {
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { conversationId: conversationIds[0], unreadCount: 5 },
        { conversationId: conversationIds[1], unreadCount: 3 }
      ]);
      mockPrisma.message.count.mockResolvedValue(7); // For conversation without cursor

      const result = await service.getUnreadCountsForConversations(testUserId, conversationIds);

      expect(result.get(conversationIds[0])).toBe(5);
      expect(result.get(conversationIds[1])).toBe(3);
      expect(result.get(conversationIds[2])).toBe(7);
    });

    it('should return empty map on database error', async () => {
      mockPrisma.conversationReadCursor.findMany.mockRejectedValue(new Error('Database error'));

      const result = await service.getUnreadCountsForConversations(testUserId, conversationIds);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(console.error).toHaveBeenCalled();
    });
  });

  // ==============================================
  // MARK MESSAGES AS RECEIVED TESTS
  // ==============================================

  describe('markMessagesAsReceived', () => {
    it('should create cursor and status entry when marking as received', async () => {
      const mockMessage = { id: testMessageId, conversationId: testConversationId };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.messageStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.count.mockResolvedValue(0);
      // Mock for updateMessageComputedStatus
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        conversationId: testConversationId,
        senderId: testUserId2
      });
      mockPrisma.conversationMember.count.mockResolvedValue(2);
      mockPrisma.messageStatusEntry.count.mockResolvedValue(1);
      mockPrisma.messageStatusEntry.findFirst.mockResolvedValue({ deliveredAt: new Date() });
      mockPrisma.message.update.mockResolvedValue({});

      await service.markMessagesAsReceived(testUserId, testConversationId, testMessageId);

      expect(mockPrisma.conversationReadCursor.upsert).toHaveBeenCalledWith({
        where: {
          conversation_user_cursor: { userId: testUserId, conversationId: testConversationId }
        },
        create: expect.objectContaining({
          userId: testUserId,
          conversationId: testConversationId,
          lastDeliveredMessageId: testMessageId
        }),
        update: expect.objectContaining({
          lastDeliveredMessageId: testMessageId
        })
      });

      expect(mockPrisma.messageStatusEntry.upsert).toHaveBeenCalledWith({
        where: {
          message_user_status: { messageId: testMessageId, userId: testUserId }
        },
        create: expect.objectContaining({
          messageId: testMessageId,
          conversationId: testConversationId,
          userId: testUserId,
          deliveredAt: expect.any(Date),
          receivedAt: expect.any(Date)
        }),
        update: expect.objectContaining({
          deliveredAt: expect.any(Date),
          receivedAt: expect.any(Date)
        })
      });
    });

    it('should fetch latest message when messageId not provided', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId });
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.messageStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.count.mockResolvedValue(0);
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        conversationId: testConversationId,
        senderId: testUserId2
      });
      mockPrisma.conversationMember.count.mockResolvedValue(2);
      mockPrisma.messageStatusEntry.count.mockResolvedValue(1);
      mockPrisma.messageStatusEntry.findFirst.mockResolvedValue({ deliveredAt: new Date() });
      mockPrisma.message.update.mockResolvedValue({});

      await service.markMessagesAsReceived(testUserId, testConversationId);

      expect(mockPrisma.message.findFirst).toHaveBeenCalledWith({
        where: { conversationId: testConversationId, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        select: { id: true }
      });
    });

    it('should return early when no messages in conversation', async () => {
      mockPrisma.message.findFirst.mockResolvedValue(null);

      await service.markMessagesAsReceived(testUserId, testConversationId);

      expect(mockPrisma.conversationReadCursor.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.messageStatusEntry.upsert).not.toHaveBeenCalled();
    });

    it('should throw error when messageId does not belong to conversation', async () => {
      mockPrisma.message.findFirst.mockResolvedValue(null);

      await expect(
        service.markMessagesAsReceived(testUserId, testConversationId, 'wrong-message-id')
      ).rejects.toThrow('does not belong to conversation');
    });
  });

  // ==============================================
  // MARK MESSAGES AS READ TESTS
  // ==============================================

  describe('markMessagesAsRead', () => {
    it('should update cursor and create status entries for all unread messages', async () => {
      const messageDate = new Date('2025-01-01');
      const mockMessage = { id: testMessageId, createdAt: messageDate };
      const unreadMessages = [{ id: testMessageId }, { id: testMessageId2 }];

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.message.findMany.mockResolvedValue(unreadMessages);
      mockPrisma.messageStatusEntry.upsert.mockResolvedValue({});
      // Mock for updateMessageComputedStatus
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        conversationId: testConversationId,
        senderId: testUserId2
      });
      mockPrisma.conversationMember.count.mockResolvedValue(2);
      mockPrisma.messageStatusEntry.count.mockResolvedValue(2);
      mockPrisma.messageStatusEntry.findFirst.mockResolvedValue({ readAt: new Date() });
      mockPrisma.message.update.mockResolvedValue({});

      await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

      expect(mockPrisma.conversationReadCursor.upsert).toHaveBeenCalledWith({
        where: {
          conversation_user_cursor: { userId: testUserId, conversationId: testConversationId }
        },
        create: expect.objectContaining({
          lastReadMessageId: testMessageId,
          unreadCount: 0
        }),
        update: expect.objectContaining({
          lastReadMessageId: testMessageId,
          unreadCount: 0
        })
      });

      // Should create status entries for all unread messages
      expect(mockPrisma.messageStatusEntry.upsert).toHaveBeenCalledTimes(2);
    });

    it('should sync notifications when marking as read', async () => {
      const mockMessage = { id: testMessageId, createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
      mockPrisma.messageStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        conversationId: testConversationId,
        senderId: testUserId2
      });
      mockPrisma.conversationMember.count.mockResolvedValue(2);
      mockPrisma.messageStatusEntry.count.mockResolvedValue(1);
      mockPrisma.messageStatusEntry.findFirst.mockResolvedValue({ readAt: new Date() });
      mockPrisma.message.update.mockResolvedValue({});

      await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

      // Notification sync happens after main operation
      expect(console.log).toHaveBeenCalled();
    });
  });

  // ==============================================
  // GET MESSAGE READ STATUS TESTS
  // ==============================================

  describe('getMessageReadStatus', () => {
    it('should return detailed read status for a message', async () => {
      const mockMessage = {
        id: testMessageId,
        createdAt: new Date(),
        senderId: testUserId,
        anonymousSenderId: null,
        conversationId: testConversationId
      };

      const mockStatuses = [
        {
          userId: testUserId2,
          receivedAt: new Date(),
          readAt: new Date(),
          user: { id: testUserId2, username: 'user2' }
        }
      ];

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.conversationMember.count.mockResolvedValue(2);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue(mockStatuses);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.messageId).toBe(testMessageId);
      expect(result.totalMembers).toBe(2);
      expect(result.receivedCount).toBe(1);
      expect(result.readCount).toBe(1);
      expect(result.receivedBy).toHaveLength(1);
      expect(result.readBy).toHaveLength(1);
    });

    it('should throw error when message not found', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.getMessageReadStatus('nonexistent-id', testConversationId)
      ).rejects.toThrow('Message nonexistent-id not found');
    });

    it('should exclude sender from counts', async () => {
      const mockMessage = {
        id: testMessageId,
        createdAt: new Date(),
        senderId: testUserId,
        anonymousSenderId: null,
        conversationId: testConversationId
      };

      // Prisma query filters with `userId: { not: authorId }`, so mock returns only non-sender
      const mockStatuses = [
        {
          userId: testUserId2,
          receivedAt: new Date(),
          readAt: new Date(),
          user: { id: testUserId2, username: 'user2' }
        }
      ];

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.conversationMember.count.mockResolvedValue(2); // 2 members excluding sender
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue(mockStatuses);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      // Should only count non-sender users
      expect(result.receivedCount).toBe(1);
      expect(result.readCount).toBe(1);
      expect(result.receivedBy[0].userId).toBe(testUserId2);
    });
  });

  // ==============================================
  // AUDIO STATUS TESTS
  // ==============================================

  describe('markAudioAsListened', () => {
    it('should create/update attachment status for audio', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'audio/mp3',
        message: { conversationId: testConversationId, senderId: testUserId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      // Mock for updateAttachmentComputedStatus
      mockPrisma.conversationMember.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ listenedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAudioAsListened(testUserId, testAttachmentId, {
        playPositionMs: 5000,
        listenDurationMs: 10000,
        complete: false
      });

      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith({
        where: {
          attachment_user_status: { attachmentId: testAttachmentId, userId: testUserId }
        },
        create: expect.objectContaining({
          attachmentId: testAttachmentId,
          messageId: testMessageId,
          userId: testUserId,
          listenedAt: expect.any(Date),
          listenCount: 1,
          lastPlayPositionMs: 5000,
          totalListenDurationMs: 10000,
          listenedComplete: false
        }),
        update: expect.objectContaining({
          listenedAt: expect.any(Date),
          listenCount: { increment: 1 }
        })
      });
    });

    it('should throw error when attachment not found', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      await expect(
        service.markAudioAsListened(testUserId, 'nonexistent')
      ).rejects.toThrow('Attachment nonexistent not found');
    });

    it('should track listen completion', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'audio/mp3',
        message: { conversationId: testConversationId, senderId: testUserId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.conversationMember.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ listenedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAudioAsListened(testUserId, testAttachmentId, { complete: true });

      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ listenedComplete: true }),
          update: expect.objectContaining({ listenedComplete: true })
        })
      );
    });
  });

  // ==============================================
  // VIDEO STATUS TESTS
  // ==============================================

  describe('markVideoAsWatched', () => {
    it('should create/update attachment status for video', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'video/mp4',
        message: { conversationId: testConversationId, senderId: testUserId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.conversationMember.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ watchedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markVideoAsWatched(testUserId, testAttachmentId, {
        watchPositionMs: 30000,
        watchDurationMs: 60000,
        complete: true
      });

      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith({
        where: {
          attachment_user_status: { attachmentId: testAttachmentId, userId: testUserId }
        },
        create: expect.objectContaining({
          watchedAt: expect.any(Date),
          watchCount: 1,
          lastWatchPositionMs: 30000,
          totalWatchDurationMs: 60000,
          watchedComplete: true
        }),
        update: expect.objectContaining({
          watchedAt: expect.any(Date),
          watchCount: { increment: 1 }
        })
      });
    });

    it('should throw error when attachment not found', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      await expect(
        service.markVideoAsWatched(testUserId, 'nonexistent')
      ).rejects.toThrow('Attachment nonexistent not found');
    });
  });

  // ==============================================
  // IMAGE STATUS TESTS
  // ==============================================

  describe('markImageAsViewed', () => {
    it('should create/update attachment status for image', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'image/jpeg',
        message: { conversationId: testConversationId, senderId: testUserId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.conversationMember.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ viewedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markImageAsViewed(testUserId, testAttachmentId, {
        viewDurationMs: 5000,
        wasZoomed: true
      });

      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith({
        where: {
          attachment_user_status: { attachmentId: testAttachmentId, userId: testUserId }
        },
        create: expect.objectContaining({
          viewedAt: expect.any(Date),
          viewDurationMs: 5000,
          wasZoomed: true
        }),
        update: expect.objectContaining({
          viewedAt: expect.any(Date),
          viewDurationMs: 5000,
          wasZoomed: true
        })
      });
    });

    it('should throw error when attachment not found', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      await expect(
        service.markImageAsViewed(testUserId, 'nonexistent')
      ).rejects.toThrow('Attachment nonexistent not found');
    });
  });

  // ==============================================
  // DOWNLOAD STATUS TESTS
  // ==============================================

  describe('markAttachmentAsDownloaded', () => {
    it('should create/update download status', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'application/pdf',
        message: { conversationId: testConversationId, senderId: testUserId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.conversationMember.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ downloadedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAttachmentAsDownloaded(testUserId, testAttachmentId);

      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith({
        where: {
          attachment_user_status: { attachmentId: testAttachmentId, userId: testUserId }
        },
        create: expect.objectContaining({
          downloadedAt: expect.any(Date)
        }),
        update: expect.objectContaining({
          downloadedAt: expect.any(Date)
        })
      });
    });

    it('should throw error when attachment not found', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      await expect(
        service.markAttachmentAsDownloaded(testUserId, 'nonexistent')
      ).rejects.toThrow('Attachment nonexistent not found');
    });
  });

  // ==============================================
  // GET ATTACHMENT STATUS TESTS
  // ==============================================

  describe('getAttachmentStatus', () => {
    it('should return full attachment status', async () => {
      mockPrisma.attachmentStatusEntry.findUnique.mockResolvedValue({
        viewedAt: new Date(),
        downloadedAt: new Date(),
        listenedAt: new Date(),
        watchedAt: null,
        listenCount: 3,
        watchCount: 0,
        listenedComplete: true,
        watchedComplete: false,
        lastPlayPositionMs: 10000,
        lastWatchPositionMs: null
      });

      const result = await service.getAttachmentStatus(testAttachmentId, testUserId);

      expect(result).toEqual({
        viewed: true,
        downloaded: true,
        listened: true,
        watched: false,
        listenCount: 3,
        watchCount: 0,
        listenedComplete: true,
        watchedComplete: false,
        lastPlayPositionMs: 10000,
        lastWatchPositionMs: null
      });
    });

    it('should return null when no status exists', async () => {
      mockPrisma.attachmentStatusEntry.findUnique.mockResolvedValue(null);

      const result = await service.getAttachmentStatus(testAttachmentId, testUserId);

      expect(result).toBeNull();
    });

    it('should return null on database error', async () => {
      mockPrisma.attachmentStatusEntry.findUnique.mockRejectedValue(new Error('DB error'));

      const result = await service.getAttachmentStatus(testAttachmentId, testUserId);

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalled();
    });
  });

  // ==============================================
  // GET CONVERSATION READ STATUSES TESTS
  // ==============================================

  describe('getConversationReadStatuses', () => {
    it('should return status map for multiple messages', async () => {
      const messageIds = [testMessageId, testMessageId2];

      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        { messageId: testMessageId, receivedAt: new Date(), readAt: new Date() },
        { messageId: testMessageId, receivedAt: new Date(), readAt: null },
        { messageId: testMessageId2, receivedAt: new Date(), readAt: new Date() }
      ]);

      const result = await service.getConversationReadStatuses(testConversationId, messageIds);

      expect(result).toBeInstanceOf(Map);
      expect(result.get(testMessageId)).toEqual({ receivedCount: 2, readCount: 1 });
      expect(result.get(testMessageId2)).toEqual({ receivedCount: 1, readCount: 1 });
    });

    it('should return empty counts for messages without statuses', async () => {
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);

      const result = await service.getConversationReadStatuses(testConversationId, [testMessageId]);

      expect(result.get(testMessageId)).toEqual({ receivedCount: 0, readCount: 0 });
    });
  });

  // ==============================================
  // CLEANUP OBSOLETE CURSORS TESTS
  // ==============================================

  describe('cleanupObsoleteCursors', () => {
    it('should return 0 when no cursors exist', async () => {
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);

      const count = await service.cleanupObsoleteCursors(testConversationId);

      expect(count).toBe(0);
      expect(mockPrisma.conversationReadCursor.deleteMany).not.toHaveBeenCalled();
    });

    it('should delete cursors pointing to deleted messages', async () => {
      const cursors = [
        { id: 'cursor-1', lastReadMessageId: 'deleted-msg' },
        { id: 'cursor-2', lastReadMessageId: 'existing-msg' }
      ];

      mockPrisma.conversationReadCursor.findMany.mockResolvedValue(cursors);
      mockPrisma.message.findMany.mockResolvedValue([{ id: 'existing-msg' }]);
      mockPrisma.conversationReadCursor.deleteMany.mockResolvedValue({ count: 1 });

      const count = await service.cleanupObsoleteCursors(testConversationId);

      expect(count).toBe(1);
      expect(mockPrisma.conversationReadCursor.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['cursor-1'] } }
      });
    });

    it('should not delete any cursors when all messages exist', async () => {
      const cursors = [
        { id: 'cursor-1', lastReadMessageId: 'msg-1' },
        { id: 'cursor-2', lastReadMessageId: 'msg-2' }
      ];

      mockPrisma.conversationReadCursor.findMany.mockResolvedValue(cursors);
      mockPrisma.message.findMany.mockResolvedValue([{ id: 'msg-1' }, { id: 'msg-2' }]);

      const count = await service.cleanupObsoleteCursors(testConversationId);

      expect(count).toBe(0);
      expect(mockPrisma.conversationReadCursor.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ==============================================
  // COMPUTED STATUS FIELDS TESTS
  // ==============================================

  describe('Computed Status Fields', () => {
    describe('updateMessageComputedStatus (via markMessagesAsRead)', () => {
      it('should update deliveredToAllAt when all participants delivered', async () => {
        const mockMessage = { id: testMessageId, createdAt: new Date() };

        mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
        mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
        mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
        mockPrisma.messageStatusEntry.upsert.mockResolvedValue({});

        // For updateMessageComputedStatus
        mockPrisma.message.findUnique.mockResolvedValue({
          id: testMessageId,
          conversationId: testConversationId,
          senderId: testUserId2,
          anonymousSenderId: null
        });
        mockPrisma.conversationMember.count.mockResolvedValue(2); // 2 participants (excluding sender)

        // All 2 participants have delivered and read
        mockPrisma.messageStatusEntry.count
          .mockResolvedValueOnce(2) // deliveredCount
          .mockResolvedValueOnce(2); // readCount

        const lastDeliveredDate = new Date('2025-01-01T12:00:00Z');
        const lastReadDate = new Date('2025-01-01T13:00:00Z');

        mockPrisma.messageStatusEntry.findFirst
          .mockResolvedValueOnce({ deliveredAt: lastDeliveredDate })
          .mockResolvedValueOnce({ readAt: lastReadDate });

        mockPrisma.message.update.mockResolvedValue({});

        await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

        expect(mockPrisma.message.update).toHaveBeenCalledWith({
          where: { id: testMessageId },
          data: {
            deliveredCount: 2,
            readCount: 2,
            deliveredToAllAt: lastDeliveredDate,
            readByAllAt: lastReadDate
          }
        });
      });

      it('should not set allAt dates when not all participants completed', async () => {
        const mockMessage = { id: testMessageId, createdAt: new Date() };

        mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
        mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
        mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
        mockPrisma.messageStatusEntry.upsert.mockResolvedValue({});

        mockPrisma.message.findUnique.mockResolvedValue({
          id: testMessageId,
          conversationId: testConversationId,
          senderId: testUserId2,
          anonymousSenderId: null
        });
        mockPrisma.conversationMember.count.mockResolvedValue(3); // 3 participants

        // Only 2 of 3 participants delivered, 1 read
        mockPrisma.messageStatusEntry.count
          .mockResolvedValueOnce(2) // deliveredCount
          .mockResolvedValueOnce(1); // readCount

        mockPrisma.message.update.mockResolvedValue({});

        await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

        expect(mockPrisma.message.update).toHaveBeenCalledWith({
          where: { id: testMessageId },
          data: {
            deliveredCount: 2,
            readCount: 1,
            deliveredToAllAt: null,
            readByAllAt: null
          }
        });
      });
    });

    describe('updateAttachmentComputedStatus (via markAudioAsListened)', () => {
      it('should update listenedByAllAt when all participants listened', async () => {
        mockPrisma.messageAttachment.findUnique.mockResolvedValue({
          id: testAttachmentId,
          messageId: testMessageId,
          mimeType: 'audio/mp3',
          message: {
            conversationId: testConversationId,
            senderId: testUserId2,
            anonymousSenderId: null
          }
        });
        mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});

        mockPrisma.conversationMember.count.mockResolvedValue(2);

        // All counts
        mockPrisma.attachmentStatusEntry.count
          .mockResolvedValueOnce(2) // viewedCount
          .mockResolvedValueOnce(2) // downloadedCount
          .mockResolvedValueOnce(2) // listenedCount
          .mockResolvedValueOnce(0); // watchedCount

        const listenedByAllDate = new Date('2025-01-01T14:00:00Z');

        mockPrisma.attachmentStatusEntry.findFirst
          .mockResolvedValueOnce({ viewedAt: new Date() })
          .mockResolvedValueOnce({ downloadedAt: new Date() })
          .mockResolvedValueOnce({ listenedAt: listenedByAllDate });

        mockPrisma.messageAttachment.update.mockResolvedValue({});

        await service.markAudioAsListened(testUserId, testAttachmentId, { complete: true });

        expect(mockPrisma.messageAttachment.update).toHaveBeenCalledWith({
          where: { id: testAttachmentId },
          data: expect.objectContaining({
            viewedCount: 2,
            downloadedCount: 2,
            consumedCount: 2, // listenedCount for audio
            listenedByAllAt: listenedByAllDate
          })
        });
      });
    });
  });

  // ==============================================
  // EDGE CASES AND ERROR HANDLING
  // ==============================================

  describe('Edge Cases', () => {
    it('should handle empty userId gracefully', async () => {
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.count.mockResolvedValue(0);

      const count = await service.getUnreadCount('', testConversationId);

      expect(count).toBe(0);
    });

    it('should handle concurrent operations', async () => {
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ unreadCount: 5 });

      const promises = [
        service.getUnreadCount(testUserId, testConversationId),
        service.getUnreadCount(testUserId, testConversationId),
        service.getUnreadCount(testUserId, testConversationId)
      ];

      const results = await Promise.all(promises);

      expect(results).toEqual([5, 5, 5]);
    });
  });

  // ==============================================
  // WORKFLOW TESTS
  // ==============================================

  describe('Workflow Tests', () => {
    it('should correctly track message status progression', async () => {
      // 1. Initial: No cursor, all messages unread
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.count.mockResolvedValue(5);

      let unreadCount = await service.getUnreadCount(testUserId, testConversationId);
      expect(unreadCount).toBe(5);

      // 2. Mark as received: cursor created with unreadCount
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId });
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.messageStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        conversationId: testConversationId,
        senderId: testUserId2
      });
      mockPrisma.conversationMember.count.mockResolvedValue(2);
      mockPrisma.messageStatusEntry.count.mockResolvedValue(1);
      mockPrisma.messageStatusEntry.findFirst.mockResolvedValue({ deliveredAt: new Date() });
      mockPrisma.message.update.mockResolvedValue({});

      await service.markMessagesAsReceived(testUserId, testConversationId, testMessageId);

      // 3. After received, cursor has updated unreadCount
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ unreadCount: 4 });

      unreadCount = await service.getUnreadCount(testUserId, testConversationId);
      expect(unreadCount).toBe(4);
    });

    it('should correctly track attachment status progression', async () => {
      const attachmentSetup = {
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'audio/mp3',
        message: { conversationId: testConversationId, senderId: testUserId2 }
      };

      mockPrisma.messageAttachment.findUnique.mockResolvedValue(attachmentSetup);
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.conversationMember.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ listenedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      // 1. First listen (partial)
      await service.markAudioAsListened(testUserId, testAttachmentId, {
        playPositionMs: 5000,
        listenDurationMs: 5000,
        complete: false
      });

      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            listenCount: 1,
            listenedComplete: false
          })
        })
      );

      // 2. Second listen (complete)
      await service.markAudioAsListened(testUserId, testAttachmentId, {
        playPositionMs: 10000,
        listenDurationMs: 10000,
        complete: true
      });

      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            listenCount: { increment: 1 },
            listenedComplete: true
          })
        })
      );
    });
  });

  // ==============================================
  // DATA ACCURACY & CONSISTENCY TESTS
  // ==============================================

  describe('Data Accuracy & Consistency', () => {
    it('should maintain accurate unread count after marking messages as read', async () => {
      // Setup: User has 5 unread messages
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ unreadCount: 5 });

      let unreadCount = await service.getUnreadCount(testUserId, testConversationId);
      expect(unreadCount).toBe(5);

      // Mark all as read
      const mockMessage = { id: testMessageId, createdAt: new Date() };
      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
      mockPrisma.messageStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        conversationId: testConversationId,
        senderId: testUserId2
      });
      mockPrisma.conversationMember.count.mockResolvedValue(2);
      mockPrisma.messageStatusEntry.count.mockResolvedValue(1);
      mockPrisma.messageStatusEntry.findFirst.mockResolvedValue({ readAt: new Date() });
      mockPrisma.message.update.mockResolvedValue({});

      await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

      // After reading, cursor should be updated to 0
      expect(mockPrisma.conversationReadCursor.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            unreadCount: 0
          })
        })
      );
    });

    it('should correctly compute deliveredToAllAt only when ALL participants delivered', async () => {
      const mockMessage = { id: testMessageId, createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
      mockPrisma.messageStatusEntry.upsert.mockResolvedValue({});

      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        conversationId: testConversationId,
        senderId: 'sender-id',
        anonymousSenderId: null
      });

      // 5 participants, only 3 have delivered
      mockPrisma.conversationMember.count.mockResolvedValue(5);
      mockPrisma.messageStatusEntry.count
        .mockResolvedValueOnce(3) // deliveredCount - NOT all
        .mockResolvedValueOnce(1); // readCount

      mockPrisma.message.update.mockResolvedValue({});

      await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

      // deliveredToAllAt should be null because not all delivered
      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: testMessageId },
        data: expect.objectContaining({
          deliveredToAllAt: null,
          deliveredCount: 3
        })
      });
    });

    it('should set readByAllAt with correct timestamp when all participants read', async () => {
      const mockMessage = { id: testMessageId, createdAt: new Date() };
      const allReadTimestamp = new Date('2025-06-15T10:30:00Z');

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
      mockPrisma.messageStatusEntry.upsert.mockResolvedValue({});

      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        conversationId: testConversationId,
        senderId: 'sender-id',
        anonymousSenderId: null
      });

      // All 3 participants have delivered and read
      mockPrisma.conversationMember.count.mockResolvedValue(3);
      mockPrisma.messageStatusEntry.count
        .mockResolvedValueOnce(3) // deliveredCount - ALL
        .mockResolvedValueOnce(3); // readCount - ALL

      mockPrisma.messageStatusEntry.findFirst
        .mockResolvedValueOnce({ deliveredAt: new Date('2025-06-15T09:00:00Z') })
        .mockResolvedValueOnce({ readAt: allReadTimestamp }); // Last read timestamp

      mockPrisma.message.update.mockResolvedValue({});

      await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: testMessageId },
        data: expect.objectContaining({
          readByAllAt: allReadTimestamp,
          readCount: 3
        })
      });
    });

    it('should maintain accurate attachment status counts', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'audio/mp3',
        message: {
          conversationId: testConversationId,
          senderId: 'sender-id',
          anonymousSenderId: null
        }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});

      // 4 participants, 3 viewed, 2 downloaded, 3 listened
      mockPrisma.conversationMember.count.mockResolvedValue(4);
      mockPrisma.attachmentStatusEntry.count
        .mockResolvedValueOnce(3) // viewedCount
        .mockResolvedValueOnce(2) // downloadedCount
        .mockResolvedValueOnce(3) // listenedCount
        .mockResolvedValueOnce(0); // watchedCount

      mockPrisma.attachmentStatusEntry.findFirst
        .mockResolvedValueOnce({ viewedAt: new Date() })
        .mockResolvedValueOnce({ downloadedAt: new Date() });

      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAudioAsListened(testUserId, testAttachmentId);

      expect(mockPrisma.messageAttachment.update).toHaveBeenCalledWith({
        where: { id: testAttachmentId },
        data: expect.objectContaining({
          viewedCount: 3,
          downloadedCount: 2,
          consumedCount: 3, // listenedCount for audio
          listenedByAllAt: null // Only 3 of 4 listened
        })
      });
    });
  });

  // ==============================================
  // IDEMPOTENCY TESTS
  // ==============================================

  describe('Idempotency', () => {
    it('should handle marking same message as read twice without errors', async () => {
      const mockMessage = { id: testMessageId, createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
      mockPrisma.messageStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        conversationId: testConversationId,
        senderId: testUserId2
      });
      mockPrisma.conversationMember.count.mockResolvedValue(2);
      mockPrisma.messageStatusEntry.count.mockResolvedValue(1);
      mockPrisma.messageStatusEntry.findFirst.mockResolvedValue({ readAt: new Date() });
      mockPrisma.message.update.mockResolvedValue({});

      // First read
      await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

      // Second read - should use upsert.update path
      await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

      // Upsert should be called twice, using update path second time
      expect(mockPrisma.messageStatusEntry.upsert).toHaveBeenCalledTimes(2);
    });

    it('should not increment listen count when using upsert create (first listen)', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'audio/mp3',
        message: { conversationId: testConversationId, senderId: testUserId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.conversationMember.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ listenedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAudioAsListened(testUserId, testAttachmentId);

      // Create should start with listenCount: 1, not increment
      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            listenCount: 1 // Fixed value, not increment
          }),
          update: expect.objectContaining({
            listenCount: { increment: 1 } // Increment for subsequent listens
          })
        })
      );
    });

    it('should handle marking attachment as downloaded multiple times', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'application/pdf',
        message: { conversationId: testConversationId, senderId: testUserId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.conversationMember.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ downloadedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      // Download twice
      await service.markAttachmentAsDownloaded(testUserId, testAttachmentId);
      await service.markAttachmentAsDownloaded(testUserId, testAttachmentId);

      // Both calls should succeed via upsert
      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledTimes(2);
    });
  });

  // ==============================================
  // CONCURRENCY & RACE CONDITION TESTS
  // ==============================================

  describe('Concurrency & Race Conditions', () => {
    it('should handle multiple users marking same message as read simultaneously', async () => {
      const mockMessage = { id: testMessageId, createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
      mockPrisma.messageStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        conversationId: testConversationId,
        senderId: 'sender-id'
      });
      mockPrisma.conversationMember.count.mockResolvedValue(3);
      mockPrisma.messageStatusEntry.count.mockResolvedValue(2);
      mockPrisma.messageStatusEntry.findFirst.mockResolvedValue({ readAt: new Date() });
      mockPrisma.message.update.mockResolvedValue({});

      const user1 = 'user-1';
      const user2 = 'user-2';
      const user3 = 'user-3';

      // Simulate concurrent reads
      const promises = [
        service.markMessagesAsRead(user1, testConversationId, testMessageId),
        service.markMessagesAsRead(user2, testConversationId, testMessageId),
        service.markMessagesAsRead(user3, testConversationId, testMessageId)
      ];

      await expect(Promise.all(promises)).resolves.not.toThrow();

      // Each user should have their own status entry via upsert
      expect(mockPrisma.messageStatusEntry.upsert).toHaveBeenCalledTimes(3);
    });

    it('should handle concurrent attachment status updates', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'audio/mp3',
        message: { conversationId: testConversationId, senderId: 'sender-id' }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.conversationMember.count.mockResolvedValue(5);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(3);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ listenedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      // Multiple users listening simultaneously
      const promises = [
        service.markAudioAsListened('user-1', testAttachmentId),
        service.markAudioAsListened('user-2', testAttachmentId),
        service.markAudioAsListened('user-3', testAttachmentId)
      ];

      await expect(Promise.all(promises)).resolves.not.toThrow();
    });

    it('should handle rapid successive status updates', async () => {
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ unreadCount: 10 });

      // Rapid successive reads
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(service.getUnreadCount(testUserId, testConversationId));
      }

      const results = await Promise.all(promises);

      // All should return same value
      expect(results.every(r => r === 10)).toBe(true);
    });
  });

  // ==============================================
  // ANONYMOUS USER TESTS
  // ==============================================

  describe('Anonymous User Handling', () => {
    it('should handle messages from anonymous senders', async () => {
      const anonymousSenderId = 'anon-sender-123';
      const mockMessage = {
        id: testMessageId,
        createdAt: new Date(),
        senderId: null,
        anonymousSenderId: anonymousSenderId,
        conversationId: testConversationId
      };

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.conversationMember.count.mockResolvedValue(3);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        {
          userId: testUserId,
          receivedAt: new Date(),
          readAt: new Date(),
          user: { id: testUserId, username: 'user1' }
        }
      ]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.totalMembers).toBe(3);
      expect(result.receivedBy).toHaveLength(1);
    });

    it('should correctly exclude anonymous sender from computed status', async () => {
      const mockMessage = { id: testMessageId, createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
      mockPrisma.messageStatusEntry.upsert.mockResolvedValue({});

      // Message sent by anonymous user
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        conversationId: testConversationId,
        senderId: null,
        anonymousSenderId: 'anon-sender'
      });

      mockPrisma.conversationMember.count.mockResolvedValue(2);
      mockPrisma.messageStatusEntry.count
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(2);

      const allReadDate = new Date();
      mockPrisma.messageStatusEntry.findFirst
        .mockResolvedValueOnce({ deliveredAt: allReadDate })
        .mockResolvedValueOnce({ readAt: allReadDate });

      mockPrisma.message.update.mockResolvedValue({});

      await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: testMessageId },
        data: expect.objectContaining({
          deliveredCount: 2,
          readCount: 2
        })
      });
    });
  });

  // ==============================================
  // BULK OPERATIONS & PERFORMANCE TESTS
  // ==============================================

  describe('Bulk Operations & Performance', () => {
    it('should handle marking many messages as read efficiently', async () => {
      const messageCount = 50;
      const messages = Array.from({ length: messageCount }, (_, i) => ({
        id: `msg-${i}`
      }));

      const mockMessage = { id: 'msg-49', createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.message.findMany.mockResolvedValue(messages);
      mockPrisma.messageStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.message.findUnique.mockResolvedValue({
        id: 'msg-49',
        conversationId: testConversationId,
        senderId: testUserId2
      });
      mockPrisma.conversationMember.count.mockResolvedValue(2);
      mockPrisma.messageStatusEntry.count.mockResolvedValue(1);
      mockPrisma.messageStatusEntry.findFirst.mockResolvedValue({ readAt: new Date() });
      mockPrisma.message.update.mockResolvedValue({});

      await service.markMessagesAsRead(testUserId, testConversationId, 'msg-49');

      // Should create status entries for all messages
      expect(mockPrisma.messageStatusEntry.upsert).toHaveBeenCalledTimes(messageCount);
    });

    it('should get unread counts for many conversations efficiently', async () => {
      const conversationCount = 20;
      const conversationIds = Array.from({ length: conversationCount }, (_, i) => `conv-${i}`);

      // Half have cursors, half don't
      const cursors = conversationIds.slice(0, 10).map(id => ({
        conversationId: id,
        unreadCount: Math.floor(Math.random() * 10)
      }));

      mockPrisma.conversationReadCursor.findMany.mockResolvedValue(cursors);
      mockPrisma.message.count.mockResolvedValue(5);

      const result = await service.getUnreadCountsForConversations(testUserId, conversationIds);

      expect(result.size).toBe(conversationCount);
      // Should make 1 findMany for cursors + 10 individual counts for conversations without cursor
      expect(mockPrisma.conversationReadCursor.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.message.count).toHaveBeenCalledTimes(10);
    });
  });

  // ==============================================
  // ERROR RECOVERY & DATA INTEGRITY TESTS
  // ==============================================

  describe('Error Recovery & Data Integrity', () => {
    it('should not leave inconsistent state when updateComputedStatus fails', async () => {
      const mockMessage = { id: testMessageId, createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
      mockPrisma.messageStatusEntry.upsert.mockResolvedValue({});

      // updateMessageComputedStatus will fail
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        conversationId: testConversationId,
        senderId: testUserId2
      });
      mockPrisma.conversationMember.count.mockRejectedValue(new Error('DB error'));

      // Should not throw - computed status update errors are caught
      await expect(
        service.markMessagesAsRead(testUserId, testConversationId, testMessageId)
      ).resolves.not.toThrow();

      // Status entry should still have been created
      expect(mockPrisma.messageStatusEntry.upsert).toHaveBeenCalled();
    });

    it('should handle missing message gracefully in getMessageReadStatus', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.getMessageReadStatus('missing-msg', testConversationId)
      ).rejects.toThrow('Message missing-msg not found');
    });

    it('should handle database timeout gracefully', async () => {
      mockPrisma.conversationReadCursor.findUnique.mockRejectedValue(
        new Error('Connection timeout')
      );

      const count = await service.getUnreadCount(testUserId, testConversationId);

      expect(count).toBe(0);
      expect(console.error).toHaveBeenCalled();
    });
  });

  // ==============================================
  // ATTACHMENT TYPE-SPECIFIC COMPUTED STATUS TESTS
  // ==============================================

  describe('Attachment Type-Specific Status', () => {
    it('should use listenedCount for consumedCount on audio attachments', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'audio/mpeg',
        message: { conversationId: testConversationId, senderId: testUserId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.conversationMember.count.mockResolvedValue(5);

      // 3 viewed, 2 downloaded, 4 listened, 0 watched
      mockPrisma.attachmentStatusEntry.count
        .mockResolvedValueOnce(3) // viewedCount
        .mockResolvedValueOnce(2) // downloadedCount
        .mockResolvedValueOnce(4) // listenedCount - this should be consumedCount for audio
        .mockResolvedValueOnce(0); // watchedCount

      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue(null);
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAudioAsListened(testUserId, testAttachmentId);

      // Verify consumedCount is listenedCount for audio
      const updateCall = mockPrisma.messageAttachment.update.mock.calls[0][0];
      expect(updateCall.data.consumedCount).toBe(4); // listenedCount
      expect(updateCall.data.viewedCount).toBe(3);
      expect(updateCall.data.downloadedCount).toBe(2);
    });

    it('should use watchedCount for consumedCount on video attachments', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'video/mp4',
        message: { conversationId: testConversationId, senderId: testUserId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.conversationMember.count.mockResolvedValue(5);

      // 4 viewed, 3 downloaded, 0 listened, 2 watched
      mockPrisma.attachmentStatusEntry.count
        .mockResolvedValueOnce(4) // viewedCount
        .mockResolvedValueOnce(3) // downloadedCount
        .mockResolvedValueOnce(0) // listenedCount
        .mockResolvedValueOnce(2); // watchedCount - this should be consumedCount for video

      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue(null);
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markVideoAsWatched(testUserId, testAttachmentId);

      // Verify consumedCount is watchedCount for video
      const updateCall = mockPrisma.messageAttachment.update.mock.calls[0][0];
      expect(updateCall.data.consumedCount).toBe(2); // watchedCount
      expect(updateCall.data.viewedCount).toBe(4);
      expect(updateCall.data.downloadedCount).toBe(3);
    });

    it('should use viewedCount for consumedCount on image attachments', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'image/png',
        message: { conversationId: testConversationId, senderId: testUserId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.conversationMember.count.mockResolvedValue(5);

      // 3 viewed, 2 downloaded, 0 listened, 0 watched
      mockPrisma.attachmentStatusEntry.count
        .mockResolvedValueOnce(3) // viewedCount - this should be consumedCount for image
        .mockResolvedValueOnce(2) // downloadedCount
        .mockResolvedValueOnce(0) // listenedCount
        .mockResolvedValueOnce(0); // watchedCount

      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue(null);
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markImageAsViewed(testUserId, testAttachmentId);

      // Verify consumedCount is viewedCount for non-audio/video
      const updateCall = mockPrisma.messageAttachment.update.mock.calls[0][0];
      expect(updateCall.data.consumedCount).toBe(3); // viewedCount
      expect(updateCall.data.viewedCount).toBe(3);
      expect(updateCall.data.downloadedCount).toBe(2);
    });

    it('should use viewedCount for consumedCount on document attachments', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'application/pdf',
        message: { conversationId: testConversationId, senderId: testUserId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.conversationMember.count.mockResolvedValue(5);

      // 5 viewed, 4 downloaded, 0 listened, 0 watched
      mockPrisma.attachmentStatusEntry.count
        .mockResolvedValueOnce(5) // viewedCount
        .mockResolvedValueOnce(4) // downloadedCount
        .mockResolvedValueOnce(0) // listenedCount
        .mockResolvedValueOnce(0); // watchedCount

      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue(null);
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAttachmentAsDownloaded(testUserId, testAttachmentId);

      // Verify consumedCount is viewedCount for documents
      const updateCall = mockPrisma.messageAttachment.update.mock.calls[0][0];
      expect(updateCall.data.consumedCount).toBe(5); // viewedCount (not audio/video)
    });
  });
});
