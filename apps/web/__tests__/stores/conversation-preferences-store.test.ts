/**
 * Conversation Preferences Store Tests
 * Selector hooks behavior: granular re-renders + stable actions
 */

import { act, renderHook } from '@testing-library/react';
import {
  useConversationPreferencesStore,
  useConversationPreference,
  useConversationCategories,
  useConversationPreferencesActions,
} from '../../stores/conversation-preferences-store';
import type { UserConversationPreferences } from '@meeshy/shared/types/user-preferences';

jest.mock('@/services/user-preferences.service', () => ({
  userPreferencesService: {
    getAllPreferences: jest.fn().mockResolvedValue([]),
    getCategories: jest.fn().mockResolvedValue([]),
  },
}));

const createPrefs = (
  conversationId: string,
  overrides: Partial<UserConversationPreferences> = {}
): UserConversationPreferences => ({
  id: `pref-${conversationId}`,
  userId: 'user-1',
  conversationId,
  isPinned: false,
  isMuted: false,
  isArchived: false,
  tags: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('ConversationPreferencesStore selectors', () => {
  beforeEach(() => {
    act(() => {
      useConversationPreferencesStore.getState().reset();
    });
  });

  describe('useConversationPreference', () => {
    it('returns the preferences for the requested conversation', () => {
      act(() => {
        useConversationPreferencesStore.setState({
          preferencesMap: new Map([['conv-a', createPrefs('conv-a', { isPinned: true })]]),
        });
      });

      const { result } = renderHook(() => useConversationPreference('conv-a'));

      expect(result.current?.isPinned).toBe(true);
    });

    it('does not re-render when another conversation preferences change', () => {
      act(() => {
        useConversationPreferencesStore.setState({
          preferencesMap: new Map([
            ['conv-a', createPrefs('conv-a')],
            ['conv-b', createPrefs('conv-b')],
          ]),
        });
      });

      let renderCount = 0;
      renderHook(() => {
        renderCount += 1;
        return useConversationPreference('conv-a');
      });
      const initialRenderCount = renderCount;

      act(() => {
        useConversationPreferencesStore.getState().updatePreference('conv-b', { isPinned: true });
      });

      expect(renderCount).toBe(initialRenderCount);
    });

    it('re-renders when the requested conversation preferences change', () => {
      act(() => {
        useConversationPreferencesStore.setState({
          preferencesMap: new Map([['conv-a', createPrefs('conv-a')]]),
        });
      });

      const { result } = renderHook(() => useConversationPreference('conv-a'));

      act(() => {
        useConversationPreferencesStore.getState().updatePreference('conv-a', { isMuted: true });
      });

      expect(result.current?.isMuted).toBe(true);
    });
  });

  describe('useConversationCategories', () => {
    it('returns the categories list', () => {
      const categories = [
        { id: 'cat-1', userId: 'user-1', name: 'Work', order: 0, isExpanded: true, createdAt: new Date(), updatedAt: new Date() },
      ];
      act(() => {
        useConversationPreferencesStore.setState({ categories });
      });

      const { result } = renderHook(() => useConversationCategories());

      expect(result.current).toEqual(categories);
    });
  });

  describe('useConversationPreferencesActions', () => {
    it('exposes the store actions', () => {
      const { result } = renderHook(() => useConversationPreferencesActions());

      expect(typeof result.current.togglePin).toBe('function');
      expect(typeof result.current.toggleMute).toBe('function');
      expect(typeof result.current.toggleArchive).toBe('function');
      expect(typeof result.current.setReaction).toBe('function');
      expect(typeof result.current.getPreferences).toBe('function');
      expect(typeof result.current.refreshPreferences).toBe('function');
      expect(typeof result.current.initialize).toBe('function');
    });

    it('keeps a stable identity across state mutations', () => {
      const { result } = renderHook(() => useConversationPreferencesActions());
      const firstActions = result.current;

      act(() => {
        useConversationPreferencesStore.getState().updatePreference('conv-a', { isPinned: true });
        useConversationPreferencesStore.setState({ isLoading: true });
      });

      expect(result.current).toBe(firstActions);
    });
  });
});
