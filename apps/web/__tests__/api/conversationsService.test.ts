import { conversationsService } from '../../services/conversations.service';
import { apiService } from '../../services/api.service';
import type { Conversation, Message } from '../../types';

// Mock the apiService
jest.mock('../../services/api.service', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockApiService = apiService as jest.Mocked<typeof apiService>;

describe('ConversationsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getConversations', () => {
    it('should fetch all conversations', async () => {
      const mockConversations: Conversation[] = [
        {
          id: '1',
          type: 'direct',
          name: 'Test Conversation',
          isGroup: false,
          isActive: true,
          participants: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessage: undefined,
          unreadCount: 0,
        },
      ];

      mockApiService.get.mockResolvedValue({
        data: mockConversations,
        status: 200,
        message: 'Success',
      });

      const result = await conversationsService.getConversations();

      expect(mockApiService.get).toHaveBeenCalledWith('/conversations');
      expect(result).toEqual(mockConversations);
    });

    it('should handle empty conversations list', async () => {
      mockApiService.get.mockResolvedValue({
        data: [],
        status: 200,
        message: 'Success',
      });

      const result = await conversationsService.getConversations();

      expect(result).toEqual([]);
    });
  });

  describe('getConversation', () => {
    it('should fetch a specific conversation', async () => {
      const mockConversation: Conversation = {
        id: '1',
        type: 'direct',
        name: 'Test Conversation',
        isGroup: false,
        isActive: true,
        participants: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        lastMessage: undefined,
        unreadCount: 0,
      };

      mockApiService.get.mockResolvedValue({
        data: mockConversation,
        status: 200,
        message: 'Success',
      });

      const result = await conversationsService.getConversation('1');

      expect(mockApiService.get).toHaveBeenCalledWith('/conversations/1');
      expect(result).toEqual(mockConversation);
    });
  });

  describe('createConversation', () => {
    it('should create a new conversation', async () => {
      const createData = {
        name: 'New Conversation',
        participants: ['user1', 'user2'],
        isGroup: true,
      };

      const mockCreatedConversation: Conversation = {
        id: '2',
        type: 'group',
        name: 'New Conversation',
        isGroup: true,
        isActive: true,
        participants: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        lastMessage: undefined,
        unreadCount: 0,
      };

      mockApiService.post.mockResolvedValue({
        data: mockCreatedConversation,
        status: 201,
        message: 'Created',
      });

      const result = await conversationsService.createConversation(createData);

      expect(mockApiService.post).toHaveBeenCalledWith('/conversations', createData);
      expect(result).toEqual(mockCreatedConversation);
    });

    it('should create a direct conversation', async () => {
      const createData = {
        participants: ['user1'],
      };

      const mockConversation: Conversation = {
        id: '3',
        type: 'direct',
        name: undefined,
        isGroup: false,
        isActive: true,
        participants: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        lastMessage: undefined,
        unreadCount: 0,
      };

      mockApiService.post.mockResolvedValue({
        data: mockConversation,
        status: 201,
        message: 'Created',
      });

      const result = await conversationsService.createConversation(createData);

      expect(mockApiService.post).toHaveBeenCalledWith('/conversations', createData);
      expect(result.isGroup).toBe(false);
    });
  });

  describe('deleteConversation', () => {
    it('should delete a conversation', async () => {
      mockApiService.delete.mockResolvedValue({
        data: {},
        status: 204,
        message: 'Deleted',
      });

      await conversationsService.deleteConversation('1');

      expect(mockApiService.delete).toHaveBeenCalledWith('/conversations/1');
    });
  });

  describe('sendMessage', () => {
    it('should send a message', async () => {
      const messageData = {
        content: 'Hello world',
        originalLanguage: 'en',
      };

      const mockMessage: Message = {
        id: '1',
        conversationId: '1',
        senderId: 'user1',
        content: 'Hello world',
        originalLanguage: 'en',
        isEdited: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        sender: {
          id: 'user1',
          username: 'testuser',
          email: 'test@example.com',
          phoneNumber: '',
          firstName: 'Test',
          lastName: 'User',
          role: 'USER' as const,
          permissions: {
            canAccessAdmin: false,
            canManageUsers: false,
            canManageGroups: false,
            canManageConversations: false,
            canViewAnalytics: false,
            canModerateContent: false,
            canViewAuditLogs: false,
            canManageNotifications: false,
            canManageTranslations: false,
          },
          systemLanguage: 'en',
          regionalLanguage: 'en',
          autoTranslateEnabled: true,
          translateToSystemLanguage: true,
          translateToRegionalLanguage: false,
          useCustomDestination: false,
          isOnline: true,
          createdAt: new Date(),
          lastActiveAt: new Date(),
        },
      };

      mockApiService.post.mockResolvedValue({
        data: mockMessage,
        status: 201,
        message: 'Created',
      });

      const result = await conversationsService.sendMessage('1', messageData);

      expect(mockApiService.post).toHaveBeenCalledWith('/conversations/1/messages', messageData);
      expect(result).toEqual(mockMessage);
    });
  });

  describe('markAsRead', () => {
    it('should mark conversation as read', async () => {
      mockApiService.post.mockResolvedValue({
        data: {},
        status: 200,
        message: 'Success',
      });

      await conversationsService.markAsRead('1');

      expect(mockApiService.post).toHaveBeenCalledWith('/conversations/1/read');
    });
  });

  describe('searchConversations', () => {
    it('should search conversations', async () => {
      const mockConversations: Conversation[] = [
        {
          id: '1',
          type: 'direct',
          name: 'Test Conversation',
          isGroup: false,
          isActive: true,
          participants: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessage: undefined,
          unreadCount: 0,
        },
      ];

      mockApiService.get.mockResolvedValue({
        data: mockConversations,
        status: 200,
        message: 'Success',
      });

      const result = await conversationsService.searchConversations('test');

      expect(mockApiService.get).toHaveBeenCalledWith('/conversations/search', { q: 'test' });
      expect(result).toEqual(mockConversations);
    });

    it('should handle empty search results', async () => {
      mockApiService.get.mockResolvedValue({
        data: [],
        status: 200,
        message: 'Success',
      });

      const result = await conversationsService.searchConversations('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('updateConversation', () => {
    it('should update conversation', async () => {
      const updateData = {
        name: 'Updated Conversation Name',
      };

      const mockUpdatedConversation: Conversation = {
        id: '1',
        type: 'group',
        name: 'Updated Conversation Name',
        isGroup: true,
        isActive: true,
        participants: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        lastMessage: undefined,
        unreadCount: 0,
      };

      mockApiService.patch.mockResolvedValue({
        data: mockUpdatedConversation,
        status: 200,
        message: 'Updated',
      });

      const result = await conversationsService.updateConversation('1', updateData);

      expect(mockApiService.patch).toHaveBeenCalledWith('/conversations/1', updateData);
      expect(result).toEqual(mockUpdatedConversation);
    });
  });

  describe('Error handling', () => {
    it('should propagate API errors', async () => {
      const apiError = new Error('Network error');
      mockApiService.get.mockRejectedValue(apiError);

      await expect(conversationsService.getConversations()).rejects.toThrow('Network error');
    });

    it('should handle 404 errors for specific conversation', async () => {
      const notFoundError = new Error('Conversation not found');
      mockApiService.get.mockRejectedValue(notFoundError);

      await expect(conversationsService.getConversation('nonexistent')).rejects.toThrow('Conversation not found');
    });
  });
});
