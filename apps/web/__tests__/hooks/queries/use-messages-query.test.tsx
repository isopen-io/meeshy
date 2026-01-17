/**
 * Tests for useMessagesQuery and related hooks
 *
 * Tests cover:
 * - useMessagesQuery: Basic query, loading, error, success states
 * - useInfiniteMessagesQuery: Infinite scrolling pagination
 * - useMessagesQueryHelpers: Cache manipulation helpers
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useMessagesQuery,
  useInfiniteMessagesQuery,
  useMessagesQueryHelpers,
} from '@/hooks/queries/use-messages-query';
import type { Message } from '@meeshy/shared/types';

// Mock the conversations service
const mockGetMessages = jest.fn();

jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getMessages: (...args: unknown[]) => mockGetMessages(...args),
  },
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
const createMockMessage = (id: string, content: string): Message => ({
  id,
  content,
  conversationId: 'conv-1',
  senderId: 'user-1',
  originalLanguage: 'en',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  isDeleted: false,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
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

const mockMessages = [
  createMockMessage('msg-1', 'Hello'),
  createMockMessage('msg-2', 'World'),
  createMockMessage('msg-3', 'Test'),
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

describe('useMessagesQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading State', () => {
    it('should return isLoading true initially', () => {
      mockGetMessages.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useMessagesQuery('conv-1'), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });
  });

  describe('Success State', () => {
    it('should return messages on success', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(() => useMessagesQuery('conv-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(3);
      expect(result.current.data?.[0].id).toBe('msg-1');
    });

    it('should use select to extract messages array', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(() => useMessagesQuery('conv-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // The select function extracts just the messages array
      expect(Array.isArray(result.current.data)).toBe(true);
    });
  });

  describe('Error State', () => {
    it('should return error on failure', async () => {
      const testError = new Error('Failed to fetch messages');
      mockGetMessages.mockRejectedValue(testError);

      const { result } = renderHook(() => useMessagesQuery('conv-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });
  });

  describe('Conditional Fetching', () => {
    it('should not fetch when conversationId is null', () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(() => useMessagesQuery(null), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe('idle');
      expect(mockGetMessages).not.toHaveBeenCalled();
    });

    it('should not fetch when conversationId is undefined', () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(() => useMessagesQuery(undefined), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe('idle');
      expect(mockGetMessages).not.toHaveBeenCalled();
    });

    it('should not fetch when enabled is false', () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(
        () => useMessagesQuery('conv-1', { enabled: false }),
        { wrapper: createWrapper() }
      );

      expect(result.current.fetchStatus).toBe('idle');
      expect(mockGetMessages).not.toHaveBeenCalled();
    });

    it('should fetch when conversationId is provided and enabled', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(() => useMessagesQuery('conv-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockGetMessages).toHaveBeenCalledWith('conv-1', 1, 20);
    });
  });

  describe('Options', () => {
    it('should pass custom limit to service', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      renderHook(() => useMessagesQuery('conv-1', { limit: 50 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalled();
      });

      expect(mockGetMessages).toHaveBeenCalledWith('conv-1', 1, 50);
    });
  });
});

describe('useInfiniteMessagesQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch first page', async () => {
    mockGetMessages.mockResolvedValue(mockMessagesResponse);

    const { result } = renderHook(() => useInfiniteMessagesQuery('conv-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.pages).toHaveLength(1);
    expect(result.current.data?.messages).toHaveLength(3);
  });

  it('should determine hasNextPage from response', async () => {
    mockGetMessages.mockResolvedValue({
      ...mockMessagesResponse,
      hasMore: true,
    });

    const { result } = renderHook(() => useInfiniteMessagesQuery('conv-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.hasNextPage).toBe(true);
  });

  it('should not have next page when hasMore is false', async () => {
    mockGetMessages.mockResolvedValue({
      ...mockMessagesResponse,
      hasMore: false,
    });

    const { result } = renderHook(() => useInfiniteMessagesQuery('conv-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.hasNextPage).toBe(false);
  });

  it('should fetch next page with incremented page number', async () => {
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

    const { result } = renderHook(() => useInfiniteMessagesQuery('conv-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.hasNextPage).toBe(true);
    });

    // Fetch next page
    await act(async () => {
      result.current.fetchNextPage();
    });

    await waitFor(() => {
      expect(mockGetMessages).toHaveBeenCalledTimes(2);
    });

    // Second call should be page 2
    expect(mockGetMessages).toHaveBeenLastCalledWith('conv-1', 2, 20);
  });

  it('should not fetch when conversationId is null', () => {
    mockGetMessages.mockResolvedValue(mockMessagesResponse);

    const { result } = renderHook(() => useInfiniteMessagesQuery(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetMessages).not.toHaveBeenCalled();
  });

  it('should flatten messages in select function', async () => {
    mockGetMessages.mockResolvedValue(mockMessagesResponse);

    const { result } = renderHook(() => useInfiniteMessagesQuery('conv-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // The select function flattens messages from all pages
    expect(result.current.data?.messages).toBeDefined();
    expect(Array.isArray(result.current.data?.messages)).toBe(true);
  });
});

describe('useMessagesQueryHelpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addMessageToCache', () => {
    it('should add message to first page of infinite query', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      // Pre-populate cache with infinite query structure
      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: mockMessages, hasMore: false, total: 3 }],
        pageParams: [1],
      });

      const { result } = renderHook(() => useMessagesQueryHelpers('conv-1'), {
        wrapper,
      });

      const newMessage = createMockMessage('msg-new', 'New message');

      act(() => {
        result.current.addMessageToCache(newMessage);
      });

      const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as {
        pages: { messages: Message[] }[];
      };

      expect(cachedData.pages[0].messages[0].id).toBe('msg-new');
      expect(cachedData.pages[0].messages).toHaveLength(4);
    });

    it('should add message to simple query cache', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      // Pre-populate simple cache
      queryClient.setQueryData(['messages', 'list', 'conv-1'], mockMessages);

      const { result } = renderHook(() => useMessagesQueryHelpers('conv-1'), {
        wrapper,
      });

      const newMessage = createMockMessage('msg-new', 'New message');

      act(() => {
        result.current.addMessageToCache(newMessage);
      });

      const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1']) as Message[];

      expect(cachedData[0].id).toBe('msg-new');
      expect(cachedData).toHaveLength(4);
    });
  });

  describe('updateMessageInCache', () => {
    it('should update message in infinite query cache', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      // Pre-populate cache
      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: mockMessages, hasMore: false, total: 3 }],
        pageParams: [1],
      });

      const { result } = renderHook(() => useMessagesQueryHelpers('conv-1'), {
        wrapper,
      });

      act(() => {
        result.current.updateMessageInCache('msg-1', { content: 'Updated content' });
      });

      const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as {
        pages: { messages: Message[] }[];
      };

      const updatedMessage = cachedData.pages[0].messages.find((m) => m.id === 'msg-1');
      expect(updatedMessage?.content).toBe('Updated content');
    });

    it('should preserve other message properties when updating', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: mockMessages, hasMore: false, total: 3 }],
        pageParams: [1],
      });

      const { result } = renderHook(() => useMessagesQueryHelpers('conv-1'), {
        wrapper,
      });

      act(() => {
        result.current.updateMessageInCache('msg-1', { isEdited: true });
      });

      const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as {
        pages: { messages: Message[] }[];
      };

      const updatedMessage = cachedData.pages[0].messages.find((m) => m.id === 'msg-1');
      expect(updatedMessage?.content).toBe('Hello'); // Preserved
      expect(updatedMessage?.isEdited).toBe(true); // Updated
    });
  });

  describe('removeMessageFromCache', () => {
    it('should remove message from infinite query cache', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: mockMessages, hasMore: false, total: 3 }],
        pageParams: [1],
      });

      const { result } = renderHook(() => useMessagesQueryHelpers('conv-1'), {
        wrapper,
      });

      act(() => {
        result.current.removeMessageFromCache('msg-1');
      });

      const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']) as {
        pages: { messages: Message[] }[];
      };

      expect(cachedData.pages[0].messages).toHaveLength(2);
      expect(cachedData.pages[0].messages.find((m) => m.id === 'msg-1')).toBeUndefined();
    });
  });

  describe('invalidateMessages', () => {
    it('should invalidate both list and infinite queries', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      // Pre-populate caches
      queryClient.setQueryData(['messages', 'list', 'conv-1'], mockMessages);
      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: mockMessages, hasMore: false, total: 3 }],
        pageParams: [1],
      });

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useMessagesQueryHelpers('conv-1'), {
        wrapper,
      });

      act(() => {
        result.current.invalidateMessages();
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['messages', 'list', 'conv-1'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['messages', 'list', 'conv-1', 'infinite'],
      });
    });
  });
});
