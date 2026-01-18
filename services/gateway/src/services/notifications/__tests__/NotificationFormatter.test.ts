/**
 * Tests unitaires pour NotificationFormatter
 * Module pur sans dépendances externes - tests simples
 */

import { NotificationFormatter } from '../NotificationFormatter';

describe('NotificationFormatter', () => {
  let formatter: NotificationFormatter;

  beforeEach(() => {
    formatter = new NotificationFormatter();
  });

  describe('truncateMessage', () => {
    it('should not truncate short messages', () => {
      const message = 'Hello world';
      const result = formatter.truncateMessage(message, 25);
      expect(result).toBe('Hello world');
    });

    it('should truncate long messages at word boundary', () => {
      const message = 'This is a very long message that needs to be truncated at some point';
      const result = formatter.truncateMessage(message, 5);
      expect(result).toBe('This is a very long...');
      expect(result.split(' ').length).toBeLessThanOrEqual(6); // 5 words + "..."
    });

    it('should handle empty messages', () => {
      const result = formatter.truncateMessage('', 10);
      expect(result).toBe('');
    });

    it('should handle null/undefined', () => {
      const result1 = formatter.truncateMessage(null as any, 10);
      const result2 = formatter.truncateMessage(undefined as any, 10);
      expect(result1).toBe('');
      expect(result2).toBe('');
    });

    it('should respect maxWords parameter', () => {
      const message = 'one two three four five six seven eight nine ten';
      const result = formatter.truncateMessage(message, 3);
      expect(result).toBe('one two three...');
    });
  });

  describe('formatAttachmentInfo', () => {
    it('should return null for no attachments', () => {
      const result = formatter.formatAttachmentInfo(undefined);
      expect(result).toBeNull();
    });

    it('should return null for empty array', () => {
      const result = formatter.formatAttachmentInfo([]);
      expect(result).toBeNull();
    });

    it('should format single image attachment', () => {
      const attachments = [{
        id: 'att-1',
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024
      }];

      const result = formatter.formatAttachmentInfo(attachments);
      expect(result).toEqual({
        count: 1,
        firstType: 'image',
        firstFilename: 'photo.jpg',
        firstMimeType: 'image/jpeg'
      });
    });

    it('should format multiple attachments', () => {
      const attachments = [
        { id: 'att-1', filename: 'doc.pdf', mimeType: 'application/pdf', fileSize: 2048 },
        { id: 'att-2', filename: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 1024 }
      ];

      const result = formatter.formatAttachmentInfo(attachments);
      expect(result).toEqual({
        count: 2,
        firstType: 'application',
        firstFilename: 'doc.pdf',
        firstMimeType: 'application/pdf'
      });
    });

    it('should handle video attachments', () => {
      const attachments = [{
        id: 'att-1',
        filename: 'video.mp4',
        mimeType: 'video/mp4',
        fileSize: 5000
      }];

      const result = formatter.formatAttachmentInfo(attachments);
      expect(result?.firstType).toBe('video');
    });
  });

  describe('formatMessagePreview', () => {
    it('should format text-only message', () => {
      const result = formatter.formatMessagePreview('Hello world', undefined, 25);
      expect(result).toBe('Hello world');
    });

    it('should format image attachment without text', () => {
      const attachments = [{
        id: 'att-1',
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024
      }];

      const result = formatter.formatMessagePreview('', attachments);
      expect(result).toBe('📷 Photo');
    });

    it('should format video attachment without text', () => {
      const attachments = [{
        id: 'att-1',
        filename: 'video.mp4',
        mimeType: 'video/mp4',
        fileSize: 5000
      }];

      const result = formatter.formatMessagePreview('', attachments);
      expect(result).toBe('🎥 Vidéo');
    });

    it('should format audio attachment without text', () => {
      const attachments = [{
        id: 'att-1',
        filename: 'audio.mp3',
        mimeType: 'audio/mpeg',
        fileSize: 3000
      }];

      const result = formatter.formatMessagePreview('', attachments);
      expect(result).toBe('🎵 Audio');
    });

    it('should format PDF attachment without text', () => {
      const attachments = [{
        id: 'att-1',
        filename: 'doc.pdf',
        mimeType: 'application/pdf',
        fileSize: 2000
      }];

      const result = formatter.formatMessagePreview('', attachments);
      expect(result).toBe('📄 PDF');
    });

    it('should format generic document attachment', () => {
      const attachments = [{
        id: 'att-1',
        filename: 'doc.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileSize: 2000
      }];

      const result = formatter.formatMessagePreview('', attachments);
      expect(result).toBe('📎 Document');
    });

    it('should combine text with attachment', () => {
      const attachments = [{
        id: 'att-1',
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024
      }];

      const result = formatter.formatMessagePreview('Check this out!', attachments, 25);
      expect(result).toContain('Check this out!');
      expect(result).toContain('📷 Photo');
    });

    it('should show multiple attachments count', () => {
      const attachments = [
        { id: 'att-1', filename: 'photo1.jpg', mimeType: 'image/jpeg', fileSize: 1024 },
        { id: 'att-2', filename: 'photo2.jpg', mimeType: 'image/jpeg', fileSize: 1024 },
        { id: 'att-3', filename: 'photo3.jpg', mimeType: 'image/jpeg', fileSize: 1024 }
      ];

      const result = formatter.formatMessagePreview('', attachments);
      expect(result).toBe('📷 Photo (+2)');
    });

    it('should truncate long text with attachment', () => {
      const longText = 'This is a very long message that should be truncated'.split(' ').join(' ');
      const attachments = [{
        id: 'att-1',
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024
      }];

      const result = formatter.formatMessagePreview(longText, attachments, 5);
      expect(result).toContain('...');
      expect(result).toContain('📷 Photo');
    });
  });

  describe('formatNotificationEvent', () => {
    it('should transform Prisma notification to event', () => {
      const prismaNotification = {
        id: 'notif-123',
        userId: 'user-456',
        type: 'new_message',
        title: 'New Message',
        content: 'Hello',
        priority: 'normal',
        isRead: false,
        createdAt: new Date('2024-01-15T10:00:00Z'),
        senderId: 'sender-789',
        senderUsername: 'john_doe',
        senderAvatar: 'https://example.com/avatar.jpg',
        senderDisplayName: 'John Doe',
        senderFirstName: 'John',
        senderLastName: 'Doe',
        messagePreview: 'Hello',
        conversationId: 'conv-101',
        messageId: 'msg-202',
        callSessionId: null,
        data: JSON.stringify({ key: 'value' }),
        expiresAt: null
      };

      const result = formatter.formatNotificationEvent(prismaNotification);

      expect(result).toEqual({
        id: 'notif-123',
        userId: 'user-456',
        type: 'new_message',
        title: 'New Message',
        content: 'Hello',
        priority: 'normal',
        isRead: false,
        createdAt: new Date('2024-01-15T10:00:00Z'),
        senderId: 'sender-789',
        senderUsername: 'john_doe',
        senderAvatar: 'https://example.com/avatar.jpg',
        senderDisplayName: 'John Doe',
        senderFirstName: 'John',
        senderLastName: 'Doe',
        messagePreview: 'Hello',
        conversationId: 'conv-101',
        messageId: 'msg-202',
        callSessionId: undefined,
        data: { key: 'value' }
      });
    });

    it('should handle null optional fields', () => {
      const prismaNotification = {
        id: 'notif-123',
        userId: 'user-456',
        type: 'system',
        title: 'System Message',
        content: 'System maintenance',
        priority: 'high',
        isRead: false,
        createdAt: new Date('2024-01-15T10:00:00Z'),
        senderId: null,
        senderUsername: null,
        senderAvatar: null,
        senderDisplayName: null,
        senderFirstName: null,
        senderLastName: null,
        messagePreview: null,
        conversationId: null,
        messageId: null,
        callSessionId: null,
        data: null,
        expiresAt: null
      };

      const result = formatter.formatNotificationEvent(prismaNotification);

      expect(result.senderId).toBeUndefined();
      expect(result.senderUsername).toBeUndefined();
      expect(result.data).toBeUndefined();
    });
  });

  describe('createNotificationData', () => {
    it('should create notification data for DB insertion', () => {
      const result = formatter.createNotificationData(
        'user-123',
        'new_message',
        'New Message',
        'Hello world',
        {
          priority: 'normal',
          senderId: 'sender-456',
          senderUsername: 'john_doe',
          conversationId: 'conv-789',
          messageId: 'msg-101'
        }
      );

      expect(result).toEqual({
        userId: 'user-123',
        type: 'new_message',
        title: 'New Message',
        content: 'Hello world',
        priority: 'normal',
        senderId: 'sender-456',
        senderUsername: 'john_doe',
        senderAvatar: undefined,
        senderDisplayName: undefined,
        senderFirstName: undefined,
        senderLastName: undefined,
        messagePreview: undefined,
        conversationId: 'conv-789',
        messageId: 'msg-101',
        callSessionId: undefined,
        data: null,
        isRead: false
      });
    });

    it('should serialize data object to JSON string', () => {
      const result = formatter.createNotificationData(
        'user-123',
        'new_message',
        'Title',
        'Content',
        {
          data: { key: 'value', nested: { prop: 123 } }
        }
      );

      expect(result.data).toBe(JSON.stringify({ key: 'value', nested: { prop: 123 } }));
    });

    it('should default priority to normal', () => {
      const result = formatter.createNotificationData(
        'user-123',
        'new_message',
        'Title',
        'Content',
        {}
      );

      expect(result.priority).toBe('normal');
    });
  });
});
