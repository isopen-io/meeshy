jest.mock('@/services/users.service', () => ({
  usersService: { searchUsers: jest.fn() },
}));
jest.mock('sonner', () => ({
  toast: { error: jest.fn() },
}));
jest.mock('@/hooks/useI18n', () => ({
  useI18n: jest.fn(() => ({ t: (key: string) => key })),
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useUserSearch, useUserSelection } from '@/hooks/use-user-search';
import { usersService } from '@/services/users.service';
import { toast } from 'sonner';

const mockSearchUsers = usersService.searchUsers as jest.Mock;
const mockToastError = toast.error as jest.Mock;

const makeUser = (overrides = {}) => ({ id: 'user-1', username: 'test', ...overrides } as any);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useUserSearch', () => {
  it('starts with empty availableUsers and isLoading false', () => {
    const { result } = renderHook(() => useUserSearch('current-user', []));

    expect(result.current.availableUsers).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('clears availableUsers and does not call service when query is empty string', async () => {
    const { result } = renderHook(() => useUserSearch('current-user', []));

    await act(async () => {
      await result.current.searchUsers('');
    });

    expect(mockSearchUsers).not.toHaveBeenCalled();
    expect(result.current.availableUsers).toEqual([]);
  });

  it('clears availableUsers and does not call service when query is less than 2 chars', async () => {
    const { result } = renderHook(() => useUserSearch('current-user', []));

    await act(async () => {
      await result.current.searchUsers('a');
    });

    expect(mockSearchUsers).not.toHaveBeenCalled();
    expect(result.current.availableUsers).toEqual([]);
  });

  it('treats whitespace-only query as empty and does not call service', async () => {
    const { result } = renderHook(() => useUserSearch('current-user', []));

    await act(async () => {
      await result.current.searchUsers('  ');
    });

    expect(mockSearchUsers).not.toHaveBeenCalled();
    expect(result.current.availableUsers).toEqual([]);
  });

  it('calls service with trimmed query and filters out current user and selected users', async () => {
    const currentUser = makeUser({ id: 'current-user', username: 'current' });
    const selectedUser = makeUser({ id: 'selected-user', username: 'selected' });
    const validUser = makeUser({ id: 'valid-user', username: 'valid' });

    mockSearchUsers.mockResolvedValueOnce([currentUser, selectedUser, validUser]);

    const { result } = renderHook(() =>
      useUserSearch('current-user', [selectedUser])
    );

    await act(async () => {
      await result.current.searchUsers('  valid  ');
    });

    expect(mockSearchUsers).toHaveBeenCalledWith('valid');
    expect(result.current.availableUsers).toEqual([validUser]);
  });

  it('sets isLoading true during fetch and false after', async () => {
    let resolveSearch!: (value: any[]) => void;
    const searchPromise = new Promise<any[]>((resolve) => {
      resolveSearch = resolve;
    });
    mockSearchUsers.mockReturnValueOnce(searchPromise);

    const { result } = renderHook(() => useUserSearch('current-user', []));

    act(() => {
      result.current.searchUsers('ab');
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    await act(async () => {
      resolveSearch([]);
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('calls toast.error and sets isLoading false when service throws', async () => {
    mockSearchUsers.mockRejectedValueOnce(new Error('network error'));

    const { result } = renderHook(() => useUserSearch('current-user', []));

    await act(async () => {
      await result.current.searchUsers('ab');
    });

    expect(mockToastError).toHaveBeenCalledWith(
      'createConversationModal.errors.searchError'
    );
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useUserSelection', () => {
  it('starts with empty selectedUsers', () => {
    const { result } = renderHook(() => useUserSelection());

    expect(result.current.selectedUsers).toEqual([]);
  });

  it('toggleUserSelection adds user when not already selected', () => {
    const user = makeUser({ id: 'user-1' });
    const { result } = renderHook(() => useUserSelection());

    act(() => {
      result.current.toggleUserSelection(user);
    });

    expect(result.current.selectedUsers).toEqual([user]);
  });

  it('toggleUserSelection removes user when already selected', () => {
    const user = makeUser({ id: 'user-1' });
    const { result } = renderHook(() => useUserSelection());

    act(() => {
      result.current.toggleUserSelection(user);
    });

    act(() => {
      result.current.toggleUserSelection(user);
    });

    expect(result.current.selectedUsers).toEqual([]);
  });

  it('clearSelection empties selectedUsers', () => {
    const userA = makeUser({ id: 'user-a' });
    const userB = makeUser({ id: 'user-b' });
    const { result } = renderHook(() => useUserSelection());

    act(() => {
      result.current.toggleUserSelection(userA);
      result.current.toggleUserSelection(userB);
    });

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectedUsers).toEqual([]);
  });
});
