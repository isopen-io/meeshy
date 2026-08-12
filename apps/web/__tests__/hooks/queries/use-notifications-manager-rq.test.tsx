/**
 * Tests for useNotificationsManagerRQ — the socket-driven notification manager.
 *
 * Focus: the real-time `notification:read` handler must keep the badge count
 * (`pages[0].unreadCount`, the exact field the tab title / favicon / bell badge
 * render) in sync when a notification is read on another device, and must be
 * idempotent against the local-optimistic-read → server self-echo path.
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useNotificationsManagerRQ } from '@/hooks/queries/use-notifications-manager-rq';

const mockFetchNotifications = jest.fn();

jest.mock('@/services/notification.service', () => ({
  NotificationService: {
    fetchNotifications: (...args: unknown[]) => mockFetchNotifications(...args),
    getUnreadCount: jest.fn(),
    getCounts: jest.fn(),
    markAsRead: jest.fn().mockResolvedValue(undefined),
    markAllAsRead: jest.fn(),
    deleteNotification: jest.fn(),
    deleteAllRead: jest.fn(),
    markConversationRead: jest.fn().mockResolvedValue(undefined),
    markPostRead: jest.fn().mockResolvedValue(undefined),
  },
}));

let capturedReadHandler: ((notificationId: string) => void) | null = null;
let capturedNotificationHandler: ((notification: unknown) => void) | null = null;
let capturedDeletedHandler: ((notificationId: string) => void) | null = null;
let capturedCountsHandler: ((counts: { unread?: number; total?: number }) => void) | null = null;
let capturedDesyncHandler: ((reason: 'gap' | 'reconnect') => void) | null = null;
const desyncUnsubscribe = jest.fn();

jest.mock('@/services/notification-socketio.singleton', () => ({
  notificationSocketIO: {
    connect: jest.fn(),
    onNotification: jest.fn((cb: (notification: unknown) => void) => {
      capturedNotificationHandler = cb;
      return () => {};
    }),
    onNotificationRead: jest.fn((cb: (id: string) => void) => {
      capturedReadHandler = cb;
      return () => {};
    }),
    onNotificationDeleted: jest.fn((cb: (id: string) => void) => {
      capturedDeletedHandler = cb;
      return () => {};
    }),
    onCounts: jest.fn((cb: (counts: { unread?: number; total?: number }) => void) => {
      capturedCountsHandler = cb;
      return () => {};
    }),
    onSyncDesync: jest.fn((cb: (reason: 'gap' | 'reconnect') => void) => {
      capturedDesyncHandler = cb;
      return desyncUnsubscribe;
    }),
  },
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/stores/auth-store', () => {
  const useAuthStore = () => ({ isAuthenticated: true });
  useAuthStore.getState = () => ({ authToken: 'test-token' });
  return { useAuthStore };
});

let mockActiveConversationId: string | null = null;

jest.mock('@/stores/notification-store', () => {
  const useNotificationStore = () => ({});
  useNotificationStore.getState = () => ({ activeConversationId: mockActiveConversationId });
  return { useNotificationStore };
});

jest.mock('@/utils/notification-helpers', () => ({
  buildNotificationTitle: () => 'title',
  buildNotificationContent: () => 'content',
  getNotificationLink: () => '/link',
  getNotificationBorderColor: () => 'border',
}));

jest.mock('sonner', () => ({
  toast: { custom: jest.fn(), dismiss: jest.fn() },
}));

const makeNotification = (id: string, isRead: boolean) => ({
  id,
  type: 'message',
  content: 'You have a new message',
  priority: 'normal',
  userId: 'user-1',
  context: {},
  metadata: {},
  state: { isRead, readAt: isRead ? new Date('2024-01-02') : null, createdAt: new Date('2024-01-01') },
  delivery: { emailSent: false, pushSent: false },
});

const seedPage = (unreadCount: number) => ({
  data: {
    notifications: [
      makeNotification('notif-1', false),
      makeNotification('notif-2', false),
      makeNotification('notif-3', true),
    ],
    pagination: { limit: 20, offset: 0, total: 3, hasMore: false },
    unreadCount,
  },
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useNotificationsManagerRQ — notification:read handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedReadHandler = null;
  });

  it('decrements the badge count (pages[0].unreadCount) when a notification is read remotely', async () => {
    mockFetchNotifications.mockResolvedValue(seedPage(2));

    const { result } = renderHook(() => useNotificationsManagerRQ(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.unreadCount).toBe(2));
    await waitFor(() => expect(capturedReadHandler).not.toBeNull());

    act(() => {
      capturedReadHandler!('notif-1');
    });

    await waitFor(() => expect(result.current.unreadCount).toBe(1));
    expect(result.current.counts.unread).toBe(1);
  });

  it('is idempotent for the local-optimistic-read → server self-echo (already-read notification)', async () => {
    mockFetchNotifications.mockResolvedValue(seedPage(2));

    const { result } = renderHook(() => useNotificationsManagerRQ(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.unreadCount).toBe(2));
    await waitFor(() => expect(capturedReadHandler).not.toBeNull());

    act(() => {
      capturedReadHandler!('notif-1');
    });
    await waitFor(() => expect(result.current.unreadCount).toBe(1));

    // Redelivery / self-echo of the same read must not double-decrement.
    act(() => {
      capturedReadHandler!('notif-1');
    });
    await waitFor(() => expect(result.current.unreadCount).toBe(1));
  });

  it('does not change the count when an already-read notification is reported read', async () => {
    mockFetchNotifications.mockResolvedValue(seedPage(2));

    const { result } = renderHook(() => useNotificationsManagerRQ(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.unreadCount).toBe(2));
    await waitFor(() => expect(capturedReadHandler).not.toBeNull());

    act(() => {
      capturedReadHandler!('notif-3'); // already read
    });

    await waitFor(() => expect(result.current.notifications.find((n) => n.id === 'notif-3')?.state.isRead).toBe(true));
    expect(result.current.unreadCount).toBe(2);
  });
});

/**
 * Real-time freshness. The global QueryClient runs with `staleTime: Infinity` +
 * `refetchOnMount: false`, and the notification list was persisted to IndexedDB
 * for 24h. A list restored from that cache was therefore displayed as-is, and
 * notifications that arrived while the app was closed (socket disconnected,
 * so nothing pushed them into the cache) never showed up — neither in the bell
 * badge nor on /notifications — no matter how many times the page was reloaded.
 */
