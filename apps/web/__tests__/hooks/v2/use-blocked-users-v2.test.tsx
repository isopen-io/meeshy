import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useBlockedUsersV2 } from '@/hooks/v2/use-blocked-users-v2';
import type { BlockedUser } from '@/types/contacts';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const makeBlockedUser = (overrides: Partial<BlockedUser> = {}): BlockedUser => ({
  id: 'blocked1',
  username: 'blockeduser',
  displayName: 'Blocked User',
  avatar: undefined,
  ...overrides,
});

describe('useBlockedUsersV2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({ data: { success: true, data: [] } });
  });

  it('fetches blocked users on mount', async () => {
    const users = [makeBlockedUser()];
    mockGet.mockResolvedValue({ data: { success: true, data: users } });

    const { result } = renderHook(() => useBlockedUsersV2(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGet).toHaveBeenCalledWith('/users/me/blocked-users');
    expect(result.current.blockedUsers).toHaveLength(1);
    expect(result.current.blockedUsers[0].id).toBe('blocked1');
  });

  it('blocks a user via mutation', async () => {
    mockPost.mockResolvedValue({ data: { success: true, data: { message: 'User blocked' } } });

    const { result } = renderHook(() => useBlockedUsersV2(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.blockUser('userToBlock');
    });

    expect(mockPost).toHaveBeenCalledWith('/users/userToBlock/block');
  });

  it('unblocks a user via mutation', async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: [makeBlockedUser({ id: 'userToUnblock' })] },
    });
    mockDelete.mockResolvedValue({ data: { success: true, data: { message: 'User unblocked' } } });

    const { result } = renderHook(() => useBlockedUsersV2(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.unblockUser('userToUnblock');
    });

    expect(mockDelete).toHaveBeenCalledWith('/users/userToUnblock/block');
  });

  it('checks if a user is blocked via isBlocked', async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: [makeBlockedUser({ id: 'blocked1' })] },
    });

    const { result } = renderHook(() => useBlockedUsersV2(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isBlocked('blocked1')).toBe(true);
    expect(result.current.isBlocked('notBlocked')).toBe(false);
  });

  it('handles fetch errors gracefully', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useBlockedUsersV2(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('Network error');
    expect(result.current.blockedUsers).toEqual([]);
  });

  it('optimistically removes user from list on unblock', async () => {
    const blockedList = [makeBlockedUser({ id: 'u1' }), makeBlockedUser({ id: 'u2' })];
    mockGet.mockResolvedValue({ data: { success: true, data: blockedList } });
    mockDelete.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: { success: true } }), 100))
    );

    const { result } = renderHook(() => useBlockedUsersV2(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.blockedUsers).toHaveLength(2));

    act(() => {
      result.current.unblockUser('u1');
    });

    await waitFor(() => {
      expect(result.current.blockedUsers.some((u) => u.id === 'u1')).toBe(false);
    });
  });
});
