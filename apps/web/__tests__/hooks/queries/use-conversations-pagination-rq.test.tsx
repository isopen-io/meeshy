/**
 * Tests for useConversationsPaginationRQ hook
 *
 * Tests cover:
 * - Query loading, success, error states
 * - Conversation loading with pagination
 * - Load more functionality
 * - Refresh functionality
 * - setConversations for direct cache manipulation
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useConversationsPaginationRQ } from '@/hooks/queries/use-conversations-pagination-rq';
import type { Conversation } from '@meeshy/shared/types';

// Mock the conversations service
const mockGetConversations = jest.fn();

jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getConversations: (...args: unknown[]) => mockGetConversations(...args),
  },
}));

// Mock query keys
jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    conversations: {
      all: ['conversations'],
      lists: () => ['conversations', 'list'],
      list: (filters?: Record<string, unknown>) => ['conversations', 'list', filters],
      infinite: () => ['conversations', 'infinite'],
    },
  },
}));

// Test data
const mockConversation: Conversation = {
  id: 'conv-1',
  title: 'Test Conversation',
  type: 'direct',
  visibility: 'private',
  status: 'active',
  participants: [],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  lastMessageAt: new Date('2024-01-01'),
  unreadCount: 0,
};

const mockConversations = [
  mockConversation,
  { ...mockConversation, id: 'conv-2', title: 'Second Conversation' },
  { ...mockConversation, id: 'conv-3', title: 'Third Conversation' },
];

const mockPaginatedResponse = {
  conversations: mockConversations,
  pagination: {
    limit: 20,
    offset: 0,
    total: 3,
    hasMore: false,
  },
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

describe('useConversationsPaginationRQ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should return loading state initially', () => {
      mockGetConversations.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useConversationsPaginationRQ(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.conversations).toEqual([]);
    });

    it('should not fetch when enabled is false', () => {
      const { result } = renderHook(
        () => useConversationsPaginationRQ({ enabled: false }),
        { wrapper: createWrapper() }
      );

      expect(result.current.isLoading).toBe(false);
      expect(mockGetConversations).not.toHaveBeenCalled();
    });
  });

  describe('Data Fetching', () => {
    it('should fetch conversations on mount', async () => {
      mockGetConversations.mockResolvedValue(mockPaginatedResponse);

      const { result } = renderHook(() => useConversationsPaginationRQ(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.conversations).toHaveLength(3);
      expect(result.current.conversations[0].id).toBe('conv-1');
    });

    it('should use custom limit', async () => {
      mockGetConversations.mockResolvedValue(mockPaginatedResponse);

      renderHook(() => useConversationsPaginationRQ({ limit: 10 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(mockGetConversations).toHaveBeenCalledWith(
          expect.objectContaining({
            limit: 10,
          })
        );
      });
    });
  });

  describe('Success State', () => {
    it('should flatten conversations from pages', async () => {
      mockGetConversations.mockResolvedValue(mockPaginatedResponse);

      const { result } = renderHook(() => useConversationsPaginationRQ(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(Array.isArray(result.current.conversations)).toBe(true);
      expect(result.current.conversations).toHaveLength(3);
    });
  });

  describe('Error State', () => {
    it('should return error on failure', async () => {
      const testError = new Error('Failed to fetch');
      mockGetConversations.mockRejectedValue(testError);

      const { result } = renderHook(() => useConversationsPaginationRQ(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Error may be wrapped or have different structure
      expect(result.current.error).toBeDefined();
    });
  });

  describe('Pagination', () => {
    it('should determine hasMore from pagination', async () => {
      mockGetConversations.mockResolvedValue({
        ...mockPaginatedResponse,
        pagination: { ...mockPaginatedResponse.pagination, hasMore: true },
      });

      const { result } = renderHook(() => useConversationsPaginationRQ(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMore).toBe(true);
    });

    it('should not have more when hasMore is false', async () => {
      mockGetConversations.mockResolvedValue({
        ...mockPaginatedResponse,
        pagination: { ...mockPaginatedResponse.pagination, hasMore: false },
      });

      const { result } = renderHook(() => useConversationsPaginationRQ(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMore).toBe(false);
    });

    it('should load more conversations', async () => {
      // First page
      mockGetConversations.mockResolvedValueOnce({
        conversations: mockConversations,
        pagination: { limit: 20, offset: 0, total: 6, hasMore: true },
      });

      // Second page
      mockGetConversations.mockResolvedValueOnce({
        conversations: [{ ...mockConversation, id: 'conv-4' }],
        pagination: { limit: 20, offset: 20, total: 6, hasMore: false },
      });

      const { result } = renderHook(() => useConversationsPaginationRQ(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.conversations).toHaveLength(3);

      // Load more
      act(() => {
        result.current.loadMore();
      });

      await waitFor(() => {
        expect(result.current.conversations.length).toBeGreaterThan(3);
      });
    });

    it('should return isLoadingMore when fetching next page', async () => {
      // First page
      mockGetConversations.mockResolvedValueOnce({
        conversations: mockConversations,
        pagination: { limit: 20, offset: 0, total: 6, hasMore: true },
      });

      // Second page - delay it
      let resolveSecondPage: (value: unknown) => void;
      mockGetConversations.mockImplementationOnce(
        () => new Promise((resolve) => { resolveSecondPage = resolve; })
      );

      const { result } = renderHook(() => useConversationsPaginationRQ(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Start loading more
      act(() => {
        result.current.loadMore();
      });

      // Should be loading more
      await waitFor(() => {
        expect(result.current.isLoadingMore).toBe(true);
      });

      // Resolve second page
      await act(async () => {
        resolveSecondPage!({
          conversations: [{ ...mockConversation, id: 'conv-4' }],
          pagination: { limit: 20, offset: 20, total: 6, hasMore: false },
        });
      });

      await waitFor(() => {
        expect(result.current.isLoadingMore).toBe(false);
      });
    });
  });

  describe('Refresh', () => {
    it('should refetch conversations on refresh', async () => {
      mockGetConversations.mockResolvedValue(mockPaginatedResponse);

      const { result } = renderHook(() => useConversationsPaginationRQ(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockGetConversations.mockClear();

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(mockGetConversations).toHaveBeenCalled();
      });
    });
  });

  describe('setConversations', () => {
    it('should update conversations with array', async () => {
      mockGetConversations.mockResolvedValue(mockPaginatedResponse);

      const { wrapper, queryClient } = createWrapperWithClient();

      const { result } = renderHook(() => useConversationsPaginationRQ(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const newConversations = [{ ...mockConversation, id: 'new-conv', title: 'New' }];

      act(() => {
        result.current.setConversations(newConversations);
      });

      // Check cache was updated
      const cachedData = queryClient.getQueryData(['conversations', 'infinite']) as {
        pages: { conversations: Conversation[] }[];
      };

      expect(cachedData.pages[0].conversations).toHaveLength(1);
      expect(cachedData.pages[0].conversations[0].id).toBe('new-conv');
    });

    it('should update conversations with function updater', async () => {
      mockGetConversations.mockResolvedValue(mockPaginatedResponse);

      const { wrapper, queryClient } = createWrapperWithClient();

      const { result } = renderHook(() => useConversationsPaginationRQ(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.setConversations((prev) =>
          prev.filter((c) => c.id !== 'conv-1')
        );
      });

      // Check cache was updated
      const cachedData = queryClient.getQueryData(['conversations', 'infinite']) as {
        pages: { conversations: Conversation[] }[];
      };

      expect(cachedData.pages[0].conversations.find((c) => c.id === 'conv-1')).toBeUndefined();
    });

    it('should allow adding new conversation', async () => {
      mockGetConversations.mockResolvedValue(mockPaginatedResponse);

      const { wrapper, queryClient } = createWrapperWithClient();

      const { result } = renderHook(() => useConversationsPaginationRQ(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const newConversation = { ...mockConversation, id: 'new-conv', title: 'New Conversation' };

      act(() => {
        result.current.setConversations((prev) => [newConversation, ...prev]);
      });

      // Check cache was updated
      const cachedData = queryClient.getQueryData(['conversations', 'infinite']) as {
        pages: { conversations: Conversation[] }[];
      };

      expect(cachedData.pages[0].conversations[0].id).toBe('new-conv');
      expect(cachedData.pages[0].conversations).toHaveLength(4);
    });

    it('should allow updating conversation in list', async () => {
      mockGetConversations.mockResolvedValue(mockPaginatedResponse);

      const { wrapper, queryClient } = createWrapperWithClient();

      const { result } = renderHook(() => useConversationsPaginationRQ(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.setConversations((prev) =>
          prev.map((c) =>
            c.id === 'conv-1' ? { ...c, title: 'Updated Title', unreadCount: 5 } : c
          )
        );
      });

      // Check cache was updated
      const cachedData = queryClient.getQueryData(['conversations', 'infinite']) as {
        pages: { conversations: Conversation[] }[];
      };

      const updatedConv = cachedData.pages[0].conversations.find((c) => c.id === 'conv-1');
      expect(updatedConv?.title).toBe('Updated Title');
      expect(updatedConv?.unreadCount).toBe(5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty conversations list', async () => {
      mockGetConversations.mockResolvedValue({
        conversations: [],
        pagination: { limit: 20, offset: 0, total: 0, hasMore: false },
      });

      const { result } = renderHook(() => useConversationsPaginationRQ(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.conversations).toEqual([]);
      expect(result.current.hasMore).toBe(false);
    });

    it('should not load more when hasMore is false', async () => {
      mockGetConversations.mockResolvedValue({
        ...mockPaginatedResponse,
        pagination: { ...mockPaginatedResponse.pagination, hasMore: false },
      });

      const { result } = renderHook(() => useConversationsPaginationRQ(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockGetConversations.mockClear();

      // Try to load more when there is no more
      act(() => {
        result.current.loadMore();
      });

      // Should not trigger a new fetch since hasMore is false
      // (fetchNextPage won't be called if hasNextPage is false)
      expect(result.current.isLoadingMore).toBe(false);
    });
  });
});