describe('useNotificationsManagerRQ — freshness', () => {
  function createStaleForeverWrapper() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 30 * 60 * 1000, staleTime: Infinity, refetchOnMount: false },
      },
    });
    const wrapper = function Wrapper({ children }: { children: React.ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
    return { wrapper, queryClient };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    capturedNotificationHandler = null;
    capturedReadHandler = null;
  });

  it('re-reads the server on mount even when a cached list exists', async () => {
    const queryKey = ['notifications', 'list', 'infinite', {}];
    const { wrapper, queryClient } = createStaleForeverWrapper();

    queryClient.setQueryData(queryKey, {
      pages: [{ notifications: [makeNotification('stale-1', false)], pagination: { limit: 20, offset: 0, total: 1, hasMore: false }, unreadCount: 1 }],
      pageParams: [0],
    });

    mockFetchNotifications.mockResolvedValue(seedPage(2));

    renderHook(() => useNotificationsManagerRQ(), { wrapper });

    await waitFor(() => expect(mockFetchNotifications).toHaveBeenCalled());
  });

  it('invalidates the notification lists when none holds data yet', async () => {
    const { wrapper, queryClient } = createStaleForeverWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    // Never resolves: the initial fetch is still in flight when the socket
    // event lands, so no cache entry exists to write into.
    mockFetchNotifications.mockImplementation(() => new Promise(() => {}));

    renderHook(() => useNotificationsManagerRQ(), { wrapper });

    await waitFor(() => expect(capturedNotificationHandler).not.toBeNull());

    act(() => {
      capturedNotificationHandler!(makeNotification('brand-new', false));
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['notifications', 'list'] })
    );
  });
});

/**
 * `notification:counts` est le SEUL événement que le gateway émet après tout
 * marquage serveur (ouverture de conversation, vue d'un post, autre appareil).
 * Il était reçu par le singleton puis jeté : la cloche ne se corrigeait qu'au
 * prochain refetch. La valeur serveur est autoritaire et absolue.
 */
describe('useNotificationsManagerRQ — notification:counts (resync autoritaire)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedCountsHandler = null;
  });

  it('applique la valeur absolue du serveur au badge', async () => {
    mockFetchNotifications.mockResolvedValue(seedPage(2));

    const { result } = renderHook(() => useNotificationsManagerRQ(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.unreadCount).toBe(2));
    await waitFor(() => expect(capturedCountsHandler).not.toBeNull());

    act(() => {
      capturedCountsHandler!({ unread: 0, total: 3 });
    });

    await waitFor(() => expect(result.current.unreadCount).toBe(0));
  });

  it('ignore un payload sans champ unread numérique', async () => {
    mockFetchNotifications.mockResolvedValue(seedPage(2));

    const { result } = renderHook(() => useNotificationsManagerRQ(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.unreadCount).toBe(2));
    await waitFor(() => expect(capturedCountsHandler).not.toBeNull());

    act(() => {
      capturedCountsHandler!({} as { unread?: number });
    });

    expect(result.current.unreadCount).toBe(2);
  });
});

