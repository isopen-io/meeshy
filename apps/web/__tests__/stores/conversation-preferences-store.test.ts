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
    togglePin: jest.fn(),
    toggleMute: jest.fn(),
    toggleArchive: jest.fn(),
    updateReaction: jest.fn(),
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
      readingMode: string;
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
      readingMode: 'auto',
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

describe('optimistic writes — version arbitration', () => {
  const service = jest.requireMock('@/services/user-preferences.service')
    .userPreferencesService as {
    togglePin: jest.Mock;
    toggleMute: jest.Mock;
    toggleArchive: jest.Mock;
    updateReaction: jest.Mock;
  };

  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  const seed = (prefs: UserConversationPreferences) => {
    act(() => {
      useConversationPreferencesStore.setState({
        preferencesMap: new Map([[prefs.conversationId, prefs]]),
      });
    });
  };

  const read = (conversationId: string) =>
    useConversationPreferencesStore.getState().preferencesMap.get(conversationId);

  const broadcast = (conversationId: string, version: number, patch: Record<string, unknown>) => {
    act(() => {
      useConversationPreferencesStore.getState().applyRemotePreferences({
        userId: 'user-1',
        conversationId,
        version,
        reset: false,
        preferences: {
          isPinned: false,
          isMuted: false,
          mentionsOnly: false,
          isArchived: false,
          tags: [],
          categoryId: null,
          orderInCategory: null,
          customName: null,
          reaction: null,
          readingMode: 'auto',
          clearHistoryBefore: null,
          ...patch,
        },
      } as Parameters<
        ReturnType<typeof useConversationPreferencesStore.getState>['applyRemotePreferences']
      >[0]);
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      useConversationPreferencesStore.getState().reset();
    });
  });

  const WRITERS = [
    {
      name: 'togglePin',
      mock: () => service.togglePin,
      run: (conversationId: string, value: boolean) =>
        useConversationPreferencesStore.getState().togglePin(conversationId, value),
      field: 'isPinned' as const,
    },
    {
      name: 'toggleMute',
      mock: () => service.toggleMute,
      run: (conversationId: string, value: boolean) =>
        useConversationPreferencesStore.getState().toggleMute(conversationId, value),
      field: 'isMuted' as const,
    },
    {
      name: 'toggleArchive',
      mock: () => service.toggleArchive,
      run: (conversationId: string, value: boolean) =>
        useConversationPreferencesStore.getState().toggleArchive(conversationId, value),
      field: 'isArchived' as const,
    },
  ];

  describe.each(WRITERS)('$name', ({ mock, run, field }) => {
    it('applies the response when it carries a newer version', async () => {
      seed(createPrefs('conv-a', { version: 1 }));
      mock().mockResolvedValue(createPrefs('conv-a', { [field]: true, version: 2 }));

      await act(async () => {
        await run('conv-a', true);
      });

      expect(read('conv-a')?.[field]).toBe(true);
      expect(read('conv-a')?.version).toBe(2);
    });

    it('keeps the newest write when two responses come back out of order', async () => {
      seed(createPrefs('conv-a', { version: 1 }));

      const first = deferred<UserConversationPreferences>();
      const second = deferred<UserConversationPreferences>();
      mock().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

      let pending: Promise<unknown> = Promise.resolve();
      act(() => {
        pending = Promise.all([run('conv-a', true), run('conv-a', false)]);
      });

      await act(async () => {
        second.resolve(createPrefs('conv-a', { [field]: false, version: 3 }));
        first.resolve(createPrefs('conv-a', { [field]: true, version: 2 }));
        await pending;
      });

      expect(read('conv-a')?.[field]).toBe(false);
      expect(read('conv-a')?.version).toBe(3);
    });

    it('does not rewind a broadcast that landed while the write was in flight', async () => {
      seed(createPrefs('conv-a', { version: 1 }));

      const inFlight = deferred<UserConversationPreferences>();
      mock().mockReturnValueOnce(inFlight.promise);

      let pending: Promise<unknown> = Promise.resolve();
      act(() => {
        pending = run('conv-a', true);
      });

      broadcast('conv-a', 5, { customName: 'renamed' });

      await act(async () => {
        inFlight.resolve(createPrefs('conv-a', { [field]: true, version: 2 }));
        await pending;
      });

      expect(read('conv-a')?.version).toBe(5);
      expect(read('conv-a')?.customName).toBe('renamed');
    });

    it('applies a versionless response — nothing to arbitrate with', async () => {
      seed(createPrefs('conv-a'));
      mock().mockResolvedValue(createPrefs('conv-a', { [field]: true, customName: 'from-server' }));

      await act(async () => {
        await run('conv-a', true);
      });

      expect(read('conv-a')?.[field]).toBe(true);
      expect(read('conv-a')?.customName).toBe('from-server');
    });

    it('reverts to the pre-write snapshot when the request fails', async () => {
      const snapshot = createPrefs('conv-a', { customName: 'kept', version: 4 });
      seed(snapshot);
      mock().mockRejectedValue(new Error('network down'));

      await act(async () => {
        await expect(run('conv-a', true)).rejects.toThrow('network down');
      });

      expect(read('conv-a')?.[field]).toBe(false);
      expect(read('conv-a')?.customName).toBe('kept');
      expect(read('conv-a')?.version).toBe(4);
    });

    it('drops the entry when a failed write had created it', async () => {
      mock().mockRejectedValue(new Error('network down'));

      await act(async () => {
        await expect(run('conv-b', true)).rejects.toThrow('network down');
      });

      expect(read('conv-b')).toBeUndefined();
    });

    it('does not revert over a newer state that landed during the failed write', async () => {
      seed(createPrefs('conv-a', { version: 1 }));

      const inFlight = deferred<UserConversationPreferences>();
      mock().mockReturnValueOnce(inFlight.promise);

      let pending: Promise<unknown> = Promise.resolve();
      act(() => {
        pending = run('conv-a', true).catch(() => undefined);
      });

      broadcast('conv-a', 6, { customName: 'renamed' });

      await act(async () => {
        inFlight.reject(new Error('network down'));
        await pending;
      });

      expect(read('conv-a')?.version).toBe(6);
      expect(read('conv-a')?.customName).toBe('renamed');
    });
  });

  describe('setReaction', () => {
    it('keeps the newest reaction when two responses come back out of order', async () => {
      seed(createPrefs('conv-a', { version: 1 }));

      const first = deferred<UserConversationPreferences>();
      const second = deferred<UserConversationPreferences>();
      service.updateReaction.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

      let pending: Promise<unknown> = Promise.resolve();
      act(() => {
        pending = Promise.all([
          useConversationPreferencesStore.getState().setReaction('conv-a', '👍'),
          useConversationPreferencesStore.getState().setReaction('conv-a', null),
        ]);
      });

      await act(async () => {
        second.resolve(createPrefs('conv-a', { reaction: undefined, version: 3 }));
        first.resolve(createPrefs('conv-a', { reaction: '👍', version: 2 }));
        await pending;
      });

      expect(read('conv-a')?.reaction).toBeUndefined();
      expect(read('conv-a')?.version).toBe(3);
    });

    it('shows the reaction optimistically before the server answers', async () => {
      seed(createPrefs('conv-a', { version: 1 }));

      const inFlight = deferred<UserConversationPreferences>();
      service.updateReaction.mockReturnValueOnce(inFlight.promise);

      let pending: Promise<unknown> = Promise.resolve();
      act(() => {
        pending = useConversationPreferencesStore.getState().setReaction('conv-a', '🎉');
      });

      expect(read('conv-a')?.reaction).toBe('🎉');

      await act(async () => {
        inFlight.resolve(createPrefs('conv-a', { reaction: '🎉', version: 2 }));
        await pending;
      });

      expect(read('conv-a')?.reaction).toBe('🎉');
      expect(read('conv-a')?.version).toBe(2);
    });
  });
});

