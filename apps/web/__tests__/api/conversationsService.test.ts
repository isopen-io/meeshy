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
    jest.resetAllMocks();
    // Clear internal caches to prevent test pollution
    (conversationsService as any).conversationsCache = null;
    (conversationsService as any).messagesCache?.clear();
    (conversationsService as any).participantsCache?.clear();
  });

  describe('getConversations', () => {
    it('should fetch all conversations', async () => {
      const mockConversationData = {
        id: '1',
        type: 'direct',
        title: 'Test Conversation',
        isGroup: false,
        isActive: true,
        members: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastMessage: null,
        unreadCount: 0,
      };

      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: [mockConversationData],
          pagination: { limit: 20, offset: 0, total: 1, hasMore: false }
        },
        success: true,
        message: 'Success',
      });

      const result = await conversationsService.getConversations();

      expect(mockApiService.get).toHaveBeenCalledWith('/api/conversations', { limit: '20', offset: '0' });
      expect(result.conversations).toHaveLength(1);
      expect(result.conversations[0].id).toBe('1');
    });

    it('should handle empty conversations list', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: [],
          pagination: { limit: 20, offset: 0, total: 0, hasMore: false }
        },
        success: true,
        message: 'Success',
      });

      const result = await conversationsService.getConversations();

      expect(result.conversations).toEqual([]);
    });
  });

  describe('getConversation', () => {
    it('should fetch a specific conversation', async () => {
      const mockConversationData = {
        id: '1',
        type: 'direct',
        title: 'Test Conversation',
        isGroup: false,
        isActive: true,
        members: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastMessage: null,
        unreadCount: 0,
      };

      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: mockConversationData
        },
        success: true,
        message: 'Success',
      });

      const result = await conversationsService.getConversation('1');

      expect(mockApiService.get).toHaveBeenCalledWith('/api/conversations/1');
      expect(result.id).toBe('1');
    });
  });

  describe('createConversation', () => {
    it('should create a new conversation', async () => {
      const createData = {
        name: 'New Conversation',
        participants: ['user1', 'user2'],
        isGroup: true,
      };

      const mockCreatedConversation = {
        id: '2',
        type: 'group',
        title: 'New Conversation',
        isGroup: true,
        isActive: true,
        members: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastMessage: null,
        unreadCount: 0,
      };

      mockApiService.post.mockResolvedValue({
        data: {
          success: true,
          data: mockCreatedConversation
        },
        status: 201,
        message: 'Created',
      });

      const result = await conversationsService.createConversation(createData);

      expect(mockApiService.post).toHaveBeenCalledWith('/api/conversations', createData);
      expect(result.id).toBe('2');
    });

    it('should create a direct conversation', async () => {
      const createData = {
        participants: ['user1'],
      };

      const mockConversation = {
        id: '3',
        type: 'direct',
        title: null,
        isGroup: false,
        isActive: true,
        members: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastMessage: null,
        unreadCount: 0,
      };

      mockApiService.post.mockResolvedValue({
        data: {
          success: true,
          data: mockConversation
        },
        status: 201,
        message: 'Created',
      });

      const result = await conversationsService.createConversation(createData);

      expect(mockApiService.post).toHaveBeenCalledWith('/api/conversations', createData);
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

      expect(mockApiService.delete).toHaveBeenCalledWith('/api/conversations/1');
    });
  });

  describe('sendMessage', () => {
    it('should send a message', async () => {
      const messageData = {
        content: 'Hello world',
        originalLanguage: 'en',
      };

      const mockMessage = {
        id: '1',
        conversationId: '1',
        senderId: 'user1',
        content: 'Hello world',
        originalLanguage: 'en',
        isEdited: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sender: {
          id: 'user1',
          username: 'testuser',
          email: 'test@example.com',
          phoneNumber: '',
          firstName: 'Test',
          lastName: 'User',
          role: 'USER',
          systemLanguage: 'en',
          regionalLanguage: 'en',
          isOnline: true,
        },
      };

      mockApiService.post.mockResolvedValue({
        data: {
          success: true,
          data: mockMessage
        },
        status: 201,
        message: 'Created',
      });

      const result = await conversationsService.sendMessage('1', messageData);

      expect(mockApiService.post).toHaveBeenCalledWith('/api/conversations/1/messages', messageData);
      expect(result.id).toBe('1');
    });
  });

  describe('markAsRead', () => {
    it('should mark conversation as read', async () => {
      mockApiService.post.mockResolvedValue({
        data: {},
        success: true,
        message: 'Success',
      });

      await conversationsService.markAsRead('1');

      expect(mockApiService.post).toHaveBeenCalledWith('/api/conversations/1/read');
    });
  });

  describe('searchConversations', () => {
    it('should search conversations', async () => {
      const mockConversations = [
        {
          id: '1',
          type: 'direct',
          title: 'Test Conversation',
          isGroup: false,
          isActive: true,
          members: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastMessage: null,
          unreadCount: 0,
        },
      ];

      mockApiService.get.mockResolvedValue({
        data: mockConversations,
        success: true,
        message: 'Success',
      });

      const result = await conversationsService.searchConversations('test');

      expect(mockApiService.get).toHaveBeenCalledWith('/api/conversations/search', { q: 'test' });
      expect(result).toEqual(mockConversations);
    });

    it('should handle empty search results', async () => {
      mockApiService.get.mockResolvedValue({
        data: [],
        success: true,
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

      const mockUpdatedConversation = {
        id: '1',
        type: 'group',
        title: 'Updated Conversation Name',
        isGroup: true,
        isActive: true,
        members: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastMessage: null,
        unreadCount: 0,
      };

      mockApiService.patch.mockResolvedValue({
        data: mockUpdatedConversation,
        success: true,
        message: 'Updated',
      });

      const result = await conversationsService.updateConversation('1', updateData);

      expect(mockApiService.patch).toHaveBeenCalledWith('/api/conversations/1', updateData);
      expect(result.id).toBe('1');
    });
  });

  describe('Error handling', () => {
    it('should propagate API errors', async () => {
      const apiError = new Error('Network error');
      mockApiService.get.mockRejectedValue(apiError);

      await expect(conversationsService.getConversations()).rejects.toThrow('Network error');
    });

    it('should handle 404 errors for specific conversation', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: false,
          data: null
        },
        status: 404,
        message: 'Not found',
      });

      await expect(conversationsService.getConversation('nonexistent')).rejects.toThrow('Conversation non trouvée');
    });
  });
});
