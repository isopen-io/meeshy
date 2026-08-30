import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useFriendRequestsV2 } from '@/hooks/v2/use-friend-requests-v2';
import type { FriendRequest } from '@/types/contacts';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

jest.mock('@/hooks/use-websocket', () => ({
  useWebSocket: () => ({ isConnected: true }),
}));

let friendRequestCancelledHandler: ((data: { friendRequestId: string; cancelledBy: string }) => void) | null = null;
const mockOnFriendRequestCancelled = jest.fn((listener: (data: { friendRequestId: string; cancelledBy: string }) => void) => {
  friendRequestCancelledHandler = listener;
  return () => { friendRequestCancelledHandler = null; };
});

let friendRequestNewHandler: ((data: { friendRequestId: string; senderId: string; receiverId: string }) => void) | null = null;
const mockOnFriendRequestNew = jest.fn((listener: (data: { friendRequestId: string; senderId: string; receiverId: string }) => void) => {
  friendRequestNewHandler = listener;
  return () => { friendRequestNewHandler = null; };
});

let friendRequestAcceptedHandler: ((data: { friendRequestId: string; accepterId: string; conversationId?: string }) => void) | null = null;
const mockOnFriendRequestAccepted = jest.fn((listener: (data: { friendRequestId: string; accepterId: string; conversationId?: string }) => void) => {
  friendRequestAcceptedHandler = listener;
  return () => { friendRequestAcceptedHandler = null; };
});

