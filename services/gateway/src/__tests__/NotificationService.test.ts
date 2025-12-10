/**
 * NotificationService Unit Tests
 *
 * Comprehensive test suite covering:
 * - Notification creation and sanitization
 * - XSS protection
 * - IDOR prevention
 * - Rate limiting
 * - User preferences
 * - Edge cases and error handling
 *
 * Coverage target: > 80%
 *
 * @jest-environment node
 */

import { NotificationService, CreateNotificationData } from '../services/NotificationService';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { Server as SocketIOServer } from 'socket.io';

// Mock Prisma
jest.mock('../../shared/prisma/client', () => {
  const mockPrisma = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      createMany: jest.fn()
    },
    notificationPreference: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    }
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma)
  };
});

// Mock Socket.IO
jest.mock('socket.io', () => ({
  Server: jest.fn()
}));

// Mock loggers
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

jest.mock('../utils/logger-enhanced', () => ({
  notificationLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  },
  securityLogger: {
    logViolation: jest.fn(),
    logAttempt: jest.fn(),
    logSuccess: jest.fn()
  }
}));

describe('NotificationService', () => {
  let service: NotificationService;
  let prisma: any;
  let mockIO: any;
  let userSocketsMap: Map<string, Set<string>>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create new Prisma instance
    prisma = new PrismaClient();

    // Create service
    service = new NotificationService(prisma);

    // Mock Socket.IO
    mockIO = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn()
    };

    userSocketsMap = new Map();

    // Initialize Socket.IO
    service.setSocketIO(mockIO as any, userSocketsMap);
  });

  describe('createNotification', () => {
    const validNotificationData: CreateNotificationData = {
      userId: '507f1f77bcf86cd799439011',
      type: 'new_message',
      title: 'New Message',
      content: 'You have a new message',
      priority: 'normal'
    };

    it('should create a notification successfully', async () => {
      const mockNotification = {
        id: 'notif123',
        ...validNotificationData,
        isRead: false,
        createdAt: new Date()
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification);

      const result = await service.createNotification(validNotificationData);

      expect(result).toBeDefined();
      expect(result?.id).toBe('notif123');
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    });

    it('should sanitize XSS in title', async () => {
      const xssData = {
        ...validNotificationData,
        title: '<script>alert("XSS")</script>Hacked Title'
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 'notif123' });

      await service.createNotification(xssData);

      const createCall = prisma.notification.create.mock.calls[0][0];
      expect(createCall.data.title).not.toContain('<script>');
      expect(createCall.data.title).not.toContain('alert');
    });

    it('should sanitize XSS in content', async () => {
      const xssData = {
        ...validNotificationData,
        content: '<img src=x onerror=alert(1)>Malicious content'
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 'notif123' });

      await service.createNotification(xssData);

      const createCall = prisma.notification.create.mock.calls[0][0];
      expect(createCall.data.content).not.toContain('<img');
      expect(createCall.data.content).not.toContain('onerror');
    });

    it('should sanitize malicious username', async () => {
      const maliciousData = {
        ...validNotificationData,
        senderUsername: '<script>evil()</script>user'
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 'notif123' });

      await service.createNotification(maliciousData);

      const createCall = prisma.notification.create.mock.calls[0][0];
      expect(createCall.data.senderUsername).not.toContain('<script>');
    });

    it('should reject invalid notification type', async () => {
      const invalidData = {
        ...validNotificationData,
        type: 'invalid_type' as any
      };

      await expect(service.createNotification(invalidData)).rejects.toThrow();
    });

    it('should reject invalid priority', async () => {
      const invalidData = {
        ...validNotificationData,
        priority: 'super_urgent' as any
      };

      await expect(service.createNotification(invalidData)).rejects.toThrow();
    });

    it('should respect user preferences - DND enabled', async () => {
      const preferences = {
        dndEnabled: true,
        dndStartTime: '00:00',
        dndEndTime: '23:59',
        newMessageEnabled: true
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(preferences);

      const result = await service.createNotification(validNotificationData);

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should respect user preferences - notification type disabled', async () => {
      const preferences = {
        newMessageEnabled: false,
        dndEnabled: false
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(preferences);

      const result = await service.createNotification(validNotificationData);

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should emit notification via Socket.IO when user is online', async () => {
      const mockNotification = {
        id: 'notif123',
        ...validNotificationData,
        isRead: false,
        createdAt: new Date()
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification);

      // User has 2 active sockets
      userSocketsMap.set(validNotificationData.userId, new Set(['socket1', 'socket2']));

      await service.createNotification(validNotificationData);

      expect(mockIO.to).toHaveBeenCalledWith('socket1');
      expect(mockIO.to).toHaveBeenCalledWith('socket2');
      expect(mockIO.emit).toHaveBeenCalledTimes(2);
      expect(mockIO.emit).toHaveBeenCalledWith('notification', expect.any(Object));
    });

    it('should handle user offline gracefully', async () => {
      const mockNotification = {
        id: 'notif123',
        ...validNotificationData,
        isRead: false,
        createdAt: new Date()
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification);

      // User is offline (no sockets)
      const result = await service.createNotification(validNotificationData);

      expect(result).toBeDefined();
      expect(mockIO.to).not.toHaveBeenCalled();
    });

    it('should sanitize JSON data object', async () => {
      const maliciousData = {
        ...validNotificationData,
        data: {
          normalField: 'safe',
          $malicious: 'mongodb operator',
          __proto__: 'prototype pollution',
          nested: {
            xss: '<script>alert(1)</script>'
          }
        }
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 'notif123' });

      await service.createNotification(maliciousData);

      const createCall = prisma.notification.create.mock.calls[0][0];
      const savedData = JSON.parse(createCall.data.data);

      expect(savedData.$malicious).toBeUndefined();
      expect(savedData.__proto__).toBeUndefined();
      expect(savedData.nested.xss).not.toContain('<script>');
    });

    it('should validate and sanitize avatar URL', async () => {
      const dataWithAvatar = {
        ...validNotificationData,
        senderAvatar: 'javascript:alert(1)'
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 'notif123' });

      await service.createNotification(dataWithAvatar);

      const createCall = prisma.notification.create.mock.calls[0][0];
      expect(createCall.data.senderAvatar).toBeNull();
    });

    it('should allow valid HTTPS avatar URL', async () => {
      const dataWithAvatar = {
        ...validNotificationData,
        senderAvatar: 'https://example.com/avatar.png'
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 'notif123' });

      await service.createNotification(dataWithAvatar);

      const createCall = prisma.notification.create.mock.calls[0][0];
      expect(createCall.data.senderAvatar).toBe('https://example.com/avatar.png');
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read successfully', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.markAsRead('notif123', 'user123');

      expect(result).toBe(true);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'notif123',
          userId: 'user123'
        },
        data: {
          isRead: true
        }
      });
    });

    it('should handle errors gracefully', async () => {
      prisma.notification.updateMany.mockRejectedValue(new Error('Database error'));

      const result = await service.markAsRead('notif123', 'user123');

      expect(result).toBe(false);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read for user', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markAllAsRead('user123');

      expect(result).toBe(true);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user123',
          isRead: false
        },
        data: {
          isRead: true
        }
      });
    });
  });

  describe('getUnreadCount', () => {
    it('should return correct unread count', async () => {
      prisma.notification.count.mockResolvedValue(7);

      const count = await service.getUnreadCount('user123');

      expect(count).toBe(7);
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: {
          userId: 'user123',
          isRead: false
        }
      });
    });

    it('should return 0 on error', async () => {
      prisma.notification.count.mockRejectedValue(new Error('Database error'));

      const count = await service.getUnreadCount('user123');

      expect(count).toBe(0);
    });
  });

  describe('deleteNotification', () => {
    it('should delete notification successfully', async () => {
      prisma.notification.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.deleteNotification('notif123', 'user123');

      expect(result).toBe(true);
      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'notif123',
          userId: 'user123'
        }
      });
    });
  });

  describe('mention notifications - rate limiting', () => {
    it('should create mention notification', async () => {
      const mentionData = {
        mentionedUserId: 'user456',
        senderId: 'user123',
        senderUsername: 'testuser',
        messageContent: 'Hey @user456 check this out',
        conversationId: 'conv123',
        messageId: 'msg123',
        isMemberOfConversation: true
      };

      prisma.notificationPreference.findUnique.mockResolvedValue({ mentionEnabled: true });
      prisma.notification.create.mockResolvedValue({ id: 'notif123' });

      const result = await service.createMentionNotification(mentionData);

      expect(result).toBeDefined();
      expect(prisma.notification.create).toHaveBeenCalled();
    });

    it('should rate limit mention notifications (5 per minute max)', async () => {
      const mentionData = {
        mentionedUserId: 'user456',
        senderId: 'user123',
        senderUsername: 'testuser',
        messageContent: 'Mention',
        conversationId: 'conv123',
        messageId: 'msg123',
        isMemberOfConversation: true
      };

      prisma.notificationPreference.findUnique.mockResolvedValue({ mentionEnabled: true });
      prisma.notification.create.mockResolvedValue({ id: 'notif123' });

      // Create 6 mention notifications rapidly
      const results = [];
      for (let i = 0; i < 6; i++) {
        const result = await service.createMentionNotification({
          ...mentionData,
          messageId: `msg${i}`
        });
        results.push(result);
      }

      // First 5 should succeed, 6th should be rate limited
      const successCount = results.filter(r => r !== null).length;
      expect(successCount).toBeLessThanOrEqual(5);
    });

    it('should not create mention notification for self-mention', async () => {
      const mentionData = {
        mentionedUserId: 'user123',
        senderId: 'user123', // Same user
        senderUsername: 'testuser',
        messageContent: 'Mention myself',
        conversationId: 'conv123',
        messageId: 'msg123',
        isMemberOfConversation: true
      };

      const result = await service.createMentionNotification(mentionData);

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe('batch mention notifications', () => {
    it('should create batch mention notifications efficiently', async () => {
      const mentionedUserIds = ['user1', 'user2', 'user3'];
      const commonData = {
        senderId: 'sender123',
        senderUsername: 'sender',
        messageContent: 'Hey everyone!',
        conversationId: 'conv123',
        conversationTitle: 'Test Conversation',
        messageId: 'msg123',
        attachments: []
      };
      const memberIds = ['user1', 'user2', 'user3'];

      prisma.notificationPreference.findUnique.mockResolvedValue({ mentionEnabled: true });
      prisma.notification.createMany.mockResolvedValue({ count: 3 });
      prisma.notification.findMany.mockResolvedValue([
        { id: 'notif1', userId: 'user1' },
        { id: 'notif2', userId: 'user2' },
        { id: 'notif3', userId: 'user3' }
      ]);

      const count = await service.createMentionNotificationsBatch(
        mentionedUserIds,
        commonData,
        memberIds
      );

      expect(count).toBe(3);
      expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('truncateMessage', () => {
    it('should truncate long messages', () => {
      const longMessage = 'word '.repeat(50); // 50 words
      const truncated = (service as any).truncateMessage(longMessage, 25);

      expect(truncated.endsWith('...')).toBe(true);
      const wordCount = truncated.replace('...', '').trim().split(/\s+/).length;
      expect(wordCount).toBe(25);
    });

    it('should not truncate short messages', () => {
      const shortMessage = 'This is a short message';
      const result = (service as any).truncateMessage(shortMessage, 25);

      expect(result).toBe(shortMessage);
      expect(result.endsWith('...')).toBe(false);
    });
  });
});
