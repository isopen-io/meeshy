import { groupsService } from '@/services/groups.service';
import { apiService } from '@/services/api.service';
import { UserRoleEnum } from '@meeshy/shared/types';

// Mock du service API
jest.mock('@/services/api.service');
const mockedApiService = jest.mocked(apiService);

// Mock data
const mockUsers = [
  { id: 'user-1', username: 'john_doe', email: 'john@example.com', avatar: null },
  { id: 'user-2', username: 'jane_doe', email: 'jane@example.com', avatar: null },
];

const mockGroups = [
  {
    id: 'group-1',
    name: 'Groupe de test',
    description: 'Description du groupe',
    isPrivate: false,
    maxMembers: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
    members: [],
    conversations: [],
  },
  {
    id: 'group-2',
    name: 'Groupe privé',
    description: 'Groupe privé',
    isPrivate: true,
    maxMembers: 50,
    createdAt: new Date(),
    updatedAt: new Date(),
    members: [],
    conversations: [],
  },
];

const mockGroupMembers = [
  { id: 'member-1', userId: 'user-1', groupId: 'group-1', role: 'ADMIN', joinedAt: new Date(), user: mockUsers[0] },
  { id: 'member-2', userId: 'user-2', groupId: 'group-1', role: 'MEMBER', joinedAt: new Date(), user: mockUsers[1] },
  { id: 'member-3', userId: 'user-3', groupId: 'group-1', role: 'MEMBER', joinedAt: new Date(), user: mockUsers[0] },
];

