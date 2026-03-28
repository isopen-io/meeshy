import { apiService } from './api.service';
import type {
  Community,
  CommunityMember,
  CreateCommunityData,
  UpdateCommunityData,
  AddCommunityMemberData,
  UpdateMemberRoleData,
  Conversation,
  ApiResponse,
  UserCommunityPreferences,
  UpdateUserCommunityPreferencesRequest,
} from '@meeshy/shared/types';

interface CommunitySearchParams {
  readonly search?: string;
  readonly offset?: number;
  readonly limit?: number;
}

interface IdentifierAvailability {
  readonly available: boolean;
  readonly identifier: string;
}

interface ReorderItem {
  readonly communityId: string;
  readonly orderInCategory: number;
}

export const communitiesService = {
  getCommunities(params?: CommunitySearchParams): Promise<ApiResponse<Community[]>> {
    const queryParams: Record<string, unknown> = {};
    if (params?.search) queryParams.search = params.search;
    if (params?.offset !== undefined) queryParams.offset = params.offset;
    if (params?.limit !== undefined) queryParams.limit = params.limit;
    return apiService.get<Community[]>('/communities', queryParams);
  },

  getCommunity(id: string): Promise<ApiResponse<Community>> {
    return apiService.get<Community>(`/communities/${id}`);
  },

  searchCommunities(query: string, offset = 0, limit = 20): Promise<ApiResponse<Community[]>> {
    return apiService.get<Community[]>('/communities/search', { q: query, offset, limit });
  },

  checkIdentifier(identifier: string): Promise<ApiResponse<IdentifierAvailability>> {
    return apiService.get<IdentifierAvailability>(
      `/communities/check-identifier/${encodeURIComponent(identifier)}`
    );
  },

  getCommunityConversations(communityId: string): Promise<ApiResponse<Conversation[]>> {
    return apiService.get<Conversation[]>(`/communities/${communityId}/conversations`);
  },

  createCommunity(data: CreateCommunityData): Promise<ApiResponse<Community>> {
    return apiService.post<Community>('/communities', data);
  },

  updateCommunity(id: string, data: UpdateCommunityData): Promise<ApiResponse<Community>> {
    return apiService.put<Community>(`/communities/${id}`, data);
  },

  deleteCommunity(id: string): Promise<ApiResponse<void>> {
    return apiService.delete<void>(`/communities/${id}`);
  },

  getMembers(communityId: string, offset = 0, limit = 50): Promise<ApiResponse<CommunityMember[]>> {
    return apiService.get<CommunityMember[]>(
      `/communities/${communityId}/members`,
      { offset, limit }
    );
  },

  addMember(communityId: string, data: AddCommunityMemberData): Promise<ApiResponse<CommunityMember>> {
    return apiService.post<CommunityMember>(`/communities/${communityId}/members`, data);
  },

  updateMemberRole(communityId: string, memberId: string, data: UpdateMemberRoleData): Promise<ApiResponse<CommunityMember>> {
    return apiService.patch<CommunityMember>(
      `/communities/${communityId}/members/${memberId}/role`,
      data
    );
  },

  removeMember(communityId: string, memberId: string): Promise<ApiResponse<void>> {
    return apiService.delete<void>(`/communities/${communityId}/members/${memberId}`);
  },

  // TODO: Backend join/leave routes need to be migrated from legacy monolith to modular routes
  // For now, join = addMember(self), leave = removeMember(self)
  joinCommunity(communityId: string): Promise<ApiResponse<CommunityMember>> {
    return apiService.post<CommunityMember>(`/communities/${communityId}/join`);
  },

  leaveCommunity(communityId: string): Promise<ApiResponse<void>> {
    return apiService.post<void>(`/communities/${communityId}/leave`);
  },

  getPreferences(communityId: string): Promise<ApiResponse<UserCommunityPreferences>> {
    return apiService.get<UserCommunityPreferences>(
      `/user-preferences/communities/${communityId}`
    );
  },

  listPreferences(offset = 0, limit = 50): Promise<ApiResponse<UserCommunityPreferences[]>> {
    return apiService.get<UserCommunityPreferences[]>(
      '/user-preferences/communities',
      { offset, limit }
    );
  },

  updatePreferences(
    communityId: string,
    data: UpdateUserCommunityPreferencesRequest
  ): Promise<ApiResponse<UserCommunityPreferences>> {
    return apiService.put<UserCommunityPreferences>(
      `/user-preferences/communities/${communityId}`,
      data
    );
  },

  deletePreferences(communityId: string): Promise<ApiResponse<void>> {
    return apiService.delete<void>(`/user-preferences/communities/${communityId}`);
  },

  reorderPreferences(updates: readonly ReorderItem[]): Promise<ApiResponse<void>> {
    return apiService.post<void>('/user-preferences/communities/reorder', { updates });
  },
};
