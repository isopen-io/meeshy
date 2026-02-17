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

import { useEffect, useRef } from 'react';
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
} from '@meeshy/shared/types/post';

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

  useEffect(() => {
    if (!enabled) return;

    const socket = meeshySocketIOService.getSocket();
    if (!socket) return;

    // ---- Subscribe to feed room ----
    socket.emit(CLIENT_EVENTS.FEED_SUBSCRIBE);

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

    // ---- Cleanup ----

    return () => {
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
    };
  }, [enabled]);
}
