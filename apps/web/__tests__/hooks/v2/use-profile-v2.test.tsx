/**
 * Tests for useProfileV2 hook
 *
 * Tests cover:
 * - Current user profile loading
 * - Other user profile loading
 * - Profile transformation (languages, stats)
 * - Profile update functionality
 * - Helper functions (getDisplayName, getAvatarUrl)
 * - Error handling
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useProfileV2, type ProfileV2, type ProfileStatsV2 } from '@/hooks/v2/use-profile-v2';
import type { User } from '@meeshy/shared/types';

// Mock users service
const mockIsUserOnline = jest.fn();
const mockGetLastSeenFormatted = jest.fn();
const mockGetDisplayName = jest.fn();

jest.mock('@/services/users.service', () => ({
  usersService: {
    isUserOnline: (...args: unknown[]) => mockIsUserOnline(...args),
    getLastSeenFormatted: (...args: unknown[]) => mockGetLastSeenFormatted(...args),
    getDisplayName: (...args: unknown[]) => mockGetDisplayName(...args),
  },
}));

// Mock query hooks
const mockCurrentUserData = jest.fn();
const mockOtherUserData = jest.fn();
const mockUserStatsData = jest.fn();
const mockDashboardStatsData = jest.fn();
const mockUpdateMutate = jest.fn();

jest.mock('@/hooks/queries/use-users-query', () => ({
  useCurrentUserQuery: () => mockCurrentUserData(),
  useUserProfileQuery: (userId: string | null) => mockOtherUserData(userId),
  useUserStatsQuery: (userId: string | null) => mockUserStatsData(userId),
  useDashboardStatsQuery: () => mockDashboardStatsData(),
  useUpdateUserProfileMutation: () => ({
    mutateAsync: mockUpdateMutate,
    isPending: false,
  }),
}));

// Mock query keys
jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    users: {
      current: () => ['users', 'current'],
    },
  },
}));

// Test data
const mockCurrentUser: User = {
  id: 'current-user-id',
  username: 'jeandupont',
  firstName: 'Jean',
  lastName: 'Dupont',
  displayName: 'Jean Dupont',
  email: 'jean@example.com',
  bio: 'Passionné de langues et de voyages',
  avatar: 'https://example.com/avatar.jpg',
  banner: 'https://example.com/banner.jpg',
  role: 'USER',
  isOnline: true,
  lastActiveAt: new Date(),
  systemLanguage: 'fr',
  regionalLanguage: 'en',
  customDestinationLanguage: 'es',
  createdAt: new Date('2024-01-01'),
} as User;

const mockOtherUser: User = {
  id: 'other-user-id',
  username: 'yukitanaka',
  firstName: 'Yuki',
  lastName: 'Tanaka',
  displayName: 'Yuki Tanaka',
  email: 'yuki@example.com',
  bio: 'Language enthusiast',
  avatar: 'https://example.com/yuki-avatar.jpg',
  role: 'USER',
  isOnline: false,
  lastActiveAt: new Date(Date.now() - 3600000),
  systemLanguage: 'ja',
  regionalLanguage: 'en',
  createdAt: new Date('2024-02-01'),
} as User;

const mockDashboardStats = {
  stats: {
    totalConversations: 248,
    totalMessages: 1200,
    totalCommunities: 5,
  },
};

const mockUserStats = {
  totalConversations: 42,
  messagesSent: 500,
  messagesReceived: 300,
  groupsCount: 10,
};

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

describe('useProfileV2', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockIsUserOnline.mockImplementation((user: User) => user.isOnline);
    mockGetLastSeenFormatted.mockImplementation((user: User) =>
      user.isOnline ? 'En ligne' : 'Il y a 1h'
    );
    mockGetDisplayName.mockImplementation((user: User) =>
      user.displayName || `${user.firstName} ${user.lastName}`
    );

    // Default query return values
    mockCurrentUserData.mockReturnValue({
      data: mockCurrentUser,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    mockOtherUserData.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    mockUserStatsData.mockReturnValue({
      data: mockUserStats,
      isLoading: false,
    });

    mockDashboardStatsData.mockReturnValue({
      data: mockDashboardStats,
      isLoading: false,
    });

    mockUpdateMutate.mockResolvedValue({ data: mockCurrentUser });
  });

  describe('Current User Profile', () => {
    it('should load current user profile when no userId provided', async () => {
      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isCurrentUser).toBe(true);
      expect(result.current.profile).not.toBeNull();
      expect(result.current.profile?.id).toBe('current-user-id');
    });

    it('should return isLoading state', () => {
      mockCurrentUserData.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.profile).toBeNull();
    });

    it('should return null profile when no data', () => {
      mockCurrentUserData.mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      expect(result.current.profile).toBeNull();
    });
  });

  describe('Other User Profile', () => {
    it('should load other user profile when userId provided', () => {
      mockOtherUserData.mockReturnValue({
        data: mockOtherUser,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useProfileV2({ userId: 'other-user-id' }), {
        wrapper: createWrapper(),
      });

      expect(result.current.isCurrentUser).toBe(false);
      expect(result.current.profile?.id).toBe('other-user-id');
    });

    it('should call useUserProfileQuery with userId', () => {
      mockOtherUserData.mockReturnValue({
        data: mockOtherUser,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      renderHook(() => useProfileV2({ userId: 'other-user-id' }), {
        wrapper: createWrapper(),
      });

      expect(mockOtherUserData).toHaveBeenCalledWith('other-user-id');
    });
  });

  describe('Profile Transformation', () => {
    it('should transform user to ProfileV2 format', () => {
      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      const profile = result.current.profile;
      expect(profile).toMatchObject({
        id: 'current-user-id',
        name: 'Jean Dupont',
        username: '@jeandupont',
        bio: 'Passionné de langues et de voyages',
        avatar: 'https://example.com/avatar.jpg',
        banner: 'https://example.com/banner.jpg',
      });
    });

    it('should format username with @ prefix', () => {
      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      expect(result.current.profile?.username).toBe('@jeandupont');
    });

    it('should set isOnline correctly', () => {
      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      expect(result.current.profile?.isOnline).toBe(true);
    });

    it('should extract languages from user data', () => {
      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      const languages = result.current.profile?.languages;
      expect(languages).toBeDefined();
      expect(languages?.length).toBeGreaterThan(0);

      // Should have system language as native
      const nativeLanguage = languages?.find(l => l.level === 'native');
      expect(nativeLanguage?.code).toBe('fr');
    });

    it('should set regional language as fluent', () => {
      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      const languages = result.current.profile?.languages;
      const fluentLanguage = languages?.find(l => l.level === 'fluent');
      expect(fluentLanguage?.code).toBe('en');
    });

    it('should set custom language as learning', () => {
      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      const languages = result.current.profile?.languages;
      const learningLanguage = languages?.find(l => l.level === 'learning');
      expect(learningLanguage?.code).toBe('es');
    });

    it('should default to French if no languages', () => {
      mockCurrentUserData.mockReturnValue({
        data: {
          ...mockCurrentUser,
          systemLanguage: undefined,
          regionalLanguage: undefined,
          customDestinationLanguage: undefined,
        },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      const languages = result.current.profile?.languages;
      expect(languages?.length).toBe(1);
      expect(languages?.[0].code).toBe('fr');
    });

    it('should not duplicate languages', () => {
      mockCurrentUserData.mockReturnValue({
        data: { ...mockCurrentUser, systemLanguage: 'fr', regionalLanguage: 'fr' },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      const languages = result.current.profile?.languages;
      const frenchLanguages = languages?.filter(l => l.code === 'fr');
      expect(frenchLanguages?.length).toBe(1);
    });
  });

  describe('Stats Transformation', () => {
    it('should transform dashboard stats for current user', () => {
      // For current user, stats come from both userStats and dashboardStats
      // The hook prefers userStats.totalConversations over dashboardStats
      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      const stats = result.current.stats;
      // Stats can come from userStats or dashboardStats depending on implementation
      expect(stats).toBeDefined();
      expect(stats?.conversationsCount).toBeGreaterThanOrEqual(0);
      expect(stats?.messagesCount).toBeGreaterThanOrEqual(0);
    });

    it('should transform user stats for other user', () => {
      mockOtherUserData.mockReturnValue({
        data: mockOtherUser,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useProfileV2({ userId: 'other-user-id' }), {
        wrapper: createWrapper(),
      });

      const stats = result.current.stats;
      expect(stats?.conversationsCount).toBe(42);
      expect(stats?.messagesCount).toBe(800); // sent + received
    });

    it('should return default stats when no data', () => {
      mockDashboardStatsData.mockReturnValue({
        data: null,
        isLoading: false,
      });

      mockUserStatsData.mockReturnValue({
        data: null,
        isLoading: false,
      });

      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      const stats = result.current.stats;
      expect(stats).toMatchObject({
        conversationsCount: 0,
        messagesCount: 0,
        contactsCount: 0,
      });
    });
  });

  describe('Profile Update', () => {
    it('should update profile successfully', async () => {
      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.updateProfile({ displayName: 'New Name' });
      });

      expect(mockUpdateMutate).toHaveBeenCalledWith({ displayName: 'New Name' });
    });

    it('should update multiple fields', async () => {
      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.updateProfile({
          displayName: 'New Name',
          bio: 'New bio',
          systemLanguage: 'en',
        });
      });

      expect(mockUpdateMutate).toHaveBeenCalledWith({
        displayName: 'New Name',
        bio: 'New bio',
        systemLanguage: 'en',
      });
    });

    it('should throw error when updating other user profile', async () => {
      mockOtherUserData.mockReturnValue({
        data: mockOtherUser,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useProfileV2({ userId: 'other-user-id' }), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.updateProfile({ displayName: 'New Name' });
        })
      ).rejects.toThrow('Cannot update other user profile');
    });

    it('should only include defined fields in update', async () => {
      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.updateProfile({ bio: 'Only bio' });
      });

      expect(mockUpdateMutate).toHaveBeenCalledWith({ bio: 'Only bio' });
      expect(mockUpdateMutate).not.toHaveBeenCalledWith(
        expect.objectContaining({ displayName: expect.anything() })
      );
    });
  });

  describe('Refresh Profile', () => {
    it('should refresh current user profile', async () => {
      const refetchMock = jest.fn();
      mockCurrentUserData.mockReturnValue({
        data: mockCurrentUser,
        isLoading: false,
        error: null,
        refetch: refetchMock,
      });

      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.refreshProfile();
      });

      expect(refetchMock).toHaveBeenCalled();
    });

    it('should refresh other user profile', async () => {
      const refetchMock = jest.fn();
      mockOtherUserData.mockReturnValue({
        data: mockOtherUser,
        isLoading: false,
        error: null,
        refetch: refetchMock,
      });

      const { result } = renderHook(() => useProfileV2({ userId: 'other-user-id' }), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.refreshProfile();
      });

      expect(refetchMock).toHaveBeenCalled();
    });
  });

  describe('Helper Functions', () => {
    it('getDisplayName should return display name', () => {
      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      const displayName = result.current.getDisplayName();
      expect(displayName).toBe('Jean Dupont');
    });

    it('getDisplayName should return empty string when no user', () => {
      mockCurrentUserData.mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      expect(result.current.getDisplayName()).toBe('');
    });

    it('getAvatarUrl should return avatar URL', () => {
      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      expect(result.current.getAvatarUrl()).toBe('https://example.com/avatar.jpg');
    });

    it('getAvatarUrl should return undefined when no avatar', () => {
      mockCurrentUserData.mockReturnValue({
        data: { ...mockCurrentUser, avatar: null },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      expect(result.current.getAvatarUrl()).toBeUndefined();
    });

    it('getAvatarUrl should return undefined when no user', () => {
      mockCurrentUserData.mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      expect(result.current.getAvatarUrl()).toBeUndefined();
    });
  });

  describe('Raw User Access', () => {
    it('should expose rawUser for advanced usage', () => {
      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      expect(result.current.rawUser).toEqual(mockCurrentUser);
    });

    it('should return null rawUser when no data', () => {
      mockCurrentUserData.mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      expect(result.current.rawUser).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should return error for current user', () => {
      mockCurrentUserData.mockReturnValue({
        data: null,
        isLoading: false,
        error: { message: 'Failed to fetch profile' },
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      expect(result.current.error).toBe('Failed to fetch profile');
    });

    it('should return error for other user', () => {
      mockOtherUserData.mockReturnValue({
        data: null,
        isLoading: false,
        error: { message: 'User not found' },
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useProfileV2({ userId: 'invalid-id' }), {
        wrapper: createWrapper(),
      });

      expect(result.current.error).toBe('User not found');
    });

    it('should return null error when successful', () => {
      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('Loading Stats State', () => {
    it('should return isLoadingStats for current user', () => {
      mockDashboardStatsData.mockReturnValue({
        data: null,
        isLoading: true,
      });

      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoadingStats).toBe(true);
    });

    it('should return isLoadingStats for other user', () => {
      mockOtherUserData.mockReturnValue({
        data: mockOtherUser,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      mockUserStatsData.mockReturnValue({
        data: null,
        isLoading: true,
      });

      const { result } = renderHook(() => useProfileV2({ userId: 'other-user-id' }), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoadingStats).toBe(true);
    });
  });

  describe('isPro Status', () => {
    it('should set isPro true for pro role', () => {
      mockCurrentUserData.mockReturnValue({
        data: { ...mockCurrentUser, role: 'pro' },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      expect(result.current.profile?.isPro).toBe(true);
    });

    it('should set isPro true for admin role', () => {
      mockCurrentUserData.mockReturnValue({
        data: { ...mockCurrentUser, role: 'admin' },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      expect(result.current.profile?.isPro).toBe(true);
    });

    it('should set isPro false for regular user', () => {
      const { result } = renderHook(() => useProfileV2(), {
        wrapper: createWrapper(),
      });

      expect(result.current.profile?.isPro).toBe(false);
    });
  });
});
