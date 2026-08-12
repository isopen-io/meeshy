/**
 * Tests for hooks/social/use-feed-realtime.ts
 *
 * We mock useSocialSocket directly to avoid loading the large
 * @meeshy/shared/types/socketio-events module and to isolate the hook logic.
 *
 * IMPORTANT: Always pass stable array references to useFeedRealtime.
 * The hook compares initialPosts by reference (prevInitialRef) and re-syncs
 * its state when the reference changes. Inline arrays like `useFeedRealtime([])`
 * create a new reference on every render → infinite re-render loop.
 * Always declare initialPosts as a const OUTSIDE the renderHook callback.
 */

import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useFeedRealtime } from '@/hooks/social/use-feed-realtime';
import type { Post } from '@meeshy/shared/types/post';
import type { UseSocialSocketOptions } from '@/hooks/social/use-social-socket';

// ---------------------------------------------------------------------------
// Mock useSocialSocket - capture last options passed so tests can invoke handlers
// ---------------------------------------------------------------------------

let capturedOptions: UseSocialSocketOptions = {};

jest.mock('@/hooks/social/use-social-socket', () => ({
  useSocialSocket: (options: UseSocialSocketOptions) => {
    capturedOptions = options;
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    qc,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  };
}

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    authorId: 'user-1',
    type: 'POST',
    visibility: 'PUBLIC',
    content: 'Hello',
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    shareCount: 0,
    isPinned: false,
    isEdited: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// Stable empty array shared across tests that need an empty initial list
const EMPTY_POSTS: Post[] = [];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  capturedOptions = {};
});

// =============================================================================
// Initial state
// =============================================================================

describe('useFeedRealtime - initial state', () => {
  it('returns initialPosts as posts', () => {
    const initialPosts = [makePost({ id: 'p1' }), makePost({ id: 'p2' })];
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useFeedRealtime(initialPosts), { wrapper });

    expect(result.current.posts).toEqual(initialPosts);
    expect(result.current.newPostsCount).toBe(0);
  });

  it('returns empty posts when initialPosts is empty', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useFeedRealtime(EMPTY_POSTS), { wrapper });

    expect(result.current.posts).toEqual([]);
    expect(result.current.newPostsCount).toBe(0);
  });
});

// =============================================================================
// enabled=false
// =============================================================================

describe('useFeedRealtime - enabled=false', () => {
  it('passes enabled=false to useSocialSocket', () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useFeedRealtime(EMPTY_POSTS, { enabled: false }), { wrapper });

    expect(capturedOptions.enabled).toBe(false);
  });
});

// =============================================================================
// POST_CREATED handler
// =============================================================================

describe('useFeedRealtime - onPostCreated', () => {
  it('prepends new post and increments newPostsCount', () => {
    const { wrapper } = makeWrapper();
    const initial = [makePost({ id: 'old-1' })];
    const { result } = renderHook(() => useFeedRealtime(initial), { wrapper });

    const newPost = makePost({ id: 'new-1' });
    act(() => {
      capturedOptions.onPostCreated?.({ post: newPost });
    });

    expect(result.current.posts[0].id).toBe('new-1');
    expect(result.current.posts[1].id).toBe('old-1');
    expect(result.current.newPostsCount).toBe(1);
  });

  it('deduplicates: does not prepend when post id already in list', () => {
    const { wrapper } = makeWrapper();
    const post = makePost({ id: 'dup-1' });
    // Must be a stable reference so prevInitialRef check doesn't trigger on re-renders
    const initial = [post];
    const { result } = renderHook(() => useFeedRealtime(initial), { wrapper });

    act(() => {
      capturedOptions.onPostCreated?.({ post });
    });

    expect(result.current.posts).toHaveLength(1);
  });

  it('still increments newPostsCount even on duplicate post id', () => {
    const { wrapper } = makeWrapper();
    const post = makePost({ id: 'dup-1' });
    const initial = [post];
    const { result } = renderHook(() => useFeedRealtime(initial), { wrapper });

    act(() => {
      capturedOptions.onPostCreated?.({ post });
    });

    // The count still increments; only the array deduplicates
    expect(result.current.newPostsCount).toBe(1);
  });

  it('accumulates newPostsCount across multiple created events', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useFeedRealtime(EMPTY_POSTS), { wrapper });

    act(() => {
      capturedOptions.onPostCreated?.({ post: makePost({ id: 'a' }) });
      capturedOptions.onPostCreated?.({ post: makePost({ id: 'b' }) });
      capturedOptions.onPostCreated?.({ post: makePost({ id: 'c' }) });
    });

    expect(result.current.newPostsCount).toBe(3);
    expect(result.current.posts).toHaveLength(3);
  });
});

