/**
 * Tests for useConversationQuery and useInfiniteConversationsQuery.
 *
 * Les hooks de la forme PLATE (`useConversationsQuery`,
 * `useConversationsWithPagination`) et les mutations create/delete qui
 * écrivaient dans son cache ont été retirés : `['conversations','list']` et
 * `['conversations','infinite']` sont des préfixes DISJOINTS, et aucun écran
 * n'a jamais lu le premier.
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import React from 'react';
import {
  useConversationQuery,
  useInfiniteConversationsQuery,
} from '@/hooks/queries/use-conversations-query';

// Mock the conversations service
const mockGetConversations = jest.fn();
const mockGetConversation = jest.fn();

jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getConversations: (...args: unknown[]) => mockGetConversations(...args),
    getConversation: (...args: unknown[]) => mockGetConversation(...args),
  },
}));

// Mock query keys
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

// Test data
const mockConversation = {
  id: 'conv-1',
  title: 'Test Conversation',
  type: 'direct' as const,
  visibility: 'private' as const,
  status: 'active' as const,
  participants: [],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  lastMessageAt: new Date('2024-01-01'),
  unreadCount: 0,
};

const mockConversations = [
  mockConversation,
  { ...mockConversation, id: 'conv-2', title: 'Second Conversation' },
  { ...mockConversation, id: 'conv-3', title: 'Third Conversation' },
];

const mockPaginatedResponse = {
  conversations: mockConversations,
  pagination: {
    limit: 20,
    offset: 0,
    total: 3,
    hasMore: false,
  },
};

// Helper to create a wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
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

describe('useConversationQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not fetch when conversationId is null', () => {
    mockGetConversation.mockResolvedValue(mockConversation);

    const { result } = renderHook(() => useConversationQuery(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetConversation).not.toHaveBeenCalled();
  });

  it('should not fetch when conversationId is undefined', () => {
    mockGetConversation.mockResolvedValue(mockConversation);

    const { result } = renderHook(() => useConversationQuery(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetConversation).not.toHaveBeenCalled();
  });

  it('should fetch conversation when ID is provided', async () => {
    mockGetConversation.mockResolvedValue(mockConversation);

    const { result } = renderHook(() => useConversationQuery('conv-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGetConversation).toHaveBeenCalledWith('conv-1');
    expect(result.current.data?.id).toBe('conv-1');
  });

  it('should handle error state', async () => {
    mockGetConversation.mockRejectedValue(new Error('Not found'));

    const { result } = renderHook(() => useConversationQuery('invalid-id'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe('useInfiniteConversationsQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch first page', async () => {
    mockGetConversations.mockResolvedValue(mockPaginatedResponse);

    const { result } = renderHook(() => useInfiniteConversationsQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.pages).toHaveLength(1);
    expect(result.current.data?.pages[0].conversations).toHaveLength(3);
  });

  it('should determine hasNextPage from pagination', async () => {
    mockGetConversations.mockResolvedValue({
      ...mockPaginatedResponse,
      pagination: { ...mockPaginatedResponse.pagination, hasMore: true },
    });

    const { result } = renderHook(() => useInfiniteConversationsQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.hasNextPage).toBe(true);
  });

  it('should not have next page when hasMore is false', async () => {
    mockGetConversations.mockResolvedValue({
      ...mockPaginatedResponse,
      pagination: { ...mockPaginatedResponse.pagination, hasMore: false },
    });

    const { result } = renderHook(() => useInfiniteConversationsQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.hasNextPage).toBe(false);
  });

  /**
   * Le QueryClient global tourne en `refetchOnWindowFocus: 'always'`. Sur une
   * `useInfiniteQuery`, ce réglage rejoue TOUTES les pages chargées et REMPLACE
   * le cache : dix pages de scroll = dix requêtes sur une route lourde à chaque
   * retour d'onglet, les écritures socket concurrentes écrasées, et — la route
   * paginant par OFFSET sur un tri `lastMessageAt` décroissant — une ligne
   * dupliquée à la frontière dès qu'un message arrive entre deux pages.
   * Le focus est servi à la place par le delta borné de
   * `useConversationsDeltaSync`.
   */
  it('ne relit PAS ses pages au retour de focus, malgré le défaut global', async () => {
    mockGetConversations.mockResolvedValue({
      ...mockPaginatedResponse,
      pagination: { limit: 20, offset: 0, total: 40, hasMore: true },
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: 'always' },
      },
    });
    const wrapper = function Wrapper({ children }: { children: React.ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };

    const { result } = renderHook(() => useInfiniteConversationsQuery({ limit: 20 }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    mockGetConversations.mockClear();
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    expect(mockGetConversations).not.toHaveBeenCalled();
    focusManager.setFocused(undefined as unknown as boolean);
  });

  /**
   * Jumelle EXACTE du témoin ci-dessus, sur l'autre déclencheur global.
   *
   * La dérogation `refetchOnWindowFocus: false` a été posée seule : le
   * QueryClient global tourne AUSSI en `refetchOnReconnect: 'always'`, et ce
   * réglage rejoue les mêmes pages, au même prix, sur un déclencheur bien plus
   * ordinaire qu'un retour d'onglet — toute transition réseau du NAVIGATEUR
   * (sortie de tunnel, bascule Wi-Fi/4G, réveil de la machine).
   *
   * Le rattrapage après coupure est servi par le delta borné de
   * `useConversationsDeltaSync` (Trigger 1, front `false → true` de
   * `isSocketConnected`), qui couvre STRICTEMENT plus : un redémarrage gateway
   * ou un échec d'upgrade de transport tue la socket sans bouger
   * `navigator.onLine`, donc sans jamais déclencher ce refetch.
   *
   * Le témoin passe par les VRAIS événements `window` — c'est `onlineManager`
   * de React Query qui les écoute — parce que c'est la forme sous laquelle la
   * panne atteint un porteur.
   */
  it('ne relit PAS ses pages au retour de connexion réseau, malgré le défaut global', async () => {
    mockGetConversations.mockResolvedValue({
      ...mockPaginatedResponse,
      pagination: { limit: 20, offset: 0, total: 40, hasMore: true },
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity, refetchOnReconnect: 'always' },
      },
    });
    const wrapper = function Wrapper({ children }: { children: React.ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };

    const { result } = renderHook(() => useInfiniteConversationsQuery({ limit: 20 }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    mockGetConversations.mockClear();
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
    });

    expect(mockGetConversations).not.toHaveBeenCalled();
  });

  it('should fetch next page with correct offset', async () => {
    // First page
    mockGetConversations.mockResolvedValueOnce({
      ...mockPaginatedResponse,
      pagination: { limit: 20, offset: 0, total: 40, hasMore: true },
    });

    // Second page
    mockGetConversations.mockResolvedValueOnce({
      conversations: [{ ...mockConversation, id: 'conv-4' }],
      pagination: { limit: 20, offset: 20, total: 40, hasMore: false },
    });

    const { result } = renderHook(() => useInfiniteConversationsQuery({ limit: 20 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.hasNextPage).toBe(true);
    });

    // Fetch next page
    await act(async () => {
      result.current.fetchNextPage();
    });

    await waitFor(() => {
      expect(mockGetConversations).toHaveBeenCalledTimes(2);
    });

    // Second call should have offset 20
    expect(mockGetConversations).toHaveBeenLastCalledWith(
      expect.objectContaining({
        offset: 20,
      })
    );
  });

  it('should respect enabled option', () => {
    mockGetConversations.mockResolvedValue(mockPaginatedResponse);

    const { result } = renderHook(
      () => useInfiniteConversationsQuery({ enabled: false }),
      { wrapper: createWrapper() }
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetConversations).not.toHaveBeenCalled();
  });
});

