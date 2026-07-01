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
    createMany: jest.fn(),
    updateMany: jest.fn(),
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
  participant: {
    count: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn()
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
  const testParticipantId = '507f1f77bcf86cd799439011';
  const testParticipantId2 = '507f1f77bcf86cd799439015';
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

    // Safe defaults for the per-message freeze path (freezeMessageStatus).
    // Individual tests override these to exercise the freeze behavior.
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);
    mockPrisma.messageStatusEntry.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.messageStatusEntry.updateMany.mockResolvedValue({ count: 0 });
    // Default: no per-participant media consumption rows (getMessageReadStatus).
    // Individual tests override this to exercise the attachmentConsumption path.
    mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([]);

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
    // The unread count MUST be computed fresh on every read — the cursor's
    // `unreadCount` field is a stale cache that is only updated on
    // markAsRead/markAsReceived. Trusting it returned wildly inflated
    // counts (e.g. 75 for users who had read all messages) because new
    // messages never auto-increment the cursor between reads. The new
    // contract: always count messages where `createdAt > floor` and
    // `senderId != self`, with floor = lastReadAt ?? participant.joinedAt.

    it('should count messages after cursor.lastReadAt, not return stale cursor.unreadCount', async () => {
      const lastReadAt = new Date('2026-05-21T10:00:00Z');
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
        id: 'cursor-1',
        participantId: testParticipantId,
        conversationId: testConversationId,
        // Stale cached value — must be IGNORED in favour of a fresh count
        unreadCount: 75,
        lastReadAt,
      });
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: testParticipantId,
        joinedAt: new Date('2026-04-01T00:00:00Z'),
      });
      mockPrisma.message.count.mockResolvedValue(3);

      const count = await service.getUnreadCount(testParticipantId, testConversationId);

      expect(count).toBe(3);
      expect(mockPrisma.message.count).toHaveBeenCalledWith({
        where: {
          conversationId: testConversationId,
          deletedAt: null,
          senderId: { not: testParticipantId },
          createdAt: { gt: lastReadAt },
        },
      });
    });

    it('should fall back to participant.joinedAt when cursor has no lastReadAt', async () => {
      const joinedAt = new Date('2026-04-01T00:00:00Z');
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
        id: 'cursor-2',
        participantId: testParticipantId,
        conversationId: testConversationId,
        unreadCount: 0,
        lastReadAt: null,
      });
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: testParticipantId,
        joinedAt,
      });
      mockPrisma.message.count.mockResolvedValue(5);

      const count = await service.getUnreadCount(testParticipantId, testConversationId);

      expect(count).toBe(5);
      expect(mockPrisma.message.count).toHaveBeenCalledWith({
        where: {
          conversationId: testConversationId,
          deletedAt: null,
          senderId: { not: testParticipantId },
          createdAt: { gt: joinedAt },
        },
      });
    });

    it('should fall back to participant.joinedAt when no cursor exists (new participant)', async () => {
      const joinedAt = new Date('2026-05-20T08:00:00Z');
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: testParticipantId,
        joinedAt,
      });
      mockPrisma.message.count.mockResolvedValue(2);

      const count = await service.getUnreadCount(testParticipantId, testConversationId);

      expect(count).toBe(2);
      // CRITICAL: new participant must NOT see the historical conversation
      // as 75 unread — the floor at participant.joinedAt ensures only
      // messages received after they joined are counted.
      expect(mockPrisma.message.count).toHaveBeenCalledWith({
        where: {
          conversationId: testConversationId,
          deletedAt: null,
          senderId: { not: testParticipantId },
          createdAt: { gt: joinedAt },
        },
      });
    });

    it('should resolve a userId to the matching Participant.id and count via that participant', async () => {
      // Regression test for the call-site bug where `_updateUnreadCounts`
      // passed `participant.userId` instead of `participant.id` and the
      // cursor lookup silently missed, falling through to a "count all
      // historical messages" path that returned 75 instead of 0.
      const userId = '6900000000000000000000aa';
      const realParticipantId = testParticipantId;
      const lastReadAt = new Date('2026-05-21T10:00:00Z');

      // 1. The first cursor lookup (by userId) returns null...
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValueOnce(null);
      // 2. ...so the service falls back to resolving the participant by userId
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: realParticipantId,
        userId,
        joinedAt: new Date('2026-04-01T00:00:00Z'),
      });
      // 3. ...then re-queries the cursor with the real Participant.id
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValueOnce({
        id: 'cursor-3',
        participantId: realParticipantId,
        conversationId: testConversationId,
        unreadCount: 0,
        lastReadAt,
      });
      mockPrisma.message.count.mockResolvedValue(1);

      const count = await service.getUnreadCount(userId, testConversationId);

      expect(count).toBe(1);
      // The count MUST exclude the participant's own messages — we use
      // the resolved Participant.id, not the userId, for senderId equality.
      expect(mockPrisma.message.count).toHaveBeenCalledWith({
        where: {
          conversationId: testConversationId,
          deletedAt: null,
          senderId: { not: realParticipantId },
          createdAt: { gt: lastReadAt },
        },
      });
    });

    it('should return 0 on database error', async () => {
      mockPrisma.conversationReadCursor.findUnique.mockRejectedValue(new Error('Database error'));

      const count = await service.getUnreadCount(testParticipantId, testConversationId);

      expect(count).toBe(0);
    });

    it('should return 0 when the participant cannot be resolved and no cursor exists', async () => {
      // Defensive default — calling getUnreadCount with an unknown id
      // must not fall back to counting "all messages from others", which
      // is exactly the legacy bug.
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      const count = await service.getUnreadCount('unknown-id', testConversationId);

      expect(count).toBe(0);
      expect(mockPrisma.message.count).not.toHaveBeenCalled();
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
      const result = await service.getUnreadCountsForConversations([testParticipantId],[]);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('should compute fresh counts per conversation using batch queries (iter-4)', async () => {
      const lastReadAt = new Date('2026-05-21T10:00:00Z');
      const joinedAt = new Date('2026-04-01');
      // iter-4 batch path: participant.findMany (1 query) + cursor.findMany (1 query) + message.count × N
      mockPrisma.participant.findMany.mockResolvedValueOnce([
        { id: testParticipantId, conversationId: conversationIds[0], joinedAt },
        { id: testParticipantId, conversationId: conversationIds[1], joinedAt },
        // conversationIds[2] has no participant → defaults to 0
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValueOnce([
        { participantId: testParticipantId, lastReadAt },
      ]);
      mockPrisma.message.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(3);

      const result = await service.getUnreadCountsForConversations([testParticipantId], conversationIds);

      expect(result.get(conversationIds[0])).toBe(5);
      expect(result.get(conversationIds[1])).toBe(3);
      expect(result.get(conversationIds[2])).toBe(0);
    });

    it('should return map of zeros on database error', async () => {
      // iter-4 batch path: participant.findMany throws → catch returns zeros
      mockPrisma.participant.findMany.mockRejectedValue(new Error('Database error'));

      const result = await service.getUnreadCountsForConversations([testParticipantId], conversationIds);

      expect(result).toBeInstanceOf(Map);
      // Outer catch returns empty Map (size 0) when participant batch fails
      expect(result.size).toBe(0);
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

      await service.markMessagesAsReceived(testParticipantId, testConversationId, testMessageId);

      expect(mockPrisma.conversationReadCursor.upsert).toHaveBeenCalledWith({
        where: {
          conversation_participant_cursor: { participantId: testParticipantId, conversationId: testConversationId }
        },
        create: expect.objectContaining({
          participantId: testParticipantId,
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

      // No messages in the newly-crossed window (default mock) → freeze no-ops.
      expect(mockPrisma.messageStatusEntry.createMany).not.toHaveBeenCalled();
    });

    it('should fetch latest message when messageId not provided', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId });
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      // Mock for updateUnreadCount
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.count.mockResolvedValue(0);

      await service.markMessagesAsReceived(testParticipantId, testConversationId);

      expect(mockPrisma.message.findFirst).toHaveBeenCalledWith({
        where: { conversationId: testConversationId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true }
      });
    });

    it('should return early when no messages in conversation', async () => {
      mockPrisma.message.findFirst.mockResolvedValue(null);

      await service.markMessagesAsReceived(testParticipantId, testConversationId);

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

      await service.markMessagesAsReceived(testParticipantId, testConversationId, 'provided-message-id');

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

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      expect(mockPrisma.conversationReadCursor.upsert).toHaveBeenCalledWith({
        where: {
          conversation_participant_cursor: { participantId: testParticipantId, conversationId: testConversationId }
        },
        create: expect.objectContaining({
          lastReadMessageId: testMessageId,
          lastReadAt: expect.any(Date),
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

      // No messages in the newly-crossed window (default mock) → freeze no-ops.
      expect(mockPrisma.messageStatusEntry.createMany).not.toHaveBeenCalled();
      expect(mockPrisma.message.update).not.toHaveBeenCalled();
    });

    it('should freeze a write-once readAt per message newly crossed', async () => {
      const messageDate = new Date('2025-01-01T00:00:00Z');
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId, createdAt: messageDate });
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      // Previous read cursor is older → window has newly-read messages.
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: new Date('2024-12-01T00:00:00Z') });
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }, { id: testMessageId2 }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]); // none frozen yet

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      // Window query excludes the participant's own messages and is time-bounded.
      expect(mockPrisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            conversationId: testConversationId,
            deletedAt: null,
            senderId: { not: testParticipantId },
            createdAt: expect.objectContaining({ gt: new Date('2024-12-01T00:00:00Z') })
          })
        })
      );
      // Both messages get a frozen readAt (write-once create).
      expect(mockPrisma.messageStatusEntry.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ messageId: testMessageId, participantId: testParticipantId, readAt: expect.any(Date) }),
          expect.objectContaining({ messageId: testMessageId2, participantId: testParticipantId, readAt: expect.any(Date) })
        ]
      });
    });

    it('should set readAt on a delivery-created entry without overwriting deliveredAt (write-once)', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId, createdAt: new Date('2025-01-01T00:00:00Z') });
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
      // Entry already exists from delivery: deliveredAt set, readAt still null.
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        { messageId: testMessageId, deliveredAt: new Date('2025-01-01T00:00:01Z'), readAt: null }
      ]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      // No create (entry exists); update only the null readAt field.
      expect(mockPrisma.messageStatusEntry.createMany).not.toHaveBeenCalled();
      expect(mockPrisma.messageStatusEntry.updateMany).toHaveBeenCalledWith({
        where: { messageId: { in: [testMessageId] }, participantId: testParticipantId, readAt: null },
        data: { readAt: expect.any(Date) }
      });
    });

    it('should not re-freeze a message whose readAt is already set (write-once)', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId, createdAt: new Date('2025-01-01T00:00:00Z') });
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        { messageId: testMessageId, deliveredAt: new Date('2025-01-01T00:00:01Z'), readAt: new Date('2025-01-02T00:00:00Z') }
      ]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      expect(mockPrisma.messageStatusEntry.createMany).not.toHaveBeenCalled();
      expect(mockPrisma.messageStatusEntry.updateMany).not.toHaveBeenCalled();
    });

    it('should sync notifications when marking as read', async () => {
      const mockMessage = { id: testMessageId, createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      // Notification sync happens after main operation (logged via enhancedLogger)
      expect(mockPrisma.conversationReadCursor.upsert).toHaveBeenCalled();
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
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId
      };

      const mockMembers = [
        { id: testParticipantId, displayName: 'User1' },
        { id: testParticipantId2, displayName: 'User2' }
      ];

      // Cursors with lastDeliveredAt and lastReadAt >= message.createdAt
      const mockCursors = [
        {
          participantId: testParticipantId2,
          lastDeliveredAt: new Date('2025-01-01T10:05:00Z'),
          lastReadAt: new Date('2025-01-01T10:10:00Z'),
          participant: { id: testParticipantId2, displayName: 'User2' }
        }
      ];

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.participant.findMany.mockResolvedValue(mockMembers);
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
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId
      };

      const mockMembers = [
        { id: testParticipantId, displayName: 'User1' },
        { id: testParticipantId2, displayName: 'User2' }
      ];

      // Cursor for non-sender user with timestamps >= message.createdAt
      const mockCursors = [
        {
          participantId: testParticipantId2,
          lastDeliveredAt: new Date('2025-01-01T10:05:00Z'),
          lastReadAt: new Date('2025-01-01T10:10:00Z'),
          participant: { id: testParticipantId2, displayName: 'User2' }
        }
      ];

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.participant.findMany.mockResolvedValue(mockMembers);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue(mockCursors);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      // Should only count non-sender users
      expect(result.receivedCount).toBe(1);
      expect(result.readCount).toBe(1);
      expect(result.receivedBy[0].participantId).toBe(testParticipantId2);
    });

    // Regression: a cursor whose participant has been deleted/banned/marked
    // inactive must be silently skipped instead of crashing the endpoint.
    // Production was returning HTTP 500 with
    //   PrismaClientUnknownRequestError: Inconsistent query result: Field
    //   participant is required to return data, got `null` instead
    // before we stopped relying on a strict `include` and started joining
    // participants in JS.
    it('should skip cursors whose participant no longer exists or is inactive', async () => {
      const messageCreatedAt = new Date('2025-01-01T10:00:00Z');
      const mockMessage = {
        id: testMessageId,
        createdAt: messageCreatedAt,
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId
      };

      // Only User2 is active; orphan-cursor participant ID has no matching row.
      const mockMembers = [
        { id: testParticipantId, displayName: 'User1', avatar: null, user: null },
        { id: testParticipantId2, displayName: 'User2', avatar: 'av2.jpg', user: null }
      ];

      const mockCursors = [
        // Valid cursor — User2
        {
          participantId: testParticipantId2,
          lastDeliveredAt: new Date('2025-01-01T10:05:00Z'),
          lastReadAt: new Date('2025-01-01T10:10:00Z'),
        },
        // Orphan cursor — points at a participant that no longer exists
        {
          participantId: 'orphan-participant-id',
          lastDeliveredAt: new Date('2025-01-01T10:05:00Z'),
          lastReadAt: new Date('2025-01-01T10:10:00Z'),
        }
      ];

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.participant.findMany.mockResolvedValue(mockMembers);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue(mockCursors);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      // Orphan cursor must be skipped, not throw
      expect(result.receivedCount).toBe(1);
      expect(result.readCount).toBe(1);
      expect(result.receivedBy).toHaveLength(1);
      expect(result.readBy).toHaveLength(1);
      expect(result.receivedBy[0].participantId).toBe(testParticipantId2);
      expect(result.receivedBy[0].avatarURL).toBe('av2.jpg');
    });

    // Regression — "status-management-inconsistency" (2026-06).
    // The cursor `lastReadAt`/`lastDeliveredAt` re-advances to "now" every time
    // a participant re-opens the conversation, so deriving per-message receipt
    // times from it shows the participant's LAST VISIT, not when they actually
    // read THIS message. The frozen write-once `MessageStatusEntry` is the
    // precise per-message time and MUST win — matching getMessageStatusDetails.
    it('should prefer frozen per-message status times over the drifted cursor', async () => {
      const messageCreatedAt = new Date('2025-01-01T10:00:00Z');
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: messageCreatedAt,
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId,
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId, displayName: 'User1', avatar: null, user: null },
        { id: testParticipantId2, displayName: 'User2', avatar: 'av2.jpg', user: null },
      ]);
      // Cursor has drifted forward to a later re-open of the conversation.
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        {
          participantId: testParticipantId2,
          lastDeliveredAt: new Date('2025-01-01T15:00:00Z'),
          lastReadAt: new Date('2025-01-01T15:30:00Z'),
        },
      ]);
      // But User2 actually received/read THIS message much earlier — frozen.
      const frozenDelivered = new Date('2025-01-01T10:05:00Z');
      const frozenRead = new Date('2025-01-01T10:10:00Z');
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        {
          participantId: testParticipantId2,
          deliveredAt: frozenDelivered,
          receivedAt: frozenDelivered,
          readAt: frozenRead,
        },
      ]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.receivedBy[0].receivedAt).toEqual(frozenDelivered);
      expect(result.readBy[0].readAt).toEqual(frozenRead);
    });

    // Edge case: `cleanupObsoleteCursors` deletes a participant's cursor when its
    // `lastReadMessageId` points at a now-deleted message. The write-once frozen
    // `MessageStatusEntry` for OTHER (still-live) messages survives that cleanup.
    // The receipt must still surface from the frozen entry — enumerating only via
    // cursors would silently drop it.
    it('should still surface a frozen receipt when the participant cursor was deleted by cleanup', async () => {
      const messageCreatedAt = new Date('2025-01-01T10:00:00Z');
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: messageCreatedAt,
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId,
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId, displayName: 'User1', avatar: null, user: null },
        { id: testParticipantId2, displayName: 'User2', avatar: 'av2.jpg', user: null },
      ]);
      // Cursor removed by cleanupObsoleteCursors — none remain.
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      // But the frozen write-once receipt for THIS message survived.
      const frozenDelivered = new Date('2025-01-01T10:05:00Z');
      const frozenRead = new Date('2025-01-01T10:10:00Z');
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        {
          participantId: testParticipantId2,
          deliveredAt: frozenDelivered,
          receivedAt: frozenDelivered,
          readAt: frozenRead,
        },
      ]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.receivedBy).toHaveLength(1);
      expect(result.receivedBy[0].participantId).toBe(testParticipantId2);
      expect(result.receivedBy[0].receivedAt).toEqual(frozenDelivered);
      expect(result.readBy).toHaveLength(1);
      expect(result.readBy[0].readAt).toEqual(frozenRead);
      // The participant is accounted as seen, not "not seen".
      expect(result.notSeenCount).toBe(0);
    });

    // Regression: the `notSeenBy` list must resolve avatars with the SAME rule as
    // `receivedBy`/`readBy` — participant-local avatar first, then the linked user
    // avatar. A participant with only a local avatar (no `user.avatar`) was showing
    // `null` in `notSeenBy` while showing its photo in the other lists for the SAME
    // message. Source of truth: resolveParticipantAvatar (@meeshy/shared).
    it('should resolve the participant-local avatar in notSeenBy, consistent with the other lists', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: new Date('2025-01-01T10:00:00Z'),
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId,
      });
      // User2 has a local participant avatar but no linked user avatar, and has not
      // seen the message (no cursor, not the sender) → lands in notSeenBy.
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId, displayName: 'User1', avatar: null, user: null },
        { id: testParticipantId2, displayName: 'User2', avatar: 'local.jpg', user: null },
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.notSeenBy).toHaveLength(1);
      expect(result.notSeenBy[0].participantId).toBe(testParticipantId2);
      expect(result.notSeenBy[0].avatarURL).toBe('local.jpg');
    });

    it('should expose per-participant media consumption positions for the message attachments', async () => {
      const messageCreatedAt = new Date('2025-01-01T10:00:00Z');
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: messageCreatedAt,
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId,
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId, displayName: 'User1', avatar: null, user: null },
        { id: testParticipantId2, displayName: 'User2', avatar: 'av2.jpg', user: null },
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      // User2 listened to ~45s of the audio attachment, not yet complete.
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([
        {
          attachmentId: testAttachmentId,
          participantId: testParticipantId2,
          lastPlayPositionMs: 45000,
          listenedComplete: false,
          lastWatchPositionMs: null,
          watchedComplete: false,
        },
      ]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      // Query is scoped to this message and excludes the sender.
      expect(mockPrisma.attachmentStatusEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { messageId: testMessageId, participantId: { not: testParticipantId } },
        })
      );
      expect(result.attachmentConsumption).toHaveLength(1);
      expect(result.attachmentConsumption[0]).toEqual({
        attachmentId: testAttachmentId,
        participants: [
          {
            participantId: testParticipantId2,
            displayName: 'User2',
            avatarURL: 'av2.jpg',
            lastPlayPositionMs: 45000,
            listenedComplete: false,
            lastWatchPositionMs: null,
            watchedComplete: false,
          },
        ],
      });
    });

    it('should group multiple participants under the same attachment', async () => {
      const thirdParticipantId = '507f1f77bcf86cd799439099';
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: new Date('2025-01-01T10:00:00Z'),
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId,
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId, displayName: 'Sender', avatar: null, user: null },
        { id: testParticipantId2, displayName: 'Bob', avatar: null, user: null },
        { id: thirdParticipantId, displayName: 'Carol', avatar: null, user: null },
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([
        {
          attachmentId: testAttachmentId,
          participantId: testParticipantId2,
          lastPlayPositionMs: null,
          listenedComplete: true,
          lastWatchPositionMs: null,
          watchedComplete: false,
        },
        {
          attachmentId: testAttachmentId,
          participantId: thirdParticipantId,
          lastPlayPositionMs: 12000,
          listenedComplete: false,
          lastWatchPositionMs: null,
          watchedComplete: false,
        },
      ]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.attachmentConsumption).toHaveLength(1);
      expect(result.attachmentConsumption[0].participants).toHaveLength(2);
      const byId = Object.fromEntries(
        result.attachmentConsumption[0].participants.map(p => [p.participantId, p])
      );
      expect(byId[testParticipantId2].listenedComplete).toBe(true);
      expect(byId[thirdParticipantId].lastPlayPositionMs).toBe(12000);
    });

    it('should skip consumption rows with no audio/video signal (download/image-only)', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: new Date('2025-01-01T10:00:00Z'),
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId,
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId, displayName: 'Sender', avatar: null, user: null },
        { id: testParticipantId2, displayName: 'Bob', avatar: null, user: null },
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      // Bob downloaded but never played → no playback signal to surface.
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([
        {
          attachmentId: testAttachmentId,
          participantId: testParticipantId2,
          lastPlayPositionMs: null,
          listenedComplete: false,
          lastWatchPositionMs: null,
          watchedComplete: false,
        },
      ]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.attachmentConsumption).toHaveLength(0);
    });

    it('should skip consumption rows whose participant no longer exists', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: new Date('2025-01-01T10:00:00Z'),
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId,
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId, displayName: 'Sender', avatar: null, user: null },
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([
        {
          attachmentId: testAttachmentId,
          participantId: 'orphan-participant-id',
          lastPlayPositionMs: 5000,
          listenedComplete: false,
          lastWatchPositionMs: null,
          watchedComplete: false,
        },
      ]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.attachmentConsumption).toHaveLength(0);
    });

    it('should return an empty consumption list when there are no attachment status rows', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: new Date('2025-01-01T10:00:00Z'),
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId,
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId, displayName: 'Sender', avatar: null, user: null },
        { id: testParticipantId2, displayName: 'Bob', avatar: null, user: null },
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.attachmentConsumption).toEqual([]);
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
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      // Mock for updateAttachmentComputedStatus
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ listenedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAudioAsListened(testParticipantId, testAttachmentId, {
        playPositionMs: 5000,
        listenDurationMs: 10000,
        complete: false
      });

      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith({
        where: {
          attachment_participant_status: { attachmentId: testAttachmentId, participantId: testParticipantId }
        },
        create: expect.objectContaining({
          attachmentId: testAttachmentId,
          messageId: testMessageId,
          participantId: testParticipantId,
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
        service.markAudioAsListened(testParticipantId, 'nonexistent')
      ).rejects.toThrow('Attachment nonexistent not found');
    });

    it('should track listen completion', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'audio/mp3',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ listenedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAudioAsListened(testParticipantId, testAttachmentId, { complete: true });

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
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ watchedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markVideoAsWatched(testParticipantId, testAttachmentId, {
        watchPositionMs: 30000,
        watchDurationMs: 60000,
        complete: true
      });

      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith({
        where: {
          attachment_participant_status: { attachmentId: testAttachmentId, participantId: testParticipantId }
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
        service.markVideoAsWatched(testParticipantId, 'nonexistent')
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
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ viewedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markImageAsViewed(testParticipantId, testAttachmentId, {
        viewDurationMs: 5000,
        wasZoomed: true
      });

      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith({
        where: {
          attachment_participant_status: { attachmentId: testAttachmentId, participantId: testParticipantId }
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
        service.markImageAsViewed(testParticipantId, 'nonexistent')
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
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ downloadedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAttachmentAsDownloaded(testParticipantId, testAttachmentId);

      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith({
        where: {
          attachment_participant_status: { attachmentId: testAttachmentId, participantId: testParticipantId }
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
        service.markAttachmentAsDownloaded(testParticipantId, 'nonexistent')
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

      const result = await service.getAttachmentStatus(testAttachmentId, testParticipantId);

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

      const result = await service.getAttachmentStatus(testAttachmentId, testParticipantId);

      expect(result).toBeNull();
    });

    it('should return null on database error', async () => {
      mockPrisma.attachmentStatusEntry.findUnique.mockRejectedValue(new Error('DB error'));

      const result = await service.getAttachmentStatus(testAttachmentId, testParticipantId);

      expect(result).toBeNull();
      // Le service utilise maintenant enhancedLogger au lieu de console.error
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
          participantId: testParticipantId,
          lastDeliveredAt: new Date('2025-01-01T12:00:00Z'), // After both messages
          lastReadAt: new Date('2025-01-01T12:00:00Z') // After both messages
        },
        {
          participantId: testParticipantId2,
          lastDeliveredAt: new Date('2025-01-01T10:30:00Z'), // After message1, before message2
          lastReadAt: null // Never read
        }
      ]);

      const result = await service.getConversationReadStatuses(testConversationId, messageIds);

      expect(result).toBeInstanceOf(Map);
      // message1: user1 delivered+read, user2 delivered only (but user2 is sender so excluded)
      // Actually sender is 'sender-1', so both testParticipantId and testParticipantId2 are counted
      // testParticipantId: delivered+read, testParticipantId2: delivered only
      expect(result.get(testMessageId)).toEqual(expect.objectContaining({ receivedCount: 2, readCount: 1 }));
      // message2: only testParticipantId delivered+read (testParticipantId2's delivered is before message2)
      expect(result.get(testMessageId2)).toEqual(expect.objectContaining({ receivedCount: 1, readCount: 1 }));
    });

    it('should return empty counts for messages without cursors', async () => {
      mockPrisma.message.findMany.mockResolvedValue([
        { id: testMessageId, createdAt: new Date(), senderId: 'sender-1' }
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);

      const result = await service.getConversationReadStatuses(testConversationId, [testMessageId]);

      expect(result.get(testMessageId)).toEqual(expect.objectContaining({ receivedCount: 0, readCount: 0 }));
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

        await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

        // message.update should NOT be called for computed status fields
        expect(mockPrisma.message.update).not.toHaveBeenCalled();
      });

      it('should NOT create messageStatusEntry records (cursor-based approach)', async () => {
        const mockMessage = { id: testMessageId, createdAt: new Date() };

        mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
        mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});

        await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

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
            senderId: testParticipantId2,
            anonymousSenderId: null
          }
        });
        mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});

        mockPrisma.participant.count.mockResolvedValue(2);

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

        await service.markAudioAsListened(testParticipantId, testAttachmentId, { complete: true });

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
    it('should handle empty participantId gracefully', async () => {
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.count.mockResolvedValue(0);

      const count = await service.getUnreadCount('', testConversationId);

      expect(count).toBe(0);
    });

    it('should handle concurrent operations', async () => {
      const lastReadAt = new Date('2026-05-21T10:00:00Z');
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
        id: 'c', participantId: testParticipantId, conversationId: testConversationId,
        unreadCount: 99, lastReadAt,
      });
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: testParticipantId, joinedAt: new Date('2026-04-01'),
      });
      mockPrisma.message.count.mockResolvedValue(5);

      const promises = [
        service.getUnreadCount(testParticipantId, testConversationId),
        service.getUnreadCount(testParticipantId, testConversationId),
        service.getUnreadCount(testParticipantId, testConversationId)
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
      const joinedAt = new Date('2026-04-01');
      const participant = { id: testParticipantId, joinedAt };
      // 1. Initial: No cursor, but participant exists — count from joinedAt
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.participant.findFirst.mockResolvedValue(participant);
      mockPrisma.message.count.mockResolvedValue(5);

      let unreadCount = await service.getUnreadCount(testParticipantId, testConversationId);
      expect(unreadCount).toBe(5);

      // 2. Mark as received: cursor created (cursor-only approach)
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId });
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.count.mockResolvedValue(4);

      await service.markMessagesAsReceived(testParticipantId, testConversationId, testMessageId);

      // Verify cursor-only approach: no messageStatusEntry or message.update
      expect(mockPrisma.messageStatusEntry.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.message.update).not.toHaveBeenCalled();

      // 3. After received, cursor exists with lastReadAt → count returns 4
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
        id: 'c', participantId: testParticipantId, conversationId: testConversationId,
        unreadCount: 99, lastReadAt: new Date('2026-05-21T10:00:00Z'),
      });
      mockPrisma.participant.findFirst.mockResolvedValue(participant);
      mockPrisma.message.count.mockResolvedValue(4);

      unreadCount = await service.getUnreadCount(testParticipantId, testConversationId);
      expect(unreadCount).toBe(4);
    });

    it('should correctly track attachment status progression', async () => {
      const attachmentSetup = {
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'audio/mp3',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      };

      mockPrisma.messageAttachment.findUnique.mockResolvedValue(attachmentSetup);
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ listenedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      // 1. First listen (partial)
      await service.markAudioAsListened(testParticipantId, testAttachmentId, {
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
      await service.markAudioAsListened(testParticipantId, testAttachmentId, {
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
      // Setup: User has 5 unread messages (cursor with stale unreadCount but
      // lastReadAt is honoured + message.count returns 5)
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
        id: 'c', participantId: testParticipantId, conversationId: testConversationId,
        unreadCount: 99, lastReadAt: new Date('2026-05-21T10:00:00Z'),
      });
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: testParticipantId, joinedAt: new Date('2026-04-01'),
      });
      mockPrisma.message.count.mockResolvedValue(5);

      let unreadCount = await service.getUnreadCount(testParticipantId, testConversationId);
      expect(unreadCount).toBe(5);

      // Mark all as read
      const mockMessage = { id: testMessageId, createdAt: new Date() };
      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

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

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      // message.update should NOT be called in cursor-based approach
      expect(mockPrisma.message.update).not.toHaveBeenCalled();
    });

    it('should NOT set readByAllAt (cursor-based approach)', async () => {
      // In the new cursor-based architecture, readByAllAt is no longer computed
      const mockMessage = { id: testMessageId, createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

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
      mockPrisma.participant.count.mockResolvedValue(4);
      mockPrisma.attachmentStatusEntry.count
        .mockResolvedValueOnce(3) // viewedCount
        .mockResolvedValueOnce(2) // downloadedCount
        .mockResolvedValueOnce(3) // listenedCount
        .mockResolvedValueOnce(0); // watchedCount

      mockPrisma.attachmentStatusEntry.findFirst
        .mockResolvedValueOnce({ viewedAt: new Date() })
        .mockResolvedValueOnce({ downloadedAt: new Date() });

      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAudioAsListened(testParticipantId, testAttachmentId);

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
      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      // Clear the dedup cache to allow second call
      (MessageReadStatusService as any).recentActionCache.clear();

      // Second read - should use cursor upsert.update path
      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

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
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ listenedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAudioAsListened(testParticipantId, testAttachmentId);

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
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ downloadedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      // Download twice
      await service.markAttachmentAsDownloaded(testParticipantId, testAttachmentId);
      await service.markAttachmentAsDownloaded(testParticipantId, testAttachmentId);

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
      mockPrisma.participant.count.mockResolvedValue(5);
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
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
        id: 'c', participantId: testParticipantId, conversationId: testConversationId,
        unreadCount: 999, lastReadAt: new Date('2026-05-21T10:00:00Z'),
      });
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: testParticipantId, joinedAt: new Date('2026-04-01'),
      });
      mockPrisma.message.count.mockResolvedValue(10);

      // Rapid successive reads
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(service.getUnreadCount(testParticipantId, testConversationId));
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
      const anonymousParticipantId = 'anon-sender-123';
      const messageCreatedAt = new Date('2025-01-01T10:00:00Z');
      const mockMessage = {
        id: testMessageId,
        createdAt: messageCreatedAt,
        senderId: anonymousParticipantId,
        conversationId: testConversationId
      };

      const mockMembers = [
        { id: anonymousParticipantId, displayName: 'AnonSender' },
        { id: testParticipantId, displayName: 'User1' },
        { id: testParticipantId2, displayName: 'User2' }
      ];

      // Cursor with timestamps >= message.createdAt
      const mockCursors = [
        {
          participantId: testParticipantId,
          lastDeliveredAt: new Date('2025-01-01T10:05:00Z'),
          lastReadAt: new Date('2025-01-01T10:10:00Z'),
          participant: { id: testParticipantId, displayName: 'User1' }
        }
      ];

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.participant.findMany.mockResolvedValue(mockMembers);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue(mockCursors);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.totalMembers).toBe(2); // 3 participants minus 1 sender
      expect(result.receivedBy).toHaveLength(1);
    });

    it('should correctly handle anonymous sender in markMessagesAsRead', async () => {
      // The service now uses a simplified cursor-based approach
      // It updates conversationReadCursor instead of messageStatusEntry and message.update
      const mockMessage = { id: testMessageId, createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      // Should update the read cursor
      expect(mockPrisma.conversationReadCursor.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            conversation_participant_cursor: { participantId: testParticipantId, conversationId: testConversationId }
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

      await service.markMessagesAsRead(testParticipantId, testConversationId, 'msg-49');

      // Should update cursor once regardless of message count
      expect(mockPrisma.conversationReadCursor.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrisma.conversationReadCursor.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            conversation_participant_cursor: { participantId: testParticipantId, conversationId: testConversationId }
          },
          update: expect.objectContaining({
            lastReadMessageId: 'msg-49',
            unreadCount: 0
          })
        })
      );
    });

    it('should get unread counts for many conversations efficiently (iter-4 batch)', async () => {
      const conversationCount = 20;
      const conversationIds = Array.from({ length: conversationCount }, (_, i) => `conv-${i}`);
      const joinedAt = new Date('2026-04-01');
      const lastReadAt = new Date('2026-05-21T10:00:00Z');

      // iter-4: participant.findMany returns all 20 participants, cursor.findMany returns first 10
      const expected: Record<string, number> = {};
      const participantRows = conversationIds.map((id, i) => {
        const count = i < 10 ? (i + 1) : 0;
        expected[id] = count;
        return { id: testParticipantId, conversationId: id, joinedAt };
      });
      mockPrisma.participant.findMany.mockResolvedValueOnce(participantRows);
      const cursorRows = conversationIds.slice(0, 10).map(id => ({
        participantId: testParticipantId, lastReadAt
      }));
      mockPrisma.conversationReadCursor.findMany.mockResolvedValueOnce(cursorRows);
      // message.count called once per participant (20 parallel calls)
      conversationIds.forEach((_, i) => {
        mockPrisma.message.count.mockResolvedValueOnce(i < 10 ? (i + 1) : 0);
      });

      const result = await service.getUnreadCountsForConversations([testParticipantId], conversationIds);

      expect(result.size).toBe(conversationCount);
      for (const id of conversationIds) {
        expect(result.get(id)).toBe(expected[id]);
      }
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
        service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId)
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

      const count = await service.getUnreadCount(testParticipantId, testConversationId);

      expect(count).toBe(0);
      // Le service utilise maintenant enhancedLogger au lieu de console.error
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
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(5);

      // 3 viewed, 2 downloaded, 4 listened, 0 watched
      mockPrisma.attachmentStatusEntry.count
        .mockResolvedValueOnce(3) // viewedCount
        .mockResolvedValueOnce(2) // downloadedCount
        .mockResolvedValueOnce(4) // listenedCount - this should be consumedCount for audio
        .mockResolvedValueOnce(0); // watchedCount

      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue(null);
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAudioAsListened(testParticipantId, testAttachmentId);

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
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(5);

      // 4 viewed, 3 downloaded, 0 listened, 2 watched
      mockPrisma.attachmentStatusEntry.count
        .mockResolvedValueOnce(4) // viewedCount
        .mockResolvedValueOnce(3) // downloadedCount
        .mockResolvedValueOnce(0) // listenedCount
        .mockResolvedValueOnce(2); // watchedCount - this should be consumedCount for video

      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue(null);
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markVideoAsWatched(testParticipantId, testAttachmentId);

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
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(5);

      // 3 viewed, 2 downloaded, 0 listened, 0 watched
      mockPrisma.attachmentStatusEntry.count
        .mockResolvedValueOnce(3) // viewedCount - this should be consumedCount for image
        .mockResolvedValueOnce(2) // downloadedCount
        .mockResolvedValueOnce(0) // listenedCount
        .mockResolvedValueOnce(0); // watchedCount

      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue(null);
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markImageAsViewed(testParticipantId, testAttachmentId);

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
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(5);

      // 5 viewed, 4 downloaded, 0 listened, 0 watched
      mockPrisma.attachmentStatusEntry.count
        .mockResolvedValueOnce(5) // viewedCount
        .mockResolvedValueOnce(4) // downloadedCount
        .mockResolvedValueOnce(0) // listenedCount
        .mockResolvedValueOnce(0); // watchedCount

      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue(null);
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAttachmentAsDownloaded(testParticipantId, testAttachmentId);

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
          message: { conversationId: testConversationId, senderId: testParticipantId2 }
        });
        mockPrisma.participant.count.mockResolvedValue(2);
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

        await service.markAudioAsListened(testParticipantId, testAttachmentId);

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

        await service.markAudioAsListened(testParticipantId, testAttachmentId);

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
          service.markAudioAsListened(testParticipantId, testAttachmentId)
        ).rejects.toMatchObject({ code: 'P2034' });

        // $transaction should have been called 3 times (all failures)
        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
      });

      it('should throw non-P2034 error immediately without retry', async () => {
        // First call fails with non-P2034 error
        mockPrisma.$transaction.mockRejectedValueOnce(createNonDeadlockError('P2025'));

        await expect(
          service.markAudioAsListened(testParticipantId, testAttachmentId)
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
          message: { conversationId: testConversationId, senderId: testParticipantId2 }
        });
        mockPrisma.participant.count.mockResolvedValue(2);
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

        await service.markVideoAsWatched(testParticipantId, testAttachmentId);

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      });

      it('should throw P2034 error after exhausting retries', async () => {
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError());

        await expect(
          service.markVideoAsWatched(testParticipantId, testAttachmentId)
        ).rejects.toMatchObject({ code: 'P2034' });

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
      });

      it('should throw non-P2034 error immediately', async () => {
        mockPrisma.$transaction.mockRejectedValueOnce(createNonDeadlockError('P2002'));

        await expect(
          service.markVideoAsWatched(testParticipantId, testAttachmentId)
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
          message: { conversationId: testConversationId, senderId: testParticipantId2 }
        });
        mockPrisma.participant.count.mockResolvedValue(2);
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

        await service.markImageAsViewed(testParticipantId, testAttachmentId);

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      });

      it('should throw P2034 error after exhausting retries', async () => {
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError());

        await expect(
          service.markImageAsViewed(testParticipantId, testAttachmentId)
        ).rejects.toMatchObject({ code: 'P2034' });

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
      });

      it('should throw non-P2034 error immediately', async () => {
        mockPrisma.$transaction.mockRejectedValueOnce(createNonDeadlockError('P2003'));

        await expect(
          service.markImageAsViewed(testParticipantId, testAttachmentId)
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
          message: { conversationId: testConversationId, senderId: testParticipantId2 }
        });
        mockPrisma.participant.count.mockResolvedValue(2);
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

        await service.markAttachmentAsDownloaded(testParticipantId, testAttachmentId);

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      });

      it('should succeed after 2 P2034 failures on 3rd attempt', async () => {
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError())
          .mockImplementationOnce(async (callback: (tx: any) => Promise<any>) => {
            return callback(mockPrisma);
          });

        await service.markAttachmentAsDownloaded(testParticipantId, testAttachmentId);

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
      });

      it('should throw P2034 error after exhausting retries', async () => {
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError());

        await expect(
          service.markAttachmentAsDownloaded(testParticipantId, testAttachmentId)
        ).rejects.toMatchObject({ code: 'P2034' });

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
      });

      it('should throw non-P2034 error immediately without retry', async () => {
        const uniqueConstraintError = createNonDeadlockError('P2002');
        mockPrisma.$transaction.mockRejectedValueOnce(uniqueConstraintError);

        await expect(
          service.markAttachmentAsDownloaded(testParticipantId, testAttachmentId)
        ).rejects.toMatchObject({ code: 'P2002' });

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      });

      it('should throw error without code property immediately without retry', async () => {
        const genericError = new Error('Generic database error');
        mockPrisma.$transaction.mockRejectedValueOnce(genericError);

        await expect(
          service.markAttachmentAsDownloaded(testParticipantId, testAttachmentId)
        ).rejects.toThrow('Generic database error');

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ==========================================================================
  // GAP-FILL: uncovered methods / branches
  // ==========================================================================

  describe('dedup cache and cleanupDedupCache (static)', () => {
    it('markMessagesAsReceived returns early on duplicate call within TTL', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId });
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.count.mockResolvedValue(0);

      await service.markMessagesAsReceived(testParticipantId, testConversationId, testMessageId);
      const upsertCallsAfterFirst = mockPrisma.conversationReadCursor.upsert.mock.calls.length;

      // Second call with same args within 2 s → should be a no-op (dedup hit)
      await service.markMessagesAsReceived(testParticipantId, testConversationId, testMessageId);

      expect(mockPrisma.conversationReadCursor.upsert.mock.calls.length).toBe(upsertCallsAfterFirst);
    });

    it('markMessagesAsRead returns early on duplicate call within TTL', async () => {
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.participant.findUnique.mockResolvedValue({ userId: null });

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);
      const upsertCallsAfterFirst = mockPrisma.conversationReadCursor.upsert.mock.calls.length;

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      expect(mockPrisma.conversationReadCursor.upsert.mock.calls.length).toBe(upsertCallsAfterFirst);
    });

    it('triggers cleanupDedupCache when cache exceeds 100 entries', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId });
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.count.mockResolvedValue(0);

      const cache: Map<string, number> = (MessageReadStatusService as any).recentActionCache;
      const now = Date.now();
      for (let i = 0; i < 101; i++) {
        cache.set(`fill-key-${i}:conv:received`, now - 5000);
      }
      expect(cache.size).toBeGreaterThan(100);

      // This call triggers cleanupDedupCache internally (cache.size > 100)
      await service.markMessagesAsReceived('new-participant', testConversationId, testMessageId);

      expect(cache.size).toBeLessThan(110);
    });
  });

  describe('getUnreadCountsForParticipants', () => {
    // Candidate messages from the single `message.findMany`. Each row carries createdAt +
    // senderId so the service can exclude each participant's OWN messages (senderId ≠ p.id).
    const mockCandidates = (rows: ReadonlyArray<{ at: string; from: string }>) =>
      mockPrisma.message.findMany.mockResolvedValue(
        rows.map((r) => ({ createdAt: new Date(r.at), senderId: r.from }))
      );

    it('returns empty map for empty participants array', async () => {
      const result = await service.getUnreadCountsForParticipants([], testConversationId);
      expect(result).toEqual(new Map());
      expect(mockPrisma.conversationReadCursor.findMany).not.toHaveBeenCalled();
    });

    it('collapses N counts into ONE message.findMany and buckets per participant', async () => {
      // p1 floor = 10:00 (cursor) → 2 candidates strictly after (11:00, 12:00) from others
      // p2 floor = 11:30 (joinedAt, no cursor) → 1 candidate strictly after (12:00) from others
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastReadAt: new Date('2024-01-01T10:00:00Z') },
      ]);
      mockCandidates([
        { at: '2024-01-01T11:00:00Z', from: 'other' },
        { at: '2024-01-01T12:00:00Z', from: 'other' },
      ]);

      const participants = [
        { id: 'p1', joinedAt: new Date('2024-01-01T00:00:00Z') },
        { id: 'p2', joinedAt: new Date('2024-01-01T11:30:00Z') },
      ];

      const result = await service.getUnreadCountsForParticipants(
        participants, testConversationId
      );

      // Distinct floors → distinct counts, from a SINGLE candidate fetch
      expect(result.get('p1')).toBe(2);
      expect(result.get('p2')).toBe(1);
      expect(mockPrisma.message.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.message.count).not.toHaveBeenCalled();
    });

    it("excludes each participant's OWN messages, counting everyone else's (incl. the message sender)", async () => {
      // Two messages above floor: one Alice sent, one p1 sent themselves.
      // For p1: only Alice's counts (own message excluded). For p2: both count.
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockCandidates([
        { at: '2024-01-01T11:00:00Z', from: 'alice' },
        { at: '2024-01-01T12:00:00Z', from: 'p1' },
      ]);

      const result = await service.getUnreadCountsForParticipants(
        [
          { id: 'p1', joinedAt: new Date('2024-01-01T10:00:00Z') },
          { id: 'p2', joinedAt: new Date('2024-01-01T10:00:00Z') },
        ],
        testConversationId
      );

      expect(result.get('p1')).toBe(1); // alice's only — p1's own message excluded
      expect(result.get('p2')).toBe(2); // both — neither was sent by p2
    });

    it('does NOT filter by senderId in the query (own-message cut is in memory)', async () => {
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastReadAt: new Date('2024-01-01T10:00:00Z') },
        { participantId: 'p2', lastReadAt: new Date('2024-01-01T08:00:00Z') },
      ]);
      mockCandidates([]);

      await service.getUnreadCountsForParticipants(
        [
          { id: 'p1', joinedAt: null },
          { id: 'p2', joinedAt: null },
        ],
        testConversationId
      );

      const where = mockPrisma.message.findMany.mock.calls[0][0].where;
      expect(where.conversationId).toBe(testConversationId);
      expect(where.deletedAt).toBeNull();
      expect(where.senderId).toBeUndefined();
      // Oldest floor (08:00) bounds the fetch — everything any participant could count
      expect(where.createdAt).toEqual({ gt: new Date('2024-01-01T08:00:00Z') });
    });

    it('drops the createdAt bound when a participant has a null floor (unbounded)', async () => {
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastReadAt: new Date('2024-01-01T10:00:00Z') },
      ]);
      mockCandidates([
        { at: '2024-01-01T09:00:00Z', from: 'other' },
        { at: '2024-01-01T11:00:00Z', from: 'other' },
        { at: '2024-01-01T12:00:00Z', from: 'other' },
      ]);

      const result = await service.getUnreadCountsForParticipants(
        [
          { id: 'p1', joinedAt: new Date('2024-01-01T10:00:00Z') },
          { id: 'p2', joinedAt: null }, // no cursor, no joinedAt → unbounded
        ],
        testConversationId
      );

      // Unbounded participant: full fetch, no createdAt bound on the query
      expect(mockPrisma.message.findMany.mock.calls[0][0].where.createdAt).toBeUndefined();
      // p2 counts ALL candidates; p1 only those strictly after 10:00 (11:00, 12:00)
      expect(result.get('p2')).toBe(3);
      expect(result.get('p1')).toBe(2);
    });

    it('does not count a message whose createdAt equals the floor (strict gt)', async () => {
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastReadAt: new Date('2024-01-01T10:00:00Z') },
      ]);
      mockCandidates([
        { at: '2024-01-01T10:00:00Z', from: 'other' }, // exactly at floor → excluded
        { at: '2024-01-01T10:00:01Z', from: 'other' }, // after floor → counted
      ]);

      const result = await service.getUnreadCountsForParticipants(
        [{ id: 'p1', joinedAt: null }],
        testConversationId
      );

      expect(result.get('p1')).toBe(1);
    });

    it('returns 0 when the floor is at or after every candidate', async () => {
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastReadAt: new Date('2024-01-01T23:00:00Z') },
      ]);
      mockCandidates([
        { at: '2024-01-01T11:00:00Z', from: 'other' },
        { at: '2024-01-01T12:00:00Z', from: 'other' },
      ]);

      const result = await service.getUnreadCountsForParticipants(
        [{ id: 'p1', joinedAt: null }],
        testConversationId
      );

      expect(result.get('p1')).toBe(0);
    });

    it('returns zero-count map when DB throws', async () => {
      mockPrisma.conversationReadCursor.findMany.mockRejectedValue(new Error('DB error'));
      const participants = [{ id: 'p1', joinedAt: null }];

      const result = await service.getUnreadCountsForParticipants(
        participants, testConversationId
      );

      expect(result.get('p1')).toBe(0);
    });
  });

  describe('markMessagesAsReceived error path', () => {
    it('throws when cursor upsert fails', async () => {
      (MessageReadStatusService as any).recentActionCache.clear();
      mockPrisma.conversationReadCursor.upsert.mockRejectedValue(new Error('upsert fail'));

      await expect(
        service.markMessagesAsReceived(testParticipantId, testConversationId, testMessageId)
      ).rejects.toThrow('upsert fail');
    });
  });

  describe('markMessagesAsRead', () => {
    it('returns early when no latestMessageId and findFirst returns null', async () => {
      mockPrisma.message.findFirst.mockResolvedValue(null);

      // Should not throw and should not call upsert
      await service.markMessagesAsRead(testParticipantId, testConversationId);
      expect(mockPrisma.conversationReadCursor.upsert).not.toHaveBeenCalled();
    });

    it('resolves latestMessageId from DB when not provided', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: 'resolved-msg' });
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.participant.findUnique.mockResolvedValue({ userId: null });

      await service.markMessagesAsRead(testParticipantId, testConversationId);

      const upsertCall = mockPrisma.conversationReadCursor.upsert.mock.calls[0][0];
      expect(upsertCall.create.lastReadMessageId).toBe('resolved-msg');
    });

    it('calls NotificationService when participant has userId', async () => {
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.participant.findUnique.mockResolvedValue({ userId: 'user-with-id' });

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      // No error thrown means the notification path was reached and succeeded
      expect(mockPrisma.participant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: testParticipantId } })
      );
    });

    it('throws when cursor upsert fails', async () => {
      (MessageReadStatusService as any).recentActionCache.clear();
      mockPrisma.conversationReadCursor.upsert.mockRejectedValue(new Error('read upsert fail'));

      await expect(
        service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId)
      ).rejects.toThrow('read upsert fail');
    });
  });

  describe('getConversationReadStatuses error path', () => {
    it('throws when message.findMany fails', async () => {
      mockPrisma.message.findMany.mockRejectedValue(new Error('findMany fail'));

      await expect(
        service.getConversationReadStatuses(testConversationId, [testMessageId])
      ).rejects.toThrow('findMany fail');
    });
  });

  describe('getMessageStatusDetails', () => {
    it('throws when message is not found', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.getMessageStatusDetails(testMessageId)
      ).rejects.toThrow('Message not found');
    });

    it('returns paginated statuses for a found message', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      mockPrisma.message.findUnique.mockResolvedValue({
        createdAt: msgCreatedAt,
        conversationId: testConversationId,
      });
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        {
          participantId: 'p1',
          lastDeliveredAt: new Date('2024-06-01T10:01:00Z'),
          lastReadAt: new Date('2024-06-01T10:02:00Z'),
        },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1', displayName: 'Alice', avatar: null },
      ]);

      const result = await service.getMessageStatusDetails(testMessageId);

      expect(result.statuses).toHaveLength(1);
      expect(result.statuses[0].displayName).toBe('Alice');
      expect(result.statuses[0].deliveredAt).not.toBeNull();
      expect(result.statuses[0].readAt).not.toBeNull();
      expect(result.pagination.total).toBe(1);
    });

    it('prefers the frozen per-message timestamps over the moving cursor', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      // Cursor has moved far forward (e.g. conversation re-opened today).
      const movedCursorAt = new Date('2024-09-01T09:00:00Z');
      // But the message was actually read right after it was sent.
      const frozenReadAt = new Date('2024-06-01T10:02:00Z');
      const frozenDeliveredAt = new Date('2024-06-01T10:01:00Z');

      mockPrisma.message.findUnique.mockResolvedValue({
        createdAt: msgCreatedAt,
        conversationId: testConversationId,
      });
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastDeliveredAt: movedCursorAt, lastReadAt: movedCursorAt },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1', displayName: 'Alice', avatar: null },
      ]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        { participantId: 'p1', deliveredAt: frozenDeliveredAt, receivedAt: frozenDeliveredAt, readAt: frozenReadAt, readDevice: 'ios' },
      ]);

      const result = await service.getMessageStatusDetails(testMessageId);

      // The frozen historical times win — NOT the re-advanced cursor value.
      expect(result.statuses[0].readAt).toEqual(frozenReadAt);
      expect(result.statuses[0].deliveredAt).toEqual(frozenDeliveredAt);
      expect(result.statuses[0].readDevice).toBe('ios');
    });

    // Mirror of getMessageReadStatus: a cursor deleted by cleanupObsoleteCursors
    // must not erase a surviving frozen receipt. The participant row is resolved
    // from the frozen entry's id (not only from cursor ids).
    it('still surfaces a frozen receipt when the participant cursor was deleted by cleanup', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      const frozenDeliveredAt = new Date('2024-06-01T10:01:00Z');
      const frozenReadAt = new Date('2024-06-01T10:02:00Z');

      mockPrisma.message.findUnique.mockResolvedValue({
        createdAt: msgCreatedAt,
        conversationId: testConversationId,
      });
      // No cursors remain (deleted by cleanup).
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      // Participant row still active, resolved via the frozen-entry id.
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1', displayName: 'Alice', avatar: null },
      ]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        { participantId: 'p1', deliveredAt: frozenDeliveredAt, receivedAt: frozenDeliveredAt, readAt: frozenReadAt, readDevice: 'ios' },
      ]);

      const result = await service.getMessageStatusDetails(testMessageId);

      expect(result.statuses).toHaveLength(1);
      expect(result.statuses[0].participantId).toBe('p1');
      expect(result.statuses[0].deliveredAt).toEqual(frozenDeliveredAt);
      expect(result.statuses[0].readAt).toEqual(frozenReadAt);
      expect(result.pagination.total).toBe(1);
    });

    it('skips orphan cursors (participant not found)', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      mockPrisma.message.findUnique.mockResolvedValue({
        createdAt: msgCreatedAt,
        conversationId: testConversationId,
      });
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        {
          participantId: 'orphan-p',
          lastDeliveredAt: new Date('2024-06-01T10:01:00Z'),
          lastReadAt: null,
        },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([]);

      const result = await service.getMessageStatusDetails(testMessageId);

      expect(result.statuses).toHaveLength(0);
    });

    it('applies delivered filter correctly', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      mockPrisma.message.findUnique.mockResolvedValue({
        createdAt: msgCreatedAt,
        conversationId: testConversationId,
      });
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: null },
        { participantId: 'p2', lastDeliveredAt: null, lastReadAt: null },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1', displayName: 'Alice', avatar: null },
        { id: 'p2', displayName: 'Bob', avatar: null },
      ]);

      const result = await service.getMessageStatusDetails(testMessageId, { filter: 'delivered' });
      expect(result.statuses).toHaveLength(1);
      expect(result.statuses[0].displayName).toBe('Alice');
    });

    it('applies read filter correctly', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      mockPrisma.message.findUnique.mockResolvedValue({
        createdAt: msgCreatedAt,
        conversationId: testConversationId,
      });
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastDeliveredAt: null, lastReadAt: new Date('2024-06-01T10:02:00Z') },
        { participantId: 'p2', lastDeliveredAt: null, lastReadAt: null },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1', displayName: 'Alice', avatar: null },
        { id: 'p2', displayName: 'Bob', avatar: null },
      ]);

      const result = await service.getMessageStatusDetails(testMessageId, { filter: 'read' });
      expect(result.statuses).toHaveLength(1);
      expect(result.statuses[0].readAt).not.toBeNull();
    });

    it('applies unread filter correctly', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      mockPrisma.message.findUnique.mockResolvedValue({
        createdAt: msgCreatedAt,
        conversationId: testConversationId,
      });
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastDeliveredAt: null, lastReadAt: new Date('2024-06-01T10:02:00Z') },
        { participantId: 'p2', lastDeliveredAt: null, lastReadAt: null },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1', displayName: 'Alice', avatar: null },
        { id: 'p2', displayName: 'Bob', avatar: null },
      ]);

      const result = await service.getMessageStatusDetails(testMessageId, { filter: 'unread' });
      expect(result.statuses).toHaveLength(1);
      expect(result.statuses[0].displayName).toBe('Bob');
    });

    it('handles pagination correctly', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      mockPrisma.message.findUnique.mockResolvedValue({ createdAt: msgCreatedAt, conversationId: testConversationId });
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: null },
        { participantId: 'p2', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: null },
        { participantId: 'p3', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: null },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1', displayName: 'A', avatar: null },
        { id: 'p2', displayName: 'B', avatar: null },
        { id: 'p3', displayName: 'C', avatar: null },
      ]);

      const result = await service.getMessageStatusDetails(testMessageId, { offset: 1, limit: 1 });
      expect(result.statuses).toHaveLength(1);
      expect(result.pagination.total).toBe(3);
      expect(result.pagination.hasMore).toBe(true);
    });

    it('throws when DB query fails', async () => {
      mockPrisma.message.findUnique.mockRejectedValue(new Error('DB error'));
      await expect(service.getMessageStatusDetails(testMessageId)).rejects.toThrow('DB error');
    });

    it('returns empty statuses when no cursors found', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        createdAt: new Date(),
        conversationId: testConversationId,
      });
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);

      const result = await service.getMessageStatusDetails(testMessageId);
      expect(result.statuses).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(mockPrisma.participant.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getAttachmentStatusDetails', () => {
    it('returns paginated attachment statuses', async () => {
      const viewedAt = new Date('2024-06-01T11:00:00Z');
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([
        {
          participantId: 'p1',
          viewedAt,
          downloadedAt: null,
          listenedAt: null,
          watchedAt: null,
          listenCount: 0,
          watchCount: 0,
          listenedComplete: false,
          watchedComplete: false,
          lastPlayPositionMs: null,
          lastWatchPositionMs: null,
        },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1', displayName: 'Charlie', avatar: 'avatar.png' },
      ]);

      const result = await service.getAttachmentStatusDetails(testAttachmentId);

      expect(result.statuses).toHaveLength(1);
      expect(result.statuses[0].username).toBe('Charlie');
      expect(result.statuses[0].viewedAt).toBe(viewedAt);
      expect(result.pagination.total).toBe(1);
    });

    it('filters by viewed status', async () => {
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(0);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([]);

      await service.getAttachmentStatusDetails(testAttachmentId, { filter: 'viewed' });

      expect(mockPrisma.attachmentStatusEntry.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ viewedAt: { not: null } }),
        })
      );
    });

    it('filters by downloaded status', async () => {
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(0);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([]);

      await service.getAttachmentStatusDetails(testAttachmentId, { filter: 'downloaded' });

      expect(mockPrisma.attachmentStatusEntry.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ downloadedAt: { not: null } }),
        })
      );
    });

    it('filters by listened status', async () => {
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(0);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([]);

      await service.getAttachmentStatusDetails(testAttachmentId, { filter: 'listened' });

      expect(mockPrisma.attachmentStatusEntry.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ listenedAt: { not: null } }),
        })
      );
    });

    it('filters by watched status', async () => {
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(0);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([]);

      await service.getAttachmentStatusDetails(testAttachmentId, { filter: 'watched' });

      expect(mockPrisma.attachmentStatusEntry.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ watchedAt: { not: null } }),
        })
      );
    });

    it('skips orphan participant rows', async () => {
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([
        {
          participantId: 'orphan',
          viewedAt: null, downloadedAt: null, listenedAt: null, watchedAt: null,
          listenCount: 0, watchCount: 0, listenedComplete: false, watchedComplete: false,
          lastPlayPositionMs: null, lastWatchPositionMs: null,
        },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([]);

      const result = await service.getAttachmentStatusDetails(testAttachmentId);
      expect(result.statuses).toHaveLength(0);
    });

    it('returns empty when no statuses found', async () => {
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(0);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([]);

      const result = await service.getAttachmentStatusDetails(testAttachmentId);

      expect(result.statuses).toHaveLength(0);
      expect(mockPrisma.participant.findMany).not.toHaveBeenCalled();
    });

    it('throws when DB query fails', async () => {
      mockPrisma.attachmentStatusEntry.count.mockRejectedValue(new Error('att DB fail'));
      await expect(service.getAttachmentStatusDetails(testAttachmentId)).rejects.toThrow('att DB fail');
    });
  });

  describe('getLatestMessageSummary', () => {
    it('returns zeros when no messages found', async () => {
      mockPrisma.message.findFirst.mockResolvedValue(null);

      const result = await service.getLatestMessageSummary(testConversationId);

      expect(result).toEqual({ totalMembers: 0, deliveredCount: 0, readCount: 0 });
    });

    it('returns summary based on active participants and cursors', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      mockPrisma.message.findFirst.mockResolvedValue({
        createdAt: msgCreatedAt,
        senderId: 'sender-id',
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1' }, { id: 'p2' },
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: new Date('2024-06-01T10:02:00Z') },
        { participantId: 'p2', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: null },
      ]);

      const result = await service.getLatestMessageSummary(testConversationId);

      expect(result.totalMembers).toBe(2);
      expect(result.deliveredCount).toBe(2);
      expect(result.readCount).toBe(1);
    });

    it('only counts cursors from active participants', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      mockPrisma.message.findFirst.mockResolvedValue({
        createdAt: msgCreatedAt,
        senderId: 'sender-id',
      });
      mockPrisma.participant.findMany.mockResolvedValue([{ id: 'p1' }]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'inactive-p', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: null },
        { participantId: 'p1', lastDeliveredAt: null, lastReadAt: null },
      ]);

      const result = await service.getLatestMessageSummary(testConversationId);

      expect(result.deliveredCount).toBe(0);
    });

    it('returns zeros and logs error on DB failure', async () => {
      mockPrisma.message.findFirst.mockRejectedValue(new Error('connection lost'));

      const result = await service.getLatestMessageSummary(testConversationId);

      expect(result).toEqual({ totalMembers: 0, deliveredCount: 0, readCount: 0 });
    });
  });

  describe('updateUnreadCount (via markMessagesAsReceived)', () => {
    it('counts all messages when cursor has no lastReadAt', async () => {
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
        id: 'cursor-1', lastReadAt: null,
      });
      mockPrisma.message.count.mockResolvedValue(5);
      mockPrisma.conversationReadCursor.update.mockResolvedValue({});

      await service.markMessagesAsReceived('p-new', testConversationId, testMessageId);

      expect(mockPrisma.message.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ senderId: { not: 'p-new' } }),
        })
      );
      expect(mockPrisma.conversationReadCursor.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { unreadCount: 5 } })
      );
    });

    it('counts messages after lastReadAt when cursor has lastReadAt', async () => {
      const lastReadAt = new Date('2024-06-01T09:00:00Z');
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
        id: 'cursor-2', lastReadAt,
      });
      mockPrisma.message.count.mockResolvedValue(2);
      mockPrisma.conversationReadCursor.update.mockResolvedValue({});

      await service.markMessagesAsReceived('p-with-cursor', testConversationId, testMessageId);

      expect(mockPrisma.message.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ createdAt: { gt: lastReadAt } }),
        })
      );
      expect(mockPrisma.conversationReadCursor.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { unreadCount: 2 } })
      );
    });

    it('does not call update when cursor is null', async () => {
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.count.mockResolvedValue(0);

      await service.markMessagesAsReceived('p-no-cursor', testConversationId, testMessageId);

      expect(mockPrisma.conversationReadCursor.update).not.toHaveBeenCalled();
    });
  });

  describe('updateAttachmentComputedStatus — video all-watched path', () => {
    beforeEach(() => {
      // Reset these mocks fully to clear any queued Once handlers from prior tests
      mockPrisma.attachmentStatusEntry.count.mockReset();
      mockPrisma.attachmentStatusEntry.findFirst.mockReset();
      mockPrisma.$transaction.mockReset();
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'video/mp4',
        message: { conversationId: testConversationId, senderId: 'sender-id' },
      });
      mockPrisma.participant.count.mockResolvedValue(1);
      mockPrisma.messageAttachment.update.mockResolvedValue({});
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    });

    it('sets watchedByAllAt when all participants watched (video)', async () => {
      const watchedAt = new Date('2024-06-01T12:00:00Z');
      mockPrisma.attachmentStatusEntry.count.mockImplementation((args: any) => {
        if (args?.where?.watchedAt) return Promise.resolve(1);
        return Promise.resolve(0);
      });
      mockPrisma.attachmentStatusEntry.findFirst.mockImplementation(() =>
        Promise.resolve({ watchedAt })
      );

      await service.markVideoAsWatched(testParticipantId, testAttachmentId);

      const updateData = mockPrisma.messageAttachment.update.mock.calls[0]?.[0]?.data;
      expect(updateData?.watchedByAllAt).toEqual(watchedAt);
    });

    it('logs error when updateAttachmentComputedStatus DB call fails', async () => {
      mockPrisma.attachmentStatusEntry.count.mockRejectedValue(new Error('count fail'));
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));

      // Should not throw — error is caught and logged inside updateAttachmentComputedStatus
      await service.markVideoAsWatched(testParticipantId, testAttachmentId);
    });
  });

  describe('cleanupObsoleteCursors error path', () => {
    it('throws when conversationReadCursor.findMany fails', async () => {
      mockPrisma.conversationReadCursor.findMany.mockRejectedValue(new Error('cursor error'));

      await expect(
        service.cleanupObsoleteCursors(testConversationId)
      ).rejects.toThrow('cursor error');
    });
  });

  // ===========================================================
  // BRANCH GAP-FILL: uncovered catch blocks + no-op method
  // ===========================================================

  describe('updateUnreadCount — error swallowed silently', () => {
    it('completes markMessagesAsReceived even when updateUnreadCount DB call fails', async () => {
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      // findUnique inside updateUnreadCount throws — error must be swallowed
      mockPrisma.conversationReadCursor.findUnique.mockRejectedValue(new Error('cursor lookup fail'));

      await expect(
        service.markMessagesAsReceived(testParticipantId, testConversationId, testMessageId)
      ).resolves.toBeUndefined();
    });
  });

  describe('markMessagesAsRead — notification sync error swallowed', () => {
    it('completes normally when participant.findUnique throws during notification sync', async () => {
      mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
      // participant.findUnique throws inside the notification-sync try block
      mockPrisma.participant.findUnique.mockRejectedValue(new Error('participant lookup fail'));

      await expect(
        service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId)
      ).resolves.toBeUndefined();
    });
  });

  describe('updateMessageComputedStatus — no-op legacy method', () => {
    it('resolves to undefined without side effects', async () => {
      await expect(
        service.updateMessageComputedStatus(testMessageId)
      ).resolves.toBeUndefined();
    });
  });

  describe('getUnreadCountsForConversations — empty participantIds guard', () => {
    it('returns empty Map when participantIds array is empty', async () => {
      const result = await service.getUnreadCountsForConversations([], [testConversationId]);
      expect(result).toEqual(new Map());
    });
  });
});