/**
 * `user:preferences-reordered` — l'ordre est le SEUL critère de tri de la liste
 * qui n'a pas de version.
 *
 * Le gateway refuse délibérément de bumper `version` sur un réordonnancement
 * (`reorderConversationPreferences`, commentaire « No version bump ») : l'ordre
 * vit hors du chemin versionné et `USER_PREFERENCES_REORDERED` n'en porte
 * aucune. L'arbitre d'`applyRemotePreferences` n'est donc PAS applicable ici —
 * le mirroir iOS (`ConversationStore.applyRemoteReorder`) l'applique lui aussi
 * sans garde.
 */
describe('applyRemoteReorder', () => {
  const read = (conversationId: string) =>
    useConversationPreferencesStore.getState().preferencesMap.get(conversationId);

  const seed = (...prefs: UserConversationPreferences[]) => {
    act(() => {
      useConversationPreferencesStore.setState({
        preferencesMap: new Map(prefs.map((p) => [p.conversationId, p])),
      });
    });
  };

  const reorder = (updates: ReadonlyArray<{ conversationId: string; orderInCategory: number }>) => {
    act(() => {
      useConversationPreferencesStore.getState().applyRemoteReorder(updates);
    });
  };

  beforeEach(() => {
    act(() => {
      useConversationPreferencesStore.getState().reset();
    });
  });

  it('applies the broadcast order onto every known conversation', () => {
    seed(
      createPrefs('conv-a', { orderInCategory: 0 }),
      createPrefs('conv-b', { orderInCategory: 1 })
    );

    reorder([
      { conversationId: 'conv-a', orderInCategory: 5 },
      { conversationId: 'conv-b', orderInCategory: 2 },
    ]);

    expect(read('conv-a')?.orderInCategory).toBe(5);
    expect(read('conv-b')?.orderInCategory).toBe(2);
  });

  it('applies even though the event carries no version', () => {
    seed(createPrefs('conv-a', { orderInCategory: 0, version: 9 }));

    reorder([{ conversationId: 'conv-a', orderInCategory: 3 }]);

    expect(read('conv-a')?.orderInCategory).toBe(3);
    expect(read('conv-a')?.version).toBe(9);
  });

  it('touches nothing else on the row it reorders', () => {
    seed(
      createPrefs('conv-a', {
        orderInCategory: 0,
        isPinned: true,
        isMuted: true,
        categoryId: 'cat-1',
        tags: ['work'],
      })
    );

    reorder([{ conversationId: 'conv-a', orderInCategory: 4 }]);

    expect(read('conv-a')).toMatchObject({
      isPinned: true,
      isMuted: true,
      categoryId: 'cat-1',
      tags: ['work'],
      orderInCategory: 4,
    });
  });

  it('skips a conversation with no local row instead of minting one', () => {
    seed(createPrefs('conv-a', { orderInCategory: 0 }));

    reorder([
      { conversationId: 'ghost', orderInCategory: 9 },
      { conversationId: 'conv-a', orderInCategory: 3 },
    ]);

    expect(read('ghost')).toBeUndefined();
    expect(read('conv-a')?.orderInCategory).toBe(3);
  });

  it('leaves the map referentially unchanged when nothing applies', () => {
    seed(createPrefs('conv-a', { orderInCategory: 0 }));
    const before = useConversationPreferencesStore.getState().preferencesMap;

    reorder([{ conversationId: 'ghost', orderInCategory: 9 }]);
    expect(useConversationPreferencesStore.getState().preferencesMap).toBe(before);

    reorder([]);
    expect(useConversationPreferencesStore.getState().preferencesMap).toBe(before);
  });
});
