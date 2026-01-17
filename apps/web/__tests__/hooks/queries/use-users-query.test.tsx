/**
 * Tests for useUsersQuery and related hooks
 *
 * Tests cover:
 * - useCurrentUserQuery: Current user profile query
 * - useUserProfileQuery: User profile by ID
 * - useUserStatsQuery: User statistics
 * - useDashboardStatsQuery: Dashboard statistics
 * - useSearchUsersQuery: User search with minimum length requirement
 * - useUpdateUserProfileMutation: Profile update with cache invalidation
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useCurrentUserQuery,
  useUserProfileQuery,
  useUserStatsQuery,
  useDashboardStatsQuery,
  useSearchUsersQuery,
  useUpdateUserProfileMutation,
} from '@/hooks/queries/use-users-query';
import type { User } from '@/types';

// Mock the users service
const mockGetMyProfile = jest.fn();
const mockGetUserProfile = jest.fn();
const mockGetUserStats = jest.fn();
const mockGetDashboardStats = jest.fn();
const mockSearchUsers = jest.fn();
const mockUpdateMyProfile = jest.fn();

jest.mock('@/services/users.service', () => ({
  usersService: {
    getMyProfile: () => mockGetMyProfile(),
    getUserProfile: (...args: unknown[]) => mockGetUserProfile(...args),
    getUserStats: (...args: unknown[]) => mockGetUserStats(...args),
    getDashboardStats: () => mockGetDashboardStats(),
    searchUsers: (...args: unknown[]) => mockSearchUsers(...args),
    updateMyProfile: (...args: unknown[]) => mockUpdateMyProfile(...args),
  },
}));

// Mock query keys
jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    users: {
      all: ['users'],
      current: () => ['users', 'current'],
      details: () => ['users', 'detail'],
      detail: (id: string) => ['users', 'detail', id],
      profile: (userId: string) => ['users', 'detail', userId, 'profile'],
    },
  },
}));

// Test data
const mockUser: User = {
  id: 'user-1',
  username: 'testuser',
  firstName: 'Test',
  lastName: 'User',
  displayName: 'Test User',
  email: 'test@example.com',
  phoneNumber: '+1234567890',
  role: 'USER',
  permissions: {
    canAccessAdmin: false,
    canManageUsers: false,
    canManageGroups: false,
    canManageConversations: false,
    canViewAnalytics: false,
    canModerateContent: false,
    canViewAuditLogs: false,
    canManageNotifications: false,
    canManageTranslations: false,
  },
  systemLanguage: 'en',
  regionalLanguage: 'en',
  autoTranslateEnabled: true,
  translateToSystemLanguage: true,
  translateToRegionalLanguage: false,
  useCustomDestination: false,
  isOnline: true,
  createdAt: new Date('2024-01-01'),
  lastActiveAt: new Date('2024-01-15'),
  isActive: true,
  updatedAt: new Date('2024-01-15'),
};

const mockUserStats = {
  messageCount: 150,
  conversationCount: 25,
  reactionsReceived: 45,
  lastActive: new Date('2024-01-15'),
};

const mockDashboardStats = {
  totalConversations: 25,
  totalMessages: 150,
  unreadMessages: 5,
  activeToday: 3,
};

// Helper to create a wrapper with QueryClient
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

// Helper to get access to QueryClient in tests
function createWrapperWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });

  const wrapper = function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };

  return { wrapper, queryClient };
}

describe('useCurrentUserQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading State', () => {
    it('should return isLoading true initially', () => {
      mockGetMyProfile.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useCurrentUserQuery(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });
  });

  describe('Success State', () => {
    it('should return current user on success', async () => {
      mockGetMyProfile.mockResolvedValue({ data: mockUser });

      const { result } = renderHook(() => useCurrentUserQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockUser);
      expect(result.current.data?.id).toBe('user-1');
    });
  });

  describe('Error State', () => {
    it('should return error on failure', async () => {
      const testError = new Error('Failed to fetch profile');
      mockGetMyProfile.mockRejectedValue(testError);

      const { result } = renderHook(() => useCurrentUserQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });
  });
});

describe('useUserProfileQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not fetch when userId is null', () => {
    mockGetUserProfile.mockResolvedValue({ data: mockUser });

    const { result } = renderHook(() => useUserProfileQuery(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetUserProfile).not.toHaveBeenCalled();
  });

  it('should not fetch when userId is undefined', () => {
    mockGetUserProfile.mockResolvedValue({ data: mockUser });

    const { result } = renderHook(() => useUserProfileQuery(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetUserProfile).not.toHaveBeenCalled();
  });

  it('should fetch user profile when ID is provided', async () => {
    mockGetUserProfile.mockResolvedValue({ data: mockUser });

    const { result } = renderHook(() => useUserProfileQuery('user-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGetUserProfile).toHaveBeenCalledWith('user-1');
    expect(result.current.data?.id).toBe('user-1');
  });

  it('should handle error state', async () => {
    mockGetUserProfile.mockRejectedValue(new Error('User not found'));

    const { result } = renderHook(() => useUserProfileQuery('invalid-id'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe('useUserStatsQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not fetch when userId is null', () => {
    mockGetUserStats.mockResolvedValue({ data: mockUserStats });

    const { result } = renderHook(() => useUserStatsQuery(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetUserStats).not.toHaveBeenCalled();
  });

  it('should fetch user stats when ID is provided', async () => {
    mockGetUserStats.mockResolvedValue({ data: mockUserStats });

    const { result } = renderHook(() => useUserStatsQuery('user-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGetUserStats).toHaveBeenCalledWith('user-1');
    expect(result.current.data?.messageCount).toBe(150);
  });
});

describe('useDashboardStatsQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return dashboard stats', async () => {
    mockGetDashboardStats.mockResolvedValue({ data: mockDashboardStats });

    const { result } = renderHook(() => useDashboardStatsQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockDashboardStats);
    expect(result.current.data?.totalConversations).toBe(25);
  });

  it('should handle error state', async () => {
    mockGetDashboardStats.mockRejectedValue(new Error('Failed'));

    const { result } = renderHook(() => useDashboardStatsQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe('useSearchUsersQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not fetch when query is less than 2 characters', () => {
    mockSearchUsers.mockResolvedValue({ data: [mockUser] });

    const { result } = renderHook(() => useSearchUsersQuery('a'), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockSearchUsers).not.toHaveBeenCalled();
  });

  it('should not fetch when query is empty', () => {
    mockSearchUsers.mockResolvedValue({ data: [mockUser] });

    const { result } = renderHook(() => useSearchUsersQuery(''), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockSearchUsers).not.toHaveBeenCalled();
  });

  it('should fetch when query is 2 or more characters', async () => {
    mockSearchUsers.mockResolvedValue({ data: [mockUser] });

    const { result } = renderHook(() => useSearchUsersQuery('te'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockSearchUsers).toHaveBeenCalledWith('te');
    expect(result.current.data).toHaveLength(1);
  });

  it('should return multiple users matching query', async () => {
    const mockUsers = [
      mockUser,
      { ...mockUser, id: 'user-2', username: 'testuser2' },
    ];
    mockSearchUsers.mockResolvedValue({ data: mockUsers });

    const { result } = renderHook(() => useSearchUsersQuery('test'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(2);
  });

  it('should return empty array when no users match', async () => {
    mockSearchUsers.mockResolvedValue({ data: [] });

    const { result } = renderHook(() => useSearchUsersQuery('xyz'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });
});

describe('useUpdateUserProfileMutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update profile and update cache', async () => {
    const updatedUser = { ...mockUser, displayName: 'Updated Name' };
    mockUpdateMyProfile.mockResolvedValue({ data: updatedUser });

    const { wrapper, queryClient } = createWrapperWithClient();

    // Pre-populate cache
    queryClient.setQueryData(['users', 'current'], mockUser);

    const { result } = renderHook(() => useUpdateUserProfileMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ displayName: 'Updated Name' });
    });

    expect(mockUpdateMyProfile).toHaveBeenCalledWith({ displayName: 'Updated Name' });

    // Cache should be updated
    const cachedData = queryClient.getQueryData(['users', 'current']);
    expect(cachedData).toEqual(updatedUser);
  });

  it('should handle update error', async () => {
    mockUpdateMyProfile.mockRejectedValue(new Error('Update failed'));

    const { result } = renderHook(() => useUpdateUserProfileMutation(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ displayName: 'New Name' });
      })
    ).rejects.toThrow('Update failed');
  });

  it('should invalidate current user queries on success', async () => {
    const updatedUser = { ...mockUser, displayName: 'Updated Name' };
    mockUpdateMyProfile.mockResolvedValue({ data: updatedUser });

    const { wrapper, queryClient } = createWrapperWithClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateUserProfileMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ displayName: 'Updated Name' });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['users', 'current'],
    });
  });

  it('should return isPending during mutation', async () => {
    let resolvePromise: (value: unknown) => void;
    mockUpdateMyProfile.mockImplementation(
      () => new Promise((resolve) => { resolvePromise = resolve; })
    );

    const { result } = renderHook(() => useUpdateUserProfileMutation(), {
      wrapper: createWrapper(),
    });

    // Start mutation without awaiting
    act(() => {
      result.current.mutate({ displayName: 'New Name' });
    });

    // Wait for pending state
    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    // Resolve the promise
    await act(async () => {
      resolvePromise!({ data: mockUser });
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });

  it('should update multiple profile fields', async () => {
    const updatedUser = {
      ...mockUser,
      displayName: 'Updated Name',
      systemLanguage: 'fr',
    };
    mockUpdateMyProfile.mockResolvedValue({ data: updatedUser });

    const { result } = renderHook(() => useUpdateUserProfileMutation(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        displayName: 'Updated Name',
        systemLanguage: 'fr',
      });
    });

    expect(mockUpdateMyProfile).toHaveBeenCalledWith({
      displayName: 'Updated Name',
      systemLanguage: 'fr',
    });
  });
});
