'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { postsService } from '@/services/posts.service';
import type { PostComment } from '@meeshy/shared/types/post';

interface UseCommentsQueryOptions {
  postId: string;
  limit?: number;
  enabled?: boolean;
}

export function useCommentsInfiniteQuery(options: UseCommentsQueryOptions) {
  const { postId, limit = 20, enabled = true } = options;

  return useInfiniteQuery({
    queryKey: queryKeys.posts.commentsInfinite(postId),
    queryFn: ({ pageParam }) =>
      postsService.getComments(postId, {
        cursor: pageParam as string | undefined,
        limit,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta?.nextCursor ?? undefined,
    enabled: !!postId && enabled,
  });
}

interface UseCommentRepliesOptions {
  postId: string;
  commentId: string;
  limit?: number;
  enabled?: boolean;
}

export function useCommentRepliesQuery(options: UseCommentRepliesOptions) {
  const { postId, commentId, limit = 20, enabled = true } = options;

  return useInfiniteQuery({
    queryKey: queryKeys.posts.commentReplies(postId, commentId),
    queryFn: ({ pageParam }) =>
      postsService.getCommentReplies(postId, commentId, {
        cursor: pageParam as string | undefined,
        limit,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta?.nextCursor ?? undefined,
    enabled: !!postId && !!commentId && enabled,
  });
}

export function useCommentsList(
  commentsQuery: ReturnType<typeof useCommentsInfiniteQuery>,
): PostComment[] {
  if (!commentsQuery.data) return [];
  return commentsQuery.data.pages.flatMap((page) => page.data);
}
