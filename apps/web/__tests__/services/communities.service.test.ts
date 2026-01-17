/**
 * Tests for CommunitiesService
 *
 * Tests community CRUD operations, member management,
 * and conversation fetching within communities
 */

import { communitiesService, Community, CreateCommunityRequest, UpdateCommunityRequest } from '@/services/communities.service';
import { apiService } from '@/services/api.service';

// Mock the apiService
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
    creator: {
      id: 'user-1',
      username: 'creator',
      displayName: 'Creator User',
    },
    _count: {
      members: 10,
      conversations: 5,
    },
    ...overrides,
  });

  describe('getCommunities', () => {
    it('should fetch all communities', async () => {
      const mockCommunities = [
        createMockCommunity({ id: 'comm-1', name: 'Community 1' }),
        createMockCommunity({ id: 'comm-2', name: 'Community 2' }),
      ];

      mockApiService.get.mockResolvedValue({
        success: true,
        data: mockCommunities,
      });

      const result = await communitiesService.getCommunities();

      expect(mockApiService.get).toHaveBeenCalledWith('/communities', { params: {} });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should fetch communities with search filter', async () => {
      mockApiService.get.mockResolvedValue({
        success: true,
        data: [createMockCommunity({ name: 'Matching Community' })],
      });

      const result = await communitiesService.getCommunities('Matching');

      expect(mockApiService.get).toHaveBeenCalledWith('/communities', {
        params: { search: 'Matching' },
      });
      expect(result.data).toHaveLength(1);
    });

    it('should return empty params when no search', async () => {
      mockApiService.get.mockResolvedValue({
        success: true,
        data: [],
      });

      await communitiesService.getCommunities();

      expect(mockApiService.get).toHaveBeenCalledWith('/communities', { params: {} });
    });

    it('should throw error on failure', async () => {
      mockApiService.get.mockRejectedValue(new Error('Network error'));

      await expect(communitiesService.getCommunities()).rejects.toThrow('Network error');
    });
  });

  describe('getCommunity', () => {
    it('should fetch a specific community by ID', async () => {
      const mockCommunity = createMockCommunity();

      mockApiService.get.mockResolvedValue({
        success: true,
        data: mockCommunity,
      });

      const result = await communitiesService.getCommunity('community-123');

      expect(mockApiService.get).toHaveBeenCalledWith('/communities/community-123');
      expect(result.data?.name).toBe('Test Community');
    });

    it('should throw error when community not found', async () => {
      mockApiService.get.mockRejectedValue(new Error('Community not found'));

      await expect(communitiesService.getCommunity('nonexistent')).rejects.toThrow(
        'Community not found'
      );
    });
  });

  describe('getCommunityByIdentifier', () => {
    it('should fetch community by identifier', async () => {
      const mockCommunity = createMockCommunity({ identifier: 'my-community' });

      mockApiService.get.mockResolvedValue({
        success: true,
        data: mockCommunity,
      });

      const result = await communitiesService.getCommunityByIdentifier('my-community');

      expect(mockApiService.get).toHaveBeenCalledWith('/communities/identifier/my-community');
      expect(result.data?.identifier).toBe('my-community');
    });

    it('should handle special characters in identifier', async () => {
      mockApiService.get.mockResolvedValue({
        success: true,
        data: createMockCommunity({ identifier: 'my-special-community' }),
      });

      await communitiesService.getCommunityByIdentifier('my-special-community');

      expect(mockApiService.get).toHaveBeenCalledWith(
        '/communities/identifier/my-special-community'
      );
    });
  });

  describe('getCommunityConversations', () => {
    it('should fetch conversations for a community', async () => {
      const mockConversations = [
        { id: 'conv-1', title: 'General' },
        { id: 'conv-2', title: 'Announcements' },
      ];

      mockApiService.get.mockResolvedValue({
        success: true,
        data: mockConversations,
      });

      const result = await communitiesService.getCommunityConversations('community-123');

      expect(mockApiService.get).toHaveBeenCalledWith(
        '/communities/community-123/conversations'
      );
      expect(result.data).toHaveLength(2);
    });

    it('should return empty array when no conversations', async () => {
      mockApiService.get.mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await communitiesService.getCommunityConversations('empty-community');

      expect(result.data).toEqual([]);
    });
  });

  describe('createCommunity', () => {
    it('should create a new community', async () => {
      const createData: CreateCommunityRequest = {
        name: 'New Community',
        identifier: 'new-community',
        description: 'A new community',
        isPrivate: false,
      };

      const createdCommunity = createMockCommunity({
        id: 'new-123',
        ...createData,
      });

      mockApiService.post.mockResolvedValue({
        success: true,
        data: createdCommunity,
      });

      const result = await communitiesService.createCommunity(createData);

      expect(mockApiService.post).toHaveBeenCalledWith('/communities', createData);
      expect(result.data?.name).toBe('New Community');
    });

    it('should create community with minimal data', async () => {
      const createData: CreateCommunityRequest = {
        name: 'Minimal Community',
      };

      mockApiService.post.mockResolvedValue({
        success: true,
        data: createMockCommunity({ name: 'Minimal Community' }),
      });

      const result = await communitiesService.createCommunity(createData);

      expect(mockApiService.post).toHaveBeenCalledWith('/communities', createData);
      expect(result.success).toBe(true);
    });

    it('should create private community', async () => {
      const createData: CreateCommunityRequest = {
        name: 'Private Community',
        isPrivate: true,
      };

      mockApiService.post.mockResolvedValue({
        success: true,
        data: createMockCommunity({ ...createData }),
      });

      await communitiesService.createCommunity(createData);

      expect(mockApiService.post).toHaveBeenCalledWith('/communities', createData);
    });

    it('should throw error on creation failure', async () => {
      mockApiService.post.mockRejectedValue(new Error('Identifier already exists'));

      await expect(
        communitiesService.createCommunity({ name: 'Duplicate' })
      ).rejects.toThrow('Identifier already exists');
    });
  });

  describe('updateCommunity', () => {
    it('should update community', async () => {
      const updateData: UpdateCommunityRequest = {
        name: 'Updated Name',
        description: 'Updated description',
      };

      const updatedCommunity = createMockCommunity({
        name: 'Updated Name',
        description: 'Updated description',
      });

      mockApiService.put.mockResolvedValue({
        success: true,
        data: updatedCommunity,
      });

      const result = await communitiesService.updateCommunity('community-123', updateData);

      expect(mockApiService.put).toHaveBeenCalledWith(
        '/communities/community-123',
        updateData
      );
      expect(result.data?.name).toBe('Updated Name');
    });

    it('should update community identifier', async () => {
      const updateData: UpdateCommunityRequest = {
        identifier: 'new-identifier',
      };

      mockApiService.put.mockResolvedValue({
        success: true,
        data: createMockCommunity({ identifier: 'new-identifier' }),
      });

      const result = await communitiesService.updateCommunity('community-123', updateData);

      expect(result.data?.identifier).toBe('new-identifier');
    });

    it('should update privacy setting', async () => {
      const updateData: UpdateCommunityRequest = {
        isPrivate: true,
      };

      mockApiService.put.mockResolvedValue({
        success: true,
        data: createMockCommunity({ isPrivate: true }),
      });

      const result = await communitiesService.updateCommunity('community-123', updateData);

      expect(result.data?.isPrivate).toBe(true);
    });
  });

  describe('deleteCommunity', () => {
    it('should delete community', async () => {
      mockApiService.delete.mockResolvedValue({
        success: true,
        data: undefined,
      });

      const result = await communitiesService.deleteCommunity('community-123');

      expect(mockApiService.delete).toHaveBeenCalledWith('/communities/community-123');
      expect(result.success).toBe(true);
    });

    it('should throw error when deletion fails', async () => {
      mockApiService.delete.mockRejectedValue(new Error('Cannot delete community with members'));

      await expect(communitiesService.deleteCommunity('community-123')).rejects.toThrow(
        'Cannot delete community with members'
      );
    });
  });

  describe('addMember', () => {
    it('should add member to community', async () => {
      mockApiService.post.mockResolvedValue({
        success: true,
        data: undefined,
      });

      const result = await communitiesService.addMember('community-123', 'user-456');

      expect(mockApiService.post).toHaveBeenCalledWith('/communities/community-123/members', {
        userId: 'user-456',
      });
      expect(result.success).toBe(true);
    });

    it('should throw error when user already member', async () => {
      mockApiService.post.mockRejectedValue(new Error('User is already a member'));

      await expect(
        communitiesService.addMember('community-123', 'existing-user')
      ).rejects.toThrow('User is already a member');
    });

    it('should throw error when community is private and user not invited', async () => {
      mockApiService.post.mockRejectedValue(new Error('Cannot join private community'));

      await expect(
        communitiesService.addMember('private-community', 'user-456')
      ).rejects.toThrow('Cannot join private community');
    });
  });

  describe('removeMember', () => {
    it('should remove member from community', async () => {
      mockApiService.delete.mockResolvedValue({
        success: true,
        data: undefined,
      });

      const result = await communitiesService.removeMember('community-123', 'member-456');

      expect(mockApiService.delete).toHaveBeenCalledWith(
        '/communities/community-123/members/member-456'
      );
      expect(result.success).toBe(true);
    });

    it('should throw error when member not found', async () => {
      mockApiService.delete.mockRejectedValue(new Error('Member not found'));

      await expect(
        communitiesService.removeMember('community-123', 'nonexistent-member')
      ).rejects.toThrow('Member not found');
    });

    it('should throw error when trying to remove creator', async () => {
      mockApiService.delete.mockRejectedValue(new Error('Cannot remove community creator'));

      await expect(
        communitiesService.removeMember('community-123', 'creator-id')
      ).rejects.toThrow('Cannot remove community creator');
    });
  });

  describe('Error handling', () => {
    it('should propagate API errors with proper context', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      mockApiService.get.mockRejectedValue(new Error('Internal server error'));

      await expect(communitiesService.getCommunity('test')).rejects.toThrow(
        'Internal server error'
      );

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Response structure', () => {
    it('should return ApiResponse format', async () => {
      mockApiService.get.mockResolvedValue({
        success: true,
        data: [createMockCommunity()],
        message: 'Communities fetched successfully',
      });

      const result = await communitiesService.getCommunities();

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('data');
    });
  });
});