// =============================================================================
// POST_UPDATED handler
// =============================================================================

describe('useFeedRealtime - onPostUpdated', () => {
  it('replaces post in list when id matches', () => {
    const { wrapper } = makeWrapper();
    const original = makePost({ id: 'p1', content: 'Original' });
    const initial = [original];
    const { result } = renderHook(() => useFeedRealtime(initial), { wrapper });

    const updated = { ...original, content: 'Updated', isEdited: true };
    act(() => {
      capturedOptions.onPostUpdated?.({ post: updated });
    });

    expect(result.current.posts[0].content).toBe('Updated');
    expect(result.current.posts[0].isEdited).toBe(true);
  });

  it('no-op when post id does not match', () => {
    const { wrapper } = makeWrapper();
    const post = makePost({ id: 'p1', content: 'Original' });
    const initial = [post];
    const { result } = renderHook(() => useFeedRealtime(initial), { wrapper });

    const updated = makePost({ id: 'other', content: 'Updated' });
    act(() => {
      capturedOptions.onPostUpdated?.({ post: updated });
    });

    expect(result.current.posts[0].content).toBe('Original');
  });
});

// =============================================================================
// POST_DELETED handler
// =============================================================================

describe('useFeedRealtime - onPostDeleted', () => {
  it('removes post from list', () => {
    const { wrapper } = makeWrapper();
    const post1 = makePost({ id: 'p1' });
    const post2 = makePost({ id: 'p2' });
    const initial = [post1, post2];
    const { result } = renderHook(() => useFeedRealtime(initial), { wrapper });

    act(() => {
      capturedOptions.onPostDeleted?.({ postId: 'p1' });
    });

    expect(result.current.posts).toHaveLength(1);
    expect(result.current.posts[0].id).toBe('p2');
  });

  it('no-op when post id does not match any post', () => {
    const { wrapper } = makeWrapper();
    const post = makePost({ id: 'p1' });
    const initial = [post];
    const { result } = renderHook(() => useFeedRealtime(initial), { wrapper });

    act(() => {
      capturedOptions.onPostDeleted?.({ postId: 'nonexistent' });
    });

    expect(result.current.posts).toHaveLength(1);
  });
});

// =============================================================================
// POST_LIKED handler
// =============================================================================

describe('useFeedRealtime - onPostLiked', () => {
  it('updates likeCount and reactionSummary when postId matches', () => {
    const { wrapper } = makeWrapper();
    const post = makePost({ id: 'p1', likeCount: 0 });
    const initial = [post];
    const { result } = renderHook(() => useFeedRealtime(initial), { wrapper });

    act(() => {
      capturedOptions.onPostLiked?.({
        postId: 'p1',
        userId: 'u2',
        emoji: '❤️',
        likeCount: 1,
        reactionSummary: { '❤️': 1 },
      });
    });

    expect(result.current.posts[0].likeCount).toBe(1);
    expect(result.current.posts[0].reactionSummary).toEqual({ '❤️': 1 });
  });

  it('no-op when postId does not match', () => {
    const { wrapper } = makeWrapper();
    const post = makePost({ id: 'p1', likeCount: 0 });
    const initial = [post];
    const { result } = renderHook(() => useFeedRealtime(initial), { wrapper });

    act(() => {
      capturedOptions.onPostLiked?.({
        postId: 'other',
        userId: 'u2',
        emoji: '❤️',
        likeCount: 99,
        reactionSummary: { '❤️': 99 },
      });
    });

    expect(result.current.posts[0].likeCount).toBe(0);
  });
});

// =============================================================================
// POST_UNLIKED handler
// =============================================================================

