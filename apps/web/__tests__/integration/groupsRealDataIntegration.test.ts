/**
 * Tests d'intégration pour l'API groupsService avec les vraies données
 * Ces tests simulent des interactions réelles avec l'API et testent la logique métier
 */

import { groupsService } from '@/services/groups.service';
import { apiService } from '@/services/api.service';
import { Group, GroupMember, User } from '@/types';
import { UserRoleEnum } from '@meeshy/shared/types';

// Mock de l'apiService
jest.mock('@/services/api.service');
const mockApiService = jest.mocked(apiService);

describe('Groups API Integration - Real Data Flow', () => {
  // Données de test réalistes
  const mockUser: User = {
    id: 'user-123',
    username: 'john.doe',
    email: 'john.doe@company.com',
    phoneNumber: '+33123456789',
    firstName: 'John',
    lastName: 'Doe',
    role: UserRoleEnum.USER,
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
    systemLanguage: 'fr',
    regionalLanguage: 'en',
    autoTranslateEnabled: true,
    translateToSystemLanguage: true,
    translateToRegionalLanguage: false,
    useCustomDestination: false,
    isOnline: true,
    createdAt: new Date('2024-01-01T10:00:00Z'),
    lastActiveAt: new Date('2024-01-15T14:30:00Z')
  };

  const mockGroupMember: GroupMember = {
    id: 'member-456',
    userId: 'user-123',
    groupId: 'group-789',
    role: UserRoleEnum.ADMIN,
    joinedAt: new Date('2024-01-01T10:00:00Z'),
    user: mockUser
  };

  const mockGroup: Group = {
    id: 'group-789',
    name: 'Équipe Développement Frontend',
    description: 'Groupe dédié au développement des interfaces utilisateur',
    isPrivate: false,
    createdAt: new Date('2024-01-01T10:00:00Z'),
    updatedAt: new Date('2024-01-15T14:30:00Z'),
    members: [mockGroupMember],
    conversations: []
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Group Fetching Integration', () => {
    it('should fetch group with complete member data', async () => {
      // Simuler une réponse API réaliste
      const expectedResponse = {
        data: mockGroup,
        status: 200,
        message: 'Groupe récupéré avec succès'
      };

      mockApiService.get.mockResolvedValue(expectedResponse);

      // Appel du service
      const result = await groupsService.getGroupById('group-789');

      // Vérifications
      expect(mockApiService.get).toHaveBeenCalledWith('/groups/group-789');
      expect(result.data.id).toBe('group-789');
      expect(result.data.name).toBe('Équipe Développement Frontend');
      expect(result.data.members).toHaveLength(1);
      expect(result.data.members[0].user.username).toBe('john.doe');
      expect(result.data.members[0].role).toBe(UserRoleEnum.ADMIN);
      expect(result.status).toBe(200);
    });

    it('should handle group with multiple members and conversations', async () => {
      const complexGroup: Group = {
        ...mockGroup,
        members: [
          mockGroupMember,
          {
            id: 'member-457',
            userId: 'user-124',
            groupId: 'group-789',
            role: 'MEMBER',
            joinedAt: new Date('2024-01-05T09:00:00Z'),
            user: {
              ...mockUser,
              id: 'user-124',
              username: 'jane.smith',
              email: 'jane.smith@company.com',
              firstName: 'Jane',
              lastName: 'Smith',
              isOnline: false,
              lastActiveAt: new Date('2024-01-14T16:45:00Z')
            }
          },
          {
            id: 'member-458',
            userId: 'user-125',
            groupId: 'group-789',
            role: 'MEMBER',
            joinedAt: new Date('2024-01-10T11:30:00Z'),
            user: {
              ...mockUser,
              id: 'user-125',
              username: 'bob.wilson',
              email: 'bob.wilson@company.com',
              firstName: 'Bob',
              lastName: 'Wilson',
              isOnline: true,
              lastActiveAt: new Date('2024-01-15T14:20:00Z')
            }
          }
        ],
        conversations: [
          {
            id: 'conv-100',
            type: 'group',
            isActive: true,
            createdAt: new Date('2024-01-02T14:00:00Z'),
            updatedAt: new Date('2024-01-15T13:45:00Z'),
            groupId: 'group-789',
            participants: []
          }
        ]
      };

      mockApiService.get.mockResolvedValue({
        data: complexGroup,
        status: 200
      });

      const result = await groupsService.getGroupById('group-789');

      expect(result.data.members).toHaveLength(3);
      expect(result.data.conversations).toHaveLength(1);
      
      // Vérifier les rôles
      const adminMembers = result.data.members.filter(m => m.role === UserRoleEnum.ADMIN);
      const regularMembers = result.data.members.filter(m => m.role === UserRoleEnum.MEMBER);
      expect(adminMembers).toHaveLength(1);
      expect(regularMembers).toHaveLength(2);

      // Vérifier les statuts en ligne
      const onlineMembers = result.data.members.filter(m => m.user.isOnline);
      const offlineMembers = result.data.members.filter(m => !m.user.isOnline);
      expect(onlineMembers).toHaveLength(2);
      expect(offlineMembers).toHaveLength(1);
    });
  });

  describe('Group Creation Integration', () => {
    it('should create group and return complete data', async () => {
      const createData = {
        name: 'Nouveau Projet Mobile',
        description: 'Développement de l\'application mobile',
        isPrivate: true,
        maxMembers: 10
      };

      const createdGroup: Group = {
        id: 'group-new-123',
        ...createData,
        createdAt: new Date('2024-01-15T15:00:00Z'),
        updatedAt: new Date('2024-01-15T15:00:00Z'),
        members: [{
          id: 'member-creator',
          userId: 'user-123',
          groupId: 'group-new-123',
          role: UserRoleEnum.ADMIN,
          joinedAt: new Date('2024-01-15T15:00:00Z'),
          user: mockUser
        }],
        conversations: []
      };

      mockApiService.post.mockResolvedValue({
        data: createdGroup,
        status: 201,
        message: 'Groupe créé avec succès'
      });

      const result = await groupsService.createGroup(createData);

      expect(mockApiService.post).toHaveBeenCalledWith('/groups', createData);
      expect(result.data.id).toBe('group-new-123');
      expect(result.data.name).toBe('Nouveau Projet Mobile');
      expect(result.data.isPrivate).toBe(true);
      expect(result.data.members).toHaveLength(1);
      expect(result.data.members[0].role).toBe(UserRoleEnum.ADMIN);
      expect(result.status).toBe(201);
    });
  });

  describe('Member Management Integration', () => {
    it('should invite member and update group state', async () => {
      const inviteData = {
        userId: 'user-new-456',
        role: UserRoleEnum.MEMBER
      };

      const newMember: GroupMember = {
        id: 'member-new-789',
        userId: 'user-new-456',
        groupId: 'group-789',
        role: UserRoleEnum.MEMBER,
        joinedAt: new Date('2024-01-15T16:00:00Z'),
        user: {
          id: 'user-new-456',
          username: 'alice.martin',
          email: 'alice.martin@company.com',
          phoneNumber: '+33987654321',
          firstName: 'Alice',
          lastName: 'Martin',
          role: UserRoleEnum.USER,
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
          systemLanguage: 'fr',
          regionalLanguage: 'fr',
          autoTranslateEnabled: true,
          translateToSystemLanguage: false,
          translateToRegionalLanguage: true,
          useCustomDestination: false,
          isOnline: true,
          createdAt: new Date('2024-01-15T15:30:00Z'),
          lastActiveAt: new Date('2024-01-15T16:00:00Z')
        }
      };

      mockApiService.post.mockResolvedValue({
        data: newMember,
        status: 201,
        message: 'Membre invité avec succès'
      });

      const result = await groupsService.inviteMember('group-789', inviteData);

      expect(mockApiService.post).toHaveBeenCalledWith('/groups/group-789/members', inviteData);
      expect(result.data.userId).toBe('user-new-456');
      expect(result.data.role).toBe('MEMBER');
      expect(result.data.user.username).toBe('alice.martin');
      expect(result.status).toBe(201);
    });

    it('should update member role', async () => {
      const updatedMember: GroupMember = {
        ...mockGroupMember,
        role: 'ADMIN'
      };

      mockApiService.patch.mockResolvedValue({
        data: updatedMember,
        status: 200,
        message: 'Rôle mis à jour avec succès'
      });

      const result = await groupsService.updateMemberRole('group-789', 'member-456', 'ADMIN');

      expect(mockApiService.patch).toHaveBeenCalledWith(
        '/groups/group-789/members/member-456',
        { role: 'ADMIN' }
      );
      expect(result.data.role).toBe('ADMIN');
      expect(result.status).toBe(200);
    });

    it('should remove member from group', async () => {
      mockApiService.delete.mockResolvedValue({
        data: undefined,
        status: 204,
        message: 'Membre retiré du groupe'
      });

      const result = await groupsService.removeMember('group-789', 'member-456');

      expect(mockApiService.delete).toHaveBeenCalledWith('/groups/group-789/members/member-456');
      expect(result.status).toBe(204);
    });
  });

  describe('Search and Discovery Integration', () => {
    it('should search users with realistic data', async () => {
      const searchResults: User[] = [
        {
          id: 'user-search-1',
          username: 'thomas.dev',
          email: 'thomas.dev@company.com',
          phoneNumber: '+33111222333',
          firstName: 'Thomas',
          lastName: 'Developer',
          role: 'USER' as const,
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
          systemLanguage: 'fr',
          regionalLanguage: 'en',
          autoTranslateEnabled: true,
          translateToSystemLanguage: true,
          translateToRegionalLanguage: false,
          useCustomDestination: false,
          isOnline: true,
          createdAt: new Date('2024-01-01T08:00:00Z'),
          lastActiveAt: new Date('2024-01-15T14:00:00Z')
        },
        {
          id: 'user-search-2',
          username: 'sarah.designer',
          email: 'sarah.designer@company.com',
          phoneNumber: '+33444555666',
          firstName: 'Sarah',
          lastName: 'Designer',
          role: 'USER' as const,
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
          regionalLanguage: 'fr',
          autoTranslateEnabled: false,
          translateToSystemLanguage: false,
          translateToRegionalLanguage: false,
          useCustomDestination: false,
          isOnline: false,
          createdAt: new Date('2024-01-05T09:30:00Z'),
          lastActiveAt: new Date('2024-01-14T17:15:00Z')
        }
      ];

      mockApiService.get.mockResolvedValue({
        data: searchResults,
        status: 200
      });

      const result = await groupsService.searchUsers('dev', 'group-789');

      expect(mockApiService.get).toHaveBeenCalledWith('/users/search', {
        search: 'dev',
        excludeGroup: 'group-789'
      });
      expect(result.data).toHaveLength(2);
      expect(result.data[0].username).toBe('thomas.dev');
      expect(result.data[1].username).toBe('sarah.designer');
    });

    it('should filter groups with complex criteria', async () => {
      const groupsResponse = {
        groups: [
          {
            ...mockGroup,
            id: 'group-1',
            name: 'Frontend Team',
            isPrivate: false
          },
          {
            ...mockGroup,
            id: 'group-2',
            name: 'Backend Team',
            isPrivate: true
          },
          {
            ...mockGroup,
            id: 'group-3',
            name: 'DevOps Team',
            isPrivate: false
          }
        ],
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3
      };

      mockApiService.get.mockResolvedValue({
        data: groupsResponse,
        status: 200
      });

      const filters = {
        page: 2,
        limit: 10,
        search: 'team',
        isPrivate: false,
        memberId: 'user-123'
      };

      const result = await groupsService.getGroups(filters);

      expect(mockApiService.get).toHaveBeenCalledWith('/groups', filters);
      expect(result.data.groups).toHaveLength(3);
      expect(result.data.total).toBe(25);
      expect(result.data.page).toBe(2);
      
      // Vérifier que le filtre isPrivate a été respecté dans les données de test
      const publicGroups = result.data.groups.filter(g => !g.isPrivate);
      expect(publicGroups).toHaveLength(2);
    });
  });

  describe('Invite Link Integration', () => {
    it('should generate and use invite links', async () => {
      // 1. Générer un lien d'invitation
      const inviteLink = {
        link: 'https://app.meeshy.me/join/group-789/inv_abc123def456',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 jours dans le futur
      };

      mockApiService.post.mockResolvedValueOnce({
        data: inviteLink,
        status: 200,
        message: 'Lien d\'invitation généré'
      });

      const linkResult = await groupsService.generateInviteLink('group-789', 7 * 24 * 60 * 60 * 1000);

      expect(mockApiService.post).toHaveBeenCalledWith('/groups/group-789/invite-link', {
        expiresIn: 7 * 24 * 60 * 60 * 1000
      });
      expect(linkResult.data.link).toContain('group-789');
      expect(linkResult.data.link).toContain('inv_abc123def456');
      expect(new Date(linkResult.data.expiresAt).getTime()).toBeGreaterThan(Date.now());

      // 2. Rejoindre via le lien
      const joinResponse = {
        group: mockGroup,
        member: {
          id: 'member-invited',
          userId: 'user-invited-789',
          groupId: 'group-789',
          role: 'MEMBER' as const,
          joinedAt: new Date('2024-01-15T16:30:00Z'),
          user: {
            id: 'user-invited-789',
            username: 'invited.user',
            email: 'invited@company.com',
            phoneNumber: '',
            firstName: 'Invited',
            lastName: 'User',
            systemLanguage: 'fr',
            regionalLanguage: 'fr',
            autoTranslateEnabled: true,
            translateToSystemLanguage: true,
            translateToRegionalLanguage: false,
            useCustomDestination: false,
            isOnline: true,
            createdAt: new Date('2024-01-15T16:30:00Z'),
            lastActiveAt: new Date('2024-01-15T16:30:00Z')
          }
        }
      };

      mockApiService.post.mockResolvedValueOnce({
        data: joinResponse,
        status: 200,
        message: 'Utilisateur ajouté au groupe'
      });

      const joinResult = await groupsService.joinGroupByInvite('inv_abc123def456');

      expect(mockApiService.post).toHaveBeenCalledWith('/groups/join-by-invite', {
        inviteCode: 'inv_abc123def456'
      });
      expect(joinResult.data.group.id).toBe('group-789');
      expect(joinResult.data.member.user.username).toBe('invited.user');
      expect(joinResult.data.member.role).toBe('MEMBER');
    });
  });

  describe('Error Scenarios Integration', () => {
    it('should handle validation errors properly', async () => {
      const validationError = {
        message: 'Le nom du groupe doit contenir au moins 3 caractères',
        status: 400,
        code: 'VALIDATION_ERROR'
      };

      mockApiService.post.mockRejectedValue(validationError);

      await expect(groupsService.createGroup({
        name: 'AB',
        isPrivate: false
      })).rejects.toMatchObject({
        message: 'Le nom du groupe doit contenir au moins 3 caractères',
        status: 400,
        code: 'VALIDATION_ERROR'
      });
    });

    it('should handle permission errors', async () => {
      const permissionError = {
        message: 'Vous n\'avez pas les permissions pour effectuer cette action',
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS'
      };

      mockApiService.patch.mockRejectedValue(permissionError);

      await expect(groupsService.updateGroup('group-789', { name: 'Nouveau nom' }))
        .rejects.toMatchObject({
          message: 'Vous n\'avez pas les permissions pour effectuer cette action',
          status: 403
        });
    });

    it('should handle network timeouts', async () => {
      const timeoutError = new Error('Network timeout');
      timeoutError.name = 'TimeoutError';

      mockApiService.get.mockRejectedValue(timeoutError);

      await expect(groupsService.getGroupById('group-789')).rejects.toThrow('Network timeout');
    });
  });

  describe('Performance and Concurrency Integration', () => {
    it('should handle concurrent API calls correctly', async () => {
      const groupIds = ['group-1', 'group-2', 'group-3'];
      
      // Simuler des réponses pour chaque groupe
      groupIds.forEach((id, index) => {
        mockApiService.get.mockResolvedValueOnce({
          data: {
            ...mockGroup,
            id,
            name: `Groupe ${index + 1}`,
            members: [
              {
                ...mockGroupMember,
                groupId: id,
                user: {
                  ...mockUser,
                  id: `user-${index + 1}`
                }
              }
            ]
          },
          status: 200
        });
      });

      // Lancer les appels en parallèle
      const promises = groupIds.map(id => groupsService.getGroupById(id));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.data.id).toBe(groupIds[index]);
        expect(result.data.name).toBe(`Groupe ${index + 1}`);
        expect(result.status).toBe(200);
      });

      expect(mockApiService.get).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed success/failure in batch operations', async () => {
      const operations = [
        () => groupsService.getGroupById('group-success'),
        () => groupsService.getGroupById('group-not-found'),
        () => groupsService.getGroupById('group-forbidden')
      ];

      // Premier appel réussit
      mockApiService.get.mockResolvedValueOnce({
        data: mockGroup,
        status: 200
      });

      // Deuxième appel échoue (404)
      mockApiService.get.mockRejectedValueOnce({
        message: 'Groupe non trouvé',
        status: 404,
        code: 'GROUP_NOT_FOUND'
      });

      // Troisième appel échoue (403)
      mockApiService.get.mockRejectedValueOnce({
        message: 'Accès interdit',
        status: 403,
        code: 'FORBIDDEN'
      });

      const results = await Promise.allSettled(operations.map(op => op()));

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('rejected');

      if (results[0].status === 'fulfilled') {
        expect(results[0].value.data.id).toBe('group-789');
      }

      if (results[1].status === 'rejected') {
        expect(results[1].reason.status).toBe(404);
      }

      if (results[2].status === 'rejected') {
        expect(results[2].reason.status).toBe(403);
      }
    });
  });
});
