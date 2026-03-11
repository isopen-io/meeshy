/**
 * Tests for ParticipantsService
 *
 * Tests participant retrieval with caching, search, pagination,
 * add/remove/role operations, and anonymous participant mapping.
 */

import { participantsService } from '@/services/conversations/participants.service';
import { apiService } from '@/services/api.service';
import { cacheService } from '@/services/conversations/cache.service';

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
  },
}));

jest.mock('@/services/conversations/cache.service', () => ({
  cacheService: {
    getParticipantsFromCache: jest.fn(),
    setParticipantsCache: jest.fn(),
    invalidateParticipantsCache: jest.fn(),
  },
}));

const mockApi = apiService as jest.Mocked<typeof apiService>;
const mockCache = cacheService as jest.Mocked<typeof cacheService>;

const createMockUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-123',
  username: 'testuser',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  displayName: 'Test User',
  phoneNumber: '',
  role: 'USER',
  systemLanguage: 'en',
  regionalLanguage: 'en',
  autoTranslateEnabled: true,
  translateToSystemLanguage: true,
  translateToRegionalLanguage: false,
  useCustomDestination: false,
  isOnline: true,
  lastActiveAt: new Date().toISOString(),
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  isActive: true,
  ...overrides,
});

describe('ParticipantsService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getParticipants', () => {
    const conversationId = 'conv-abc';

    it('should return cached data when available', async () => {
      const cached = [createMockUser()];
      mockCache.getParticipantsFromCache.mockReturnValue(cached as any);

      const result = await participantsService.getParticipants(conversationId);

      expect(result).toBe(cached);
      expect(mockApi.get).not.toHaveBeenCalled();
    });

    it('should call API when cache miss and cache the result', async () => {
      mockCache.getParticipantsFromCache.mockReturnValue(null as any);
      const participants = [createMockUser({ id: 'u1' }), createMockUser({ id: 'u2' })];
      mockApi.get.mockResolvedValue({
        data: { success: true, data: participants },
      } as any);

      const result = await participantsService.getParticipants(conversationId);

      expect(mockApi.get).toHaveBeenCalledWith(
        `/conversations/${conversationId}/participants`,
        {}
      );
      expect(result).toEqual(participants);
      expect(mockCache.setParticipantsCache).toHaveBeenCalledWith(
        expect.any(String),
        participants
      );
    });

    it('should build correct query params for onlineOnly filter', async () => {
      mockCache.getParticipantsFromCache.mockReturnValue(null as any);
      mockApi.get.mockResolvedValue({ data: { data: [] } } as any);

      await participantsService.getParticipants(conversationId, { onlineOnly: true });

      expect(mockApi.get).toHaveBeenCalledWith(
        `/conversations/${conversationId}/participants`,
        expect.objectContaining({ onlineOnly: 'true' })
      );
    });

    it('should build correct query params for role filter', async () => {
      mockCache.getParticipantsFromCache.mockReturnValue(null as any);
      mockApi.get.mockResolvedValue({ data: { data: [] } } as any);

      await participantsService.getParticipants(conversationId, { role: 'ADMIN' });

      expect(mockApi.get).toHaveBeenCalledWith(
        `/conversations/${conversationId}/participants`,
        expect.objectContaining({ role: 'ADMIN' })
      );
    });

    it('should build correct query params for search filter', async () => {
      mockCache.getParticipantsFromCache.mockReturnValue(null as any);
      mockApi.get.mockResolvedValue({ data: { data: [] } } as any);

      await participantsService.getParticipants(conversationId, { search: 'john' });

      expect(mockApi.get).toHaveBeenCalledWith(
        `/conversations/${conversationId}/participants`,
        expect.objectContaining({ search: 'john' })
      );
    });

    it('should build correct query params for limit filter', async () => {
      mockCache.getParticipantsFromCache.mockReturnValue(null as any);
      mockApi.get.mockResolvedValue({ data: { data: [] } } as any);

      await participantsService.getParticipants(conversationId, { limit: 25 });

      expect(mockApi.get).toHaveBeenCalledWith(
        `/conversations/${conversationId}/participants`,
        expect.objectContaining({ limit: '25' })
      );
    });

    it('should build correct query params for cursor filter', async () => {
      mockCache.getParticipantsFromCache.mockReturnValue(null as any);
      mockApi.get.mockResolvedValue({ data: { data: [] } } as any);

      await participantsService.getParticipants(conversationId, { cursor: 'abc123' });

      expect(mockApi.get).toHaveBeenCalledWith(
        `/conversations/${conversationId}/participants`,
        expect.objectContaining({ cursor: 'abc123' })
      );
    });

    it('should build correct query params with all filters combined', async () => {
      mockCache.getParticipantsFromCache.mockReturnValue(null as any);
      mockApi.get.mockResolvedValue({ data: { data: [] } } as any);

      await participantsService.getParticipants(conversationId, {
        onlineOnly: true,
        role: 'MODERATOR',
        search: 'test',
        limit: 10,
        cursor: 'xyz',
      });

      expect(mockApi.get).toHaveBeenCalledWith(
        `/conversations/${conversationId}/participants`,
        {
          onlineOnly: 'true',
          role: 'MODERATOR',
          search: 'test',
          limit: '10',
          cursor: 'xyz',
        }
      );
    });

    it('should not add params for undefined filters', async () => {
      mockCache.getParticipantsFromCache.mockReturnValue(null as any);
      mockApi.get.mockResolvedValue({ data: { data: [] } } as any);

      await participantsService.getParticipants(conversationId, {});

      expect(mockApi.get).toHaveBeenCalledWith(
        `/conversations/${conversationId}/participants`,
        {}
      );
    });

    it('should not add onlineOnly param when false', async () => {
      mockCache.getParticipantsFromCache.mockReturnValue(null as any);
      mockApi.get.mockResolvedValue({ data: { data: [] } } as any);

      await participantsService.getParticipants(conversationId, { onlineOnly: false });

      const calledParams = mockApi.get.mock.calls[0][1];
      expect(calledParams).not.toHaveProperty('onlineOnly');
    });

    it('should use conversationId and stringified params as cache key', async () => {
      mockCache.getParticipantsFromCache.mockReturnValue(null as any);
      mockApi.get.mockResolvedValue({ data: { data: [] } } as any);

      await participantsService.getParticipants(conversationId, { role: 'ADMIN' });

      const expectedKey = `${conversationId}-${JSON.stringify({ role: 'ADMIN' })}`;
      expect(mockCache.getParticipantsFromCache).toHaveBeenCalledWith(expectedKey);
      expect(mockCache.setParticipantsCache).toHaveBeenCalledWith(expectedKey, []);
    });

    it('should return empty array on API error', async () => {
      mockCache.getParticipantsFromCache.mockReturnValue(null as any);
      mockApi.get.mockRejectedValue(new Error('Network error'));

      const result = await participantsService.getParticipants(conversationId);

      expect(result).toEqual([]);
    });

    it('should log error on failure', async () => {
      mockCache.getParticipantsFromCache.mockReturnValue(null as any);
      const error = new Error('Server error');
      mockApi.get.mockRejectedValue(error);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await participantsService.getParticipants(conversationId);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ParticipantsService]'),
        error
      );
      consoleSpy.mockRestore();
    });

    it('should return empty array when response.data.data is null', async () => {
      mockCache.getParticipantsFromCache.mockReturnValue(null as any);
      mockApi.get.mockResolvedValue({ data: { success: true, data: null } } as any);

      const result = await participantsService.getParticipants(conversationId);

      expect(result).toEqual([]);
    });

    it('should call API without filters when none provided', async () => {
      mockCache.getParticipantsFromCache.mockReturnValue(null as any);
      mockApi.get.mockResolvedValue({ data: { data: [] } } as any);

      await participantsService.getParticipants(conversationId);

      expect(mockApi.get).toHaveBeenCalledWith(
        `/conversations/${conversationId}/participants`,
        {}
      );
    });
  });

  describe('searchParticipants', () => {
    const conversationId = 'conv-search';

    it('should return empty array for empty query', async () => {
      const result = await participantsService.searchParticipants(conversationId, '');

      expect(result).toEqual([]);
      expect(mockApi.get).not.toHaveBeenCalled();
    });

    it('should return empty array for whitespace-only query', async () => {
      const result = await participantsService.searchParticipants(conversationId, '   ');

      expect(result).toEqual([]);
      expect(mockApi.get).not.toHaveBeenCalled();
    });

    it('should trim query before sending', async () => {
      mockApi.get.mockResolvedValue({ data: { data: [] } } as any);

      await participantsService.searchParticipants(conversationId, '  john  ');

      expect(mockApi.get).toHaveBeenCalledWith(
        `/conversations/${conversationId}/participants`,
        { search: 'john', limit: '50' }
      );
    });

    it('should use default limit of 50', async () => {
      mockApi.get.mockResolvedValue({ data: { data: [] } } as any);

      await participantsService.searchParticipants(conversationId, 'test');

      expect(mockApi.get).toHaveBeenCalledWith(
        `/conversations/${conversationId}/participants`,
        { search: 'test', limit: '50' }
      );
    });

    it('should pass custom limit parameter', async () => {
      mockApi.get.mockResolvedValue({ data: { data: [] } } as any);

      await participantsService.searchParticipants(conversationId, 'test', 20);

      expect(mockApi.get).toHaveBeenCalledWith(
        `/conversations/${conversationId}/participants`,
        { search: 'test', limit: '20' }
      );
    });

    it('should return participants from API response', async () => {
      const participants = [createMockUser({ id: 'found-1' })];
      mockApi.get.mockResolvedValue({ data: { data: participants } } as any);

      const result = await participantsService.searchParticipants(conversationId, 'found');

      expect(result).toEqual(participants);
    });

    it('should return empty array on API error', async () => {
      mockApi.get.mockRejectedValue(new Error('Search failed'));

      const result = await participantsService.searchParticipants(conversationId, 'test');

      expect(result).toEqual([]);
    });

    it('should return empty array when response data is null', async () => {
      mockApi.get.mockResolvedValue({ data: { data: null } } as any);

      const result = await participantsService.searchParticipants(conversationId, 'test');

      expect(result).toEqual([]);
    });
  });

  describe('getAllParticipants', () => {
    const conversationId = 'conv-all';

    it('should load a single page of participants', async () => {
      const users = [createMockUser({ id: 'u1' }), createMockUser({ id: 'u2' })];
      mockApi.get.mockResolvedValue({
        data: {
          data: users,
          pagination: { hasMore: false, nextCursor: null },
        },
      } as any);

      const result = await participantsService.getAllParticipants(conversationId);

      expect(mockApi.get).toHaveBeenCalledTimes(1);
      expect(mockApi.get).toHaveBeenCalledWith(
        `/conversations/${conversationId}/participants`,
        { limit: '100' }
      );
      expect(result.authenticatedParticipants).toEqual(users);
      expect(result.anonymousParticipants).toEqual([]);
    });

    it('should paginate through multiple pages', async () => {
      const page1Users = [createMockUser({ id: 'p1-u1' })];
      const page2Users = [createMockUser({ id: 'p2-u1' })];

      mockApi.get
        .mockResolvedValueOnce({
          data: {
            data: page1Users,
            pagination: { hasMore: true, nextCursor: 'cursor-2' },
          },
        } as any)
        .mockResolvedValueOnce({
          data: {
            data: page2Users,
            pagination: { hasMore: false, nextCursor: null },
          },
        } as any);

      const result = await participantsService.getAllParticipants(conversationId);

      expect(mockApi.get).toHaveBeenCalledTimes(2);
      expect(mockApi.get).toHaveBeenNthCalledWith(1,
        `/conversations/${conversationId}/participants`,
        { limit: '100' }
      );
      expect(mockApi.get).toHaveBeenNthCalledWith(2,
        `/conversations/${conversationId}/participants`,
        { limit: '100', cursor: 'cursor-2' }
      );
      expect(result.authenticatedParticipants).toHaveLength(2);
    });

    it('should stop pagination when hasMore is false', async () => {
      mockApi.get.mockResolvedValue({
        data: {
          data: [createMockUser()],
          pagination: { hasMore: false, nextCursor: null },
        },
      } as any);

      await participantsService.getAllParticipants(conversationId);

      expect(mockApi.get).toHaveBeenCalledTimes(1);
    });

    it('should respect 1000 participant safety limit', async () => {
      const largePage = Array.from({ length: 100 }, (_, i) =>
        createMockUser({ id: `user-${i}` })
      );

      mockApi.get.mockResolvedValue({
        data: {
          data: largePage,
          pagination: { hasMore: true, nextCursor: 'next' },
        },
      } as any);

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await participantsService.getAllParticipants(conversationId);

      expect(mockApi.get).toHaveBeenCalledTimes(10);
      const total =
        result.authenticatedParticipants.length + result.anonymousParticipants.length;
      expect(total).toBe(1000);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('1000 participants')
      );
      consoleSpy.mockRestore();
    });

    it('should correctly split authenticated vs anonymous participants', async () => {
      const authUser = createMockUser({ id: 'auth-1', isAnonymous: false });
      const anonUser = createMockUser({
        id: 'anon-1',
        isAnonymous: true,
        systemLanguage: 'es',
        createdAt: '2026-02-15T10:00:00.000Z',
        canSendMessages: true,
        canSendFiles: false,
        canSendImages: true,
      });

      mockApi.get.mockResolvedValue({
        data: {
          data: [authUser, anonUser],
          pagination: { hasMore: false, nextCursor: null },
        },
      } as any);

      const result = await participantsService.getAllParticipants(conversationId);

      expect(result.authenticatedParticipants).toHaveLength(1);
      expect(result.authenticatedParticipants[0].id).toBe('auth-1');
      expect(result.anonymousParticipants).toHaveLength(1);
      expect(result.anonymousParticipants[0].id).toBe('anon-1');
    });

    it('should map anonymous participant fields correctly', async () => {
      const anonUser = createMockUser({
        id: 'anon-map',
        username: 'guest42',
        firstName: 'Guest',
        lastName: 'Forty-Two',
        isAnonymous: true,
        systemLanguage: 'pt',
        isOnline: false,
        createdAt: '2026-03-01T12:00:00.000Z',
        canSendMessages: true,
        canSendFiles: true,
        canSendImages: false,
      });

      mockApi.get.mockResolvedValue({
        data: {
          data: [anonUser],
          pagination: { hasMore: false, nextCursor: null },
        },
      } as any);

      const result = await participantsService.getAllParticipants(conversationId);
      const anon = result.anonymousParticipants[0];

      expect(anon.id).toBe('anon-map');
      expect(anon.username).toBe('guest42');
      expect(anon.firstName).toBe('Guest');
      expect(anon.lastName).toBe('Forty-Two');
      expect((anon as any).language).toBe('pt');
      expect(anon.isOnline).toBe(false);
      expect(anon.joinedAt).toBe('2026-03-01T12:00:00.000Z');
      expect(anon.canSendMessages).toBe(true);
      expect(anon.canSendFiles).toBe(true);
      expect(anon.canSendImages).toBe(false);
    });

    it('should default language to fr when systemLanguage is missing', async () => {
      const anonUser = createMockUser({
        id: 'anon-nolang',
        isAnonymous: true,
        systemLanguage: undefined,
      });

      mockApi.get.mockResolvedValue({
        data: {
          data: [anonUser],
          pagination: { hasMore: false, nextCursor: null },
        },
      } as any);

      const result = await participantsService.getAllParticipants(conversationId);

      expect((result.anonymousParticipants[0] as any).language).toBe('fr');
    });

    it('should default language to fr when systemLanguage is empty string', async () => {
      const anonUser = createMockUser({
        id: 'anon-empty',
        isAnonymous: true,
        systemLanguage: '',
      });

      mockApi.get.mockResolvedValue({
        data: {
          data: [anonUser],
          pagination: { hasMore: false, nextCursor: null },
        },
      } as any);

      const result = await participantsService.getAllParticipants(conversationId);

      expect((result.anonymousParticipants[0] as any).language).toBe('fr');
    });

    it('should use current date when createdAt is missing', async () => {
      const now = new Date('2026-03-09T00:00:00.000Z');
      jest.useFakeTimers({ now });

      const anonUser = createMockUser({
        id: 'anon-nodate',
        isAnonymous: true,
        createdAt: undefined,
      });

      mockApi.get.mockResolvedValue({
        data: {
          data: [anonUser],
          pagination: { hasMore: false, nextCursor: null },
        },
      } as any);

      const result = await participantsService.getAllParticipants(conversationId);

      expect(result.anonymousParticipants[0].joinedAt).toBe(now.toISOString());
      jest.useRealTimers();
    });

    it('should set canSendMessages/Files/Images to false when missing', async () => {
      const anonUser = createMockUser({
        id: 'anon-noperms',
        isAnonymous: true,
      });
      delete (anonUser as any).canSendMessages;
      delete (anonUser as any).canSendFiles;
      delete (anonUser as any).canSendImages;

      mockApi.get.mockResolvedValue({
        data: {
          data: [anonUser],
          pagination: { hasMore: false, nextCursor: null },
        },
      } as any);

      const result = await participantsService.getAllParticipants(conversationId);
      const anon = result.anonymousParticipants[0];

      expect(anon.canSendMessages).toBe(false);
      expect(anon.canSendFiles).toBe(false);
      expect(anon.canSendImages).toBe(false);
    });

    it('should return empty arrays on error', async () => {
      mockApi.get.mockRejectedValue(new Error('Fetch failed'));

      const result = await participantsService.getAllParticipants(conversationId);

      expect(result.authenticatedParticipants).toEqual([]);
      expect(result.anonymousParticipants).toEqual([]);
    });

    it('should handle missing pagination in response', async () => {
      mockApi.get.mockResolvedValue({
        data: {
          data: [createMockUser()],
        },
      } as any);

      const result = await participantsService.getAllParticipants(conversationId);

      expect(mockApi.get).toHaveBeenCalledTimes(1);
      expect(result.authenticatedParticipants).toHaveLength(1);
    });

    it('should handle empty data array in response', async () => {
      mockApi.get.mockResolvedValue({
        data: {
          data: [],
          pagination: { hasMore: false, nextCursor: null },
        },
      } as any);

      const result = await participantsService.getAllParticipants(conversationId);

      expect(result.authenticatedParticipants).toEqual([]);
      expect(result.anonymousParticipants).toEqual([]);
    });

    it('should handle null data in response gracefully', async () => {
      mockApi.get.mockResolvedValue({
        data: {
          data: null,
          pagination: { hasMore: false, nextCursor: null },
        },
      } as any);

      const result = await participantsService.getAllParticipants(conversationId);

      expect(result.authenticatedParticipants).toEqual([]);
      expect(result.anonymousParticipants).toEqual([]);
    });
  });

  describe('addParticipant', () => {
    const conversationId = 'conv-add';
    const userId = 'user-to-add';

    it('should call POST with correct endpoint and body', async () => {
      mockApi.post.mockResolvedValue({} as any);

      await participantsService.addParticipant(conversationId, userId);

      expect(mockApi.post).toHaveBeenCalledWith(
        `/conversations/${conversationId}/participants`,
        { userId }
      );
    });

    it('should invalidate cache after success', async () => {
      mockApi.post.mockResolvedValue({} as any);

      await participantsService.addParticipant(conversationId, userId);

      expect(mockCache.invalidateParticipantsCache).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors without catching', async () => {
      const error = new Error('Add failed');
      mockApi.post.mockRejectedValue(error);

      await expect(
        participantsService.addParticipant(conversationId, userId)
      ).rejects.toThrow('Add failed');
    });

    it('should not invalidate cache when API call fails', async () => {
      mockApi.post.mockRejectedValue(new Error('fail'));

      try {
        await participantsService.addParticipant(conversationId, userId);
      } catch {
        // expected
      }

      expect(mockCache.invalidateParticipantsCache).not.toHaveBeenCalled();
    });
  });

  describe('removeParticipant', () => {
    const conversationId = 'conv-remove';
    const userId = 'user-to-remove';

    it('should call DELETE with correct endpoint', async () => {
      mockApi.delete.mockResolvedValue({} as any);

      await participantsService.removeParticipant(conversationId, userId);

      expect(mockApi.delete).toHaveBeenCalledWith(
        `/conversations/${conversationId}/participants/${userId}`
      );
    });

    it('should invalidate cache after success', async () => {
      mockApi.delete.mockResolvedValue({} as any);

      await participantsService.removeParticipant(conversationId, userId);

      expect(mockCache.invalidateParticipantsCache).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors without catching', async () => {
      const error = new Error('Remove failed');
      mockApi.delete.mockRejectedValue(error);

      await expect(
        participantsService.removeParticipant(conversationId, userId)
      ).rejects.toThrow('Remove failed');
    });

    it('should not invalidate cache when API call fails', async () => {
      mockApi.delete.mockRejectedValue(new Error('fail'));

      try {
        await participantsService.removeParticipant(conversationId, userId);
      } catch {
        // expected
      }

      expect(mockCache.invalidateParticipantsCache).not.toHaveBeenCalled();
    });
  });

  describe('updateParticipantRole', () => {
    const conversationId = 'conv-role';
    const userId = 'user-role';

    it('should call PATCH with correct endpoint and body for admin', async () => {
      mockApi.patch.mockResolvedValue({} as any);

      await participantsService.updateParticipantRole(conversationId, userId, 'admin');

      expect(mockApi.patch).toHaveBeenCalledWith(
        `/conversations/${conversationId}/participants/${userId}/role`,
        { role: 'admin' }
      );
    });

    it('should call PATCH with correct endpoint and body for moderator', async () => {
      mockApi.patch.mockResolvedValue({} as any);

      await participantsService.updateParticipantRole(conversationId, userId, 'moderator');

      expect(mockApi.patch).toHaveBeenCalledWith(
        `/conversations/${conversationId}/participants/${userId}/role`,
        { role: 'moderator' }
      );
    });

    it('should call PATCH with correct endpoint and body for member', async () => {
      mockApi.patch.mockResolvedValue({} as any);

      await participantsService.updateParticipantRole(conversationId, userId, 'member');

      expect(mockApi.patch).toHaveBeenCalledWith(
        `/conversations/${conversationId}/participants/${userId}/role`,
        { role: 'member' }
      );
    });

    it('should invalidate cache after success', async () => {
      mockApi.patch.mockResolvedValue({} as any);

      await participantsService.updateParticipantRole(conversationId, userId, 'admin');

      expect(mockCache.invalidateParticipantsCache).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors without catching', async () => {
      const error = new Error('Role update failed');
      mockApi.patch.mockRejectedValue(error);

      await expect(
        participantsService.updateParticipantRole(conversationId, userId, 'admin')
      ).rejects.toThrow('Role update failed');
    });

    it('should not invalidate cache when API call fails', async () => {
      mockApi.patch.mockRejectedValue(new Error('fail'));

      try {
        await participantsService.updateParticipantRole(conversationId, userId, 'admin');
      } catch {
        // expected
      }

      expect(mockCache.invalidateParticipantsCache).not.toHaveBeenCalled();
    });
  });
});