describe('useFeedRealtime - onPostUnliked', () => {
  it('updates likeCount and reactionSummary when postId matches', () => {
    const { wrapper } = makeWrapper();
    const post = makePost({ id: 'p1', likeCount: 1, reactionSummary: { '❤️': 1 } });
    const initial = [post];
    const { result } = renderHook(() => useFeedRealtime(initial), { wrapper });

    act(() => {
      capturedOptions.onPostUnliked?.({
        postId: 'p1',
        userId: 'u2',
        emoji: '❤️',
        likeCount: 0,
        reactionSummary: {},
      });
    });

    expect(result.current.posts[0].likeCount).toBe(0);
    expect(result.current.posts[0].reactionSummary).toEqual({});
  });

  it('no-op when postId does not match', () => {
    const { wrapper } = makeWrapper();
    const post = makePost({ id: 'p1', likeCount: 5 });
    const initial = [post];
    const { result } = renderHook(() => useFeedRealtime(initial), { wrapper });

    act(() => {
      capturedOptions.onPostUnliked?.({
        postId: 'other',
        userId: 'u2',
        emoji: '❤️',
        likeCount: 0,
        reactionSummary: {},
      });
    });

    expect(result.current.posts[0].likeCount).toBe(5);
  });
});

// =============================================================================
// POST_REPOSTED handler
// =============================================================================

describe('useFeedRealtime - onPostReposted', () => {
  it('prepends repost and increments newPostsCount', () => {
    const { wrapper } = makeWrapper();
    const original = makePost({ id: 'p1' });
    const initial = [original];
    const { result } = renderHook(() => useFeedRealtime(initial), { wrapper });

    const repost = makePost({ id: 'repost-1', type: 'POST' });
    act(() => {
      capturedOptions.onPostReposted?.({ repost });
    });

    expect(result.current.posts[0].id).toBe('repost-1');
    expect(result.current.newPostsCount).toBe(1);
  });

  it('does NOT duplicate repost when it already exists in list', () => {
    const { wrapper } = makeWrapper();
    const repost = makePost({ id: 'repost-1' });
    const initial = [repost];
    const { result } = renderHook(() => useFeedRealtime(initial), { wrapper });

    act(() => {
      capturedOptions.onPostReposted?.({ repost });
    });

    expect(result.current.posts).toHaveLength(1);
  });

  it('still increments newPostsCount on duplicate repost', () => {
    const { wrapper } = makeWrapper();
    const repost = makePost({ id: 'repost-1' });
    const initial = [repost];
    const { result } = renderHook(() => useFeedRealtime(initial), { wrapper });

    act(() => {
      capturedOptions.onPostReposted?.({ repost });
    });

    expect(result.current.newPostsCount).toBe(1);
  });
});

// =============================================================================
// COMMENT_ADDED handler
// =============================================================================

describe('useFeedRealtime - onCommentAdded', () => {
  it('updates commentCount on matching post', () => {
    const { wrapper } = makeWrapper();
    const post = makePost({ id: 'p1', commentCount: 0 });
    const initial = [post];
    const { result } = renderHook(() => useFeedRealtime(initial), { wrapper });

    act(() => {
      capturedOptions.onCommentAdded?.({
        postId: 'p1',
        comment: { id: 'c1', content: 'Nice!', likeCount: 0, replyCount: 0, createdAt: '2026-01-01' },
        commentCount: 1,
      });
    });

    expect(result.current.posts[0].commentCount).toBe(1);
  });

  it('no-op when postId does not match', () => {
    const { wrapper } = makeWrapper();
    const post = makePost({ id: 'p1', commentCount: 0 });
    const initial = [post];
    const { result } = renderHook(() => useFeedRealtime(initial), { wrapper });

    act(() => {
      capturedOptions.onCommentAdded?.({
        postId: 'other',
        comment: { id: 'c1', content: '!', likeCount: 0, replyCount: 0, createdAt: '2026-01-01' },
        commentCount: 99,
      });
    });

    expect(result.current.posts[0].commentCount).toBe(0);
  });
});

// =============================================================================
// COMMENT_DELETED handler
// =============================================================================

