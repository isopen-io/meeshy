/**
 * Hook useSocialSocket - Real-time social feed events via Socket.IO
 *
 * Listens for post, story, status, and comment events broadcast
 * to the authenticated user's feed room (`feed:{userId}`).
 *
 * Uses the shared Socket.IO singleton through meeshySocketIOService
 * so no additional connection is created.
 *
 * @module hooks/social/use-social-socket
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type {
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
  StatusCreatedEventData,
  StatusUpdatedEventData,
  StatusDeletedEventData,
  StatusReactedEventData,
  CommentAddedEventData,
  CommentDeletedEventData,
  CommentLikedEventData,
  PostTranslationUpdatedEventData,
  CommentTranslationUpdatedEventData,
} from '@meeshy/shared/types/post';
import type { StoryTranslationUpdatedEventData } from '@meeshy/shared/types/socketio-events';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseSocialSocketOptions {
  /** Post events */
  onPostCreated?: (data: PostCreatedEventData) => void;
  onPostUpdated?: (data: PostUpdatedEventData) => void;
  onPostDeleted?: (data: PostDeletedEventData) => void;
  onPostLiked?: (data: PostLikedEventData) => void;
  onPostUnliked?: (data: PostUnlikedEventData) => void;
  onPostReposted?: (data: PostRepostedEventData) => void;
  onPostBookmarked?: (data: PostBookmarkedEventData) => void;

  /** Story events */
  onStoryCreated?: (data: StoryCreatedEventData) => void;
  onStoryViewed?: (data: StoryViewedEventData) => void;
  onStoryReacted?: (data: StoryReactedEventData) => void;

  /** Status events */
  onStatusCreated?: (data: StatusCreatedEventData) => void;
  onStatusUpdated?: (data: StatusUpdatedEventData) => void;
  onStatusDeleted?: (data: StatusDeletedEventData) => void;
  onStatusReacted?: (data: StatusReactedEventData) => void;

  /** Comment events */
  onCommentAdded?: (data: CommentAddedEventData) => void;
  onCommentDeleted?: (data: CommentDeletedEventData) => void;
  onCommentLiked?: (data: CommentLikedEventData) => void;

  /** Translation events */
  onPostTranslationUpdated?: (data: PostTranslationUpdatedEventData) => void;
  onCommentTranslationUpdated?: (data: CommentTranslationUpdatedEventData) => void;
  onStoryTranslationUpdated?: (data: StoryTranslationUpdatedEventData) => void;

  /** When false the hook skips subscription and listener setup. Defaults to true. */
  enabled?: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Subscribe to real-time social feed events over the existing Socket.IO
 * connection. The hook emits `feed:subscribe` on mount and
 * `feed:unsubscribe` on cleanup so the server adds/removes the client
 * from the appropriate feed room.
 *
 * All event callbacks are kept in a ref so that callers do not need to
 * memoize them -- changing a callback will never cause the socket
 * listeners to be torn down and re-created.
 */
