/**
 * W9-002 (Lentille LWS-9, écart E10) — dédup par `id` à la SÉLECTION du cache
 * infini de conversations.
 *
 * Contexte : la pagination par OFFSET sur tri serveur `lastMessageAt` desc
 * duplique une conversation en frontière de page quand un message arrive
 * entre le fetch de deux pages (voir le commentaire au-dessus de `select`
 * dans `use-conversations-query.ts`). Ce test simule ce recouvrement — deux
 * pages partageant une même conversation — et vérifie que la vue exposée par
 * le hook (`data.pages[*].conversations`) ne la rend qu'une seule fois, en
 * gardant la PREMIÈRE occurrence (la plus récente au tri desc).
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useInfiniteConversationsQuery } from '@/hooks/queries/use-conversations-query';

const mockGetConversations = jest.fn();
const mockGetConversation = jest.fn();

jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getConversations: (...args: unknown[]) => mockGetConversations(...args),
    getConversation: (...args: unknown[]) => mockGetConversation(...args),
  },
}));

jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    conversations: {
      all: ['conversations'],
      infinite: () => ['conversations', 'infinite'],
      details: () => ['conversations', 'detail'],
      detail: (id: string) => ['conversations', 'detail', id],
    },
  },
}));

const makeConversation = (overrides: Record<string, unknown>) => ({
  id: 'conv-placeholder',
  title: 'Conversation',
  type: 'direct' as const,
  visibility: 'private' as const,
  status: 'active' as const,
  participants: [],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  lastMessageAt: new Date('2024-01-01'),
  unreadCount: 0,
  ...overrides,
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('useInfiniteConversationsQuery — dédup à la sélection (E10)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('déduplique par id une conversation qui recouvre deux pages, en gardant la première occurrence', async () => {
    // Page 1 (offset 0) : conv-1 (rang le plus haut), conv-2, conv-3 (à la
    // frontière — la plus récente au moment du 1er fetch).
    mockGetConversations.mockResolvedValueOnce({
      conversations: [
        makeConversation({ id: 'conv-1', title: 'Un', lastMessageAt: new Date('2024-01-03') }),
        makeConversation({ id: 'conv-2', title: 'Deux', lastMessageAt: new Date('2024-01-02') }),
        makeConversation({ id: 'conv-3', title: 'Trois (frontière)', lastMessageAt: new Date('2024-01-01') }),
      ],
      pagination: { limit: 3, offset: 0, total: 6, hasMore: true },
    });

    // Un message arrive sur conv-3 ENTRE les deux fetchs : elle remonte en
    // tête de tri côté serveur et réapparaît donc dans la page 2 (offset 3),
    // dupliquée avec un `lastMessageAt` plus récent que sur la page 1.
    mockGetConversations.mockResolvedValueOnce({
      conversations: [
        makeConversation({ id: 'conv-3', title: 'Trois (frontière)', lastMessageAt: new Date('2024-01-04') }),
        makeConversation({ id: 'conv-4', title: 'Quatre' }),
        makeConversation({ id: 'conv-5', title: 'Cinq' }),
      ],
      pagination: { limit: 3, offset: 3, total: 6, hasMore: false },
    });

    const { result } = renderHook(() => useInfiniteConversationsQuery({ limit: 3 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.hasNextPage).toBe(true);
    });

    await act(async () => {
      result.current.fetchNextPage();
    });

    await waitFor(() => {
      expect(mockGetConversations).toHaveBeenCalledTimes(2);
      expect(result.current.hasNextPage).toBe(false);
    });

    const allIds = result.current.data!.pages.flatMap((page) =>
      page.conversations.map((c) => c.id)
    );

    // Assertion "rouge sans le correctif" : sans dédup, `allIds` contiendrait
    // deux fois 'conv-3' (longueur 6) — avec le correctif, une seule ligne.
    expect(allIds).toEqual(['conv-1', 'conv-2', 'conv-3', 'conv-4', 'conv-5']);
    expect(allIds.filter((id) => id === 'conv-3')).toHaveLength(1);

    // Garde la PREMIÈRE occurrence (page 1, la plus récente au tri desc au
    // moment du 1er fetch) — jamais la version de la page 2 qui écraserait
    // silencieusement avec un `lastMessageAt` postérieur.
    const conv3 = result.current.data!.pages
      .flatMap((page) => page.conversations)
      .find((c) => c.id === 'conv-3')!;
    expect(conv3.lastMessageAt).toEqual(new Date('2024-01-01'));
  });

  it('ne déduplique rien quand aucune conversation ne recouvre les pages', async () => {
    mockGetConversations.mockResolvedValueOnce({
      conversations: [
        makeConversation({ id: 'conv-1' }),
        makeConversation({ id: 'conv-2' }),
      ],
      pagination: { limit: 2, offset: 0, total: 4, hasMore: true },
    });
    mockGetConversations.mockResolvedValueOnce({
      conversations: [
        makeConversation({ id: 'conv-3' }),
        makeConversation({ id: 'conv-4' }),
      ],
      pagination: { limit: 2, offset: 2, total: 4, hasMore: false },
    });

    const { result } = renderHook(() => useInfiniteConversationsQuery({ limit: 2 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.hasNextPage).toBe(true);
    });

    await act(async () => {
      result.current.fetchNextPage();
    });

    await waitFor(() => {
      expect(mockGetConversations).toHaveBeenCalledTimes(2);
    });

    const allIds = result.current.data!.pages.flatMap((page) =>
      page.conversations.map((c) => c.id)
    );
    expect(allIds).toEqual(['conv-1', 'conv-2', 'conv-3', 'conv-4']);
  });
});
