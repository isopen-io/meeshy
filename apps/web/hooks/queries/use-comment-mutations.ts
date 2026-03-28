'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { postsService } from '@/services/posts.service';
import type { Post, PostComment } from '@meeshy/shared/types/post';
import { useAuthStore } from '@/stores/auth-store';

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

interface CommentPage {
  data: PostComment[];
  meta: { pagination: { total: number; offset: number; limit: number; hasMore: boolean }; nextCursor: string | null };
}

interface InfiniteCommentsData {
  pages: CommentPage[];
  pageParams: (string | undefined)[];
}

interface FeedPage {
  data: Post[];
  meta: { pagination: { total: number; offset: number; limit: number; hasMore: boolean }; nextCursor: string | null };
}

interface InfiniteFeedData {
  pages: FeedPage[];
  pageParams: (string | undefined)[];
}

function patchCommentCountInFeed(
  queryClient: ReturnType<typeof useQueryClient>,
  postId: string,
  delta: number,
) {
  queryClient.setQueryData<InfiniteFeedData>(
    queryKeys.posts.infinite('feed'),
    (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          data: page.data.map((p) =>
            p.id === postId
              ? { ...p, commentCount: Math.max(0, p.commentCount + delta) }
              : p,
          ),
        })),
      };
    },
  );
}

// ---------------------------------------------------------------------------
// Comment mutations
// ---------------------------------------------------------------------------

export function useCreateCommentMutation() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: ({ postId, content, parentId }: { postId: string; content: string; parentId?: string }) =>
      postsService.createComment(postId, content, parentId),

    onMutate: async ({ postId, content, parentId }) => {
      const commentsKey = queryKeys.posts.commentsInfinite(postId);
      await queryClient.cancelQueries({ queryKey: commentsKey });

      const previousComments = queryClient.getQueryData<InfiniteCommentsData>(commentsKey);
      const previousFeed = queryClient.getQueryData<InfiniteFeedData>(queryKeys.posts.infinite('feed'));

      if (!parentId) {
        const optimisticComment: PostComment = {
          id: `_temp_${Date.now()}`,
          postId,
          authorId: currentUser?.id ?? '',
          parentId: null,
          content,
          likeCount: 0,
          replyCount: 0,
          createdAt: new Date().toISOString(),
          author: currentUser ? {
            id: currentUser.id,
            username: currentUser.username,
            displayName: currentUser.displayName,
            avatar: currentUser.avatar,
          } : undefined,
        };

        queryClient.setQueryData<InfiniteCommentsData>(commentsKey, (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page, i) =>
              i === 0
                ? { ...page, data: [optimisticComment, ...page.data] }
                : page,
            ),
          };
        });
      }

      patchCommentCountInFeed(queryClient, postId, 1);

      return { previousComments, previousFeed };
    },

    onError: (_err, { postId }, context) => {
      if (context?.previousComments) {
        queryClient.setQueryData(queryKeys.posts.commentsInfinite(postId), context.previousComments);
      }
      if (context?.previousFeed) {
        queryClient.setQueryData(queryKeys.posts.infinite('feed'), context.previousFeed);
      }
    },

    onSettled: (_data, _err, { postId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.comments(postId) });
    },
  });
}

export function useDeleteCommentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId, commentId }: { postId: string; commentId: string }) =>
      postsService.deleteComment(postId, commentId),

    onMutate: async ({ postId, commentId }) => {
      const commentsKey = queryKeys.posts.commentsInfinite(postId);
      await queryClient.cancelQueries({ queryKey: commentsKey });

      const previousComments = queryClient.getQueryData<InfiniteCommentsData>(commentsKey);
      const previousFeed = queryClient.getQueryData<InfiniteFeedData>(queryKeys.posts.infinite('feed'));

      queryClient.setQueryData<InfiniteCommentsData>(commentsKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            data: page.data.filter((c) => c.id !== commentId),
          })),
        };
      });

      patchCommentCountInFeed(queryClient, postId, -1);

      return { previousComments, previousFeed };
    },

    onError: (_err, { postId }, context) => {
      if (context?.previousComments) {
        queryClient.setQueryData(queryKeys.posts.commentsInfinite(postId), context.previousComments);
      }
      if (context?.previousFeed) {
        queryClient.setQueryData(queryKeys.posts.infinite('feed'), context.previousFeed);
      }
    },

    onSettled: (_data, _err, { postId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.comments(postId) });
    },
  });
}

export function useLikeCommentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId, commentId, emoji }: { postId: string; commentId: string; emoji?: string }) =>
      postsService.likeComment(postId, commentId, emoji),

    onMutate: async ({ postId, commentId, emoji = '❤️' }) => {
      const commentsKey = queryKeys.posts.commentsInfinite(postId);
      await queryClient.cancelQueries({ queryKey: commentsKey });
      const previous = queryClient.getQueryData<InfiniteCommentsData>(commentsKey);

      queryClient.setQueryData<InfiniteCommentsData>(commentsKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            data: page.data.map((c) =>
              c.id === commentId
                ? {
                    ...c,
                    likeCount: c.likeCount + 1,
                    reactionSummary: {
                      ...c.reactionSummary,
                      [emoji]: ((c.reactionSummary ?? {})[emoji] ?? 0) + 1,
                    },
                  }
                : c,
            ),
          })),
        };
      });

      return { previous };
    },

    onError: (_err, { postId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.posts.commentsInfinite(postId), context.previous);
      }
    },
  });
}

export function useUnlikeCommentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId, commentId }: { postId: string; commentId: string }) =>
      postsService.unlikeComment(postId, commentId),

    onMutate: async ({ postId, commentId }) => {
      const commentsKey = queryKeys.posts.commentsInfinite(postId);
      await queryClient.cancelQueries({ queryKey: commentsKey });
      const previous = queryClient.getQueryData<InfiniteCommentsData>(commentsKey);

      queryClient.setQueryData<InfiniteCommentsData>(commentsKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            data: page.data.map((c) =>
              c.id === commentId
                ? { ...c, likeCount: Math.max(0, c.likeCount - 1) }
                : c,
            ),
          })),
        };
      });

      return { previous };
    },

    onError: (_err, { postId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.posts.commentsInfinite(postId), context.previous);
      }
    },
  });
}
