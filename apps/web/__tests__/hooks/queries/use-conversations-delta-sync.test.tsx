/**
 * Témoins — catch-up delta de la liste de conversations au RECONNECT SOCKET.
 *
 * La fenêtre couverte : une coupure purement socket (redémarrage gateway, drop
 * du load balancer, échec d'upgrade de transport) ne bouge pas `navigator.onLine`,
 * donc le `refetchOnReconnect: 'always'` global — qui écoute le `onlineManager`
 * de React Query, c'est-à-dire le réseau du NAVIGATEUR — ne déclenche rien.
 * Sans ce hook, la liste gardait ses compteurs de non-lus, ses aperçus et son
 * effectif d'avant la coupure jusqu'au prochain focus ou remontage.
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useConversationsDeltaSync } from '@/hooks/queries/use-conversations-delta-sync';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { Conversation } from '@/types';

let socketConnected = false;

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
  useNotificationStore: { getState: () => ({ activeConversationId }) },
}));

const getConversations = jest.fn();
jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getConversations: (...args: unknown[]) => getConversations(...args),
  },
}));

const conv = (id: string, overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id,
    type: 'group',
    title: id,
    isActive: true,
    memberCount: 2,
    participants: [],
    unreadCount: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T10:00:00.000Z'),
    lastMessageAt: new Date('2026-08-01T10:00:00.000Z'),
    ...overrides,
  }) as unknown as Conversation;

const pagedCache = (pages: Conversation[][]) => ({
  pages: pages.map((conversations, index) => ({
    conversations,
    pagination: {
      limit: 20,
      offset: index * 20,
      total: pages.flat().length,
      hasMore: false,
    },
  })),
  pageParams: pages.map((_, index) => index * 20),
});

const cachedConversations = (queryClient: QueryClient): Conversation[] => {
  const data = queryClient.getQueryData(queryKeys.conversations.infinite()) as
    | { pages: { conversations: Conversation[] }[] }
    | undefined;
  return data?.pages.flatMap((page) => page.conversations) ?? [];
};

const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

const renderDeltaSync = (queryClient: QueryClient, enabled = true) => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(({ on }: { on: boolean }) => useConversationsDeltaSync(on), {
    wrapper,
    initialProps: { on: enabled },
  });
};

/** Fait passer la socket de déconnectée à connectée et laisse le hook réagir. */
const reconnect = async (rerender: (props: { on: boolean }) => void, enabled = true) => {
  socketConnected = false;
  await act(async () => {
    rerender({ on: enabled });
  });
  socketConnected = true;
  await act(async () => {
    rerender({ on: enabled });
  });
};

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  jest.setSystemTime(new Date('2026-08-01T12:00:00.000Z'));
  socketConnected = false;
  activeConversationId = null;
  getConversations.mockReset();
  getConversations.mockResolvedValue({
    conversations: [],
    pagination: { limit: 100, offset: 0, total: 0, hasMore: false },
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useConversationsDeltaSync', () => {
  it('fetches nothing on the very first connect — the mount refetch already reads the server', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(queryKeys.conversations.infinite(), pagedCache([[conv('a')]]));

    socketConnected = true;
    renderDeltaSync(queryClient);

    await act(async () => {});
    expect(getConversations).not.toHaveBeenCalled();
  });

  it('fetches a delta on the false → true socket edge, keyed on the newest cached updatedAt', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(
      queryKeys.conversations.infinite(),
      pagedCache([
        [
          conv('a', { updatedAt: new Date('2026-08-01T10:00:00.000Z') }),
          conv('b', { updatedAt: new Date('2026-08-01T11:45:00.000Z') }),
        ],
      ])
    );

    const { rerender } = renderDeltaSync(queryClient);
    await reconnect(rerender);

    await waitFor(() => expect(getConversations).toHaveBeenCalledTimes(1));
    expect(getConversations).toHaveBeenCalledWith(
      expect.objectContaining({ updatedSince: '2026-08-01T11:45:00.000Z', offset: 0 })
    );
  });

  it('merges the delta into the cache without dropping what the socket wrote meanwhile', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(
      queryKeys.conversations.infinite(),
      pagedCache([[conv('a', { unreadCount: 0 })]])
    );

    getConversations.mockImplementation(async () => {
      // Un event socket atterrit PENDANT la requête réseau.
      queryClient.setQueryData(
        queryKeys.conversations.infinite(),
        pagedCache([[conv('a', { unreadCount: 0 }), conv('socket-born')]])
      );
      return {
        conversations: [conv('a', { unreadCount: 7 })],
        pagination: { limit: 100, offset: 0, total: 1, hasMore: false },
      };
    });

    const { rerender } = renderDeltaSync(queryClient);
    await reconnect(rerender);

    await waitFor(() => {
      const ids = cachedConversations(queryClient).map((c) => c.id);
      expect(ids).toContain('socket-born');
    });
    const merged = cachedConversations(queryClient);
    expect(merged.find((c) => c.id === 'a')?.unreadCount).toBe(7);
  });

  it('drops a conversation the delta reports as inactive, and its detail query with it', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(queryKeys.conversations.infinite(), pagedCache([[conv('a'), conv('b')]]));
    queryClient.setQueryData(queryKeys.conversations.detail('b'), conv('b'));

    getConversations.mockResolvedValue({
      conversations: [conv('b', { isActive: false })],
      pagination: { limit: 100, offset: 0, total: 1, hasMore: false },
    });

    const { rerender } = renderDeltaSync(queryClient);
    await reconnect(rerender);

    await waitFor(() =>
      expect(cachedConversations(queryClient).map((c) => c.id)).toEqual(['a'])
    );
    expect(queryClient.getQueryData(queryKeys.conversations.detail('b'))).toBeUndefined();
  });

  it('preserves the page structure so infinite scroll keeps advancing', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(
      queryKeys.conversations.infinite(),
      pagedCache([[conv('a'), conv('b')], [conv('c'), conv('d')]])
    );

    getConversations.mockResolvedValue({
      conversations: [conv('c', { title: 'renamed' })],
      pagination: { limit: 100, offset: 0, total: 1, hasMore: false },
    });

    const { rerender } = renderDeltaSync(queryClient);
    await reconnect(rerender);

    await waitFor(() =>
      expect(
        cachedConversations(queryClient).find((c) => c.id === 'c')?.title
      ).toBe('renamed')
    );
    const data = queryClient.getQueryData(queryKeys.conversations.infinite()) as {
      pages: { conversations: Conversation[] }[];
      pageParams: number[];
    };
    expect(data.pages).toHaveLength(2);
    expect(data.pages.map((p) => p.conversations.length)).toEqual([2, 2]);
    expect(data.pageParams).toEqual([0, 20]);
  });

  it('skips the fetch entirely when the cache is empty — no watermark, nothing to delta from', async () => {
    const queryClient = makeClient();

    const { rerender } = renderDeltaSync(queryClient);
    await reconnect(rerender);

    await act(async () => {});
    expect(getConversations).not.toHaveBeenCalled();
  });

  it('throttles a reconnect flap into a single fetch', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(queryKeys.conversations.infinite(), pagedCache([[conv('a')]]));

    const { rerender } = renderDeltaSync(queryClient);
    await reconnect(rerender);
    await waitFor(() => expect(getConversations).toHaveBeenCalledTimes(1));

    await reconnect(rerender);
    await act(async () => {});
    expect(getConversations).toHaveBeenCalledTimes(1);
  });

  it('runs again once the cooldown has elapsed', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(queryKeys.conversations.infinite(), pagedCache([[conv('a')]]));

    const { rerender } = renderDeltaSync(queryClient);
    await reconnect(rerender);
    await waitFor(() => expect(getConversations).toHaveBeenCalledTimes(1));

    jest.setSystemTime(new Date('2026-08-01T12:01:00.000Z'));
    await reconnect(rerender);
    await waitFor(() => expect(getConversations).toHaveBeenCalledTimes(2));
  });

  it('does not fetch while disabled', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(queryKeys.conversations.infinite(), pagedCache([[conv('a')]]));

    const { rerender } = renderDeltaSync(queryClient, false);
    await reconnect(rerender, false);

    await act(async () => {});
    expect(getConversations).not.toHaveBeenCalled();
  });

  it('escalates to a full invalidation when the delta comes back FULL — a capped page proves nothing', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(queryKeys.conversations.infinite(), pagedCache([[conv('a')]]));
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    getConversations.mockResolvedValue({
      conversations: Array.from({ length: 100 }, (_, i) => conv(`d${i}`)),
      pagination: { limit: 100, offset: 0, total: 100, hasMore: true },
    });

    const { rerender } = renderDeltaSync(queryClient);
    await reconnect(rerender);

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.conversations.infinite() })
    );
    // La fusion a quand même eu lieu : ce qu'on tient est corrigé tout de suite.
    expect(cachedConversations(queryClient).map((c) => c.id)).toContain('d0');
  });

  it('does not escalate on a partial delta — that page IS the whole truth', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(queryKeys.conversations.infinite(), pagedCache([[conv('a')]]));
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    getConversations.mockResolvedValue({
      conversations: [conv('a', { unreadCount: 3 })],
      pagination: { limit: 100, offset: 0, total: 1, hasMore: false },
    });

    const { rerender } = renderDeltaSync(queryClient);
    await reconnect(rerender);

    await waitFor(() =>
      expect(cachedConversations(queryClient)[0]?.unreadCount).toBe(3)
    );
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('leaves the cache untouched when the delta request fails', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(queryKeys.conversations.infinite(), pagedCache([[conv('a')]]));
    getConversations.mockRejectedValue(new Error('gateway still restarting'));

    const { rerender } = renderDeltaSync(queryClient);
    await reconnect(rerender);

    await waitFor(() => expect(getConversations).toHaveBeenCalledTimes(1));
    expect(cachedConversations(queryClient).map((c) => c.id)).toEqual(['a']);
  });

  it('retries on the next reconnect after a failure — a failed delta must not burn the window', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(queryKeys.conversations.infinite(), pagedCache([[conv('a')]]));
    getConversations.mockRejectedValueOnce(new Error('gateway still restarting'));

    const { rerender } = renderDeltaSync(queryClient);
    await reconnect(rerender);
    await waitFor(() => expect(getConversations).toHaveBeenCalledTimes(1));

    jest.setSystemTime(new Date('2026-08-01T12:01:00.000Z'));
    await reconnect(rerender);
    await waitFor(() => expect(getConversations).toHaveBeenCalledTimes(2));
  });

  it('leaves the OPEN conversation at zero unread — the delta writes the same counter as the socket', async () => {
    activeConversationId = 'open';
    const queryClient = makeClient();
    queryClient.setQueryData(
      queryKeys.conversations.infinite(),
      pagedCache([[conv('open', { unreadCount: 0 })]])
    );
    getConversations.mockResolvedValue({
      conversations: [
        conv('open', {
          unreadCount: 7,
          lastMessageAt: new Date('2026-08-01T11:00:00.000Z'),
          updatedAt: new Date('2026-08-01T11:00:00.000Z'),
        }),
      ],
      pagination: { limit: 100, offset: 0, total: 1, hasMore: false },
    });

    const { rerender } = renderDeltaSync(queryClient);
    await reconnect(rerender);

    await waitFor(() => expect(getConversations).toHaveBeenCalledTimes(1));
    expect(cachedConversations(queryClient)[0].unreadCount).toBe(0);
  });

  it('drops the MESSAGE cache of a conversation the delta reports gone, not just its detail', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(
      queryKeys.conversations.infinite(),
      pagedCache([[conv('a'), conv('gone')]])
    );
    queryClient.setQueryData(queryKeys.messages.infinite('gone'), { pages: [], pageParams: [] });
    getConversations.mockResolvedValue({
      conversations: [conv('gone', { isActive: false })],
      pagination: { limit: 100, offset: 0, total: 1, hasMore: false },
    });

    const { rerender } = renderDeltaSync(queryClient);
    await reconnect(rerender);

    await waitFor(() => expect(getConversations).toHaveBeenCalledTimes(1));
    expect(cachedConversations(queryClient).map((c) => c.id)).toEqual(['a']);
    expect(queryClient.getQueryData(queryKeys.messages.infinite('gone'))).toBeUndefined();
  });
});
