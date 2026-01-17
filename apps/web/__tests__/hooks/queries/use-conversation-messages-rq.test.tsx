/**
 * Tests for useConversationMessagesRQ hook
 *
 * Tests cover:
 * - Query loading, success, error states
 * - Message loading with pagination
 * - Cache manipulation (add, update, remove messages)
 * - Anonymous user support via linkId
 * - Infinite scroll behavior
 * - Auto-fill behavior
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useConversationMessagesRQ } from '@/hooks/queries/use-conversation-messages-rq';
import type { Message, User } from '@meeshy/shared/types';

// Mock the conversations service
const mockGetMessages = jest.fn();

jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getMessages: (...args: unknown[]) => mockGetMessages(...args),
  },
}));

// Mock the anonymous chat service
const mockLoadMessages = jest.fn();

jest.mock('@/services/anonymous-chat.service', () => ({
  AnonymousChatService: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    loadMessages: (...args: unknown[]) => mockLoadMessages(...args),
  })),
}));

// Mock query keys
jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    messages: {
      all: ['messages'],
      lists: () => ['messages', 'list'],
      list: (conversationId: string) => ['messages', 'list', conversationId],
      infinite: (conversationId: string) => ['messages', 'list', conversationId, 'infinite'],
    },
  },
}));

// Test data
const createMockMessage = (id: string, content: string, createdAt = new Date('2024-01-01')): Message => ({
  id,
  content,
  conversationId: 'conv-1',
  senderId: 'user-1',
  originalLanguage: 'en',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  isDeleted: false,
  createdAt,
  updatedAt: createdAt,
  sender: {
    id: 'user-1',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    displayName: 'Test User',
    email: 'test@example.com',
    phoneNumber: '',
    role: 'USER',
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
    autoTranslateEnabled: false,
    translateToSystemLanguage: false,
    translateToRegionalLanguage: false,
    useCustomDestination: false,
    isOnline: true,
    createdAt: new Date(),
    lastActiveAt: new Date(),
    isActive: true,
    updatedAt: new Date(),
  },
  translations: [],
});

const mockUser: User = {
  id: 'user-1',
  username: 'testuser',
  firstName: 'Test',
  lastName: 'User',
  displayName: 'Test User',
  email: 'test@example.com',
  phoneNumber: '',
  role: 'USER',
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
  autoTranslateEnabled: false,
  translateToSystemLanguage: false,
  translateToRegionalLanguage: false,
  useCustomDestination: false,
  isOnline: true,
  createdAt: new Date(),
  lastActiveAt: new Date(),
  isActive: true,
  updatedAt: new Date(),
};

const mockMessages = [
  createMockMessage('msg-1', 'Hello', new Date('2024-01-03')),
  createMockMessage('msg-2', 'World', new Date('2024-01-02')),
  createMockMessage('msg-3', 'Test', new Date('2024-01-01')),
];

const mockMessagesResponse = {
  messages: mockMessages,
  hasMore: false,
  total: 3,
};

// Helper to create a wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

// Helper to get access to QueryClient in tests
function createWrapperWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });

  const wrapper = function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };

  return { wrapper, queryClient };
}

describe('useConversationMessagesRQ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should return loading state initially', () => {
      mockGetMessages.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      expect(result.current.isLoading).toBe(true);
      expect(result.current.messages).toEqual([]);
    });

    it('should not fetch when conversationId is null', () => {
      const { result } = renderHook(
        () => useConversationMessagesRQ(null, mockUser),
        { wrapper: createWrapper() }
      );

      expect(result.current.isLoading).toBe(false);
      expect(mockGetMessages).not.toHaveBeenCalled();
    });

    it('should not fetch when enabled is false', () => {
      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser, { enabled: false }),
        { wrapper: createWrapper() }
      );

      expect(mockGetMessages).not.toHaveBeenCalled();
    });
  });

  describe('Data Fetching', () => {
    it('should fetch messages for authenticated users', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetMessages).toHaveBeenCalledWith('conv-1', 1, 20);
      expect(result.current.messages).toHaveLength(3);
    });

    it('should fetch messages for anonymous users via linkId', async () => {
      mockLoadMessages.mockResolvedValue({
        messages: mockMessages,
        hasMore: false,
        total: 3,
      });

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', null, { linkId: 'link-123' }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockLoadMessages).toHaveBeenCalled();
    });

    it('should sort messages by createdAt DESC', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Messages should be sorted newest first
      expect(result.current.messages[0].id).toBe('msg-1');
      expect(result.current.messages[2].id).toBe('msg-3');
    });
  });

  describe('Pagination', () => {
    it('should determine hasMore from response', async () => {
      mockGetMessages.mockResolvedValue({
        ...mockMessagesResponse,
        hasMore: true,
      });

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMore).toBe(true);
    });

    it('should load more messages when loadMore is called', async () => {
      // First page
      mockGetMessages.mockResolvedValueOnce({
        messages: mockMessages,
        hasMore: true,
        total: 6,
      });

      // Second page
      mockGetMessages.mockResolvedValueOnce({
        messages: [createMockMessage('msg-4', 'Page 2')],
        hasMore: false,
        total: 6,
      });

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Load more
      await act(async () => {
        await result.current.loadMore();
      });

      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThan(3);
      });
    });

    it('should use custom limit', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser, { limit: 50 }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalledWith('conv-1', 1, 50);
      });
    });
  });

  describe('Cache Manipulation', () => {
    it('should add message to cache', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const newMessage = createMockMessage('msg-new', 'New message', new Date('2024-01-04'));

      act(() => {
        const wasAdded = result.current.addMessage(newMessage);
        expect(wasAdded).toBe(true);
      });

      await waitFor(() => {
        expect(result.current.messages.find((m) => m.id === 'msg-new')).toBeDefined();
      });
    });

    it('should not add duplicate message', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Try to add existing message
      act(() => {
        const wasAdded = result.current.addMessage(mockMessages[0]);
        expect(wasAdded).toBe(false);
      });
    });

    it('should update message in cache', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.updateMessage('msg-1', { content: 'Updated content' });
      });

      await waitFor(() => {
        const updatedMessage = result.current.messages.find((m) => m.id === 'msg-1');
        expect(updatedMessage?.content).toBe('Updated content');
      });
    });

    it('should update message using function updater', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.updateMessage('msg-1', (prev) => ({
          ...prev,
          content: `${prev.content} (edited)`,
          isEdited: true,
        }));
      });

      await waitFor(() => {
        const updatedMessage = result.current.messages.find((m) => m.id === 'msg-1');
        expect(updatedMessage?.content).toBe('Hello (edited)');
        expect(updatedMessage?.isEdited).toBe(true);
      });
    });

    it('should remove message from cache', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.removeMessage('msg-1');
      });

      await waitFor(() => {
        expect(result.current.messages.find((m) => m.id === 'msg-1')).toBeUndefined();
        expect(result.current.messages).toHaveLength(2);
      });
    });

    it('should clear messages from cache', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { wrapper, queryClient } = createWrapperWithClient();

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.clearMessages();
      });

      // Cache should be cleared
      const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']);
      expect(cachedData).toBeUndefined();
    });
  });

  describe('Refresh', () => {
    it('should refetch messages on refresh', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockGetMessages.mockClear();

      await act(async () => {
        await result.current.refresh();
      });

      expect(mockGetMessages).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should return error message on failure', async () => {
      mockGetMessages.mockRejectedValue(new Error('Failed to fetch'));

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to fetch');
      });
    });
  });

  describe('Conversation Change', () => {
    it('should fetch new messages when conversationId changes', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result, rerender } = renderHook(
        ({ conversationId }) => useConversationMessagesRQ(conversationId, mockUser),
        {
          wrapper: createWrapper(),
          initialProps: { conversationId: 'conv-1' },
        }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetMessages).toHaveBeenCalledWith('conv-1', 1, 20);

      mockGetMessages.mockClear();

      // Change conversation
      rerender({ conversationId: 'conv-2' });

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalledWith('conv-2', 1, 20);
      });
    });
  });
});
