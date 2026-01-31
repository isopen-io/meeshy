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

// Mock users service
const mockGetAllUsers = jest.fn();
const mockSearchUsers = jest.fn();
const mockIsUserOnline = jest.fn();
const mockGetLastSeenFormatted = jest.fn();

jest.mock('@/services/users.service', () => ({
  usersService: {
    getAllUsers: () => mockGetAllUsers(),
    searchUsers: (...args: unknown[]) => mockSearchUsers(...args),
    isUserOnline: (...args: unknown[]) => mockIsUserOnline(...args),
    getLastSeenFormatted: (...args: unknown[]) => mockGetLastSeenFormatted(...args),
  },
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
    mockGetAllUsers.mockResolvedValue({ data: mockUsers });
    mockSearchUsers.mockResolvedValue({ data: [] });
    mockIsUserOnline.mockImplementation((user: User) => user.isOnline);
    mockGetLastSeenFormatted.mockImplementation((user: User) =>
      user.isOnline ? 'En ligne' : 'Il y a 1h'
    );
  });

  describe('Initial Loading', () => {
    it('should return isLoading true initially', () => {
      mockGetAllUsers.mockImplementation(() => new Promise(() => {}));

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

      expect(mockGetAllUsers).toHaveBeenCalledTimes(1);
      expect(result.current.contacts).toHaveLength(4);
    });

    it('should not fetch contacts when disabled', () => {
      const { result } = renderHook(() => useContactsV2({ enabled: false }), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(mockGetAllUsers).not.toHaveBeenCalled();
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

      const contact = result.current.contacts[0];
      expect(contact).toMatchObject({
        id: 'user-1',
        name: 'Yuki Tanaka',
        username: '@yukitanaka',
        languageCode: 'ja',
      });
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

      await waitFor(() => {
        expect(mockSearchUsers).toHaveBeenCalledWith('yu');
      });
    });

    it('should return search results', async () => {
      mockSearchUsers.mockResolvedValue({ data: [mockUsers[0], mockUsers[2]] });

      const { result } = renderHook(() => useContactsV2(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.setSearchQuery('test');
      });

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

      await waitFor(() => {
        // contacts should be filtered locally
        expect(result.current.contacts.length).toBeLessThan(4);
      });
    });

    it('should show isSearching state', async () => {
      mockSearchUsers.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ data: [] }), 100))
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

      // isSearching should be true while searching
      expect(result.current.isSearching).toBe(true);
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

      expect(mockGetAllUsers).toHaveBeenCalledTimes(1);

      await act(async () => {
        await result.current.refreshContacts();
      });

      expect(mockGetAllUsers).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('should return error when fetch fails', async () => {
      mockGetAllUsers.mockRejectedValue(new Error('Network error'));

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
      mockGetAllUsers.mockResolvedValue({ data: [] });

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
      mockGetAllUsers.mockResolvedValue({ data: null });

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
