'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { postsService } from '@/services/posts.service';
import { useAuthStore } from '@/stores/auth-store';
import type { Post, PostVisibility } from '@meeshy/shared/types/post';

// ============================================================================
// useStatusesFeedQuery
//
// Ephemeral "mood" statuses are Posts with `type: 'STATUS'`. The query is keyed
// by `queryKeys.posts.statuses()` — the SAME key `usePostSocketCacheSync`
// invalidates on status:created / updated / deleted / reacted — so the bar
// refreshes in real time without a bespoke socket subscription.
// ============================================================================

interface UseStatusesFeedOptions {
  enabled?: boolean;
}

export function useStatusesFeedQuery(options: UseStatusesFeedOptions = {}) {
  const { enabled = true } = options;
  const token = useAuthStore((s) => s.authToken);

  return useQuery({
    queryKey: queryKeys.posts.statuses(),
    queryFn: async () => {
      const response = await postsService.getStatuses();
      return response.data;
    },
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: enabled && !!token,
  });
}

// ============================================================================
// useStatusesList — flatten helper (defensive: query may be undefined)
// ============================================================================

export function useStatusesList(query: { data?: Post[] }): Post[] {
  return query.data ?? [];
}

// ============================================================================
// useCreateStatusMutation
// ============================================================================

export interface CreateStatusInput {
  moodEmoji: string;
  content?: string;
  visibility?: PostVisibility;
  originalLanguage?: string;
}

export function useCreateStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateStatusInput) =>
      postsService.createPost({
        type: 'STATUS',
        moodEmoji: input.moodEmoji,
        content: input.content,
        visibility: input.visibility ?? 'PUBLIC',
        originalLanguage: input.originalLanguage,
      }),

    onSuccess: (result) => {
      queryClient.setQueryData<Post[]>(queryKeys.posts.statuses(), (old) => {
        const created = result?.data;
        if (!created) return old;
        const existing = old ?? [];
        if (existing.some((s) => s.id === created.id)) return existing;
        return [created, ...existing];
      });
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.statuses() });
    },
  });
}
