/**
 * Tests for hooks/use-contacts-data.ts
 */

jest.mock('@/services', () => ({
  usersService: {
    getAllUsers: jest.fn(),
  },
}));

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: jest.fn(() => 'test-token'),
  },
}));

jest.mock('@/lib/config', () => ({
  buildApiUrl: jest.fn((ep: string) => `http://localhost:3000/api/v1${ep}`),
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useContactsData } from '@/hooks/use-contacts-data';
import { usersService } from '@/services';
import { authManager } from '@/services/auth-manager.service';
import { buildApiUrl } from '@/lib/config';
import { toast } from 'sonner';
import type { User } from '@/types';

const mockGetAllUsers = usersService.getAllUsers as jest.MockedFunction<
  typeof usersService.getAllUsers
>;
const mockGetAuthToken = authManager.getAuthToken as jest.MockedFunction<
  typeof authManager.getAuthToken
>;
const mockBuildApiUrl = buildApiUrl as jest.MockedFunction<typeof buildApiUrl>;
const mockFetch = jest.fn();
global.fetch = mockFetch;

const t = (key: string) => key;

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    firstName: 'Alice',
    lastName: 'Smith',
    role: 'USER',
    isOnline: false,
    ...overrides,
  } as User);

const okResponse = (data: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(data) });

beforeEach(() => {
  jest.resetAllMocks();
  mockGetAuthToken.mockReturnValue('test-token');
  mockBuildApiUrl.mockImplementation((ep: string) => `http://localhost:3000/api/v1${ep}`);
  mockGetAllUsers.mockResolvedValue({ data: [] } as any);
  mockFetch.mockResolvedValue(okResponse({ data: [] }));
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('starts with empty contacts', () => {
    const { result } = renderHook(() => useContactsData(t));
    expect(result.current.contacts).toEqual([]);
  });

  it('starts with empty friendRequests', () => {
    const { result } = renderHook(() => useContactsData(t));
    expect(result.current.friendRequests).toEqual([]);
  });

  it('starts with empty affiliateRelations', () => {
    const { result } = renderHook(() => useContactsData(t));
    expect(result.current.affiliateRelations).toEqual([]);
  });

  it('starts with loading:true (loading is only cleared after calling loadContacts)', () => {
    const { result } = renderHook(() => useContactsData(t));
    expect(result.current.loading).toBe(true);
  });

  it('starts with empty filters', () => {
    const { result } = renderHook(() => useContactsData(t));
    expect(result.current.filters).toEqual({});
  });
});

// ─── loadContacts ─────────────────────────────────────────────────────────────

describe('loadContacts', () => {
  it('sets contacts from getAllUsers response', async () => {
    const users = [makeUser({ id: 'u1' }), makeUser({ id: 'u2' })];
    mockGetAllUsers.mockResolvedValueOnce({ data: users } as any);

    const { result } = renderHook(() => useContactsData(t));

    await act(async () => {
      await result.current.loadContacts();
    });

    expect(result.current.contacts).toHaveLength(2);
  });

  it('sets loading to false after completion', async () => {
    const { result } = renderHook(() => useContactsData(t));

    await act(async () => {
      await result.current.loadContacts();
    });

    expect(result.current.loading).toBe(false);
  });

  it('shows error toast and sets empty contacts on exception', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetAllUsers.mockRejectedValueOnce(new Error('Network'));

    const { result } = renderHook(() => useContactsData(t));

    await act(async () => {
      await result.current.loadContacts();
    });

    expect(toast.error).toHaveBeenCalledWith('errors.loadContactsError');
    expect(result.current.contacts).toEqual([]);
    expect(result.current.loading).toBe(false);
    consoleSpy.mockRestore();
  });

  it('filters by search term (username match)', async () => {
    const users = [
      makeUser({ id: 'u1', username: 'alice', firstName: 'Alice', lastName: 'A', displayName: 'Alice' }),
      makeUser({ id: 'u2', username: 'bob', firstName: 'Bob', lastName: 'B', displayName: 'Bob' }),
    ];
    mockGetAllUsers.mockResolvedValue({ data: users } as any);

    const { result } = renderHook(() => useContactsData(t));

    await act(async () => {
      await result.current.loadContacts({ search: 'alice' });
    });

    expect(result.current.contacts).toHaveLength(1);
    expect(result.current.contacts[0].id).toBe('u1');
  });

  it('filters by search term (displayName match)', async () => {
    const users = [
      makeUser({ id: 'u1', username: 'u1', firstName: 'Alice', lastName: 'Smith', displayName: 'Alice Smith' }),
      makeUser({ id: 'u2', username: 'u2', firstName: 'Bob', lastName: 'Jones', displayName: 'Bob Jones' }),
    ];
    mockGetAllUsers.mockResolvedValue({ data: users } as any);

    const { result } = renderHook(() => useContactsData(t));

    await act(async () => {
      await result.current.loadContacts({ search: 'smith' });
    });

    expect(result.current.contacts).toHaveLength(1);
  });

  it('filters by role', async () => {
    const users = [
      makeUser({ id: 'u1', role: 'ADMIN' }),
      makeUser({ id: 'u2', role: 'USER' }),
    ];
    mockGetAllUsers.mockResolvedValue({ data: users } as any);

    const { result } = renderHook(() => useContactsData(t));

    await act(async () => {
      await result.current.loadContacts({ role: 'ADMIN' });
    });

    expect(result.current.contacts).toHaveLength(1);
    expect(result.current.contacts[0].role).toBe('ADMIN');
  });

  it('filters by onlineOnly', async () => {
    const users = [
      makeUser({ id: 'u1', isOnline: true }),
      makeUser({ id: 'u2', isOnline: false }),
    ];
    mockGetAllUsers.mockResolvedValue({ data: users } as any);

    const { result } = renderHook(() => useContactsData(t));

    await act(async () => {
      await result.current.loadContacts({ onlineOnly: true });
    });

    expect(result.current.contacts).toHaveLength(1);
    expect(result.current.contacts[0].isOnline).toBe(true);
  });

  it('applies limit filter', async () => {
    const users = [
      makeUser({ id: 'u1' }),
      makeUser({ id: 'u2' }),
      makeUser({ id: 'u3' }),
    ];
    mockGetAllUsers.mockResolvedValue({ data: users } as any);

    const { result } = renderHook(() => useContactsData(t));

    await act(async () => {
      await result.current.loadContacts({ limit: 2 });
    });

    expect(result.current.contacts).toHaveLength(2);
  });

  it('handles missing data property gracefully', async () => {
    mockGetAllUsers.mockResolvedValueOnce({} as any);

    const { result } = renderHook(() => useContactsData(t));

    await act(async () => {
      await result.current.loadContacts();
    });

    expect(result.current.contacts).toEqual([]);
  });
});

