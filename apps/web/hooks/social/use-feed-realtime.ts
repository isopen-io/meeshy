/**
 * Hook useFeedRealtime - State-based wrapper around useSocialSocket
 *
 * Provides a simple `posts` array that stays in sync with real-time
 * events so the feed page does not need to manage individual event
 * handlers.
 *
 * @module hooks/social/use-feed-realtime
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSocialSocket } from './use-social-socket';
import type { Post } from '@meeshy/shared/types/post';
import type {
  PostCreatedEventData,
  PostUpdatedEventData,
  PostDeletedEventData,
  PostLikedEventData,
  PostUnlikedEventData,
  PostRepostedEventData,
  CommentAddedEventData,
  CommentDeletedEventData,
  CommentLikedEventData,
} from '@meeshy/shared/types/post';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseFeedRealtimeOptions {
  /** When false the hook skips subscription. Defaults to true. */
  enabled?: boolean;
}

export interface UseFeedRealtimeReturn {
  /** The live list of posts, kept up to date by socket events. */
  posts: Post[];
  /** Number of new posts received since mount (for "N new posts" banners). */
  newPostsCount: number;
  /** Reset the new-posts counter (e.g. after the user scrolls to top). */
  clearNewPosts: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Wraps `useSocialSocket` and maintains a live `Post[]` state.
 *
 * New posts are prepended, deleted posts are removed, and metadata
 * (like counts, comment counts) is patched in place so the feed page
 * only needs to render the returned array.
 *
 * @param initialPosts - The server-rendered or fetched initial set of posts.
 * @param options      - Optional configuration.
 */
export function useFeedRealtime(
  initialPosts: Post[],
  options: UseFeedRealtimeOptions = {},
): UseFeedRealtimeReturn {
  const { enabled = true } = options;

  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [newPostsCount, setNewPostsCount] = useState(0);

  // Keep initialPosts in sync when the caller fetches a fresh page.
  const prevInitialRef = useRef(initialPosts);
  useEffect(() => {
    if (prevInitialRef.current !== initialPosts) {
      prevInitialRef.current = initialPosts;
      setPosts(initialPosts);
      setNewPostsCount(0);
    }
  }, [initialPosts]);

  // ------------------------------------------------------------------
  // Post handlers
  // ------------------------------------------------------------------

  const handlePostCreated = useCallback((data: PostCreatedEventData) => {
    setPosts(prev => {
      if (prev.some(p => p.id === data.post.id)) return prev;
      return [data.post, ...prev];
    });
    setNewPostsCount(prev => prev + 1);
  }, []);

  const handlePostUpdated = useCallback((data: PostUpdatedEventData) => {
    setPosts(prev =>
      prev.map(p => (p.id === data.post.id ? data.post : p)),
    );
  }, []);

  const handlePostDeleted = useCallback((data: PostDeletedEventData) => {
    setPosts(prev => prev.filter(p => p.id !== data.postId));
  }, []);

  const handlePostLiked = useCallback((data: PostLikedEventData) => {
    setPosts(prev =>
      prev.map(p => {
        if (p.id !== data.postId) return p;
        return {
          ...p,
          likeCount: data.likeCount,
          reactionSummary: data.reactionSummary,
        };
      }),
    );
  }, []);

  const handlePostUnliked = useCallback((data: PostUnlikedEventData) => {
    setPosts(prev =>
      prev.map(p => {
        if (p.id !== data.postId) return p;
        return {
          ...p,
          likeCount: data.likeCount,
          reactionSummary: data.reactionSummary,
        };
      }),
    );
  }, []);

  const handlePostReposted = useCallback((data: PostRepostedEventData) => {
    setPosts(prev => {
      if (prev.some(p => p.id === data.repost.id)) return prev;
      return [data.repost, ...prev];
    });
    setNewPostsCount(prev => prev + 1);
  }, []);

  // ------------------------------------------------------------------
  // Comment handlers
  // ------------------------------------------------------------------

  const handleCommentAdded = useCallback((data: CommentAddedEventData) => {
    setPosts(prev =>
      prev.map(p => {
        if (p.id !== data.postId) return p;
        return { ...p, commentCount: data.commentCount };
      }),
    );
  }, []);

  const handleCommentDeleted = useCallback((data: CommentDeletedEventData) => {
    setPosts(prev =>
      prev.map(p => {
        if (p.id !== data.postId) return p;
        return { ...p, commentCount: data.commentCount };
      }),
    );
  }, []);

  const handleCommentLiked = useCallback((_data: CommentLikedEventData) => {
    // Comment like counts live on the comment itself, not the post.
    // A full implementation would update nested comment data if the
    // post includes expanded comments; for the feed list view this
    // is a no-op.
  }, []);

  // ------------------------------------------------------------------
  // Public helpers
  // ------------------------------------------------------------------

  const clearNewPosts = useCallback(() => {
    setNewPostsCount(0);
  }, []);

  // ------------------------------------------------------------------
  // Wire up the socket hook
  // ------------------------------------------------------------------

  useSocialSocket({
    onPostCreated: handlePostCreated,
    onPostUpdated: handlePostUpdated,
    onPostDeleted: handlePostDeleted,
    onPostLiked: handlePostLiked,
    onPostUnliked: handlePostUnliked,
    onPostReposted: handlePostReposted,
    onCommentAdded: handleCommentAdded,
    onCommentDeleted: handleCommentDeleted,
    onCommentLiked: handleCommentLiked,
    enabled,
  });

  return { posts, newPostsCount, clearNewPosts };
}
