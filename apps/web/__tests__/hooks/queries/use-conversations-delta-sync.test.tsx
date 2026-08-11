/**
 * Témoins — rattrapage de la LISTE de conversations sur une coupure SOCKET.
 *
 * Le QueryClient global tourne en `staleTime: Infinity` : Socket.IO EST la
 * source de vérité temps réel. Une coupure purement socket (redémarrage
 * gateway, drop du load balancer, échec d'upgrade de transport) ne bouge pas
 * `navigator.onLine` — donc ni `refetchOnReconnect` ni l'`onlineManager` de
 * React Query ne déclenchent quoi que ce soit. Sans ce delta, la liste garde
 * ses compteurs, ses aperçus et son effectif d'avant la coupure jusqu'au
 * prochain focus de fenêtre ou remontage.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { queryKeys } from '@/lib/react-query/query-keys';
import {
  DELTA_MAX_PAGES,
  syncConversationsDelta,
  useConversationsDeltaSync,
} from '@/hooks/queries/use-conversations-delta-sync';
import type { Conversation } from '@meeshy/shared/types';

const mockGetConversations = jest.fn();

jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getConversations: (...args: unknown[]) => mockGetConversations(...args),
  },
}));

let socketConnected = true;
jest.mock('@/hooks/use-connection-status', () => ({
  useConnectionStatus: () => ({
    isOnline: true,
    isSocketConnected: socketConnected,
    hasSocket: true,
    isReady: socketConnected,
  }),
}));

let activeConversationId: string | null = null;
jest.mock('@/stores/notification-store', () => ({
  useNotificationStore: {
    getState: () => ({ activeConversationId }),
  },
}));

const conv = (id: string, overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id,
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    lastMessageAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }) as Conversation;

const page = (conversations: Conversation[], offset = 0) => ({
  conversations,
  pagination: { limit: 20, offset, total: conversations.length, hasMore: false },
});

const deltaResponse = (conversations: Conversation[], hasMore = false) => ({
  conversations,
  pagination: { limit: 100, offset: 0, total: conversations.length, hasMore },
});

const makeClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

const seed = (client: QueryClient, pages: ReturnType<typeof page>[]) => {
  client.setQueryData(queryKeys.conversations.infinite(), {
    pages,
    pageParams: pages.map((_, i) => i * 20),
  });
};

const cachedConversations = (client: QueryClient): Conversation[] => {
  const data = client.getQueryData(queryKeys.conversations.infinite()) as
    | { pages: { conversations: Conversation[] }[] }
    | undefined;
  return data ? data.pages.flatMap((p) => p.conversations) : [];
};

// Le cooldown est PARTAGÉ au niveau module — c'est sa raison d'être : plusieurs
// écrans montent la liste, et une socket qui bat la chamade enchaîne les fronts
// de reconnexion (iOS a corrigé le même défaut de N listeners pour un seul
// signal `didReconnect`). Recharger le module entre les tests remplacerait
// aussi l'instance de React qu'il capture ; on fait donc avancer l'horloge que
// le garde consulte, ce qui est exactement ce qui le rouvre en production.
let clock = 1_000_000;

beforeEach(() => {
  mockGetConversations.mockReset();
  socketConnected = true;
  activeConversationId = null;
  clock += 10 * 60 * 1000;
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('syncConversationsDelta', () => {
  it('reads forward from the newest updatedAt the cache holds', async () => {
    const client = makeClient();
    seed(client, [
      page([
        conv('a', { updatedAt: new Date('2026-05-01T00:00:00.000Z') }),
        conv('b', { updatedAt: new Date('2026-05-20T10:30:00.000Z') }),
      ]),
    ]);
    mockGetConversations.mockResolvedValue(deltaResponse([]));

    await syncConversationsDelta(client);

    expect(mockGetConversations).toHaveBeenCalledWith(
      expect.objectContaining({ updatedSince: '2026-05-20T10:30:00.000Z' })
    );
  });

  it('applies the server row over the cached one and re-sorts the list', async () => {
    const client = makeClient();
    seed(client, [
      page([
        conv('quiet', {
          lastMessageAt: new Date('2026-05-10T00:00:00.000Z'),
          updatedAt: new Date('2026-05-10T00:00:00.000Z'),
        }),
        conv('busy', {
          title: 'stale',
          lastMessageAt: new Date('2026-05-01T00:00:00.000Z'),
          updatedAt: new Date('2026-05-01T00:00:00.000Z'),
        }),
      ]),
    ]);
    mockGetConversations.mockResolvedValue(
      deltaResponse([
        conv('busy', {
          title: 'fresh',
          lastMessageAt: new Date('2026-05-20T00:00:00.000Z'),
          updatedAt: new Date('2026-05-20T00:00:00.000Z'),
        }),
      ])
    );

    await syncConversationsDelta(client);

    const cached = cachedConversations(client);
    expect(cached.map((c) => c.id)).toEqual(['busy', 'quiet']);
    expect(cached[0].title).toBe('fresh');
  });

  it('surfaces a conversation created during the outage', async () => {
    const client = makeClient();
    seed(client, [page([conv('known')])]);
    mockGetConversations.mockResolvedValue(
      deltaResponse([
        conv('brand-new', {
          lastMessageAt: new Date('2026-06-01T00:00:00.000Z'),
          updatedAt: new Date('2026-06-01T00:00:00.000Z'),
        }),
      ])
    );

    await syncConversationsDelta(client);

    expect(cachedConversations(client).map((c) => c.id)).toEqual(['brand-new', 'known']);
  });

  it('preserves the page boundaries the infinite query paginates on', async () => {
    const client = makeClient();
    seed(client, [page([conv('a'), conv('b')], 0), page([conv('c')], 20)]);
    mockGetConversations.mockResolvedValue(deltaResponse([conv('c', { title: 'fresh' })]));

    await syncConversationsDelta(client);

    const data = client.getQueryData(queryKeys.conversations.infinite()) as {
      pages: { conversations: Conversation[] }[];
      pageParams: number[];
    };
    expect(data.pages.map((p) => p.conversations.length)).toEqual([2, 1]);
    expect(data.pageParams).toEqual([0, 20]);
  });

  it('does nothing at all when the list has never been fetched', async () => {
    const client = makeClient();

    await syncConversationsDelta(client);

    expect(mockGetConversations).not.toHaveBeenCalled();
  });

  it('walks the next offset while the server reports more rows', async () => {
    const client = makeClient();
    seed(client, [page([conv('a')])]);
    mockGetConversations
      .mockResolvedValueOnce(deltaResponse([conv('a', { title: 'p1' })], true))
      .mockResolvedValueOnce(deltaResponse([conv('b')], false));

    await syncConversationsDelta(client);

    expect(mockGetConversations).toHaveBeenCalledTimes(2);
    expect(mockGetConversations).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 1 })
    );
  });

  it('falls back to a full re-read when the gap is wider than the walk allows', async () => {
    const client = makeClient();
    seed(client, [page([conv('a')])]);
    mockGetConversations.mockResolvedValue(deltaResponse([conv('a')], true));
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    await syncConversationsDelta(client);

    expect(mockGetConversations).toHaveBeenCalledTimes(DELTA_MAX_PAGES);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.conversations.infinite(),
    });
  });

  it('leaves the cache untouched when the delta request fails', async () => {
    const client = makeClient();
    seed(client, [page([conv('a', { title: 'cached' })])]);
    mockGetConversations.mockRejectedValue(new Error('offline'));

    await expect(syncConversationsDelta(client)).resolves.toBeUndefined();

    expect(cachedConversations(client)[0].title).toBe('cached');
  });

  it('does not re-light the badge of a conversation read while disconnected', async () => {
    const client = makeClient();
    seed(client, [
      page([
        conv('read-here', {
          unreadCount: 0,
          lastMessageAt: new Date('2026-05-10T00:00:00.000Z'),
        }),
      ]),
    ]);
    mockGetConversations.mockResolvedValue(
      deltaResponse([
        conv('read-here', {
          unreadCount: 3,
          lastMessageAt: new Date('2026-05-10T00:00:00.000Z'),
          updatedAt: new Date('2026-05-11T00:00:00.000Z'),
        }),
      ])
    );

    await syncConversationsDelta(client);

    expect(cachedConversations(client)[0].unreadCount).toBe(0);
  });

  it('keeps the open conversation at zero unread', async () => {
    activeConversationId = 'open';
    const client = makeClient();
    seed(client, [page([conv('open', { unreadCount: 0 })])]);
    mockGetConversations.mockResolvedValue(
      deltaResponse([
        conv('open', {
          unreadCount: 6,
          lastMessageAt: new Date('2026-05-20T00:00:00.000Z'),
          updatedAt: new Date('2026-05-20T00:00:00.000Z'),
        }),
      ])
    );

    await syncConversationsDelta(client);

    expect(cachedConversations(client)[0].unreadCount).toBe(0);
  });

  it('drops the message cache of a conversation the delta reports gone', async () => {
    const client = makeClient();
    seed(client, [page([conv('gone')])]);
    client.setQueryData(queryKeys.messages.infinite('gone'), { pages: [], pageParams: [] });
    mockGetConversations.mockResolvedValue(
      deltaResponse([conv('gone', { isActive: false })])
    );

    await syncConversationsDelta(client);

    expect(cachedConversations(client)).toEqual([]);
    expect(client.getQueryData(queryKeys.messages.infinite('gone'))).toBeUndefined();
  });

  it('coalesces a burst of triggers into a single network read', async () => {
    const client = makeClient();
    seed(client, [page([conv('a')])]);
    mockGetConversations.mockResolvedValue(deltaResponse([]));

    await syncConversationsDelta(client);
    await syncConversationsDelta(client);
    await syncConversationsDelta(client);

    expect(mockGetConversations).toHaveBeenCalledTimes(1);
  });
});

describe('useConversationsDeltaSync', () => {
  const wrapper =
    (client: QueryClient) =>
    ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

  it('stays quiet on the first connection — mounting already re-reads the server', async () => {
    const client = makeClient();
    seed(client, [page([conv('a')])]);
    mockGetConversations.mockResolvedValue(deltaResponse([]));

    renderHook(() => useConversationsDeltaSync(), { wrapper: wrapper(client) });

    await waitFor(() => expect(mockGetConversations).not.toHaveBeenCalled());
  });

  it('catches up on the false → true edge of the socket', async () => {
    const client = makeClient();
    seed(client, [page([conv('a')])]);
    mockGetConversations.mockResolvedValue(deltaResponse([]));

    socketConnected = false;
    const { rerender } = renderHook(() => useConversationsDeltaSync(), {
      wrapper: wrapper(client),
    });

    socketConnected = true;
    rerender();

    await waitFor(() => expect(mockGetConversations).toHaveBeenCalledTimes(1));
  });

  it('does not catch up while disabled', async () => {
    const client = makeClient();
    seed(client, [page([conv('a')])]);
    mockGetConversations.mockResolvedValue(deltaResponse([]));

    socketConnected = false;
    const { rerender } = renderHook(
      () => useConversationsDeltaSync({ enabled: false }),
      { wrapper: wrapper(client) }
    );

    socketConnected = true;
    rerender();

    await waitFor(() => expect(mockGetConversations).not.toHaveBeenCalled());
  });
});
