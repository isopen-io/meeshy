'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type {
  Post,
  PostComment,
  PostCreatedEventData,
  PostUpdatedEventData,
  PostDeletedEventData,
  PostLikedEventData,
  PostUnlikedEventData,
  PostRepostedEventData,
  PostBookmarkedEventData,
  CommentAddedEventData,
  CommentDeletedEventData,
  CommentLikedEventData,
  PostTranslationUpdatedEventData,
  CommentTranslationUpdatedEventData,
} from '@meeshy/shared/types/post';

// ---------------------------------------------------------------------------
// Cache types
// ---------------------------------------------------------------------------

interface FeedPage {
  data: Post[];
  meta: { pagination: { total: number; offset: number; limit: number; hasMore: boolean }; nextCursor: string | null };
}

interface InfiniteFeedData {
  pages: FeedPage[];
  pageParams: (string | undefined)[];
}

interface CommentPage {
  data: PostComment[];
  meta: { pagination: { total: number; offset: number; limit: number; hasMore: boolean }; nextCursor: string | null };
}

interface InfiniteCommentsData {
  pages: CommentPage[];
  pageParams: (string | undefined)[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UsePostSocketCacheSyncOptions {
  enabled?: boolean;
}

export function usePostSocketCacheSync(options: UsePostSocketCacheSyncOptions = {}) {
  const { enabled = true } = options;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const socket = meeshySocketIOService.getSocket();
    if (!socket) return;

    // ── Post events ─────────────────────────────────────────────────────

    function handlePostCreated(data: PostCreatedEventData) {
      queryClient.setQueryData<InfiniteFeedData>(
        queryKeys.posts.infinite('feed'),
        (old) => {
          if (!old) return old;
          if (old.pages.some((p) => p.data.some((post) => post.id === data.post.id))) return old;
          return {
            ...old,
            pages: old.pages.map((page, i) =>
              i === 0 ? { ...page, data: [data.post, ...page.data] } : page,
            ),
          };
        },
      );
    }

    function handlePostUpdated(data: PostUpdatedEventData) {
      const feedKey = queryKeys.posts.infinite('feed');
      queryClient.setQueryData<InfiniteFeedData>(feedKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            data: page.data.map((p) => (p.id === data.post.id ? data.post : p)),
          })),
        };
      });
      queryClient.setQueryData(queryKeys.posts.detail(data.post.id), (old: unknown) =>
        old ? { ...(old as Record<string, unknown>), data: data.post } : old,
      );
    }

    function handlePostDeleted(data: PostDeletedEventData) {
      queryClient.setQueryData<InfiniteFeedData>(
        queryKeys.posts.infinite('feed'),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data.filter((p) => p.id !== data.postId),
            })),
          };
        },
      );
    }

    function handlePostLiked(data: PostLikedEventData) {
      patchPostInAllCaches(queryClient, data.postId, (p) => ({
        ...p,
        likeCount: data.likeCount,
        reactionSummary: data.reactionSummary,
      }));
    }

    function handlePostUnliked(data: PostUnlikedEventData) {
      patchPostInAllCaches(queryClient, data.postId, (p) => ({
        ...p,
        likeCount: data.likeCount,
        reactionSummary: data.reactionSummary,
      }));
    }

    function handlePostReposted(data: PostRepostedEventData) {
      queryClient.setQueryData<InfiniteFeedData>(
        queryKeys.posts.infinite('feed'),
        (old) => {
          if (!old) return old;
          if (old.pages.some((p) => p.data.some((post) => post.id === data.repost.id))) return old;
          return {
            ...old,
            pages: old.pages.map((page, i) =>
              i === 0 ? { ...page, data: [data.repost, ...page.data] } : page,
            ),
          };
        },
      );
    }

    function handlePostBookmarked(data: PostBookmarkedEventData) {
      if (data.bookmarked) {
        queryClient.invalidateQueries({ queryKey: queryKeys.posts.bookmarks() });
      }
    }

    // ── Comment events ──────────────────────────────────────────────────

    function handleCommentAdded(data: CommentAddedEventData) {
      patchPostInAllCaches(queryClient, data.postId, (p) => ({
        ...p,
        commentCount: data.commentCount,
      }));

      queryClient.setQueryData<InfiniteCommentsData>(
        queryKeys.posts.commentsInfinite(data.postId),
        (old) => {
          if (!old) return old;
          if (old.pages.some((p) => p.data.some((c) => c.id === data.comment.id))) return old;
          return {
            ...old,
            pages: old.pages.map((page, i) =>
              i === 0 ? { ...page, data: [data.comment, ...page.data] } : page,
            ),
          };
        },
      );
    }

    function handleCommentDeleted(data: CommentDeletedEventData) {
      patchPostInAllCaches(queryClient, data.postId, (p) => ({
        ...p,
        commentCount: data.commentCount,
      }));

      queryClient.setQueryData<InfiniteCommentsData>(
        queryKeys.posts.commentsInfinite(data.postId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data.filter((c) => c.id !== data.commentId),
            })),
          };
        },
      );
    }

    function handleCommentLiked(data: CommentLikedEventData) {
      queryClient.setQueryData<InfiniteCommentsData>(
        queryKeys.posts.commentsInfinite(data.postId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data.map((c) =>
                c.id === data.commentId
                  ? { ...c, likeCount: data.likeCount }
                  : c,
              ),
            })),
          };
        },
      );
    }

    // ── Translation events ──────────────────────────────────────────────

    function handlePostTranslationUpdated(data: PostTranslationUpdatedEventData) {
      patchPostInAllCaches(queryClient, data.postId, (p) => {
        const existing = (p as Post & { translations?: Record<string, unknown> }).translations ?? {};
        return {
          ...p,
          translations: {
            ...(typeof existing === 'object' ? existing : {}),
            [data.language]: data.translation,
          },
        } as Post;
      });
    }

    function handleCommentTranslationUpdated(data: CommentTranslationUpdatedEventData) {
      queryClient.setQueryData<InfiniteCommentsData>(
        queryKeys.posts.commentsInfinite(data.postId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data.map((c) => {
                if (c.id !== data.commentId) return c;
                const existing = (c.translations as Record<string, unknown>) ?? {};
                return {
                  ...c,
                  translations: {
                    ...(typeof existing === 'object' ? existing : {}),
                    [data.language]: data.translation,
                  },
                };
              }),
            })),
          };
        },
      );
    }

    // ── Register listeners ──────────────────────────────────────────────

    socket.on(SERVER_EVENTS.POST_CREATED, handlePostCreated);
    socket.on(SERVER_EVENTS.POST_UPDATED, handlePostUpdated);
    socket.on(SERVER_EVENTS.POST_DELETED, handlePostDeleted);
    socket.on(SERVER_EVENTS.POST_LIKED, handlePostLiked);
    socket.on(SERVER_EVENTS.POST_UNLIKED, handlePostUnliked);
    socket.on(SERVER_EVENTS.POST_REPOSTED, handlePostReposted);
    socket.on(SERVER_EVENTS.POST_BOOKMARKED, handlePostBookmarked);
    socket.on(SERVER_EVENTS.COMMENT_ADDED, handleCommentAdded);
    socket.on(SERVER_EVENTS.COMMENT_DELETED, handleCommentDeleted);
    socket.on(SERVER_EVENTS.COMMENT_LIKED, handleCommentLiked);
    socket.on(SERVER_EVENTS.POST_TRANSLATION_UPDATED, handlePostTranslationUpdated);
    socket.on(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, handleCommentTranslationUpdated);

    return () => {
      socket.off(SERVER_EVENTS.POST_CREATED, handlePostCreated);
      socket.off(SERVER_EVENTS.POST_UPDATED, handlePostUpdated);
      socket.off(SERVER_EVENTS.POST_DELETED, handlePostDeleted);
      socket.off(SERVER_EVENTS.POST_LIKED, handlePostLiked);
      socket.off(SERVER_EVENTS.POST_UNLIKED, handlePostUnliked);
      socket.off(SERVER_EVENTS.POST_REPOSTED, handlePostReposted);
      socket.off(SERVER_EVENTS.POST_BOOKMARKED, handlePostBookmarked);
      socket.off(SERVER_EVENTS.COMMENT_ADDED, handleCommentAdded);
      socket.off(SERVER_EVENTS.COMMENT_DELETED, handleCommentDeleted);
      socket.off(SERVER_EVENTS.COMMENT_LIKED, handleCommentLiked);
      socket.off(SERVER_EVENTS.POST_TRANSLATION_UPDATED, handlePostTranslationUpdated);
      socket.off(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, handleCommentTranslationUpdated);
    };
  }, [enabled, queryClient]);
}

// ---------------------------------------------------------------------------
// Shared helper: patch a post in both feed and detail caches
// ---------------------------------------------------------------------------

function patchPostInAllCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  postId: string,
  patcher: (post: Post) => Post,
) {
  queryClient.setQueryData<InfiniteFeedData>(
    queryKeys.posts.infinite('feed'),
    (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          data: page.data.map((p) => (p.id === postId ? patcher(p) : p)),
        })),
      };
    },
  );

  queryClient.setQueryData(queryKeys.posts.detail(postId), (old: unknown) => {
    if (!old) return old;
    const record = old as { data?: Post };
    if (record.data) {
      return { ...record, data: patcher(record.data) };
    }
    return old;
  });
}
