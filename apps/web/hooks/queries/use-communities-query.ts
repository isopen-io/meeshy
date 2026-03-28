import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { communitiesService } from '@/services/communities.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import type {
  Community,
  CommunityMember,
  Conversation,
  CreateCommunityData,
  UpdateCommunityData,
  AddCommunityMemberData,
  UpdateMemberRoleData,
} from '@meeshy/shared/types';

interface UseCommunitiesQueryOptions {
  search?: string;
  enabled?: boolean;
}

export function useCommunitiesQuery(options: UseCommunitiesQueryOptions = {}) {
  const { search, enabled = true } = options;

  return useQuery({
    queryKey: queryKeys.communities.list({ search }),
    queryFn: () => communitiesService.getCommunities({ search }),
    enabled,
    select: (response) => response.data as Community[],
  });
}

export function useCommunityQuery(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.communities.detail(id ?? ''),
    queryFn: () => communitiesService.getCommunity(id!),
    enabled: !!id,
    select: (response) => response.data as Community,
  });
}

interface UseCommunitySearchOptions {
  offset?: number;
  limit?: number;
}

export function useCommunitySearchQuery(
  query: string,
  options: UseCommunitySearchOptions = {}
) {
  const { offset = 0, limit = 20 } = options;

  return useQuery({
    queryKey: queryKeys.communities.search(query),
    queryFn: () => communitiesService.searchCommunities(query, offset, limit),
    enabled: query.length >= 2,
    select: (response) => response.data as Community[],
  });
}

export function useCommunityConversationsQuery(communityId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.communities.conversations(communityId ?? ''),
    queryFn: () => communitiesService.getCommunityConversations(communityId!),
    enabled: !!communityId,
    select: (response) => response.data as Conversation[],
  });
}

export function useCommunityMembersQuery(communityId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.communities.members(communityId ?? ''),
    queryFn: () => communitiesService.getMembers(communityId!),
    enabled: !!communityId,
    select: (response) => response.data as CommunityMember[],
  });
}

export function useCheckIdentifierQuery(identifier: string) {
  return useQuery({
    queryKey: queryKeys.communities.identifierCheck(identifier),
    queryFn: () => communitiesService.checkIdentifier(identifier),
    enabled: identifier.length > 0,
    select: (response) => response.data,
  });
}

export function useCreateCommunityMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCommunityData) => communitiesService.createCommunity(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.lists() });
    },
  });
}

export function useUpdateCommunityMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCommunityData }) =>
      communitiesService.updateCommunity(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.detail(id) });
    },
  });
}

export function useDeleteCommunityMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => communitiesService.deleteCommunity(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.lists() });
      queryClient.removeQueries({ queryKey: queryKeys.communities.detail(id) });
    },
  });
}

export function useJoinCommunityMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (communityId: string) => communitiesService.joinCommunity(communityId),
    onSuccess: (_, communityId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.detail(communityId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.members(communityId) });
    },
  });
}

export function useLeaveCommunityMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (communityId: string) => communitiesService.leaveCommunity(communityId),
    onSuccess: (_, communityId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.detail(communityId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.members(communityId) });
    },
  });
}

export function useAddMemberMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      communityId,
      data,
    }: {
      communityId: string;
      data: AddCommunityMemberData;
    }) => communitiesService.addMember(communityId, data),
    onSuccess: (_, { communityId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.members(communityId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.detail(communityId) });
    },
  });
}

export function useRemoveMemberMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ communityId, memberId }: { communityId: string; memberId: string }) =>
      communitiesService.removeMember(communityId, memberId),
    onSuccess: (_, { communityId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.members(communityId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.detail(communityId) });
    },
  });
}

export function useUpdateMemberRoleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      communityId,
      memberId,
      data,
    }: {
      communityId: string;
      memberId: string;
      data: UpdateMemberRoleData;
    }) => communitiesService.updateMemberRole(communityId, memberId, data),
    onSuccess: (_, { communityId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.members(communityId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.communities.detail(communityId) });
    },
  });
}