describe('useFeedRealtime - onCommentDeleted', () => {
  it('updates commentCount on matching post', () => {
    const { wrapper } = makeWrapper();
    const post = makePost({ id: 'p1', commentCount: 3 });
    const initial = [post];
    const { result } = renderHook(() => useFeedRealtime(initial), { wrapper });

    act(() => {
      capturedOptions.onCommentDeleted?.({
        postId: 'p1',
        commentId: 'c1',
        commentCount: 2,
      });
    });

    expect(result.current.posts[0].commentCount).toBe(2);
  });

  it('no-op when postId does not match', () => {
    const { wrapper } = makeWrapper();
    const post = makePost({ id: 'p1', commentCount: 3 });
    const initial = [post];
    const { result } = renderHook(() => useFeedRealtime(initial), { wrapper });

    act(() => {
      capturedOptions.onCommentDeleted?.({
        postId: 'other',
        commentId: 'c1',
        commentCount: 0,
      });
    });

    expect(result.current.posts[0].commentCount).toBe(3);
  });
});

// =============================================================================
// COMMENT_LIKED handler
// =============================================================================

describe('useFeedRealtime - onCommentLiked', () => {
  it('is a no-op: does not change any post field', () => {
    const { wrapper } = makeWrapper();
    const post = makePost({ id: 'p1', commentCount: 1 });
    const initial = [post];
    const { result } = renderHook(() => useFeedRealtime(initial), { wrapper });

    act(() => {
      capturedOptions.onCommentLiked?.({
        postId: 'p1',
        commentId: 'c1',
        userId: 'u2',
        emoji: '❤️',
        likeCount: 1,
      });
    });

    expect(result.current.posts[0].commentCount).toBe(1);
    expect(result.current.posts).toHaveLength(1);
  });
});

// =============================================================================
// clearNewPosts
// =============================================================================

describe('useFeedRealtime - clearNewPosts', () => {
  it('resets newPostsCount to 0', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useFeedRealtime(EMPTY_POSTS), { wrapper });

    act(() => {
      capturedOptions.onPostCreated?.({ post: makePost({ id: 'p1' }) });
      capturedOptions.onPostCreated?.({ post: makePost({ id: 'p2' }) });
    });

    expect(result.current.newPostsCount).toBe(2);

    act(() => {
      result.current.clearNewPosts();
    });

    expect(result.current.newPostsCount).toBe(0);
  });

  it('does not affect the posts array when clearing count', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useFeedRealtime(EMPTY_POSTS), { wrapper });

    act(() => {
      capturedOptions.onPostCreated?.({ post: makePost({ id: 'p1' }) });
    });

    expect(result.current.posts).toHaveLength(1);

    act(() => {
      result.current.clearNewPosts();
    });

    expect(result.current.posts).toHaveLength(1);
    expect(result.current.newPostsCount).toBe(0);
  });
});

// =============================================================================
// initialPosts sync (prevInitialRef behavior)
// =============================================================================

describe('useFeedRealtime - initialPosts sync', () => {
  it('replaces posts and resets count when initialPosts reference changes', () => {
    const { wrapper } = makeWrapper();
    const initial = [makePost({ id: 'old-1' })];

    const { result, rerender } = renderHook(
      ({ posts }: { posts: Post[] }) => useFeedRealtime(posts),
      { wrapper, initialProps: { posts: initial } },
    );

    act(() => {
      capturedOptions.onPostCreated?.({ post: makePost({ id: 'new-socket-1' }) });
    });

    expect(result.current.newPostsCount).toBe(1);

    const freshPosts = [makePost({ id: 'fresh-1' }), makePost({ id: 'fresh-2' })];
    rerender({ posts: freshPosts });

    expect(result.current.posts).toEqual(freshPosts);
    expect(result.current.newPostsCount).toBe(0);
  });

  it('does NOT reset when initialPosts reference is the same object', () => {
    const { wrapper } = makeWrapper();
    const initial = [makePost({ id: 'p1' })];

    const { result, rerender } = renderHook(
      ({ posts }: { posts: Post[] }) => useFeedRealtime(posts),
      { wrapper, initialProps: { posts: initial } },
    );

    act(() => {
      capturedOptions.onPostCreated?.({ post: makePost({ id: 'new-1' }) });
    });

    expect(result.current.posts).toHaveLength(2);
    expect(result.current.newPostsCount).toBe(1);

    // Re-render with same reference - should NOT reset
    rerender({ posts: initial });

    expect(result.current.posts).toHaveLength(2);
    expect(result.current.newPostsCount).toBe(1);
  });

  it('passes enabled=true by default to useSocialSocket', () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useFeedRealtime(EMPTY_POSTS), { wrapper });

    expect(capturedOptions.enabled).not.toBe(false);
  });
});