let friendRequestRejectedHandler: ((data: { friendRequestId: string; rejecterId: string }) => void) | null = null;
const mockOnFriendRequestRejected = jest.fn((listener: (data: { friendRequestId: string; rejecterId: string }) => void) => {
  friendRequestRejectedHandler = listener;
  return () => { friendRequestRejectedHandler = null; };
});

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    onFriendRequestCancelled: (...args: unknown[]) => mockOnFriendRequestCancelled(...(args as [(data: { friendRequestId: string; cancelledBy: string }) => void])),
    onFriendRequestNew: (...args: unknown[]) => mockOnFriendRequestNew(...(args as [(data: { friendRequestId: string; senderId: string; receiverId: string }) => void])),
    onFriendRequestAccepted: (...args: unknown[]) => mockOnFriendRequestAccepted(...(args as [(data: { friendRequestId: string; accepterId: string; conversationId?: string }) => void])),
    onFriendRequestRejected: (...args: unknown[]) => mockOnFriendRequestRejected(...(args as [(data: { friendRequestId: string; rejecterId: string }) => void])),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const makeFriendRequest = (overrides: Partial<FriendRequest> = {}): FriendRequest => ({
  id: 'req1',
  senderId: 'user1',
  receiverId: 'user2',
  status: 'pending',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

/**
 * Les TROIS listings visent désormais la MÊME adresse (#4254) — ils ne se
 * distinguent plus par l'URL mais par `direction` / `status`. Le double doit
 * donc aiguiller sur les paramètres, jamais sur le chemin : un `if (url === …)`
 * répondrait la même chose aux trois requêtes.
 */
const ENDPOINT = '/directory/friend-requests';
type Params = Record<string, string | undefined>;

/** Quel des trois listings cette requête demande-t-elle ? */
const listing = (params?: Params): 'received' | 'sent' | 'accepted' | 'autre' => {
  if (params?.status === 'accepted' && params?.direction === 'any') return 'accepted';
  if (params?.direction === 'received') return 'received';
  if (params?.direction === 'sent') return 'sent';
  return 'autre';
};

const page = (data: FriendRequest[], pagination: Record<string, unknown> = {}) =>
  Promise.resolve({
    data: {
      success: true,
      data,
      pagination: { limit: 100, hasMore: false, nextCursor: null, ...pagination },
    },
  });

const PAGE_VIDE = () => page([]);

describe('useFriendRequestsV2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    friendRequestCancelledHandler = null;
    friendRequestNewHandler = null;
    friendRequestAcceptedHandler = null;
    friendRequestRejectedHandler = null;
    mockGet.mockResolvedValue({
      data: { success: true, data: [], pagination: { limit: 100, hasMore: false, nextCursor: null } },
    });
  });

  it('fetches received and sent requests on mount', async () => {
    const receivedRequests = [makeFriendRequest({ id: 'r1', status: 'pending' })];
    const sentRequests = [makeFriendRequest({ id: 's1', senderId: 'me', receiverId: 'other' })];

    mockGet
      .mockResolvedValueOnce({ data: { success: true, data: receivedRequests, pagination: { total: 1 } } })
      .mockResolvedValueOnce({ data: { success: true, data: sentRequests, pagination: { total: 1 } } });

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // `status: 'pending'` reproduit le filtre que `/friend-requests/received`
    // appliquait EN DUR côté serveur ; `sent` n'en portait aucun, et c'est la
    // seule source de l'onglet « refusées ».
    expect(mockGet).toHaveBeenCalledWith(ENDPOINT, {
      direction: 'received', status: 'pending', limit: '100',
    });
    expect(mockGet).toHaveBeenCalledWith(ENDPOINT, { direction: 'sent', limit: '100' });
    expect(mockGet).not.toHaveBeenCalledWith('/friend-requests/received', expect.anything());
    expect(mockGet).not.toHaveBeenCalledWith('/users/friend-requests', expect.anything());
  });

  it('separates requests by status', async () => {
    mockGet.mockImplementation((_url: string, params?: Params) => {
      switch (listing(params)) {
        case 'received': return page([makeFriendRequest({ id: 'r1', status: 'pending' })]);
        case 'sent': return page([makeFriendRequest({ id: 'r3', status: 'rejected' })]);
        case 'accepted': return page([makeFriendRequest({ id: 'r2', status: 'accepted' })]);
        default: return PAGE_VIDE();
      }
    });

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.pending.length).toBeGreaterThanOrEqual(1);
    expect(result.current.connected.length).toBeGreaterThanOrEqual(1);
    expect(result.current.refused.length).toBeGreaterThanOrEqual(1);
  });

  it('computes stats from all requests', async () => {
    mockGet.mockImplementation((_url: string, params?: Params) => {
      switch (listing(params)) {
        case 'received': return page([makeFriendRequest({ id: 'r1', status: 'pending' })]);
        case 'sent': return page([makeFriendRequest({ id: 's2', status: 'rejected' })]);
        case 'accepted': return page([makeFriendRequest({ id: 's1', status: 'accepted' })]);
        default: return PAGE_VIDE();
      }
    });

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.stats.pending).toBe(1);
    expect(result.current.stats.connected).toBe(1);
    expect(result.current.stats.refused).toBe(1);
  });

  // Le sélecteur de transfert filtre `connected` LOCALEMENT : une seule page
  // rendrait inatteignable tout ami au-delà d'elle — le Volet C prescrit
  // « paginé jusqu'à épuisement ». Jumeau iOS : ForwardPickerViewModelTests
  // .test_search_paginatesFriendsUntilExhausted_findsFriendBeyondTheFirstPage
  //
  // Le témoin porte sur le CURSEUR, pas sur le nombre de pages : c'est le
  // critère 4 de #4254, et il est écrit pour ne pouvoir passer QUE si la
  // seconde page est demandée avec le `nextCursor` de la première. Un témoin
  // posé sur la seule première page ne verrait aucune différence entre les
  // deux modèles de pagination — c'est exactement ce que la bascule risque de
  // casser en silence.
  const CURSEUR = '2026-08-01T00:00:00.000Z';

  it('demande la SECONDE page avec le `nextCursor` de la première, jamais un `offset`', async () => {
    const premierePage = Array.from({ length: 100 }, (_, i) =>
      makeFriendRequest({ id: `acc-${i}`, status: 'accepted' }),
    );
    mockGet.mockImplementation((_url: string, params?: Params) => {
      if (listing(params) !== 'accepted') return PAGE_VIDE();
      if (params?.cursor === undefined) {
        return page(premierePage, { hasMore: true, nextCursor: CURSEUR });
      }
      // Une seconde page servie UNIQUEMENT sur le bon curseur : si le hook
      // repassait à l'offset (ou oubliait le curseur), il redemanderait la
      // première page et collecterait 200 doublons au lieu de 101 lignes.
      if (params.cursor !== CURSEUR) return PAGE_VIDE();
      return page([makeFriendRequest({ id: 'acc-100', status: 'accepted' })]);
    });

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.connected).toHaveLength(101));
    expect(mockGet).toHaveBeenCalledWith(ENDPOINT, {
      direction: 'any',
      status: 'accepted',
      limit: '100',
      cursor: CURSEUR,
    });
    // Aucun appel ne porte d'`offset` : le modèle de pagination a bien changé.
    for (const appel of mockGet.mock.calls) {
      expect((appel[1] as Params | undefined)?.offset).toBeUndefined();
    }
  });

  it("s'arrête quand le serveur annonce `hasMore` sans curseur — sinon la boucle tourne sur la même page", async () => {
    const premierePage = Array.from({ length: 100 }, (_, i) =>
      makeFriendRequest({ id: `acc-${i}`, status: 'accepted' }),
    );
    mockGet.mockImplementation((_url: string, params?: Params) =>
      listing(params) === 'accepted'
        ? page(premierePage, { hasMore: true, nextCursor: null })
        : PAGE_VIDE(),
    );

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.connected).toHaveLength(100));
    const appelsAcceptes = mockGet.mock.calls.filter(
      (appel) => listing(appel[1] as Params | undefined) === 'accepted',
    );
    expect(appelsAcceptes).toHaveLength(1);
  });

  it('sends a friend request via mutation', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [], pagination: { total: 0 } } });
    mockPost.mockResolvedValue({ data: { success: true, data: makeFriendRequest() } });

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.sendRequest('targetUserId');
    });

    // L'unique chemin d'envoi (#4162) : celui qu'appelait ce site était le plus
    // FAIBLE des deux qui coexistaient côté serveur.
    expect(mockPost).toHaveBeenCalledWith('/api/v1/directory/friend-requests', { receiverId: 'targetUserId' });
  });

  it('accepts a friend request via mutation', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [], pagination: { total: 0 } } });
    mockPatch.mockResolvedValue({ data: { success: true, data: makeFriendRequest({ status: 'accepted' }) } });

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.acceptRequest('req1');
    });

    // Un geste, un VERBE : le corps porte une ACTION, pas un statut.
    expect(mockPatch).toHaveBeenCalledWith('/api/v1/directory/friend-requests/req1', { action: 'accept' });
  });

  it('reflète connected de façon optimiste dès acceptRequest, avant toute résolution réseau', async () => {
    const received = [makeFriendRequest({ id: 'r1', senderId: 'other', receiverId: 'me', status: 'pending' })];
    mockGet.mockImplementation((_url: string, params?: Params) =>
      listing(params) === 'received' ? page(received) : PAGE_VIDE(),
    );

    let resolvePatch: (value: unknown) => void = () => {};
    mockPatch.mockImplementation(() => new Promise((resolve) => { resolvePatch = resolve; }));

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.connected).toHaveLength(0);

    act(() => {
      result.current.acceptRequest('r1');
    });

    await waitFor(() => expect(result.current.connected).toHaveLength(1));
    expect(result.current.connected[0].id).toBe('r1');

    await act(async () => {
      resolvePatch({ data: { success: true, data: makeFriendRequest({ id: 'r1', status: 'accepted' }) } });
    });
  });

  it('retire optimistiquement une relation connectée dès cancelRequest, avant toute résolution réseau', async () => {
    const accepted = [makeFriendRequest({ id: 'r1', senderId: 'other', receiverId: 'me', status: 'accepted' })];
    mockGet.mockImplementation((_url: string, params?: Params) =>
      listing(params) === 'accepted' ? page(accepted) : PAGE_VIDE(),
    );

    let resolveDelete: (value: unknown) => void = () => {};
    mockPatch.mockImplementation(() => new Promise((resolve) => { resolveDelete = resolve; }));

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.connected).toHaveLength(1));

    act(() => {
      result.current.cancelRequest('r1');
    });

    await waitFor(() => expect(result.current.connected).toHaveLength(0));

    await act(async () => {
      resolveDelete({ data: { success: true } });
    });
  });

  it('rejects a friend request via mutation', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [], pagination: { total: 0 } } });
    mockPatch.mockResolvedValue({ data: { success: true, data: makeFriendRequest({ status: 'rejected' }) } });

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.rejectRequest('req1');
    });

    expect(mockPatch).toHaveBeenCalledWith('/api/v1/directory/friend-requests/req1', { action: 'reject' });
  });

  it('cancels a friend request via mutation', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [], pagination: { total: 0 } } });
    mockPatch.mockResolvedValue({ data: { success: true, data: { id: 'req1', deleted: true } } });

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.cancelRequest('req1');
    });

    // `dismiss` remplace le `DELETE` séparé : quatre gestes, un seul verbe.
    expect(mockPatch).toHaveBeenCalledWith('/api/v1/directory/friend-requests/req1', { action: 'dismiss' });
  });

  it('invalidates and refetches when the OTHER party cancels/removes a request', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [], pagination: { total: 0 } } });

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockOnFriendRequestCancelled).toHaveBeenCalled();

    const callsBefore = mockGet.mock.calls.length;

    await act(async () => {
      friendRequestCancelledHandler?.({ friendRequestId: 'req1', cancelledBy: 'other-user' });
    });

    await waitFor(() => {
      expect(mockGet.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('invalidates and refetches when a new friend request arrives', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [], pagination: { total: 0 } } });

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockOnFriendRequestNew).toHaveBeenCalled();

    const callsBefore = mockGet.mock.calls.length;

    await act(async () => {
      friendRequestNewHandler?.({ friendRequestId: 'req1', senderId: 'other-user', receiverId: 'me' });
    });

    await waitFor(() => {
      expect(mockGet.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('invalidates and refetches when the receiver accepts a sent request', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [], pagination: { total: 0 } } });

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockOnFriendRequestAccepted).toHaveBeenCalled();

    const callsBefore = mockGet.mock.calls.length;

    await act(async () => {
      friendRequestAcceptedHandler?.({ friendRequestId: 'req1', accepterId: 'other-user', conversationId: 'conv1' });
    });

    await waitFor(() => {
      expect(mockGet.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('invalidates and refetches when the receiver rejects a sent request', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [], pagination: { total: 0 } } });

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockOnFriendRequestRejected).toHaveBeenCalled();

    const callsBefore = mockGet.mock.calls.length;

    await act(async () => {
      friendRequestRejectedHandler?.({ friendRequestId: 'req1', rejecterId: 'other-user' });
    });

    await waitFor(() => {
      expect(mockGet.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('provides getPendingRequestWithUser helper', async () => {
    const received = [makeFriendRequest({ id: 'r1', status: 'pending', senderId: 'userA', receiverId: 'me' })];
    const sent = [makeFriendRequest({ id: 's1', status: 'pending', senderId: 'me', receiverId: 'userB' })];

    mockGet
      .mockResolvedValueOnce({ data: { success: true, data: received, pagination: { total: 1 } } })
      .mockResolvedValueOnce({ data: { success: true, data: sent, pagination: { total: 1 } } });

    const { result } = renderHook(() => useFriendRequestsV2({ currentUserId: 'me' }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.getPendingRequestWithUser('userA')).toBeDefined();
    expect(result.current.getPendingRequestWithUser('userB')).toBeDefined();
    expect(result.current.getPendingRequestWithUser('unknown')).toBeUndefined();
  });

  it('inclut une relation acceptée où l’utilisateur est le receveur', async () => {
    mockGet.mockImplementation((_url: string, params?: Params) =>
      listing(params) === 'accepted'
        ? page([
            {
              id: 'r1',
              senderId: 'other',
              receiverId: 'me',
              status: 'accepted',
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-01T00:00:00Z',
              sender: { id: 'other', username: 'other' },
              receiver: { id: 'me', username: 'me' },
            } as FriendRequest,
          ])
        : PAGE_VIDE(),
    );

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.connected).toHaveLength(1));
    expect(result.current.connected[0].id).toBe('r1');
  });

  it('handles fetch errors gracefully', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useFriendRequestsV2(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });
});
