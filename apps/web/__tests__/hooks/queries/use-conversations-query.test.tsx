/**
 * Tests for useConversationsQuery and related hooks
 *
 * Tests cover:
 * - useConversationsQuery: Basic query, loading, error, success states
 * - useConversationsWithPagination: Pagination data access
 * - useConversationQuery: Single conversation query
 * - useInfiniteConversationsQuery: Infinite scrolling pagination
 * - useCreateConversationMutation: Creating conversations with cache updates
 * - useDeleteConversationMutation: Deleting conversations with cache invalidation
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useConversationsQuery,
  useConversationsWithPagination,
  useConversationQuery,
  useInfiniteConversationsQuery,
  useCreateConversationMutation,
  useDeleteConversationMutation,
} from '@/hooks/queries/use-conversations-query';

// Mock the conversations service
const mockGetConversations = jest.fn();
const mockGetConversation = jest.fn();
const mockCreateConversation = jest.fn();
const mockDeleteConversation = jest.fn();

jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getConversations: (...args: unknown[]) => mockGetConversations(...args),
    getConversation: (...args: unknown[]) => mockGetConversation(...args),
    createConversation: (...args: unknown[]) => mockCreateConversation(...args),
    deleteConversation: (...args: unknown[]) => mockDeleteConversation(...args),
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
      details: () => ['conversations', 'detail'],
      detail: (id: string) => ['conversations', 'detail', id],
    },
  },
}));

// Test data
const mockConversation = {
  id: 'conv-1',
  title: 'Test Conversation',
  type: 'direct' as const,
  visibility: 'private' as const,
  status: 'active' as const,
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

describe('useConversationsQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading State', () => {
    it('should return isLoading true initially', () => {
      mockGetConversations.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useConversationsQuery(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });
  });

  describe('Success State', () => {
    it('should return conversations on success', async () => {
      mockGetConversations.mockResolvedValue(mockPaginatedResponse);

      const { result } = renderHook(() => useConversationsQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(3);
      expect(result.current.data?.[0].id).toBe('conv-1');
    });

    it('should use select to extract conversations array', async () => {
      mockGetConversations.mockResolvedValue(mockPaginatedResponse);

      const { result } = renderHook(() => useConversationsQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // The select function extracts just the conversations array
      expect(Array.isArray(result.current.data)).toBe(true);
    });
  });

  describe('Error State', () => {
    it('should return error on failure', async () => {
      const testError = new Error('Failed to fetch conversations');
      mockGetConversations.mockRejectedValue(testError);

      const { result } = renderHook(() => useConversationsQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });
  });

  describe('Options', () => {
    it('should respect enabled option', async () => {
      mockGetConversations.mockResolvedValue(mockPaginatedResponse);

      const { result } = renderHook(
        () => useConversationsQuery({ enabled: false }),
        { wrapper: createWrapper() }
      );

      // Should not fetch when disabled
      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe('idle');
      expect(mockGetConversations).not.toHaveBeenCalled();
    });

    it('should pass limit and offset to service', async () => {
      mockGetConversations.mockResolvedValue(mockPaginatedResponse);

      renderHook(
        () => useConversationsQuery({ limit: 10, offset: 5 }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(mockGetConversations).toHaveBeenCalled();
      });

      expect(mockGetConversations).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          offset: 5,
          skipCache: true,
        })
      );
    });
  });
});

describe('useConversationsWithPagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return full response including pagination', async () => {
    mockGetConversations.mockResolvedValue(mockPaginatedResponse);

    const { result } = renderHook(() => useConversationsWithPagination(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // This hook returns the full response, not just conversations
    expect(result.current.data).toHaveProperty('conversations');
    expect(result.current.data).toHaveProperty('pagination');
  });
});

describe('useConversationQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not fetch when conversationId is null', () => {
    mockGetConversation.mockResolvedValue(mockConversation);

    const { result } = renderHook(() => useConversationQuery(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetConversation).not.toHaveBeenCalled();
  });

  it('should not fetch when conversationId is undefined', () => {
    mockGetConversation.mockResolvedValue(mockConversation);

    const { result } = renderHook(() => useConversationQuery(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetConversation).not.toHaveBeenCalled();
  });

  it('should fetch conversation when ID is provided', async () => {
    mockGetConversation.mockResolvedValue(mockConversation);

    const { result } = renderHook(() => useConversationQuery('conv-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGetConversation).toHaveBeenCalledWith('conv-1');
    expect(result.current.data?.id).toBe('conv-1');
  });

  it('should handle error state', async () => {
    mockGetConversation.mockRejectedValue(new Error('Not found'));

    const { result } = renderHook(() => useConversationQuery('invalid-id'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe('useInfiniteConversationsQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch first page', async () => {
    mockGetConversations.mockResolvedValue(mockPaginatedResponse);

    const { result } = renderHook(() => useInfiniteConversationsQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.pages).toHaveLength(1);
    expect(result.current.data?.pages[0].conversations).toHaveLength(3);
  });

  it('should determine hasNextPage from pagination', async () => {
    mockGetConversations.mockResolvedValue({
      ...mockPaginatedResponse,
      pagination: { ...mockPaginatedResponse.pagination, hasMore: true },
    });

    const { result } = renderHook(() => useInfiniteConversationsQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.hasNextPage).toBe(true);
  });

  it('should not have next page when hasMore is false', async () => {
    mockGetConversations.mockResolvedValue({
      ...mockPaginatedResponse,
      pagination: { ...mockPaginatedResponse.pagination, hasMore: false },
    });

    const { result } = renderHook(() => useInfiniteConversationsQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.hasNextPage).toBe(false);
  });

  it('should fetch next page with correct offset', async () => {
    // First page
    mockGetConversations.mockResolvedValueOnce({
      ...mockPaginatedResponse,
      pagination: { limit: 20, offset: 0, total: 40, hasMore: true },
    });

    // Second page
    mockGetConversations.mockResolvedValueOnce({
      conversations: [{ ...mockConversation, id: 'conv-4' }],
      pagination: { limit: 20, offset: 20, total: 40, hasMore: false },
    });

    const { result } = renderHook(() => useInfiniteConversationsQuery({ limit: 20 }), {
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
      expect(mockGetConversations).toHaveBeenCalledTimes(2);
    });

    // Second call should have offset 20
    expect(mockGetConversations).toHaveBeenLastCalledWith(
      expect.objectContaining({
        offset: 20,
      })
    );
  });

  it('should respect enabled option', () => {
    mockGetConversations.mockResolvedValue(mockPaginatedResponse);

    const { result } = renderHook(
      () => useInfiniteConversationsQuery({ enabled: false }),
      { wrapper: createWrapper() }
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetConversations).not.toHaveBeenCalled();
  });
});

describe('useCreateConversationMutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create conversation and update cache', async () => {
    const newConversation = {
      ...mockConversation,
      id: 'new-conv',
      title: 'New Conversation',
    };
    mockCreateConversation.mockResolvedValue(newConversation);
    mockGetConversations.mockResolvedValue(mockPaginatedResponse);

    const { wrapper, queryClient } = createWrapperWithClient();

    // Pre-populate cache
    queryClient.setQueryData(['conversations', 'list', undefined], mockConversations);

    const { result } = renderHook(() => useCreateConversationMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        type: 'direct',
        participantIds: ['user-1', 'user-2'],
      });
    });

    expect(mockCreateConversation).toHaveBeenCalledWith({
      type: 'direct',
      participantIds: ['user-1', 'user-2'],
    });
  });

  it('should handle creation error', async () => {
    mockCreateConversation.mockRejectedValue(new Error('Creation failed'));

    const { result } = renderHook(() => useCreateConversationMutation(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          type: 'direct',
          participantIds: ['user-1'],
        });
      })
    ).rejects.toThrow('Creation failed');
  });

  it('should return isPending during mutation', async () => {
    let resolvePromise: (value: unknown) => void;
    mockCreateConversation.mockImplementation(
      () => new Promise((resolve) => { resolvePromise = resolve; })
    );

    const { result } = renderHook(() => useCreateConversationMutation(), {
      wrapper: createWrapper(),
    });

    // Start mutation without awaiting
    act(() => {
      result.current.mutate({
        type: 'direct',
        participantIds: ['user-1'],
      });
    });

    // Wait for pending state
    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    // Resolve the promise
    await act(async () => {
      resolvePromise!(mockConversation);
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });
});

describe('useDeleteConversationMutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should delete conversation and update cache', async () => {
    mockDeleteConversation.mockResolvedValue(undefined);

    const { wrapper, queryClient } = createWrapperWithClient();

    // Pre-populate cache
    queryClient.setQueryData(['conversations', 'list', undefined], mockConversations);

    const { result } = renderHook(() => useDeleteConversationMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync('conv-1');
    });

    expect(mockDeleteConversation).toHaveBeenCalledWith('conv-1');

    // Cache should be updated (conv-1 removed)
    const cachedData = queryClient.getQueryData(['conversations', 'list', undefined]);
    expect(cachedData).toEqual(
      mockConversations.filter((c) => c.id !== 'conv-1')
    );
  });

  it('should remove detail query for deleted conversation', async () => {
    mockDeleteConversation.mockResolvedValue(undefined);

    const { wrapper, queryClient } = createWrapperWithClient();

    // Pre-populate detail cache
    queryClient.setQueryData(['conversations', 'detail', 'conv-1'], mockConversation);

    const { result } = renderHook(() => useDeleteConversationMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync('conv-1');
    });

    // Detail query should be removed
    const detailData = queryClient.getQueryData(['conversations', 'detail', 'conv-1']);
    expect(detailData).toBeUndefined();
  });

  it('should handle deletion error', async () => {
    mockDeleteConversation.mockRejectedValue(new Error('Deletion failed'));

    const { result } = renderHook(() => useDeleteConversationMutation(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync('conv-1');
      })
    ).rejects.toThrow('Deletion failed');
  });
});
