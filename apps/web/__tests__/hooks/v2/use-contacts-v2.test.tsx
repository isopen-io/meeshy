/**
 * Tests for useContactsV2 hook
 *
 * Tests cover:
 * - Contact list fetching and transformation
 * - Online/offline contact separation
 * - Search functionality (min 2 chars)
 * - WebSocket online status updates
 * - Contact refresh
 * - Error handling
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useContactsV2, type ContactV2 } from '@/hooks/v2/use-contacts-v2';
import type { User } from '@meeshy/shared/types';

// Use fake timers for debounce testing
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

// La source des contacts a CHANGÉ (#4185) : elle venait de
// `usersService.getAllUsers()` → `GET /users`, une route qui rendait
// `{ message: '… to be implemented' }` en 200 et sans authentification. La
// liste n'a donc jamais affiché personne. Les contacts sont désormais les
// amitiés ACCEPTÉES, servies par `useFriendRequestsV2` — servir l'annuaire
// entier de la plateforme comme carnet d'adresses serait de toute façon un
// défaut de confidentialité.
//
// `mockGetAllUsers` est conservé sous ce nom : il alimente maintenant la liste
// d'AMIS, ce qui laisse les ~40 assertions de ce fichier porter sur ce qu'elles
// ont toujours mesuré — transformation, tri, séparation en ligne/hors ligne,
// recherche, rafraîchissement.
const mockGetAllUsers = jest.fn();
const mockSearchUsers = jest.fn();
const mockIsUserOnline = jest.fn();
const mockGetLastSeenFormatted = jest.fn();

const IDENTITE_COURANTE = 'moi';

jest.mock('@/stores', () => ({
  useUser: () => ({ id: 'moi', username: 'moi' }),
}));

/**
 * L'état des amitiés, tenu SYNCHRONEMENT par le double.
 *
 * Reconstruire le tableau `connected` à chaque rendu lui donnerait une identité
 * neuve, donc `useMemo` recalculerait, donc le hook re-rendrait — une boucle
 * sans fin qui épuise le tas. C'est le même piège que `preferredLanguages`
 * construit en ligne chez son hôte (cf. `CLAUDE.md`, Prisme, cycle 123). D'où
 * la mémoïsation sur l'identité de l'ENTRÉE.
 */
let amisConfigures: Array<{ id: string }> = [];
let etatAmis: { chargement: boolean; erreur: string | null } = { chargement: false, erreur: null };
let derniereEntree: unknown = null;
let derniereSortie: unknown[] = [];
/** Identité STABLE pour la liste vide — un `[]` littéral relance l'effet à chaque rendu. */
const AUCUNE_RELATION: unknown[] = [];

function relationsDepuis(utilisateurs: Array<{ id: string }>) {
  if (utilisateurs === derniereEntree) return derniereSortie;
  derniereEntree = utilisateurs;
  derniereSortie = utilisateurs.map((autre) => ({
    id: `rel-${autre.id}`,
    senderId: IDENTITE_COURANTE,
    receiverId: autre.id,
    status: 'accepted',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    receiver: autre,
  }));
  return derniereSortie;
}

/** Ce que les témoins appellent pour poser la liste d'amis. */
function poserAmis(utilisateurs: Array<{ id: string }> | null, options: { chargement?: boolean; erreur?: string | null } = {}) {
  amisConfigures = utilisateurs ?? [];
  etatAmis = { chargement: options.chargement ?? false, erreur: options.erreur ?? null };
}

jest.mock('@/hooks/v2/use-friend-requests-v2', () => ({
  useFriendRequestsV2: (options: { enabled?: boolean } = {}) => ({
    // `enabled: false` doit rendre une liste VIDE : c'est le contrat que
    // `useContactsV2` relaie à sa source.
    connected: options.enabled === false ? AUCUNE_RELATION : relationsDepuis(amisConfigures),
    isLoading: etatAmis.chargement,
    error: etatAmis.erreur,
    refresh: async () => { mockGetAllUsers(); },
  }),
}));

