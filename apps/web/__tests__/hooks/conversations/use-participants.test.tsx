/**
 * Tests for useParticipants hook
 *
 * Tests cover:
 * - Initial state (empty participants, isLoading false)
 * - Loading participants from service
 * - Mapping authenticated participants
 * - Mapping anonymous participants
 * - Deduplication logic (authenticated takes priority)
 * - Error handling
 * - Ref synchronization
 * - UserStore integration
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useParticipants } from '@/hooks/conversations/use-participants';

// Mock the conversations service
const mockGetAllParticipants = jest.fn();

jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getAllParticipants: (...args: any[]) => mockGetAllParticipants(...args),
  },
}));

// Mock the user store
const mockSetParticipants = jest.fn();

jest.mock('@/stores/user-store', () => ({
  useUserStore: () => ({
    setParticipants: mockSetParticipants,
  }),
}));

describe('useParticipants', () => {
  const mockConversationId = 'conv-123';

  const mockAuthenticatedUser = {
    id: 'auth-user-1',
    username: 'authuser',
    displayName: 'Auth User',
    email: 'auth@example.com',
    role: 'MEMBER',
    isActive: true,
    systemLanguage: 'en',
    regionalLanguage: 'en',
  };

  const mockAnonymousParticipant = {
    id: 'anon-user-1',
    username: 'AnonUser123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should return empty participants initially', () => {
      const { result } = renderHook(() =>
        useParticipants({ conversationId: null })
      );

      expect(result.current.participants).toEqual([]);
    });

    it('should return isLoading false initially', () => {
      const { result } = renderHook(() =>
        useParticipants({ conversationId: null })
      );

      expect(result.current.isLoading).toBe(false);
    });

    it('should return a participantsRef', () => {
      const { result } = renderHook(() =>
        useParticipants({ conversationId: null })
      );

      expect(result.current.participantsRef).toBeDefined();
      expect(result.current.participantsRef.current).toEqual([]);
    });

    it('should return loadParticipants function', () => {
      const { result } = renderHook(() =>
        useParticipants({ conversationId: null })
      );

      expect(typeof result.current.loadParticipants).toBe('function');
    });
  });

  describe('Loading Participants', () => {
    it('should set isLoading true during load', async () => {
      // Create a promise that we can control
      let resolvePromise: (value: any) => void;
      const controlledPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockGetAllParticipants.mockReturnValue(controlledPromise);

      const { result } = renderHook(() =>
        useParticipants({ conversationId: mockConversationId })
      );

      // Start loading
      act(() => {
        result.current.loadParticipants(mockConversationId);
      });

      // Should be loading
      expect(result.current.isLoading).toBe(true);

      // Resolve the promise
      await act(async () => {
        resolvePromise!({
          authenticatedParticipants: [],
          anonymousParticipants: [],
        });
      });

      // Should not be loading anymore
      expect(result.current.isLoading).toBe(false);
    });

    it('should load authenticated participants', async () => {
      mockGetAllParticipants.mockResolvedValue({
        authenticatedParticipants: [mockAuthenticatedUser],
        anonymousParticipants: [],
      });

      const { result } = renderHook(() =>
        useParticipants({ conversationId: mockConversationId })
      );

      await act(async () => {
        await result.current.loadParticipants(mockConversationId);
      });

      expect(result.current.participants).toHaveLength(1);
      expect(result.current.participants[0].userId).toBe('auth-user-1');
      expect(result.current.participants[0].isAnonymous).toBe(false);
      expect(result.current.participants[0].user).toBeDefined();
    });

    it('should load anonymous participants', async () => {
      mockGetAllParticipants.mockResolvedValue({
        authenticatedParticipants: [],
        anonymousParticipants: [mockAnonymousParticipant],
      });

      const { result } = renderHook(() =>
        useParticipants({ conversationId: mockConversationId })
      );

      await act(async () => {
        await result.current.loadParticipants(mockConversationId);
      });

      expect(result.current.participants).toHaveLength(1);
      expect(result.current.participants[0].userId).toBe('anon-user-1');
      expect(result.current.participants[0].isAnonymous).toBe(true);
    });

    it('should map anonymous participant with generated user object', async () => {
      mockGetAllParticipants.mockResolvedValue({
        authenticatedParticipants: [],
        anonymousParticipants: [mockAnonymousParticipant],
      });

      const { result } = renderHook(() =>
        useParticipants({ conversationId: mockConversationId })
      );

      await act(async () => {
        await result.current.loadParticipants(mockConversationId);
      });

      const participant = result.current.participants[0];
      expect(participant.user?.displayName).toBe('AnonUser123');
      expect(participant.user?.email).toBe('');
      expect(participant.user?.systemLanguage).toBe('fr');
      expect(participant.role).toBe('MEMBER');
    });

    it('should call service with correct conversation ID', async () => {
      mockGetAllParticipants.mockResolvedValue({
        authenticatedParticipants: [],
        anonymousParticipants: [],
      });

      const { result } = renderHook(() =>
        useParticipants({ conversationId: mockConversationId })
      );

      await act(async () => {
        await result.current.loadParticipants('specific-conv-id');
      });

      expect(mockGetAllParticipants).toHaveBeenCalledWith('specific-conv-id');
    });
  });

  describe('Deduplication', () => {
    it('should deduplicate participants by userId', async () => {
      // Same ID for both auth and anonymous
      mockGetAllParticipants.mockResolvedValue({
        authenticatedParticipants: [{ ...mockAuthenticatedUser, id: 'user-1' }],
        anonymousParticipants: [{ ...mockAnonymousParticipant, id: 'user-1' }],
      });

      const { result } = renderHook(() =>
        useParticipants({ conversationId: mockConversationId })
      );

      await act(async () => {
        await result.current.loadParticipants(mockConversationId);
      });

      // Should only have one participant
      expect(result.current.participants).toHaveLength(1);
    });

    it('should prioritize authenticated over anonymous for same userId', async () => {
      const sharedId = 'shared-user-id';

      mockGetAllParticipants.mockResolvedValue({
        authenticatedParticipants: [{ ...mockAuthenticatedUser, id: sharedId }],
        anonymousParticipants: [{ ...mockAnonymousParticipant, id: sharedId }],
      });

      const { result } = renderHook(() =>
        useParticipants({ conversationId: mockConversationId })
      );

      await act(async () => {
        await result.current.loadParticipants(mockConversationId);
      });

      // Should have the authenticated user (not anonymous)
      expect(result.current.participants[0].isAnonymous).toBe(false);
      expect(result.current.participants[0].user?.displayName).toBe('Auth User');
    });

    it('should keep unique participants from both sources', async () => {
      mockGetAllParticipants.mockResolvedValue({
        authenticatedParticipants: [mockAuthenticatedUser],
        anonymousParticipants: [mockAnonymousParticipant],
      });

      const { result } = renderHook(() =>
        useParticipants({ conversationId: mockConversationId })
      );

      await act(async () => {
        await result.current.loadParticipants(mockConversationId);
      });

      expect(result.current.participants).toHaveLength(2);
    });
  });

  describe('User Store Integration', () => {
    it('should update user store with participants', async () => {
      mockGetAllParticipants.mockResolvedValue({
        authenticatedParticipants: [mockAuthenticatedUser],
        anonymousParticipants: [],
      });

      const { result } = renderHook(() =>
        useParticipants({ conversationId: mockConversationId })
      );

      await act(async () => {
        await result.current.loadParticipants(mockConversationId);
      });

      expect(mockSetParticipants).toHaveBeenCalled();
      expect(mockSetParticipants).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'auth-user-1' }),
        ])
      );
    });

    it('should filter out participants without user object', async () => {
      mockGetAllParticipants.mockResolvedValue({
        authenticatedParticipants: [mockAuthenticatedUser],
        anonymousParticipants: [],
      });

      const { result } = renderHook(() =>
        useParticipants({ conversationId: mockConversationId })
      );

      await act(async () => {
        await result.current.loadParticipants(mockConversationId);
      });

      // Verify setParticipants was called with filtered users
      const callArgs = mockSetParticipants.mock.calls[0][0];
      expect(callArgs.every((u: any) => u !== null && u !== undefined)).toBe(true);
    });
  });

  describe('Ref Synchronization', () => {
    it('should sync participantsRef with participants state', async () => {
      mockGetAllParticipants.mockResolvedValue({
        authenticatedParticipants: [mockAuthenticatedUser],
        anonymousParticipants: [],
      });

      const { result } = renderHook(() =>
        useParticipants({ conversationId: mockConversationId })
      );

      await act(async () => {
        await result.current.loadParticipants(mockConversationId);
      });

      // Ref should match state
      expect(result.current.participantsRef.current).toEqual(
        result.current.participants
      );
    });

    it('should update ref when participants change', async () => {
      mockGetAllParticipants
        .mockResolvedValueOnce({
          authenticatedParticipants: [mockAuthenticatedUser],
          anonymousParticipants: [],
        })
        .mockResolvedValueOnce({
          authenticatedParticipants: [],
          anonymousParticipants: [mockAnonymousParticipant],
        });

      const { result } = renderHook(() =>
        useParticipants({ conversationId: mockConversationId })
      );

      // First load
      await act(async () => {
        await result.current.loadParticipants(mockConversationId);
      });

      expect(result.current.participantsRef.current).toHaveLength(1);
      expect(result.current.participantsRef.current[0].isAnonymous).toBe(false);

      // Second load with different participants
      await act(async () => {
        await result.current.loadParticipants(mockConversationId);
      });

      expect(result.current.participantsRef.current).toHaveLength(1);
      expect(result.current.participantsRef.current[0].isAnonymous).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should clear participants on error', async () => {
      mockGetAllParticipants.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useParticipants({ conversationId: mockConversationId })
      );

      await act(async () => {
        await result.current.loadParticipants(mockConversationId);
      });

      expect(result.current.participants).toEqual([]);
    });

    it('should set isLoading false on error', async () => {
      mockGetAllParticipants.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useParticipants({ conversationId: mockConversationId })
      );

      await act(async () => {
        await result.current.loadParticipants(mockConversationId);
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('should log error on failure', async () => {
      const error = new Error('Network error');
      mockGetAllParticipants.mockRejectedValue(error);

      const { result } = renderHook(() =>
        useParticipants({ conversationId: mockConversationId })
      );

      await act(async () => {
        await result.current.loadParticipants(mockConversationId);
      });

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[useParticipants]'),
        error
      );
    });
  });

  describe('Handler Stability', () => {
    it('should return loadParticipants function', () => {
      const { result, rerender } = renderHook(() =>
        useParticipants({ conversationId: mockConversationId })
      );

      expect(typeof result.current.loadParticipants).toBe('function');

      rerender();

      // Function should still be available after rerender
      expect(typeof result.current.loadParticipants).toBe('function');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty participants response', async () => {
      mockGetAllParticipants.mockResolvedValue({
        authenticatedParticipants: [],
        anonymousParticipants: [],
      });

      const { result } = renderHook(() =>
        useParticipants({ conversationId: mockConversationId })
      );

      await act(async () => {
        await result.current.loadParticipants(mockConversationId);
      });

      expect(result.current.participants).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle null conversationId option', () => {
      const { result } = renderHook(() =>
        useParticipants({ conversationId: null })
      );

      expect(result.current.participants).toEqual([]);
      expect(result.current.loadParticipants).toBeDefined();
    });

    it('should handle multiple rapid loads', async () => {
      mockGetAllParticipants.mockResolvedValue({
        authenticatedParticipants: [mockAuthenticatedUser],
        anonymousParticipants: [],
      });

      const { result } = renderHook(() =>
        useParticipants({ conversationId: mockConversationId })
      );

      // Rapid fire multiple loads
      await act(async () => {
        result.current.loadParticipants(mockConversationId);
        result.current.loadParticipants(mockConversationId);
        await result.current.loadParticipants(mockConversationId);
      });

      // Should have valid state
      expect(result.current.participants).toHaveLength(1);
      expect(result.current.isLoading).toBe(false);
    });
  });
});
