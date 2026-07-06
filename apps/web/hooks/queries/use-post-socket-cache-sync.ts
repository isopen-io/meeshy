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
  StoryCreatedEventData,
  StoryViewedEventData,
  StoryReactedEventData,
  StoryUpdatedEventData,
  StoryDeletedEventData,
  StoryUnreactedEventData,
  StatusCreatedEventData,
  StatusUpdatedEventData,
  StatusDeletedEventData,
  StatusReactedEventData,
  StatusUnreactedEventData,
  CommentAddedEventData,
  CommentDeletedEventData,
  CommentLikedEventData,
  CommentMediaUpdatedEventData,
  PostTranslationUpdatedEventData,
  CommentTranslationUpdatedEventData,
  PostReactionUpdateEventData,
  CommentReactionUpdateEventData,
} from '@meeshy/shared/types/post';
import type { InfiniteFeedData, InfiniteCommentsData } from './types';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UsePostSocketCacheSyncOptions {
  enabled?: boolean;
  currentUserId?: string;
}

export function usePostSocketCacheSync(options: UsePostSocketCacheSyncOptions = {}) {
  const { enabled = true, currentUserId } = options;
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

      const parentId = data.comment.parentId;
      if (parentId) {
        // A reply belongs in its parent's `replies` sub-cache — NOT the
        // top-level list (otherwise it surfaces as a root comment). Bump the
        // parent's replyCount so the "N replies" affordance updates live.
        queryClient.setQueryData<InfiniteCommentsData>(
          queryKeys.posts.commentReplies(data.postId, parentId),
          (old) => {
            if (!old) return old;
            if (old.pages.some((p) => p.data.some((c) => c.id === data.comment.id))) return old;
            const lastIndex = old.pages.length - 1;
            return {
              ...old,
              pages: old.pages.map((page, i) =>
                i === lastIndex ? { ...page, data: [...page.data, data.comment] } : page,
              ),
            };
          },
        );
        patchCommentInPostCaches(queryClient, data.postId, parentId, (c) => ({
          ...c,
          replyCount: c.replyCount + 1,
        }));
        return;
      }

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

      // The delete payload doesn't say whether it was a reply, so drop the id
      // from every post-scoped comment cache (top-level list AND replies subs).
      queryClient.setQueriesData<InfiniteCommentsData>(
        { queryKey: queryKeys.posts.comments(data.postId) },
        (old) => {
          if (!old?.pages) return old;
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
      patchCommentInPostCaches(queryClient, data.postId, data.commentId, (c) => ({
        ...c,
        likeCount: data.likeCount,
      }));
    }

    // ── Post reaction events (Phase 3B) ─────────────────────────────────

    function handlePostReactionAdded(data: PostReactionUpdateEventData) {
      patchPostInAllCaches(queryClient, data.postId, (p) => {
        // Derive the total-count change from the AUTHORITATIVE per-emoji delta
        // (`aggregation.count` minus the cached count for that emoji) rather than
        // a blind `+1`. A blind `+1` double-counts the reacting user's own event:
        // their optimistic mutation already bumped `likeCount`/`reactionSummary`,
        // so this self-echo would add a second `+1` while `reactionSummary` (set
        // absolutely below) self-corrects — leaving "N likes" one ahead of the
        // emoji badges. The delta is 0 for an already-applied optimistic reaction
        // and idempotent against duplicate echoes.
        const delta = reactionDelta(p, data);
        return {
          ...p,
          reactionCount: Math.max(0, (p.reactionCount ?? p.likeCount) + delta),
          likeCount: Math.max(0, p.likeCount + delta),
          reactionSummary: {
            ...p.reactionSummary,
            [data.emoji]: data.aggregation.count,
          },
          currentUserReactions:
            data.userId === currentUserId
              ? (p.currentUserReactions ?? []).includes(data.emoji)
                ? p.currentUserReactions
                : [...(p.currentUserReactions ?? []), data.emoji]
              : p.currentUserReactions,
        };
      });
    }

    function handlePostReactionRemoved(data: PostReactionUpdateEventData) {
      patchPostInAllCaches(queryClient, data.postId, (p) => {
        const delta = reactionDelta(p, data);
        const newSummary = { ...p.reactionSummary };
        if (data.aggregation.count === 0) {
          delete newSummary[data.emoji];
        } else {
          newSummary[data.emoji] = data.aggregation.count;
        }
        return {
          ...p,
          reactionCount: Math.max(0, (p.reactionCount ?? p.likeCount) + delta),
          likeCount: Math.max(0, p.likeCount + delta),
          reactionSummary: newSummary,
          currentUserReactions:
            data.userId === currentUserId
              ? (p.currentUserReactions ?? []).filter((e) => e !== data.emoji)
              : p.currentUserReactions,
        };
      });
    }

    // ── Comment reaction events ─────────────────────────────────────────

    function handleCommentReactionAdded(data: CommentReactionUpdateEventData) {
      patchCommentInPostCaches(queryClient, data.postId, data.commentId, (c) => {
        // Same authoritative-delta reconciliation as `handlePostReactionAdded`.
        // The gateway broadcasts `comment:reaction-added` for EVERY emoji (no
        // heart-absolute shortcut like posts have), so a blind `+1` here would
        // double-count even a plain ❤️ like against the optimistic mutation.
        const delta = reactionDelta(c, data);
        return {
          ...c,
          likeCount: Math.max(0, c.likeCount + delta),
          reactionSummary: {
            ...c.reactionSummary,
            [data.emoji]: data.aggregation.count,
          },
          currentUserReactions:
            data.userId === currentUserId
              ? (c.currentUserReactions ?? []).includes(data.emoji)
                ? c.currentUserReactions
                : [...(c.currentUserReactions ?? []), data.emoji]
              : c.currentUserReactions,
        };
      });
    }

    function handleCommentReactionRemoved(data: CommentReactionUpdateEventData) {
      patchCommentInPostCaches(queryClient, data.postId, data.commentId, (c) => {
        const delta = reactionDelta(c, data);
        const newSummary = { ...c.reactionSummary };
        if (data.aggregation.count === 0) {
          delete newSummary[data.emoji];
        } else {
          newSummary[data.emoji] = data.aggregation.count;
        }
        return {
          ...c,
          likeCount: Math.max(0, c.likeCount + delta),
          reactionSummary: newSummary,
          currentUserReactions:
            data.userId === currentUserId
              ? (c.currentUserReactions ?? []).filter((e) => e !== data.emoji)
              : c.currentUserReactions,
        };
      });
    }

    // ── Translation events ──────────────────────────────────────────────

    function handlePostTranslationUpdated(data: PostTranslationUpdatedEventData) {
      patchPostInAllCaches(queryClient, data.postId, (p) => {
        const existing = (p as Post & { translations?: Record<string, unknown> }).translations ?? {};
        return {
          ...p,
          translations: {
            /* istanbul ignore next */
            ...(/* istanbul ignore next */ typeof existing === 'object' ? existing : {}),
            [data.language]: data.translation,
          },
        } as Post;
      });
    }

    function handleCommentTranslationUpdated(data: CommentTranslationUpdatedEventData) {
      patchCommentInPostCaches(queryClient, data.postId, data.commentId, (c) => {
        const existing = (c.translations as Record<string, unknown>) ?? {};
        return {
          ...c,
          translations: {
            /* istanbul ignore next */
            ...(/* istanbul ignore next */ typeof existing === 'object' ? existing : {}),
            [data.language]: data.translation,
          },
        };
      });
    }

    function handleCommentMediaUpdated(data: CommentMediaUpdatedEventData) {
      // Audio transcription/translations for a comment's media are ready —
      // merge the refreshed comment (media + translations) into the caches.
      patchCommentInPostCaches(queryClient, data.postId, data.commentId, (c) => ({
        ...c,
        ...data.comment,
      }));
    }

    // ── Story events ────────────────────────────────────────────────────
    //
    // The stories bar reads `queryKeys.stories.feed()` (a flat `Post[]`), NOT
    // `queryKeys.posts.stories()`. The previous handlers invalidated the latter
    // — a key no query subscribes to — so story:deleted / story:updated never
    // surfaced live and the bar kept showing stale/removed stories until a full
    // refetch. We now patch `stories.feed()` directly so every story surface
    // stays fresh offline-first (no network roundtrip, no flash).

    function handleStoryCreated(data: StoryCreatedEventData) {
      queryClient.setQueryData<Post[]>(queryKeys.stories.feed(), (old) => {
        if (!old) return old;
        if (old.some((s) => s.id === data.story.id)) return old;
        return [data.story, ...old];
      });
    }

    function handleStoryViewed(data: StoryViewedEventData) {
      patchStoryInFeed(queryClient, data.storyId, (s) => ({
        ...s,
        viewCount: data.viewCount,
      }));
    }

    function handleStoryReacted(_data: StoryReactedEventData) {
      // Story reactions are informational for the author and carry no
      // authoritative aggregation count — mutating the feed would drift. The
      // feed reconciles via its next refetch.
    }

    function handleStoryUpdated(data: StoryUpdatedEventData) {
      patchStoryInFeed(queryClient, data.story.id, () => data.story);
    }

    function handleStoryDeleted(data: StoryDeletedEventData) {
      queryClient.setQueryData<Post[]>(queryKeys.stories.feed(), (old) =>
        old ? old.filter((s) => s.id !== data.storyId) : old,
      );
    }

    function handleStoryUnreacted(_data: StoryUnreactedEventData) {
      // Mirror of handleStoryReacted — no authoritative count on the wire.
    }

    // ── Status events ───────────────────────────────────────────────────

    function handleStatusCreated(_data: StatusCreatedEventData) {
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.statuses() });
    }

    function handleStatusUpdated(_data: StatusUpdatedEventData) {
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.statuses() });
    }

    function handleStatusDeleted(_data: StatusDeletedEventData) {
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.statuses() });
    }

    function handleStatusReacted(_data: StatusReactedEventData) {
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.statuses() });
    }

    function handleStatusUnreacted(_data: StatusUnreactedEventData) {
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.statuses() });
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
    socket.on(SERVER_EVENTS.COMMENT_MEDIA_UPDATED, handleCommentMediaUpdated);

    socket.on(SERVER_EVENTS.STORY_CREATED, handleStoryCreated);
    socket.on(SERVER_EVENTS.STORY_VIEWED, handleStoryViewed);
    socket.on(SERVER_EVENTS.STORY_REACTED, handleStoryReacted);
    socket.on(SERVER_EVENTS.STORY_UPDATED, handleStoryUpdated);
    socket.on(SERVER_EVENTS.STORY_DELETED, handleStoryDeleted);
    socket.on(SERVER_EVENTS.STORY_UNREACTED, handleStoryUnreacted);
    socket.on(SERVER_EVENTS.STATUS_CREATED, handleStatusCreated);
    socket.on(SERVER_EVENTS.STATUS_UPDATED, handleStatusUpdated);
    socket.on(SERVER_EVENTS.STATUS_DELETED, handleStatusDeleted);
    socket.on(SERVER_EVENTS.STATUS_REACTED, handleStatusReacted);
    socket.on(SERVER_EVENTS.STATUS_UNREACTED, handleStatusUnreacted);

    socket.on(SERVER_EVENTS.POST_REACTION_ADDED, handlePostReactionAdded);
    socket.on(SERVER_EVENTS.POST_REACTION_REMOVED, handlePostReactionRemoved);
    socket.on(SERVER_EVENTS.COMMENT_REACTION_ADDED, handleCommentReactionAdded);
    socket.on(SERVER_EVENTS.COMMENT_REACTION_REMOVED, handleCommentReactionRemoved);

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
      socket.off(SERVER_EVENTS.COMMENT_MEDIA_UPDATED, handleCommentMediaUpdated);

      socket.off(SERVER_EVENTS.STORY_CREATED, handleStoryCreated);
      socket.off(SERVER_EVENTS.STORY_VIEWED, handleStoryViewed);
      socket.off(SERVER_EVENTS.STORY_REACTED, handleStoryReacted);
      socket.off(SERVER_EVENTS.STORY_UPDATED, handleStoryUpdated);
      socket.off(SERVER_EVENTS.STORY_DELETED, handleStoryDeleted);
      socket.off(SERVER_EVENTS.STORY_UNREACTED, handleStoryUnreacted);
      socket.off(SERVER_EVENTS.STATUS_CREATED, handleStatusCreated);
      socket.off(SERVER_EVENTS.STATUS_UPDATED, handleStatusUpdated);
      socket.off(SERVER_EVENTS.STATUS_DELETED, handleStatusDeleted);
      socket.off(SERVER_EVENTS.STATUS_REACTED, handleStatusReacted);
      socket.off(SERVER_EVENTS.STATUS_UNREACTED, handleStatusUnreacted);

      socket.off(SERVER_EVENTS.POST_REACTION_ADDED, handlePostReactionAdded);
      socket.off(SERVER_EVENTS.POST_REACTION_REMOVED, handlePostReactionRemoved);
      socket.off(SERVER_EVENTS.COMMENT_REACTION_ADDED, handleCommentReactionAdded);
      socket.off(SERVER_EVENTS.COMMENT_REACTION_REMOVED, handleCommentReactionRemoved);
    };
  }, [enabled, currentUserId, queryClient]);
}

