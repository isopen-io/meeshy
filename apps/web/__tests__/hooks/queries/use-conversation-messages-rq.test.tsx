/**
 * Tests for useConversationMessagesRQ hook
 *
 * Tests cover:
 * - Query loading, success, error states
 * - Message loading with pagination
 * - Cache manipulation (add, update, remove messages)
 * - Anonymous user support via linkId
 * - Infinite scroll behavior
 * - Auto-fill behavior
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider, IsRestoringProvider, focusManager } from '@tanstack/react-query';
import React from 'react';
import { useConversationMessagesRQ } from '@/hooks/queries/use-conversation-messages-rq';
import type { Message, User } from '@meeshy/shared/types';

// Mock the conversations service
const mockGetMessages = jest.fn();

jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getMessages: (...args: unknown[]) => mockGetMessages(...args),
  },
}));

// Mock the anonymous chat service
const mockLoadMessages = jest.fn();

jest.mock('@/services/anonymous-chat.service', () => ({
  AnonymousChatService: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    loadMessages: (...args: unknown[]) => mockLoadMessages(...args),
  })),
}));

// Mock query keys
jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    messages: {
      all: ['messages'],
      lists: () => ['messages', 'list'],
      list: (conversationId: string) => ['messages', 'list', conversationId],
      infinite: (conversationId: string) => ['messages', 'list', conversationId, 'infinite'],
    },
  },
}));

// Test data
const createMockMessage = (id: string, content: string, createdAt = new Date('2024-01-01')): Message => ({
  id,
  content,
  conversationId: 'conv-1',
  senderId: 'user-1',
  originalLanguage: 'en',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  createdAt,
  updatedAt: createdAt,
  sender: {
    id: 'user-1',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    displayName: 'Test User',
    email: 'test@example.com',
    phoneNumber: '',
    role: 'USER',
    permissions: {
      canAccessAdmin: false,
      canManageUsers: false,
      canManageGroups: false,
      canManageConversations: false,
      canViewAnalytics: false,
      canModerateContent: false,
      canViewAuditLogs: false,
      canManageNotifications: false,
      canManageTranslations: false,
    },
    systemLanguage: 'en',
    regionalLanguage: 'en',
    autoTranslateEnabled: false,
    translateToSystemLanguage: false,
    translateToRegionalLanguage: false,
    useCustomDestination: false,
    isOnline: true,
    createdAt: new Date(),
    lastActiveAt: new Date(),
    isActive: true,
    updatedAt: new Date(),
  } as any,
  translations: [],
} as any);

const mockUser: User = {
  id: 'user-1',
  username: 'testuser',
  firstName: 'Test',
  lastName: 'User',
  displayName: 'Test User',
  email: 'test@example.com',
  phoneNumber: '',
  role: 'USER',
  permissions: {
    canAccessAdmin: false,
    canManageUsers: false,
    canManageGroups: false,
    canManageConversations: false,
    canViewAnalytics: false,
    canModerateContent: false,
    canViewAuditLogs: false,
    canManageNotifications: false,
    canManageTranslations: false,
  },
  systemLanguage: 'en',
  regionalLanguage: 'en',
  autoTranslateEnabled: false,
  isOnline: true,
  createdAt: new Date(),
  lastActiveAt: new Date(),
  isActive: true,
  updatedAt: new Date(),
};

const mockMessages = [
  createMockMessage('msg-1', 'Hello', new Date('2024-01-03')),
  createMockMessage('msg-2', 'World', new Date('2024-01-02')),
  createMockMessage('msg-3', 'Test', new Date('2024-01-01')),
];

const mockMessagesResponse = {
  messages: mockMessages,
  hasMore: false,
  total: 3,
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

// Helper to get access to QueryClient in tests
function createWrapperWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });

  const wrapper = function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };

  return { wrapper, queryClient };
}

describe('useConversationMessagesRQ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should return loading state initially', () => {
      mockGetMessages.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      expect(result.current.isLoading).toBe(true);
      expect(result.current.messages).toEqual([]);
    });

    it('should not fetch when conversationId is null', () => {
      const { result } = renderHook(
        () => useConversationMessagesRQ(null, mockUser),
        { wrapper: createWrapper() }
      );

      expect(result.current.isLoading).toBe(false);
      expect(mockGetMessages).not.toHaveBeenCalled();
    });

    it('should not fetch when enabled is false', () => {
      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser, { enabled: false }),
        { wrapper: createWrapper() }
      );

      expect(mockGetMessages).not.toHaveBeenCalled();
    });
  });

  describe('Data Fetching', () => {
    it('should fetch messages for authenticated users', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetMessages).toHaveBeenCalledWith('conv-1', 1, 20, null, expect.anything());
      expect(result.current.messages).toHaveLength(3);
    });

    it('should fetch messages for anonymous users via linkId', async () => {
      mockLoadMessages.mockResolvedValue({
        messages: mockMessages,
        hasMore: false,
        total: 3,
      });

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', null, { linkId: 'link-123' }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockLoadMessages).toHaveBeenCalled();
    });

    it('should sort messages by createdAt DESC', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Messages should be sorted newest first
      expect(result.current.messages[0].id).toBe('msg-1');
      expect(result.current.messages[2].id).toBe('msg-3');
    });
  });

  describe('Pagination', () => {
    it('should determine hasMore from response', async () => {
      mockGetMessages.mockResolvedValue({
        ...mockMessagesResponse,
        hasMore: true,
      });

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMore).toBe(true);
    });

    it('should load more messages when loadMore is called', async () => {
      // First page
      mockGetMessages.mockResolvedValueOnce({
        messages: mockMessages,
        hasMore: true,
        total: 6,
      });

      // Second page
      mockGetMessages.mockResolvedValueOnce({
        messages: [createMockMessage('msg-4', 'Page 2')],
        hasMore: false,
        total: 6,
      });

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Load more
      await act(async () => {
        await result.current.loadMore();
      });

      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThan(3);
      });
    });

    it('should use custom limit', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser, { limit: 50 }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalledWith('conv-1', 1, 50, null, expect.anything());
      });
    });

    it('anonymous loadMore advances the offset (does not refetch page 1)', async () => {
      // Anonymous path paginates by offset and never returns a cursor. loadMore
      // must request the next page (offset = limit), not re-request offset 0 —
      // otherwise older history is unreachable and page 1 duplicates.
      mockLoadMessages.mockResolvedValueOnce({
        messages: [
          createMockMessage('a-1', 'p1-a', new Date('2024-01-03')),
          createMockMessage('a-2', 'p1-b', new Date('2024-01-02')),
        ],
        hasMore: true,
        total: 3,
      });
      mockLoadMessages.mockResolvedValueOnce({
        messages: [createMockMessage('a-3', 'p2-a', new Date('2024-01-01'))],
        hasMore: false,
        total: 3,
      });

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', null, { linkId: 'link-123', limit: 20 }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      // First page requested at offset 0.
      expect(mockLoadMessages).toHaveBeenNthCalledWith(1, 20, 0);

      await act(async () => {
        await result.current.loadMore();
      });

      await waitFor(() => {
        expect(mockLoadMessages).toHaveBeenCalledTimes(2);
      });
      // Second page must advance to offset = limit (page 2), not offset 0.
      expect(mockLoadMessages).toHaveBeenNthCalledWith(2, 20, 20);
      // All three distinct messages are present with no duplicates.
      const ids = result.current.messages.map((m) => m.id).sort();
      expect(ids).toEqual(['a-1', 'a-2', 'a-3']);
    });
  });

  describe('Cache Manipulation', () => {
    it('should add message to cache', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const newMessage = createMockMessage('msg-new', 'New message', new Date('2024-01-04'));

      act(() => {
        const wasAdded = result.current.addMessage(newMessage);
        expect(wasAdded).toBe(true);
      });

      await waitFor(() => {
        expect(result.current.messages.find((m) => m.id === 'msg-new')).toBeDefined();
      });
    });

    it('should not add duplicate message', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Try to add existing message
      act(() => {
        const wasAdded = result.current.addMessage(mockMessages[0]);
        expect(wasAdded).toBe(false);
      });
    });

    it('should update message in cache', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.updateMessage('msg-1', { content: 'Updated content' });
      });

      await waitFor(() => {
        const updatedMessage = result.current.messages.find((m) => m.id === 'msg-1');
        expect(updatedMessage?.content).toBe('Updated content');
      });
    });

    it('should update message using function updater', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.updateMessage('msg-1', (prev) => ({
          ...prev,
          content: `${prev.content} (edited)`,
          isEdited: true,
        }));
      });

      await waitFor(() => {
        const updatedMessage = result.current.messages.find((m) => m.id === 'msg-1');
        expect(updatedMessage?.content).toBe('Hello (edited)');
        expect(updatedMessage?.isEdited).toBe(true);
      });
    });

    it('should remove message from cache', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.removeMessage('msg-1');
      });

      await waitFor(() => {
        expect(result.current.messages.find((m) => m.id === 'msg-1')).toBeUndefined();
        expect(result.current.messages).toHaveLength(2);
      });
    });

    it('should clear messages from cache', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { wrapper, queryClient } = createWrapperWithClient();

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.clearMessages();
      });

      // Cache should be cleared
      const cachedData = queryClient.getQueryData(['messages', 'list', 'conv-1', 'infinite']);
      expect(cachedData).toBeUndefined();
    });
  });

  describe('Refresh', () => {
    it('should refetch messages on refresh', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockGetMessages.mockClear();

      await act(async () => {
        await result.current.refresh();
      });

      expect(mockGetMessages).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should return error message on failure', async () => {
      mockGetMessages.mockRejectedValue(new Error('Failed to fetch'));

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to fetch');
      });
    });
  });

  describe('Catch-up sync (non-destructive revalidation)', () => {
    const messagesKey = ['messages', 'list', 'conv-1', 'infinite'];

    function createPersistedWrapper() {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: Infinity,
            gcTime: Infinity,
            refetchOnMount: false,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
          },
        },
      });

      const wrapper = function Wrapper({ children }: { children: React.ReactNode }) {
        return (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        );
      };

      return { wrapper, queryClient };
    }

    function seedCache(queryClient: QueryClient, messages: Message[]) {
      queryClient.setQueryData(messagesKey, {
        pages: [{ messages, hasMore: false, total: messages.length }],
        pageParams: [1],
      });
    }

    afterEach(() => {
      focusManager.setFocused(undefined as unknown as boolean);
      jest.useRealTimers();
    });

    // Le rattrapage a TROIS déclencheurs : focus, reconnexion socket, et le
    // CHANGEMENT de conversation à hôte monté (2026-08-25). Ce dernier a été
    // ajouté parce que la phrase qui vivait ici — « ouvrir une conversation
    // passe par le refetch toujours-actif » — était fausse : `refetchOnMount`
    // n'est lu qu'à la souscription, et l'hôte ne se démonte jamais entre deux
    // conversations.
    async function triggerFocusCatchUp() {
      jest.useFakeTimers();
      act(() => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      await act(async () => {
        jest.advanceTimersByTime(1100);
      });
      jest.useRealTimers();
    }

    // LE GESTE RAPPORTÉ PAR L'UTILISATEUR : « j'ouvre la conversation, même
    // après 1h, et il manque des messages récents — alors que la LISTE a bien
    // le dernier ».
    //
    // `ConversationLayout` ne se démonte JAMAIS entre deux conversations
    // (route catch-all + sélection par état local avec `replaceState`).
    // Changer de conversation n'est donc qu'un changement de `queryKey` :
    // `refetchOnMount` n'est lu qu'à la SOUSCRIPTION, et un changement de clé
    // passe par `shouldFetchOptionally` → `isStale` → `isStaleByTime(Infinity)`
    // = FAUX. Sur un cache encore chaud, RIEN n'était relu.
    it('changer de conversation à hôte MONTÉ déclenche le rattrapage — c’est le geste qui manquait', async () => {
      const cacheChaudB = [
        createMockMessage('b-vieux', 'déjà vu', new Date('2024-01-03T00:00:00.000Z')),
      ];
      const manqueB = createMockMessage('b-neuf', 'arrivé pendant mon absence', new Date('2024-01-05T00:00:00.000Z'));

      const { wrapper, queryClient } = createPersistedWrapper();
      // Le cache de B est CHAUD — on y est déjà passé dans cette session.
      queryClient.setQueryData(['messages', 'list', 'conv-B', 'infinite'], {
        pages: [{ messages: cacheChaudB, hasMore: false, total: 1 }],
        pageParams: [1],
      });

      mockGetMessages.mockResolvedValue({ messages: [manqueB], hasMore: false, total: 1 });

      const { rerender } = renderHook(
        ({ id }: { id: string }) => useConversationMessagesRQ(id, mockUser),
        { wrapper, initialProps: { id: 'conv-A' } }
      );

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalled();
      });
      mockGetMessages.mockClear();

      // L'utilisateur bascule sur B. Aucune souscription neuve : seule la clé change.
      rerender({ id: 'conv-B' });

      // Un rattrapage DOIT partir pour B, avec un watermark — sinon le fil
      // reste sur son cache périmé et `b-neuf` n'apparaît jamais.
      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalled();
      });
      const appelsB = mockGetMessages.mock.calls.filter(([id]) => id === 'conv-B');
      expect(appelsB.length).toBeGreaterThan(0);
      // Le 6e argument est le watermark `after` : c'est ce qui distingue un
      // rattrapage incrémental d'une relecture destructrice.
      expect(appelsB.some((call) => typeof call[5] === 'string' && call[5].length > 0)).toBe(true);
    });

    it('fetches only messages newer than the cached watermark on focus and merges them without replacing pages', async () => {
      const cachedOld = [
        createMockMessage('old-1', 'newest cached', new Date('2024-01-03T00:00:00.000Z')),
        createMockMessage('old-2', 'older cached', new Date('2024-01-02T00:00:00.000Z')),
      ];
      const newer = createMockMessage('new-1', 'missed while away', new Date('2024-01-05T00:00:00.000Z'));
      const duplicate = createMockMessage('old-1', 'newest cached', new Date('2024-01-03T00:00:00.000Z'));

      const { wrapper, queryClient } = createPersistedWrapper();
      seedCache(queryClient, cachedOld);

      // Mount refetch answers with the cached page (server has not seen the
      // newer message yet), then the focus catch-up brings it in.
      mockGetMessages.mockResolvedValueOnce({ messages: cachedOld, hasMore: false, total: 2 });
      mockGetMessages.mockResolvedValue({ messages: [duplicate, newer], hasMore: false, total: 2 });

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalledTimes(1);
      });

      await triggerFocusCatchUp();

      expect(mockGetMessages).toHaveBeenLastCalledWith(
        'conv-1',
        1,
        50,
        null,
        undefined,
        new Date('2024-01-02T23:59:59.999Z').toISOString()
      );

      await waitFor(() => {
        expect(result.current.messages.map((m) => m.id)).toEqual(['new-1', 'old-1', 'old-2']);
      });
    });

    // `after` is a STRICT `createdAt >` filter server-side. Two messages can
    // share a millisecond; if the client cached one of them and asked for
    // `> that instant`, its twin would never be returned by any catch-up and
    // stayed lost until a cold reload. Asking from one millisecond earlier makes
    // the window inclusive — the id-based dedup below already absorbs the
    // boundary message coming back.
    it('asks from one millisecond before the watermark so same-millisecond twins are not lost', async () => {
      const cached = [createMockMessage('old-1', 'newest cached', new Date('2024-01-03T00:00:00.000Z'))];
      const twin = createMockMessage('twin-1', 'same millisecond, missed', new Date('2024-01-03T00:00:00.000Z'));

      const { wrapper, queryClient } = createPersistedWrapper();
      seedCache(queryClient, cached);

      mockGetMessages.mockResolvedValueOnce({ messages: cached, hasMore: false, total: 1 });
      mockGetMessages.mockResolvedValue({ messages: [cached[0], twin], hasMore: false, total: 2 });

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalledTimes(1);
      });

      await triggerFocusCatchUp();

      expect(mockGetMessages).toHaveBeenLastCalledWith(
        'conv-1',
        1,
        50,
        null,
        undefined,
        new Date('2024-01-02T23:59:59.999Z').toISOString()
      );

      await waitFor(() => {
        expect(result.current.messages.map((m) => m.id)).toEqual(['twin-1', 'old-1']);
      });
    });

    it('does not run catch-up when there is no cache entry (initial fetch handles cold opens)', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { wrapper } = createPersistedWrapper();

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetMessages).toHaveBeenCalledTimes(1);
      expect(mockGetMessages).toHaveBeenCalledWith('conv-1', 1, 20, null, expect.anything());
      expect(mockGetMessages.mock.calls.every((call) => call[5] === undefined)).toBe(true);
    });

    // The always-on mount refetch must not race the async IndexedDB restore:
    // nothing may hit the network while `useIsRestoring()` is true, otherwise a
    // reload fires a read before the persisted pages are back in the cache.
    it('waits for the persisted cache restore before reading from the server', async () => {
      const cached = [createMockMessage('old-1', 'cached', new Date('2024-01-01T00:00:00.000Z'))];
      mockGetMessages.mockResolvedValue({ messages: [], hasMore: false, total: 0 });

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: Infinity,
            gcTime: Infinity,
            refetchOnMount: false,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
          },
        },
      });
      seedCache(queryClient, cached);

      let restoring = true;
      const wrapper = function Wrapper({ children }: { children: React.ReactNode }) {
        return (
          <QueryClientProvider client={queryClient}>
            <IsRestoringProvider value={restoring}>{children}</IsRestoringProvider>
          </QueryClientProvider>
        );
      };

      const { rerender } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper }
      );

      await act(async () => {});
      expect(mockGetMessages).not.toHaveBeenCalled();

      restoring = false;
      rerender();

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalledTimes(1);
      });
      expect(mockGetMessages.mock.calls[0][5]).toBeUndefined();
    });

    it('keeps fetching with an advancing watermark while the server reports more missed messages', async () => {
      const cached = [createMockMessage('old-1', 'cached', new Date('2024-01-01T00:00:00.000Z'))];
      const batch1 = [createMockMessage('new-1', 'batch 1', new Date('2024-01-02T00:00:00.000Z'))];
      const batch2 = [createMockMessage('new-2', 'batch 2', new Date('2024-01-03T00:00:00.000Z'))];
      const batch3 = [createMockMessage('new-3', 'batch 3', new Date('2024-01-04T00:00:00.000Z'))];
      mockGetMessages
        .mockResolvedValueOnce({ messages: cached, hasMore: false, total: 1 })
        .mockResolvedValueOnce({ messages: batch1, hasMore: true, total: 3 })
        .mockResolvedValueOnce({ messages: batch2, hasMore: true, total: 3 })
        .mockResolvedValueOnce({ messages: batch3, hasMore: false, total: 3 });

      const { wrapper, queryClient } = createPersistedWrapper();
      seedCache(queryClient, cached);

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalledTimes(1);
      });

      await triggerFocusCatchUp();

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalledTimes(4);
      });

      expect(mockGetMessages).toHaveBeenNthCalledWith(
        2, 'conv-1', 1, 50, null, undefined, new Date('2023-12-31T23:59:59.999Z').toISOString()
      );
      expect(mockGetMessages).toHaveBeenNthCalledWith(
        3, 'conv-1', 1, 50, null, undefined, new Date('2024-01-01T23:59:59.999Z').toISOString()
      );
      expect(mockGetMessages).toHaveBeenNthCalledWith(
        4, 'conv-1', 1, 50, null, undefined, new Date('2024-01-02T23:59:59.999Z').toISOString()
      );

      await waitFor(() => {
        expect(result.current.messages.map((m) => m.id)).toEqual(['new-3', 'new-2', 'new-1', 'old-1']);
      });
    });

    it('falls back to a full refetch when the gap exceeds the catch-up iteration cap', async () => {
      const cached = [createMockMessage('old-1', 'cached', new Date('2024-01-01T00:00:00.000Z'))];
      const batchFor = (i: number) => ({
        messages: [createMockMessage(`new-${i}`, `batch ${i}`, new Date(`2024-01-0${i + 1}T00:00:00.000Z`))],
        hasMore: true,
        total: 100,
      });
      mockGetMessages
        .mockResolvedValueOnce({ messages: cached, hasMore: false, total: 1 })
        .mockResolvedValueOnce(batchFor(1))
        .mockResolvedValueOnce(batchFor(2))
        .mockResolvedValueOnce(batchFor(3))
        .mockResolvedValueOnce(batchFor(4))
        .mockResolvedValueOnce(batchFor(5))
        .mockResolvedValue({ messages: [], hasMore: false, total: 0 });

      const { wrapper, queryClient } = createPersistedWrapper();
      seedCache(queryClient, cached);

      renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalledTimes(1);
      });

      await triggerFocusCatchUp();

      await waitFor(() => {
        expect(mockGetMessages.mock.calls.length).toBeGreaterThanOrEqual(7);
      });

      // Calls 2..6 are the five watermark iterations; call 7 is the full
      // refetch fallback (no `after` argument).
      const capFallbackCall = mockGetMessages.mock.calls[6];
      expect(capFallbackCall[5]).toBeUndefined();
    });

    it('runs a single debounced catch-up when the window regains focus', async () => {
      const cached = [createMockMessage('old-1', 'cached', new Date('2024-01-01T00:00:00.000Z'))];
      mockGetMessages.mockResolvedValue({ messages: [], hasMore: false, total: 0 });

      const { wrapper, queryClient } = createPersistedWrapper();
      seedCache(queryClient, cached);

      renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalledTimes(1);
      });
      mockGetMessages.mockClear();

      jest.useFakeTimers();
      act(() => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });

      expect(mockGetMessages).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(1100);
      });
      jest.useRealTimers();

      // Four focus transitions coalesce into a single catch-up read.
      expect(mockGetMessages).toHaveBeenCalledTimes(1);
      expect(mockGetMessages.mock.calls[0][5]).toBe(new Date('2023-12-31T23:59:59.999Z').toISOString());
    });

    it('does not start a second catch-up while one is already in flight', async () => {
      const cached = [createMockMessage('old-1', 'cached', new Date('2024-01-01T00:00:00.000Z'))];
      let resolveCatchUp: ((value: { messages: Message[]; hasMore: boolean; total: number }) => void) | null = null;
      mockGetMessages
        .mockResolvedValueOnce({ messages: cached, hasMore: false, total: 1 })
        .mockImplementationOnce(
          () => new Promise((resolve) => { resolveCatchUp = resolve; })
        );

      const { wrapper, queryClient } = createPersistedWrapper();
      seedCache(queryClient, cached);

      renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalledTimes(1);
      });

      // First focus starts a catch-up that never settles.
      await triggerFocusCatchUp();
      expect(mockGetMessages).toHaveBeenCalledTimes(2);

      // Second focus while the first is still in flight must be a no-op.
      await triggerFocusCatchUp();
      expect(mockGetMessages).toHaveBeenCalledTimes(2);

      await act(async () => {
        resolveCatchUp?.({ messages: [], hasMore: false, total: 0 });
      });

      expect(mockGetMessages).toHaveBeenCalledTimes(2);
    });

    // An optimistic message is stamped with the CLIENT clock at compose time and
    // is not server state. Letting it set the `after` watermark makes the
    // catch-up ask for messages newer than "now on this device" and silently
    // skips everything peers sent during the disconnection — the exact window
    // the catch-up exists to cover, since composing while offline is what puts
    // an optimistic message in the cache in the first place.
    it('ignores optimistic messages when computing the catch-up watermark', async () => {
      const serverNewest = createMockMessage('old-1', 'newest server', new Date('2024-01-03T00:00:00.000Z'));
      const pending = {
        ...createMockMessage('cid_pending', 'typed while offline', new Date('2024-06-01T00:00:00.000Z')),
        _tempId: 'cid_pending',
        _localStatus: 'failed' as const,
        _sendPayload: {},
      } as unknown as Message;
      const missed = createMockMessage('new-1', 'sent by a peer during the gap', new Date('2024-01-04T00:00:00.000Z'));

      const { wrapper, queryClient } = createPersistedWrapper();
      seedCache(queryClient, [pending, serverNewest]);

      mockGetMessages.mockResolvedValueOnce({ messages: [serverNewest], hasMore: false, total: 1 });
      mockGetMessages.mockResolvedValue({ messages: [missed], hasMore: false, total: 1 });

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalledTimes(1);
      });

      await triggerFocusCatchUp();

      expect(mockGetMessages).toHaveBeenLastCalledWith(
        'conv-1',
        1,
        50,
        null,
        undefined,
        new Date('2024-01-02T23:59:59.999Z').toISOString()
      );

      await waitFor(() => {
        expect(result.current.messages.map((m) => m.id)).toContain('new-1');
      });
    });

    // Cache holding nothing but optimistic messages has no server watermark to
    // read forward from. Returning early would leave the conversation frozen on
    // its local-only content, so fall back to the full (non-destructive) read.
    it('falls back to a full refetch when the cache holds only optimistic messages', async () => {
      const pending = {
        ...createMockMessage('cid_only', 'first message, sent offline', new Date('2024-06-01T00:00:00.000Z')),
        _tempId: 'cid_only',
        _localStatus: 'sending' as const,
        _sendPayload: {},
      } as unknown as Message;
      const serverMessage = createMockMessage('srv-1', 'peer message', new Date('2024-01-04T00:00:00.000Z'));

      const { wrapper, queryClient } = createPersistedWrapper();
      seedCache(queryClient, [pending]);

      // The mount read finds nothing yet, so the cache stays optimistic-only;
      // the peer message only lands on the catch-up read.
      mockGetMessages.mockResolvedValueOnce({ messages: [], hasMore: false, total: 0 });
      mockGetMessages.mockResolvedValue({ messages: [serverMessage], hasMore: false, total: 1 });

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalledTimes(1);
      });

      await triggerFocusCatchUp();

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalledTimes(2);
      });
      // A full page read, never a watermark read anchored on the client clock.
      expect(mockGetMessages.mock.calls.every((call) => call[5] === undefined)).toBe(true);
      await waitFor(() => {
        expect(result.current.messages.map((m) => m.id)).toContain('srv-1');
      });
    });

    // The send ACK is exactly what a disconnection drops. Without reconciling on
    // `clientMessageId`, the catch-up prepends the server copy next to the
    // still-pending optimistic one and the sender sees their own message twice.
    it('replaces the optimistic message its server copy confirms instead of duplicating it', async () => {
      const serverNewest = createMockMessage('old-1', 'newest server', new Date('2024-01-03T00:00:00.000Z'));
      const pending = {
        ...createMockMessage('cid_acked', 'sent, ACK lost', new Date('2024-01-03T12:00:00.000Z')),
        _tempId: 'cid_acked',
        _localStatus: 'sending' as const,
        _sendPayload: {},
      } as unknown as Message;
      const confirmed = {
        ...createMockMessage('srv-acked', 'sent, ACK lost', new Date('2024-01-03T12:00:01.000Z')),
        clientMessageId: 'cid_acked',
      } as unknown as Message;

      const { wrapper, queryClient } = createPersistedWrapper();
      seedCache(queryClient, [pending, serverNewest]);

      mockGetMessages.mockResolvedValueOnce({ messages: [serverNewest], hasMore: false, total: 1 });
      mockGetMessages.mockResolvedValue({ messages: [confirmed], hasMore: false, total: 1 });

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalledTimes(1);
      });

      await triggerFocusCatchUp();

      await waitFor(() => {
        expect(result.current.messages.map((m) => m.id)).toEqual(['srv-acked', 'old-1']);
      });
    });
  });

  // Opening a conversation MUST re-read the latest page from the server, even
  // when a cache entry already exists. The production QueryClient runs with
  // `staleTime: Infinity` + `refetchOnMount: false`, so without an explicit
  // per-query opt-in a restored (IndexedDB-persisted) page was displayed
  // forever and any message missing from it never appeared — no matter how many
  // times the user reloaded.
  describe('Open conversation → always revalidate', () => {
    function createStaleForeverWrapper() {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            gcTime: 30 * 60 * 1000,
            staleTime: Infinity,
            refetchOnMount: false,
          },
        },
      });

      const wrapper = function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
      };

      return { wrapper, queryClient };
    }

    it('keeps socket-delivered and optimistic messages the server read cannot see yet', async () => {
      const { wrapper, queryClient } = createStaleForeverWrapper();

      const socketDelivered = createMockMessage('msg-socket', 'just arrived', new Date('2024-01-09'));
      const optimistic = {
        ...createMockMessage('cid_pending', 'sending…', new Date('2024-01-08')),
        _tempId: 'cid_pending',
        _localStatus: 'sending',
      } as unknown as Message;

      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{
          messages: [socketDelivered, optimistic, mockMessages[0], mockMessages[1]],
          hasMore: false,
          total: 4,
        }],
        pageParams: [1],
      });

      // Replica lag: the server page still lacks the two newest local rows.
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalled();
      });

      await waitFor(() => {
        const ids = result.current.messages.map((m) => m.id);
        expect(ids).toContain('msg-socket');
        expect(ids).toContain('cid_pending');
        expect(ids).toContain('msg-1');
      });
    });

    it('drops a local row once the server page carries its confirmed twin', async () => {
      const { wrapper, queryClient } = createStaleForeverWrapper();

      const optimistic = {
        ...createMockMessage('cid_confirmed', 'sent', new Date('2024-01-09')),
        _tempId: 'cid_confirmed',
        _localStatus: 'sending',
      } as unknown as Message;

      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: [optimistic], hasMore: false, total: 1 }],
        pageParams: [1],
      });

      const confirmed = {
        ...createMockMessage('msg-server', 'sent', new Date('2024-01-09')),
        clientMessageId: 'cid_confirmed',
      } as unknown as Message;
      mockGetMessages.mockResolvedValue({ messages: [confirmed], hasMore: false, total: 1 });

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.messages.map((m) => m.id)).toEqual(['msg-server']);
      });
    });

    it('refetches the first page on mount even when the cache is already populated', async () => {
      const { wrapper, queryClient } = createStaleForeverWrapper();

      queryClient.setQueryData(['messages', 'list', 'conv-1', 'infinite'], {
        pages: [{ messages: [mockMessages[1], mockMessages[2]], hasMore: false, total: 2 }],
        pageParams: [1],
      });

      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalledWith('conv-1', 1, 20, null, expect.anything());
      });

      await waitFor(() => {
        expect(result.current.messages.map((m) => m.id)).toContain('msg-1');
      });
    });
  });

  describe('Conversation Change', () => {
    it('should fetch new messages when conversationId changes', async () => {
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      const { result, rerender } = renderHook(
        ({ conversationId }) => useConversationMessagesRQ(conversationId, mockUser),
        {
          wrapper: createWrapper(),
          initialProps: { conversationId: 'conv-1' },
        }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetMessages).toHaveBeenCalledWith('conv-1', 1, 20, null, expect.anything());

      mockGetMessages.mockClear();

      // Change conversation
      rerender({ conversationId: 'conv-2' });

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalledWith('conv-2', 1, 20, null, expect.anything());
      });
    });
  });
  /**
   * DÉFAUT A, moitié 2 — `addMessage` sortait sur `if (!old) return old;`.
   *
   * Un cache ABSENT n'est pas un cache À JOUR : le message reçu par socket
   * pendant la lecture initiale était jeté pour toute la session (la couche
   * socket marque son id « vu » 5 min, `staleTime: Infinity` ne relit jamais).
   * Les trois témoins ci-dessous tiennent les trois moitiés de la réponse :
   * le message survit, la page semée ne prétend PAS être complète, et une
   * lecture repart quand aucune n'est en vol.
   */
  // Ces deux témoins montent la clé sur un ObjectId RÉSOLU (24 hex), et non sur
  // « conv-1 ». Ce n'est pas un détail de fixture : la graine n'accepte qu'une
  // attribution VÉRIFIABLE — `meeshySocketIOService.onNewMessage` est un
  // abonnement GLOBAL, il délivre les messages de toutes les conversations
  // rejointes, et semer sans comparer afficherait celui d'une AUTRE. Un écran
  // clé-é sur un SLUG ne peut rien attribuer sur un cache vide ; il est couvert
  // à part, par `bubble-stream-page.realtime-cache-gap.test.tsx`.
  const CONV_RESOLUE = '65a1b2c3d4e5f60718293a4b';

  describe('Message socket reçu alors que le cache est encore VIDE', () => {
    it('sème la première page, et la lecture serveur qui atterrit ensuite ne l’efface pas', async () => {
      let resolveRead: ((value: unknown) => void) | null = null;
      mockGetMessages.mockImplementation(
        () => new Promise((resolve) => { resolveRead = resolve; })
      );

      const { result } = renderHook(
        () => useConversationMessagesRQ(CONV_RESOLUE, mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(resolveRead).not.toBeNull();
      });

      const fromSocket = {
        ...createMockMessage('msg-socket', 'Reçu pendant le chargement', new Date('2024-01-09')),
        conversationId: CONV_RESOLUE,
      };

      act(() => {
        expect(result.current.addMessage(fromSocket)).toBe(true);
      });

      await waitFor(() => {
        expect(result.current.messages.map((m) => m.id)).toContain('msg-socket');
      });

      // La lecture serveur se termine SANS ce message — le serveur ne le
      // connaît pas encore, c'est précisément pourquoi il est arrivé par socket.
      await act(async () => {
        resolveRead?.({ messages: mockMessages, hasMore: false, total: 3 });
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(result.current.messages.map((m) => m.id)).toContain('msg-socket');
      });
      expect(result.current.messages.map((m) => m.id)).toEqual(
        expect.arrayContaining(['msg-1', 'msg-2', 'msg-3'])
      );
    });

    it('ne déclare JAMAIS l’historique complet : la page semée reste paginable', async () => {
      mockGetMessages.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(
        () => useConversationMessagesRQ(CONV_RESOLUE, mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalled();
      });

      act(() => {
        result.current.addMessage({
          ...createMockMessage('msg-socket', 'Reçu pendant le chargement', new Date('2024-01-09')),
          conversationId: CONV_RESOLUE,
        });
      });

      // Le risque de l'option « semer » est de fabriquer une page que la
      // pagination croirait complète — un TROU définitif dans l'historique.
      await waitFor(() => {
        expect(result.current.hasMore).toBe(true);
      });
    });

    it('redemande l’historique au serveur quand AUCUNE lecture n’est en vol', async () => {
      mockGetMessages.mockRejectedValueOnce(new Error('réseau coupé'));

      const { result } = renderHook(
        () => useConversationMessagesRQ('conv-1', mockUser),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      const readsBefore = mockGetMessages.mock.calls.length;
      mockGetMessages.mockResolvedValue(mockMessagesResponse);

      act(() => {
        result.current.addMessage(
          createMockMessage('msg-socket', 'Reçu hors lecture', new Date('2024-01-09'))
        );
      });

      await waitFor(() => {
        expect(mockGetMessages.mock.calls.length).toBeGreaterThan(readsBefore);
      });
    });

    // La JUMELLE du témoin ci-dessous, et elle est indispensable : celui-là ne
    // garde que la moitié NÉGATIVE (« la graine ne prend pas de rang »), qui
    // reste satisfaite si l'on refuse de semer SANS rien rattraper. Or ce qui
    // délivre la valeur sur ce chemin est `besoinDeRevalider` : sans lui, le
    // message est perdu en silence, et aucune assertion ne bouge.
    it('chemin ANONYME : le message refusé par la graine est RATTRAPÉ par une relecture', async () => {
      const pageAvec = {
        messages: [createMockMessage('msg-socket', 'Reçu pendant le chargement', new Date('2024-01-09'))],
        hasMore: false,
        total: 1,
      };
      let resolveLectureInitiale: ((value: unknown) => void) | null = null;
      let lectureInitialeEmise = false;
      mockLoadMessages.mockImplementation(() => {
        if (lectureInitialeEmise) return Promise.resolve(pageAvec);
        lectureInitialeEmise = true;
        // La lecture initiale ne connaît PAS le message : c'est précisément
        // pourquoi il est arrivé par socket.
        return new Promise((resolve) => { resolveLectureInitiale = resolve; });
      });

      const { result } = renderHook(
        () => useConversationMessagesRQ(CONV_RESOLUE, null, { linkId: 'link-123', limit: 20 }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(resolveLectureInitiale).not.toBeNull();
      });

      act(() => {
        result.current.addMessage({
          ...createMockMessage('msg-socket', 'Reçu pendant le chargement', new Date('2024-01-09')),
          conversationId: CONV_RESOLUE,
        });
      });

      // La lecture en vol retombe SANS le message. La dette de relecture doit
      // alors se solder — le serveur, lui, l'a déjà persisté avant de le
      // diffuser.
      await act(async () => {
        resolveLectureInitiale?.({ messages: [], hasMore: false, total: 0 });
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      await waitFor(() => {
        expect(result.current.messages.map((m) => m.id)).toContain('msg-socket');
      });
    });

    it('chemin ANONYME : la graine ne consomme PAS le rang de la vraie page 1 du serveur', async () => {
      // La pagination anonyme est par OFFSET (`loadMessages(limit, offset)`) et
      // `getNextPageParam` en dérive `allPages.length + 1`. Une page semée
      // localement — un seul message venu du socket — occuperait donc le rang 1,
      // et la suite partirait à l'offset `limit` : la VRAIE première page du
      // serveur ne serait jamais demandée et tout ce qu'elle portait deviendrait
      // inatteignable (en production `staleTime: Infinity` ne la redemande pas).
      const pageServeur1 = {
        messages: [
          createMockMessage('anon-p1-a', 'page 1 récente', new Date('2024-01-08')),
          createMockMessage('anon-p1-b', 'page 1 ancienne', new Date('2024-01-07')),
        ],
        hasMore: true,
        total: 40,
      };
      // Contenu DISTINCT par offset : servir la même page aux deux offsets
      // rendrait l'assertion « la page 1 est là » vraie pour la mauvaise raison.
      const pageServeur2 = {
        messages: [createMockMessage('anon-p2-a', 'page 2', new Date('2024-01-06'))],
        hasMore: false,
        total: 40,
      };

      let resolveLectureInitiale: ((value: unknown) => void) | null = null;
      let lectureInitialeEmise = false;
      mockLoadMessages.mockImplementation((_limit: number, offset: number) => {
        if (offset !== 0) return Promise.resolve(pageServeur2);
        if (lectureInitialeEmise) return Promise.resolve(pageServeur1);
        lectureInitialeEmise = true;
        return new Promise((resolve) => { resolveLectureInitiale = resolve; });
      });

      const { result } = renderHook(
        () => useConversationMessagesRQ(CONV_RESOLUE, null, { linkId: 'link-123', limit: 20 }),
        { wrapper: createWrapper() }
      );

      // La lecture initiale est EN VOL — la fenêtre exacte que la graine vise.
      await waitFor(() => {
        expect(resolveLectureInitiale).not.toBeNull();
      });
      expect(mockLoadMessages).toHaveBeenNthCalledWith(1, 20, 0);

      act(() => {
        result.current.addMessage({
          ...createMockMessage('msg-socket', 'Reçu pendant le chargement', new Date('2024-01-09')),
          conversationId: CONV_RESOLUE,
        });
      });

      // Laisser l'observateur React Query RENDRE ce que `addMessage` vient
      // d'écrire. `notifyManager` n'est pas une microtâche : sans cette
      // macrotâche, `loadMore` serait lu sur un rendu PÉRIMÉ, ne partirait
      // pas, et le témoin serait vert pour une mauvaise raison (mesuré :
      // `hasMore` reste `false` et `messages` reste vide).
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

      // L'utilisateur remonte le fil pendant que la lecture initiale traîne.
      await act(async () => {
        await result.current.loadMore();
      });

      // L'ASSERTION QUI PORTE LE TÉMOIN. La seule lecture serveur est la VRAIE
      // première page (offset 0) ; la graine n'a pris aucun rang. Avec le
      // défaut remis, on lit `[0, 20]` : la suite est partie à l'offset 20 et
      // les vingt lignes de la page 1 ne seront demandées par personne.
      const offsets = mockLoadMessages.mock.calls.map(([, offset]) => offset);
      expect(offsets).toEqual([0]);

      // CONTRÔLE (vert des deux côtés, par construction) : refuser de semer ne
      // doit pas couper la lecture anonyme — la page 1 atterrit et s'affiche.
      // Il ne remplace pas l'assertion ci-dessus, il en borne le correctif.
      await act(async () => {
        resolveLectureInitiale?.(pageServeur1);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      await waitFor(() => {
        expect(result.current.messages.map((m) => m.id)).toEqual(
          expect.arrayContaining(['anon-p1-a', 'anon-p1-b'])
        );
      });
    });
  });
});
