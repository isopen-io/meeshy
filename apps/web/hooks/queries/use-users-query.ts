import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersService, UpdateUserDto } from '@/services/users.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import { broadcastUserUpdate } from '@/lib/settings-sync';
import type { User } from '@/types';

export function useCurrentUserQuery() {
  return useQuery({
    queryKey: queryKeys.users.current(),
    queryFn: async () => {
      const response = await usersService.getMyProfile();
      return response.data;
    },
    // staleTime: Infinity (défini globalement)
  });
}

export function useUserProfileQuery(userId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.users.profile(userId ?? ''),
    queryFn: async () => {
      const response = await usersService.getUserProfile(userId!);
      return response.data;
    },
    // staleTime: Infinity (défini globalement)
    enabled: !!userId,
  });
}

export function useUserStatsQuery(userId: string | null | undefined) {
  return useQuery({
    queryKey: [...queryKeys.users.detail(userId ?? ''), 'stats'],
    queryFn: async () => {
      const response = await usersService.getUserStats(userId!);
      return response.data;
    },
    // staleTime: Infinity (défini globalement)
    enabled: !!userId,
  });
}

export function useDashboardStatsQuery() {
  return useQuery({
    queryKey: [...queryKeys.users.current(), 'dashboard-stats'],
    queryFn: async () => {
      const response = await usersService.getDashboardStats();
      return response.data;
    },
    // staleTime: Infinity (défini globalement)
  });
}

export function useSearchUsersQuery(query: string) {
  return useQuery({
    queryKey: [...queryKeys.users.all, 'search', query],
    queryFn: () => usersService.searchUsers(query),
    // Recherche : données éphémères, pas de cache long
    gcTime: 5 * 60 * 1000, // 5 min
    enabled: query.length >= 2,
  });
}

export function useUpdateUserProfileMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateUserDto) => usersService.updateMyProfile(data),
    onSuccess: (response) => {
      const userData = (response.data as any)?.user ?? response.data;
      queryClient.setQueryData<User>(queryKeys.users.current(), userData);
      queryClient.invalidateQueries({ queryKey: queryKeys.users.current() });
      broadcastUserUpdate();
    },
  });
}
