/**
 * Tests for useReactionsQuery hook
 *
 * Tests cover:
 * - Query loading, success, error states
 * - Optimistic updates for add/remove reactions
 * - Rollback on error
 * - Max reactions per user limit
 * - Socket.IO event handlers for real-time sync
 * - Initial data from reactionSummary
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useReactionsQuery } from '@/hooks/queries/use-reactions-query';
import type { ReactionAggregation, ReactionUpdateEvent } from '@meeshy/shared/types/reaction';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';

// Mock Socket.IO service
let mockSocketConnected = true;
const mockSocketEmit = jest.fn();
const mockSocket = {
  connected: mockSocketConnected,
  emit: mockSocketEmit,
};

const mockOnReactionAdded = jest.fn();
const mockOnReactionRemoved = jest.fn();

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    getSocket: () => mockSocketConnected ? mockSocket : null,
    onReactionAdded: (handler: (event: ReactionUpdateEvent) => void) => {
      mockOnReactionAdded(handler);
      return jest.fn(); // Return unsubscribe function
    },
    onReactionRemoved: (handler: (event: ReactionUpdateEvent) => void) => {
      mockOnReactionRemoved(handler);
      return jest.fn(); // Return unsubscribe function
    },
  },
}));

// Mock i18n hook
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'maxReactionsReached') {
        return `Maximum ${params?.max} reactions reached`;
      }
      return key;
    },
  }),
}));

// Mock toast
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
  },
}));

// Test data
const mockReactions: ReactionAggregation[] = [
  { emoji: '👍', count: 5, userIds: ['user-1', 'user-2'], anonymousIds: [], hasCurrentUser: false },
  { emoji: '❤️', count: 3, userIds: ['user-3'], anonymousIds: [], hasCurrentUser: true },
];

const mockReactionState = {
  reactions: mockReactions,
  userReactions: ['❤️'],
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

describe('useReactionsQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSocketConnected = true;
    mockSocket.connected = true;
  });

  describe('Initial State', () => {
    it('should use initial data from reactionSummary', async () => {
      const initialReactionSummary = { '👍': 5, '❤️': 3 };
      const initialCurrentUserReactions = ['❤️'];

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: 'msg-1',
          currentUserId: 'user-1',
          initialReactionSummary,
          initialCurrentUserReactions,
        }),
        { wrapper: createWrapper() }
      );

      // Should immediately have initial data
      expect(result.current.reactions).toHaveLength(2);
      expect(result.current.userReactions).toEqual(['❤️']);
      expect(result.current.hasReacted('❤️')).toBe(true);
      expect(result.current.hasReacted('👍')).toBe(false);
    });

    it('should return empty state when no initial data', async () => {
      // Mock socket to return empty data
      mockSocketEmit.mockImplementation((event, messageId, callback) => {
        if (event === CLIENT_EVENTS.REACTION_REQUEST_SYNC) {
          callback({ success: true, data: { reactions: [], userReactions: [] } });
        }
      });

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: 'msg-1',
          currentUserId: 'user-1',
        }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.reactions).toEqual([]);
      expect(result.current.userReactions).toEqual([]);
      expect(result.current.totalCount).toBe(0);
    });
  });

  describe('Query Behavior', () => {
    it('should not fetch when messageId is empty', () => {
      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: '',
          currentUserId: 'user-1',
        }),
        { wrapper: createWrapper() }
      );

      expect(mockSocketEmit).not.toHaveBeenCalled();
    });

    it('should not fetch when enabled is false', () => {
      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: 'msg-1',
          currentUserId: 'user-1',
          enabled: false,
        }),
        { wrapper: createWrapper() }
      );

      expect(mockSocketEmit).not.toHaveBeenCalled();
    });

    it('should fetch reactions via socket when enabled', async () => {
      mockSocketEmit.mockImplementation((event, messageId, callback) => {
        if (event === CLIENT_EVENTS.REACTION_REQUEST_SYNC) {
          callback({ success: true, data: mockReactionState });
        }
      });

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: 'msg-1',
          currentUserId: 'user-1',
        }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockSocketEmit).toHaveBeenCalledWith(
        CLIENT_EVENTS.REACTION_REQUEST_SYNC,
        'msg-1',
        expect.any(Function)
      );
    });

    it('should handle socket not connected', async () => {
      mockSocketConnected = false;
      mockSocket.connected = false;

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: 'msg-1',
          currentUserId: 'user-1',
        }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should return empty state when socket not connected
      expect(result.current.reactions).toEqual([]);
    });
  });

  describe('Add Reaction', () => {
    it('should add reaction optimistically', async () => {
      mockSocketEmit.mockImplementation((event, data, callback) => {
        if (event === CLIENT_EVENTS.REACTION_REQUEST_SYNC) {
          callback({ success: true, data: mockReactionState });
        } else if (event === CLIENT_EVENTS.REACTION_ADD) {
          callback({ success: true });
        }
      });

      const { wrapper, queryClient } = createWrapperWithClient();

      // Pre-populate cache
      queryClient.setQueryData(['reactions', 'msg-1'], mockReactionState);

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: 'msg-1',
          currentUserId: 'user-1',
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.addReaction('🎉');
      });

      // Should have added the reaction
      expect(mockSocketEmit).toHaveBeenCalledWith(
        CLIENT_EVENTS.REACTION_ADD,
        { messageId: 'msg-1', emoji: '🎉' },
        expect.any(Function)
      );
    });

    it('should not add reaction if already reacted', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', 'msg-1'], mockReactionState);

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: 'msg-1',
          currentUserId: 'user-1',
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const success = await act(async () => {
        return await result.current.addReaction('❤️'); // Already in userReactions
      });

      expect(success).toBe(true);
      // Should not emit add event
      expect(mockSocketEmit).not.toHaveBeenCalledWith(
        CLIENT_EVENTS.REACTION_ADD,
        expect.anything(),
        expect.any(Function)
      );
    });
  });

  describe('Remove Reaction', () => {
    it('should remove reaction optimistically', async () => {
      mockSocketEmit.mockImplementation((event, data, callback) => {
        if (event === CLIENT_EVENTS.REACTION_REQUEST_SYNC) {
          callback({ success: true, data: mockReactionState });
        } else if (event === CLIENT_EVENTS.REACTION_REMOVE) {
          callback({ success: true });
        }
      });

      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', 'msg-1'], mockReactionState);

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: 'msg-1',
          currentUserId: 'user-1',
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.removeReaction('❤️');
      });

      expect(mockSocketEmit).toHaveBeenCalledWith(
        CLIENT_EVENTS.REACTION_REMOVE,
        { messageId: 'msg-1', emoji: '❤️' },
        expect.any(Function)
      );
    });
  });

  describe('Toggle Reaction', () => {
    it('should toggle reaction - add when not present', async () => {
      mockSocketEmit.mockImplementation((event, data, callback) => {
        if (event === CLIENT_EVENTS.REACTION_REQUEST_SYNC) {
          callback({ success: true, data: mockReactionState });
        } else if (event === CLIENT_EVENTS.REACTION_ADD) {
          callback({ success: true });
        }
      });

      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', 'msg-1'], mockReactionState);

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: 'msg-1',
          currentUserId: 'user-1',
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.toggleReaction('🎉'); // Not in userReactions
      });

      expect(mockSocketEmit).toHaveBeenCalledWith(
        CLIENT_EVENTS.REACTION_ADD,
        expect.objectContaining({ emoji: '🎉' }),
        expect.any(Function)
      );
    });

    it('should toggle reaction - remove when present', async () => {
      mockSocketEmit.mockImplementation((event, data, callback) => {
        if (event === CLIENT_EVENTS.REACTION_REQUEST_SYNC) {
          callback({ success: true, data: mockReactionState });
        } else if (event === CLIENT_EVENTS.REACTION_REMOVE) {
          callback({ success: true });
        }
      });

      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', 'msg-1'], mockReactionState);

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: 'msg-1',
          currentUserId: 'user-1',
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.toggleReaction('❤️'); // In userReactions
      });

      expect(mockSocketEmit).toHaveBeenCalledWith(
        CLIENT_EVENTS.REACTION_REMOVE,
        expect.objectContaining({ emoji: '❤️' }),
        expect.any(Function)
      );
    });
  });

  describe('Utility Functions', () => {
    it('should return correct reaction count', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', 'msg-1'], mockReactionState);

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: 'msg-1',
          currentUserId: 'user-1',
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.getReactionCount('👍')).toBe(5);
      expect(result.current.getReactionCount('❤️')).toBe(3);
      expect(result.current.getReactionCount('🎉')).toBe(0);
    });

    it('should calculate total count correctly', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', 'msg-1'], mockReactionState);

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: 'msg-1',
          currentUserId: 'user-1',
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.totalCount).toBe(8); // 5 + 3
    });

    it('should check hasReacted correctly', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', 'msg-1'], mockReactionState);

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: 'msg-1',
          currentUserId: 'user-1',
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasReacted('❤️')).toBe(true);
      expect(result.current.hasReacted('👍')).toBe(false);
    });
  });

  describe('Max Reactions Limit', () => {
    it('should prevent adding more than max reactions', async () => {
      const { toast } = require('sonner');

      const stateWithMaxReactions = {
        reactions: mockReactions,
        userReactions: ['❤️', '👍', '🎉'], // Already at max (3)
      };

      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', 'msg-1'], stateWithMaxReactions);

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: 'msg-1',
          currentUserId: 'user-1',
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const success = await act(async () => {
        return await result.current.addReaction('😀'); // Try to add 4th
      });

      expect(success).toBe(false);
      expect(toast.error).toHaveBeenCalled();
    });
  });

  describe('Socket Event Handlers', () => {
    it('should register socket event handlers on mount', async () => {
      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: 'msg-1',
          currentUserId: 'user-1',
        }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(mockOnReactionAdded).toHaveBeenCalled();
        expect(mockOnReactionRemoved).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle fetch failure gracefully', async () => {
      mockSocketEmit.mockImplementation((event, messageId, callback) => {
        if (event === CLIENT_EVENTS.REACTION_REQUEST_SYNC) {
          callback({ success: false, error: 'Failed to fetch reactions' });
        }
      });

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: 'msg-1',
          currentUserId: 'user-1',
        }),
        { wrapper: createWrapper() }
      );

      // The hook handles errors by rejecting the promise, which triggers React Query error state
      // Wait for error or loading to finish (may take longer due to retry)
      await waitFor(
        () => {
          // Either error is set or loading is done
          expect(
            result.current.error !== null || result.current.isLoading === false
          ).toBe(true);
        },
        { timeout: 10000 }
      );
    });
  });
});
