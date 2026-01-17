/**
 * Tests for ConversationsService
 *
 * Tests conversation CRUD operations, message handling, participant management,
 * and caching logic
 */

import { conversationsService, ConversationsService } from '@/services/conversations.service';
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

// Mock auth-manager
jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getCurrentUser: jest.fn(() => ({ systemLanguage: 'fr' })),
  },
}));

// Mock link-name-generator
jest.mock('@/utils/link-name-generator', () => ({
  generateLinkName: jest.fn(() => 'Generated Link Name'),
}));

// Mock user-adapter
jest.mock('@/utils/user-adapter', () => ({
  socketIOUserToUser: jest.fn((user) => user),
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
    const mockConversationData = {
      id: 'conv-123',
      type: 'direct',
      title: 'Test Conversation',
      isGroup: false,
      isActive: true,
      members: [
        {
          id: 'member-1',
          conversationId: 'conv-123',
          userId: 'user-1',
          role: 'MEMBER',
          user: { id: 'user-1', username: 'john' },
          joinedAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastMessage: null,
      unreadCount: 0,
    };

    it('should fetch all conversations with pagination', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: [mockConversationData],
          pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
        },
        success: true,
        message: 'Success',
      });

      const result = await conversationsService.getConversations();

      expect(mockApiService.get).toHaveBeenCalledWith('/conversations', {
        limit: '20',
        offset: '0',
      });
      expect(result.conversations).toHaveLength(1);
      expect(result.conversations[0].id).toBe('conv-123');
      expect(result.pagination).toEqual({
        limit: 20,
        offset: 0,
        total: 1,
        hasMore: false,
      });
    });

    it('should handle empty conversations list', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: [],
          pagination: { limit: 20, offset: 0, total: 0, hasMore: false },
        },
        success: true,
        message: 'Success',
      });

      const result = await conversationsService.getConversations();

      expect(result.conversations).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });

    it('should use cache on subsequent calls', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: [mockConversationData],
          pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
        },
        success: true,
      });

      // First call
      await conversationsService.getConversations();
      // Second call should use cache
      await conversationsService.getConversations();

      // API should only be called once due to caching
      expect(mockApiService.get).toHaveBeenCalledTimes(1);
    });

    it('should skip cache when skipCache option is true', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: [mockConversationData],
          pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
        },
        success: true,
      });

      await conversationsService.getConversations();
      await conversationsService.getConversations({ skipCache: true });

      expect(mockApiService.get).toHaveBeenCalledTimes(2);
    });

    it('should filter by conversation type', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: [],
          pagination: { limit: 20, offset: 0, total: 0, hasMore: false },
        },
        success: true,
      });

      await conversationsService.getConversations({ type: 'group', skipCache: true });

      expect(mockApiService.get).toHaveBeenCalledWith('/conversations', {
        limit: '20',
        offset: '0',
        type: 'group',
      });
    });

    it('should filter by user ID', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: [],
          pagination: { limit: 20, offset: 0, total: 0, hasMore: false },
        },
        success: true,
      });

      await conversationsService.getConversations({ withUserId: 'user-123', skipCache: true });

      expect(mockApiService.get).toHaveBeenCalledWith('/conversations', {
        limit: '20',
        offset: '0',
        withUserId: 'user-123',
      });
    });
  });

  describe('getConversation', () => {
    it('should fetch a specific conversation', async () => {
      const mockConversation = {
        id: 'conv-123',
        type: 'direct',
        title: 'Test Conversation',
        members: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: mockConversation,
        },
        success: true,
      });

      const result = await conversationsService.getConversation('conv-123');

      expect(mockApiService.get).toHaveBeenCalledWith('/conversations/conv-123');
      expect(result.id).toBe('conv-123');
    });

    it('should throw when conversation not found', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: false,
          data: null,
        },
        success: false,
      });

      await expect(conversationsService.getConversation('nonexistent')).rejects.toThrow(
        'Conversation non trouvée'
      );
    });
  });

  describe('createConversation', () => {
    it('should create a new group conversation', async () => {
      const createData = {
        name: 'New Group',
        participants: ['user1', 'user2'],
        type: 'group' as const,
      };

      const mockCreatedConversation = {
        id: 'conv-new',
        type: 'group',
        title: 'New Group',
        members: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockApiService.post.mockResolvedValue({
        data: {
          success: true,
          data: mockCreatedConversation,
        },
        success: true,
      });

      const result = await conversationsService.createConversation(createData);

      expect(mockApiService.post).toHaveBeenCalledWith('/conversations', createData);
      expect(result.id).toBe('conv-new');
    });

    it('should create a direct conversation', async () => {
      const createData = {
        participants: ['user1'],
        type: 'direct' as const,
      };

      mockApiService.post.mockResolvedValue({
        data: {
          success: true,
          data: {
            id: 'conv-direct',
            type: 'direct',
            members: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
        success: true,
      });

      const result = await conversationsService.createConversation(createData);

      expect(result.type).toBe('direct');
    });

    it('should throw on creation error', async () => {
      mockApiService.post.mockResolvedValue({
        data: null,
        success: false,
      });

      await expect(
        conversationsService.createConversation({
          participants: [],
          type: 'direct',
        })
      ).rejects.toThrow('Erreur lors de la création de la conversation');
    });
  });

  describe('deleteConversation', () => {
    it('should delete a conversation', async () => {
      mockApiService.delete.mockResolvedValue({
        data: {},
        success: true,
      });

      await conversationsService.deleteConversation('conv-123');

      expect(mockApiService.delete).toHaveBeenCalledWith('/conversations/conv-123');
    });
  });

  describe('getMessages', () => {
    const mockMessageData = {
      id: 'msg-123',
      conversationId: 'conv-123',
      senderId: 'user-1',
      content: 'Hello world',
      originalLanguage: 'en',
      messageType: 'text',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sender: {
        id: 'user-1',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
      },
    };

    it('should fetch messages with pagination', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: [mockMessageData],
          pagination: { total: 1, offset: 0, limit: 20, hasMore: false },
        },
        success: true,
      });

      const result = await conversationsService.getMessages('conv-123', 1, 20);

      expect(mockApiService.get).toHaveBeenCalledWith(
        '/conversations/conv-123/messages',
        { offset: 0, limit: 20 },
        expect.any(Object)
      );
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].id).toBe('msg-123');
    });

    it('should handle empty messages response', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: [],
          pagination: { total: 0, offset: 0, limit: 20, hasMore: false },
        },
        success: true,
      });

      const result = await conversationsService.getMessages('conv-123');

      expect(result.messages).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should return empty array on invalid response', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: false,
        },
        success: false,
      });

      const result = await conversationsService.getMessages('conv-123');

      expect(result.messages).toEqual([]);
    });
  });

  describe('sendMessage', () => {
    it('should send a message', async () => {
      const messageData = {
        content: 'Hello world',
        originalLanguage: 'en',
      };

      const mockMessage = {
        id: 'msg-new',
        conversationId: 'conv-123',
        senderId: 'user-1',
        content: 'Hello world',
        originalLanguage: 'en',
        createdAt: new Date().toISOString(),
      };

      mockApiService.post.mockResolvedValue({
        data: {
          success: true,
          data: mockMessage,
        },
        success: true,
      });

      const result = await conversationsService.sendMessage('conv-123', messageData);

      expect(mockApiService.post).toHaveBeenCalledWith('/conversations/conv-123/messages', messageData);
      expect(result.id).toBe('msg-new');
    });

    it('should throw on send error', async () => {
      mockApiService.post.mockResolvedValue({
        data: null,
        success: false,
      });

      await expect(
        conversationsService.sendMessage('conv-123', { content: 'test', originalLanguage: 'en' })
      ).rejects.toThrow("Erreur lors de l'envoi du message");
    });
  });

  describe('markAsRead', () => {
    it('should mark conversation as read', async () => {
      mockApiService.post.mockResolvedValue({
        data: {},
        success: true,
      });

      await conversationsService.markAsRead('conv-123');

      expect(mockApiService.post).toHaveBeenCalledWith('/conversations/conv-123/read');
    });
  });

  describe('Participant management', () => {
    it('should add participant', async () => {
      mockApiService.post.mockResolvedValue({
        data: {},
        success: true,
      });

      await conversationsService.addParticipant('conv-123', 'user-456');

      expect(mockApiService.post).toHaveBeenCalledWith('/conversations/conv-123/participants', {
        userId: 'user-456',
      });
    });

    it('should remove participant', async () => {
      mockApiService.delete.mockResolvedValue({
        data: {},
        success: true,
      });

      await conversationsService.removeParticipant('conv-123', 'user-456');

      expect(mockApiService.delete).toHaveBeenCalledWith(
        '/conversations/conv-123/participants/user-456'
      );
    });

    it('should update participant role', async () => {
      mockApiService.patch.mockResolvedValue({
        data: {},
        success: true,
      });

      await conversationsService.updateParticipantRole('conv-123', 'user-456', 'ADMIN');

      expect(mockApiService.patch).toHaveBeenCalledWith(
        '/conversations/conv-123/participants/user-456/role',
        { role: 'ADMIN' }
      );
    });

    it('should get participants with caching', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: [{ id: 'user-1', username: 'john' }],
        },
        success: true,
      });

      // First call
      await conversationsService.getParticipants('conv-123');
      // Second call should use cache
      await conversationsService.getParticipants('conv-123');

      // API should only be called once due to caching
      expect(mockApiService.get).toHaveBeenCalledTimes(1);
    });

    it('should filter participants by online status', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: [],
        },
        success: true,
      });

      await conversationsService.getParticipants('conv-123', { onlineOnly: true });

      expect(mockApiService.get).toHaveBeenCalledWith(
        '/conversations/conv-123/participants',
        expect.objectContaining({ onlineOnly: 'true' })
      );
    });
  });

  describe('searchConversations', () => {
    it('should search conversations', async () => {
      const mockConversations = [
        {
          id: 'conv-1',
          type: 'direct',
          title: 'Test Search Result',
        },
      ];

      mockApiService.get.mockResolvedValue({
        data: mockConversations,
        success: true,
      });

      const result = await conversationsService.searchConversations('test');

      expect(mockApiService.get).toHaveBeenCalledWith('/api/conversations/search', { q: 'test' });
      expect(result).toEqual(mockConversations);
    });

    it('should handle empty search results', async () => {
      mockApiService.get.mockResolvedValue({
        data: [],
        success: true,
      });

      const result = await conversationsService.searchConversations('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('updateConversation', () => {
    it('should update conversation', async () => {
      const updateData = {
        title: 'Updated Conversation Name',
      };

      mockApiService.patch.mockResolvedValue({
        data: {
          id: 'conv-123',
          title: 'Updated Conversation Name',
        },
        success: true,
      });

      const result = await conversationsService.updateConversation('conv-123', updateData);

      expect(mockApiService.patch).toHaveBeenCalledWith('/conversations/conv-123', updateData);
      expect(result.title).toBe('Updated Conversation Name');
    });

    it('should throw on update error', async () => {
      mockApiService.patch.mockResolvedValue({
        data: null,
        success: false,
      });

      await expect(
        conversationsService.updateConversation('conv-123', { title: 'test' })
      ).rejects.toThrow('Erreur lors de la mise à jour de la conversation');
    });
  });

  describe('createInviteLink', () => {
    it('should create invite link', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: { id: 'conv-123', title: 'Test Conversation' },
        },
        success: true,
      });

      mockApiService.post.mockResolvedValue({
        data: {
          success: true,
          data: {
            link: 'https://meeshy.me/join/abc123',
            code: 'abc123',
            shareLink: {},
          },
        },
        success: true,
      });

      const result = await conversationsService.createInviteLink('conv-123');

      expect(result).toBe('https://meeshy.me/join/abc123');
    });

    it('should handle 403 error for non-members', async () => {
      mockApiService.get.mockResolvedValue({
        data: { success: true, data: { id: 'conv-123', title: 'Test' } },
        success: true,
      });

      const error: any = new Error('Acces non autorise');
      error.status = 403;
      mockApiService.post.mockRejectedValue(error);

      await expect(conversationsService.createInviteLink('conv-123')).rejects.toThrow(
        "Vous n'avez pas les permissions nécessaires pour créer un lien de partage."
      );
    });
  });

  describe('markConversationAsRead', () => {
    it('should mark all messages as read', async () => {
      mockApiService.post.mockResolvedValue({
        data: {
          success: true,
          message: 'Messages marked as read',
          markedCount: 5,
        },
        success: true,
      });

      const result = await conversationsService.markConversationAsRead('conv-123');

      expect(mockApiService.post).toHaveBeenCalledWith('/conversations/conv-123/mark-read', {});
      expect(result.markedCount).toBe(5);
    });
  });

  describe('getConversationsWithUser', () => {
    it('should get direct conversations with specific user', async () => {
      mockApiService.get.mockResolvedValue({
        data: {
          success: true,
          data: [
            {
              id: 'conv-1',
              type: 'direct',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              members: [],
            },
          ],
          pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
        },
        success: true,
      });

      const result = await conversationsService.getConversationsWithUser('user-456');

      expect(mockApiService.get).toHaveBeenCalledWith('/conversations', {
        limit: '20',
        offset: '0',
        type: 'direct',
        withUserId: 'user-456',
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('Error handling', () => {
    it('should propagate API errors', async () => {
      const apiError = new Error('Network error');
      mockApiService.get.mockRejectedValue(apiError);

      await expect(conversationsService.getConversations({ skipCache: true })).rejects.toThrow(
        'Network error'
      );
    });
  });

  describe('Type conversions', () => {
    it('should correctly map conversation types', async () => {
      // Only test types that the service actually transforms
      const testCases = [
        { input: 'public', expected: 'broadcast' },
        { input: 'global', expected: 'broadcast' },
        { input: 'group', expected: 'group' },
        { input: 'direct', expected: 'direct' },
      ];

      for (const testCase of testCases) {
        mockApiService.get.mockResolvedValue({
          data: {
            success: true,
            data: [
              {
                id: 'conv-test',
                type: testCase.input,
                members: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
            pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
          },
          success: true,
        });

        const result = await conversationsService.getConversations({ skipCache: true });
        expect(result.conversations[0].type).toBe(testCase.expected);
      }
    });
  });
});
