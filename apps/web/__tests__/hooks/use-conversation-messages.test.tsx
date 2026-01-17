/**
 * Tests for useConversationMessages hook
 *
 * Tests cover:
 * - Initial loading state
 * - Message loading and pagination
 * - Scroll-based infinite loading
 * - Adding new messages in real-time
 * - Updating messages
 * - Removing messages
 * - Message sorting (chronological order)
 * - Error handling
 * - Cleanup and abort controller usage
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useConversationMessages } from '@/hooks/use-conversation-messages';

// Mock API service
const mockApiGet = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: (...args: any[]) => mockApiGet(...args),
  },
}));

// Mock auth manager
const mockGetAuthToken = jest.fn(() => 'auth-token-123');
const mockGetAnonymousSession = jest.fn(() => null);

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: () => mockGetAuthToken(),
    getAnonymousSession: () => mockGetAnonymousSession(),
  },
}));

// Mock debounce to execute immediately
jest.mock('@/utils/debounce', () => ({
  debounce: (fn: Function) => fn,
}));

describe('useConversationMessages', () => {
  const mockUser = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    systemLanguage: 'en',
  };

  const mockConversationId = 'conv-456';

  const createMockMessage = (id: string, content: string, createdAt: string) => ({
    id,
    content,
    createdAt,
    senderId: 'sender-1',
    conversationId: mockConversationId,
    translations: [],
    reactions: [],
  });

  const mockMessages = [
    createMockMessage('msg-3', 'Third message', '2024-01-03T10:00:00Z'),
    createMockMessage('msg-2', 'Second message', '2024-01-02T10:00:00Z'),
    createMockMessage('msg-1', 'First message', '2024-01-01T10:00:00Z'),
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset auth token mock (important - mockReturnValue persists between tests)
    mockGetAuthToken.mockReturnValue('auth-token-123');
    mockGetAnonymousSession.mockReturnValue(null);

    // Default API response
    mockApiGet.mockResolvedValue({
      data: {
        success: true,
        data: mockMessages,
        pagination: {
          total: 10,
          offset: 0,
          limit: 20,
          hasMore: true,
        },
      },
    });

    // Suppress console warnings
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should return empty messages array initially', () => {
      const { result } = renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: false })
      );

      expect(result.current.messages).toEqual([]);
    });

    it('should return isLoading false when disabled', () => {
      const { result } = renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: false })
      );

      expect(result.current.isLoading).toBe(false);
    });

    it('should return hasMore true initially', () => {
      const { result } = renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: false })
      );

      expect(result.current.hasMore).toBe(true);
    });

    it('should return error as null initially', () => {
      const { result } = renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: false })
      );

      expect(result.current.error).toBeNull();
    });
  });

  describe('Message Loading', () => {
    it('should load messages when enabled', async () => {
      const { result } = renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.messages.length).toBe(3);
      expect(mockApiGet).toHaveBeenCalled();
    });

    it('should not load when conversationId is null', async () => {
      renderHook(() =>
        useConversationMessages(null, mockUser, { enabled: true })
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockApiGet).not.toHaveBeenCalled();
    });

    it('should not load when currentUser is null', async () => {
      renderHook(() =>
        useConversationMessages(mockConversationId, null, { enabled: true })
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockApiGet).not.toHaveBeenCalled();
    });

    it('should use correct endpoint for regular conversations', async () => {
      renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: true })
      );

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith(
          `/conversations/${mockConversationId}/messages`,
          expect.objectContaining({ limit: expect.any(String), offset: expect.any(String) }),
          undefined // No custom headers for authenticated user
        );
      });
    });

    it('should sort messages by createdAt descending', async () => {
      const { result } = renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const dates = result.current.messages.map(m => new Date(m.createdAt).getTime());

      // Should be in descending order (newest first)
      for (let i = 0; i < dates.length - 1; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
      }
    });
  });

  describe('Anonymous User Loading', () => {
    it('should use session token for anonymous users with linkId', async () => {
      mockGetAuthToken.mockReturnValue(null);
      mockGetAnonymousSession.mockReturnValue({ token: 'anon-session-token' });

      renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, {
          enabled: true,
          linkId: 'link-123',
        })
      );

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith(
          `/api/links/link-123/messages`,
          expect.any(Object),
          expect.objectContaining({
            headers: { 'x-session-token': 'anon-session-token' },
          })
        );
      });
    });
  });

  describe('Pagination', () => {
    it('should set hasMore based on API response', async () => {
      mockApiGet.mockResolvedValue({
        data: {
          success: true,
          data: mockMessages,
          pagination: {
            total: 3,
            offset: 0,
            limit: 20,
            hasMore: false,
          },
        },
      });

      const { result } = renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.hasMore).toBe(false);
      });
    });

    it('should load more messages when loadMore is called', async () => {
      const { result } = renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Clear mock to track loadMore call
      mockApiGet.mockClear();

      await act(async () => {
        await result.current.loadMore();
      });

      expect(mockApiGet).toHaveBeenCalled();
    });

    it('should not load more when hasMore is false', async () => {
      mockApiGet.mockResolvedValue({
        data: {
          success: true,
          data: mockMessages,
          pagination: { hasMore: false },
        },
      });

      const { result } = renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.hasMore).toBe(false);
      });

      mockApiGet.mockClear();

      await act(async () => {
        await result.current.loadMore();
      });

      expect(mockApiGet).not.toHaveBeenCalled();
    });
  });

  describe('Refresh', () => {
    it('should reload messages on refresh', async () => {
      const { result } = renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockApiGet.mockClear();

      await act(async () => {
        await result.current.refresh();
      });

      expect(mockApiGet).toHaveBeenCalled();
    });
  });

  describe('Clear Messages', () => {
    it('should clear all messages', async () => {
      const { result } = renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.messages.length).toBe(3);
      });

      act(() => {
        result.current.clearMessages();
      });

      expect(result.current.messages).toEqual([]);
      expect(result.current.hasMore).toBe(true);
      expect(result.current.error).toBeNull();
    });
  });

  describe('Add Message', () => {
    it('should add new message to the list', async () => {
      const { result } = renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.messages.length).toBe(3);
      });

      const newMessage = createMockMessage('msg-4', 'New message', '2024-01-04T10:00:00Z');

      act(() => {
        result.current.addMessage(newMessage);
      });

      // Check the message was added by verifying state change
      await waitFor(() => {
        expect(result.current.messages.length).toBe(4);
      });
      // New message should be at the beginning (sorted by date DESC)
      expect(result.current.messages[0].id).toBe('msg-4');
    });

    it('should not add duplicate message', async () => {
      const { result } = renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.messages.length).toBe(3);
      });

      // Try to add existing message
      const duplicateMessage = createMockMessage('msg-1', 'First message', '2024-01-01T10:00:00Z');

      let wasAdded: boolean = true;
      act(() => {
        wasAdded = result.current.addMessage(duplicateMessage);
      });

      expect(wasAdded).toBe(false);
      expect(result.current.messages.length).toBe(3);
    });
  });

  describe('Update Message', () => {
    it('should update message with partial updates', async () => {
      const { result } = renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.messages.length).toBe(3);
      });

      act(() => {
        result.current.updateMessage('msg-1', { content: 'Updated content' });
      });

      const updatedMessage = result.current.messages.find(m => m.id === 'msg-1');
      expect(updatedMessage?.content).toBe('Updated content');
    });

    it('should update message with callback function', async () => {
      const { result } = renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.messages.length).toBe(3);
      });

      act(() => {
        result.current.updateMessage('msg-1', (prev) => ({
          ...prev,
          content: `${prev.content} (edited)`,
        }));
      });

      const updatedMessage = result.current.messages.find(m => m.id === 'msg-1');
      expect(updatedMessage?.content).toBe('First message (edited)');
    });
  });

  describe('Remove Message', () => {
    it('should remove message from list', async () => {
      const { result } = renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.messages.length).toBe(3);
      });

      act(() => {
        result.current.removeMessage('msg-1');
      });

      expect(result.current.messages.length).toBe(2);
      expect(result.current.messages.find(m => m.id === 'msg-1')).toBeUndefined();
    });

    it('should handle removing non-existent message', async () => {
      const { result } = renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.messages.length).toBe(3);
      });

      act(() => {
        result.current.removeMessage('non-existent');
      });

      // Should still have 3 messages
      expect(result.current.messages.length).toBe(3);
    });
  });

  describe('Error Handling', () => {
    it('should set error on API failure', async () => {
      mockApiGet.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
      });
    });

    it('should set error when success is false', async () => {
      mockApiGet.mockResolvedValue({
        data: {
          success: false,
        },
      });

      const { result } = renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.error).toBe('Erreur lors du chargement des messages');
      });
    });

    it('should set error when auth token is missing', async () => {
      mockGetAuthToken.mockReturnValue(null);
      mockGetAnonymousSession.mockReturnValue(null);

      const { result } = renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.error).toBe("Token d'authentification manquant");
      });
    });
  });

  describe('Abort Controller', () => {
    it('should abort previous request on new load', async () => {
      const abortSpy = jest.fn();

      // Mock AbortController
      const originalAbortController = global.AbortController;
      global.AbortController = class {
        signal = { aborted: false };
        abort = abortSpy;
      } as any;

      const { result } = renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Trigger another load
      await act(async () => {
        await result.current.refresh();
      });

      // Previous request should be aborted
      expect(abortSpy).toHaveBeenCalled();

      global.AbortController = originalAbortController;
    });
  });

  describe('Options', () => {
    it('should respect custom limit option', async () => {
      // Ensure clean state before the test
      mockApiGet.mockClear();

      // Use a unique conversation ID to force fresh state
      const uniqueConvId = `conv-options-test`;

      renderHook(() =>
        useConversationMessages(uniqueConvId, mockUser, {
          enabled: true,
          limit: 50,
        })
      );

      // Wait for the API to be called
      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalled();
      }, { timeout: 3000 });

      // Verify the API was called with the custom limit
      const callArgs = mockApiGet.mock.calls[0];
      expect(callArgs[0]).toContain('/messages');
      expect(callArgs[1]).toEqual(expect.objectContaining({ limit: '50' }));
    });

    it('should not load when enabled is false', async () => {
      renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: false })
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockApiGet).not.toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should abort request on unmount', async () => {
      const abortSpy = jest.fn();

      const originalAbortController = global.AbortController;
      global.AbortController = class {
        signal = { aborted: false };
        abort = abortSpy;
      } as any;

      const { unmount } = renderHook(() =>
        useConversationMessages(mockConversationId, mockUser, { enabled: true })
      );

      unmount();

      expect(abortSpy).toHaveBeenCalled();

      global.AbortController = originalAbortController;
    });
  });
});
