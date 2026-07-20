'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { postsService } from '@/services/posts.service';
import type { Post } from '@meeshy/shared/types/post';

interface UseReelsFeedQueryOptions {
  /** Anchors the affinity thread to a reel opened from the feed. Omit for the "Pour toi" tab. */
  seed?: string;
  limit?: number;
  enabled?: boolean;
}

/**
 * Affinity-ranked reels thread (`GET /posts/feed/reels`).
 *
 * Without a `seed` it returns the personalised "Pour toi" thread (used by the
 * `/feed/reels` tab). With a `seed` it returns reels ranked by affinity to the
 * touched reel — the gateway EXCLUDES the seed itself, so callers that need it
 * shown first (deep-linked `/reel/:id`) prepend it client-side.
 */
export function useReelsFeedQuery(options: UseReelsFeedQueryOptions = {}) {
  const { seed, limit = 10, enabled = true } = options;

  return useInfiniteQuery({
    queryKey: queryKeys.posts.reelsFeed(seed),
    queryFn: ({ pageParam }) =>
      postsService.getReelsFeed({ seed, cursor: pageParam as string | undefined, limit }),
    initialPageParam: undefined as string | undefined,
    // Only advance when the gateway says there's more AND hands back a cursor —
    // guards against a fetch loop if it ever returns a stale cursor with
    // hasMore:false.
    getNextPageParam: (lastPage) =>
      lastPage.pagination?.hasMore ? lastPage.pagination?.nextCursor ?? undefined : undefined,
    enabled,
  });
}

/** Flattens the paginated reels into a de-duplicated list (first occurrence wins). */
export function useReelsFeedPosts(query: ReturnType<typeof useReelsFeedQuery>): Post[] {
  if (!query.data) return [];
  const seen = new Set<string>();
  const reels: Post[] = [];
  for (const page of query.data.pages) {
    for (const post of page.data) {
      if (seen.has(post.id)) continue;
      seen.add(post.id);
      reels.push(post);
    }
  }
  return reels;
}
