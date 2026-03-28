'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { postsService } from '@/services/posts.service';
import type { CreatePostRequest, UpdatePostRequest, RepostRequest } from '@/services/posts.service';
import type { Post } from '@meeshy/shared/types/post';
import { useAuthStore } from '@/stores/auth-store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FeedPage {
  data: Post[];
  meta: { pagination: { total: number; offset: number; limit: number; hasMore: boolean }; nextCursor: string | null };
}

interface InfiniteFeedData {
  pages: FeedPage[];
  pageParams: (string | undefined)[];
}

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
        id: `_temp_${Date.now()}`,
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
    mutationFn: ({ postId, emoji }: { postId: string; emoji?: string }) =>
      postsService.likePost(postId, emoji),

    onMutate: async ({ postId, emoji = '❤️' }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.posts.infinite('feed') });
      const previous = queryClient.getQueryData<InfiniteFeedData>(queryKeys.posts.infinite('feed'));

      queryClient.setQueryData<InfiniteFeedData>(
        queryKeys.posts.infinite('feed'),
        (old) => patchPostInFeed(old, postId, (p) => ({
          ...p,
          likeCount: p.likeCount + 1,
          reactionSummary: {
            ...p.reactionSummary,
            [emoji]: ((p.reactionSummary ?? {})[emoji] ?? 0) + 1,
          },
        })),
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

export function useUnlikePostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (postId: string) => postsService.unlikePost(postId),

    onMutate: async (postId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.posts.infinite('feed') });
      const previous = queryClient.getQueryData<InfiniteFeedData>(queryKeys.posts.infinite('feed'));

      queryClient.setQueryData<InfiniteFeedData>(
        queryKeys.posts.infinite('feed'),
        (old) => patchPostInFeed(old, postId, (p) => ({
          ...p,
          likeCount: Math.max(0, p.likeCount - 1),
        })),
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

export function useBookmarkPostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (postId: string) => postsService.bookmarkPost(postId),

    onMutate: async (postId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.posts.infinite('feed') });
      const previous = queryClient.getQueryData<InfiniteFeedData>(queryKeys.posts.infinite('feed'));

      queryClient.setQueryData<InfiniteFeedData>(
        queryKeys.posts.infinite('feed'),
        (old) => patchPostInFeed(old, postId, (p) => ({
          ...p,
          bookmarkCount: p.bookmarkCount + 1,
        })),
      );

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.posts.infinite('feed'), context.previous);
      }
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

      queryClient.setQueryData<InfiniteFeedData>(
        queryKeys.posts.infinite('feed'),
        (old) => patchPostInFeed(old, postId, (p) => ({
          ...p,
          bookmarkCount: Math.max(0, p.bookmarkCount - 1),
        })),
      );

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.posts.infinite('feed'), context.previous);
      }
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
