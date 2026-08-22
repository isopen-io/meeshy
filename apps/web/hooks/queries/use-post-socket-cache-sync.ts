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
  CommentUpdatedEventData,
  CommentDeletedEventData,
  CommentLikedEventData,
  CommentUnlikedEventData,
  CommentMediaUpdatedEventData,
  PostTranslationUpdatedEventData,
  CommentTranslationUpdatedEventData,
  PostReactionUpdateEventData,
  CommentReactionUpdateEventData,
} from '@meeshy/shared/types/post';
import type { InfiniteFeedData, InfiniteCommentsData } from './types';

/**
 * Le fil refuse ce qui appartient au TRAY — miroir du partage que fait déjà sa
 * lecture REST (`PostFeedService.getFeed` sert `[POST, REEL]`, `getStories`
 * sert `STORY`).
 *
 * `post:reposted` n'est PAS typé : contrairement à la création, qui aiguille
 * vers `story:created` / `status:created` / `post:created` selon le type, le
 * repost part toujours sur le canal des posts avec sa charge utile telle
 * quelle. Un repost de type STORY entrait donc dans le fil en direct alors
 * qu'il appartient au tray — le même contenu se voyait dans les deux, jusqu'au
 * rafraîchissement qui le faisait disparaître du fil.
 *
 * La source de ces reposts typés STORY est tarie côté serveur (un repost naît
 * POST depuis le 2026-08-19), mais le fil n'a pas à faire confiance au type de
 * ce qu'on lui pousse.
 *
 * Formulé par EXCLUSION, et non par liste blanche : la règle décrit le défaut
 * (« du contenu de tray entre dans le fil ») et ne fait pas disparaître en
 * silence un type que le fil ne connaîtrait pas encore. Miroir iOS :
 * `FeedViewModel.feedRejectsTrayType`.
 */
const TRAY_POST_TYPES: ReadonlyArray<Post['type']> = ['STORY', 'STATUS'];

