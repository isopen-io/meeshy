'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { postsService } from '@/services/posts.service';
import type { CreatePostRequest, UpdatePostRequest, RepostRequest } from '@/services/posts.service';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { Post } from '@meeshy/shared/types/post';
import type { InfiniteFeedData } from './types';
import { useAuthStore } from '@/stores/auth-store';

const HEART_EMOJI = '❤️';
const SOCKET_ACK_TIMEOUT_MS = 10_000;

// Monotonic counter so two optimistic posts created within the same
// millisecond never collide on `_temp_${Date.now()}` (same React key +
// ambiguous reconciliation when the real post arrives).
let optimisticPostSeq = 0;
const nextOptimisticPostId = () => `_temp_${Date.now()}_${++optimisticPostSeq}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function patchPostInFeed(
  old: InfiniteFeedData | undefined,
  postId: string,
  patcher: (post: Post) => Post,
): InfiniteFeedData | undefined {
  if (!old) return old;
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      data: page.data.map((p) => (p.id === postId ? patcher(p) : p)),
    })),
  };
}

// The reels affinity threads (`/feed/reels`, `/reel/:id`) live under a separate
// cache key family (`posts.reelsFeed(seed)`) that the feed patchers above never
// touch. These helpers mirror the optimistic patch + rollback onto every cached
// reels thread so a like / bookmark gives instant feedback there too.
type QueryClientLike = ReturnType<typeof useQueryClient>;
type ReelsInfinite = { pages?: Array<{ data?: Post[] }> };

const reelsFeedKey = () => [...queryKeys.posts.lists(), 'reels'];

function snapshotReelsCaches(queryClient: QueryClientLike) {
  return queryClient.getQueriesData<ReelsInfinite>({ queryKey: reelsFeedKey() });
}

function patchPostInReelsCaches(
  queryClient: QueryClientLike,
  postId: string,
  patcher: (post: Post) => Post,
) {
  queryClient.setQueriesData<ReelsInfinite>({ queryKey: reelsFeedKey() }, (old) => {
    if (!old?.pages) return old;
    return {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        data: (page.data ?? []).map((p) => (p.id === postId ? patcher(p) : p)),
      })),
    };
  });
}

function restoreReelsCaches(
  queryClient: QueryClientLike,
  snapshot: ReturnType<typeof snapshotReelsCaches>,
) {
  for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
}


function removePostFromFeed(
  old: InfiniteFeedData | undefined,
  postId: string,
): InfiniteFeedData | undefined {
  if (!old) return old;
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      data: page.data.filter((p) => p.id !== postId),
    })),
  };
}

// ---------------------------------------------------------------------------
// Post CRUD mutations
// ---------------------------------------------------------------------------

export function useCreatePostMutation() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: (data: CreatePostRequest) => postsService.createPost(data),

    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.posts.infinite('feed') });

      const previous = queryClient.getQueryData<InfiniteFeedData>(queryKeys.posts.infinite('feed'));

      const optimisticPost: Post = {
        id: nextOptimisticPostId(),
        authorId: currentUser?.id ?? '',
        type: data.type ?? 'POST',
        visibility: data.visibility ?? 'PUBLIC',
        content: data.content ?? null,
        likeCount: 0,
        commentCount: 0,
        repostCount: 0,
        viewCount: 0,
        bookmarkCount: 0,
        shareCount: 0,
        isPinned: false,
        isEdited: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: currentUser ? {
          id: currentUser.id,
          username: currentUser.username,
          displayName: currentUser.displayName,
          avatar: currentUser.avatar,
        } : undefined,
      };

      queryClient.setQueryData<InfiniteFeedData>(
        queryKeys.posts.infinite('feed'),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page, i) =>
              i === 0
                ? { ...page, data: [optimisticPost, ...page.data] }
                : page,
            ),
          };
        },
      );

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.posts.infinite('feed'), context.previous);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.lists() });
    },
  });
}

export function useUpdatePostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId, data }: { postId: string; data: UpdatePostRequest }) =>
      postsService.updatePost(postId, data),

    onMutate: async ({ postId, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.posts.infinite('feed') });
      const previous = queryClient.getQueryData<InfiniteFeedData>(queryKeys.posts.infinite('feed'));

      queryClient.setQueryData<InfiniteFeedData>(
        queryKeys.posts.infinite('feed'),
        (old) => patchPostInFeed(old, postId, (p) => ({
          ...p,
          ...data,
          isEdited: true,
          updatedAt: new Date().toISOString(),
        } as Post)),
      );

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.posts.infinite('feed'), context.previous);
      }
    },

    onSettled: (_data, _err, { postId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.detail(postId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.lists() });
    },
  });
}

export function useDeletePostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (postId: string) => postsService.deletePost(postId),

    onMutate: async (postId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.posts.infinite('feed') });
      const previous = queryClient.getQueryData<InfiniteFeedData>(queryKeys.posts.infinite('feed'));

      queryClient.setQueryData<InfiniteFeedData>(
        queryKeys.posts.infinite('feed'),
        (old) => removePostFromFeed(old, postId),
      );

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.posts.infinite('feed'), context.previous);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.lists() });
    },
  });
}

// ---------------------------------------------------------------------------
// Interaction mutations
// ---------------------------------------------------------------------------

export function useLikePostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId, emoji = HEART_EMOJI }: { postId: string; emoji?: string }) =>
      new Promise<void>((resolve, reject) => {
        const socket = meeshySocketIOService.getSocket();
        if (!socket?.connected) {
          reject(new Error('Socket not connected'));
          return;
        }

        const timer = setTimeout(() => reject(new Error('Socket ack timeout')), SOCKET_ACK_TIMEOUT_MS);

        socket.emit(
          CLIENT_EVENTS.POST_REACTION_ADD,
          { postId, emoji },
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

    onMutate: async ({ postId, emoji = HEART_EMOJI }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.posts.infinite('feed') });
      const previous = queryClient.getQueryData<InfiniteFeedData>(queryKeys.posts.infinite('feed'));
      const previousReels = snapshotReelsCaches(queryClient);

      const patcher = (p: Post): Post => ({
        ...p,
        likeCount: p.likeCount + 1,
        reactionSummary: {
          ...p.reactionSummary,
          [emoji]: ((p.reactionSummary ?? {})[emoji] ?? 0) + 1,
        },
        currentUserReactions: (p.currentUserReactions ?? []).includes(emoji)
          ? p.currentUserReactions
          : [...(p.currentUserReactions ?? []), emoji],
      });

      queryClient.setQueryData<InfiniteFeedData>(
        queryKeys.posts.infinite('feed'),
        (old) => patchPostInFeed(old, postId, patcher),
      );
      patchPostInReelsCaches(queryClient, postId, patcher);

      return { previous, previousReels };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.posts.infinite('feed'), context.previous);
      }
      if (context?.previousReels) restoreReelsCaches(queryClient, context.previousReels);
    },
  });
}

export function useUnlikePostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId, emoji = HEART_EMOJI }: { postId: string; emoji?: string }) =>
      new Promise<void>((resolve, reject) => {
        const socket = meeshySocketIOService.getSocket();
        if (!socket?.connected) {
          reject(new Error('Socket not connected'));
          return;
        }

        const timer = setTimeout(() => reject(new Error('Socket ack timeout')), SOCKET_ACK_TIMEOUT_MS);

        socket.emit(
          CLIENT_EVENTS.POST_REACTION_REMOVE,
          { postId, emoji },
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

    onMutate: async ({ postId, emoji = HEART_EMOJI }: { postId: string; emoji?: string }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.posts.infinite('feed') });
      const previous = queryClient.getQueryData<InfiniteFeedData>(queryKeys.posts.infinite('feed'));
      const previousReels = snapshotReelsCaches(queryClient);

      const patcher = (p: Post): Post => ({
        ...p,
        likeCount: Math.max(0, p.likeCount - 1),
        reactionSummary: {
          ...p.reactionSummary,
          [emoji]: Math.max(0, ((p.reactionSummary ?? {})[emoji] ?? 1) - 1),
        },
        currentUserReactions: (p.currentUserReactions ?? []).filter((e) => e !== emoji),
      });

      queryClient.setQueryData<InfiniteFeedData>(
        queryKeys.posts.infinite('feed'),
        (old) => patchPostInFeed(old, postId, patcher),
      );
      patchPostInReelsCaches(queryClient, postId, patcher);

      return { previous, previousReels };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.posts.infinite('feed'), context.previous);
      }
      if (context?.previousReels) restoreReelsCaches(queryClient, context.previousReels);
    },
  });
}

export function useBookmarkPostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (postId: string) => postsService.bookmarkPost(postId),

    onMutate: async (postId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.posts.infinite('feed') });
      const previous = queryClient.getQueryData<InfiniteFeedData>(queryKeys.posts.infinite('feed'));
      const previousReels = snapshotReelsCaches(queryClient);

      const patcher = (p: Post): Post => ({
        ...p,
        bookmarkCount: p.bookmarkCount + 1,
        bookmarkedAt: p.bookmarkedAt ?? new Date().toISOString(),
      });

      queryClient.setQueryData<InfiniteFeedData>(
        queryKeys.posts.infinite('feed'),
        (old) => patchPostInFeed(old, postId, patcher),
      );
      patchPostInReelsCaches(queryClient, postId, patcher);

      return { previous, previousReels };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.posts.infinite('feed'), context.previous);
      }
      if (context?.previousReels) restoreReelsCaches(queryClient, context.previousReels);
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.bookmarks() });
    },
  });
}

export function useUnbookmarkPostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (postId: string) => postsService.unbookmarkPost(postId),

    onMutate: async (postId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.posts.infinite('feed') });
      const previous = queryClient.getQueryData<InfiniteFeedData>(queryKeys.posts.infinite('feed'));
      const previousReels = snapshotReelsCaches(queryClient);

      const patcher = (p: Post): Post => ({
        ...p,
        bookmarkCount: Math.max(0, p.bookmarkCount - 1),
        bookmarkedAt: null,
      });

      queryClient.setQueryData<InfiniteFeedData>(
        queryKeys.posts.infinite('feed'),
        (old) => patchPostInFeed(old, postId, patcher),
      );
      patchPostInReelsCaches(queryClient, postId, patcher);

      return { previous, previousReels };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.posts.infinite('feed'), context.previous);
      }
      if (context?.previousReels) restoreReelsCaches(queryClient, context.previousReels);
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.bookmarks() });
    },
  });
}

export function useRepostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId, data }: { postId: string; data?: RepostRequest }) =>
      postsService.repost(postId, data),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.lists() });
    },
  });
}

export function useSharePostMutation() {
  return useMutation({
    mutationFn: ({ postId, platform }: { postId: string; platform?: string }) =>
      postsService.sharePost(postId, platform),
  });
}

export function usePinPostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId, pin }: { postId: string; pin: boolean }) =>
      pin ? postsService.pinPost(postId) : postsService.unpinPost(postId),

    onMutate: async ({ postId, pin }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.posts.infinite('feed') });
      const previous = queryClient.getQueryData<InfiniteFeedData>(queryKeys.posts.infinite('feed'));

      queryClient.setQueryData<InfiniteFeedData>(
        queryKeys.posts.infinite('feed'),
        (old) => patchPostInFeed(old, postId, (p) => ({ ...p, isPinned: pin })),
      );

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.posts.infinite('feed'), context.previous);
      }
    },
  });
}

export function useTranslatePostMutation() {
  return useMutation({
    mutationFn: ({ postId, targetLanguage }: { postId: string; targetLanguage: string }) =>
      postsService.translatePost(postId, targetLanguage),
  });
}