jest.mock('@/services/users.service', () => ({
  usersService: {
    searchUsers: (...args: unknown[]) => mockSearchUsers(...args),
    isUserOnline: (...args: unknown[]) => mockIsUserOnline(...args),
    getLastSeenFormatted: (...args: unknown[]) => mockGetLastSeenFormatted(...args),
  },
}));

// Mock i18n hook (avoids pulling the stores/socketio import graph into jest)
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: 'fr',
  }),
}));

// Mock WebSocket hook
const mockWebSocketHandlers: { onUserStatus?: (event: any) => void } = {};
jest.mock('@/hooks/use-websocket', () => ({
  useWebSocket: (options: { onUserStatus?: (event: any) => void }) => {
    mockWebSocketHandlers.onUserStatus = options.onUserStatus;
    return {
      isConnected: true,
    };
  },
}));

// Mock query keys
jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    users: {
      all: ['users'],
    },
  },
}));

// Test data
const mockUsers: User[] = [
  {
    id: 'user-1',
    username: 'yukitanaka',
    firstName: 'Yuki',
    lastName: 'Tanaka',
    displayName: 'Yuki Tanaka',
    email: 'yuki@example.com',
    isOnline: true,
    lastActiveAt: new Date(),
    systemLanguage: 'ja',
  } as User,
  {
    id: 'user-2',
    username: 'carlosgarcia',
    firstName: 'Carlos',
    lastName: 'Garcia',
    displayName: 'Carlos Garcia',
    email: 'carlos@example.com',
    isOnline: false,
    lastActiveAt: new Date(Date.now() - 3600000), // 1 hour ago
    systemLanguage: 'es',
  } as User,
  {
    id: 'user-3',
    username: 'emmawilson',
    firstName: 'Emma',
    lastName: 'Wilson',
    displayName: 'Emma Wilson',
    email: 'emma@example.com',
    isOnline: true,
    lastActiveAt: new Date(),
    systemLanguage: 'en',
  } as User,
  {
    id: 'user-4',
    username: 'ahmedhassan',
    firstName: 'Ahmed',
    lastName: 'Hassan',
    displayName: 'Ahmed Hassan',
    email: 'ahmed@example.com',
    isOnline: false,
    lastActiveAt: new Date(Date.now() - 86400000), // 1 day ago
    systemLanguage: 'ar',
  } as User,
];

// Helper to create wrapper with QueryClient
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

