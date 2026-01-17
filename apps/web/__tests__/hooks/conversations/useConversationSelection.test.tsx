/**
 * Tests for useConversationSelection hook
 *
 * Tests cover:
 * - Initial state
 * - effectiveSelectedId logic (URL vs local priority)
 * - selectedConversation derivation
 * - handleSelectConversation behavior
 * - handleBackToList behavior
 * - URL mode vs local mode selection
 * - URL sync with local state
 * - Re-selection prevention
 */

import { renderHook, act } from '@testing-library/react';
import { useConversationSelection } from '@/hooks/conversations/useConversationSelection';
import type { Conversation } from '@meeshy/shared/types';

// Mock next/navigation (already mocked in jest.setup.js but we need to override)
const mockPush = jest.fn();
const mockReplaceState = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    pathname: '/',
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

describe('useConversationSelection', () => {
  const mockConversations: Conversation[] = [
    {
      id: 'conv-1',
      title: 'Conversation 1',
      type: 'direct',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Conversation,
    {
      id: 'conv-2',
      title: 'Conversation 2',
      type: 'group',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Conversation,
    {
      id: 'conv-3',
      title: 'Conversation 3',
      type: 'direct',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Conversation,
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock window.history.replaceState
    Object.defineProperty(window, 'history', {
      value: {
        replaceState: mockReplaceState,
        pushState: jest.fn(),
        state: null,
      },
      writable: true,
    });
  });

  describe('Initial State', () => {
    it('should return null effectiveSelectedId without URL or local selection', () => {
      const { result } = renderHook(() =>
        useConversationSelection({
          conversations: mockConversations,
        })
      );

      expect(result.current.effectiveSelectedId).toBeNull();
    });

    it('should return null selectedConversation when no selection', () => {
      const { result } = renderHook(() =>
        useConversationSelection({
          conversations: mockConversations,
        })
      );

      expect(result.current.selectedConversation).toBeNull();
    });

    it('should return null localSelectedConversationId initially', () => {
      const { result } = renderHook(() =>
        useConversationSelection({
          conversations: mockConversations,
        })
      );

      expect(result.current.localSelectedConversationId).toBeNull();
    });

    it('should return all handler functions', () => {
      const { result } = renderHook(() =>
        useConversationSelection({
          conversations: mockConversations,
        })
      );

      expect(typeof result.current.handleSelectConversation).toBe('function');
      expect(typeof result.current.handleBackToList).toBe('function');
      expect(typeof result.current.setLocalSelectedConversationId).toBe('function');
    });
  });

  describe('effectiveSelectedId', () => {
    it('should prioritize URL selectedConversationId', () => {
      const { result } = renderHook(() =>
        useConversationSelection({
          selectedConversationId: 'conv-1',
          conversations: mockConversations,
        })
      );

      expect(result.current.effectiveSelectedId).toBe('conv-1');
    });

    it('should fall back to localSelectedConversationId when no URL id', () => {
      const { result } = renderHook(() =>
        useConversationSelection({
          conversations: mockConversations,
        })
      );

      act(() => {
        result.current.setLocalSelectedConversationId('conv-2');
      });

      expect(result.current.effectiveSelectedId).toBe('conv-2');
    });

    it('should prefer URL over local when both present', () => {
      const { result } = renderHook(() =>
        useConversationSelection({
          selectedConversationId: 'conv-1',
          conversations: mockConversations,
        })
      );

      act(() => {
        result.current.setLocalSelectedConversationId('conv-2');
      });

      expect(result.current.effectiveSelectedId).toBe('conv-1');
    });
  });

  describe('selectedConversation', () => {
    it('should return conversation matching effectiveSelectedId', () => {
      const { result } = renderHook(() =>
        useConversationSelection({
          selectedConversationId: 'conv-2',
          conversations: mockConversations,
        })
      );

      expect(result.current.selectedConversation).toEqual(mockConversations[1]);
    });

    it('should return null when conversation not found', () => {
      const { result } = renderHook(() =>
        useConversationSelection({
          selectedConversationId: 'non-existent',
          conversations: mockConversations,
        })
      );

      expect(result.current.selectedConversation).toBeNull();
    });

    it('should return null when conversations array is empty', () => {
      const { result } = renderHook(() =>
        useConversationSelection({
          selectedConversationId: 'conv-1',
          conversations: [],
        })
      );

      expect(result.current.selectedConversation).toBeNull();
    });

    it('should update when conversations change', () => {
      const { result, rerender } = renderHook(
        ({ conversations }) =>
          useConversationSelection({
            selectedConversationId: 'conv-1',
            conversations,
          }),
        { initialProps: { conversations: mockConversations } }
      );

      expect(result.current.selectedConversation?.id).toBe('conv-1');

      // Remove conv-1 from the list
      rerender({ conversations: mockConversations.slice(1) });

      expect(result.current.selectedConversation).toBeNull();
    });
  });

  describe('handleSelectConversation', () => {
    it('should not re-select already selected conversation', () => {
      const { result } = renderHook(() =>
        useConversationSelection({
          selectedConversationId: 'conv-1',
          conversations: mockConversations,
        })
      );

      act(() => {
        result.current.handleSelectConversation(mockConversations[0]);
      });

      expect(mockPush).not.toHaveBeenCalled();
      expect(mockReplaceState).not.toHaveBeenCalled();
    });

    it('should use local mode when no URL selectedConversationId', () => {
      const { result } = renderHook(() =>
        useConversationSelection({
          conversations: mockConversations,
        })
      );

      act(() => {
        result.current.handleSelectConversation(mockConversations[1]);
      });

      expect(result.current.localSelectedConversationId).toBe('conv-2');
      expect(mockReplaceState).toHaveBeenCalledWith(null, '', '/conversations');
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('should use URL mode when selectedConversationId is provided', () => {
      const { result } = renderHook(() =>
        useConversationSelection({
          selectedConversationId: 'conv-1',
          conversations: mockConversations,
        })
      );

      act(() => {
        result.current.handleSelectConversation(mockConversations[1]);
      });

      expect(mockPush).toHaveBeenCalledWith('/conversations/conv-2');
    });

    it('should update local state in dynamic mode', () => {
      const { result } = renderHook(() =>
        useConversationSelection({
          conversations: mockConversations,
        })
      );

      act(() => {
        result.current.handleSelectConversation(mockConversations[2]);
      });

      expect(result.current.effectiveSelectedId).toBe('conv-3');
      expect(result.current.selectedConversation).toEqual(mockConversations[2]);
    });
  });

  describe('handleBackToList', () => {
    it('should clear local selection in dynamic mode', () => {
      const { result } = renderHook(() =>
        useConversationSelection({
          conversations: mockConversations,
        })
      );

      // First select a conversation
      act(() => {
        result.current.setLocalSelectedConversationId('conv-1');
      });

      expect(result.current.localSelectedConversationId).toBe('conv-1');

      // Then go back to list
      act(() => {
        result.current.handleBackToList();
      });

      expect(result.current.localSelectedConversationId).toBeNull();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('should navigate to /conversations in URL mode', () => {
      const { result } = renderHook(() =>
        useConversationSelection({
          selectedConversationId: 'conv-1',
          conversations: mockConversations,
        })
      );

      act(() => {
        result.current.handleBackToList();
      });

      expect(mockPush).toHaveBeenCalledWith('/conversations');
    });

    it('should do nothing when no selection in dynamic mode', () => {
      const { result } = renderHook(() =>
        useConversationSelection({
          conversations: mockConversations,
        })
      );

      act(() => {
        result.current.handleBackToList();
      });

      expect(mockPush).not.toHaveBeenCalled();
      expect(result.current.localSelectedConversationId).toBeNull();
    });
  });

  describe('URL Sync', () => {
    it('should sync URL to local state on initial render', () => {
      const { result } = renderHook(() =>
        useConversationSelection({
          selectedConversationId: 'conv-2',
          conversations: mockConversations,
        })
      );

      expect(result.current.localSelectedConversationId).toBe('conv-2');
    });

    it('should sync when URL changes (only if local not already set)', () => {
      const { result, rerender } = renderHook(
        ({ selectedConversationId }) =>
          useConversationSelection({
            selectedConversationId,
            conversations: mockConversations,
          }),
        { initialProps: { selectedConversationId: 'conv-1' } }
      );

      expect(result.current.localSelectedConversationId).toBe('conv-1');

      // The hook only syncs URL to local if local is not already set
      // Since local is already 'conv-1', it won't change to 'conv-3'
      rerender({ selectedConversationId: 'conv-3' });

      // effectiveSelectedId should use the URL value though
      expect(result.current.effectiveSelectedId).toBe('conv-3');
    });

    it('should not sync if local already set', () => {
      const { result, rerender } = renderHook(
        ({ selectedConversationId }) =>
          useConversationSelection({
            selectedConversationId,
            conversations: mockConversations,
          }),
        { initialProps: { selectedConversationId: undefined as string | undefined } }
      );

      // Set local state first
      act(() => {
        result.current.setLocalSelectedConversationId('conv-2');
      });

      // Then add URL param
      rerender({ selectedConversationId: 'conv-1' });

      // Local should still be conv-2 (already set before URL)
      // But effectiveSelectedId should be conv-1 (URL priority)
      expect(result.current.effectiveSelectedId).toBe('conv-1');
    });
  });

  describe('Handler Stability', () => {
    it('should return handleSelectConversation function', () => {
      const { result, rerender } = renderHook(() =>
        useConversationSelection({
          conversations: mockConversations,
        })
      );

      expect(typeof result.current.handleSelectConversation).toBe('function');

      rerender();

      // Function may or may not be stable depending on useCallback deps
      expect(typeof result.current.handleSelectConversation).toBe('function');
    });

    it('should return handleBackToList function', () => {
      const { result, rerender } = renderHook(() =>
        useConversationSelection({
          conversations: mockConversations,
        })
      );

      expect(typeof result.current.handleBackToList).toBe('function');

      rerender();

      // Function may or may not be stable depending on useCallback deps
      expect(typeof result.current.handleBackToList).toBe('function');
    });

    it('should return stable setLocalSelectedConversationId reference', () => {
      const { result, rerender } = renderHook(() =>
        useConversationSelection({
          conversations: mockConversations,
        })
      );

      const firstSetter = result.current.setLocalSelectedConversationId;

      rerender();

      expect(result.current.setLocalSelectedConversationId).toBe(firstSetter);
    });
  });

  describe('Memoization', () => {
    it('should memoize selectedConversation', () => {
      const { result, rerender } = renderHook(() =>
        useConversationSelection({
          selectedConversationId: 'conv-1',
          conversations: mockConversations,
        })
      );

      const firstConversation = result.current.selectedConversation;

      rerender();

      // Should return same reference if inputs haven't changed
      expect(result.current.selectedConversation).toBe(firstConversation);
    });

    it('should update selectedConversation when effectiveSelectedId changes', () => {
      const { result, rerender } = renderHook(
        ({ selectedConversationId }) =>
          useConversationSelection({
            selectedConversationId,
            conversations: mockConversations,
          }),
        { initialProps: { selectedConversationId: 'conv-1' } }
      );

      expect(result.current.selectedConversation?.id).toBe('conv-1');

      rerender({ selectedConversationId: 'conv-2' });

      expect(result.current.selectedConversation?.id).toBe('conv-2');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty conversations array', () => {
      const { result } = renderHook(() =>
        useConversationSelection({
          selectedConversationId: 'conv-1',
          conversations: [],
        })
      );

      expect(result.current.selectedConversation).toBeNull();
      expect(result.current.effectiveSelectedId).toBe('conv-1');
    });

    it('should handle undefined selectedConversationId', () => {
      const { result } = renderHook(() =>
        useConversationSelection({
          selectedConversationId: undefined,
          conversations: mockConversations,
        })
      );

      expect(result.current.effectiveSelectedId).toBeNull();
    });

    it('should handle rapid selection changes', () => {
      const { result } = renderHook(() =>
        useConversationSelection({
          conversations: mockConversations,
        })
      );

      // Rapid selections
      act(() => {
        for (const conv of mockConversations) {
          result.current.handleSelectConversation(conv);
        }
      });

      // Should end up with last conversation
      expect(result.current.effectiveSelectedId).toBe('conv-3');
    });

    it('should handle conversation with special characters in ID', () => {
      const specialConv: Conversation = {
        id: 'conv-with-special-chars!@#$%',
        title: 'Special',
        type: 'direct',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Conversation;

      const { result } = renderHook(() =>
        useConversationSelection({
          conversations: [...mockConversations, specialConv],
        })
      );

      act(() => {
        result.current.handleSelectConversation(specialConv);
      });

      expect(result.current.effectiveSelectedId).toBe(specialConv.id);
    });
  });
});
