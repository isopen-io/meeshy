'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { postsService } from '@/services/posts.service';

interface UseStatusesQueryOptions {
  limit?: number;
  enabled?: boolean;
}

export function useStatusesQuery(options: UseStatusesQueryOptions = {}) {
  const { limit = 20, enabled = true } = options;

  return useInfiniteQuery({
    queryKey: queryKeys.posts.statuses(),
    queryFn: ({ pageParam }) =>
      postsService.getStatuses({
        cursor: pageParam as string | undefined,
        limit,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta?.nextCursor ?? undefined,
    enabled,
  });
}

interface UseUserPostsQueryOptions {
  userId: string;
  limit?: number;
  enabled?: boolean;
}

export function useUserPostsQuery(options: UseUserPostsQueryOptions) {
  const { userId, limit = 20, enabled = true } = options;

  return useInfiniteQuery({
    queryKey: queryKeys.posts.userPosts(userId),
    queryFn: ({ pageParam }) =>
      postsService.getUserPosts(userId, {
        cursor: pageParam as string | undefined,
        limit,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta?.nextCursor ?? undefined,
    enabled: !!userId && enabled,
  });
}

interface UseBookmarksQueryOptions {
  limit?: number;
  enabled?: boolean;
}

export function useBookmarksQuery(options: UseBookmarksQueryOptions = {}) {
  const { limit = 20, enabled = true } = options;

  return useInfiniteQuery({
    queryKey: queryKeys.posts.bookmarks(),
    queryFn: ({ pageParam }) =>
      postsService.getBookmarks({
        cursor: pageParam as string | undefined,
        limit,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta?.nextCursor ?? undefined,
    enabled,
  });
}
