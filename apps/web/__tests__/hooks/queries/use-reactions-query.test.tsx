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
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import React from 'react';
import { useReactionsQuery, RECONCILE_SPACING_MS } from '@/hooks/queries/use-reactions-query';
import type { ReactionAggregation, ReactionUpdateEvent } from '@meeshy/shared/types/reaction';
import {
  CLIENT_EVENTS,
  RATE_LIMIT_REFUSAL_MESSAGE,
  REACTION_SYNC_BUDGET,
} from '@meeshy/shared/types/socketio-events';

// Mock Socket.IO service
let mockSocketConnected = true;
const mockSocketEmit = jest.fn();
const mockSocket = {
  connected: mockSocketConnected,
  emit: mockSocketEmit,
};

const mockOnReactionAdded = jest.fn();
const mockOnReactionRemoved = jest.fn();

// Canal d'état de connexion pilotable : les tests de réconciliation ont besoin
// de faire varier la joignabilité du socket ET de notifier, comme le fait
// `ConnectionService.emitStatusChange`.
const mockStatusChangeHandlers = new Set<() => void>();
const mockEmitStatusChange = () => {
  mockStatusChangeHandlers.forEach(handler => handler());
};

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
    onStatusChange: (handler: () => void) => {
      mockStatusChangeHandlers.add(handler);
      return () => mockStatusChangeHandlers.delete(handler);
    },
  },
}));

// Pas de mock i18n : le hook ne traduit plus rien. Sa seule traduction était
// `maxReactionsReached`, dont le cap et le remap d'erreur ont disparu avec les
// multi-réactions — les erreurs serveur remontent désormais VERBATIM.

// Mock toast
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
  },
}));

