/**
 * Tests for hooks/use-group-modal.ts
 */

const mockGetAuthToken = jest.fn();
jest.mock('@/services/auth-manager.service', () => ({
  authManager: { getAuthToken: () => mockGetAuthToken() },
}));

jest.mock('@/lib/config', () => ({
  buildApiUrl: (path: string) => `http://localhost:3000/api/v1${path}`,
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { renderHook, act } from '@testing-library/react';
import { useGroupModal } from '@/hooks/use-group-modal';
import type { User } from '@/types';

const makeUser = (id: string): User => ({ id, username: `user_${id}` } as User);

const jsonResponse = (data: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(data) } as Response);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthToken.mockReturnValue('jwt-token');
  mockFetch.mockResolvedValue(jsonResponse({ data: [] }));
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('groupName starts empty', () => {
    const { result } = renderHook(() => useGroupModal('me'));
    expect(result.current.groupName).toBe('');
  });

  it('selectedUsers starts empty', () => {
    const { result } = renderHook(() => useGroupModal('me'));
    expect(result.current.selectedUsers).toEqual([]);
  });

  it('isGroupPrivate starts false', () => {
    const { result } = renderHook(() => useGroupModal('me'));
    expect(result.current.isGroupPrivate).toBe(false);
  });

  it('isLoadingUsers starts false', () => {
    const { result } = renderHook(() => useGroupModal('me'));
    expect(result.current.isLoadingUsers).toBe(false);
  });
});

// ─── loadUsers ────────────────────────────────────────────────────────────────

describe('loadUsers', () => {
  it('does nothing when no auth token', async () => {
    mockGetAuthToken.mockReturnValue(null);
    const { result } = renderHook(() => useGroupModal('me'));
    await act(async () => { await result.current.loadUsers(); });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches /users for short queries', async () => {
    const { result } = renderHook(() => useGroupModal('me'));
    await act(async () => { await result.current.loadUsers('a'); });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/users'),
      expect.anything()
    );
    expect(mockFetch.mock.calls[0][0]).not.toContain('search');
  });

  it('fetches /users/search for queries >= 2 chars', async () => {
    const { result } = renderHook(() => useGroupModal('me'));
    await act(async () => { await result.current.loadUsers('alice'); });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/users/search'),
      expect.anything()
    );
  });

  it('excludes currentUserId from results', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ data: [makeUser('me'), makeUser('u2')] })
    );
    const { result } = renderHook(() => useGroupModal('me'));
    await act(async () => { await result.current.loadUsers(); });
    expect(result.current.availableUsers.find(u => u.id === 'me')).toBeUndefined();
    expect(result.current.availableUsers.find(u => u.id === 'u2')).toBeDefined();
  });

  it('shows error toast on API failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, false));
    const { result } = renderHook(() => useGroupModal('me'));
    await act(async () => { await result.current.loadUsers(); });
    expect(mockToastError).toHaveBeenCalled();
  });

  it('isLoadingUsers returns to false after loading', async () => {
    const { result } = renderHook(() => useGroupModal('me'));
    await act(async () => { await result.current.loadUsers(); });
    expect(result.current.isLoadingUsers).toBe(false);
  });
});

// ─── toggleUserSelection ──────────────────────────────────────────────────────

describe('toggleUserSelection', () => {
  it('adds user when not selected', () => {
    const { result } = renderHook(() => useGroupModal('me'));
    act(() => { result.current.toggleUserSelection(makeUser('u1')); });
    expect(result.current.selectedUsers.map(u => u.id)).toContain('u1');
  });

  it('removes user when already selected', () => {
    const { result } = renderHook(() => useGroupModal('me'));
    act(() => { result.current.toggleUserSelection(makeUser('u1')); });
    act(() => { result.current.toggleUserSelection(makeUser('u1')); });
    expect(result.current.selectedUsers).toHaveLength(0);
  });
});

// ─── resetForm ────────────────────────────────────────────────────────────────

describe('resetForm', () => {
  it('clears all form fields', () => {
    const { result } = renderHook(() => useGroupModal('me'));
    act(() => {
      result.current.setGroupName('My Group');
      result.current.setGroupDescription('Desc');
      result.current.setIsGroupPrivate(true);
      result.current.toggleUserSelection(makeUser('u1'));
    });
    act(() => { result.current.resetForm(); });
    expect(result.current.groupName).toBe('');
    expect(result.current.groupDescription).toBe('');
    expect(result.current.isGroupPrivate).toBe(false);
    expect(result.current.selectedUsers).toEqual([]);
  });
});

// ─── createGroup ──────────────────────────────────────────────────────────────

describe('createGroup', () => {
  it('shows error and returns null when groupName is empty', async () => {
    const { result } = renderHook(() => useGroupModal('me'));
    let res: string | null;
    await act(async () => { res = await result.current.createGroup(); });
    expect(mockToastError).toHaveBeenCalled();
    expect(res!).toBeNull();
  });

  it('POSTs to /groups with name and member IDs', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ group: { id: 'g-1' } }));
    const { result } = renderHook(() => useGroupModal('me'));
    act(() => {
      result.current.setGroupName('Dev Group');
      result.current.toggleUserSelection(makeUser('u1'));
    });
    await act(async () => { await result.current.createGroup(); });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.name).toBe('Dev Group');
    expect(body.memberIds).toContain('u1');
  });

  it('returns group id on success', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ group: { id: 'g-99' } }));
    const { result } = renderHook(() => useGroupModal('me'));
    act(() => { result.current.setGroupName('My Group'); });
    let groupId: string | null;
    await act(async () => { groupId = await result.current.createGroup(); });
    expect(groupId!).toBe('g-99');
  });

  it('resets form after successful creation', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ group: { id: 'g-1' } }));
    const { result } = renderHook(() => useGroupModal('me'));
    act(() => { result.current.setGroupName('My Group'); });
    await act(async () => { await result.current.createGroup(); });
    expect(result.current.groupName).toBe('');
  });

  it('shows error toast on API failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Server error' }, false));
    const { result } = renderHook(() => useGroupModal('me'));
    act(() => { result.current.setGroupName('My Group'); });
    await act(async () => { await result.current.createGroup(); });
    expect(mockToastError).toHaveBeenCalled();
  });

  it('returns null on network exception', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useGroupModal('me'));
    act(() => { result.current.setGroupName('My Group'); });
    let res: string | null;
    await act(async () => { res = await result.current.createGroup(); });
    expect(res!).toBeNull();
  });

  it('isCreatingGroup returns to false after completion', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ group: { id: 'g-1' } }));
    const { result } = renderHook(() => useGroupModal('me'));
    act(() => { result.current.setGroupName('My Group'); });
    await act(async () => { await result.current.createGroup(); });
    expect(result.current.isCreatingGroup).toBe(false);
  });
});
