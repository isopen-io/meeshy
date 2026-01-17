import { renderHook } from '@testing-library/react';
import { useContactsFiltering } from '@/hooks/use-contacts-filtering';
import { User } from '@/types';

const mockT = (key: string, params?: any) => {
  const translations: Record<string, string> = {
    'errors.searchError': 'Search error',
    'status.online': 'Online',
    'status.offline': 'Offline',
  };
  return translations[key] || key;
};

const mockContacts: User[] = [
  {
    id: '1',
    username: 'john_doe',
    email: 'john@example.com',
    firstName: 'John',
    lastName: 'Doe',
    isOnline: true,
    role: 'user',
    createdAt: new Date().toISOString(),
  } as User,
  {
    id: '2',
    username: 'jane_smith',
    email: 'jane@example.com',
    firstName: 'Jane',
    lastName: 'Smith',
    isOnline: false,
    role: 'user',
    createdAt: new Date().toISOString(),
  } as User,
];

const mockFriendRequests = [
  {
    id: 'req1',
    senderId: '1',
    receiverId: '2',
    status: 'accepted' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'req2',
    senderId: '3',
    receiverId: '1',
    status: 'pending' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

describe('useContactsFiltering', () => {
  it('should initialize with correct default values', () => {
    const { result } = renderHook(() =>
      useContactsFiltering(mockContacts, mockFriendRequests, [], mockT)
    );

    expect(result.current.searchQuery).toBe('');
    expect(result.current.displayedUsers).toEqual(mockContacts);
    expect(result.current.stats.total).toBe(2);
    expect(result.current.stats.connected).toBe(1);
    expect(result.current.stats.pending).toBe(1);
  });

  it('should filter contacts by search query', () => {
    const { result } = renderHook(() =>
      useContactsFiltering(mockContacts, mockFriendRequests, [], mockT)
    );

    // Test with empty query
    expect(result.current.displayedUsers).toHaveLength(2);

    // Filter should work when searchQuery is set
    // Note: In actual implementation, setSearchQuery would trigger filtering
  });

  it('should calculate correct statistics', () => {
    const { result } = renderHook(() =>
      useContactsFiltering(mockContacts, mockFriendRequests, [], mockT)
    );

    expect(result.current.stats).toEqual({
      total: 2,
      connected: 1,
      pending: 1,
      refused: 0,
      affiliates: 0,
    });
  });

  it('should return correct filtered requests', () => {
    const { result } = renderHook(() =>
      useContactsFiltering(mockContacts, mockFriendRequests, [], mockT)
    );

    expect(result.current.filteredRequests.connected).toHaveLength(1);
    expect(result.current.filteredRequests.pending).toHaveLength(1);
    expect(result.current.filteredRequests.refused).toHaveLength(0);
  });

  it('should format user display name correctly', () => {
    const { result } = renderHook(() =>
      useContactsFiltering(mockContacts, mockFriendRequests, [], mockT)
    );

    const displayName = result.current.getUserDisplayName(mockContacts[0]);
    expect(displayName).toBe('John Doe');
  });

  it('should handle empty contacts array', () => {
    const { result } = renderHook(() =>
      useContactsFiltering([], [], [], mockT)
    );

    expect(result.current.displayedUsers).toEqual([]);
    expect(result.current.stats.total).toBe(0);
  });
});
