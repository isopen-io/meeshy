/**
 * Tests for hooks/use-user-search.ts
 */

const mockSearchUsers = jest.fn();

jest.mock('@/services/users.service', () => ({
  usersService: { searchUsers: (...args: unknown[]) => mockSearchUsers(...args) },
}));

const mockToastError = jest.fn();
jest.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => `t:${key}` }),
}));

import { renderHook, act } from '@testing-library/react';
import { useUserSearch, useUserSelection } from '@/hooks/use-user-search';
import type { User } from '@/types';

const makeUser = (id: string): User => ({ id, username: `user_${id}` } as User);

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── useUserSearch ────────────────────────────────────────────────────────────

describe('useUserSearch — initial state', () => {
  it('starts with empty availableUsers and isLoading=false', () => {
    const { result } = renderHook(() => useUserSearch('current-user', []));
    expect(result.current.availableUsers).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useUserSearch — short query guard', () => {
  it('clears results and does not call service when query is empty', async () => {
    const { result } = renderHook(() => useUserSearch('current-user', []));
    await act(async () => { await result.current.searchUsers(''); });
    expect(mockSearchUsers).not.toHaveBeenCalled();
    expect(result.current.availableUsers).toEqual([]);
  });

  it('clears results when query is shorter than 2 chars', async () => {
    const { result } = renderHook(() => useUserSearch('current-user', []));
    await act(async () => { await result.current.searchUsers('a'); });
    expect(mockSearchUsers).not.toHaveBeenCalled();
  });
});

describe('useUserSearch — success', () => {
  it('sets availableUsers with results excluding currentUserId', async () => {
    const users = [makeUser('u1'), makeUser('current-user'), makeUser('u2')];
    mockSearchUsers.mockResolvedValue(users);

    const { result } = renderHook(() => useUserSearch('current-user', []));
    await act(async () => { await result.current.searchUsers('alice'); });

    expect(result.current.availableUsers.map(u => u.id)).toEqual(['u1', 'u2']);
  });

  it('excludes already-selected users from results', async () => {
    const users = [makeUser('u1'), makeUser('u2'), makeUser('u3')];
    mockSearchUsers.mockResolvedValue(users);

    const selected = [makeUser('u2')];
    const { result } = renderHook(() => useUserSearch('current-user', selected));
    await act(async () => { await result.current.searchUsers('alice'); });

    expect(result.current.availableUsers.map(u => u.id)).toEqual(['u1', 'u3']);
  });

  it('isLoading is false after search completes', async () => {
    mockSearchUsers.mockResolvedValue([]);
    const { result } = renderHook(() => useUserSearch('current-user', []));
    await act(async () => { await result.current.searchUsers('alice'); });
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useUserSearch — error', () => {
  it('shows error toast and sets isLoading=false on failure', async () => {
    mockSearchUsers.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useUserSearch('current-user', []));
    await act(async () => { await result.current.searchUsers('alice'); });
    expect(mockToastError).toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });
});

// ─── useUserSelection ─────────────────────────────────────────────────────────

describe('useUserSelection — initial state', () => {
  it('starts with empty selectedUsers', () => {
    const { result } = renderHook(() => useUserSelection());
    expect(result.current.selectedUsers).toEqual([]);
  });
});

describe('useUserSelection — toggleUserSelection', () => {
  it('adds a user when not yet selected', () => {
    const { result } = renderHook(() => useUserSelection());
    act(() => { result.current.toggleUserSelection(makeUser('u1')); });
    expect(result.current.selectedUsers.map(u => u.id)).toContain('u1');
  });

  it('removes a user when already selected', () => {
    const { result } = renderHook(() => useUserSelection());
    act(() => { result.current.toggleUserSelection(makeUser('u1')); });
    act(() => { result.current.toggleUserSelection(makeUser('u1')); });
    expect(result.current.selectedUsers).toHaveLength(0);
  });

  it('can select multiple users', () => {
    const { result } = renderHook(() => useUserSelection());
    act(() => { result.current.toggleUserSelection(makeUser('u1')); });
    act(() => { result.current.toggleUserSelection(makeUser('u2')); });
    expect(result.current.selectedUsers).toHaveLength(2);
  });
});

describe('useUserSelection — clearSelection', () => {
  it('clears all selected users', () => {
    const { result } = renderHook(() => useUserSelection());
    act(() => { result.current.toggleUserSelection(makeUser('u1')); });
    act(() => { result.current.toggleUserSelection(makeUser('u2')); });
    act(() => { result.current.clearSelection(); });
    expect(result.current.selectedUsers).toEqual([]);
  });
});
