'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { postsService } from '@/services/posts.service';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { Post, PostComment } from '@meeshy/shared/types/post';
import type { InfiniteFeedData, InfiniteCommentsData } from './types';
import { useAuthStore } from '@/stores/auth-store';
import { decrementReactionSummary } from '@/lib/reaction-summary';
import { HEART_EMOJI } from '@/lib/reactions';

const SOCKET_ACK_TIMEOUT_MS = 10_000;

// Monotonic counter so two optimistic comments created within the same
// millisecond never collide on `_temp_${Date.now()}` (which would give them
// the same React key + make socket/refetch reconciliation ambiguous).
let optimisticCommentSeq = 0;
const nextOptimisticCommentId = () => `_temp_${Date.now()}_${++optimisticCommentSeq}`;

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

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
          id: nextOptimisticCommentId(),
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
    mutationFn: ({ postId, commentId, emoji = HEART_EMOJI }: { postId: string; commentId: string; emoji?: string }) =>
      new Promise<void>((resolve, reject) => {
        const socket = meeshySocketIOService.getSocket();
        if (!socket?.connected) {
          reject(new Error('Socket not connected'));
          return;
        }

        const timer = setTimeout(() => reject(new Error('Socket ack timeout')), SOCKET_ACK_TIMEOUT_MS);

        socket.emit(
          CLIENT_EVENTS.COMMENT_REACTION_ADD,
          { commentId, postId, emoji },
          (response: { success: boolean; error?: string }) => {
            clearTimeout(timer);
            if (response.success) {
              resolve();
            } else {
              reject(new Error(response.error ?? 'Failed to add reaction'));
            }
          },
        );
      }),

    onMutate: async ({ postId, commentId, emoji = HEART_EMOJI }) => {
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
                    currentUserReactions: (c.currentUserReactions ?? []).includes(emoji)
                      ? c.currentUserReactions
                      : [...(c.currentUserReactions ?? []), emoji],
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
    mutationFn: ({ postId, commentId, emoji = HEART_EMOJI }: { postId: string; commentId: string; emoji?: string }) =>
      new Promise<void>((resolve, reject) => {
        const socket = meeshySocketIOService.getSocket();
        if (!socket?.connected) {
          reject(new Error('Socket not connected'));
          return;
        }

        const timer = setTimeout(() => reject(new Error('Socket ack timeout')), SOCKET_ACK_TIMEOUT_MS);

        socket.emit(
          CLIENT_EVENTS.COMMENT_REACTION_REMOVE,
          { commentId, postId, emoji },
          (response: { success: boolean; error?: string }) => {
            clearTimeout(timer);
            if (response.success) {
              resolve();
            } else {
              reject(new Error(response.error ?? 'Failed to remove reaction'));
            }
          },
        );
      }),

    onMutate: async ({ postId, commentId, emoji = HEART_EMOJI }: { postId: string; commentId: string; emoji?: string }) => {
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
                    likeCount: Math.max(0, c.likeCount - 1),
                    reactionSummary: decrementReactionSummary(c.reactionSummary, emoji),
                    currentUserReactions: (c.currentUserReactions ?? []).filter((e) => e !== emoji),
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