describe('useNotificationsManagerRQ — notification:deleted (multi-appareils)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedDeletedHandler = null;
  });

  it('retire la ligne et décrémente quand la notification supprimée était non lue', async () => {
    mockFetchNotifications.mockResolvedValue(seedPage(2));

    const { result } = renderHook(() => useNotificationsManagerRQ(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.unreadCount).toBe(2));
    await waitFor(() => expect(capturedDeletedHandler).not.toBeNull());

    act(() => {
      capturedDeletedHandler!('notif-1');
    });

    await waitFor(() => expect(result.current.notifications.some((n) => n.id === 'notif-1')).toBe(false));
    expect(result.current.unreadCount).toBe(1);
  });

  it('ne décrémente pas pour une notification déjà lue', async () => {
    mockFetchNotifications.mockResolvedValue(seedPage(2));

    const { result } = renderHook(() => useNotificationsManagerRQ(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.unreadCount).toBe(2));
    await waitFor(() => expect(capturedDeletedHandler).not.toBeNull());

    act(() => {
      capturedDeletedHandler!('notif-3'); // déjà lue
    });

    await waitFor(() => expect(result.current.notifications.some((n) => n.id === 'notif-3')).toBe(false));
    expect(result.current.unreadCount).toBe(2);
  });
});

/**
 * Miroir du `markConsumedOnArrival` iOS : une notification pour la
 * conversation OUVERTE naît consommée — insérée déjà lue (sinon la liste
 * montre une ligne non lue avec un compteur qui n'a pas bougé) et marquée lue
 * côté serveur pour que `notification:counts` ne la recompte pas.
 */
describe('useNotificationsManagerRQ — notification pour la conversation active', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedNotificationHandler = null;
    mockActiveConversationId = 'conv-42';
  });

  afterEach(() => {
    mockActiveConversationId = null;
  });

  it('insère la notification déjà lue, sans incrément, et la marque lue côté serveur', async () => {
    const { NotificationService } = jest.requireMock('@/services/notification.service');
    mockFetchNotifications.mockResolvedValue(seedPage(2));

    const { result } = renderHook(() => useNotificationsManagerRQ(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.unreadCount).toBe(2));
    await waitFor(() => expect(capturedNotificationHandler).not.toBeNull());

    act(() => {
      capturedNotificationHandler!({
        ...makeNotification('live-1', false),
        context: { conversationId: 'conv-42' },
      });
    });

    await waitFor(() =>
      expect(result.current.notifications.find((n) => n.id === 'live-1')?.state.isRead).toBe(true)
    );
    expect(result.current.unreadCount).toBe(2);
    expect(NotificationService.markAsRead).toHaveBeenCalledWith('live-1');
  });
});

/**
 * SyncEngine — le transport signale que le client a perdu de vue l'état serveur
 * (trou de `_seq`, ou reconnexion après coupure). Le client global tourne en
 * `staleTime: Infinity` : sans ce rattrapage, une notification manquée ne
 * réapparaît JAMAIS de la session.
 */
describe('useNotificationsManagerRQ — sync desync resync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedDesyncHandler = null;
  });

  const mountAndSeed = async () => {
    mockFetchNotifications.mockResolvedValue(seedPage(2));
    const rendered = renderHook(() => useNotificationsManagerRQ(), { wrapper: createWrapper() });
    await waitFor(() => expect(rendered.result.current.unreadCount).toBe(2));
    await waitFor(() => expect(capturedDesyncHandler).not.toBeNull());
    mockFetchNotifications.mockClear();
    return rendered;
  };

  it('refetches the list from the server when a sequence gap is signalled', async () => {
    await mountAndSeed();

    act(() => {
      capturedDesyncHandler!('gap');
    });

    await waitFor(() => expect(mockFetchNotifications).toHaveBeenCalled());
  });

  it('refetches after a reconnect — the outage window is blind to gap detection', async () => {
    await mountAndSeed();

    act(() => {
      capturedDesyncHandler!('reconnect');
    });

    await waitFor(() => expect(mockFetchNotifications).toHaveBeenCalled());
  });

  it('coalesces a burst into a single resync', async () => {
    await mountAndSeed();

    act(() => {
      capturedDesyncHandler!('gap');
      capturedDesyncHandler!('gap');
      capturedDesyncHandler!('reconnect');
    });

    await waitFor(() => expect(mockFetchNotifications).toHaveBeenCalled());
    // Une seule liste est active (la query infinie du hook) : une rafale
    // débouncée ne doit produire qu'UN aller-retour serveur.
    expect(mockFetchNotifications).toHaveBeenCalledTimes(1);
  });

  it('does not refetch before the debounce window elapses', async () => {
    await mountAndSeed();

    act(() => {
      capturedDesyncHandler!('gap');
    });

    expect(mockFetchNotifications).not.toHaveBeenCalled();
  });

  it('unsubscribes and cancels a pending resync on unmount', async () => {
    const { unmount } = await mountAndSeed();

    act(() => {
      capturedDesyncHandler!('gap');
    });
    unmount();

    expect(desyncUnsubscribe).toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(mockFetchNotifications).not.toHaveBeenCalled();
  });
});
