'use client';

import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '@/services/api.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { BlockedUser } from '@/types/contacts';

export interface UseBlockedUsersV2Options {
  enabled?: boolean;
}

export interface UseBlockedUsersV2Return {
  blockedUsers: BlockedUser[];
  isLoading: boolean;
  error: string | null;
  blockUser: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
  isBlocked: (userId: string) => boolean;
  refresh: () => Promise<void>;
}

export function useBlockedUsersV2(
  options: UseBlockedUsersV2Options = {}
): UseBlockedUsersV2Return {
  const { enabled = true } = options;
  const queryClient = useQueryClient();

  const {
    data: blockedData,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.blockedUsers.list(),
    queryFn: async () => {
      const response = await apiService.get<{
        success: boolean;
        data: BlockedUser[];
      }>('/users/me/blocked-users');
      if (!response || typeof response !== 'object') return [];
      const outer = (response as unknown as Record<string, unknown>).data;
      if (!outer || typeof outer !== 'object') return [];
      const inner = (outer as Record<string, unknown>).data;
      return Array.isArray(inner) ? inner : [];
    },
    enabled,
  });

  const blockedUsers = useMemo(() => blockedData ?? [], [blockedData]);

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.blockedUsers.list() });
  }, [queryClient]);

  const blockMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiService.post(`/users/${userId}/block`);
    },
    onSettled: () => invalidate(),
  });

  const unblockMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiService.delete(`/users/${userId}/block`);
    },
    onMutate: async (userId: string) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.blockedUsers.list() });
      const previous = queryClient.getQueryData<BlockedUser[]>(queryKeys.blockedUsers.list());
      queryClient.setQueryData<BlockedUser[]>(queryKeys.blockedUsers.list(), (old) =>
        (old ?? []).filter((u) => u.id !== userId)
      );
      return { previous };
    },
    onError: (_err, _userId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.blockedUsers.list(), context.previous);
      }
    },
    onSettled: () => invalidate(),
  });

  const blockUser = useCallback(
    async (userId: string) => {
      await blockMutation.mutateAsync(userId);
    },
    [blockMutation]
  );

  const unblockUser = useCallback(
    async (userId: string) => {
      await unblockMutation.mutateAsync(userId);
    },
    [unblockMutation]
  );

  const isBlocked = useCallback(
    (userId: string) => blockedUsers.some((u) => u.id === userId),
    [blockedUsers]
  );

  return {
    blockedUsers,
    isLoading,
    error: error?.message ?? null,
    blockUser,
    unblockUser,
    isBlocked,
    refresh: invalidate,
  };
}