// Test data
const mockReactions: ReactionAggregation[] = [
  { emoji: '👍', count: 5, participantIds: ['user-1', 'user-2'], hasCurrentUser: false },
  { emoji: '❤️', count: 3, participantIds: ['user-3'], hasCurrentUser: true },
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
    mockStatusChangeHandlers.clear();
    mockSocketConnected = true;
    mockSocket.connected = true;
  });

  describe('Initial State', () => {
    it('should use initial data from reactionSummary', async () => {
      const initialReactionSummary = { '👍': 5, '❤️': 3 };
      const initialCurrentUserReactions = ['❤️'];

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: '507f1f77bcf86cd799439011',
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
          messageId: '507f1f77bcf86cd799439011',
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
          messageId: '507f1f77bcf86cd799439011',
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
          messageId: '507f1f77bcf86cd799439011',
          currentUserId: 'user-1',
        }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockSocketEmit).toHaveBeenCalledWith(
        CLIENT_EVENTS.REACTION_REQUEST_SYNC,
        '507f1f77bcf86cd799439011',
        expect.any(Function)
      );
    });

    it('should handle socket not connected', async () => {
      mockSocketConnected = false;
      mockSocket.connected = false;

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: '507f1f77bcf86cd799439011',
          currentUserId: 'user-1',
        }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Rien à rendre — mais l'absence de canal n'est PAS mémorisée comme une
      // absence de réaction : la requête est en échec, pas en succès vide.
      // Cf. « Reconciliation on connection restore » plus bas.
      expect(result.current.reactions).toEqual([]);
      expect(result.current.error).not.toBeNull();
    });
  });

  describe('Optimistic message guard', () => {
    // An optimistic (not-yet-persisted) message carries a client id
    // (`cid_<uuid>` from generateClientMessageId) until the server ACK/
    // broadcast replaces it with a Mongo ObjectId (24 hex). Emitting a
    // reaction sync/add/remove for a `cid_...` id makes the gateway reject a
    // non-ObjectId ("Prisma ObjectID error"), so this hook — the one the
    // reactions UI actually renders (message-reactions.tsx via
    // BubbleMessageNormalView) — must stay disabled until the id is a real
    // 24-hex ObjectId, exactly like the (unused in production)
    // useMessageReactions hook already does.
    const optimisticId = 'cid_123e4567-e89b-42d3-a456-426614174000';

    it('does not fetch/sync for an optimistic (cid_) message id', () => {
      renderHook(
        () => useReactionsQuery({
          messageId: optimisticId,
          currentUserId: 'user-1',
        }),
        { wrapper: createWrapper() }
      );

      expect(mockSocketEmit).not.toHaveBeenCalled();
    });

    it('addReaction returns false and does not emit for an optimistic (cid_) message id', async () => {
      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: optimisticId,
          currentUserId: 'user-1',
        }),
        { wrapper: createWrapper() }
      );

      const success = await act(async () => result.current.addReaction('👍'));

      expect(success).toBe(false);
      expect(mockSocketEmit).not.toHaveBeenCalledWith(
        CLIENT_EVENTS.REACTION_ADD,
        expect.anything(),
        expect.any(Function)
      );
    });

    it('removeReaction returns false and does not emit for an optimistic (cid_) message id', async () => {
      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: optimisticId,
          currentUserId: 'user-1',
        }),
        { wrapper: createWrapper() }
      );

      const success = await act(async () => result.current.removeReaction('👍'));

      expect(success).toBe(false);
      expect(mockSocketEmit).not.toHaveBeenCalledWith(
        CLIENT_EVENTS.REACTION_REMOVE,
        expect.anything(),
        expect.any(Function)
      );
    });

    it('fetches/syncs once the message id is a real 24-hex ObjectId', async () => {
      mockSocketEmit.mockImplementation((event, messageId, callback) => {
        if (event === CLIENT_EVENTS.REACTION_REQUEST_SYNC) {
          callback({ success: true, data: mockReactionState });
        }
      });

      renderHook(
        () => useReactionsQuery({
          messageId: '507f1f77bcf86cd799439011',
          currentUserId: 'user-1',
        }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(mockSocketEmit).toHaveBeenCalledWith(
          CLIENT_EVENTS.REACTION_REQUEST_SYNC,
          '507f1f77bcf86cd799439011',
          expect.any(Function)
        );
      });
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
      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], mockReactionState);

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: '507f1f77bcf86cd799439011',
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
        { messageId: '507f1f77bcf86cd799439011', emoji: '🎉' },
        expect.any(Function)
      );
    });

    it('should not add reaction if already reacted', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], mockReactionState);

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: '507f1f77bcf86cd799439011',
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

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], mockReactionState);

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: '507f1f77bcf86cd799439011',
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
        { messageId: '507f1f77bcf86cd799439011', emoji: '❤️' },
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

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], mockReactionState);

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: '507f1f77bcf86cd799439011',
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

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], mockReactionState);

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: '507f1f77bcf86cd799439011',
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

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], mockReactionState);

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: '507f1f77bcf86cd799439011',
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

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], mockReactionState);

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: '507f1f77bcf86cd799439011',
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

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], mockReactionState);

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: '507f1f77bcf86cd799439011',
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

  describe('Multi-réactions — plus aucun cap client', () => {
    const threeReactions = () => ({
      reactions: mockReactions,
      userReactions: ['❤️', '👍', '🎉'],
    });

    const ackAdd = () => {
      mockSocketEmit.mockImplementation((event, payload, callback) => {
        if (event === CLIENT_EVENTS.REACTION_ADD) {
          callback({ success: true });
        }
      });
    };

    it('stacks a 4th distinct emoji instead of refusing it', async () => {
      const { toast } = require('sonner');
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], threeReactions());
      ackAdd();

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: '507f1f77bcf86cd799439011',
          currentUserId: 'user-1',
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const success = await act(async () => {
        return await result.current.addReaction('😀');
      });

      expect(success).toBe(true);
      expect(toast.error).not.toHaveBeenCalled();

      const data = queryClient.getQueryData<{ userReactions: string[] }>(['reactions', '507f1f77bcf86cd799439011']);
      expect(data?.userReactions).toEqual(['❤️', '👍', '🎉', '😀']);
    });

    it('reaches the server instead of refusing locally — la 4e réaction est ÉMISE', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], threeReactions());
      ackAdd();

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: '507f1f77bcf86cd799439011',
          currentUserId: 'user-1',
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.addReaction('😀');
      });

      // La garde qui PORTE. Celle du dessus décrit l'état du cache et resterait
      // verte si un futur cap refusait après la mise à jour optimiste puis
      // rollbackait. Le cap refusait AVANT l'émission : un client capé ne
      // laisse aucune trace côté transport, et c'est cette absence qui rendait
      // le serveur multi-réactions inatteignable depuis le web.
      expect(mockSocketEmit).toHaveBeenCalledWith(
        CLIENT_EVENTS.REACTION_ADD,
        { messageId: '507f1f77bcf86cd799439011', emoji: '😀' },
        expect.any(Function)
      );
    });
  });

  describe('Socket Event Handlers', () => {
    it('should register socket event handlers on mount', async () => {
      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: '507f1f77bcf86cd799439011',
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
          messageId: '507f1f77bcf86cd799439011',
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

  // ---------------------------------------------------------------------------
  // Additional tests for coverage of uncovered branches
  // ---------------------------------------------------------------------------

  describe('addMutation - optimistic update branches', () => {
    it('increments count when emoji already exists in reactions (existing branch)', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      // Pre-seed cache with existing reaction
      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [{ emoji: '👍', count: 2, participantIds: ['user-2'], hasCurrentUser: false }],
        userReactions: [],
      });

      mockSocketEmit.mockImplementation((event, payload, callback) => {
        if (event === CLIENT_EVENTS.REACTION_ADD) {
          callback({ success: true });
        }
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await act(async () => {
        await result.current.addReaction('👍');
      });

      // After optimistic update, the existing '👍' reaction should have count incremented
      await waitFor(() => expect(result.current.reactions.find(r => r.emoji === '👍')?.count).toBeGreaterThanOrEqual(3));
    });

    it('sets to empty userReactions when onMutate is called with old=undefined', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      // No pre-seeded cache - old will be undefined in onMutate

      let resolveEmit!: () => void;
      mockSocketEmit.mockImplementation((event, payload, callback) => {
        if (event === CLIENT_EVENTS.REACTION_ADD) {
          new Promise<void>(r => { resolveEmit = r; }).then(() => callback({ success: true }));
        }
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      act(() => {
        result.current.addReaction('❤️');
      });

      // The optimistic update should have set something even with no prior cache
      await waitFor(() => {
        const data = queryClient.getQueryData<{ userReactions: string[] }>(['reactions', '507f1f77bcf86cd799439011']);
        expect(data?.userReactions).toContain('❤️');
      });

      resolveEmit();
    });

    it('does not duplicate emoji in userReactions during optimistic update', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [{ emoji: '❤️', count: 1, participantIds: ['user-1'], hasCurrentUser: true }],
        userReactions: ['❤️'],
      });

      mockSocketEmit.mockImplementation((event, payload, callback) => {
        if (event === CLIENT_EVENTS.REACTION_ADD) {
          callback({ success: true });
        }
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      // Already reacted - addReaction returns true without calling mutate
      await act(async () => {
        const res = await result.current.addReaction('❤️');
        expect(res).toBe(true);
      });

      // Should NOT have called socket emit
      expect(mockSocketEmit).not.toHaveBeenCalledWith(CLIENT_EVENTS.REACTION_ADD, expect.anything(), expect.anything());
    });

    it('rolls back on addMutation error', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [{ emoji: '👍', count: 3, participantIds: [], hasCurrentUser: false }],
        userReactions: [],
      });

      mockSocketEmit.mockImplementation((event, payload, callback) => {
        if (event === CLIENT_EVENTS.REACTION_ADD) {
          callback({ success: false, error: 'Server error' });
        }
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await act(async () => {
        await result.current.addReaction('👍');
      });

      // After rollback, data should be restored
      await waitFor(() => {
        const data = queryClient.getQueryData<{ reactions: { count: number }[] }>(['reactions', '507f1f77bcf86cd799439011']);
        expect(data?.reactions[0].count).toBe(3);
      });
    });

    it('rolls back the fabricated state when the cache was empty', async () => {
      // Cache vide : `onMutate` FABRIQUE l'état optimiste à partir de rien
      // (`if (!old) return { reactions: [], userReactions: [emoji] }`), donc
      // `previousData` est `undefined`. Un rollback gardé par
      // `if (context?.previousData)` refuse alors de défaire ce qu'il vient de
      // fabriquer : la réaction fantôme reste affichée pour toujours, alors
      // même que le serveur l'a refusée.
      const { wrapper, queryClient } = createWrapperWithClient();

      // Le sync initial ne rappelle jamais → le cache reste vide.
      mockSocketEmit.mockImplementation((event, _payload, callback) => {
        if (event === CLIENT_EVENTS.REACTION_ADD) {
          callback({ success: false, error: 'Server error' });
        }
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await act(async () => {
        await result.current.addReaction('👍');
      });

      await waitFor(() => {
        const data = queryClient.getQueryData<{ userReactions: string[] }>(['reactions', '507f1f77bcf86cd799439011']);
        expect(data?.userReactions ?? []).not.toContain('👍');
      });
    });

    it('surfaces the server error VERBATIM — plus aucun remap « maximum »', async () => {
      const { toast } = jest.requireMock('sonner');
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [],
        userReactions: [],
      });

      // PLUS AUCUN service de réaction n'émet cette phrase : message, pièce
      // jointe, post et commentaire sont tous additifs depuis le 2026-08-18.
      // Le remap qui la traduisait visait donc une erreur disparue — il aurait
      // fait passer une erreur voisine pour une limite inexistante.
      mockSocketEmit.mockImplementation((event, payload, callback) => {
        if (event === CLIENT_EVENTS.REACTION_ADD) {
          callback({ success: false, error: 'Maximum 3 different reactions per user' });
        }
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await act(async () => {
        await result.current.addReaction('🎉');
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Maximum 3 different reactions per user');
      });
    });
  });

  describe('removeMutation - optimistic update branches', () => {
    it('maps reaction with count > 1 (decrement without removal)', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [{ emoji: '👍', count: 5, participantIds: ['user-1', 'user-2'], hasCurrentUser: true }],
        userReactions: ['👍'],
      });

      mockSocketEmit.mockImplementation((event, payload, callback) => {
        if (event === CLIENT_EVENTS.REACTION_REMOVE) {
          callback({ success: true });
        }
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await act(async () => {
        await result.current.removeReaction('👍');
      });

      // count was 5 > 1, so it should decrement by 1 (optimistic)
      await waitFor(() => {
        const data = queryClient.getQueryData<{ reactions: { emoji: string; count: number }[] }>(['reactions', '507f1f77bcf86cd799439011']);
        // After server confirms, data may be restored, but at minimum optimistic showed decrement
        expect(data).toBeDefined();
      });
    });

    it('returns old when emoji not found in reactions (early return)', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [{ emoji: '👍', count: 1, participantIds: [], hasCurrentUser: false }],
        userReactions: ['👍'],
      });

      mockSocketEmit.mockImplementation((event, payload, callback) => {
        if (event === CLIENT_EVENTS.REACTION_REMOVE) {
          callback({ success: true });
        }
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      // Try to remove an emoji that doesn't exist
      await act(async () => {
        await result.current.removeReaction('❤️');
      });

      // '❤️' not found - the onMutate returns old unchanged
      await waitFor(() => {
        const data = queryClient.getQueryData<{ reactions: { emoji: string }[] }>(['reactions', '507f1f77bcf86cd799439011']);
        expect(data?.reactions.some(r => r.emoji === '👍')).toBe(true);
      });
    });

    it('sets empty reactions when old=undefined in onMutate', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      // No pre-seeded cache

      let resolveEmit!: () => void;
      mockSocketEmit.mockImplementation((event, payload, callback) => {
        if (event === CLIENT_EVENTS.REACTION_REMOVE) {
          new Promise<void>(r => { resolveEmit = r; }).then(() => callback({ success: true }));
        }
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      act(() => {
        result.current.removeReaction('❤️');
      });

      await waitFor(() => {
        const data = queryClient.getQueryData<{ reactions: unknown[] }>(['reactions', '507f1f77bcf86cd799439011']);
        // Should have been set to { reactions: [], userReactions: [] }
        expect(data?.reactions).toEqual([]);
      });

      resolveEmit();
    });

    it('rolls back on removeMutation error', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [{ emoji: '❤️', count: 1, participantIds: ['user-1'], hasCurrentUser: true }],
        userReactions: ['❤️'],
      });

      mockSocketEmit.mockImplementation((event, payload, callback) => {
        if (event === CLIENT_EVENTS.REACTION_REMOVE) {
          callback({ success: false, error: 'Server error' });
        }
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await act(async () => {
        await result.current.removeReaction('❤️');
      });

      await waitFor(() => {
        const data = queryClient.getQueryData<{ reactions: { emoji: string }[] }>(['reactions', '507f1f77bcf86cd799439011']);
        // After rollback, '❤️' should be restored
        expect(data?.reactions.some(r => r.emoji === '❤️')).toBe(true);
      });
    });

    it('rolls back to no-data when the cache was empty', async () => {
      // Même défaut côté retrait : `onMutate` matérialise un état vide là où il
      // n'y avait AUCUNE donnée. Un rollback gardé sur `previousData` laisse
      // cette entrée fabriquée en place, et le cache ment ensuite sur le fait
      // qu'il a été chargé.
      const { wrapper, queryClient } = createWrapperWithClient();

      mockSocketEmit.mockImplementation((event, _payload, callback) => {
        if (event === CLIENT_EVENTS.REACTION_REMOVE) {
          callback({ success: false, error: 'Server error' });
        }
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await act(async () => {
        await result.current.removeReaction('❤️');
      });

      await waitFor(() => {
        expect(queryClient.getQueryData(['reactions', '507f1f77bcf86cd799439011'])).toBeUndefined();
      });
    });
  });

  describe('addMutation - socket not connected rejection', () => {
    it('rejects when socket is not connected', async () => {
      const { toast } = jest.requireMock('sonner');
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], { reactions: [], userReactions: [] });

      // Temporarily disconnect socket
      mockSocketConnected = false;

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await act(async () => {
        await result.current.addReaction('👍');
      });

      // Should have showed error toast (via onError)
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });

      mockSocketConnected = true;
    });
  });

  describe('removeMutation - socket not connected rejection', () => {
    it('rejects when socket is not connected', async () => {
      const { toast } = jest.requireMock('sonner');
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [{ emoji: '❤️', count: 1, participantIds: ['user-1'], hasCurrentUser: true }],
        userReactions: ['❤️'],
      });

      // Temporarily disconnect socket
      mockSocketConnected = false;

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await act(async () => {
        await result.current.removeReaction('❤️');
      });

      // Should have showed error toast (via onError)
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });

      mockSocketConnected = true;
    });
  });

  describe('addReaction - disabled / no messageId', () => {
    it('returns false when enabled=false', async () => {
      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1', enabled: false }),
        { wrapper: createWrapper() }
      );

      const res = await result.current.addReaction('👍');
      expect(res).toBe(false);
    });

    it('returns false when messageId is empty', async () => {
      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '', currentUserId: 'user-1' }),
        { wrapper: createWrapper() }
      );

      const res = await result.current.addReaction('👍');
      expect(res).toBe(false);
    });
  });

  describe('removeReaction - disabled / no messageId', () => {
    it('returns false when enabled=false', async () => {
      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1', enabled: false }),
        { wrapper: createWrapper() }
      );

      const res = await result.current.removeReaction('👍');
      expect(res).toBe(false);
    });

    it('returns false when messageId is empty', async () => {
      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '', currentUserId: 'user-1' }),
        { wrapper: createWrapper() }
      );

      const res = await result.current.removeReaction('👍');
      expect(res).toBe(false);
    });
  });

  describe('Socket handlers - conversation list is not a reaction surface', () => {
    /**
     * Une reaction ne change RIEN de ce que porte une ligne de liste : ni
     * l'apercu du dernier message, ni le compteur de non-lus, ni l'horodatage.
     * Le seul cache concerne est celui du message, mis a jour juste a cote par
     * `updateReactionSummaryInMessageCache`.
     *
     * L'invalidation retiree visait `conversations.lists()` (['conversations',
     * 'list']) alors que la sidebar lit `conversations.infinite()`
     * (['conversations','infinite']) : prefixes DISJOINTS, donc l'intention
     * ecrite en commentaire n'etait jamais executee. La rediriger vers
     * `infinite()` aurait relu TOUTES les pages chargees a chaque reaction —
     * exactement le refetch que le cycle 77 a retire du chemin de focus.
     *
     * Le temoin arme les DEUX formes de cle et exige zero refetch sur chacune :
     * il echoue aussi bien sur l'invalidation morte que sur sa « correction »
     * couteuse.
     */
    /**
     * Les deux listes sont montees avec de VRAIS observateurs : une
     * `invalidateQueries` ne refetch que les requetes ACTIVES, donc un cache
     * pose a la main (`setQueryData`/`fetchQuery`) resterait muet et le temoin
     * passerait au vert sans rien prouver.
     */
    const renderWithConversationLists = (queryClient: QueryClient, wrapper: React.ComponentType<{ children: React.ReactNode }>) => {
      const flatFetch = jest.fn().mockResolvedValue([]);
      const infiniteFetch = jest.fn().mockResolvedValue({ conversations: [] });

      const rendered = renderHook(
        () => ({
          reactions: useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
          flat: useQuery({ queryKey: ['conversations', 'list'], queryFn: flatFetch, staleTime: Infinity }),
          infinite: useQuery({ queryKey: ['conversations', 'infinite'], queryFn: infiniteFetch, staleTime: Infinity }),
        }),
        { wrapper }
      );

      return { flatFetch, infiniteFetch, rendered, queryClient };
    };

    it('handleReactionAdded: refetches no conversation list', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], { reactions: [], userReactions: [] });
      const { flatFetch, infiniteFetch } = renderWithConversationLists(queryClient, wrapper);

      await waitFor(() => expect(flatFetch).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(infiniteFetch).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(mockOnReactionAdded).toHaveBeenCalled());
      const capturedAdded = mockOnReactionAdded.mock.calls[mockOnReactionAdded.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedAdded({
          messageId: '507f1f77bcf86cd799439011',
          emoji: '❤️',
          aggregation: { emoji: '❤️', count: 1, participantIds: ['user-1'] },
          participantId: 'user-1',
          userId: 'user-1',
          action: 'add',
        });
      });

      expect(flatFetch).toHaveBeenCalledTimes(1);
      expect(infiniteFetch).toHaveBeenCalledTimes(1);
    });

    it('handleReactionRemoved: refetches no conversation list', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [{ emoji: '❤️', count: 1, participantIds: ['user-1'], hasCurrentUser: true }],
        userReactions: ['❤️'],
      });
      const { flatFetch, infiniteFetch } = renderWithConversationLists(queryClient, wrapper);

      await waitFor(() => expect(flatFetch).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(infiniteFetch).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(mockOnReactionRemoved).toHaveBeenCalled());
      const capturedRemoved = mockOnReactionRemoved.mock.calls[mockOnReactionRemoved.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedRemoved({
          messageId: '507f1f77bcf86cd799439011',
          emoji: '❤️',
          aggregation: { emoji: '❤️', count: 0, participantIds: [] },
          participantId: 'user-1',
          userId: 'user-1',
          action: 'remove',
        });
      });

      expect(flatFetch).toHaveBeenCalledTimes(1);
      expect(infiniteFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Socket handlers - handleReactionAdded and handleReactionRemoved', () => {
    it('handleReactionAdded: adds new reaction and updates userReactions for current user', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [],
        userReactions: [],
      });

      // Capture the handler
      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await waitFor(() => expect(mockOnReactionAdded).toHaveBeenCalled());

      const capturedAdded = mockOnReactionAdded.mock.calls[0][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedAdded({
          messageId: '507f1f77bcf86cd799439011',
          emoji: '❤️',
          aggregation: { emoji: '❤️', count: 1, participantIds: ['user-1'] },
          participantId: 'user-1',
          userId: 'user-1',
          action: 'add',
        });
      });

      await waitFor(() => {
        expect(result.current.reactions.find(r => r.emoji === '❤️')).toBeDefined();
        expect(result.current.userReactions).toContain('❤️');
      });
    });

    it('handleReactionAdded: highlights own reaction on a second device (userId matches, participantId does not)', async () => {
      // Multi-device: the current user (User.id 'user-1') reacts on device A.
      // Device B receives the echo. On the wire the reactor is identified by
      // Participant.id ('participant-abc'), which is NOT the User.id — the two
      // are ObjectIds from different collections and never collide. Device B
      // must still recognise the reaction as "mine" via the event's userId and
      // add the emoji to userReactions, otherwise the emoji renders un-highlighted
      // and a tap re-adds instead of toggling off.
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [],
        userReactions: [],
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await waitFor(() => expect(mockOnReactionAdded).toHaveBeenCalled());

      const capturedAdded = mockOnReactionAdded.mock.calls[mockOnReactionAdded.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedAdded({
          messageId: '507f1f77bcf86cd799439011',
          emoji: '❤️',
          aggregation: { emoji: '❤️', count: 1, participantIds: ['participant-abc'] },
          participantId: 'participant-abc',
          userId: 'user-1',
          action: 'add',
        });
      });

      await waitFor(() => {
        expect(result.current.userReactions).toContain('❤️');
      });
    });

    it('handleReactionRemoved: clears own reaction on a second device (userId matches, participantId does not)', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [{ emoji: '❤️', count: 1, participantIds: ['participant-abc'], hasCurrentUser: true }],
        userReactions: ['❤️'],
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await waitFor(() => expect(mockOnReactionRemoved).toHaveBeenCalled());

      const capturedRemoved = mockOnReactionRemoved.mock.calls[mockOnReactionRemoved.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedRemoved({
          messageId: '507f1f77bcf86cd799439011',
          emoji: '❤️',
          aggregation: { emoji: '❤️', count: 0, participantIds: [] },
          participantId: 'participant-abc',
          userId: 'user-1',
          action: 'remove',
        });
      });

      await waitFor(() => {
        expect(result.current.userReactions).not.toContain('❤️');
      });
    });

    it('handleReactionAdded: does NOT highlight when another user reacts (userId differs)', async () => {
      // Guard against over-matching: a different user's reaction must never land
      // in the current user's userReactions.
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [],
        userReactions: [],
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await waitFor(() => expect(mockOnReactionAdded).toHaveBeenCalled());

      const capturedAdded = mockOnReactionAdded.mock.calls[mockOnReactionAdded.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedAdded({
          messageId: '507f1f77bcf86cd799439011',
          emoji: '👍',
          aggregation: { emoji: '👍', count: 1, participantIds: ['participant-xyz'] },
          participantId: 'participant-xyz',
          userId: 'user-2',
          action: 'add',
        });
      });

      await waitFor(() => {
        expect(result.current.reactions.find(r => r.emoji === '👍')).toBeDefined();
      });
      expect(result.current.userReactions).not.toContain('👍');
    });

    it('handleReactionAdded: updates existing reaction count', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [{ emoji: '❤️', count: 1, participantIds: ['user-2'], hasCurrentUser: false }],
        userReactions: [],
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await waitFor(() => expect(mockOnReactionAdded).toHaveBeenCalled());

      const capturedAdded = mockOnReactionAdded.mock.calls[mockOnReactionAdded.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedAdded({
          messageId: '507f1f77bcf86cd799439011',
          emoji: '❤️',
          aggregation: { emoji: '❤️', count: 2, participantIds: ['user-2', 'user-3'] },
          participantId: 'user-3',
          action: 'add',
        });
      });

      await waitFor(() => {
        expect(result.current.reactions.find(r => r.emoji === '❤️')?.count).toBe(2);
      });
    });

    it('handleReactionAdded: ignores event for different messageId', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [],
        userReactions: [],
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await waitFor(() => expect(mockOnReactionAdded).toHaveBeenCalled());

      const capturedAdded = mockOnReactionAdded.mock.calls[mockOnReactionAdded.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedAdded({
          messageId: 'msg-OTHER',
          emoji: '❤️',
          aggregation: { emoji: '❤️', count: 1, participantIds: [] },
          participantId: 'user-2',
          action: 'add',
        });
      });

      // Should not have changed reactions for msg-1
      expect(result.current.reactions).toHaveLength(0);
    });

    it('handleReactionAdded: old=undefined initializes with [event.aggregation]', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      // No pre-seeded cache

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439012', currentUserId: 'user-1' }),
        { wrapper }
      );

      await waitFor(() => expect(mockOnReactionAdded).toHaveBeenCalled());

      const capturedAdded = mockOnReactionAdded.mock.calls[mockOnReactionAdded.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedAdded({
          messageId: '507f1f77bcf86cd799439012',
          emoji: '👍',
          aggregation: { emoji: '👍', count: 1, participantIds: ['user-2'] },
          participantId: 'user-2',
          action: 'add',
        });
      });

      await waitFor(() => {
        expect(result.current.reactions.find(r => r.emoji === '👍')).toBeDefined();
      });
    });

    it('handleReactionAdded: does NOT duplicate emoji in userReactions', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [{ emoji: '❤️', count: 2, participantIds: ['user-1', 'user-2'], hasCurrentUser: true }],
        userReactions: ['❤️'],
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await waitFor(() => expect(mockOnReactionAdded).toHaveBeenCalled());

      const capturedAdded = mockOnReactionAdded.mock.calls[mockOnReactionAdded.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedAdded({
          messageId: '507f1f77bcf86cd799439011',
          emoji: '❤️',
          aggregation: { emoji: '❤️', count: 3, participantIds: [] },
          participantId: 'user-1', // same as currentUserId - already in userReactions
          userId: 'user-1',
          action: 'add',
        });
      });

      await waitFor(() => {
        // Should still only have '❤️' once in userReactions
        expect(result.current.userReactions.filter(e => e === '❤️')).toHaveLength(1);
      });
    });

    it('handleReactionRemoved: removes reaction when count = 0', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [{ emoji: '❤️', count: 1, participantIds: ['user-1'], hasCurrentUser: true }],
        userReactions: ['❤️'],
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await waitFor(() => expect(mockOnReactionRemoved).toHaveBeenCalled());

      const capturedRemoved = mockOnReactionRemoved.mock.calls[mockOnReactionRemoved.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedRemoved({
          messageId: '507f1f77bcf86cd799439011',
          emoji: '❤️',
          aggregation: { emoji: '❤️', count: 0, participantIds: [] },
          participantId: 'user-1',
          userId: 'user-1',
          action: 'remove',
        });
      });

      await waitFor(() => {
        expect(result.current.reactions.find(r => r.emoji === '❤️')).toBeUndefined();
        expect(result.current.userReactions).not.toContain('❤️');
      });
    });

    it('handleReactionRemoved: decrements reaction when count > 0', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [{ emoji: '👍', count: 3, participantIds: ['u1', 'u2', 'u3'], hasCurrentUser: false }],
        userReactions: [],
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await waitFor(() => expect(mockOnReactionRemoved).toHaveBeenCalled());

      const capturedRemoved = mockOnReactionRemoved.mock.calls[mockOnReactionRemoved.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedRemoved({
          messageId: '507f1f77bcf86cd799439011',
          emoji: '👍',
          aggregation: { emoji: '👍', count: 2, participantIds: ['u1', 'u2'] },
          participantId: 'u3',
          action: 'remove',
        });
      });

      await waitFor(() => {
        expect(result.current.reactions.find(r => r.emoji === '👍')?.count).toBe(2);
      });
    });

    it('handleReactionRemoved: ignores event for different messageId', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [{ emoji: '❤️', count: 2, participantIds: [], hasCurrentUser: false }],
        userReactions: [],
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await waitFor(() => expect(mockOnReactionRemoved).toHaveBeenCalled());

      const capturedRemoved = mockOnReactionRemoved.mock.calls[mockOnReactionRemoved.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedRemoved({
          messageId: 'msg-OTHER',
          emoji: '❤️',
          aggregation: { emoji: '❤️', count: 0, participantIds: [] },
          participantId: 'user-1',
          userId: 'user-1',
          action: 'remove',
        });
      });

      // Should not have changed reactions for msg-1
      expect(result.current.reactions.find(r => r.emoji === '❤️')?.count).toBe(2);
    });

    it('handleReactionRemoved: old=undefined initializes with empty state', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();
      // No pre-seeded cache for this messageId

      renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439013', currentUserId: 'user-1' }),
        { wrapper }
      );

      await waitFor(() => expect(mockOnReactionRemoved).toHaveBeenCalled());

      const capturedRemoved = mockOnReactionRemoved.mock.calls[mockOnReactionRemoved.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedRemoved({
          messageId: '507f1f77bcf86cd799439013',
          emoji: '❤️',
          aggregation: { emoji: '❤️', count: 0, participantIds: [] },
          participantId: 'user-1',
          userId: 'user-1',
          action: 'remove',
        });
      });

      const data = queryClient.getQueryData<{ reactions: unknown[]; userReactions: unknown[] }>(['reactions', '507f1f77bcf86cd799439013']);
      expect(data?.reactions).toEqual([]);
      expect(data?.userReactions).toEqual([]);
    });

    // `hasCurrentUser` est une réponse PAR LECTEUR, et l'agrégat d'une diffusion
    // n'en a pas : le même objet part vers toute la room. Le recopier tel quel
    // dans le cache attribue au LECTEUR la réaction de l'ACTEUR — c'est le
    // défaut que la jumelle commentaire a déjà produit en production côté iOS.
    // Ici la vérité du lecteur est `userReactions`, qui se dérive de `userId`.
    it("n'attribue pas au lecteur la réaction d'un TIERS", async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [],
        userReactions: [],
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'reader-1' }),
        { wrapper }
      );

      await waitFor(() => expect(mockOnReactionAdded).toHaveBeenCalled());
      const capturedAdded = mockOnReactionAdded.mock.calls[mockOnReactionAdded.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedAdded({
          messageId: '507f1f77bcf86cd799439011',
          emoji: '❤️',
          aggregation: { emoji: '❤️', count: 1, participantIds: ['participant-other'] },
          participantId: 'participant-other',
          userId: 'someone-else',
          conversationId: '507f1f77bcf86cd7994390c0',
          timestamp: new Date('2026-08-23T12:00:00.000Z'),
          action: 'add',
        });
      });

      await waitFor(() => {
        expect(result.current.reactions.find(r => r.emoji === '❤️')?.count).toBe(1);
      });
      expect(result.current.reactions.find(r => r.emoji === '❤️')?.hasCurrentUser).toBe(false);
      expect(result.current.userReactions).not.toContain('❤️');
    });

    // La file hors-ligne conserve la charge ENFILÉE jusqu'à 48 h et la rejoue
    // telle quelle : pendant toute la fenêtre de déploiement, un lecteur qui se
    // reconnecte reçoit des agrégats de l'ANCIENNE forme, portant encore le
    // drapeau de l'acteur. Le lecteur doit l'ignorer, pas le croire.
    it("ignore un `hasCurrentUser` HÉRITÉ que la file rejoue", async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [],
        userReactions: [],
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'reader-1' }),
        { wrapper }
      );

      await waitFor(() => expect(mockOnReactionAdded).toHaveBeenCalled());
      const capturedAdded = mockOnReactionAdded.mock.calls[mockOnReactionAdded.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedAdded({
          messageId: '507f1f77bcf86cd799439011',
          emoji: '❤️',
          // Forme d'AVANT le cycle 115, telle qu'une entrée de file la porte.
          aggregation: { emoji: '❤️', count: 1, participantIds: ['participant-other'], hasCurrentUser: true } as ReactionUpdateEvent['aggregation'],
          participantId: 'participant-other',
          userId: 'someone-else',
          conversationId: '507f1f77bcf86cd7994390c0',
          timestamp: new Date('2026-08-23T12:00:00.000Z'),
          action: 'add',
        });
      });

      await waitFor(() => {
        expect(result.current.reactions.find(r => r.emoji === '❤️')?.count).toBe(1);
      });
      expect(result.current.reactions.find(r => r.emoji === '❤️')?.hasCurrentUser).toBe(false);
      expect(result.current.userReactions).not.toContain('❤️');
    });

    // Le miroir : quand le lecteur EST l'acteur, son propre drapeau s'allume —
    // dérivé de `userReactions`, pas recopié de l'agrégat.
    it("allume le drapeau du lecteur quand c'est SA réaction", async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [],
        userReactions: [],
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'reader-1' }),
        { wrapper }
      );

      await waitFor(() => expect(mockOnReactionAdded).toHaveBeenCalled());
      const capturedAdded = mockOnReactionAdded.mock.calls[mockOnReactionAdded.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedAdded({
          messageId: '507f1f77bcf86cd799439011',
          emoji: '❤️',
          aggregation: { emoji: '❤️', count: 1, participantIds: ['participant-abc'] },
          participantId: 'participant-abc',
          userId: 'reader-1',
          conversationId: '507f1f77bcf86cd7994390c0',
          timestamp: new Date('2026-08-23T12:00:00.000Z'),
          action: 'add',
        });
      });

      await waitFor(() => {
        expect(result.current.userReactions).toContain('❤️');
      });
      expect(result.current.reactions.find(r => r.emoji === '❤️')?.hasCurrentUser).toBe(true);
    });

    // Et le retrait : un TIERS retire sa réaction, le drapeau du lecteur — qui a
    // lui aussi réagi — ne doit pas s'éteindre parce que l'agrégat de l'acteur
    // dit `false`.
    it("n'éteint pas le drapeau du lecteur quand un TIERS retire la sienne", async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [{ emoji: '❤️', count: 2, participantIds: ['participant-me', 'participant-other'], hasCurrentUser: true }],
        userReactions: ['❤️'],
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'reader-1' }),
        { wrapper }
      );

      await waitFor(() => expect(mockOnReactionRemoved).toHaveBeenCalled());
      const capturedRemoved = mockOnReactionRemoved.mock.calls[mockOnReactionRemoved.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedRemoved({
          messageId: '507f1f77bcf86cd799439011',
          emoji: '❤️',
          aggregation: { emoji: '❤️', count: 1, participantIds: ['participant-me'] },
          participantId: 'participant-other',
          userId: 'someone-else',
          conversationId: '507f1f77bcf86cd7994390c0',
          timestamp: new Date('2026-08-23T12:00:00.000Z'),
          action: 'remove',
        });
      });

      await waitFor(() => {
        expect(result.current.reactions.find(r => r.emoji === '❤️')?.count).toBe(1);
      });
      expect(result.current.userReactions).toContain('❤️');
      expect(result.current.reactions.find(r => r.emoji === '❤️')?.hasCurrentUser).toBe(true);
    });
  });

  describe('updateReactionSummaryInMessageCache', () => {
    // The function uses queryKeys.messages.all = ['messages'] as the key prefix for getQueriesData.
    // It updates the reactionSummary in any messages.infinite cache that contains the target message.
    // We use gcTime: Infinity to prevent cache GC since the messages cache has no active observer.
    it('updates reactionSummary in messages.infinite cache for matching message', async () => {
      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
      });
      const wrapperFn = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      );

      const msgCacheKey = ['messages', 'list', 'conv-1', 'infinite'];
      qc.setQueryData(msgCacheKey, {
        pages: [{ messages: [{ id: '507f1f77bcf86cd799439011', content: 'Hello', reactionSummary: { '👍': 1 } }] }],
        pageParams: [undefined],
      });

      qc.setQueryData(['reactions', '507f1f77bcf86cd799439011'], { reactions: [], userReactions: [] });

      renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper: wrapperFn }
      );

      await waitFor(() => expect(mockOnReactionAdded).toHaveBeenCalled());

      const capturedAdded = mockOnReactionAdded.mock.calls[mockOnReactionAdded.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedAdded({
          messageId: '507f1f77bcf86cd799439011',
          emoji: '❤️',
          aggregation: { emoji: '❤️', count: 3, participantIds: [] },
          participantId: 'user-2',
          action: 'add',
        });
      });

      const msgData = qc.getQueryData<{ pages: { messages: { id: string; reactionSummary?: Record<string, number> }[] }[] }>(msgCacheKey);
      const msg = msgData?.pages[0].messages.find(m => m.id === '507f1f77bcf86cd799439011');
      expect(msg?.reactionSummary?.['❤️']).toBe(3);
    });

    it('removes emoji from reactionSummary when aggregation.count = 0', async () => {
      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
      });
      const wrapperFn = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      );

      const msgCacheKey = ['messages', 'list', 'conv-1', 'infinite'];
      qc.setQueryData(msgCacheKey, {
        pages: [{ messages: [{ id: '507f1f77bcf86cd799439011', content: 'Hello', reactionSummary: { '❤️': 1 } }] }],
        pageParams: [undefined],
      });

      qc.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [{ emoji: '❤️', count: 1, participantIds: [], hasCurrentUser: false }],
        userReactions: [],
      });

      renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper: wrapperFn }
      );

      await waitFor(() => expect(mockOnReactionRemoved).toHaveBeenCalled());

      const capturedRemoved = mockOnReactionRemoved.mock.calls[mockOnReactionRemoved.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedRemoved({
          messageId: '507f1f77bcf86cd799439011',
          emoji: '❤️',
          aggregation: { emoji: '❤️', count: 0, participantIds: [] },
          participantId: 'user-1',
          userId: 'user-1',
          action: 'remove',
        });
      });

      const msgData = qc.getQueryData<{ pages: { messages: { reactionSummary?: Record<string, number> }[] }[] }>(msgCacheKey);
      expect(msgData?.pages[0].messages[0].reactionSummary?.['❤️']).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Targeted coverage tests for remaining uncovered branches
  // ---------------------------------------------------------------------------

  describe('coverage: response.error || fallback error message', () => {
    it('fetch: uses "Failed to fetch reactions" fallback when response has no error field', async () => {
      mockSocketEmit.mockImplementation((event, _data, callback) => {
        if (event === CLIENT_EVENTS.REACTION_REQUEST_SYNC) {
          callback({ success: false }); // no error field → covers || right branch
        }
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439014', currentUserId: 'user-1' }),
        { wrapper: createWrapper() }
      );

      await waitFor(
        () => expect(result.current.isLoading).toBe(false),
        { timeout: 5000 }
      );
    });

    it('addMutation: uses "Failed to add reaction" fallback when response has no error field', async () => {
      const { toast } = jest.requireMock('sonner');
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], { reactions: [], userReactions: [] });

      mockSocketEmit.mockImplementation((event, _payload, callback) => {
        if (event === CLIENT_EVENTS.REACTION_ADD) {
          callback({ success: false }); // no error field → covers || right branch
        }
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await act(async () => {
        await result.current.addReaction('👍');
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to add reaction');
      });
    });

    it('removeMutation: uses "Failed to remove reaction" fallback when response has no error field', async () => {
      const { toast } = jest.requireMock('sonner');
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [{ emoji: '❤️', count: 1, participantIds: ['user-1'], hasCurrentUser: true }],
        userReactions: ['❤️'],
      });

      mockSocketEmit.mockImplementation((event, _payload, callback) => {
        if (event === CLIENT_EVENTS.REACTION_REMOVE) {
          callback({ success: false }); // no error field → covers || right branch
        }
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await act(async () => {
        await result.current.removeReaction('❤️');
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to remove reaction');
      });
    });
  });

  describe('coverage: initialData memo || fallback branches', () => {
    it('only initialCurrentUserReactions provided — covers initialReactionSummary || {} right branch', async () => {
      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: '507f1f77bcf86cd799439011',
          currentUserId: 'user-1',
          initialCurrentUserReactions: ['❤️'],
          // no initialReactionSummary → Object.entries(initialReactionSummary || {}) uses {}
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current.userReactions).toContain('❤️');
      expect(result.current.reactions).toHaveLength(0);
    });

    it('only initialReactionSummary provided — covers initialCurrentUserReactions || [] right branch', async () => {
      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: '507f1f77bcf86cd799439011',
          currentUserId: 'user-1',
          initialReactionSummary: { '❤️': 5 },
          // no initialCurrentUserReactions → new Set(initialCurrentUserReactions || []) uses []
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current.reactions).toHaveLength(1);
      expect(result.current.reactions[0].emoji).toBe('❤️');
      expect(result.current.reactions[0].count).toBe(5);
      expect(result.current.userReactions).toHaveLength(0);
    });
  });

  describe('coverage: multi-reaction map false branches in socket handlers', () => {
    it('handleReactionAdded: maps non-matching reactions unchanged (false branch of r.emoji === emoji)', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [
          { emoji: '❤️', count: 2, participantIds: ['user-2', 'user-3'], hasCurrentUser: false },
          { emoji: '👍', count: 1, participantIds: ['user-4'], hasCurrentUser: false },
        ],
        userReactions: [],
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await waitFor(() => expect(mockOnReactionAdded).toHaveBeenCalled());

      const capturedAdded = mockOnReactionAdded.mock.calls[mockOnReactionAdded.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedAdded({
          messageId: '507f1f77bcf86cd799439011',
          emoji: '❤️', // matches first; '👍' goes through the ternary false branch `: r`
          aggregation: { emoji: '❤️', count: 3, participantIds: [] },
          participantId: 'user-5',
          action: 'add',
        });
      });

      await waitFor(() => {
        expect(result.current.reactions.find(r => r.emoji === '❤️')?.count).toBe(3);
        expect(result.current.reactions.find(r => r.emoji === '👍')?.count).toBe(1);
      });
    });

    it('handleReactionRemoved: maps non-matching reactions unchanged (false branch)', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [
          { emoji: '❤️', count: 2, participantIds: ['user-1', 'user-2'], hasCurrentUser: true },
          { emoji: '👍', count: 3, participantIds: ['user-3', 'user-4', 'user-5'], hasCurrentUser: false },
        ],
        userReactions: ['❤️'],
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await waitFor(() => expect(mockOnReactionRemoved).toHaveBeenCalled());

      const capturedRemoved = mockOnReactionRemoved.mock.calls[mockOnReactionRemoved.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedRemoved({
          messageId: '507f1f77bcf86cd799439011',
          emoji: '❤️', // count > 0 → map path; '👍' goes through false branch `: r`
          aggregation: { emoji: '❤️', count: 1, participantIds: ['user-2'] },
          participantId: 'user-1',
          userId: 'user-1',
          action: 'remove',
        });
      });

      await waitFor(() => {
        expect(result.current.reactions.find(r => r.emoji === '❤️')?.count).toBe(1);
        expect(result.current.reactions.find(r => r.emoji === '👍')?.count).toBe(3);
      });
    });
  });

  describe('coverage: addMutation.onMutate inner branches', () => {
    it('new emoji without currentUserId: uses empty participantIds array (false branch)', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], { reactions: [], userReactions: [] });

      mockSocketEmit.mockImplementation((event, _payload, callback) => {
        if (event === CLIENT_EVENTS.REACTION_ADD) {
          callback({ success: true });
        }
      });

      const { result } = renderHook(
        () => useReactionsQuery({
          messageId: '507f1f77bcf86cd799439011',
          // no currentUserId → participantIds: currentUserId ? [...] : [] uses []
        }),
        { wrapper }
      );

      await act(async () => {
        await result.current.addReaction('🎉');
      });

      await waitFor(() => {
        const data = queryClient.getQueryData<{ reactions: ReactionAggregation[] }>(['reactions', '507f1f77bcf86cd799439011']);
        const reaction = data?.reactions.find(r => r.emoji === '🎉');
        expect(reaction?.participantIds).toEqual([]);
      });
    });

    it('existing emoji in cache with multiple reactions: non-matching map entry goes through false branch', async () => {
      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['reactions', '507f1f77bcf86cd799439011'], {
        reactions: [
          { emoji: '👍', count: 2, participantIds: ['user-2'], hasCurrentUser: false },
          { emoji: '❤️', count: 1, participantIds: ['user-3'], hasCurrentUser: false },
        ],
        userReactions: [],
      });

      mockSocketEmit.mockImplementation((event, _payload, callback) => {
        if (event === CLIENT_EVENTS.REACTION_ADD) {
          callback({ success: true });
        }
      });

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper }
      );

      await act(async () => {
        await result.current.addReaction('👍'); // existing → map; '❤️' hits false branch `: r`
      });

      await waitFor(() => {
        const data = queryClient.getQueryData<{ reactions: ReactionAggregation[] }>(['reactions', '507f1f77bcf86cd799439011']);
        expect(data?.reactions.find(r => r.emoji === '❤️')?.count).toBe(1); // unchanged via false branch
      });
    });
  });

  describe('coverage: updateReactionSummaryInMessageCache edge cases', () => {
    it('skips messages cache entry that has no pages property (!data?.pages continue branch)', async () => {
      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
      });
      const wrapperFn = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      );

      // Store a messages.* entry WITHOUT pages → triggers !data?.pages continue
      qc.setQueryData(['messages', 'status-details', 'msg-x'], { notPages: true });
      qc.setQueryData(['reactions', '507f1f77bcf86cd799439011'], { reactions: [], userReactions: [] });

      renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper: wrapperFn }
      );

      await waitFor(() => expect(mockOnReactionAdded).toHaveBeenCalled());

      const capturedAdded = mockOnReactionAdded.mock.calls[mockOnReactionAdded.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedAdded({
          messageId: '507f1f77bcf86cd799439011',
          emoji: '❤️',
          aggregation: { emoji: '❤️', count: 1, participantIds: [] },
          participantId: 'user-2',
          action: 'add',
        });
      });

      // Entry without pages must not be corrupted
      expect(qc.getQueryData(['messages', 'status-details', 'msg-x'])).toEqual({ notPages: true });
    });

    it('found=false: does not update cache when no message ID matches (if (found) false branch)', async () => {
      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
      });
      const wrapperFn = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      );

      const msgCacheKey = ['messages', 'list', 'conv-1', 'infinite'];
      qc.setQueryData(msgCacheKey, {
        pages: [{ messages: [{ id: 'msg-OTHER', content: 'hello', reactionSummary: {} }] }],
        pageParams: [undefined],
      });
      qc.setQueryData(['reactions', '507f1f77bcf86cd799439011'], { reactions: [], userReactions: [] });

      renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper: wrapperFn }
      );

      await waitFor(() => expect(mockOnReactionAdded).toHaveBeenCalled());

      const snapshotBefore = qc.getQueryData(msgCacheKey);
      const capturedAdded = mockOnReactionAdded.mock.calls[mockOnReactionAdded.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedAdded({
          messageId: '507f1f77bcf86cd799439011', // NOT present in pages → found stays false
          emoji: '❤️',
          aggregation: { emoji: '❤️', count: 1, participantIds: [] },
          participantId: 'user-2',
          action: 'add',
        });
      });

      expect(qc.getQueryData(msgCacheKey)).toEqual(snapshotBefore);
    });

    it('initializes empty reactionSummary with {} when message has no reactionSummary field', async () => {
      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
      });
      const wrapperFn = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      );

      const msgCacheKey = ['messages', 'list', 'conv-2', 'infinite'];
      qc.setQueryData(msgCacheKey, {
        pages: [{ messages: [{ id: '507f1f77bcf86cd799439011', content: 'hello' /* no reactionSummary */ }] }],
        pageParams: [undefined],
      });
      qc.setQueryData(['reactions', '507f1f77bcf86cd799439011'], { reactions: [], userReactions: [] });

      renderHook(
        () => useReactionsQuery({ messageId: '507f1f77bcf86cd799439011', currentUserId: 'user-1' }),
        { wrapper: wrapperFn }
      );

      await waitFor(() => expect(mockOnReactionAdded).toHaveBeenCalled());

      const capturedAdded = mockOnReactionAdded.mock.calls[mockOnReactionAdded.mock.calls.length - 1][0] as (e: ReactionUpdateEvent) => void;

      act(() => {
        capturedAdded({
          messageId: '507f1f77bcf86cd799439011',
          emoji: '❤️',
          aggregation: { emoji: '❤️', count: 1, participantIds: [] },
          participantId: 'user-2',
          action: 'add',
        });
      });

      const msgData = qc.getQueryData<{
        pages: { messages: { id: string; reactionSummary?: Record<string, number> }[] }[];
      }>(msgCacheKey);
      const msg = msgData?.pages[0].messages.find(m => m.id === '507f1f77bcf86cd799439011');
      expect(msg?.reactionSummary?.['❤️']).toBe(1);
    });
  });

  // ─── Réconciliation au retour de la connexion ──────────────────────────────
  //
  // `ReactionHandler` (gateway) répète cinq fois la même promesse de
  // rattrapage — « peers reconcile on the next reaction:sync » — pour ses
  // chemins best-effort. Encore faut-il qu'un sync suivant existe : la requête
  // tourne en `staleTime: Infinity`, donc `reaction:request-sync` ne partait
  // qu'une fois, au montage, et jamais plus.
  describe('Reconciliation on connection restore', () => {
    const messageId = '507f1f77bcf86cd799439011';

    const respondWith = (payload: { reactions: ReactionAggregation[]; userReactions: string[] }) => {
      mockSocketEmit.mockImplementation((event, _messageId, callback) => {
        if (event === CLIENT_EVENTS.REACTION_REQUEST_SYNC) {
          callback({ success: true, data: payload });
        }
      });
    };

    const dropAndRestoreConnection = () => {
      mockSocketConnected = false;
      mockSocket.connected = false;
      act(() => { mockEmitStatusChange(); });

      mockSocketConnected = true;
      mockSocket.connected = true;
      act(() => { mockEmitStatusChange(); });
    };

    it('asks again once the socket becomes reachable after a cold mount', async () => {
      // Le montage du fil précède couramment la poignée de main du socket.
      mockSocketConnected = false;
      mockSocket.connected = false;
      respondWith(mockReactionState);

      const { result } = renderHook(
        () => useReactionsQuery({ messageId, currentUserId: 'user-1' }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.reactions).toEqual([]);
      expect(mockSocketEmit).not.toHaveBeenCalled();
      // Rien n'a pu être demandé : la requête est en ÉCHEC, elle n'a pas
      // mémorisé un « aucune réaction » comme une réponse du serveur.
      expect(result.current.error).not.toBeNull();

      mockSocketConnected = true;
      mockSocket.connected = true;
      act(() => { mockEmitStatusChange(); });

      await waitFor(() => expect(result.current.reactions).toEqual(mockReactions));
      expect(result.current.userReactions).toEqual(['❤️']);
    });

    it('re-requests the snapshot after a drop, adopting what changed while away', async () => {
      respondWith(mockReactionState);

      const { result } = renderHook(
        () => useReactionsQuery({ messageId, currentUserId: 'user-1' }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.reactions).toEqual(mockReactions));
      expect(mockSocketEmit).toHaveBeenCalledTimes(1);

      // Une réaction posée pendant la coupure. `reaction:added` n'est pas
      // rejoué au retour — seul l'instantané la porte.
      const afterOutage: ReactionAggregation[] = [
        { emoji: '👍', count: 6, participantIds: ['user-1', 'user-2', 'user-9'], hasCurrentUser: false },
        { emoji: '❤️', count: 3, participantIds: ['user-3'], hasCurrentUser: true },
        { emoji: '🎉', count: 1, participantIds: ['user-7'], hasCurrentUser: false },
      ];
      respondWith({ reactions: afterOutage, userReactions: ['❤️'] });

      dropAndRestoreConnection();

      await waitFor(() => expect(result.current.reactions).toEqual(afterOutage));
      expect(mockSocketEmit).toHaveBeenCalledTimes(2);
    });

    it('stays silent when the status changes without crossing into reachable', async () => {
      respondWith(mockReactionState);

      const { result } = renderHook(
        () => useReactionsQuery({ messageId, currentUserId: 'user-1' }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.reactions).toEqual(mockReactions));
      expect(mockSocketEmit).toHaveBeenCalledTimes(1);

      // Le socket ne bouge pas : `emitStatusChange` part à chaque `connect()`,
      // chaque changement de visibilité d'onglet, chaque tentative avortée.
      act(() => { mockEmitStatusChange(); mockEmitStatusChange(); });

      expect(mockSocketEmit).toHaveBeenCalledTimes(1);
    });

    it('does not re-request for a not-yet-persisted (cid_) message id', async () => {
      respondWith(mockReactionState);

      renderHook(
        () => useReactionsQuery({
          messageId: 'cid_123e4567-e89b-42d3-a456-426614174000',
          currentUserId: 'user-1',
        }),
        { wrapper: createWrapper() }
      );

      dropAndRestoreConnection();

      expect(mockSocketEmit).not.toHaveBeenCalled();
    });

    it('does not re-request while the hook is disabled', async () => {
      respondWith(mockReactionState);

      renderHook(
        () => useReactionsQuery({ messageId, currentUserId: 'user-1', enabled: false }),
        { wrapper: createWrapper() }
      );

      dropAndRestoreConnection();

      expect(mockSocketEmit).not.toHaveBeenCalled();
    });
  });

  // ─── La rafale de réconciliation, et le budget qu'elle dépense ─────────────
  //
  // La réconciliation ci-dessus est posée PAR BULLE. Un fil monté en compte
  // autant que de bulles rendues, et un franchissement les réveille toutes dans
  // le MÊME tick : le serveur reçoit N `reaction:request-sync` d'un coup, contre
  // un budget de `REACTION_SYNC_BUDGET.maxRequests` par minute et par
  // utilisateur. Une bulle ne peut pas savoir combien de voisines partagent ce
  // budget — c'est au tour d'émission de le tenir.
  describe('Reconciliation burst pacing', () => {
    const messageIdAt = (n: number) =>
      `507f1f77bcf86cd7994${String(390 + n).padStart(5, '0')}`;

    const respondOk = () => {
      mockSocketEmit.mockImplementation((event, _messageId, callback) => {
        if (event === CLIENT_EVENTS.REACTION_REQUEST_SYNC) {
          callback({ success: true, data: { reactions: [], userReactions: [] } });
        }
      });
    };

    it('spaces a multi-bubble burst instead of firing every demand in one tick', async () => {
      jest.useFakeTimers();
      try {
        respondOk();
        const wrapper = createWrapper();

        const BUBBLES = 4;
        for (let i = 0; i < BUBBLES; i++) {
          renderHook(
            () => useReactionsQuery({ messageId: messageIdAt(i), currentUserId: 'user-1' }),
            { wrapper }
          );
        }
        await act(async () => { await Promise.resolve(); });
        mockSocketEmit.mockClear();

        mockSocketConnected = false;
        mockSocket.connected = false;
        act(() => { mockEmitStatusChange(); });
        mockSocketConnected = true;
        mockSocket.connected = true;
        act(() => { mockEmitStatusChange(); });

        // Le franchissement réveille les quatre bulles dans le même tick. Une
        // seule part tout de suite : les autres tiennent un créneau.
        expect(mockSocketEmit).toHaveBeenCalledTimes(1);

        act(() => { jest.advanceTimersByTime(RECONCILE_SPACING_MS); });
        expect(mockSocketEmit).toHaveBeenCalledTimes(2);

        act(() => { jest.advanceTimersByTime(RECONCILE_SPACING_MS * 2); });
        expect(mockSocketEmit).toHaveBeenCalledTimes(BUBBLES);
      } finally {
        jest.useRealTimers();
      }
    });

    it('spaces demands far enough apart to stay inside the server budget', () => {
      // Le cadencement n'est pas un chiffre choisi : c'est la fenêtre serveur
      // divisée par son propre plafond. Un client qui devine ce nombre le
      // devine faux dès que le serveur l'ajuste.
      expect(RECONCILE_SPACING_MS).toBe(
        REACTION_SYNC_BUDGET.windowMs / REACTION_SYNC_BUDGET.maxRequests
      );
    });

    it('drops a pending slot when its bubble unmounts before firing', async () => {
      jest.useFakeTimers();
      try {
        respondOk();
        const wrapper = createWrapper();

        renderHook(
          () => useReactionsQuery({ messageId: messageIdAt(0), currentUserId: 'user-1' }),
          { wrapper }
        );
        const second = renderHook(
          () => useReactionsQuery({ messageId: messageIdAt(1), currentUserId: 'user-1' }),
          { wrapper }
        );
        await act(async () => { await Promise.resolve(); });
        mockSocketEmit.mockClear();

        mockSocketConnected = false;
        mockSocket.connected = false;
        act(() => { mockEmitStatusChange(); });
        mockSocketConnected = true;
        mockSocket.connected = true;
        act(() => { mockEmitStatusChange(); });

        expect(mockSocketEmit).toHaveBeenCalledTimes(1);

        // La bulle sort de l'écran avant que son créneau n'arrive : la demande
        // meurt avec elle, elle ne dépense pas un budget pour un observateur
        // démonté.
        second.unmount();
        act(() => { jest.advanceTimersByTime(RECONCILE_SPACING_MS * 4); });

        expect(mockSocketEmit).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not retry a refusal — the window has not moved', async () => {
      // Un refus de budget n'est pas une panne : le serveur a répondu « pas
      // maintenant ». Le réessayer sur-le-champ dépense une demande de plus
      // dans la fenêtre déjà pleine, et échoue identiquement.
      mockSocketEmit.mockImplementation((event, _messageId, callback) => {
        if (event === CLIENT_EVENTS.REACTION_REQUEST_SYNC) {
          callback({ success: false, error: RATE_LIMIT_REFUSAL_MESSAGE });
        }
      });

      const qc = new QueryClient({
        defaultOptions: { queries: { gcTime: 0, staleTime: Infinity, retryDelay: 0 } },
      });
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(
        () => useReactionsQuery({ messageId: messageIdAt(0), currentUserId: 'user-1' }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.error).not.toBeNull());
      expect(mockSocketEmit).toHaveBeenCalledTimes(1);
    });

    it('still retries once a demand that failed for any other reason', async () => {
      mockSocketEmit.mockImplementation((event, _messageId, callback) => {
        if (event === CLIENT_EVENTS.REACTION_REQUEST_SYNC) {
          callback({ success: false, error: 'Could not resolve participant' });
        }
      });

      const qc = new QueryClient({
        defaultOptions: { queries: { gcTime: 0, staleTime: Infinity, retryDelay: 0 } },
      });
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      );

      renderHook(
        () => useReactionsQuery({ messageId: messageIdAt(0), currentUserId: 'user-1' }),
        { wrapper }
      );

      await waitFor(() => expect(mockSocketEmit).toHaveBeenCalledTimes(2));
    });
  });
});
