'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { postsService } from '@/services/posts.service';
import type { Post } from '@meeshy/shared/types/post';
import { useCallback } from 'react';

interface UseFeedQueryOptions {
  limit?: number;
  enabled?: boolean;
}

export function useFeedQuery(options: UseFeedQueryOptions = {}) {
  const { limit = 20, enabled = true } = options;

  return useInfiniteQuery({
    queryKey: queryKeys.posts.infinite('feed'),
    queryFn: ({ pageParam }) =>
      postsService.getFeed({
        cursor: pageParam as string | undefined,
        limit,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta?.nextCursor ?? undefined,
    enabled,
  });
}

export function usePrefetchPost() {
  const queryClient = useQueryClient();

  return useCallback(
    (postId: string) => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.posts.detail(postId),
        queryFn: () => postsService.getPost(postId),
        staleTime: 30_000,
      });
    },
    [queryClient],
  );
}

export function useFeedPosts(feedQuery: ReturnType<typeof useFeedQuery>): Post[] {
  if (!feedQuery.data) return [];
  // Dédup défensive par id (aligné sur iOS FeedViewModel). Le curseur serveur
  // chronologique garantit déjà des pages disjointes, mais un post poussé en
  // temps réel puis re-fetché dans une page peut se chevaucher : on garde la
  // première occurrence pour éviter doublons d'affichage et collisions de key.
  const seen = new Set<string>();
  const posts: Post[] = [];
  for (const page of feedQuery.data.pages) {
    for (const post of page.data) {
      if (seen.has(post.id)) continue;
      seen.add(post.id);
      posts.push(post);
    }
  }
  return posts;
}
