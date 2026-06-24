'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { storyService } from '@/services/story.service';
import { useAuthStore } from '@/stores/auth-store';

// ============================================================================
// useStoryViewersQuery
//
// Fetches the list of users who viewed a story (`GET /posts/:id/views`). Only
// the story author may meaningfully see this, so callers gate `enabled` on
// authorship. Kept short-lived (the view list grows while the story is open).
// ============================================================================

interface UseStoryViewersOptions {
  enabled?: boolean;
}

export function useStoryViewersQuery(
  storyId: string | null | undefined,
  options: UseStoryViewersOptions = {},
) {
  const { enabled = true } = options;
  const token = useAuthStore((s) => s.authToken);

  return useQuery({
    queryKey: queryKeys.stories.viewers(storyId ?? ''),
    queryFn: () => storyService.getViewers(storyId as string),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: enabled && !!token && !!storyId,
  });
}
