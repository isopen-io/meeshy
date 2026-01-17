/**
 * Tests for MessagesService
 *
 * Tests message CRUD operations, pagination, formatting utilities,
 * mention extraction, and grouping logic
 */

import { messagesService, Message } from '@/services/messages.service';
import { apiService } from '@/services/api.service';

// Mock the apiService
jest.mock('@/services/api.service', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockApiService = apiService as jest.Mocked<typeof apiService>;

describe('MessagesService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('createMessage', () => {
    it('should create a new message', async () => {
      const messageData = {
        content: 'Hello world',
        conversationId: 'conv-123',
        originalLanguage: 'en',
      };

      const mockMessage = {
        id: 'msg-123',
        content: 'Hello world',
        authorId: 'user-1',
        conversationId: 'conv-123',
        originalLanguage: 'en',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isEdited: false,
        author: {
          id: 'user-1',
          username: 'testuser',
          firstName: 'Test',
          lastName: 'User',
        },
      };

      mockApiService.post.mockResolvedValue({
        success: true,
        data: mockMessage,
      });

      const result = await messagesService.createMessage(messageData);

      expect(mockApiService.post).toHaveBeenCalledWith('/messages', messageData);
      expect(result.data?.id).toBe('msg-123');
    });

    it('should create message with replyToId', async () => {
      const messageData = {
        content: 'Reply message',
        conversationId: 'conv-123',
        replyToId: 'msg-original',
      };

      mockApiService.post.mockResolvedValue({
        success: true,
        data: { id: 'msg-reply' },
      });

      await messagesService.createMessage(messageData);

      expect(mockApiService.post).toHaveBeenCalledWith('/messages', messageData);
    });

    it('should throw error on create failure', async () => {
      mockApiService.post.mockRejectedValue(new Error('Network error'));

      await expect(
        messagesService.createMessage({
          content: 'test',
          conversationId: 'conv-123',
        })
      ).rejects.toThrow('Network error');
    });
  });

  describe('getMessagesByConversation', () => {
    it('should fetch messages with pagination', async () => {
      const mockMessages = [
        { id: 'msg-1', content: 'Message 1' },
        { id: 'msg-2', content: 'Message 2' },
      ];

      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: mockMessages,
          pagination: { total: 2, offset: 0, limit: 20, hasMore: false },
        },
        success: true,
      });

      const result = await messagesService.getMessagesByConversation('conv-123', 1, 20);

      expect(mockApiService.get).toHaveBeenCalledWith(
        '/conversations/conv-123/messages',
        { limit: 20, offset: 0 }
      );
      expect(result.data).toHaveLength(2);
    });

    it('should calculate offset from page number', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: [],
          pagination: { total: 100, offset: 40, limit: 20, hasMore: true },
        },
        success: true,
      });

      await messagesService.getMessagesByConversation('conv-123', 3, 20);

      expect(mockApiService.get).toHaveBeenCalledWith(
        '/conversations/conv-123/messages',
        { limit: 20, offset: 40 } // Page 3, offset = (3-1) * 20 = 40
      );
    });

    it('should use default pagination values', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: [],
          pagination: { total: 0, offset: 0, limit: 20, hasMore: false },
        },
        success: true,
      });

      await messagesService.getMessagesByConversation('conv-123');

      expect(mockApiService.get).toHaveBeenCalledWith(
        '/conversations/conv-123/messages',
        { limit: 20, offset: 0 }
      );
    });
  });

  describe('getMessagesWithOffset', () => {
    it('should fetch messages with direct offset', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: [{ id: 'msg-1', content: 'Test' }],
          pagination: { total: 50, offset: 10, limit: 20, hasMore: true },
          meta: { userLanguage: 'fr' },
        },
        success: true,
      });

      const result = await messagesService.getMessagesWithOffset('conv-123', 10, 20);

      expect(mockApiService.get).toHaveBeenCalledWith(
        '/conversations/conv-123/messages',
        { limit: 20, offset: 10 }
      );
      expect(result.pagination?.hasMore).toBe(true);
    });
  });

  describe('sendMessageToConversation', () => {
    it('should send message to conversation', async () => {
      mockApiService.post.mockResolvedValue({
        success: true,
        data: { id: 'msg-new', content: 'Hello' },
      });

      const result = await messagesService.sendMessageToConversation('conv-123', 'Hello');

      expect(mockApiService.post).toHaveBeenCalledWith('/conversations/conv-123/messages', {
        content: 'Hello',
        conversationId: 'conv-123',
      });
      expect(result.data?.id).toBe('msg-new');
    });
  });

  describe('updateMessage', () => {
    it('should update message content', async () => {
      mockApiService.patch.mockResolvedValue({
        success: true,
        data: { id: 'msg-123', content: 'Updated content', isEdited: true },
      });

      const result = await messagesService.updateMessage('msg-123', { content: 'Updated content' });

      expect(mockApiService.patch).toHaveBeenCalledWith('/messages/msg-123', {
        content: 'Updated content',
      });
      expect(result.data?.isEdited).toBe(true);
    });

    it('should throw error on update failure', async () => {
      mockApiService.patch.mockRejectedValue(new Error('Unauthorized'));

      await expect(
        messagesService.updateMessage('msg-123', { content: 'test' })
      ).rejects.toThrow('Unauthorized');
    });
  });

  describe('deleteMessage', () => {
    it('should delete message', async () => {
      mockApiService.delete.mockResolvedValue({
        success: true,
        data: { message: 'Message deleted' },
      });

      const result = await messagesService.deleteMessage('msg-123');

      expect(mockApiService.delete).toHaveBeenCalledWith('/messages/msg-123');
      expect(result.success).toBe(true);
    });

    it('should throw error on delete failure', async () => {
      mockApiService.delete.mockRejectedValue(new Error('Not found'));

      await expect(messagesService.deleteMessage('msg-nonexistent')).rejects.toThrow('Not found');
    });
  });

  describe('formatMessageDate', () => {
    beforeEach(() => {
      // Mock Date to have consistent tests
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return "A l\'instant" for very recent messages', () => {
      const now = new Date().toISOString();
      expect(messagesService.formatMessageDate(now)).toBe("À l'instant");
    });

    it('should return minutes for messages less than 1 hour old', () => {
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      expect(messagesService.formatMessageDate(thirtyMinsAgo)).toBe('30 min');
    });

    it('should return hours for messages less than 24 hours old', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      expect(messagesService.formatMessageDate(threeHoursAgo)).toBe('3h');
    });

    it('should return "Hier" for messages from yesterday', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      expect(messagesService.formatMessageDate(yesterday)).toBe('Hier');
    });

    it('should return days for messages within a week', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      expect(messagesService.formatMessageDate(threeDaysAgo)).toBe('3 jours');
    });

    it('should return formatted date for older messages', () => {
      const oldDate = new Date('2024-01-01T10:00:00Z').toISOString();
      const result = messagesService.formatMessageDate(oldDate);
      expect(result).toMatch(/\d+ janv\./);
    });
  });

  describe('formatMessageTime', () => {
    it('should format time correctly', () => {
      const date = new Date('2024-01-15T14:30:00Z').toISOString();
      const result = messagesService.formatMessageTime(date);
      // This will vary by timezone, but should be in HH:MM format
      expect(result).toMatch(/\d{2}:\d{2}/);
    });
  });

  describe('isMyMessage', () => {
    const mockMessage: Message = {
      id: 'msg-123',
      content: 'Test',
      authorId: 'user-123',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isEdited: false,
      author: {
        id: 'user-123',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
      },
    };

    it('should return true when message is from current user', () => {
      expect(messagesService.isMyMessage(mockMessage, 'user-123')).toBe(true);
    });

    it('should return false when message is from another user', () => {
      expect(messagesService.isMyMessage(mockMessage, 'user-456')).toBe(false);
    });
  });

  describe('getAuthorDisplayName', () => {
    it('should return displayName if available', () => {
      const message: Message = {
        id: 'msg-1',
        content: 'Test',
        authorId: 'user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isEdited: false,
        author: {
          id: 'user-1',
          username: 'john_doe',
          firstName: 'John',
          lastName: 'Doe',
          displayName: 'Johnny D',
        },
      };

      expect(messagesService.getAuthorDisplayName(message)).toBe('Johnny D');
    });

    it('should return first and last name when no displayName', () => {
      const message: Message = {
        id: 'msg-1',
        content: 'Test',
        authorId: 'user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isEdited: false,
        author: {
          id: 'user-1',
          username: 'john_doe',
          firstName: 'John',
          lastName: 'Doe',
        },
      };

      expect(messagesService.getAuthorDisplayName(message)).toBe('John Doe');
    });

    it('should return username when no names available', () => {
      const message: Message = {
        id: 'msg-1',
        content: 'Test',
        authorId: 'user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isEdited: false,
        author: {
          id: 'user-1',
          username: 'john_doe',
          firstName: '',
          lastName: '',
        },
      };

      expect(messagesService.getAuthorDisplayName(message)).toBe('john_doe');
    });
  });

  describe('canGroupWithPrevious', () => {
    const createMessage = (authorId: string, createdAt: Date): Message => ({
      id: `msg-${Math.random()}`,
      content: 'Test',
      authorId,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
      isEdited: false,
      author: {
        id: authorId,
        username: 'test',
        firstName: 'Test',
        lastName: 'User',
      },
    });

    it('should return false when no previous message', () => {
      const message = createMessage('user-1', new Date());
      expect(messagesService.canGroupWithPrevious(message, null)).toBe(false);
    });

    it('should return true for same author within 5 minutes', () => {
      const now = new Date();
      const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);

      const currentMessage = createMessage('user-1', now);
      const previousMessage = createMessage('user-1', twoMinutesAgo);

      expect(messagesService.canGroupWithPrevious(currentMessage, previousMessage)).toBe(true);
    });

    it('should return false for different authors', () => {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

      const currentMessage = createMessage('user-1', now);
      const previousMessage = createMessage('user-2', oneMinuteAgo);

      expect(messagesService.canGroupWithPrevious(currentMessage, previousMessage)).toBe(false);
    });

    it('should return false for same author but more than 5 minutes apart', () => {
      const now = new Date();
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

      const currentMessage = createMessage('user-1', now);
      const previousMessage = createMessage('user-1', tenMinutesAgo);

      expect(messagesService.canGroupWithPrevious(currentMessage, previousMessage)).toBe(false);
    });

    it('should return true for messages exactly 4 minutes apart', () => {
      const now = new Date();
      const fourMinutesAgo = new Date(now.getTime() - 4 * 60 * 1000);

      const currentMessage = createMessage('user-1', now);
      const previousMessage = createMessage('user-1', fourMinutesAgo);

      expect(messagesService.canGroupWithPrevious(currentMessage, previousMessage)).toBe(true);
    });
  });

  describe('truncateContent', () => {
    it('should not truncate short content', () => {
      const shortContent = 'Hello world';
      expect(messagesService.truncateContent(shortContent)).toBe('Hello world');
    });

    it('should truncate long content with ellipsis', () => {
      const longContent = 'A'.repeat(150);
      const result = messagesService.truncateContent(longContent, 100);
      expect(result).toHaveLength(100);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should respect custom max length', () => {
      const content = 'This is a test message for truncation';
      const result = messagesService.truncateContent(content, 20);
      expect(result).toHaveLength(20);
      expect(result).toBe('This is a test me...');
    });

    it('should not truncate content at exact max length', () => {
      const content = 'Exactly fifty characters long - test message here';
      const result = messagesService.truncateContent(content, 50);
      expect(result).toBe(content);
    });
  });

  describe('hasMentions', () => {
    it('should return true for content with mentions', () => {
      expect(messagesService.hasMentions('Hello @john how are you?')).toBe(true);
    });

    it('should return true for multiple mentions', () => {
      expect(messagesService.hasMentions('@john and @jane meeting today')).toBe(true);
    });

    it('should return false for content without mentions', () => {
      expect(messagesService.hasMentions('Hello everyone!')).toBe(false);
    });

    it('should return false for empty content', () => {
      expect(messagesService.hasMentions('')).toBe(false);
    });

    it('should return false for @ without username', () => {
      expect(messagesService.hasMentions('Email: test@ domain.com')).toBe(false);
    });
  });

  describe('extractMentions', () => {
    it('should extract single mention', () => {
      const mentions = messagesService.extractMentions('Hello @john!');
      expect(mentions).toEqual(['john']);
    });

    it('should extract multiple mentions', () => {
      const mentions = messagesService.extractMentions('@john @jane @bob meeting');
      expect(mentions).toEqual(['john', 'jane', 'bob']);
    });

    it('should return empty array for no mentions', () => {
      const mentions = messagesService.extractMentions('Hello everyone!');
      expect(mentions).toEqual([]);
    });

    it('should handle mentions with underscores', () => {
      const mentions = messagesService.extractMentions('Hello @john_doe!');
      expect(mentions).toEqual(['john_doe']);
    });

    it('should handle mentions with numbers', () => {
      const mentions = messagesService.extractMentions('Hello @user123!');
      expect(mentions).toEqual(['user123']);
    });

    it('should not include @ symbol in extracted mentions', () => {
      const mentions = messagesService.extractMentions('@alice @bob');
      mentions.forEach((mention) => {
        expect(mention.startsWith('@')).toBe(false);
      });
    });
  });
});