describe('GroupsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getGroups', () => {
    it('should fetch groups successfully', async () => {
      const mockResponse = {
        data: {
          groups: mockGroups,
          total: mockGroups.length,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
        status: 200,
      };

      mockedApiService.get.mockResolvedValue(mockResponse);

      const result = await groupsService.getGroups();

      expect(mockedApiService.get).toHaveBeenCalledWith('/groups', undefined);
      expect(result.data.groups).toHaveLength(2);
      expect(result.data.groups[0].name).toBe('Groupe de test');
    });

    it('should fetch groups with filters', async () => {
      const filters = { page: 2, limit: 5, search: 'test', isPrivate: false };
      const mockResponse = {
        data: {
          groups: [mockGroups[0]],
          total: 1,
          page: 2,
          limit: 5,
          totalPages: 1,
        },
        status: 200,
      };

      mockedApiService.get.mockResolvedValue(mockResponse);

      const result = await groupsService.getGroups(filters);

      expect(mockedApiService.get).toHaveBeenCalledWith('/groups', filters);
      expect(result.data.groups).toHaveLength(1);
      expect(result.data.page).toBe(2);
    });

    it('should handle API errors', async () => {
      const error = new Error('Network error');
      mockedApiService.get.mockRejectedValue(error);

      await expect(groupsService.getGroups()).rejects.toThrow('Network error');
      expect(mockedApiService.get).toHaveBeenCalledWith('/groups', undefined);
    });
  });

  describe('getGroupById', () => {
    it('should fetch a specific group', async () => {
      const groupId = 'group-1';
      const mockResponse = {
        data: mockGroups[0],
        status: 200,
      };

      mockedApiService.get.mockResolvedValue(mockResponse);

      const result = await groupsService.getGroupById(groupId);

      expect(mockedApiService.get).toHaveBeenCalledWith(`/groups/${groupId}`);
      expect(result.data.id).toBe(groupId);
      expect(result.data.name).toBe('Groupe de test');
    });

    it('should handle group not found', async () => {
      const groupId = 'non-existent';
      const error = new Error('404: Group not found');
      mockedApiService.get.mockRejectedValue(error);

      await expect(groupsService.getGroupById(groupId)).rejects.toThrow('404: Group not found');
    });
  });

  describe('createGroup', () => {
    it('should create a new group', async () => {
      const groupData = {
        name: 'Nouveau groupe',
        description: 'Description du nouveau groupe',
        isPrivate: false,
        maxMembers: 20,
      };

      const mockResponse = {
        data: {
          id: 'new-group-id',
          ...groupData,
          createdAt: new Date(),
          updatedAt: new Date(),
          members: [],
          conversations: [],
        },
        status: 201,
      };

      mockedApiService.post.mockResolvedValue(mockResponse);

      const result = await groupsService.createGroup(groupData);

      expect(mockedApiService.post).toHaveBeenCalledWith('/groups', groupData);
      expect(result.data.name).toBe('Nouveau groupe');
      expect(result.data.isPrivate).toBe(false);
    });

    it('should handle validation errors', async () => {
      const invalidGroupData = {
        name: '', // Nom vide
        isPrivate: false,
      };

      const error = new Error('400: Name is required');
      mockedApiService.post.mockRejectedValue(error);

      await expect(groupsService.createGroup(invalidGroupData)).rejects.toThrow('400: Name is required');
    });
  });

  describe('updateGroup', () => {
    it('should update a group', async () => {
      const groupId = 'group-1';
      const updateData = {
        name: 'Nom modifié',
        description: 'Nouvelle description',
      };

      const mockResponse = {
        data: {
          ...mockGroups[0],
          ...updateData,
          updatedAt: new Date(),
        },
        status: 200,
      };

      mockedApiService.patch.mockResolvedValue(mockResponse);

      const result = await groupsService.updateGroup(groupId, updateData);

      expect(mockedApiService.patch).toHaveBeenCalledWith(`/groups/${groupId}`, updateData);
      expect(result.data.name).toBe('Nom modifié');
    });
  });

  describe('deleteGroup', () => {
    it('should delete a group', async () => {
      const groupId = 'group-1';
      const mockResponse = {
        data: undefined,
        status: 204,
      };

      mockedApiService.delete.mockResolvedValue(mockResponse);

      const result = await groupsService.deleteGroup(groupId);

      expect(mockedApiService.delete).toHaveBeenCalledWith(`/groups/${groupId}`);
      expect(result.status).toBe(204);
    });
  });

  describe('getGroupMembers', () => {
    it('should fetch group members', async () => {
      const groupId = 'group-1';
      const mockResponse = {
        data: mockGroupMembers,
        status: 200,
      };

      mockedApiService.get.mockResolvedValue(mockResponse);

      const result = await groupsService.getGroupMembers(groupId);

      expect(mockedApiService.get).toHaveBeenCalledWith(`/groups/${groupId}/members`);
      expect(result.data).toHaveLength(3);
      expect(result.data[0].role).toBe('ADMIN');
    });
  });

  describe('inviteMember', () => {
    it('should invite a member to the group', async () => {
      const groupId = 'group-1';
      const memberData = {
        userId: 'user-123',
        role: 'MEMBER' as const,
      };

      const mockResponse = {
        data: {
          id: 'new-member-id',
          userId: 'user-123',
          groupId,
          role: 'MEMBER',
          joinedAt: new Date(),
          user: mockUsers[1],
        },
        status: 201,
      };

      mockedApiService.post.mockResolvedValue(mockResponse);

      const result = await groupsService.inviteMember(groupId, memberData);

      expect(mockedApiService.post).toHaveBeenCalledWith(`/groups/${groupId}/members`, memberData);
      expect(result.data.userId).toBe('user-123');
      expect(result.data.role).toBe('MEMBER');
    });
  });

  describe('updateMemberRole', () => {
    it('should update a member role', async () => {
      const groupId = 'group-1';
      const memberId = 'member-1';
      const newRole = UserRoleEnum.ADMIN;

      const mockResponse = {
        data: {
          ...mockGroupMembers[1],
          role: UserRoleEnum.ADMIN,
        },
        status: 200,
      };

      mockedApiService.patch.mockResolvedValue(mockResponse);

      const result = await groupsService.updateMemberRole(groupId, memberId, newRole);

      expect(mockedApiService.patch).toHaveBeenCalledWith(
        `/groups/${groupId}/members/${memberId}`,
        { role: newRole }
      );
      expect(result.data.role).toBe(UserRoleEnum.ADMIN);
    });
  });

  describe('removeMember', () => {
    it('should remove a member from the group', async () => {
      const groupId = 'group-1';
      const memberId = 'member-1';

      const mockResponse = {
        data: undefined,
        status: 204,
      };

      mockedApiService.delete.mockResolvedValue(mockResponse);

      const result = await groupsService.removeMember(groupId, memberId);

      expect(mockedApiService.delete).toHaveBeenCalledWith(`/groups/${groupId}/members/${memberId}`);
      expect(result.status).toBe(204);
    });
  });

  describe('searchUsers', () => {
    it('should search for users', async () => {
      const query = 'john';
      const mockResponse = {
        data: [mockUsers[0]],
        status: 200,
      };

      mockedApiService.get.mockResolvedValue(mockResponse);

      const result = await groupsService.searchUsers(query);

      expect(mockedApiService.get).toHaveBeenCalledWith('/users/search', { search: query });
      expect(result.data).toHaveLength(1);
    });

    it('should search for users excluding a group', async () => {
      const query = 'john';
      const excludeGroupId = 'group-1';
      const mockResponse = {
        data: [mockUsers[0]],
        status: 200,
      };

      mockedApiService.get.mockResolvedValue(mockResponse);

      const result = await groupsService.searchUsers(query, excludeGroupId);

      expect(mockedApiService.get).toHaveBeenCalledWith('/users/search', {
        search: query,
        excludeGroup: excludeGroupId,
      });
    });
  });

  describe('generateInviteLink', () => {
    it('should generate an invite link', async () => {
      const groupId = 'group-1';
      const mockResponse = {
        data: {
          link: 'https://app.meeshy.me/join/group-1/abc123',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
        status: 200,
      };

      mockedApiService.post.mockResolvedValue(mockResponse);

      const result = await groupsService.generateInviteLink(groupId);

      expect(mockedApiService.post).toHaveBeenCalledWith(`/groups/${groupId}/invite-link`, {
        expiresIn: 7 * 24 * 60 * 60 * 1000,
      });
      expect(result.data.link).toContain('group-1');
    });

    it('should generate an invite link with custom expiration', async () => {
      const groupId = 'group-1';
      const customExpiration = 24 * 60 * 60 * 1000; // 1 jour

      const mockResponse = {
        data: {
          link: 'https://app.meeshy.me/join/group-1/xyz789',
          expiresAt: new Date(Date.now() + customExpiration),
        },
        status: 200,
      };

      mockedApiService.post.mockResolvedValue(mockResponse);

      const result = await groupsService.generateInviteLink(groupId, customExpiration);

      expect(mockedApiService.post).toHaveBeenCalledWith(`/groups/${groupId}/invite-link`, {
        expiresIn: customExpiration,
      });
    });
  });

  describe('joinGroupByInvite', () => {
    it('should join a group by invite code', async () => {
      const inviteCode = 'abc123';
      const mockResponse = {
        data: {
          group: mockGroups[0],
          member: mockGroupMembers[0],
        },
        status: 200,
      };

      mockedApiService.post.mockResolvedValue(mockResponse);

      const result = await groupsService.joinGroupByInvite(inviteCode);

      expect(mockedApiService.post).toHaveBeenCalledWith('/groups/join-by-invite', {
        inviteCode,
      });
      expect(result.data.group.id).toBe('group-1');
      expect(result.data.member.role).toBe('ADMIN');
    });

    it('should handle invalid invite code', async () => {
      const inviteCode = 'invalid-code';
      const error = new Error('404: Invalid invite code');
      mockedApiService.post.mockRejectedValue(error);

      await expect(groupsService.joinGroupByInvite(inviteCode)).rejects.toThrow('404: Invalid invite code');
    });
  });
});
