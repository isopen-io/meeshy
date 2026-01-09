import { apiService } from './api.service';
import type { ApiResponse } from '@meeshy/shared/types';
import { Group, GroupMember, User } from '@/types';

// Re-export ApiResponse for use in tests and other modules
export type { ApiResponse };

export interface CreateGroupDto {
  name: string;
  description?: string;
  isPrivate: boolean;
  maxMembers?: number;
}

export interface UpdateGroupDto {
  name?: string;
  description?: string;
  isPrivate?: boolean;
  maxMembers?: number;
}

export interface InviteMemberDto {
  userId: string;
  role?: 'ADMIN' | 'MEMBER';
}

export interface GroupFilters {
  page?: number;
  limit?: number;
  search?: string;
  isPrivate?: boolean;
  memberId?: string;
}

export interface GroupsResponse {
  groups: Group[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

class GroupsService {
  private readonly baseEndpoint = '/communities';

  /**
   * Récupère la liste des groupes avec filtres optionnels
   */
  async getGroups(filters?: GroupFilters): Promise<ApiResponse<GroupsResponse>> {
    return apiService.get<GroupsResponse>(this.baseEndpoint, filters as Record<string, unknown>);
  }

  /**
   * Récupère un groupe par son ID
   */
  async getGroupById(id: string): Promise<ApiResponse<Group>> {
    return apiService.get<Group>(`${this.baseEndpoint}/${id}`);
  }

  /**
   * Crée un nouveau groupe
   */
  async createGroup(groupData: CreateGroupDto): Promise<ApiResponse<Group>> {
    return apiService.post<Group>(this.baseEndpoint, groupData);
  }

  /**
   * Met à jour un groupe
   */
  async updateGroup(id: string, groupData: UpdateGroupDto): Promise<ApiResponse<Group>> {
    return apiService.patch<Group>(`${this.baseEndpoint}/${id}`, groupData);
  }

  /**
   * Supprime un groupe
   */
  async deleteGroup(id: string): Promise<ApiResponse<void>> {
    return apiService.delete<void>(`${this.baseEndpoint}/${id}`);
  }

  /**
   * Récupère les membres d'un groupe
   */
  async getGroupMembers(id: string): Promise<ApiResponse<GroupMember[]>> {
    return apiService.get<GroupMember[]>(`${this.baseEndpoint}/${id}/members`);
  }

  /**
   * Invite un utilisateur dans un groupe
   */
  async inviteMember(groupId: string, memberData: InviteMemberDto): Promise<ApiResponse<GroupMember>> {
    return apiService.post<GroupMember>(`${this.baseEndpoint}/${groupId}/members`, memberData);
  }

  /**
   * Met à jour le rôle d'un membre
   */
  async updateMemberRole(groupId: string, memberId: string, role: 'ADMIN' | 'MEMBER'): Promise<ApiResponse<GroupMember>> {
    return apiService.patch<GroupMember>(`${this.baseEndpoint}/${groupId}/members/${memberId}`, { role });
  }

  /**
   * Retire un membre du groupe
   */
  async removeMember(groupId: string, memberId: string): Promise<ApiResponse<void>> {
    return apiService.delete<void>(`${this.baseEndpoint}/${groupId}/members/${memberId}`);
  }

  /**
   * Quitte un groupe (utilisateur actuel)
   */
  async leaveGroup(groupId: string): Promise<ApiResponse<void>> {
    return apiService.post<void>(`${this.baseEndpoint}/${groupId}/leave`);
  }

  /**
   * Rejoint un groupe public
   */
  async joinGroup(groupId: string): Promise<ApiResponse<GroupMember>> {
    return apiService.post<GroupMember>(`${this.baseEndpoint}/${groupId}/join`);
  }

  /**
   * Recherche des utilisateurs pour invitation
   */
  async searchUsers(query: string, excludeGroupId?: string): Promise<ApiResponse<User[]>> {
    const params = { search: query, ...(excludeGroupId && { excludeGroup: excludeGroupId }) };
    return apiService.get<User[]>('/users/search', params);
  }

  /**
   * Génère un lien d'invitation pour un groupe
   */
  async generateInviteLink(groupId: string, expiresIn?: number): Promise<ApiResponse<{ link: string; expiresAt: Date }>> {
    return apiService.post<{ link: string; expiresAt: Date }>(`${this.baseEndpoint}/${groupId}/invite-link`, {
      expiresIn: expiresIn || 7 * 24 * 60 * 60 * 1000, // 7 jours par défaut
    });
  }

  /**
   * Rejoint un groupe via un lien d'invitation
   */
  async joinGroupByInvite(inviteCode: string): Promise<ApiResponse<{ group: Group; member: GroupMember }>> {
    return apiService.post<{ group: Group; member: GroupMember }>(`${this.baseEndpoint}/join-by-invite`, {
      inviteCode,
    });
  }
}

// Instance singleton
export const groupsService = new GroupsService();
export { GroupsService };
