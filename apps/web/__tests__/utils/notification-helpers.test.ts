/**
 * Tests for notification-helpers utility
 */

import {
  NOTIFICATION_ICONS,
  getNotificationIcon,
  getNotificationBorderColor,
  formatNotificationTimestamp,
  formatNotificationContext,
  formatMessagePreview,
  getNotificationLink,
  requiresUserAction,
  getSenderDisplayName,
  buildNotificationTitle,
  buildNotificationContent,
} from '../../utils/notification-helpers';
import { NotificationTypeEnum, type Notification } from '../../types/notification';

describe('notification-helpers', () => {
  const createMockNotification = (overrides: Partial<Notification> = {}): Notification => ({
    id: 'notif-123',
    userId: 'user-123',
    type: NotificationTypeEnum.NEW_MESSAGE,
    title: 'Test Notification',
    content: 'Test content',
    priority: 'normal',
    isRead: false,
    createdAt: new Date(),
    ...overrides,
  });

  describe('NOTIFICATION_ICONS', () => {
    it('should have icons for core notification types', () => {
      // Only test the core types that are defined in NOTIFICATION_ICONS
      const coreTypes = [
        NotificationTypeEnum.NEW_MESSAGE,
        NotificationTypeEnum.MESSAGE_REPLY,
        NotificationTypeEnum.USER_MENTIONED,
        NotificationTypeEnum.MESSAGE_REACTION,
        NotificationTypeEnum.CONTACT_REQUEST,
        NotificationTypeEnum.CONTACT_ACCEPTED,
        NotificationTypeEnum.NEW_CONVERSATION_DIRECT,
        NotificationTypeEnum.NEW_CONVERSATION_GROUP,
        NotificationTypeEnum.MEMBER_JOINED,
        NotificationTypeEnum.MISSED_CALL,
        NotificationTypeEnum.SYSTEM,
      ];
      coreTypes.forEach(type => {
        expect(NOTIFICATION_ICONS[type]).toBeDefined();
        expect(NOTIFICATION_ICONS[type]).toHaveProperty('emoji');
        expect(NOTIFICATION_ICONS[type]).toHaveProperty('color');
        expect(NOTIFICATION_ICONS[type]).toHaveProperty('bgColor');
      });
    });
  });

  describe('getNotificationIcon', () => {
    it('should return icon for NEW_MESSAGE type', () => {
      const notification = createMockNotification({ type: NotificationTypeEnum.NEW_MESSAGE });
      const icon = getNotificationIcon(notification);
      expect(icon.emoji).toBeDefined();
    });

    it('should return icon for CONTACT_REQUEST type', () => {
      const notification = createMockNotification({ type: NotificationTypeEnum.CONTACT_REQUEST });
      const icon = getNotificationIcon(notification);
      expect(icon.emoji).toBeDefined();
    });

    it('should return SYSTEM icon for unknown type', () => {
      const notification = createMockNotification({ type: 'unknown' as any });
      const icon = getNotificationIcon(notification);
      expect(icon).toEqual(NOTIFICATION_ICONS[NotificationTypeEnum.SYSTEM]);
    });
  });

  describe('getNotificationBorderColor', () => {
    it('should return blue border for NEW_MESSAGE', () => {
      const notification = createMockNotification({ type: NotificationTypeEnum.NEW_MESSAGE });
      const color = getNotificationBorderColor(notification);
      expect(color).toContain('blue');
    });

    it('should return green border for CONTACT_REQUEST', () => {
      const notification = createMockNotification({ type: NotificationTypeEnum.CONTACT_REQUEST });
      const color = getNotificationBorderColor(notification);
      expect(color).toContain('green');
    });

    it('should return red border for MISSED_CALL', () => {
      const notification = createMockNotification({ type: NotificationTypeEnum.MISSED_CALL });
      const color = getNotificationBorderColor(notification);
      expect(color).toContain('red');
    });

    it('should return default color for unknown type', () => {
      const notification = createMockNotification({ type: 'unknown' as any });
      const color = getNotificationBorderColor(notification);
      expect(color).toContain('blue');
    });
  });

  describe('formatNotificationTimestamp', () => {
    it('should return "a l\'instant" for very recent timestamps', () => {
      const now = new Date();
      const result = formatNotificationTimestamp(now);
      expect(result).toContain('instant');
    });

    it('should return seconds ago for less than a minute', () => {
      const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
      const result = formatNotificationTimestamp(thirtySecondsAgo);
      expect(result).toMatch(/il y a \d+s/);
    });

    it('should return minutes ago for less than an hour', () => {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      const result = formatNotificationTimestamp(thirtyMinutesAgo);
      expect(result).toMatch(/il y a \d+min/);
    });

    it('should return hours ago for less than a day', () => {
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
      const result = formatNotificationTimestamp(fiveHoursAgo);
      expect(result).toMatch(/il y a \d+h/);
    });

    it('should return days ago for less than a week', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const result = formatNotificationTimestamp(threeDaysAgo);
      expect(result).toMatch(/il y a \d+j/);
    });

    it('should return formatted date for more than a week', () => {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const result = formatNotificationTimestamp(twoWeeksAgo);
      // Should be a date format like "4 nov."
      expect(result).toMatch(/\d+/);
    });

    it('should accept string date input', () => {
      const dateString = new Date().toISOString();
      const result = formatNotificationTimestamp(dateString);
      expect(result).toContain('instant');
    });
  });

  describe('formatNotificationContext', () => {
    it('should include conversation title when present', () => {
      const notification = createMockNotification({
        context: { conversationTitle: 'Test Conversation' },
      });
      const result = formatNotificationContext(notification);
      expect(result).toContain('Test Conversation');
    });

    it('should include timestamp', () => {
      const notification = createMockNotification();
      const result = formatNotificationContext(notification);
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle missing context', () => {
      const notification = createMockNotification({ context: undefined });
      const result = formatNotificationContext(notification);
      expect(result).toBeDefined();
    });
  });

  describe('formatMessagePreview', () => {
    it('should return content when no attachments', () => {
      const result = formatMessagePreview('Hello world', []);
      expect(result).toBe('Hello world');
    });

    it('should return content when attachments undefined', () => {
      const result = formatMessagePreview('Hello world');
      expect(result).toBe('Hello world');
    });

    it('should return photo indicator for image attachments', () => {
      const attachments = [{ mimeType: 'image/jpeg' }];
      const result = formatMessagePreview('', attachments);
      expect(result).toContain('Photo');
    });

    it('should return file indicator for non-image attachments', () => {
      const attachments = [{ mimeType: 'application/pdf' }];
      const result = formatMessagePreview('', attachments);
      expect(result).toContain('Fichier');
    });

    it('should show count for multiple attachments', () => {
      const attachments = [
        { mimeType: 'image/jpeg' },
        { mimeType: 'image/png' },
        { mimeType: 'image/gif' },
      ];
      const result = formatMessagePreview('', attachments);
      expect(result).toContain('(3)');
    });
  });

  describe('getNotificationLink', () => {
    it('should return conversation link when conversationId exists', () => {
      const notification = createMockNotification({
        context: { conversationId: 'conv-123' },
      });
      const link = getNotificationLink(notification);
      expect(link).toBe('/conversations/conv-123');
    });

    it('should include messageId in link when present', () => {
      const notification = createMockNotification({
        context: { conversationId: 'conv-123', messageId: 'msg-456' },
      });
      const link = getNotificationLink(notification);
      expect(link).toBe('/conversations/conv-123?messageId=msg-456');
    });

    it('should return null when no conversationId', () => {
      const notification = createMockNotification({ context: undefined });
      const link = getNotificationLink(notification);
      expect(link).toBeNull();
    });
  });

  describe('requiresUserAction', () => {
    it('should return true for CONTACT_REQUEST', () => {
      const notification = createMockNotification({ type: NotificationTypeEnum.CONTACT_REQUEST });
      expect(requiresUserAction(notification)).toBe(true);
    });

    it('should return false for NEW_MESSAGE', () => {
      const notification = createMockNotification({ type: NotificationTypeEnum.NEW_MESSAGE });
      expect(requiresUserAction(notification)).toBe(false);
    });

    it('should return false for SYSTEM', () => {
      const notification = createMockNotification({ type: NotificationTypeEnum.SYSTEM });
      expect(requiresUserAction(notification)).toBe(false);
    });
  });

  describe('getSenderDisplayName', () => {
    it('should return displayName when present', () => {
      const sender = { displayName: 'John Doe' };
      expect(getSenderDisplayName(sender as any)).toBe('John Doe');
    });

    it('should return firstName lastName when displayName missing', () => {
      const sender = { firstName: 'John', lastName: 'Doe' };
      expect(getSenderDisplayName(sender as any)).toBe('John Doe');
    });

    it('should return username as fallback', () => {
      const sender = { username: 'johndoe' };
      expect(getSenderDisplayName(sender as any)).toBe('johndoe');
    });

    it('should return default for undefined sender', () => {
      expect(getSenderDisplayName(undefined)).toBe('Un utilisateur');
    });
  });

  describe('buildNotificationTitle', () => {
    describe('without translation function', () => {
      it('should build NEW_MESSAGE title', () => {
        const notification = createMockNotification({
          type: NotificationTypeEnum.NEW_MESSAGE,
          sender: { displayName: 'John' } as any,
        });
        const title = buildNotificationTitle(notification);
        expect(title).toContain('Message de');
        expect(title).toContain('John');
      });

      it('should build CONTACT_REQUEST title', () => {
        const notification = createMockNotification({
          type: NotificationTypeEnum.CONTACT_REQUEST,
          sender: { displayName: 'John' } as any,
        });
        const title = buildNotificationTitle(notification);
        expect(title).toContain('connecter');
      });

      it('should build MESSAGE_REACTION title', () => {
        const notification = createMockNotification({
          type: NotificationTypeEnum.MESSAGE_REACTION,
          sender: { displayName: 'John' } as any,
        });
        const title = buildNotificationTitle(notification);
        expect(title).toContain('réagi');
      });

      it('should return original title for SYSTEM type', () => {
        const notification = createMockNotification({
          type: NotificationTypeEnum.SYSTEM,
          title: 'System Update',
        });
        const title = buildNotificationTitle(notification);
        expect(title).toBe('System Update');
      });
    });

    describe('with translation function', () => {
      const mockT = (key: string, params?: Record<string, string>) => {
        return `translated:${key}:${JSON.stringify(params)}`;
      };

      it('should use translation for NEW_MESSAGE', () => {
        const notification = createMockNotification({
          type: NotificationTypeEnum.NEW_MESSAGE,
          sender: { displayName: 'John' } as any,
        });
        const title = buildNotificationTitle(notification, mockT);
        expect(title).toContain('translated:titles.newMessage');
      });

      it('should use translation for CONTACT_REQUEST', () => {
        const notification = createMockNotification({
          type: NotificationTypeEnum.CONTACT_REQUEST,
          sender: { displayName: 'John' } as any,
        });
        const title = buildNotificationTitle(notification, mockT);
        expect(title).toContain('translated:titles.contactRequest');
      });
    });
  });

  describe('buildNotificationContent', () => {
    describe('without translation function', () => {
      it('should return messagePreview when present', () => {
        const notification = createMockNotification({
          messagePreview: 'Preview text',
        });
        const content = buildNotificationContent(notification);
        expect(content).toBe('Preview text');
      });

      it('should return content when no messagePreview', () => {
        const notification = createMockNotification({
          messagePreview: undefined,
          content: 'Notification content',
        });
        const content = buildNotificationContent(notification);
        expect(content).toBe('Notification content');
      });

      it('should build default content for CONTACT_ACCEPTED', () => {
        const notification = createMockNotification({
          type: NotificationTypeEnum.CONTACT_ACCEPTED,
          messagePreview: undefined,
          content: '',
          sender: { displayName: 'John' } as any,
        });
        const content = buildNotificationContent(notification);
        expect(content).toContain('John');
        expect(content).toContain('accepté');
      });
    });

    describe('with translation function', () => {
      const mockT = (key: string, params?: Record<string, string>) => {
        return `translated:${key}`;
      };

      it('should use translation for CONTACT_ACCEPTED', () => {
        const notification = createMockNotification({
          type: NotificationTypeEnum.CONTACT_ACCEPTED,
          messagePreview: undefined,
          content: '',
          sender: { displayName: 'John' } as any,
        });
        const content = buildNotificationContent(notification, mockT);
        expect(content).toContain('translated:content.contactAcceptedMessage');
      });
    });
  });
});