function feedServesType(type: Post['type'] | undefined): boolean {
  return type === undefined || !TRAY_POST_TYPES.includes(type);
}

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
      // A reel edited from any surface must refresh its caption/media on the
      // reels affinity threads too — otherwise `/feed/reels` and `/reel/:id`
      // keep the stale pre-edit post until a full refetch.
      patchReelCaches(queryClient, data.post.id, () => data.post);
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
      // Drop the deleted post from the reels affinity threads and evict its
      // detail cache so no reel/detail surface can resurface a removed post.
      removePostFromReelCaches(queryClient, data.postId);
      queryClient.removeQueries({ queryKey: queryKeys.posts.detail(data.postId) });
    }

    function handlePostLiked(data: PostLikedEventData) {
      patchPostInAllCaches(queryClient, data.postId, (p) => ({
        ...p,
        likeCount: data.likeCount,
        reactionSummary: data.reactionSummary,
      }));
      patchRepostOfCounts(queryClient, data.postId, (original) => ({ ...original, likeCount: data.likeCount }));
    }

    function handlePostUnliked(data: PostUnlikedEventData) {
      patchPostInAllCaches(queryClient, data.postId, (p) => ({
        ...p,
        likeCount: data.likeCount,
        reactionSummary: data.reactionSummary,
      }));
      patchRepostOfCounts(queryClient, data.postId, (original) => ({ ...original, likeCount: data.likeCount }));
    }

    function handlePostReposted(data: PostRepostedEventData) {
      queryClient.setQueryData<InfiniteFeedData>(
        queryKeys.posts.infinite('feed'),
        (old) => {
          if (!old) return old;
          if (!feedServesType(data.repost.type)) return old;
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
      patchRepostOfCounts(queryClient, data.postId, (original) => ({ ...original, commentCount: data.commentCount }));

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

    // Édition d'un commentaire. Le payload porte le commentaire COMPLET et se
    // substitue à la ligne (idempotent par id, contrairement à l'insertion de
    // `comment:added`), donc aucun compteur du post ne bouge : éditer ne crée ni
    // ne retire rien.
    //
    // Recopier le commentaire ENTIER, jamais le seul `content` : le serveur
    // purge `translations` et `originalLanguage` dans la MÊME écriture que le
    // texte (`PostCommentService.updateComment`) parce qu'ils décrivaient
    // l'ANCIEN contenu. Un patch qui ne prendrait que le texte laisserait la
    // traduction d'avant collée au texte d'après — un affichage traduit qui
    // ment, ce que la règle #1 du Prisme interdit.
    //
    // Le spread préserve en revanche ce que le payload NE PORTE PAS : la
    // diffusion est une charge unique pour toute la room, elle ne peut pas
    // transporter `currentUserReactions`, qui dépend du lecteur. Ces clés sont
    // absentes (et non `undefined`), donc la valeur en cache survit.
    //
    // `patchCommentInPostCaches` balaie TOUS les caches de commentaires du post
    // — liste de premier niveau ET sous-caches de réponses — car le payload ne
    // dit pas où vit la ligne, et une réponse s'édite comme une racine.
    function handleCommentUpdated(data: CommentUpdatedEventData) {
      patchCommentInPostCaches(queryClient, data.postId, data.comment.id, (c) => ({
        ...c,
        ...data.comment,
      }));
    }

    function handleCommentDeleted(data: CommentDeletedEventData) {
      patchPostInAllCaches(queryClient, data.postId, (p) => ({
        ...p,
        commentCount: data.commentCount,
      }));
      patchRepostOfCounts(queryClient, data.postId, (original) => ({ ...original, commentCount: data.commentCount }));

      // Deleting a comment soft-deletes its WHOLE reply subtree server-side, so
      // the payload announces every removed id — not just the target. Dropping
      // only the target left its expanded replies on screen with nothing to ever
      // remove them: `getComments` filters `parentId: null`, so a refetch never
      // returns them and `getReplies` is never called again for a deleted parent.
      //
      // Fall back to the target alone when the list is absent (an idempotent
      // replay can no longer reconstruct the subtree) — exactly the previous
      // behaviour, never an empty list.
      const removedIds = new Set(data.deletedCommentIds ?? [data.commentId]);

      // Miroir exact du `replyCount + 1` de `handleCommentAdded`, qui n'avait
      // pas de pendant : supprimer une réponse laissait « 3 réponses » affiché
      // au-dessus de deux lignes, jusqu'à un refetch complet. Le serveur, lui,
      // décrémente bien (`PostCommentService.deleteComment`).
      //
      // Le parent vient du PAYLOAD et n'est jamais redérivé du cache : la
      // cible n'y est présente que fil déplié, alors que l'affordance
      // « N réponses » ne s'affiche que fil REPLIÉ — le déduire échouerait
      // précisément dans le cas qui se voit. Son absence (rejeu idempotent du
      // DELETE, gateway antérieure) vaut « ne rien décrémenter », ce qui rend
      // le miroir idempotent sans état côté client.
      if (data.parentId) {
        patchCommentInPostCaches(queryClient, data.postId, data.parentId, (c) => ({
          ...c,
          replyCount: Math.max(0, c.replyCount - 1),
        }));
      }

      // The payload doesn't say whether an id was a reply, so sweep every
      // post-scoped comment cache (top-level list AND replies subs).
      queryClient.setQueriesData<InfiniteCommentsData>(
        { queryKey: queryKeys.posts.comments(data.postId) },
        (old) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data.filter((c) => !removedIds.has(c.id)),
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

    // Jumelle DESCENDANTE, strictement symétrique : les deux charges portent le
    // total ABSOLU, donc le même écrasement convient aux deux sens. Un `−1`
    // aveugle serait ici doublement faux — non idempotent sous double livraison,
    // et incapable de rattraper un événement manqué.
    function handleCommentUnliked(data: CommentUnlikedEventData) {
      patchCommentInPostCaches(queryClient, data.postId, data.commentId, (c) => ({
        ...c,
        likeCount: data.likeCount,
      }));
    }

    // ── Post reaction events (Phase 3B) ─────────────────────────────────

    function handlePostReactionAdded(data: PostReactionUpdateEventData) {
      // `reactionDelta` needs the ORIGINAL's own PRE-patch `reactionSummary` —
      // a snapshot `repostOf` never carries — so both nested deltas are read
      // directly from cache BEFORE `patchPostInAllCaches` runs, independently
      // per cache family. Feed and reels are always patched together by the
      // SAME optimistic mutation (`useLikePostMutation`), so they share one
      // delta; detail is NEVER touched by that optimistic mutation, so it is
      // derived and applied completely independently — reading ahead like
      // this means the result can never depend on patch ordering.
      const feedOrReelsDelta = reactionDeltaForEntry(findPostInFeedOrReelsCache(queryClient, data.postId), data);
      const detailDelta = reactionDeltaForEntry(findPostInDetailCache(queryClient, data.postId), data);

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

      if (feedOrReelsDelta !== 0) {
        const bump = (original: NonNullable<Post['repostOf']>) => ({
          ...original,
          likeCount: Math.max(0, (original.likeCount ?? 0) + feedOrReelsDelta),
        });
        patchRepostOfCountsInFeed(queryClient, data.postId, bump);
        patchRepostOfCountsInReels(queryClient, data.postId, bump);
      }
      if (detailDelta !== 0) {
        patchRepostOfCountsInDetail(queryClient, data.postId, (original) => ({
          ...original,
          likeCount: Math.max(0, (original.likeCount ?? 0) + detailDelta),
        }));
      }
    }

    function handlePostReactionRemoved(data: PostReactionUpdateEventData) {
      const feedOrReelsDelta = reactionDeltaForEntry(findPostInFeedOrReelsCache(queryClient, data.postId), data);
      const detailDelta = reactionDeltaForEntry(findPostInDetailCache(queryClient, data.postId), data);

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

      if (feedOrReelsDelta !== 0) {
        const bump = (original: NonNullable<Post['repostOf']>) => ({
          ...original,
          likeCount: Math.max(0, (original.likeCount ?? 0) + feedOrReelsDelta),
        });
        patchRepostOfCountsInFeed(queryClient, data.postId, bump);
        patchRepostOfCountsInReels(queryClient, data.postId, bump);
      }
      if (detailDelta !== 0) {
        patchRepostOfCountsInDetail(queryClient, data.postId, (original) => ({
          ...original,
          likeCount: Math.max(0, (original.likeCount ?? 0) + detailDelta),
        }));
      }
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

    // Les deux événements de réaction story portent désormais l'état ABSOLU
    // (`likeCount` + `reactionSummary`), comme `post:liked`/`post:unliked`. Le
    // no-op qui vivait ici tenait à leur absence : sans total autoritatif il ne
    // restait qu'un `±1` qui dérive. On écrit la valeur reçue — idempotent sous
    // double livraison, et convergent après un événement manqué.
    function handleStoryReacted(data: StoryReactedEventData) {
      patchStoryReactionCounts(queryClient, data.storyId, data);
    }

    function handleStoryUpdated(data: StoryUpdatedEventData) {
      patchStoryInFeed(queryClient, data.story.id, () => data.story);
    }

    function handleStoryDeleted(data: StoryDeletedEventData) {
      queryClient.setQueryData<Post[]>(queryKeys.stories.feed(), (old) =>
        old ? old.filter((s) => s.id !== data.storyId) : old,
      );
    }

    function handleStoryUnreacted(data: StoryUnreactedEventData) {
      patchStoryReactionCounts(queryClient, data.storyId, data);
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
    socket.on(SERVER_EVENTS.COMMENT_UPDATED, handleCommentUpdated);
    socket.on(SERVER_EVENTS.COMMENT_DELETED, handleCommentDeleted);
    socket.on(SERVER_EVENTS.COMMENT_LIKED, handleCommentLiked);
    socket.on(SERVER_EVENTS.COMMENT_UNLIKED, handleCommentUnliked);
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
      socket.off(SERVER_EVENTS.COMMENT_UPDATED, handleCommentUpdated);
      socket.off(SERVER_EVENTS.COMMENT_DELETED, handleCommentDeleted);
      socket.off(SERVER_EVENTS.COMMENT_LIKED, handleCommentLiked);
      socket.off(SERVER_EVENTS.COMMENT_UNLIKED, handleCommentUnliked);
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

function reactionDeltaForEntry(
  entry: { readonly reactionSummary?: Record<string, number> | null } | undefined,
  data: { readonly emoji: string; readonly aggregation: { readonly count: number } },
): number {
  return entry ? reactionDelta(entry, data) : 0;
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
// Shared helper: patch the NESTED `repostOf` snapshot wherever a given
// original post is embedded — feed, reels, and post-detail caches. A liked/
// commented original can appear as `repostOf` on any number of displayed
// simple reposts, each caching its own stale snapshot of the original's
// counters (what PostCard/PostDetail/ReelPlayer actually render). The detail
// sweep is length-filtered to the exact `['posts','detail',id]` shape —
// `queryKeys.posts.details()` is also a PREFIX of the comments/replies cache
// families, which carry a `{ pages }` shape, not `{ data: Post }`.
//
// Split into per-cache-family pieces (feed+reels vs detail) because the
// optimistic mutations (`useLikePostMutation`/`useUnlikePostMutation`) only
// ever touch feed+reels, never detail — so on a reaction event the CORRECT
// reconciling delta for feed/reels can differ from the one for detail (the
// former is often already 0, applied optimistically; the latter never is).
// A single combined sweep using ONE delta for all three caches is only valid
// when that delta is known to apply uniformly everywhere (Liked/Unliked/
// CommentAdded/CommentDeleted, which carry an ABSOLUTE authoritative value —
// setting the same absolute value twice is idempotent, no ordering risk).
// ---------------------------------------------------------------------------

function patchRepostOfCountsInFeed(
  queryClient: ReturnType<typeof useQueryClient>,
  originalId: string,
  patchOriginal: (original: NonNullable<Post['repostOf']>) => NonNullable<Post['repostOf']>,
) {
  const patchEntry = (p: Post): Post =>
    p.repostOf && p.repostOf.id === originalId ? { ...p, repostOf: patchOriginal(p.repostOf) } : p;

  queryClient.setQueryData<InfiniteFeedData>(queryKeys.posts.infinite('feed'), (old) => {
    if (!old) return old;
    return {
      ...old,
      pages: old.pages.map((page) => ({ ...page, data: page.data.map(patchEntry) })),
    };
  });
}

function patchRepostOfCountsInReels(
  queryClient: ReturnType<typeof useQueryClient>,
  originalId: string,
  patchOriginal: (original: NonNullable<Post['repostOf']>) => NonNullable<Post['repostOf']>,
) {
  const patchEntry = (p: Post): Post =>
    p.repostOf && p.repostOf.id === originalId ? { ...p, repostOf: patchOriginal(p.repostOf) } : p;

  queryClient.setQueriesData<{ pages?: Array<{ data?: Post[] }> }>(
    { queryKey: [...queryKeys.posts.lists(), 'reels'] },
    (old) => {
      if (!old?.pages) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({ ...page, data: (page.data ?? []).map(patchEntry) })),
      };
    },
  );
}

function patchRepostOfCountsInDetail(
  queryClient: ReturnType<typeof useQueryClient>,
  originalId: string,
  patchOriginal: (original: NonNullable<Post['repostOf']>) => NonNullable<Post['repostOf']>,
) {
  const patchEntry = (p: Post): Post =>
    p.repostOf && p.repostOf.id === originalId ? { ...p, repostOf: patchOriginal(p.repostOf) } : p;

  const detailKeyLength = queryKeys.posts.details().length + 1;
  for (const [key, value] of queryClient.getQueriesData<{ data?: Post }>({ queryKey: queryKeys.posts.details() })) {
    if (key.length !== detailKeyLength) continue;
    if (!value?.data?.repostOf || value.data.repostOf.id !== originalId) continue;
    queryClient.setQueryData(key, { ...value, data: patchEntry(value.data) });
  }
}

function patchRepostOfCounts(
  queryClient: ReturnType<typeof useQueryClient>,
  originalId: string,
  patchOriginal: (original: NonNullable<Post['repostOf']>) => NonNullable<Post['repostOf']>,
) {
  patchRepostOfCountsInFeed(queryClient, originalId, patchOriginal);
  patchRepostOfCountsInReels(queryClient, originalId, patchOriginal);
  patchRepostOfCountsInDetail(queryClient, originalId, patchOriginal);
}

// ---------------------------------------------------------------------------
// Shared helper: read-only lookups of a post's CURRENT cached state, used to
// derive a reaction delta BEFORE any cache is patched — reading ahead of the
// patch (rather than capturing a value from inside a shared patcher callback
// invoked once per cache) means the result can never depend on which cache
// `patchPostInAllCaches` happens to patch first or last.
// ---------------------------------------------------------------------------

function findPostInFeedOrReelsCache(
  queryClient: ReturnType<typeof useQueryClient>,
  postId: string,
): Post | undefined {
  const feed = queryClient.getQueryData<InfiniteFeedData>(queryKeys.posts.infinite('feed'));
  const fromFeed = feed?.pages.flatMap((page) => page.data).find((p) => p.id === postId);
  if (fromFeed) return fromFeed;

  const reelsEntries = queryClient.getQueriesData<{ pages?: Array<{ data?: Post[] }> }>({
    queryKey: [...queryKeys.posts.lists(), 'reels'],
  });
  for (const [, value] of reelsEntries) {
    const fromReels = value?.pages?.flatMap((page) => page.data ?? []).find((p) => p.id === postId);
    if (fromReels) return fromReels;
  }
  return undefined;
}

function findPostInDetailCache(
  queryClient: ReturnType<typeof useQueryClient>,
  postId: string,
): Post | undefined {
  const record = queryClient.getQueryData<{ data?: Post }>(queryKeys.posts.detail(postId));
  return record?.data;
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

/**
 * Écrit le total et la ventilation ABSOLUS d'une story dans le tray.
 *
 * Réutilise `patchStoryInFeed` — la clé `stories.feed()` est la seule où une
 * story vit côté web ; les surfaces post/reels n'en portent pas.
 */
function patchStoryReactionCounts(
  queryClient: ReturnType<typeof useQueryClient>,
  storyId: string,
  counts: { readonly likeCount: number; readonly reactionSummary: Record<string, number> },
) {
  patchStoryInFeed(queryClient, storyId, (s) => ({
    ...s,
    likeCount: counts.likeCount,
    reactionSummary: counts.reactionSummary,
  }));
}

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

// ---------------------------------------------------------------------------
// Shared helper: remove a post from every reels affinity thread cache.
//
// Mirror of `patchReelCaches` for deletion — a prefix-matched setQueriesData
// filters the post out of the `foryou` thread and every per-seed thread at
// once, so a deleted reel disappears from all reel surfaces without a refetch.
// ---------------------------------------------------------------------------

function removePostFromReelCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  postId: string,
) {
  queryClient.setQueriesData<{ pages?: Array<{ data?: Post[] }> }>(
    { queryKey: [...queryKeys.posts.lists(), 'reels'] },
    (old) => {
      if (!old?.pages) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          data: (page.data ?? []).filter((p) => p.id !== postId),
        })),
      };
    },
  );
}
