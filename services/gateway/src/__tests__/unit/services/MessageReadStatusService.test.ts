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
jest.mock('../../../services/notifications/NotificationService', () => ({
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
    count: jest.fn(),
    findMany: jest.fn()
  },
  // Mock $transaction to pass the mock prisma to the callback
  $transaction: jest.fn().mockImplementation(async (callback: (tx: any) => Promise<any>) => {
    // Create a transaction mock that proxies to the main mock (includes findMany)
    return callback(mockPrisma);
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

    // Clear the static dedup cache to ensure tests are isolated
    (MessageReadStatusService as any).recentActionCache.clear();

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

      const result = await service.getUnreadCountsForConversations(testUserId, conversationIds);

      expect(result.get(conversationIds[0])).toBe(5);
      expect(result.get(conversationIds[1])).toBe(3);
      // In cursor-based approach, conversations without cursors default to 0
      expect(result.get(conversationIds[2])).toBe(0);
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
    it('should create cursor when marking as received (cursor-only approach)', async () => {
      const mockMessage = { id: testMessageId, conversationId: testConversationId };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      // Mock for updateUnreadCount
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.count.mockResolvedValue(0);

      await service.markMessagesAsReceived(testUserId, testConversationId, testMessageId);

      expect(mockPrisma.conversationReadCursor.upsert).toHaveBeenCalledWith({
        where: {
          conversation_user_cursor: { userId: testUserId, conversationId: testConversationId }
        },
        create: expect.objectContaining({
          userId: testUserId,
          conversationId: testConversationId,
          lastDeliveredMessageId: testMessageId,
          lastDeliveredAt: expect.any(Date),
          unreadCount: 0,
          version: 0
        }),
        update: expect.objectContaining({
          lastDeliveredMessageId: testMessageId,
          lastDeliveredAt: expect.any(Date),
          version: { increment: 1 }
        })
      });

      // Cursor-only approach: no messageStatusEntry.upsert
      expect(mockPrisma.messageStatusEntry.upsert).not.toHaveBeenCalled();
    });

    it('should fetch latest message when messageId not provided', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId });
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      // Mock for updateUnreadCount
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.count.mockResolvedValue(0);

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
    });

    it('should proceed with provided messageId even without validation', async () => {
      // In the cursor-based approach, when a messageId is explicitly provided,
      // the service proceeds directly without fetching the latest message.
      // The messageId is trusted as provided by the caller.
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      // Mock for updateUnreadCount
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.count.mockResolvedValue(0);

      await service.markMessagesAsReceived(testUserId, testConversationId, 'provided-message-id');

      expect(mockPrisma.conversationReadCursor.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            lastDeliveredMessageId: 'provided-message-id'
          })
        })
      );
    });
  });

  // ==============================================
  // MARK MESSAGES AS READ TESTS
  // ==============================================

  describe('markMessagesAsRead', () => {
    it('should update cursor only (cursor-based approach, no individual status entries)', async () => {
      const messageDate = new Date('2025-01-01');
      const mockMessage = { id: testMessageId, createdAt: messageDate };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});

      await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

      expect(mockPrisma.conversationReadCursor.upsert).toHaveBeenCalledWith({
        where: {
          conversation_user_cursor: { userId: testUserId, conversationId: testConversationId }
        },
        create: expect.objectContaining({
          lastReadMessageId: testMessageId,
          lastReadAt: expect.any(Date),
          lastDeliveredMessageId: testMessageId,
          lastDeliveredAt: expect.any(Date),
          unreadCount: 0,
          version: 0
        }),
        update: expect.objectContaining({
          lastReadMessageId: testMessageId,
          lastReadAt: expect.any(Date),
          unreadCount: 0,
          version: { increment: 1 }
        })
      });

      // Cursor-only approach: no messageStatusEntry.upsert, no message.findMany, no message.update
      expect(mockPrisma.messageStatusEntry.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.message.update).not.toHaveBeenCalled();
    });

    it('should sync notifications when marking as read', async () => {
      const mockMessage = { id: testMessageId, createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});

      await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

      // Notification sync happens after main operation
      expect(console.log).toHaveBeenCalled();
    });
  });

  // ==============================================
  // GET MESSAGE READ STATUS TESTS
  // ==============================================

  describe('getMessageReadStatus', () => {
    it('should return detailed read status for a message using cursors', async () => {
      const messageCreatedAt = new Date('2025-01-01T10:00:00Z');
      const mockMessage = {
        id: testMessageId,
        createdAt: messageCreatedAt,
        senderId: testUserId,
        anonymousSenderId: null,
        conversationId: testConversationId
      };

      const mockMembers = [
        { userId: testUserId },
        { userId: testUserId2 }
      ];

      // Cursors with lastDeliveredAt and lastReadAt >= message.createdAt
      const mockCursors = [
        {
          userId: testUserId2,
          lastDeliveredAt: new Date('2025-01-01T10:05:00Z'),
          lastReadAt: new Date('2025-01-01T10:10:00Z'),
          user: { id: testUserId2, username: 'user2' }
        }
      ];

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.conversationMember.findMany.mockResolvedValue(mockMembers);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue(mockCursors);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.messageId).toBe(testMessageId);
      expect(result.totalMembers).toBe(1); // 2 members - 1 sender = 1
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

    it('should exclude sender from counts using cursor-based approach', async () => {
      const messageCreatedAt = new Date('2025-01-01T10:00:00Z');
      const mockMessage = {
        id: testMessageId,
        createdAt: messageCreatedAt,
        senderId: testUserId,
        anonymousSenderId: null,
        conversationId: testConversationId
      };

      const mockMembers = [
        { userId: testUserId },
        { userId: testUserId2 }
      ];

      // Cursor for non-sender user with timestamps >= message.createdAt
      const mockCursors = [
        {
          userId: testUserId2,
          lastDeliveredAt: new Date('2025-01-01T10:05:00Z'),
          lastReadAt: new Date('2025-01-01T10:10:00Z'),
          user: { id: testUserId2, username: 'user2' }
        }
      ];

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.conversationMember.findMany.mockResolvedValue(mockMembers);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue(mockCursors);

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
    it('should return status map for multiple messages using cursors', async () => {
      const messageIds = [testMessageId, testMessageId2];
      const message1CreatedAt = new Date('2025-01-01T10:00:00Z');
      const message2CreatedAt = new Date('2025-01-01T11:00:00Z');

      // Mock messages with createdAt timestamps
      mockPrisma.message.findMany.mockResolvedValue([
        { id: testMessageId, createdAt: message1CreatedAt, senderId: 'sender-1' },
        { id: testMessageId2, createdAt: message2CreatedAt, senderId: 'sender-2' }
      ]);

      // Mock cursors: 2 users with different read/delivered timestamps
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        {
          userId: testUserId,
          lastDeliveredAt: new Date('2025-01-01T12:00:00Z'), // After both messages
          lastReadAt: new Date('2025-01-01T12:00:00Z') // After both messages
        },
        {
          userId: testUserId2,
          lastDeliveredAt: new Date('2025-01-01T10:30:00Z'), // After message1, before message2
          lastReadAt: null // Never read
        }
      ]);

      const result = await service.getConversationReadStatuses(testConversationId, messageIds);

      expect(result).toBeInstanceOf(Map);
      // message1: user1 delivered+read, user2 delivered only (but user2 is sender so excluded)
      // Actually sender is 'sender-1', so both testUserId and testUserId2 are counted
      // testUserId: delivered+read, testUserId2: delivered only
      expect(result.get(testMessageId)).toEqual({ receivedCount: 2, readCount: 1 });
      // message2: only testUserId delivered+read (testUserId2's delivered is before message2)
      expect(result.get(testMessageId2)).toEqual({ receivedCount: 1, readCount: 1 });
    });

    it('should return empty counts for messages without cursors', async () => {
      mockPrisma.message.findMany.mockResolvedValue([
        { id: testMessageId, createdAt: new Date(), senderId: 'sender-1' }
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);

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
    describe('updateMessageComputedStatus is now a no-op', () => {
      it('should NOT update message computed fields (cursor-based approach)', async () => {
        // In the new cursor-based architecture, updateMessageComputedStatus is a no-op
        // Read statuses are computed dynamically via cursors, not stored on Message
        const mockMessage = { id: testMessageId, createdAt: new Date() };

        mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
        mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});

        await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

        // message.update should NOT be called for computed status fields
        expect(mockPrisma.message.update).not.toHaveBeenCalled();
      });

      it('should NOT create messageStatusEntry records (cursor-based approach)', async () => {
        const mockMessage = { id: testMessageId, createdAt: new Date() };

        mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
        mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});

        await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

        // messageStatusEntry.upsert should NOT be called
        expect(mockPrisma.messageStatusEntry.upsert).not.toHaveBeenCalled();
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
    it('should correctly track message status progression (cursor-based)', async () => {
      // 1. Initial: No cursor, all messages unread
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.count.mockResolvedValue(5);

      let unreadCount = await service.getUnreadCount(testUserId, testConversationId);
      expect(unreadCount).toBe(5);

      // 2. Mark as received: cursor created (cursor-only approach)
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId });
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      // Mock for updateUnreadCount called after upsert
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.count.mockResolvedValue(4);

      await service.markMessagesAsReceived(testUserId, testConversationId, testMessageId);

      // Verify cursor-only approach: no messageStatusEntry or message.update
      expect(mockPrisma.messageStatusEntry.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.message.update).not.toHaveBeenCalled();

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

    it('should NOT compute deliveredToAllAt (cursor-based approach does not track individual message delivery)', async () => {
      // In the new cursor-based architecture, deliveredToAllAt is no longer computed
      // Read statuses are determined dynamically via cursors
      const mockMessage = { id: testMessageId, createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});

      await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

      // message.update should NOT be called in cursor-based approach
      expect(mockPrisma.message.update).not.toHaveBeenCalled();
    });

    it('should NOT set readByAllAt (cursor-based approach)', async () => {
      // In the new cursor-based architecture, readByAllAt is no longer computed
      const mockMessage = { id: testMessageId, createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});

      await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

      // message.update should NOT be called in cursor-based approach
      expect(mockPrisma.message.update).not.toHaveBeenCalled();
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
    it('should handle marking same message as read twice without errors (cursor-based)', async () => {
      const mockMessage = { id: testMessageId, createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});

      // First read
      await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

      // Clear the dedup cache to allow second call
      (MessageReadStatusService as any).recentActionCache.clear();

      // Second read - should use cursor upsert.update path
      await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

      // Cursor upsert should be called twice (once per markMessagesAsRead call)
      expect(mockPrisma.conversationReadCursor.upsert).toHaveBeenCalledTimes(2);
      // No messageStatusEntry.upsert in cursor-based approach
      expect(mockPrisma.messageStatusEntry.upsert).not.toHaveBeenCalled();
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
      // The service now uses cursor-based approach - each user gets their own cursor
      const mockMessage = { id: testMessageId, createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});

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

      // Each user should have their own cursor via upsert (cursor-based approach)
      expect(mockPrisma.conversationReadCursor.upsert).toHaveBeenCalledTimes(3);
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
    it('should handle messages from anonymous senders using cursor-based approach', async () => {
      const anonymousSenderId = 'anon-sender-123';
      const messageCreatedAt = new Date('2025-01-01T10:00:00Z');
      const mockMessage = {
        id: testMessageId,
        createdAt: messageCreatedAt,
        senderId: null,
        anonymousSenderId: anonymousSenderId,
        conversationId: testConversationId
      };

      const mockMembers = [
        { userId: testUserId },
        { userId: testUserId2 },
        { userId: 'user-3' }
      ];

      // Cursor with timestamps >= message.createdAt
      const mockCursors = [
        {
          userId: testUserId,
          lastDeliveredAt: new Date('2025-01-01T10:05:00Z'),
          lastReadAt: new Date('2025-01-01T10:10:00Z'),
          user: { id: testUserId, username: 'user1' }
        }
      ];

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.conversationMember.findMany.mockResolvedValue(mockMembers);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue(mockCursors);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.totalMembers).toBe(3); // Anonymous sender not excluded
      expect(result.receivedBy).toHaveLength(1);
    });

    it('should correctly handle anonymous sender in markMessagesAsRead', async () => {
      // The service now uses a simplified cursor-based approach
      // It updates conversationReadCursor instead of messageStatusEntry and message.update
      const mockMessage = { id: testMessageId, createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});

      await service.markMessagesAsRead(testUserId, testConversationId, testMessageId);

      // Should update the read cursor
      expect(mockPrisma.conversationReadCursor.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            conversation_user_cursor: { userId: testUserId, conversationId: testConversationId }
          }
        })
      );
    });
  });

  // ==============================================
  // BULK OPERATIONS & PERFORMANCE TESTS
  // ==============================================

  describe('Bulk Operations & Performance', () => {
    it('should handle marking messages as read efficiently with cursor update', async () => {
      // The service now uses a simplified cursor-based approach
      // It only updates conversationReadCursor once, not individual messageStatusEntry
      const mockMessage = { id: 'msg-49', createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});

      await service.markMessagesAsRead(testUserId, testConversationId, 'msg-49');

      // Should update cursor once regardless of message count
      expect(mockPrisma.conversationReadCursor.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrisma.conversationReadCursor.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            conversation_user_cursor: { userId: testUserId, conversationId: testConversationId }
          },
          update: expect.objectContaining({
            lastReadMessageId: 'msg-49',
            unreadCount: 0
          })
        })
      );
    });

    it('should get unread counts for many conversations efficiently', async () => {
      const conversationCount = 20;
      const conversationIds = Array.from({ length: conversationCount }, (_, i) => `conv-${i}`);

      // Half have cursors with unread counts
      const cursors = conversationIds.slice(0, 10).map(id => ({
        conversationId: id,
        unreadCount: Math.floor(Math.random() * 10)
      }));

      mockPrisma.conversationReadCursor.findMany.mockResolvedValue(cursors);

      const result = await service.getUnreadCountsForConversations(testUserId, conversationIds);

      expect(result.size).toBe(conversationCount);
      // Should make only 1 findMany for cursors - no individual message.count calls needed
      // Conversations without cursors default to 0
      expect(mockPrisma.conversationReadCursor.findMany).toHaveBeenCalledTimes(1);

      // Verify that conversations with cursors have their unreadCount
      cursors.forEach(cursor => {
        expect(result.get(cursor.conversationId)).toBe(cursor.unreadCount);
      });

      // Verify that conversations without cursors default to 0
      conversationIds.slice(10).forEach(id => {
        expect(result.get(id)).toBe(0);
      });
    });
  });

  // ==============================================
  // ERROR RECOVERY & DATA INTEGRITY TESTS
  // ==============================================

  describe('Error Recovery & Data Integrity', () => {
    it('should complete cursor update even if notification sync fails', async () => {
      // The service now uses a simplified cursor-based approach
      // Even if notification sync fails, the cursor update should complete
      const mockMessage = { id: testMessageId, createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});

      // Should not throw - notification sync errors are caught internally
      await expect(
        service.markMessagesAsRead(testUserId, testConversationId, testMessageId)
      ).resolves.not.toThrow();

      // Cursor should still have been updated
      expect(mockPrisma.conversationReadCursor.upsert).toHaveBeenCalled();
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

  // ==============================================
  // DEADLOCK RETRY (P2034) TESTS - withRetry function
  // ==============================================

  describe('Deadlock Retry (P2034 - withRetry)', () => {
    // Helper to create a Prisma P2034 deadlock error
    const createDeadlockError = () => {
      const error = new Error('Transaction failed due to a write conflict or a deadlock');
      (error as any).code = 'P2034';
      return error;
    };

    // Helper to create a non-P2034 Prisma error
    const createNonDeadlockError = (code: string = 'P2025') => {
      const error = new Error('Record not found');
      (error as any).code = code;
      return error;
    };

    describe('markAudioAsListened with retry', () => {
      beforeEach(() => {
        // Setup common mocks for attachment methods
        mockPrisma.messageAttachment.findUnique.mockResolvedValue({
          id: testAttachmentId,
          messageId: testMessageId,
          mimeType: 'audio/mp3',
          message: { conversationId: testConversationId, senderId: testUserId2 }
        });
        mockPrisma.conversationMember.count.mockResolvedValue(2);
        mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
        mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ listenedAt: new Date() });
        mockPrisma.messageAttachment.update.mockResolvedValue({});
      });

      it('should retry and succeed after P2034 deadlock error on first attempt', async () => {
        // First call fails with P2034, second call succeeds
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockImplementationOnce(async (callback: (tx: any) => Promise<any>) => {
            return callback(mockPrisma);
          });

        await service.markAudioAsListened(testUserId, testAttachmentId);

        // $transaction should have been called twice (1 failure + 1 success)
        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      });

      it('should succeed after 2 P2034 failures on 3rd attempt', async () => {
        // First two calls fail with P2034, third call succeeds
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError())
          .mockImplementationOnce(async (callback: (tx: any) => Promise<any>) => {
            return callback(mockPrisma);
          });

        await service.markAudioAsListened(testUserId, testAttachmentId);

        // $transaction should have been called 3 times (2 failures + 1 success)
        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
      });

      it('should throw P2034 error after exhausting all 3 retry attempts', async () => {
        // All 3 attempts fail with P2034
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError());

        await expect(
          service.markAudioAsListened(testUserId, testAttachmentId)
        ).rejects.toMatchObject({ code: 'P2034' });

        // $transaction should have been called 3 times (all failures)
        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
      });

      it('should throw non-P2034 error immediately without retry', async () => {
        // First call fails with non-P2034 error
        mockPrisma.$transaction.mockRejectedValueOnce(createNonDeadlockError('P2025'));

        await expect(
          service.markAudioAsListened(testUserId, testAttachmentId)
        ).rejects.toMatchObject({ code: 'P2025' });

        // $transaction should have been called only once (no retry for non-P2034)
        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      });
    });

    describe('markVideoAsWatched with retry', () => {
      beforeEach(() => {
        mockPrisma.messageAttachment.findUnique.mockResolvedValue({
          id: testAttachmentId,
          messageId: testMessageId,
          mimeType: 'video/mp4',
          message: { conversationId: testConversationId, senderId: testUserId2 }
        });
        mockPrisma.conversationMember.count.mockResolvedValue(2);
        mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
        mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ watchedAt: new Date() });
        mockPrisma.messageAttachment.update.mockResolvedValue({});
      });

      it('should retry and succeed after P2034 deadlock error', async () => {
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockImplementationOnce(async (callback: (tx: any) => Promise<any>) => {
            return callback(mockPrisma);
          });

        await service.markVideoAsWatched(testUserId, testAttachmentId);

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      });

      it('should throw P2034 error after exhausting retries', async () => {
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError());

        await expect(
          service.markVideoAsWatched(testUserId, testAttachmentId)
        ).rejects.toMatchObject({ code: 'P2034' });

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
      });

      it('should throw non-P2034 error immediately', async () => {
        mockPrisma.$transaction.mockRejectedValueOnce(createNonDeadlockError('P2002'));

        await expect(
          service.markVideoAsWatched(testUserId, testAttachmentId)
        ).rejects.toMatchObject({ code: 'P2002' });

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      });
    });

    describe('markImageAsViewed with retry', () => {
      beforeEach(() => {
        mockPrisma.messageAttachment.findUnique.mockResolvedValue({
          id: testAttachmentId,
          messageId: testMessageId,
          mimeType: 'image/jpeg',
          message: { conversationId: testConversationId, senderId: testUserId2 }
        });
        mockPrisma.conversationMember.count.mockResolvedValue(2);
        mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
        mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ viewedAt: new Date() });
        mockPrisma.messageAttachment.update.mockResolvedValue({});
      });

      it('should retry and succeed after P2034 deadlock error', async () => {
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockImplementationOnce(async (callback: (tx: any) => Promise<any>) => {
            return callback(mockPrisma);
          });

        await service.markImageAsViewed(testUserId, testAttachmentId);

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      });

      it('should throw P2034 error after exhausting retries', async () => {
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError());

        await expect(
          service.markImageAsViewed(testUserId, testAttachmentId)
        ).rejects.toMatchObject({ code: 'P2034' });

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
      });

      it('should throw non-P2034 error immediately', async () => {
        mockPrisma.$transaction.mockRejectedValueOnce(createNonDeadlockError('P2003'));

        await expect(
          service.markImageAsViewed(testUserId, testAttachmentId)
        ).rejects.toMatchObject({ code: 'P2003' });

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      });
    });

    describe('markAttachmentAsDownloaded with retry', () => {
      beforeEach(() => {
        mockPrisma.messageAttachment.findUnique.mockResolvedValue({
          id: testAttachmentId,
          messageId: testMessageId,
          mimeType: 'application/pdf',
          message: { conversationId: testConversationId, senderId: testUserId2 }
        });
        mockPrisma.conversationMember.count.mockResolvedValue(2);
        mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
        mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ downloadedAt: new Date() });
        mockPrisma.messageAttachment.update.mockResolvedValue({});
      });

      it('should retry and succeed after P2034 deadlock error', async () => {
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockImplementationOnce(async (callback: (tx: any) => Promise<any>) => {
            return callback(mockPrisma);
          });

        await service.markAttachmentAsDownloaded(testUserId, testAttachmentId);

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      });

      it('should succeed after 2 P2034 failures on 3rd attempt', async () => {
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError())
          .mockImplementationOnce(async (callback: (tx: any) => Promise<any>) => {
            return callback(mockPrisma);
          });

        await service.markAttachmentAsDownloaded(testUserId, testAttachmentId);

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
      });

      it('should throw P2034 error after exhausting retries', async () => {
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError());

        await expect(
          service.markAttachmentAsDownloaded(testUserId, testAttachmentId)
        ).rejects.toMatchObject({ code: 'P2034' });

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
      });

      it('should throw non-P2034 error immediately without retry', async () => {
        const uniqueConstraintError = createNonDeadlockError('P2002');
        mockPrisma.$transaction.mockRejectedValueOnce(uniqueConstraintError);

        await expect(
          service.markAttachmentAsDownloaded(testUserId, testAttachmentId)
        ).rejects.toMatchObject({ code: 'P2002' });

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      });

      it('should throw error without code property immediately without retry', async () => {
        const genericError = new Error('Generic database error');
        mockPrisma.$transaction.mockRejectedValueOnce(genericError);

        await expect(
          service.markAttachmentAsDownloaded(testUserId, testAttachmentId)
        ).rejects.toThrow('Generic database error');

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      });
    });
  });
});