export function useSocialSocket(options: UseSocialSocketOptions = {}): void {
  const { enabled = true } = options;

  // Keep a stable ref to the latest callbacks so the effect never
  // re-runs when a callback identity changes.
  const handlersRef = useRef(options);

  useEffect(() => {
    handlersRef.current = options;
  });

  // `meeshySocketIOService.getSocket()` returns null until some other code
  // path (a conversation route, `use-socketio-messaging`) has bootstrapped
  // the connection at least once. A caller that mounts this hook first —
  // e.g. landing directly on a feed route via deep link/PWA shortcut,
  // without visiting a conversation route in the same session — would
  // otherwise see `getSocket()` return null forever: the subscribe effect
  // below bails out once on mount and nothing ever retries it. Listening for
  // status changes lets the hook pick up the socket the moment it's created
  // elsewhere, without polling.
  const [socketBootTick, setSocketBootTick] = useState(0);
  const hadSocketRef = useRef(Boolean(meeshySocketIOService.getSocket()));

  useEffect(() => {
    if (!enabled || hadSocketRef.current) return;
    return meeshySocketIOService.onStatusChange(() => {
      if (hadSocketRef.current) return;
      if (!meeshySocketIOService.getSocket()) return;
      hadSocketRef.current = true;
      setSocketBootTick(tick => tick + 1);
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const socket = meeshySocketIOService.getSocket();
    if (!socket) return;

    // ---- Subscribe to feed room ----
    // Room membership lives on the transient server-side socket and is lost
    // on every disconnect/reconnect (new socket.id) even though this hook
    // stays mounted, so the join is re-emitted on `connect` too (mirrors
    // usePostRoom's reconnect handling).
    const subscribe = () => socket.emit(CLIENT_EVENTS.FEED_SUBSCRIBE);
    subscribe();
    socket.on('connect', subscribe);

    // ---- Event handlers (delegate to latest ref) ----

    function handlePostCreated(data: PostCreatedEventData): void {
      handlersRef.current.onPostCreated?.(data);
    }
    function handlePostUpdated(data: PostUpdatedEventData): void {
      handlersRef.current.onPostUpdated?.(data);
    }
    function handlePostDeleted(data: PostDeletedEventData): void {
      handlersRef.current.onPostDeleted?.(data);
    }
    function handlePostLiked(data: PostLikedEventData): void {
      handlersRef.current.onPostLiked?.(data);
    }
    function handlePostUnliked(data: PostUnlikedEventData): void {
      handlersRef.current.onPostUnliked?.(data);
    }
    function handlePostReposted(data: PostRepostedEventData): void {
      handlersRef.current.onPostReposted?.(data);
    }
    function handlePostBookmarked(data: PostBookmarkedEventData): void {
      handlersRef.current.onPostBookmarked?.(data);
    }

    function handleStoryCreated(data: StoryCreatedEventData): void {
      handlersRef.current.onStoryCreated?.(data);
    }
    function handleStoryViewed(data: StoryViewedEventData): void {
      handlersRef.current.onStoryViewed?.(data);
    }
    function handleStoryReacted(data: StoryReactedEventData): void {
      handlersRef.current.onStoryReacted?.(data);
    }

    function handleStatusCreated(data: StatusCreatedEventData): void {
      handlersRef.current.onStatusCreated?.(data);
    }
    function handleStatusUpdated(data: StatusUpdatedEventData): void {
      handlersRef.current.onStatusUpdated?.(data);
    }
    function handleStatusDeleted(data: StatusDeletedEventData): void {
      handlersRef.current.onStatusDeleted?.(data);
    }
    function handleStatusReacted(data: StatusReactedEventData): void {
      handlersRef.current.onStatusReacted?.(data);
    }

    function handleCommentAdded(data: CommentAddedEventData): void {
      handlersRef.current.onCommentAdded?.(data);
    }
    function handleCommentDeleted(data: CommentDeletedEventData): void {
      handlersRef.current.onCommentDeleted?.(data);
    }
    function handleCommentLiked(data: CommentLikedEventData): void {
      handlersRef.current.onCommentLiked?.(data);
    }

    function handlePostTranslationUpdated(data: PostTranslationUpdatedEventData): void {
      handlersRef.current.onPostTranslationUpdated?.(data);
    }
    function handleCommentTranslationUpdated(data: CommentTranslationUpdatedEventData): void {
      handlersRef.current.onCommentTranslationUpdated?.(data);
    }
    function handleStoryTranslationUpdated(data: StoryTranslationUpdatedEventData): void {
      handlersRef.current.onStoryTranslationUpdated?.(data);
    }

    // ---- Register listeners ----

    socket.on(SERVER_EVENTS.POST_CREATED, handlePostCreated);
    socket.on(SERVER_EVENTS.POST_UPDATED, handlePostUpdated);
    socket.on(SERVER_EVENTS.POST_DELETED, handlePostDeleted);
    socket.on(SERVER_EVENTS.POST_LIKED, handlePostLiked);
    socket.on(SERVER_EVENTS.POST_UNLIKED, handlePostUnliked);
    socket.on(SERVER_EVENTS.POST_REPOSTED, handlePostReposted);
    socket.on(SERVER_EVENTS.POST_BOOKMARKED, handlePostBookmarked);

    socket.on(SERVER_EVENTS.STORY_CREATED, handleStoryCreated);
    socket.on(SERVER_EVENTS.STORY_VIEWED, handleStoryViewed);
    socket.on(SERVER_EVENTS.STORY_REACTED, handleStoryReacted);

    socket.on(SERVER_EVENTS.STATUS_CREATED, handleStatusCreated);
    socket.on(SERVER_EVENTS.STATUS_UPDATED, handleStatusUpdated);
    socket.on(SERVER_EVENTS.STATUS_DELETED, handleStatusDeleted);
    socket.on(SERVER_EVENTS.STATUS_REACTED, handleStatusReacted);

    socket.on(SERVER_EVENTS.COMMENT_ADDED, handleCommentAdded);
    socket.on(SERVER_EVENTS.COMMENT_DELETED, handleCommentDeleted);
    socket.on(SERVER_EVENTS.COMMENT_LIKED, handleCommentLiked);

    socket.on(SERVER_EVENTS.POST_TRANSLATION_UPDATED, handlePostTranslationUpdated);
    socket.on(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, handleCommentTranslationUpdated);
    socket.on(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, handleStoryTranslationUpdated);

    // ---- Cleanup ----

    return () => {
      socket.off('connect', subscribe);
      socket.emit(CLIENT_EVENTS.FEED_UNSUBSCRIBE);

      socket.off(SERVER_EVENTS.POST_CREATED, handlePostCreated);
      socket.off(SERVER_EVENTS.POST_UPDATED, handlePostUpdated);
      socket.off(SERVER_EVENTS.POST_DELETED, handlePostDeleted);
      socket.off(SERVER_EVENTS.POST_LIKED, handlePostLiked);
      socket.off(SERVER_EVENTS.POST_UNLIKED, handlePostUnliked);
      socket.off(SERVER_EVENTS.POST_REPOSTED, handlePostReposted);
      socket.off(SERVER_EVENTS.POST_BOOKMARKED, handlePostBookmarked);

      socket.off(SERVER_EVENTS.STORY_CREATED, handleStoryCreated);
      socket.off(SERVER_EVENTS.STORY_VIEWED, handleStoryViewed);
      socket.off(SERVER_EVENTS.STORY_REACTED, handleStoryReacted);

      socket.off(SERVER_EVENTS.STATUS_CREATED, handleStatusCreated);
      socket.off(SERVER_EVENTS.STATUS_UPDATED, handleStatusUpdated);
      socket.off(SERVER_EVENTS.STATUS_DELETED, handleStatusDeleted);
      socket.off(SERVER_EVENTS.STATUS_REACTED, handleStatusReacted);

      socket.off(SERVER_EVENTS.COMMENT_ADDED, handleCommentAdded);
      socket.off(SERVER_EVENTS.COMMENT_DELETED, handleCommentDeleted);
      socket.off(SERVER_EVENTS.COMMENT_LIKED, handleCommentLiked);

      socket.off(SERVER_EVENTS.POST_TRANSLATION_UPDATED, handlePostTranslationUpdated);
      socket.off(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, handleCommentTranslationUpdated);
      socket.off(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, handleStoryTranslationUpdated);
    };
  }, [enabled, socketBootTick]);
}
