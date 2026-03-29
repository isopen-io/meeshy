import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { communitiesService } from '@/services/communities.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import type {
  UserCommunityPreferences,
  UpdateUserCommunityPreferencesRequest,
} from '@meeshy/shared/types';

export function useCommunityPreferencesQuery(communityId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.communities.preferences.detail(communityId ?? ''),
    queryFn: () => communitiesService.getPreferences(communityId!),
    enabled: !!communityId,
    select: (response) => response.data as UserCommunityPreferences,
  });
}

export function useCommunityPreferencesListQuery() {
  return useQuery({
    queryKey: queryKeys.communities.preferences.list(),
    queryFn: () => communitiesService.listPreferences(),
    select: (response) => response.data as UserCommunityPreferences[],
  });
}

export function useUpdateCommunityPreferencesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      communityId,
      data,
    }: {
      communityId: string;
      data: UpdateUserCommunityPreferencesRequest;
    }) => communitiesService.updatePreferences(communityId, data),
    onSuccess: (_, { communityId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.communities.preferences.detail(communityId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.communities.preferences.list(),
      });
    },
  });
}

export function useDeleteCommunityPreferencesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (communityId: string) => communitiesService.deletePreferences(communityId),
    onSuccess: (_, communityId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.communities.preferences.detail(communityId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.communities.preferences.list(),
      });
    },
  });
}

export function useReorderCommunitiesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: readonly { communityId: string; orderInCategory: number }[]) =>
      communitiesService.reorderPreferences(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.communities.preferences.list(),
      });
    },
  });
}
