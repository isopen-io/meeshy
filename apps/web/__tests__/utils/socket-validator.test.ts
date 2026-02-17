/**
 * Tests for socket-validator utility
 */

import {
  validateNotificationEvent,
  validateNotificationReadEvent,
  validateNotificationDeletedEvent,
  validateNotificationCountsEvent,
  validateSocketEvent,
  createValidatedHandler,
  batchValidateNotifications,
  validateNotificationResponse,
  schemas,
} from '../../utils/socket-validator';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

// Mock xss-protection
jest.mock('../../utils/xss-protection', () => ({
  sanitizeNotification: jest.fn((notification) => notification),
}));

describe('socket-validator', () => {
  // Helper to create a valid notification
  const createValidNotification = (overrides = {}) => ({
    id: 'notif-123',
    userId: 'user-123',
    type: 'new_message',
    title: 'Test Notification',
    content: 'Test content',
    priority: 'normal',
    isRead: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validateNotificationEvent', () => {
    it('should validate a correct notification', () => {
      const notification = createValidNotification();
      const result = validateNotificationEvent(notification);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.sanitized).toBe(true);
    });

    it('should accept all valid notification types', () => {
      const types = [
        'new_message',
        'new_conversation_direct',
        'new_conversation_group',
        'message_reply',
        'member_joined',
        'contact_request',
        'contact_accepted',
        'user_mentioned',
        'message_reaction',
        'missed_call',
        'system',
      ];

      types.forEach((type) => {
        const result = validateNotificationEvent(createValidNotification({ type }));
        expect(result.success).toBe(true);
      });
    });

    it('should accept all valid priority levels', () => {
      const priorities = ['low', 'normal', 'high', 'urgent'];

      priorities.forEach((priority) => {
        const result = validateNotificationEvent(createValidNotification({ priority }));
        expect(result.success).toBe(true);
      });
    });

    it('should fail for missing id', () => {
      const notification = createValidNotification({ id: '' });
      const result = validateNotificationEvent(notification);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Notification ID required');
    });

    it('should fail for missing userId', () => {
      const notification = createValidNotification({ userId: '' });
      const result = validateNotificationEvent(notification);

      expect(result.success).toBe(false);
      expect(result.error).toContain('User ID required');
    });

    it('should fail for invalid type', () => {
      const notification = createValidNotification({ type: 'invalid_type' });
      const result = validateNotificationEvent(notification);

      expect(result.success).toBe(false);
    });

    it('should fail for title too long', () => {
      const notification = createValidNotification({ title: 'a'.repeat(201) });
      const result = validateNotificationEvent(notification);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Title too long');
    });

    it('should fail for content too long', () => {
      const notification = createValidNotification({ content: 'a'.repeat(1001) });
      const result = validateNotificationEvent(notification);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Content too long');
    });

    it('should transform string date to Date object', () => {
      const dateString = '2024-01-15T10:30:00.000Z';
      const notification = createValidNotification({ createdAt: dateString });
      const result = validateNotificationEvent(notification);

      expect(result.success).toBe(true);
      expect(result.data?.createdAt).toBeInstanceOf(Date);
    });

    it('should accept Date object for createdAt', () => {
      const notification = createValidNotification({ createdAt: new Date() });
      const result = validateNotificationEvent(notification);

      expect(result.success).toBe(true);
    });

    it('should handle optional context', () => {
      const notification = createValidNotification({
        context: {
          conversationId: 'conv-123',
          conversationTitle: 'Test Conversation',
        },
      });
      const result = validateNotificationEvent(notification);

      expect(result.success).toBe(true);
      expect(result.data?.context?.conversationId).toBe('conv-123');
    });

    it('should handle optional sender info', () => {
      const notification = createValidNotification({
        senderId: 'sender-123',
        senderUsername: 'johndoe',
      });
      const result = validateNotificationEvent(notification);

      expect(result.success).toBe(true);
    });

    it('should validate attachments structure', () => {
      const notification = createValidNotification({
        attachments: [
          {
            id: 'att-1',
            fileName: 'test.pdf',
            mimeType: 'application/pdf',
            fileSize: 1024,
            fileUrl: 'https://example.com/test.pdf',
          },
        ],
      });
      const result = validateNotificationEvent(notification);

      expect(result.success).toBe(true);
    });

    it('should fail for attachment with invalid url', () => {
      const notification = createValidNotification({
        attachments: [
          {
            id: 'att-1',
            fileName: 'test.pdf',
            mimeType: 'application/pdf',
            fileSize: 1024,
            fileUrl: 'not-a-url',
          },
        ],
      });
      const result = validateNotificationEvent(notification);

      expect(result.success).toBe(false);
    });

    it('should fail for non-object input', () => {
      const result = validateNotificationEvent('invalid');
      expect(result.success).toBe(false);
    });

    it('should fail for null input', () => {
      const result = validateNotificationEvent(null);
      expect(result.success).toBe(false);
    });
  });

  describe('validateNotificationReadEvent', () => {
    it('should validate correct read event', () => {
      const result = validateNotificationReadEvent({ notificationId: 'notif-123' });

      expect(result.success).toBe(true);
      expect(result.data?.notificationId).toBe('notif-123');
    });

    it('should fail for empty notificationId', () => {
      const result = validateNotificationReadEvent({ notificationId: '' });
      expect(result.success).toBe(false);
    });

    it('should fail for missing notificationId', () => {
      const result = validateNotificationReadEvent({});
      expect(result.success).toBe(false);
    });

    it('should fail for non-object input', () => {
      const result = validateNotificationReadEvent('invalid');
      expect(result.success).toBe(false);
    });
  });

  describe('validateNotificationDeletedEvent', () => {
    it('should validate correct deleted event', () => {
      const result = validateNotificationDeletedEvent({ notificationId: 'notif-123' });

      expect(result.success).toBe(true);
      expect(result.data?.notificationId).toBe('notif-123');
    });

    it('should fail for empty notificationId', () => {
      const result = validateNotificationDeletedEvent({ notificationId: '' });
      expect(result.success).toBe(false);
    });

    it('should fail for missing notificationId', () => {
      const result = validateNotificationDeletedEvent({});
      expect(result.success).toBe(false);
    });
  });

  describe('validateNotificationCountsEvent', () => {
    it('should validate correct counts event', () => {
      const data = {
        unreadCount: 5,
        counts: {
          total: 10,
          unread: 5,
          byType: { new_message: 3, contact_request: 2 },
          byPriority: { normal: 4, high: 1 },
        },
      };
      const result = validateNotificationCountsEvent(data);

      expect(result.success).toBe(true);
      expect(result.data?.unreadCount).toBe(5);
      expect(result.data?.counts.total).toBe(10);
    });

    it('should fail for negative unreadCount', () => {
      const data = {
        unreadCount: -1,
        counts: {
          total: 10,
          unread: 5,
          byType: {},
          byPriority: {},
        },
      };
      const result = validateNotificationCountsEvent(data);
      expect(result.success).toBe(false);
    });

    it('should fail for missing counts object', () => {
      const result = validateNotificationCountsEvent({ unreadCount: 5 });
      expect(result.success).toBe(false);
    });

    it('should accept zero counts', () => {
      const data = {
        unreadCount: 0,
        counts: {
          total: 0,
          unread: 0,
          byType: {},
          byPriority: {},
        },
      };
      const result = validateNotificationCountsEvent(data);
      expect(result.success).toBe(true);
    });
  });

  describe('validateSocketEvent', () => {
    it('should route notification event correctly', () => {
      const notification = createValidNotification();
      const result = validateSocketEvent('notification', notification);
      expect(result.success).toBe(true);
    });

    it('should route notification:read event correctly', () => {
      const result = validateSocketEvent(SERVER_EVENTS.NOTIFICATION_READ, { notificationId: 'notif-123' });
      expect(result.success).toBe(true);
    });

    it('should route notification:deleted event correctly', () => {
      const result = validateSocketEvent(SERVER_EVENTS.NOTIFICATION_DELETED, { notificationId: 'notif-123' });
      expect(result.success).toBe(true);
    });

    it('should route notification:counts event correctly', () => {
      const data = {
        unreadCount: 5,
        counts: {
          total: 10,
          unread: 5,
          byType: {},
          byPriority: {},
        },
      };
      const result = validateSocketEvent(SERVER_EVENTS.NOTIFICATION_COUNTS, data);
      expect(result.success).toBe(true);
    });

    it('should fail for unknown event type', () => {
      const result = validateSocketEvent('unknown:event', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown event type');
    });
  });

  describe('createValidatedHandler', () => {
    it('should call handler with validated data', () => {
      const handler = jest.fn();
      const validatedHandler = createValidatedHandler(SERVER_EVENTS.NOTIFICATION_READ, handler);

      validatedHandler({ notificationId: 'notif-123' });

      expect(handler).toHaveBeenCalledWith({ notificationId: 'notif-123' });
    });

    it('should not call handler for invalid data', () => {
      const handler = jest.fn();
      const validatedHandler = createValidatedHandler(SERVER_EVENTS.NOTIFICATION_READ, handler);

      validatedHandler({ notificationId: '' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should log error for invalid data', () => {
      const handler = jest.fn();
      const validatedHandler = createValidatedHandler(SERVER_EVENTS.NOTIFICATION_READ, handler);

      validatedHandler({});

      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('batchValidateNotifications', () => {
    it('should validate array of notifications', () => {
      const notifications = [
        createValidNotification({ id: '1' }),
        createValidNotification({ id: '2' }),
        createValidNotification({ id: '3' }),
      ];

      const result = batchValidateNotifications(notifications);

      expect(result).toHaveLength(3);
    });

    it('should filter out invalid notifications', () => {
      const notifications = [
        createValidNotification({ id: '1' }),
        { id: '', type: 'invalid' }, // Invalid
        createValidNotification({ id: '3' }),
      ];

      const result = batchValidateNotifications(notifications);

      expect(result).toHaveLength(2);
    });

    it('should return empty array for non-array input', () => {
      const result = batchValidateNotifications('not-an-array' as any);
      expect(result).toEqual([]);
    });

    it('should return empty array for empty array', () => {
      const result = batchValidateNotifications([]);
      expect(result).toEqual([]);
    });

    it('should log warning for invalid notifications', () => {
      const notifications = [
        createValidNotification({ id: '1' }),
        { id: '' }, // Invalid
      ];

      batchValidateNotifications(notifications);

      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('validateNotificationResponse', () => {
    it('should validate complete API response', () => {
      const response = {
        notifications: [
          createValidNotification({ id: '1' }),
          createValidNotification({ id: '2' }),
        ],
        pagination: {
          offset: 0,
          limit: 10,
          total: 2,
          hasMore: false,
        },
        unreadCount: 1,
      };

      const result = validateNotificationResponse(response);

      expect(result.success).toBe(true);
      expect(result.data?.notifications).toHaveLength(2);
      expect(result.data?.pagination.total).toBe(2);
      expect(result.data?.unreadCount).toBe(1);
    });

    it('should fail for missing pagination', () => {
      const response = {
        notifications: [],
        unreadCount: 0,
      };

      const result = validateNotificationResponse(response);
      expect(result.success).toBe(false);
    });

    it('should fail for negative offset', () => {
      const response = {
        notifications: [],
        pagination: {
          offset: -1,
          limit: 10,
          total: 0,
          hasMore: false,
        },
        unreadCount: 0,
      };

      const result = validateNotificationResponse(response);
      expect(result.success).toBe(false);
    });

    it('should filter invalid notifications in response', () => {
      const response = {
        notifications: [
          createValidNotification({ id: '1' }),
          { id: '' }, // Invalid
        ],
        pagination: {
          offset: 0,
          limit: 10,
          total: 2,
          hasMore: false,
        },
        unreadCount: 1,
      };

      const result = validateNotificationResponse(response);

      expect(result.success).toBe(true);
      expect(result.data?.notifications).toHaveLength(1);
    });
  });

  describe('schemas', () => {
    it('should export notification schema', () => {
      expect(schemas.notification).toBeDefined();
    });

    it('should export notificationRead schema', () => {
      expect(schemas.notificationRead).toBeDefined();
    });

    it('should export notificationDeleted schema', () => {
      expect(schemas.notificationDeleted).toBeDefined();
    });

    it('should export notificationCounts schema', () => {
      expect(schemas.notificationCounts).toBeDefined();
    });
  });
});
