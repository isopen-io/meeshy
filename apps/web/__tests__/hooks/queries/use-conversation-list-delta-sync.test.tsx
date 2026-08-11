/**
 * Rattrapage de la liste de conversations au reconnect SOCKET.
 *
 * Ce que les tests fixent : QUAND le rattrapage part (front `false → true` de la
 * socket, jamais au premier connect), ce qu'il DEMANDE (`updatedSince` = borne
 * serveur du cache) et ce qu'il ÉCRIT (fusion upsert dans les pages existantes,
 * jamais un remplacement).
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { Conversation } from '@meeshy/shared/types';
import { useConversationListDeltaSync } from '@/hooks/queries/use-conversation-list-delta-sync';

const mockGetConversations = jest.fn();
jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getConversations: (...args: unknown[]) => mockGetConversations(...args),
  },
}));

let socketConnected = false;
jest.mock('@/hooks/use-connection-status', () => ({
  useConnectionStatus: () => ({
    isOnline: true,
    isSocketConnected: socketConnected,
    hasSocket: true,
    isReady: socketConnected,
  }),
}));

jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    conversations: {
      all: ['conversations'],
      lists: () => ['conversations', 'list'],
      infinite: () => ['conversations', 'infinite'],
    },
  },
}));

const INFINITE_KEY = ['conversations', 'infinite'];

function makeConversation(overrides: Partial<Conversation> & { id: string }): Conversation {
  return {
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T10:00:00.000Z'),
    lastMessageAt: new Date('2026-08-01T10:00:00.000Z'),
    unreadCount: 0,
    ...overrides,
  };
}

function seedList(queryClient: QueryClient, conversations: Conversation[], hasMore = false) {
  queryClient.setQueryData(INFINITE_KEY, {
    pages: [
      {
        conversations,
        pagination: { limit: 20, offset: 0, total: conversations.length, hasMore },
      },
    ],
    pageParams: [0],
  });
}

function createHarness() {
  // `gcTime` non nul : le cache infinite et le garde-fou du rattrapage n'ont
  // aucun observateur dans ces tests, et React Query collecte immédiatement une
  // entrée non observée dont le `gcTime` est 0.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 60_000, staleTime: 0 } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

function cachedConversations(queryClient: QueryClient): Conversation[] {
  const data = queryClient.getQueryData<{ pages: { conversations: Conversation[] }[] }>(INFINITE_KEY);
  return data?.pages.flatMap((page) => page.conversations) ?? [];
}

describe('useConversationListDeltaSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    socketConnected = false;
    mockGetConversations.mockResolvedValue({ conversations: [] });
  });

  it('ne demande RIEN au premier connect — le montage relit déjà la liste', async () => {
    const { queryClient, wrapper } = createHarness();
    seedList(queryClient, [makeConversation({ id: 'a' })]);

    socketConnected = true;
    const { rerender } = renderHook(
      () => useConversationListDeltaSync({ enabled: true, limit: 20 }),
      { wrapper }
    );
    rerender();

    await waitFor(() => expect(mockGetConversations).not.toHaveBeenCalled());
  });

  it('rattrape au RE-connect, borné par le `updatedAt` le plus récent du cache', async () => {
    const { queryClient, wrapper } = createHarness();
    seedList(queryClient, [
      makeConversation({ id: 'a', updatedAt: new Date('2026-08-01T10:00:00.000Z') }),
      makeConversation({ id: 'b', updatedAt: new Date('2026-08-01T12:00:00.000Z') }),
    ]);

    const { rerender } = renderHook(
      () => useConversationListDeltaSync({ enabled: true, limit: 20 }),
      { wrapper }
    );

    socketConnected = true;
    rerender();

    await waitFor(() => expect(mockGetConversations).toHaveBeenCalledTimes(1));
    expect(mockGetConversations).toHaveBeenCalledWith({
      limit: 20,
      updatedSince: '2026-08-01T12:00:00.000Z',
    });
  });

  it('fusionne le delta dans les pages en cache au lieu de les remplacer', async () => {
    const { queryClient, wrapper } = createHarness();
    seedList(queryClient, [
      makeConversation({ id: 'a', title: 'Ancien', unreadCount: 0 }),
      makeConversation({ id: 'b', title: 'Intacte' }),
    ]);
    mockGetConversations.mockResolvedValue({
      conversations: [
        makeConversation({
          id: 'a',
          title: 'Rattrapée',
          unreadCount: 3,
          lastMessageAt: new Date('2026-08-01T14:00:00.000Z'),
          updatedAt: new Date('2026-08-01T14:00:00.000Z'),
        }),
      ],
    });

    const { rerender } = renderHook(
      () => useConversationListDeltaSync({ enabled: true, limit: 20 }),
      { wrapper }
    );

    socketConnected = true;
    rerender();

    await waitFor(() => {
      const conversations = cachedConversations(queryClient);
      expect(conversations.find((c) => c.id === 'a')?.title).toBe('Rattrapée');
    });

    const conversations = cachedConversations(queryClient);
    expect(conversations.map((c) => c.id)).toEqual(['a', 'b']);
    expect(conversations.find((c) => c.id === 'a')?.unreadCount).toBe(3);
    expect(conversations.find((c) => c.id === 'b')?.title).toBe('Intacte');
  });

  it('absorbe un second front dans la fenêtre de refroidissement — une requête, pas deux', async () => {
    const { queryClient, wrapper } = createHarness();
    seedList(queryClient, [makeConversation({ id: 'a' })]);

    const { rerender } = renderHook(
      () => useConversationListDeltaSync({ enabled: true, limit: 20 }),
      { wrapper }
    );

    socketConnected = true;
    rerender();
    await waitFor(() => expect(mockGetConversations).toHaveBeenCalledTimes(1));

    socketConnected = false;
    rerender();
    socketConnected = true;
    rerender();

    await waitFor(() => expect(mockGetConversations).toHaveBeenCalledTimes(1));
  });

  it('ne part pas sans cache — il n’y a aucune borne à lire', async () => {
    const { wrapper } = createHarness();

    const { rerender } = renderHook(
      () => useConversationListDeltaSync({ enabled: true, limit: 20 }),
      { wrapper }
    );

    socketConnected = true;
    rerender();

    await waitFor(() => expect(mockGetConversations).not.toHaveBeenCalled());
  });

  it('ne part pas quand la liste est désactivée', async () => {
    const { queryClient, wrapper } = createHarness();
    seedList(queryClient, [makeConversation({ id: 'a' })]);

    const { rerender } = renderHook(
      () => useConversationListDeltaSync({ enabled: false, limit: 20 }),
      { wrapper }
    );

    socketConnected = true;
    rerender();

    await waitFor(() => expect(mockGetConversations).not.toHaveBeenCalled());
  });

  it('laisse le cache intact quand le rattrapage échoue', async () => {
    const { queryClient, wrapper } = createHarness();
    seedList(queryClient, [makeConversation({ id: 'a', title: 'Cache' })]);
    mockGetConversations.mockRejectedValue(new Error('gateway down'));

    const { rerender } = renderHook(
      () => useConversationListDeltaSync({ enabled: true, limit: 20 }),
      { wrapper }
    );

    socketConnected = true;
    rerender();

    await waitFor(() => expect(mockGetConversations).toHaveBeenCalledTimes(1));
    expect(cachedConversations(queryClient).map((c) => c.title)).toEqual(['Cache']);
  });

  it('retire de la liste une conversation que le delta déclare inactive', async () => {
    const { queryClient, wrapper } = createHarness();
    seedList(queryClient, [makeConversation({ id: 'a' }), makeConversation({ id: 'b' })]);
    mockGetConversations.mockResolvedValue({
      conversations: [makeConversation({ id: 'a', isActive: false })],
    });

    const { rerender } = renderHook(
      () => useConversationListDeltaSync({ enabled: true, limit: 20 }),
      { wrapper }
    );

    socketConnected = true;
    rerender();

    await waitFor(() => expect(cachedConversations(queryClient).map((c) => c.id)).toEqual(['b']));
  });
});
