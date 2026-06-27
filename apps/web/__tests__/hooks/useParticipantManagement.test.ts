/**
 * Tests for hooks/use-participant-management.ts
 */

jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    removeParticipant: jest.fn(),
  },
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useParticipantManagement } from '@/hooks/use-participant-management';
import { conversationsService } from '@/services/conversations.service';
import { toast } from 'sonner';
import type { Conversation, User } from '@meeshy/shared/types';

const mockRemoveParticipant = conversationsService.removeParticipant as jest.MockedFunction<
  typeof conversationsService.removeParticipant
>;

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    username: 'test',
    role: 'USER',
    ...overrides,
  } as User);

const makeConversation = (
  type: 'direct' | 'group' | 'public' | 'global' = 'group',
  participants: unknown[] = []
): Conversation =>
  ({
    id: 'conv-1',
    type,
    participants,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as Conversation);

describe('useParticipantManagement', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  // ─── isAdmin ─────────────────────────────────────────────────────────────

  describe('isAdmin', () => {
    it('is false for regular member with no role', () => {
      const user = makeUser({ role: 'USER' });
      const conv = makeConversation('group', [{ userId: 'user-1', role: 'member' }]);

      const { result } = renderHook(() => useParticipantManagement(conv, user));

      expect(result.current.isAdmin).toBe(false);
    });

    it('is true when user is a group admin', () => {
      const user = makeUser({ role: 'USER' });
      const conv = makeConversation('group', [{ userId: 'user-1', role: 'admin' }]);

      const { result } = renderHook(() => useParticipantManagement(conv, user));

      expect(result.current.isAdmin).toBe(true);
    });

    it('is true when user is a group moderator', () => {
      const user = makeUser({ role: 'USER' });
      const conv = makeConversation('group', [{ userId: 'user-1', role: 'moderator' }]);

      const { result } = renderHook(() => useParticipantManagement(conv, user));

      expect(result.current.isAdmin).toBe(true);
    });

    it('is true when user is a global admin', () => {
      const user = makeUser({ role: 'ADMIN' });
      const conv = makeConversation('group', [{ userId: 'user-1', role: 'member' }]);

      const { result } = renderHook(() => useParticipantManagement(conv, user));

      expect(result.current.isAdmin).toBe(true);
    });

    it('defaults membership role to member when participant not found', () => {
      const user = makeUser({ role: 'USER' });
      const conv = makeConversation('group', []); // user not in participants

      const { result } = renderHook(() => useParticipantManagement(conv, user));

      expect(result.current.isAdmin).toBe(false);
    });
  });

  // ─── canModifyImage ───────────────────────────────────────────────────────

  describe('canModifyImage', () => {
    it('is false for direct conversations even if admin', () => {
      const user = makeUser({ role: 'ADMIN' });
      const conv = makeConversation('direct', [{ userId: 'user-1', role: 'admin' }]);

      const { result } = renderHook(() => useParticipantManagement(conv, user));

      expect(result.current.canModifyImage).toBe(false);
    });

    it('is true for group conversations when admin', () => {
      const user = makeUser({ role: 'USER' });
      const conv = makeConversation('group', [{ userId: 'user-1', role: 'admin' }]);

      const { result } = renderHook(() => useParticipantManagement(conv, user));

      expect(result.current.canModifyImage).toBe(true);
    });

    it('is false for group conversation when not admin', () => {
      const user = makeUser({ role: 'USER' });
      const conv = makeConversation('group', [{ userId: 'user-1', role: 'member' }]);

      const { result } = renderHook(() => useParticipantManagement(conv, user));

      expect(result.current.canModifyImage).toBe(false);
    });
  });

  // ─── handleRemoveParticipant ──────────────────────────────────────────────

  describe('handleRemoveParticipant', () => {
    it('does nothing when user is not admin', async () => {
      const user = makeUser({ role: 'USER' });
      const conv = makeConversation('group', [{ userId: 'user-1', role: 'member' }]);

      const { result } = renderHook(() => useParticipantManagement(conv, user));

      await act(async () => {
        await result.current.handleRemoveParticipant('user-2');
      });

      expect(mockRemoveParticipant).not.toHaveBeenCalled();
    });

    it('calls removeParticipant when admin', async () => {
      mockRemoveParticipant.mockResolvedValue(undefined as never);

      const user = makeUser({ role: 'USER' });
      const conv = makeConversation('group', [{ userId: 'user-1', role: 'admin' }]);

      const { result } = renderHook(() => useParticipantManagement(conv, user));

      await act(async () => {
        await result.current.handleRemoveParticipant('user-2');
      });

      expect(mockRemoveParticipant).toHaveBeenCalledWith('conv-1', 'user-2');
    });

    it('shows success toast after removal', async () => {
      mockRemoveParticipant.mockResolvedValue(undefined as never);

      const user = makeUser({ role: 'USER' });
      const conv = makeConversation('group', [{ userId: 'user-1', role: 'admin' }]);

      const { result } = renderHook(() => useParticipantManagement(conv, user));

      await act(async () => {
        await result.current.handleRemoveParticipant('user-2');
      });

      expect(toast.success).toHaveBeenCalled();
    });

    it('shows error toast on failure', async () => {
      mockRemoveParticipant.mockRejectedValue(new Error('Network error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const user = makeUser({ role: 'USER' });
      const conv = makeConversation('group', [{ userId: 'user-1', role: 'admin' }]);

      const { result } = renderHook(() => useParticipantManagement(conv, user));

      await act(async () => {
        await result.current.handleRemoveParticipant('user-2');
      });

      expect(toast.error).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('sets isLoading during removal and clears after', async () => {
      let resolveRemove: () => void;
      mockRemoveParticipant.mockReturnValue(
        new Promise((resolve) => {
          resolveRemove = resolve;
        }) as never
      );

      const user = makeUser({ role: 'USER' });
      const conv = makeConversation('group', [{ userId: 'user-1', role: 'admin' }]);

      const { result } = renderHook(() => useParticipantManagement(conv, user));

      expect(result.current.isLoading).toBe(false);

      act(() => {
        result.current.handleRemoveParticipant('user-2');
      });

      await waitFor(() => expect(result.current.isLoading).toBe(true));

      await act(async () => {
        resolveRemove!();
      });

      expect(result.current.isLoading).toBe(false);
    });
  });
});
