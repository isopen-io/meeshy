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

// ─── applyRemotePreferences ──────────────────────────────────────────────────
//
// `USER_PREFERENCES_UPDATED` (scope conversation) est diffusé à TOUS les
// appareils du même utilisateur par `writeConversationPreferences`. Sans ce
// chemin, épingler / couper le son / archiver depuis un autre appareil ne
// parvenait jamais à un onglet web ouvert : la liste gardait son état — et son
// tri — jusqu'à un rechargement de page.

describe('applyRemotePreferences', () => {
  beforeEach(() => {
    act(() => {
      useConversationPreferencesStore.getState().reset();
    });
  });

  const remoteEvent = (
    conversationId: string,
    version: number,
    preferences: Partial<{
      isPinned: boolean;
      isMuted: boolean;
      mentionsOnly: boolean;
      isArchived: boolean;
      tags: readonly string[];
      categoryId: string | null;
      orderInCategory: number | null;
      customName: string | null;
      reaction: string | null;
      deletedForUserAt: string | null;
      clearHistoryBefore: string | null;
    }> = {}
  ) => ({
    userId: 'user-1',
    conversationId,
    version,
    reset: false,
    preferences: {
      isPinned: false,
      isMuted: false,
      mentionsOnly: false,
      isArchived: false,
      tags: [] as readonly string[],
      categoryId: null,
      orderInCategory: null,
      customName: null,
      reaction: null,
      deletedForUserAt: null,
      clearHistoryBefore: null,
      ...preferences,
    },
  });

  const apply = (event: ReturnType<typeof remoteEvent> | Record<string, unknown>) => {
    act(() => {
      useConversationPreferencesStore
        .getState()
        .applyRemotePreferences(event as Parameters<
          ReturnType<typeof useConversationPreferencesStore.getState>['applyRemotePreferences']
        >[0]);
    });
  };

  it('applies a newer snapshot onto an existing entry', () => {
    act(() => {
      useConversationPreferencesStore.setState({
        preferencesMap: new Map([['conv-a', createPrefs('conv-a', { version: 2 })]]),
      });
    });

    apply(remoteEvent('conv-a', 3, { isPinned: true, isMuted: true, tags: ['work'] }));

    const prefs = useConversationPreferencesStore.getState().preferencesMap.get('conv-a');
    expect(prefs?.isPinned).toBe(true);
    expect(prefs?.isMuted).toBe(true);
    expect(prefs?.tags).toEqual(['work']);
    expect(prefs?.version).toBe(3);
  });

  it('creates an entry for a conversation it has never seen', () => {
    // Une conversation jamais personnalisée n'a pas de ligne : c'est justement
    // le premier épinglage fait ailleurs qui en crée une. La refuser ici
    // laisserait le cas le plus courant invisible.
    apply(remoteEvent('conv-new', 1, { isPinned: true }));

    const prefs = useConversationPreferencesStore.getState().preferencesMap.get('conv-new');
    expect(prefs?.isPinned).toBe(true);
    expect(prefs?.conversationId).toBe('conv-new');
    expect(prefs?.userId).toBe('user-1');
    expect(prefs?.version).toBe(1);
  });

  it('drops a broadcast whose version is not newer than the local one', () => {
    act(() => {
      useConversationPreferencesStore.setState({
        preferencesMap: new Map([['conv-a', createPrefs('conv-a', { isPinned: true, version: 5 })]]),
      });
    });

    apply(remoteEvent('conv-a', 5, { isPinned: false }));
    expect(useConversationPreferencesStore.getState().preferencesMap.get('conv-a')?.isPinned).toBe(true);

    apply(remoteEvent('conv-a', 4, { isPinned: false }));
    expect(useConversationPreferencesStore.getState().preferencesMap.get('conv-a')?.isPinned).toBe(true);
  });

  it('treats a versionless local entry as version 0', () => {
    // Une entrée posée optimistiquement (togglePin) ou hydratée par un serveur
    // antérieur au champ n'en porte pas : toute diffusion la dépasse.
    act(() => {
      useConversationPreferencesStore.setState({
        preferencesMap: new Map([['conv-a', createPrefs('conv-a')]]),
      });
    });

    apply(remoteEvent('conv-a', 1, { isArchived: true }));

    expect(useConversationPreferencesStore.getState().preferencesMap.get('conv-a')?.isArchived).toBe(true);
  });

  it('restores defaults on a reset event and keeps the version moving forward', () => {
    act(() => {
      useConversationPreferencesStore.setState({
        preferencesMap: new Map([[
          'conv-a',
          createPrefs('conv-a', {
            isPinned: true,
            isMuted: true,
            tags: ['work'],
            customName: 'Renamed',
            reaction: '❤️',
            categoryId: 'cat-1',
            version: 6,
          }),
        ]]),
      });
    });

    apply({ userId: 'user-1', conversationId: 'conv-a', version: 7, reset: true, preferences: null });

    const prefs = useConversationPreferencesStore.getState().preferencesMap.get('conv-a');
    expect(prefs?.isPinned).toBe(false);
    expect(prefs?.isMuted).toBe(false);
    expect(prefs?.isArchived).toBe(false);
    expect(prefs?.tags).toEqual([]);
    expect(prefs?.customName).toBeUndefined();
    expect(prefs?.reaction).toBeUndefined();
    expect(prefs?.categoryId).toBeUndefined();
    expect(prefs?.version).toBe(7);
  });

  it('ignores a non-reset event that carries no snapshot', () => {
    // Rien n'a été appris : avancer le compteur ferait alors tomber la
    // PROCHAINE diffusion, celle qui portait l'état.
    act(() => {
      useConversationPreferencesStore.setState({
        preferencesMap: new Map([['conv-a', createPrefs('conv-a', { isPinned: true, version: 2 })]]),
      });
    });

    apply({ userId: 'user-1', conversationId: 'conv-a', version: 3, reset: false, preferences: null });

    const prefs = useConversationPreferencesStore.getState().preferencesMap.get('conv-a');
    expect(prefs?.isPinned).toBe(true);
    expect(prefs?.version).toBe(2);
  });

  it('leaves the other conversations untouched', () => {
    act(() => {
      useConversationPreferencesStore.setState({
        preferencesMap: new Map([
          ['conv-a', createPrefs('conv-a', { version: 1 })],
          ['conv-b', createPrefs('conv-b', { isPinned: true, version: 1 })],
        ]),
      });
    });

    apply(remoteEvent('conv-a', 2, { isMuted: true }));

    expect(useConversationPreferencesStore.getState().preferencesMap.get('conv-b')?.isPinned).toBe(true);
    expect(useConversationPreferencesStore.getState().preferencesMap.get('conv-b')?.version).toBe(1);
  });
});
