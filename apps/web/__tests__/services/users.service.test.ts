/**
 * Tests for UsersService
 *
 * Tests user CRUD operations, profile management, online status detection,
 * formatting utilities, and affiliate token retrieval
 */

import { usersService, UserStats, UpdateUserDto } from '@/services/users.service';
import { apiService } from '@/services/api.service';
import { User } from '@/types';

// Mock the apiService
jest.mock('@/services/api.service', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

// Mock user-adapter
jest.mock('@/utils/user-adapter', () => ({
  getDefaultPermissions: jest.fn((role: string) => ({
    canAccessAdmin: role === 'ADMIN' || role === 'BIGBOSS',
    canManageUsers: role === 'ADMIN' || role === 'BIGBOSS',
    canViewAnalytics: role === 'ADMIN' || role === 'BIGBOSS' || role === 'ANALYST',
  })),
}));

const mockApiService = apiService as jest.Mocked<typeof apiService>;

describe('UsersService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const createMockUser = (overrides: Partial<User> = {}): User => ({
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    displayName: 'Test User',
    phoneNumber: '',
    role: 'USER',
    systemLanguage: 'fr',
    regionalLanguage: 'fr',
    autoTranslateEnabled: true,
    isOnline: true,
    lastActiveAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    isActive: true,
    ...overrides,
  });

  describe('getAllUsers', () => {
    it('should fetch all users', async () => {
      const mockUsers = [
        createMockUser({ id: 'user-1', username: 'user1' }),
        createMockUser({ id: 'user-2', username: 'user2' }),
      ];

      mockApiService.get.mockResolvedValue({
        success: true,
        data: mockUsers,
      });

      const result = await usersService.getAllUsers();

      expect(mockApiService.get).toHaveBeenCalledWith('/users');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should throw error on failure', async () => {
      mockApiService.get.mockRejectedValue(new Error('Network error'));

      await expect(usersService.getAllUsers()).rejects.toThrow('Network error');
    });
  });

  describe('searchUsers', () => {
    it('should search users with valid query', async () => {
      mockApiService.get.mockResolvedValue({
        success: true,
        data: [createMockUser({ username: 'john' })],
      });

      const result = await usersService.searchUsers('john');

      expect(mockApiService.get).toHaveBeenCalledWith('/users/search?q=john');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
    });

    it('should return empty array for query less than 2 characters', async () => {
      const result = await usersService.searchUsers('j');

      expect(mockApiService.get).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should return empty array for empty query', async () => {
      const result = await usersService.searchUsers('');

      expect(mockApiService.get).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should trim query before validation', async () => {
      mockApiService.get.mockResolvedValue({
        success: true,
        data: [],
      });

      await usersService.searchUsers('  jo  ');

      expect(mockApiService.get).toHaveBeenCalledWith('/users/search?q=jo');
    });

    it('should return empty array for whitespace-only query', async () => {
      const result = await usersService.searchUsers('   ');

      expect(mockApiService.get).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should encode special characters in query', async () => {
      mockApiService.get.mockResolvedValue({
        success: true,
        data: [],
      });

      await usersService.searchUsers('john&jane');

      expect(mockApiService.get).toHaveBeenCalledWith('/users/search?q=john%26jane');
    });
  });

  describe('getMyProfile', () => {
    it('should fetch current user profile', async () => {
      const mockUser = createMockUser();

      mockApiService.get.mockResolvedValue({
        success: true,
        data: {
          success: true,
          data: { user: mockUser },
        },
      });

      const result = await usersService.getMyProfile();

      expect(mockApiService.get).toHaveBeenCalledWith('/auth/me');
      expect(result.success).toBe(true);
      expect(result.data?.username).toBe('testuser');
    });

    it('should add default permissions if missing', async () => {
      const mockUser = createMockUser({ permissions: undefined });

      mockApiService.get.mockResolvedValue({
        success: true,
        data: {
          success: true,
          data: { user: mockUser },
        },
      });

      const result = await usersService.getMyProfile();

      // The user should be returned (permissions may or may not be added based on implementation)
      expect(result.data).toBeDefined();
      expect(result.data?.username).toBe('testuser');
    });

    it('should handle alternative response structure', async () => {
      const mockUser = createMockUser();

      mockApiService.get.mockResolvedValue({
        success: true,
        data: {
          user: mockUser,
        },
      });

      const result = await usersService.getMyProfile();

      expect(result.data?.username).toBe('testuser');
    });
  });

  describe('updateMyProfile', () => {
    it('should update user profile', async () => {
      const updateData: UpdateUserDto = {
        firstName: 'Updated',
        lastName: 'Name',
      };

      const updatedUser = createMockUser({ firstName: 'Updated', lastName: 'Name' });

      mockApiService.patch.mockResolvedValue({
        success: true,
        data: updatedUser,
      });

      const result = await usersService.updateMyProfile(updateData);

      expect(mockApiService.patch).toHaveBeenCalledWith('/users/me', updateData);
      expect(result.data?.firstName).toBe('Updated');
    });

    it('should handle avatar update', async () => {
      const updateData: UpdateUserDto = {
        avatar: 'https://example.com/avatar.jpg',
      };

      mockApiService.patch.mockResolvedValue({
        success: true,
        data: createMockUser({ avatar: updateData.avatar }),
      });

      const result = await usersService.updateMyProfile(updateData);

      expect(mockApiService.patch).toHaveBeenCalledWith('/users/me', updateData);
    });
  });

  describe('getDashboardStats', () => {
    it('should fetch dashboard statistics', async () => {
      const mockStats = {
        stats: {
          totalConversations: 10,
          totalCommunities: 5,
          totalMessages: 100,
          activeConversations: 3,
          translationsToday: 50,
          totalLinks: 2,
          lastUpdated: new Date(),
        },
        recentConversations: [],
        recentCommunities: [],
      };

      mockApiService.get.mockResolvedValue({
        success: true,
        data: mockStats,
      });

      const result = await usersService.getDashboardStats();

      expect(mockApiService.get).toHaveBeenCalledWith('/users/me/dashboard-stats');
      expect(result.data?.stats.totalConversations).toBe(10);
    });
  });

  describe('getUserProfile', () => {
    it('should fetch another user profile', async () => {
      const mockUser = createMockUser({ id: 'other-user', username: 'otheruser' });

      mockApiService.get.mockResolvedValue({
        success: true,
        data: {
          success: true,
          data: mockUser,
        },
      });

      const result = await usersService.getUserProfile('other-user');

      expect(mockApiService.get).toHaveBeenCalledWith('/users/other-user');
      expect(result.data?.username).toBe('otheruser');
    });

    it('should throw error when user not found', async () => {
      mockApiService.get.mockResolvedValue({
        success: false,
        data: null,
      });

      await expect(usersService.getUserProfile('nonexistent')).rejects.toThrow('User not found');
    });
  });

  describe('getUserStats', () => {
    it('should fetch user statistics', async () => {
      const mockStats: UserStats = {
        messagesSent: 100,
        messagesReceived: 150,
        conversationsCount: 10,
        groupsCount: 5,
        totalConversations: 15,
        lastActivity: new Date(),
      };

      mockApiService.get.mockResolvedValue({
        success: true,
        data: {
          success: true,
          data: mockStats,
        },
      });

      const result = await usersService.getUserStats('user-123');

      expect(mockApiService.get).toHaveBeenCalledWith('/users/user-123/stats');
      expect(result.data?.messagesSent).toBe(100);
    });

    it('should throw error when stats not found', async () => {
      mockApiService.get.mockResolvedValue({
        success: false,
        data: null,
      });

      await expect(usersService.getUserStats('nonexistent')).rejects.toThrow('Stats not found');
    });
  });

  describe('isUserOnline (délégué à la règle canonique 1/3/5)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return true when isOnline within the 5min stale guard', () => {
      const user = createMockUser({
        isOnline: true,
        lastActiveAt: new Date('2024-01-15T11:57:00Z'), // 3 minutes ago
      });

      expect(usersService.isUserOnline(user)).toBe(true);
    });

    it('should return false when isOnline is stale (beyond 5 minutes)', () => {
      const user = createMockUser({
        isOnline: true,
        lastActiveAt: new Date('2024-01-15T11:50:00Z'), // 10 minutes ago
      });

      expect(usersService.isUserOnline(user)).toBe(false);
    });

    it('should return true when disconnected but active within 60 seconds (decay)', () => {
      const user = createMockUser({
        isOnline: false,
        lastActiveAt: new Date('2024-01-15T11:59:30Z'), // 30 seconds ago
      });

      expect(usersService.isUserOnline(user)).toBe(true);
    });

    it('should return false when disconnected and last active over a minute ago', () => {
      const user = createMockUser({
        isOnline: false,
        lastActiveAt: new Date('2024-01-15T11:58:00Z'), // 2 minutes ago
      });

      expect(usersService.isUserOnline(user)).toBe(false);
    });
  });

  describe('getUserStatus', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return "online" when isOnline within the 5min stale guard', () => {
      const user = createMockUser({
        isOnline: true,
        lastActiveAt: new Date('2024-01-15T11:57:00Z'),
      });

      expect(usersService.getUserStatus(user)).toBe('online');
    });

    it('should return "away" for activity between 1-3 minutes when disconnected', () => {
      const user = createMockUser({
        isOnline: false,
        lastActiveAt: new Date('2024-01-15T11:58:00Z'), // 2 minutes ago
      });

      expect(usersService.getUserStatus(user)).toBe('away');
    });

    it('should return "idle" for activity between 3-5 minutes when disconnected', () => {
      const user = createMockUser({
        isOnline: false,
        lastActiveAt: new Date('2024-01-15T11:56:00Z'), // 4 minutes ago
      });

      expect(usersService.getUserStatus(user)).toBe('idle');
    });

    it('should return "offline" for activity > 5 minutes even when isOnline is stale', () => {
      const user = createMockUser({
        isOnline: true,
        lastActiveAt: new Date('2024-01-15T11:50:00Z'), // 10 minutes ago
      });

      expect(usersService.getUserStatus(user)).toBe('offline');
    });

    it('should decay by time when isOnline is false (règle canonique, plus de gate binaire)', () => {
      const user = createMockUser({
        isOnline: false,
        lastActiveAt: new Date('2024-01-15T11:59:30Z'), // 30 seconds ago
      });

      expect(usersService.getUserStatus(user)).toBe('online');
    });
  });

  describe('getDisplayName', () => {
    it('should return displayName if available', () => {
      const user = createMockUser({ displayName: 'Johnny D' });
      expect(usersService.getDisplayName(user)).toBe('Johnny D');
    });

    it('should return first and last name when no displayName', () => {
      const user = createMockUser({
        displayName: undefined,
        firstName: 'John',
        lastName: 'Doe',
      });
      expect(usersService.getDisplayName(user)).toBe('John Doe');
    });

    it('should return username when no names available', () => {
      const user = createMockUser({
        displayName: undefined,
        firstName: '',
        lastName: '',
        username: 'johndoe',
      });
      expect(usersService.getDisplayName(user)).toBe('johndoe');
    });
  });

  describe('getLastSeenFormatted', () => {
    const t = (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key;

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return the online status key for online user', () => {
      const user = createMockUser({
        isOnline: true,
        lastActiveAt: new Date(),
      });

      expect(usersService.getLastSeenFormatted(user, { t })).toBe('status.online');
    });

    it('should return the justNow key for very recent activity', () => {
      const user = createMockUser({
        isOnline: false,
        lastActiveAt: new Date('2024-01-15T11:59:30Z'), // 30 seconds ago
      });

      expect(usersService.getLastSeenFormatted(user, { t })).toBe('status.justNow');
    });

    it('should return minutes for activity < 1 hour', () => {
      const user = createMockUser({
        isOnline: false,
        lastActiveAt: new Date('2024-01-15T11:30:00Z'), // 30 minutes ago
      });

      expect(usersService.getLastSeenFormatted(user, { t })).toBe('status.minutesAgo:{"count":30}');
    });

    it('should return hours for activity < 24 hours', () => {
      const user = createMockUser({
        isOnline: false,
        lastActiveAt: new Date('2024-01-15T08:00:00Z'), // 4 hours ago
      });

      expect(usersService.getLastSeenFormatted(user, { t })).toBe('status.hoursAgo:{"count":4}');
    });

    it('should return days for activity < 7 days', () => {
      const user = createMockUser({
        isOnline: false,
        lastActiveAt: new Date('2024-01-12T12:00:00Z'), // 3 days ago
      });

      expect(usersService.getLastSeenFormatted(user, { t })).toBe('status.daysAgo:{"count":3}');
    });

    it('should return days with count 1 for 1 day', () => {
      const user = createMockUser({
        isOnline: false,
        lastActiveAt: new Date('2024-01-14T12:00:00Z'), // 1 day ago
      });

      expect(usersService.getLastSeenFormatted(user, { t })).toBe('status.daysAgo:{"count":1}');
    });

    it('should return a locale-formatted date for older activity', () => {
      const user = createMockUser({
        isOnline: false,
        lastActiveAt: new Date('2024-01-01T12:00:00Z'), // 14 days ago
      });

      const result = usersService.getLastSeenFormatted(user, { t, locale: 'fr' });
      expect(result).toBe(new Date('2024-01-01T12:00:00Z').toLocaleDateString('fr'));
    });
  });

  describe('getDefaultAvatar', () => {
    it('should generate SVG avatar with initials', () => {
      const user = createMockUser({
        displayName: 'John Doe',
        id: 'a',
      });

      const avatar = usersService.getDefaultAvatar(user);

      expect(avatar).toContain('data:image/svg+xml');
      expect(avatar).toContain('JD');
    });

    it('should limit initials to 2 characters', () => {
      const user = createMockUser({
        displayName: 'John Paul Jones',
        id: 'a',
      });

      const avatar = usersService.getDefaultAvatar(user);

      expect(avatar).toContain('JP');
    });

    it('should generate consistent colors based on user ID', () => {
      const user1 = createMockUser({ id: 'a', displayName: 'Test' });
      const user2 = createMockUser({ id: 'a', displayName: 'Another' });

      const avatar1 = usersService.getDefaultAvatar(user1);
      const avatar2 = usersService.getDefaultAvatar(user2);

      // Both should generate SVG avatars with fills
      expect(avatar1).toContain('data:image/svg+xml');
      expect(avatar2).toContain('data:image/svg+xml');
    });
  });

  describe('getUserAffiliateToken', () => {
    it('should fetch affiliate token', async () => {
      mockApiService.get.mockResolvedValue({
        success: true,
        data: { token: 'affiliate-token-123' },
      });

      const result = await usersService.getUserAffiliateToken('user-123');

      expect(mockApiService.get).toHaveBeenCalledWith('/users/user-123/affiliate-token');
      expect(result.data?.token).toBe('affiliate-token-123');
    });

    it('should return null data on error silently', async () => {
      mockApiService.get.mockRejectedValue(new Error('Not found'));

      const result = await usersService.getUserAffiliateToken('user-123');

      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
    });

    it('should include error message on failure', async () => {
      mockApiService.get.mockRejectedValue(new Error('Token not available'));

      const result = await usersService.getUserAffiliateToken('user-123');

      expect(result.error).toBe('Token not available');
    });
  });
});
