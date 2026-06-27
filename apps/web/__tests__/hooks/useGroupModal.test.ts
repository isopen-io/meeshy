/**
 * Tests for hooks/use-group-modal.ts
 */

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: jest.fn(() => 'test-token'),
  },
}));

jest.mock('@/lib/config', () => ({
  buildApiUrl: jest.fn((ep: string) => `http://localhost:3000/api/v1${ep}`),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useGroupModal } from '@/hooks/use-group-modal';
import { authManager } from '@/services/auth-manager.service';
import { buildApiUrl } from '@/lib/config';
import { toast } from 'sonner';
import type { User } from '@/types';

const mockGetAuthToken = authManager.getAuthToken as jest.MockedFunction<
  typeof authManager.getAuthToken
>;
const mockBuildApiUrl = buildApiUrl as jest.MockedFunction<typeof buildApiUrl>;
const mockFetch = jest.fn();
global.fetch = mockFetch;

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: `user-${Math.random().toString(36).slice(2)}`,
    username: 'test',
    displayName: 'Test User',
    ...overrides,
  } as User);

const okUsers = (users: User[]) =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: users }),
  });

const failResponse = (status: number, statusText = 'Error') =>
  Promise.resolve({
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve({ message: 'Server error' }),
  });

describe('useGroupModal', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetAuthToken.mockReturnValue('test-token');
    mockBuildApiUrl.mockImplementation((ep: string) => `http://localhost:3000/api/v1${ep}`);
  });

  it('initializes with empty state', () => {
    const { result } = renderHook(() => useGroupModal('current-user'));

    expect(result.current.groupName).toBe('');
    expect(result.current.groupDescription).toBe('');
    expect(result.current.isGroupPrivate).toBe(false);
    expect(result.current.selectedUsers).toEqual([]);
    expect(result.current.availableUsers).toEqual([]);
    expect(result.current.isLoadingUsers).toBe(false);
    expect(result.current.isCreatingGroup).toBe(false);
  });

  // ─── loadUsers ────────────────────────────────────────────────────────────

  describe('loadUsers', () => {
    it('fetches /users endpoint when query is empty', async () => {
      const users = [makeUser({ id: 'other-1' })];
      mockFetch.mockResolvedValueOnce(okUsers(users));

      const { result } = renderHook(() => useGroupModal('current-user'));

      await act(async () => {
        await result.current.loadUsers();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/users'),
        expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } })
      );
    });

    it('fetches /users/search?q=... when query >= 2 chars', async () => {
      mockFetch.mockResolvedValueOnce(okUsers([]));

      const { result } = renderHook(() => useGroupModal('current-user'));

      await act(async () => {
        await result.current.loadUsers('al');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/search?q=al'),
        expect.anything()
      );
    });

    it('does not search for single-char queries', async () => {
      mockFetch.mockResolvedValueOnce(okUsers([]));

      const { result } = renderHook(() => useGroupModal('current-user'));

      await act(async () => {
        await result.current.loadUsers('a');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.not.stringContaining('/search'),
        expect.anything()
      );
    });

    it('filters out current user from results', async () => {
      const users = [makeUser({ id: 'current-user' }), makeUser({ id: 'other' })];
      mockFetch.mockResolvedValueOnce(okUsers(users));

      const { result } = renderHook(() => useGroupModal('current-user'));

      await act(async () => {
        await result.current.loadUsers();
      });

      expect(result.current.availableUsers.every(u => u.id !== 'current-user')).toBe(true);
    });

    it('filters out already-selected users', async () => {
      const selected = makeUser({ id: 'selected-1' });
      const users = [selected, makeUser({ id: 'other' })];
      mockFetch.mockResolvedValueOnce(okUsers(users));

      const { result } = renderHook(() => useGroupModal('current-user'));

      // Select a user first
      act(() => {
        result.current.toggleUserSelection(selected);
      });

      await act(async () => {
        await result.current.loadUsers();
      });

      expect(result.current.availableUsers.some(u => u.id === 'selected-1')).toBe(false);
    });

    it('shows error toast on failed response', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch.mockResolvedValueOnce(failResponse(500));

      const { result } = renderHook(() => useGroupModal('current-user'));

      await act(async () => {
        await result.current.loadUsers();
      });

      expect(toast.error).toHaveBeenCalledWith('Error loading users');
      consoleSpy.mockRestore();
    });

    it('shows error toast on fetch exception', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useGroupModal('current-user'));

      await act(async () => {
        await result.current.loadUsers();
      });

      expect(toast.error).toHaveBeenCalledWith('Error loading users');
      consoleSpy.mockRestore();
    });

    it('does nothing when no auth token', async () => {
      mockGetAuthToken.mockReturnValue(null);

      const { result } = renderHook(() => useGroupModal('current-user'));

      await act(async () => {
        await result.current.loadUsers();
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('supports users returned in data.users property', async () => {
      const users = [makeUser({ id: 'u1' })];
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ users }),
        })
      );

      const { result } = renderHook(() => useGroupModal('current-user'));

      await act(async () => {
        await result.current.loadUsers();
      });

      expect(result.current.availableUsers).toHaveLength(1);
    });
  });

  // ─── toggleUserSelection ──────────────────────────────────────────────────

  describe('toggleUserSelection', () => {
    it('adds user to selection when not selected', () => {
      const user = makeUser({ id: 'u1' });
      const { result } = renderHook(() => useGroupModal('current-user'));

      act(() => {
        result.current.toggleUserSelection(user);
      });

      expect(result.current.selectedUsers).toContain(user);
    });

    it('removes user from selection when already selected', () => {
      const user = makeUser({ id: 'u1' });
      const { result } = renderHook(() => useGroupModal('current-user'));

      act(() => {
        result.current.toggleUserSelection(user);
        result.current.toggleUserSelection(user);
      });

      expect(result.current.selectedUsers).toHaveLength(0);
    });
  });

  // ─── resetForm ────────────────────────────────────────────────────────────

  describe('resetForm', () => {
    it('clears all form state', () => {
      const { result } = renderHook(() => useGroupModal('current-user'));

      act(() => {
        result.current.setGroupName('My Group');
        result.current.setGroupDescription('Desc');
        result.current.setIsGroupPrivate(true);
        result.current.toggleUserSelection(makeUser({ id: 'u1' }));
      });

      act(() => {
        result.current.resetForm();
      });

      expect(result.current.groupName).toBe('');
      expect(result.current.groupDescription).toBe('');
      expect(result.current.isGroupPrivate).toBe(false);
      expect(result.current.selectedUsers).toHaveLength(0);
    });
  });

  // ─── createGroup ──────────────────────────────────────────────────────────

  describe('createGroup', () => {
    it('returns null and shows error when name is empty', async () => {
      const { result } = renderHook(() => useGroupModal('current-user'));

      let returnValue;
      await act(async () => {
        returnValue = await result.current.createGroup();
      });

      expect(returnValue).toBeNull();
      expect(toast.error).toHaveBeenCalledWith('Please enter a group name');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('creates group and returns group id on success', async () => {
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ group: { id: 'group-xyz' } }),
        })
      );

      const { result } = renderHook(() => useGroupModal('current-user'));

      act(() => {
        result.current.setGroupName('Team Alpha');
      });

      let groupId;
      await act(async () => {
        groupId = await result.current.createGroup();
      });

      expect(groupId).toBe('group-xyz');
      expect(toast.success).toHaveBeenCalledWith('Group created successfully');
    });

    it('resets form after successful creation', async () => {
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ group: { id: 'g1' } }),
        })
      );

      const { result } = renderHook(() => useGroupModal('current-user'));

      act(() => {
        result.current.setGroupName('My Group');
      });

      await act(async () => {
        await result.current.createGroup();
      });

      expect(result.current.groupName).toBe('');
    });

    it('returns null and shows error on API failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch.mockResolvedValueOnce(failResponse(400));

      const { result } = renderHook(() => useGroupModal('current-user'));

      act(() => {
        result.current.setGroupName('Team');
      });

      let returnValue;
      await act(async () => {
        returnValue = await result.current.createGroup();
      });

      expect(returnValue).toBeNull();
      expect(toast.error).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('returns null on fetch exception', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch.mockRejectedValueOnce(new Error('Network'));

      const { result } = renderHook(() => useGroupModal('current-user'));

      act(() => {
        result.current.setGroupName('Team');
      });

      let returnValue;
      await act(async () => {
        returnValue = await result.current.createGroup();
      });

      expect(returnValue).toBeNull();
      expect(toast.error).toHaveBeenCalledWith('Error creating group');
      consoleSpy.mockRestore();
    });

    it('sends selected users as memberIds', async () => {
      const user = makeUser({ id: 'u1' });
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ group: { id: 'g1' } }),
        })
      );

      const { result } = renderHook(() => useGroupModal('current-user'));

      act(() => {
        result.current.setGroupName('Team');
        result.current.toggleUserSelection(user);
      });

      await act(async () => {
        await result.current.createGroup();
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.memberIds).toContain('u1');
    });

    it('sets isGroupPrivate in request body', async () => {
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ group: { id: 'g1' } }),
        })
      );

      const { result } = renderHook(() => useGroupModal('current-user'));

      act(() => {
        result.current.setGroupName('Private Team');
        result.current.setIsGroupPrivate(true);
      });

      await act(async () => {
        await result.current.createGroup();
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.isPrivate).toBe(true);
    });
  });
});
