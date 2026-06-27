/**
 * Tests for hooks/use-contacts-data.ts
 */

const mockGetAllUsers = jest.fn();

jest.mock('@/services', () => ({
  usersService: {
    getAllUsers: () => mockGetAllUsers(),
  },
}));

const mockToastError = jest.fn();
jest.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

const mockGetAuthToken = jest.fn();
jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: () => mockGetAuthToken(),
  },
}));

jest.mock('@/lib/config', () => ({
  buildApiUrl: (path: string) => `http://localhost:3000/api/v1${path}`,
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { renderHook, act } from '@testing-library/react';
import { useContactsData } from '@/hooks/use-contacts-data';
import type { User } from '@/types';

const t = (key: string) => `t:${key}`;

const makeUser = (id: string, overrides?: Partial<User>): User =>
  ({ id, username: `user_${id}`, firstName: id, lastName: 'Doe', isOnline: false, role: 'user', ...overrides } as User);

const jsonResponse = (data: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(data) } as Response);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthToken.mockReturnValue('jwt-token');
  mockGetAllUsers.mockResolvedValue({ data: [] });
  mockFetch.mockResolvedValue(jsonResponse({ data: [] }));
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('loading starts as true', () => {
    const { result } = renderHook(() => useContactsData(t));
    expect(result.current.loading).toBe(true);
  });

  it('contacts starts empty', () => {
    const { result } = renderHook(() => useContactsData(t));
    expect(result.current.contacts).toEqual([]);
  });

  it('friendRequests starts empty', () => {
    const { result } = renderHook(() => useContactsData(t));
    expect(result.current.friendRequests).toEqual([]);
  });

  it('affiliateRelations starts empty', () => {
    const { result } = renderHook(() => useContactsData(t));
    expect(result.current.affiliateRelations).toEqual([]);
  });

  it('filters starts as empty object', () => {
    const { result } = renderHook(() => useContactsData(t));
    expect(result.current.filters).toEqual({});
  });
});

// ─── loadContacts ─────────────────────────────────────────────────────────────

describe('loadContacts', () => {
  it('sets loading=false after loading', async () => {
    const { result } = renderHook(() => useContactsData(t));
    await act(async () => { await result.current.loadContacts(); });
    expect(result.current.loading).toBe(false);
  });

  it('loads contacts from service', async () => {
    const users = [makeUser('u1'), makeUser('u2')];
    mockGetAllUsers.mockResolvedValue({ data: users });
    const { result } = renderHook(() => useContactsData(t));
    await act(async () => { await result.current.loadContacts(); });
    expect(result.current.contacts).toHaveLength(2);
  });

  it('handles null data gracefully', async () => {
    mockGetAllUsers.mockResolvedValue({ data: null });
    const { result } = renderHook(() => useContactsData(t));
    await act(async () => { await result.current.loadContacts(); });
    expect(result.current.contacts).toEqual([]);
  });

  it('shows error toast on service failure', async () => {
    mockGetAllUsers.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useContactsData(t));
    await act(async () => { await result.current.loadContacts(); });
    expect(mockToastError).toHaveBeenCalled();
  });

  it('applies search filter by username', async () => {
    const users = [makeUser('alice'), makeUser('bob')];
    mockGetAllUsers.mockResolvedValue({ data: users });
    const { result } = renderHook(() => useContactsData(t));
    await act(async () => { await result.current.loadContacts({ search: 'alice' }); });
    expect(result.current.contacts.every(u => u.username?.includes('alice'))).toBe(true);
  });

  it('applies onlineOnly filter', async () => {
    const users = [makeUser('u1', { isOnline: true }), makeUser('u2', { isOnline: false })];
    mockGetAllUsers.mockResolvedValue({ data: users });
    const { result } = renderHook(() => useContactsData(t));
    await act(async () => { await result.current.loadContacts({ onlineOnly: true }); });
    expect(result.current.contacts.every(u => u.isOnline)).toBe(true);
  });

  it('applies limit filter', async () => {
    const users = [makeUser('u1'), makeUser('u2'), makeUser('u3')];
    mockGetAllUsers.mockResolvedValue({ data: users });
    const { result } = renderHook(() => useContactsData(t));
    await act(async () => { await result.current.loadContacts({ limit: 2 }); });
    expect(result.current.contacts).toHaveLength(2);
  });

  it('applies role filter', async () => {
    const users = [
      makeUser('u1', { role: 'admin' }),
      makeUser('u2', { role: 'user' }),
    ];
    mockGetAllUsers.mockResolvedValue({ data: users });
    const { result } = renderHook(() => useContactsData(t));
    await act(async () => { await result.current.loadContacts({ role: 'admin' }); });
    expect(result.current.contacts).toHaveLength(1);
    expect(result.current.contacts[0].role).toBe('admin');
  });
});

// ─── loadFriendRequests ───────────────────────────────────────────────────────

describe('loadFriendRequests', () => {
  it('does nothing when no auth token', async () => {
    mockGetAuthToken.mockReturnValue(null);
    const { result } = renderHook(() => useContactsData(t));
    await act(async () => { await result.current.loadFriendRequests(); });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sets friendRequests on success', async () => {
    const requests = [{ id: 'req-1', senderId: 'u1', receiverId: 'u2', status: 'pending' }];
    mockFetch.mockResolvedValue(jsonResponse({ data: requests }));
    const { result } = renderHook(() => useContactsData(t));
    await act(async () => { await result.current.loadFriendRequests(); });
    expect(result.current.friendRequests).toHaveLength(1);
  });

  it('does not throw on fetch error', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useContactsData(t));
    await expect(
      act(async () => { await result.current.loadFriendRequests(); })
    ).resolves.not.toThrow();
  });

  it('does not update friendRequests when response is not ok', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, false));
    const { result } = renderHook(() => useContactsData(t));
    await act(async () => { await result.current.loadFriendRequests(); });
    expect(result.current.friendRequests).toEqual([]);
  });
});

// ─── loadAffiliateRelations ───────────────────────────────────────────────────

describe('loadAffiliateRelations', () => {
  it('sets affiliateRelations on success', async () => {
    const referrals = [{ id: 'aff-1', referredUser: { id: 'u2' }, status: 'completed' }];
    mockFetch.mockResolvedValue(jsonResponse({ data: { referrals } }));
    const { result } = renderHook(() => useContactsData(t));
    await act(async () => { await result.current.loadAffiliateRelations(); });
    expect(result.current.affiliateRelations).toHaveLength(1);
  });

  it('does nothing when no auth token', async () => {
    mockGetAuthToken.mockReturnValue(null);
    const { result } = renderHook(() => useContactsData(t));
    await act(async () => { await result.current.loadAffiliateRelations(); });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─── setFilters ───────────────────────────────────────────────────────────────

describe('setFilters', () => {
  it('updates filters state', () => {
    const { result } = renderHook(() => useContactsData(t));
    act(() => { result.current.setFilters({ search: 'alice' }); });
    expect(result.current.filters).toEqual({ search: 'alice' });
  });
});