// ---------------------------------------------------------------------------
// Shared helper: authoritative per-emoji count delta.
//
// A reaction event carries the AUTHORITATIVE absolute count for its emoji
// (`aggregation.count`). Comparing it against the cached count for that same
// emoji yields the exact change to apply to the entity's total `likeCount` —
// which stays consistent with `reactionSummary` regardless of whether an
// optimistic mutation already ran, whether the echo is the reactor's own, or
// whether the same echo is delivered twice. A blind `±1` cannot make those
// guarantees and double-counts the reactor's own optimistic update.
// ---------------------------------------------------------------------------

function reactionDelta(
  entity: { readonly reactionSummary?: Record<string, number> | null },
  data: { readonly emoji: string; readonly aggregation: { readonly count: number } },
): number {
  const previous = (entity.reactionSummary ?? {})[data.emoji] ?? 0;
  return data.aggregation.count - previous;
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

  patchReelCaches(queryClient, postId, patcher);
}

// ---------------------------------------------------------------------------
// Shared helper: patch a single comment wherever it lives under a post.
//
// `comments(postId)` is the common prefix of BOTH the top-level comments cache
// (`commentsInfinite`) and every `replies` sub-cache. A prefix-matched
// setQueriesData therefore reaches a comment whether it is a root comment or a
// nested reply — so likes / reactions / translations surface live on replies
// too, not only top-level comments.
// ---------------------------------------------------------------------------

function patchCommentInPostCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  postId: string,
  commentId: string,
  patcher: (comment: PostComment) => PostComment,
) {
  queryClient.setQueriesData<InfiniteCommentsData>(
    { queryKey: queryKeys.posts.comments(postId) },
    (old) => {
      if (!old?.pages) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          data: page.data.map((c) => (c.id === commentId ? patcher(c) : c)),
        })),
      };
    },
  );
}

// ---------------------------------------------------------------------------
// Shared helper: patch a single story in the stories-bar feed cache.
//
// The stories bar is a flat `Post[]` keyed by `queryKeys.stories.feed()`. A
// no-op when the story is absent (returns `old` untouched) so a missing entry
// never resurrects a story the feed query has already dropped.
// ---------------------------------------------------------------------------

function patchStoryInFeed(
  queryClient: ReturnType<typeof useQueryClient>,
  storyId: string,
  patcher: (story: Post) => Post,
) {
  queryClient.setQueryData<Post[]>(queryKeys.stories.feed(), (old) =>
    old ? old.map((s) => (s.id === storyId ? patcher(s) : s)) : old,
  );
}

function patchReelCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  postId: string,
  patcher: (post: Post) => Post,
) {
  // Reels affinity threads (`/feed/reels`, `/reel/:id`) live under a separate
  // key family the two patchers above never reach; mirror the patch there so
  // like / comment / bookmark counts stay live on the reel surfaces too.
  queryClient.setQueriesData<{ pages?: Array<{ data?: Post[] }> }>(
    { queryKey: [...queryKeys.posts.lists(), 'reels'] },
    (old) => {
      if (!old?.pages) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          data: (page.data ?? []).map((p) => (p.id === postId ? patcher(p) : p)),
        })),
      };
    },
  );
}