// ─── loadFriendRequests ───────────────────────────────────────────────────────

describe('loadFriendRequests', () => {
  it('does nothing when no auth token', async () => {
    mockGetAuthToken.mockReturnValue(null);

    const { result } = renderHook(() => useContactsData(t));

    await act(async () => {
      await result.current.loadFriendRequests();
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.friendRequests).toEqual([]);
  });

  it('sets friendRequests from API response', async () => {
    const requests = [{ id: 'req-1', senderId: 'u1', receiverId: 'u2', status: 'pending' }];
    mockFetch.mockResolvedValueOnce(okResponse({ data: requests }));

    const { result } = renderHook(() => useContactsData(t));

    await act(async () => {
      await result.current.loadFriendRequests();
    });

    expect(result.current.friendRequests).toHaveLength(1);
    expect(result.current.friendRequests[0].id).toBe('req-1');
  });

  it('silently handles network errors', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockRejectedValueOnce(new Error('Network'));

    const { result } = renderHook(() => useContactsData(t));

    await act(async () => {
      await result.current.loadFriendRequests();
    });

    expect(result.current.friendRequests).toEqual([]);
    consoleSpy.mockRestore();
  });

  it('calls the correct endpoint with auth header', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ data: [] }));

    const { result } = renderHook(() => useContactsData(t));

    await act(async () => {
      await result.current.loadFriendRequests();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/friend-requests'),
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } })
    );
  });
});

// ─── loadAffiliateRelations ───────────────────────────────────────────────────

describe('loadAffiliateRelations', () => {
  it('does nothing when no auth token', async () => {
    mockGetAuthToken.mockReturnValue(null);

    const { result } = renderHook(() => useContactsData(t));

    await act(async () => {
      await result.current.loadAffiliateRelations();
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.affiliateRelations).toEqual([]);
  });

  it('sets affiliateRelations from referrals property', async () => {
    const referrals = [{ id: 'ref-1', referredUser: { id: 'u1', username: 'alice' } }];
    mockFetch.mockResolvedValueOnce(okResponse({ data: { referrals } }));

    const { result } = renderHook(() => useContactsData(t));

    await act(async () => {
      await result.current.loadAffiliateRelations();
    });

    expect(result.current.affiliateRelations).toHaveLength(1);
  });

  it('silently handles errors', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useContactsData(t));

    await act(async () => {
      await result.current.loadAffiliateRelations();
    });

    expect(result.current.affiliateRelations).toEqual([]);
    consoleSpy.mockRestore();
  });

  it('calls the affiliate/stats endpoint', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ data: { referrals: [] } }));

    const { result } = renderHook(() => useContactsData(t));

    await act(async () => {
      await result.current.loadAffiliateRelations();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/affiliate/stats'),
      expect.anything()
    );
  });
});

// ─── setFilters ───────────────────────────────────────────────────────────────

describe('setFilters', () => {
  it('exposes setFilters function', () => {
    const { result } = renderHook(() => useContactsData(t));
    expect(typeof result.current.setFilters).toBe('function');
  });

  it('updates filters state', () => {
    const { result } = renderHook(() => useContactsData(t));

    act(() => {
      result.current.setFilters({ search: 'alice' });
    });

    expect(result.current.filters).toEqual({ search: 'alice' });
  });
});

// ─── refreshAllData ───────────────────────────────────────────────────────────

describe('refreshAllData', () => {
  it('calls getAllUsers (from loadContacts)', async () => {
    const { result } = renderHook(() => useContactsData(t));

    await act(async () => {
      await result.current.refreshAllData();
    });

    expect(mockGetAllUsers).toHaveBeenCalled();
  });

  it('calls fetch endpoints (from loadFriendRequests + loadAffiliateRelations)', async () => {
    mockFetch.mockResolvedValue(okResponse({ data: [] }));

    const { result } = renderHook(() => useContactsData(t));

    await act(async () => {
      await result.current.refreshAllData();
    });

    // Both loadFriendRequests and loadAffiliateRelations call fetch
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