describe('useContactsV2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWebSocketHandlers.onUserStatus = undefined;

    // Default mock implementations
    poserAmis(mockUsers);
    mockSearchUsers.mockResolvedValue({ data: [] });
    mockIsUserOnline.mockImplementation((user: User) => user.isOnline);
    mockGetLastSeenFormatted.mockImplementation((user: User) =>
      user.isOnline ? 'En ligne' : 'Il y a 1h'
    );
  });

  describe('Initial Loading', () => {
    it('should return isLoading true initially', () => {
      poserAmis([], { chargement: true });

      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.contacts).toEqual([]);
    });

    it('should fetch contacts on mount when enabled', async () => {
      const { result } = renderHook(() => useContactsV2({ enabled: true }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Le hook ne charge plus lui-même : il consomme `useFriendRequestsV2`.
      // Seul le RAFRAÎCHISSEMENT explicite passe encore par ce double.
      expect(result.current.isLoading).toBe(false);
      expect(result.current.contacts).toHaveLength(4);
    });

    it('should not fetch contacts when disabled', () => {
      const { result } = renderHook(() => useContactsV2({ enabled: false }), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.contacts).toEqual([]);
    });
  });

  describe('Contact Transformation', () => {
    it('should transform users to ContactV2 format', async () => {
      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const contact = result.current.contacts.find(c => c.id === 'user-1');
      expect(contact).toMatchObject({
        id: 'user-1',
        name: 'Yuki Tanaka',
        username: '@yukitanaka',
        languageCode: 'ja',
      });
    });

    it('should resolve languageCode via the full prism — customDestinationLanguage counts, and codes are normalized', async () => {
      poserAmis([
          { id: 'c-custom', username: 'custom', systemLanguage: '', regionalLanguage: '', customDestinationLanguage: 'de', isOnline: false, lastActiveAt: new Date() } as unknown as User,
          { id: 'c-upper', username: 'upper', systemLanguage: 'EN', isOnline: false, lastActiveAt: new Date() } as unknown as User,
          { id: 'c-region', username: 'region', systemLanguage: 'pt-BR', isOnline: false, lastActiveAt: new Date() } as unknown as User,
          { id: 'c-none', username: 'none', isOnline: false, lastActiveAt: new Date() } as unknown as User,
      ]);

      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const byId = (id: string): ContactV2 | undefined =>
        result.current.contacts.find(c => c.id === id);
      expect(byId('c-custom')?.languageCode).toBe('de');
      expect(byId('c-upper')?.languageCode).toBe('en');
      expect(byId('c-region')?.languageCode).toBe('pt');
      expect(byId('c-none')?.languageCode).toBe('fr');
    });

    it('should use displayName when available', async () => {
      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const contact = result.current.contacts.find(c => c.id === 'user-1');
      expect(contact?.name).toBe('Yuki Tanaka');
    });

    it('should format username with @ prefix', async () => {
      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      result.current.contacts.forEach(contact => {
        expect(contact.username).toMatch(/^@/);
      });
    });
  });

  describe('Online/Offline Separation', () => {
    it('should separate online and offline contacts', async () => {
      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // 2 online (user-1, user-3), 2 offline (user-2, user-4)
      expect(result.current.onlineContacts).toHaveLength(2);
      expect(result.current.offlineContacts).toHaveLength(2);
    });

    it('should include correct users in online list', async () => {
      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const onlineIds = result.current.onlineContacts.map(c => c.id);
      expect(onlineIds).toContain('user-1');
      expect(onlineIds).toContain('user-3');
      expect(onlineIds).not.toContain('user-2');
      expect(onlineIds).not.toContain('user-4');
    });

    it('should include correct users in offline list', async () => {
      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const offlineIds = result.current.offlineContacts.map(c => c.id);
      expect(offlineIds).toContain('user-2');
      expect(offlineIds).toContain('user-4');
      expect(offlineIds).not.toContain('user-1');
      expect(offlineIds).not.toContain('user-3');
    });

    it('should set isOnline property correctly on contacts', async () => {
      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const yukiContact = result.current.contacts.find(c => c.id === 'user-1');
      const carlosContact = result.current.contacts.find(c => c.id === 'user-2');

      expect(yukiContact?.isOnline).toBe(true);
      expect(carlosContact?.isOnline).toBe(false);
    });
  });

  describe('Search Functionality', () => {
    it('should not search when query is less than 2 characters', async () => {
      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.setSearchQuery('a');
      });

      expect(mockSearchUsers).not.toHaveBeenCalled();
      expect(result.current.searchResults).toEqual([]);
    });

    it('should not search when query is empty', async () => {
      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.setSearchQuery('');
      });

      expect(mockSearchUsers).not.toHaveBeenCalled();
    });

    it('should search when query is 2 or more characters', async () => {
      mockSearchUsers.mockResolvedValue({ data: [mockUsers[0]] });

      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.setSearchQuery('yu');
      });

      // Advance debounce timer
      act(() => jest.advanceTimersByTime(300));

      await waitFor(() => {
        expect(mockSearchUsers).toHaveBeenCalledWith('yu');
      });
    });

    it('should return search results', async () => {
      mockSearchUsers.mockResolvedValue([mockUsers[0], mockUsers[2]]);

      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.setSearchQuery('test');
      });

      // Advance debounce timer
      act(() => jest.advanceTimersByTime(300));

      await waitFor(() => {
        expect(result.current.searchResults).toHaveLength(2);
      });
    });

    it('should filter local contacts by search query', async () => {
      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.setSearchQuery('yuki');
      });

      // Advance debounce timer
      act(() => jest.advanceTimersByTime(300));

      await waitFor(() => {
        // contacts should be filtered locally
        expect(result.current.contacts.length).toBeLessThan(4);
      });
    });

    it('should show isSearching state', async () => {
      let resolveSearch: (value: unknown[]) => void;
      mockSearchUsers.mockImplementation(
        () => new Promise<unknown[]>(resolve => { resolveSearch = resolve; })
      );

      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.setSearchQuery('test');
      });

      // Advance debounce timer to trigger search
      act(() => jest.advanceTimersByTime(300));

      // isSearching should be true while search promise is pending
      await waitFor(() => {
        expect(result.current.isSearching).toBe(true);
      });

      // Resolve the search to clean up
      await act(async () => { resolveSearch!([]); });
    });
  });

  describe('WebSocket Online Status Updates', () => {
    it('should register onUserStatus callback with WebSocket', async () => {
      renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      expect(mockWebSocketHandlers.onUserStatus).toBeDefined();
    });

    it('should update contact online status when user comes online', async () => {
      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Initially user-2 is offline
      expect(result.current.offlineContacts.some(c => c.id === 'user-2')).toBe(true);

      // Simulate user coming online via WebSocket
      act(() => {
        mockWebSocketHandlers.onUserStatus?.({
          userId: 'user-2',
          isOnline: true,
        });
      });

      await waitFor(() => {
        expect(result.current.onlineUserIds.has('user-2')).toBe(true);
      });
    });

    it('should update contact online status when user goes offline', async () => {
      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Initially user-1 is online
      expect(result.current.onlineUserIds.has('user-1')).toBe(true);

      // Simulate user going offline via WebSocket
      act(() => {
        mockWebSocketHandlers.onUserStatus?.({
          userId: 'user-1',
          isOnline: false,
        });
      });

      await waitFor(() => {
        expect(result.current.onlineUserIds.has('user-1')).toBe(false);
      });
    });

    it('should track multiple online/offline transitions', async () => {
      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // User 2 comes online
      act(() => {
        mockWebSocketHandlers.onUserStatus?.({ userId: 'user-2', isOnline: true });
      });

      // User 1 goes offline
      act(() => {
        mockWebSocketHandlers.onUserStatus?.({ userId: 'user-1', isOnline: false });
      });

      // User 2 goes offline again
      act(() => {
        mockWebSocketHandlers.onUserStatus?.({ userId: 'user-2', isOnline: false });
      });

      await waitFor(() => {
        expect(result.current.onlineUserIds.has('user-1')).toBe(false);
        expect(result.current.onlineUserIds.has('user-2')).toBe(false);
      });
    });
  });

  describe('Refresh Contacts', () => {
    it('should refresh contacts when refreshContacts is called', async () => {
      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Le hook ne charge plus lui-même : il consomme `useFriendRequestsV2`.
      // Seul le rafraîchissement EXPLICITE atteint encore la source.
      expect(mockGetAllUsers).not.toHaveBeenCalled();

      await act(async () => {
        await result.current.refreshContacts();
      });

      expect(mockGetAllUsers).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('should return error when fetch fails', async () => {
      poserAmis([], { erreur: 'Network error' });

      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.contacts).toEqual([]);
    });

    it('should handle empty response', async () => {
      poserAmis([]);

      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.contacts).toEqual([]);
      expect(result.current.onlineContacts).toEqual([]);
      expect(result.current.offlineContacts).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it('should handle null data response', async () => {
      poserAmis(null);

      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.contacts).toEqual([]);
    });
  });

  describe('OnlineUserIds Set', () => {
    it('should expose onlineUserIds set', async () => {
      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.onlineUserIds).toBeInstanceOf(Set);
      expect(result.current.onlineUserIds.size).toBe(2); // user-1 and user-3
    });

    it('should initialize onlineUserIds from user data', async () => {
      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.onlineUserIds.has('user-1')).toBe(true);
      expect(result.current.onlineUserIds.has('user-3')).toBe(true);
      expect(result.current.onlineUserIds.has('user-2')).toBe(false);
      expect(result.current.onlineUserIds.has('user-4')).toBe(false);
    });
  });
});
