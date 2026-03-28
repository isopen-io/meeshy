import { communitiesService } from '@/services/communities.service';
import { apiService } from '@/services/api.service';
import type { Community, CreateCommunityData, UpdateCommunityData } from '@meeshy/shared/types';

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockApiService = apiService as jest.Mocked<typeof apiService>;

describe('CommunitiesService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const createMockCommunity = (overrides: Partial<Community> = {}): Community => ({
    id: 'community-123',
    name: 'Test Community',
    identifier: 'test-community',
    description: 'A test community',
    isPrivate: false,
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: {
      members: 10,
      conversations: 5,
    },
    ...overrides,
  } as Community);

  describe('getCommunities', () => {
    it('should fetch all communities', async () => {
      const mockCommunities = [
        createMockCommunity({ id: 'comm-1' }),
        createMockCommunity({ id: 'comm-2' }),
      ];
      mockApiService.get.mockResolvedValue({ success: true, data: mockCommunities });

      const result = await communitiesService.getCommunities();

      expect(mockApiService.get).toHaveBeenCalledWith('/communities', {});
      expect(result.data).toHaveLength(2);
    });

    it('should fetch communities with search filter', async () => {
      mockApiService.get.mockResolvedValue({ success: true, data: [] });

      await communitiesService.getCommunities({ search: 'test' });

      expect(mockApiService.get).toHaveBeenCalledWith('/communities', { search: 'test' });
    });

    it('should pass pagination params', async () => {
      mockApiService.get.mockResolvedValue({ success: true, data: [] });

      await communitiesService.getCommunities({ offset: 10, limit: 5 });

      expect(mockApiService.get).toHaveBeenCalledWith('/communities', { offset: 10, limit: 5 });
    });
  });

  describe('getCommunity', () => {
    it('should fetch a specific community by ID', async () => {
      const community = createMockCommunity();
      mockApiService.get.mockResolvedValue({ success: true, data: community });

      const result = await communitiesService.getCommunity('community-123');

      expect(mockApiService.get).toHaveBeenCalledWith('/communities/community-123');
      expect(result.data?.name).toBe('Test Community');
    });
  });

  describe('searchCommunities', () => {
    it('should search public communities', async () => {
      mockApiService.get.mockResolvedValue({ success: true, data: [] });

      await communitiesService.searchCommunities('test', 0, 20);

      expect(mockApiService.get).toHaveBeenCalledWith('/communities/search', {
        q: 'test',
        offset: 0,
        limit: 20,
      });
    });
  });

  describe('checkIdentifier', () => {
    it('should check identifier availability', async () => {
      mockApiService.get.mockResolvedValue({
        success: true,
        data: { available: true, identifier: 'mshy_test' },
      });

      const result = await communitiesService.checkIdentifier('mshy_test');

      expect(mockApiService.get).toHaveBeenCalledWith(
        '/communities/check-identifier/mshy_test'
      );
      expect(result.data?.available).toBe(true);
    });
  });

  describe('getCommunityConversations', () => {
    it('should fetch conversations for a community', async () => {
      mockApiService.get.mockResolvedValue({
        success: true,
        data: [{ id: 'conv-1' }, { id: 'conv-2' }],
      });

      const result = await communitiesService.getCommunityConversations('community-123');

      expect(mockApiService.get).toHaveBeenCalledWith('/communities/community-123/conversations');
      expect(result.data).toHaveLength(2);
    });
  });

  describe('createCommunity', () => {
    it('should create a new community', async () => {
      const createData: CreateCommunityData = {
        name: 'New Community',
        identifier: 'new-community',
        description: 'A new community',
        isPrivate: false,
      };
      mockApiService.post.mockResolvedValue({
        success: true,
        data: createMockCommunity({ ...createData }),
      });

      const result = await communitiesService.createCommunity(createData);

      expect(mockApiService.post).toHaveBeenCalledWith('/communities', createData);
      expect(result.data?.name).toBe('New Community');
    });
  });

  describe('updateCommunity', () => {
    it('should update community', async () => {
      const updateData: UpdateCommunityData = { name: 'Updated Name' };
      mockApiService.put.mockResolvedValue({
        success: true,
        data: createMockCommunity({ name: 'Updated Name' }),
      });

      const result = await communitiesService.updateCommunity('community-123', updateData);

      expect(mockApiService.put).toHaveBeenCalledWith('/communities/community-123', updateData);
      expect(result.data?.name).toBe('Updated Name');
    });
  });

  describe('deleteCommunity', () => {
    it('should delete community', async () => {
      mockApiService.delete.mockResolvedValue({ success: true });

      const result = await communitiesService.deleteCommunity('community-123');

      expect(mockApiService.delete).toHaveBeenCalledWith('/communities/community-123');
      expect(result.success).toBe(true);
    });
  });

  describe('member management', () => {
    it('should get members', async () => {
      mockApiService.get.mockResolvedValue({ success: true, data: [] });

      await communitiesService.getMembers('community-123');

      expect(mockApiService.get).toHaveBeenCalledWith('/communities/community-123/members', {
        offset: 0,
        limit: 50,
      });
    });

    it('should add member to community', async () => {
      mockApiService.post.mockResolvedValue({ success: true, data: { id: 'm1' } });

      await communitiesService.addMember('community-123', { userId: 'user-456' });

      expect(mockApiService.post).toHaveBeenCalledWith('/communities/community-123/members', {
        userId: 'user-456',
      });
    });

    it('should update member role', async () => {
      mockApiService.patch.mockResolvedValue({ success: true, data: { id: 'm1' } });

      await communitiesService.updateMemberRole('community-123', 'member-1', {
        role: 'admin' as never,
      });

      expect(mockApiService.patch).toHaveBeenCalledWith(
        '/communities/community-123/members/member-1/role',
        { role: 'admin' }
      );
    });

    it('should remove member from community', async () => {
      mockApiService.delete.mockResolvedValue({ success: true });

      await communitiesService.removeMember('community-123', 'member-456');

      expect(mockApiService.delete).toHaveBeenCalledWith(
        '/communities/community-123/members/member-456'
      );
    });
  });

  describe('join/leave', () => {
    it('should join a community', async () => {
      mockApiService.post.mockResolvedValue({ success: true, data: { id: 'm1' } });

      await communitiesService.joinCommunity('community-123');

      expect(mockApiService.post).toHaveBeenCalledWith('/communities/community-123/join');
    });

    it('should leave a community', async () => {
      mockApiService.post.mockResolvedValue({ success: true });

      await communitiesService.leaveCommunity('community-123');

      expect(mockApiService.post).toHaveBeenCalledWith('/communities/community-123/leave');
    });
  });

  describe('preferences', () => {
    it('should get preferences', async () => {
      mockApiService.get.mockResolvedValue({ success: true, data: { isPinned: true } });

      await communitiesService.getPreferences('community-123');

      expect(mockApiService.get).toHaveBeenCalledWith(
        '/user-preferences/communities/community-123'
      );
    });

    it('should list all preferences', async () => {
      mockApiService.get.mockResolvedValue({ success: true, data: [] });

      await communitiesService.listPreferences();

      expect(mockApiService.get).toHaveBeenCalledWith('/user-preferences/communities', {
        offset: 0,
        limit: 50,
      });
    });

    it('should update preferences', async () => {
      mockApiService.put.mockResolvedValue({ success: true, data: { isPinned: true } });

      await communitiesService.updatePreferences('community-123', { isPinned: true });

      expect(mockApiService.put).toHaveBeenCalledWith(
        '/user-preferences/communities/community-123',
        { isPinned: true }
      );
    });

    it('should delete preferences', async () => {
      mockApiService.delete.mockResolvedValue({ success: true });

      await communitiesService.deletePreferences('community-123');

      expect(mockApiService.delete).toHaveBeenCalledWith(
        '/user-preferences/communities/community-123'
      );
    });

    it('should reorder preferences', async () => {
      mockApiService.post.mockResolvedValue({ success: true });

      const updates = [
        { communityId: 'c1', orderInCategory: 0 },
        { communityId: 'c2', orderInCategory: 1 },
      ];
      await communitiesService.reorderPreferences(updates);

      expect(mockApiService.post).toHaveBeenCalledWith('/user-preferences/communities/reorder', {
        updates,
      });
    });
  });
});
