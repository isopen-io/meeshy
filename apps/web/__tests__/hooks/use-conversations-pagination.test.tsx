/**
 * Tests for useConversationsPagination hook
 *
 * Tests cover:
 * - Initial state
 * - Loading conversations
 * - Pagination (load more)
 * - Refresh functionality
 * - Error handling
 * - Enabled/disabled state
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useConversationsPagination } from '@/hooks/use-conversations-pagination';

// Mock conversations service
const mockGetConversations = jest.fn();

jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getConversations: (...args: any[]) => mockGetConversations(...args),
  },
}));

describe('useConversationsPagination', () => {
  const createMockConversation = (id: string) => ({
    id,
    identifier: `conv-${id}`,
    name: `Conversation ${id}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    participants: [],
    messages: [],
  });

  const mockConversations = [
    createMockConversation('1'),
    createMockConversation('2'),
    createMockConversation('3'),
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementation
    mockGetConversations.mockResolvedValue({
      conversations: mockConversations,
      pagination: {
        total: 10,
        offset: 0,
        limit: 20,
        hasMore: true,
      },
    });

    // Suppress console warnings
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should return empty conversations initially', () => {
      const { result } = renderHook(() =>
        useConversationsPagination({ enabled: false })
      );

      expect(result.current.conversations).toEqual([]);
    });

    it('should return isLoading true when enabled', async () => {
      const { result } = renderHook(() => useConversationsPagination());

      expect(result.current.isLoading).toBe(true);
    });

    it('should return isLoadingMore false initially', () => {
      const { result } = renderHook(() =>
        useConversationsPagination({ enabled: false })
      );

      expect(result.current.isLoadingMore).toBe(false);
    });

    it('should return error as null initially', () => {
      const { result } = renderHook(() =>
        useConversationsPagination({ enabled: false })
      );

      expect(result.current.error).toBeNull();
    });

    it('should return hasMore true initially', () => {
      const { result } = renderHook(() =>
        useConversationsPagination({ enabled: false })
      );

      expect(result.current.hasMore).toBe(true);
    });
  });

  describe('Loading Conversations', () => {
    it('should load conversations when enabled', async () => {
      const { result } = renderHook(() => useConversationsPagination());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.conversations.length).toBe(3);
      expect(mockGetConversations).toHaveBeenCalled();
    });

    it('should not load when disabled', async () => {
      renderHook(() =>
        useConversationsPagination({ enabled: false })
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockGetConversations).not.toHaveBeenCalled();
    });

    it('should use correct limit option', async () => {
      renderHook(() =>
        useConversationsPagination({ limit: 50 })
      );

      await waitFor(() => {
        expect(mockGetConversations).toHaveBeenCalledWith(
          expect.objectContaining({
            limit: 50,
            offset: 0,
          })
        );
      });
    });

    it('should update hasMore from API response', async () => {
      mockGetConversations.mockResolvedValue({
        conversations: mockConversations,
        pagination: { hasMore: false },
      });

      const { result } = renderHook(() => useConversationsPagination());

      await waitFor(() => {
        expect(result.current.hasMore).toBe(false);
      });
    });

    it('should set error on failure', async () => {
      mockGetConversations.mockRejectedValue(new Error('Load failed'));

      const { result } = renderHook(() => useConversationsPagination());

      await waitFor(() => {
        expect(result.current.error).toEqual(expect.any(Error));
        expect(result.current.error?.message).toBe('Load failed');
      });
    });
  });

  describe('Load More (Pagination)', () => {
    it('should load more conversations', async () => {
      const { result } = renderHook(() => useConversationsPagination());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const moreConversations = [
        createMockConversation('4'),
        createMockConversation('5'),
      ];

      mockGetConversations.mockResolvedValue({
        conversations: moreConversations,
        pagination: { hasMore: true },
      });

      await act(async () => {
        result.current.loadMore();
      });

      await waitFor(() => {
        expect(result.current.conversations.length).toBe(5);
      });
    });

    it('should set isLoadingMore during load more', async () => {
      const { result } = renderHook(() => useConversationsPagination());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Make loadMore slow
      mockGetConversations.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({
          conversations: [],
          pagination: { hasMore: false },
        }), 100))
      );

      act(() => {
        result.current.loadMore();
      });

      expect(result.current.isLoadingMore).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoadingMore).toBe(false);
      });
    });

    it('should not load more if hasMore is false', async () => {
      mockGetConversations.mockResolvedValue({
        conversations: mockConversations,
        pagination: { hasMore: false },
      });

      const { result } = renderHook(() => useConversationsPagination());

      await waitFor(() => {
        expect(result.current.hasMore).toBe(false);
      });

      mockGetConversations.mockClear();

      act(() => {
        result.current.loadMore();
      });

      expect(mockGetConversations).not.toHaveBeenCalled();
    });

    it('should not load more if already loading', async () => {
      const { result } = renderHook(() => useConversationsPagination());

      // While still loading initial
      act(() => {
        result.current.loadMore();
      });

      // Should not make duplicate calls
      expect(mockGetConversations).toHaveBeenCalledTimes(1);
    });

    it('should use correct offset for pagination', async () => {
      const { result } = renderHook(() =>
        useConversationsPagination({ limit: 20 })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockGetConversations.mockClear();

      await act(async () => {
        result.current.loadMore();
      });

      await waitFor(() => {
        expect(mockGetConversations).toHaveBeenCalledWith(
          expect.objectContaining({
            offset: 20,
            limit: 20,
          })
        );
      });
    });

    it('should skip cache for subsequent pages', async () => {
      const { result } = renderHook(() => useConversationsPagination());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockGetConversations.mockClear();

      await act(async () => {
        result.current.loadMore();
      });

      await waitFor(() => {
        expect(mockGetConversations).toHaveBeenCalledWith(
          expect.objectContaining({
            skipCache: true,
          })
        );
      });
    });
  });

  describe('Refresh', () => {
    it('should reset and reload conversations', async () => {
      const { result } = renderHook(() => useConversationsPagination());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const newConversations = [createMockConversation('new-1')];
      mockGetConversations.mockResolvedValue({
        conversations: newConversations,
        pagination: { hasMore: false },
      });

      await act(async () => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.conversations.length).toBe(1);
        expect(result.current.conversations[0].id).toBe('new-1');
      });
    });

    it('should reset hasMore on refresh', async () => {
      mockGetConversations.mockResolvedValue({
        conversations: mockConversations,
        pagination: { hasMore: false },
      });

      const { result } = renderHook(() => useConversationsPagination());

      await waitFor(() => {
        expect(result.current.hasMore).toBe(false);
      });

      mockGetConversations.mockResolvedValue({
        conversations: mockConversations,
        pagination: { hasMore: true },
      });

      await act(async () => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.hasMore).toBe(true);
      });
    });

    it('should clear conversations during refresh', async () => {
      const { result } = renderHook(() => useConversationsPagination());

      await waitFor(() => {
        expect(result.current.conversations.length).toBe(3);
      });

      act(() => {
        result.current.refresh();
      });

      // Conversations should be cleared immediately
      expect(result.current.conversations).toEqual([]);
    });
  });

  describe('setConversations', () => {
    it('should allow manual update of conversations', async () => {
      const { result } = renderHook(() => useConversationsPagination());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const customConversations = [createMockConversation('custom-1')];

      act(() => {
        result.current.setConversations(customConversations);
      });

      expect(result.current.conversations).toEqual(customConversations);
    });

    it('should allow update with function', async () => {
      const { result } = renderHook(() => useConversationsPagination());

      await waitFor(() => {
        expect(result.current.conversations.length).toBe(3);
      });

      act(() => {
        result.current.setConversations(prev => prev.slice(0, 1));
      });

      expect(result.current.conversations.length).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should set error on load failure', async () => {
      mockGetConversations.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useConversationsPagination());

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.error?.message).toBe('Network error');
      expect(result.current.hasMore).toBe(false);
    });

    it('should handle non-Error exceptions', async () => {
      mockGetConversations.mockRejectedValue('String error');

      const { result } = renderHook(() => useConversationsPagination());

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.error?.message).toBe('Erreur inconnue');
    });

    it('should clear error on successful load', async () => {
      mockGetConversations.mockRejectedValueOnce(new Error('First error'));

      const { result } = renderHook(() => useConversationsPagination());

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      mockGetConversations.mockResolvedValue({
        conversations: mockConversations,
        pagination: { hasMore: true },
      });

      await act(async () => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
      });
    });
  });

  describe('Concurrent Requests Prevention', () => {
    it('should prevent concurrent loads', async () => {
      let resolveFirst: () => void;
      const firstPromise = new Promise<void>(resolve => {
        resolveFirst = resolve;
      });

      mockGetConversations.mockImplementation(async () => {
        await firstPromise;
        return {
          conversations: mockConversations,
          pagination: { hasMore: true },
        };
      });

      const { result } = renderHook(() => useConversationsPagination());

      // First call is made
      expect(mockGetConversations).toHaveBeenCalledTimes(1);

      // Try to load more while first is pending
      act(() => {
        result.current.loadMore();
      });

      // Should not make another call
      expect(mockGetConversations).toHaveBeenCalledTimes(1);

      // Resolve first
      resolveFirst!();

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });
});
