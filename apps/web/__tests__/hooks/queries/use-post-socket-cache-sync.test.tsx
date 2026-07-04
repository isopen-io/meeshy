import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { usePostSocketCacheSync } from '@/hooks/queries/use-post-socket-cache-sync';

// Socket mock
const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
const mockSocket = {
  on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(handler);
  }),
  off: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
    if (listeners[event]) {
      listeners[event] = listeners[event].filter((h) => h !== handler);
    }
  }),
};

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    getSocket: () => mockSocket,
    onStatusChange: jest.fn(() => () => {}),
  },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    POST_CREATED: 'post:created',
    POST_UPDATED: 'post:updated',
    POST_DELETED: 'post:deleted',
    POST_LIKED: 'post:liked',
    POST_UNLIKED: 'post:unliked',
    POST_REPOSTED: 'post:reposted',
    POST_BOOKMARKED: 'post:bookmarked',
    COMMENT_ADDED: 'comment:added',
    COMMENT_DELETED: 'comment:deleted',
    COMMENT_LIKED: 'comment:liked',
    POST_TRANSLATION_UPDATED: 'post:translation-updated',
    COMMENT_TRANSLATION_UPDATED: 'comment:translation-updated',
    COMMENT_MEDIA_UPDATED: 'comment:media-updated',
    STORY_CREATED: 'story:created',
    STORY_VIEWED: 'story:viewed',
    STORY_REACTED: 'story:reacted',
    STORY_UPDATED: 'story:updated',
    STORY_DELETED: 'story:deleted',
    STORY_UNREACTED: 'story:unreacted',
    STATUS_CREATED: 'status:created',
    STATUS_UPDATED: 'status:updated',
    STATUS_DELETED: 'status:deleted',
    STATUS_REACTED: 'status:reacted',
    STATUS_UNREACTED: 'status:unreacted',
    POST_REACTION_ADDED: 'post:reaction-added',
    POST_REACTION_REMOVED: 'post:reaction-removed',
    COMMENT_REACTION_ADDED: 'comment:reaction-added',
    COMMENT_REACTION_REMOVED: 'comment:reaction-removed',
  },
}));

jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    posts: {
      all: ['posts'],
      lists: () => ['posts', 'list'],
      infinite: (type?: string) => ['posts', 'list', 'infinite', type],
      details: () => ['posts', 'detail'],
      detail: (id: string) => ['posts', 'detail', id],
      comments: (postId: string) => ['posts', 'detail', postId, 'comments'],
      commentsInfinite: (postId: string) => ['posts', 'detail', postId, 'comments', 'infinite'],
      commentReplies: (postId: string, commentId: string) => ['posts', 'detail', postId, 'comments', 'replies', commentId],
      bookmarks: () => ['posts', 'list', 'bookmarks'],
      stories: () => ['posts', 'list', 'stories'],
      statuses: () => ['posts', 'list', 'statuses'],
    },
    stories: {
      feed: () => ['stories', 'feed'],
    },
  },
}));

const mockPost = {
  id: 'post-1',
  authorId: 'user-1',
  type: 'POST' as const,
  visibility: 'PUBLIC' as const,
  content: 'Hello',
  likeCount: 5,
  commentCount: 2,
  repostCount: 0,
  viewCount: 10,
  bookmarkCount: 0,
  shareCount: 0,
  isPinned: false,
  isEdited: false,
  reactionSummary: {} as Record<string, number>,
  currentUserReactions: [] as string[],
  createdAt: '2026-03-28T00:00:00Z',
  updatedAt: '2026-03-28T00:00:00Z',
};

function emit(event: string, data: unknown) {
  (listeners[event] ?? []).forEach((h) => h(data));
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
}

function createWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function seedFeed(qc: QueryClient, posts = [mockPost]) {
  qc.setQueryData(['posts', 'list', 'infinite', 'feed'], {
    pages: [{ data: posts, meta: { pagination: { total: posts.length, offset: 0, limit: 20, hasMore: false }, nextCursor: null } }],
    pageParams: [undefined],
  });
}

function getFeedPosts(qc: QueryClient): unknown[] {
  const data = qc.getQueryData<{ pages: { data: unknown[] }[] }>(['posts', 'list', 'infinite', 'feed']);
  return data?.pages.flatMap((p) => p.data) ?? [];
}

const mockStory = { ...mockPost, id: 'story-1', type: 'STORY' as const };

function seedStories(qc: QueryClient, stories: unknown[] = [mockStory]) {
  qc.setQueryData(['stories', 'feed'], stories);
}

function getStories(qc: QueryClient): Array<{ id: string; viewCount?: number; content?: string }> {
  return qc.getQueryData<Array<{ id: string; viewCount?: number; content?: string }>>(['stories', 'feed']) ?? [];
}

describe('usePostSocketCacheSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(listeners).forEach((k) => delete listeners[k]);
  });

  it('registers 28 socket listeners on mount (13 post/comment + 11 story/status + 4 reaction)', () => {
    const qc = createQueryClient();
    renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });
    expect(mockSocket.on).toHaveBeenCalledTimes(28);
  });

  it('unregisters all 28 listeners on unmount', () => {
    const qc = createQueryClient();
    const { unmount } = renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });
    unmount();
    expect(mockSocket.off).toHaveBeenCalledTimes(28);
  });

  it('does not register when enabled=false', () => {
    const qc = createQueryClient();
    renderHook(() => usePostSocketCacheSync({ enabled: false }), { wrapper: createWrapper(qc) });
    expect(mockSocket.on).not.toHaveBeenCalled();
  });

  describe('post:created', () => {
    it('prepends new post to feed', () => {
      const qc = createQueryClient();
      seedFeed(qc);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      const newPost = { ...mockPost, id: 'post-new', content: 'New!' };
      act(() => emit('post:created', { post: newPost }));

      const posts = getFeedPosts(qc);
      expect(posts).toHaveLength(2);
      expect((posts[0] as { id: string }).id).toBe('post-new');
    });

    it('deduplicates by id', () => {
      const qc = createQueryClient();
      seedFeed(qc);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:created', { post: mockPost }));

      expect(getFeedPosts(qc)).toHaveLength(1);
    });
  });

  describe('post:deleted', () => {
    it('removes post from feed', () => {
      const qc = createQueryClient();
      seedFeed(qc);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:deleted', { postId: 'post-1', authorId: 'user-1' }));

      expect(getFeedPosts(qc)).toHaveLength(0);
    });
  });

  describe('post:liked', () => {
    it('updates likeCount and reactionSummary', () => {
      const qc = createQueryClient();
      seedFeed(qc);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:liked', {
        postId: 'post-1',
        userId: 'user-2',
        emoji: '❤️',
        likeCount: 6,
        reactionSummary: { '❤️': 6 },
      }));

      const posts = getFeedPosts(qc) as typeof mockPost[];
      expect(posts[0].likeCount).toBe(6);
      expect(posts[0].reactionSummary).toEqual({ '❤️': 6 });
    });
  });

  describe('comment:added', () => {
    it('updates commentCount in feed', () => {
      const qc = createQueryClient();
      seedFeed(qc);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('comment:added', {
        postId: 'post-1',
        comment: { id: 'c-1', content: 'Nice!', likeCount: 0, replyCount: 0, createdAt: new Date().toISOString() },
        commentCount: 3,
      }));

      const posts = getFeedPosts(qc) as typeof mockPost[];
      expect(posts[0].commentCount).toBe(3);
    });
  });

  describe('comment:deleted', () => {
    it('updates commentCount in feed', () => {
      const qc = createQueryClient();
      seedFeed(qc);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('comment:deleted', {
        postId: 'post-1',
        commentId: 'c-1',
        commentCount: 1,
      }));

      const posts = getFeedPosts(qc) as typeof mockPost[];
      expect(posts[0].commentCount).toBe(1);
    });
  });

  describe('post:translation-updated', () => {
    it('merges translation into post', () => {
      const qc = createQueryClient();
      seedFeed(qc);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:translation-updated', {
        postId: 'post-1',
        language: 'en',
        translation: { text: 'Hi', translationModel: 'nllb', createdAt: new Date().toISOString() },
      }));

      const posts = getFeedPosts(qc) as (typeof mockPost & { translations: Record<string, unknown> })[];
      expect(posts[0].translations).toHaveProperty('en');
    });
  });

  describe('story:created', () => {
    it('prepends the new story to the stories.feed() cache', () => {
      const qc = createQueryClient();
      seedStories(qc, [{ ...mockStory, id: 'story-old' }]);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('story:created', { story: { ...mockStory, id: 'story-new' } }));

      expect(getStories(qc).map((s) => s.id)).toEqual(['story-new', 'story-old']);
    });

    it('is idempotent when the story already exists (no duplicate)', () => {
      const qc = createQueryClient();
      seedStories(qc, [mockStory]);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('story:created', { story: mockStory }));

      expect(getStories(qc).map((s) => s.id)).toEqual(['story-1']);
    });
  });

  describe('status:created', () => {
    it('invalidates statuses cache', () => {
      const qc = createQueryClient();
      const spy = jest.spyOn(qc, 'invalidateQueries');
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('status:created', { status: mockPost }));

      expect(spy).toHaveBeenCalledWith({ queryKey: ['posts', 'list', 'statuses'] });
      spy.mockRestore();
    });
  });

  describe('status:deleted', () => {
    it('invalidates statuses cache', () => {
      const qc = createQueryClient();
      const spy = jest.spyOn(qc, 'invalidateQueries');
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('status:deleted', { statusId: 'st-1', authorId: 'user-1' }));

      expect(spy).toHaveBeenCalledWith({ queryKey: ['posts', 'list', 'statuses'] });
      spy.mockRestore();
    });
  });

  describe('post:reaction-added', () => {
    it('patches reactionSummary and currentUserReactions for the reacting user', () => {
      const qc = createQueryClient();
      seedFeed(qc, [{ ...mockPost, currentUserReactions: [] as string[], reactionSummary: {} as Record<string, number> }]);
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-2' }), { wrapper: createWrapper(qc) });

      act(() => emit('post:reaction-added', {
        postId: 'post-1',
        userId: 'user-2',
        emoji: '❤️',
        action: 'add',
        aggregation: { emoji: '❤️', count: 1 },
        timestamp: new Date().toISOString(),
      }));

      const posts = getFeedPosts(qc) as (typeof mockPost & { reactionSummary: Record<string, number>; currentUserReactions: string[] })[];
      expect(posts[0].reactionSummary['❤️']).toBe(1);
      expect(posts[0].currentUserReactions).toContain('❤️');
    });

    it('does not add to currentUserReactions for another user', () => {
      const qc = createQueryClient();
      seedFeed(qc, [{ ...mockPost, currentUserReactions: [] as string[], reactionSummary: {} as Record<string, number> }]);
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-1' }), { wrapper: createWrapper(qc) });

      act(() => emit('post:reaction-added', {
        postId: 'post-1',
        userId: 'user-99',
        emoji: '❤️',
        action: 'add',
        aggregation: { emoji: '❤️', count: 1 },
        timestamp: new Date().toISOString(),
      }));

      const posts = getFeedPosts(qc) as (typeof mockPost & { currentUserReactions: string[] })[];
      expect(posts[0].currentUserReactions).toHaveLength(0);
    });

    it('does NOT double-count likeCount on the reactor own self-echo (optimistic already applied)', () => {
      // Reactor optimistically bumped likeCount 5→6 and reactionSummary 😂:2→3.
      // The gateway self-echo carries the AUTHORITATIVE count (3). A blind +1 would
      // push likeCount to 7 while the emoji badges still sum to 3 — the F56 drift.
      const qc = createQueryClient();
      seedFeed(qc, [{ ...mockPost, likeCount: 6, reactionSummary: { '😂': 3 } as Record<string, number>, currentUserReactions: ['😂'] as string[] }]);
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-2' }), { wrapper: createWrapper(qc) });

      act(() => emit('post:reaction-added', {
        postId: 'post-1',
        userId: 'user-2',
        emoji: '😂',
        action: 'add',
        aggregation: { emoji: '😂', count: 3 },
        timestamp: new Date().toISOString(),
      }));

      const posts = getFeedPosts(qc) as (typeof mockPost & { likeCount: number; reactionSummary: Record<string, number> })[];
      expect(posts[0].likeCount).toBe(6);
      expect(posts[0].reactionSummary['😂']).toBe(3);
    });

    it('increments likeCount by the authoritative delta for a remote reactor', () => {
      const qc = createQueryClient();
      seedFeed(qc, [{ ...mockPost, likeCount: 5, reactionSummary: { '😂': 2 } as Record<string, number>, currentUserReactions: [] as string[] }]);
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-1' }), { wrapper: createWrapper(qc) });

      act(() => emit('post:reaction-added', {
        postId: 'post-1',
        userId: 'user-99',
        emoji: '😂',
        action: 'add',
        aggregation: { emoji: '😂', count: 3 },
        timestamp: new Date().toISOString(),
      }));

      const posts = getFeedPosts(qc) as (typeof mockPost & { likeCount: number; reactionSummary: Record<string, number> })[];
      expect(posts[0].likeCount).toBe(6);
      expect(posts[0].reactionSummary['😂']).toBe(3);
    });
  });

  describe('post:reaction-removed', () => {
    it('removes emoji from reactionSummary when count drops to zero', () => {
      const seed = { ...mockPost, reactionSummary: { '❤️': 1 } as Record<string, number>, currentUserReactions: ['❤️'] };
      const qc = createQueryClient();
      seedFeed(qc, [seed]);
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-1' }), { wrapper: createWrapper(qc) });

      act(() => emit('post:reaction-removed', {
        postId: 'post-1',
        userId: 'user-1',
        emoji: '❤️',
        action: 'remove',
        aggregation: { emoji: '❤️', count: 0 },
        timestamp: new Date().toISOString(),
      }));

      const posts = getFeedPosts(qc) as (typeof mockPost & { reactionSummary: Record<string, number>; currentUserReactions: string[] })[];
      expect(posts[0].reactionSummary['❤️']).toBeUndefined();
      expect(posts[0].currentUserReactions).not.toContain('❤️');
    });
  });

  // ---------------------------------------------------------------------------
  // Additional coverage: handlers not covered above
  // ---------------------------------------------------------------------------

  describe('post:updated', () => {
    it('replaces post in feed', () => {
      const qc = createQueryClient();
      seedFeed(qc);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      const updated = { ...mockPost, content: 'Updated', isEdited: true };
      act(() => emit('post:updated', { post: updated }));

      const posts = getFeedPosts(qc) as typeof mockPost[];
      expect(posts[0].content).toBe('Updated');
      expect(posts[0].isEdited).toBe(true);
    });

    it('no-op when feed is empty (old=undefined)', () => {
      const qc = createQueryClient();
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      const updated = { ...mockPost, content: 'Updated' };
      act(() => emit('post:updated', { post: updated }));

      expect(qc.getQueryData(['posts', 'list', 'infinite', 'feed'])).toBeUndefined();
    });

    it('updates detail cache when detail exists', () => {
      const qc = createQueryClient();
      qc.setQueryData(['posts', 'detail', 'post-1'], { data: mockPost });
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      const updated = { ...mockPost, content: 'Detail Updated' };
      act(() => emit('post:updated', { post: updated }));

      const detail = qc.getQueryData<{ data: typeof mockPost }>(['posts', 'detail', 'post-1']);
      expect(detail?.data.content).toBe('Detail Updated');
    });
  });

  describe('post:unliked', () => {
    it('updates likeCount and reactionSummary', () => {
      const qc = createQueryClient();
      seedFeed(qc, [{ ...mockPost, likeCount: 5, reactionSummary: { '❤️': 5 } as Record<string, number> }]);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:unliked', {
        postId: 'post-1',
        userId: 'user-2',
        emoji: '❤️',
        likeCount: 4,
        reactionSummary: { '❤️': 4 },
      }));

      const posts = getFeedPosts(qc) as typeof mockPost[];
      expect(posts[0].likeCount).toBe(4);
      expect((posts[0].reactionSummary as Record<string, number>)['❤️']).toBe(4);
    });
  });

  describe('post:reposted', () => {
    it('prepends repost to feed', () => {
      const qc = createQueryClient();
      seedFeed(qc);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      const repost = { ...mockPost, id: 'repost-1' };
      act(() => emit('post:reposted', { repost }));

      const posts = getFeedPosts(qc);
      expect(posts).toHaveLength(2);
      expect((posts[0] as typeof mockPost).id).toBe('repost-1');
    });

    it('deduplicates repost', () => {
      const qc = createQueryClient();
      const repost = { ...mockPost, id: 'repost-1' };
      seedFeed(qc, [repost]);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:reposted', { repost }));

      expect(getFeedPosts(qc)).toHaveLength(1);
    });

    it('no-op when feed undefined', () => {
      const qc = createQueryClient();
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:reposted', { repost: { ...mockPost, id: 'repost-1' } }));

      expect(qc.getQueryData(['posts', 'list', 'infinite', 'feed'])).toBeUndefined();
    });
  });

  describe('post:bookmarked', () => {
    it('invalidates bookmarks cache when bookmarked=true', () => {
      const qc = createQueryClient();
      const spy = jest.spyOn(qc, 'invalidateQueries');
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:bookmarked', {
        postId: 'post-1',
        userId: 'user-1',
        bookmarked: true,
      }));

      expect(spy).toHaveBeenCalledWith({ queryKey: ['posts', 'list', 'bookmarks'] });
      spy.mockRestore();
    });

    it('does NOT invalidate bookmarks cache when bookmarked=false', () => {
      const qc = createQueryClient();
      const spy = jest.spyOn(qc, 'invalidateQueries');
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:bookmarked', {
        postId: 'post-1',
        userId: 'user-1',
        bookmarked: false,
      }));

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('comment:added (commentsInfinite cache)', () => {
    it('prepends comment to commentsInfinite cache', () => {
      const qc = createQueryClient();
      seedFeed(qc);
      const existingComment = { id: 'c-existing', content: 'Old', likeCount: 0, replyCount: 0, createdAt: new Date().toISOString() };
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
        pages: [{ data: [existingComment], meta: {} }],
        pageParams: [undefined],
      });
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      const newComment = { id: 'c-new', content: 'New!', likeCount: 0, replyCount: 0, createdAt: new Date().toISOString() };
      act(() => emit('comment:added', {
        postId: 'post-1',
        comment: newComment,
        commentCount: 2,
      }));

      const data = qc.getQueryData<{ pages: { data: { id: string }[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      expect(data?.pages[0].data[0].id).toBe('c-new');
      expect(data?.pages[0].data).toHaveLength(2);
    });

    it('deduplicates comment in commentsInfinite cache', () => {
      const qc = createQueryClient();
      seedFeed(qc);
      const comment = { id: 'c-dup', content: 'Dup', likeCount: 0, replyCount: 0, createdAt: new Date().toISOString() };
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
        pages: [{ data: [comment], meta: {} }],
        pageParams: [undefined],
      });
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('comment:added', {
        postId: 'post-1',
        comment,
        commentCount: 1,
      }));

      const data = qc.getQueryData<{ pages: { data: unknown[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      expect(data?.pages[0].data).toHaveLength(1);
    });

    it('no-op when commentsInfinite cache undefined', () => {
      const qc = createQueryClient();
      seedFeed(qc);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('comment:added', {
        postId: 'post-1',
        comment: { id: 'c-1', content: 'Hi', likeCount: 0, replyCount: 0, createdAt: new Date().toISOString() },
        commentCount: 1,
      }));

      expect(qc.getQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'])).toBeUndefined();
    });
  });

  describe('comment:deleted (commentsInfinite cache)', () => {
    it('removes comment from commentsInfinite cache', () => {
      const qc = createQueryClient();
      seedFeed(qc);
      const comment = { id: 'c-1', content: 'To delete', likeCount: 0, replyCount: 0, createdAt: new Date().toISOString() };
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
        pages: [{ data: [comment], meta: {} }],
        pageParams: [undefined],
      });
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('comment:deleted', {
        postId: 'post-1',
        commentId: 'c-1',
        commentCount: 0,
      }));

      const data = qc.getQueryData<{ pages: { data: unknown[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      expect(data?.pages[0].data).toHaveLength(0);
    });

    it('no-op when commentsInfinite cache undefined', () => {
      const qc = createQueryClient();
      seedFeed(qc);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('comment:deleted', {
        postId: 'post-1',
        commentId: 'c-1',
        commentCount: 0,
      }));

      expect(qc.getQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'])).toBeUndefined();
    });
  });

  describe('comment:liked', () => {
    it('updates likeCount on matching comment', () => {
      const qc = createQueryClient();
      const comment = { id: 'c-1', content: 'Hi', likeCount: 0, replyCount: 0, createdAt: new Date().toISOString() };
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
        pages: [{ data: [comment], meta: {} }],
        pageParams: [undefined],
      });
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('comment:liked', {
        postId: 'post-1',
        commentId: 'c-1',
        userId: 'user-2',
        emoji: '❤️',
        likeCount: 1,
      }));

      const data = qc.getQueryData<{ pages: { data: { id: string; likeCount: number }[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      expect(data?.pages[0].data[0].likeCount).toBe(1);
    });

    it('no-op when comment id does not match', () => {
      const qc = createQueryClient();
      const comment = { id: 'c-1', content: 'Hi', likeCount: 0, replyCount: 0, createdAt: new Date().toISOString() };
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
        pages: [{ data: [comment], meta: {} }],
        pageParams: [undefined],
      });
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('comment:liked', {
        postId: 'post-1',
        commentId: 'other-comment',
        userId: 'user-2',
        emoji: '❤️',
        likeCount: 99,
      }));

      const data = qc.getQueryData<{ pages: { data: { likeCount: number }[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      expect(data?.pages[0].data[0].likeCount).toBe(0);
    });

    it('no-op when commentsInfinite cache undefined', () => {
      const qc = createQueryClient();
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('comment:liked', {
        postId: 'post-1',
        commentId: 'c-1',
        userId: 'user-2',
        emoji: '❤️',
        likeCount: 1,
      }));

      expect(qc.getQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'])).toBeUndefined();
    });
  });

  describe('comment:translation-updated', () => {
    it('merges translation into matching comment', () => {
      const qc = createQueryClient();
      const comment = { id: 'c-1', content: 'Bonjour', likeCount: 0, replyCount: 0, createdAt: new Date().toISOString() };
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
        pages: [{ data: [comment], meta: {} }],
        pageParams: [undefined],
      });
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('comment:translation-updated', {
        postId: 'post-1',
        commentId: 'c-1',
        language: 'en',
        translation: { text: 'Hello', translationModel: 'nllb', createdAt: new Date().toISOString() },
      }));

      const data = qc.getQueryData<{ pages: { data: (typeof comment & { translations?: Record<string, unknown> })[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      expect(data?.pages[0].data[0].translations).toHaveProperty('en');
    });

    it('no-op when comment id does not match', () => {
      const qc = createQueryClient();
      const comment = { id: 'c-1', content: 'Bonjour', likeCount: 0, replyCount: 0, createdAt: new Date().toISOString() };
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
        pages: [{ data: [comment], meta: {} }],
        pageParams: [undefined],
      });
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('comment:translation-updated', {
        postId: 'post-1',
        commentId: 'other-comment',
        language: 'en',
        translation: { text: 'Hello', translationModel: 'nllb', createdAt: new Date().toISOString() },
      }));

      const data = qc.getQueryData<{ pages: { data: ({ translations?: unknown })[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      expect(data?.pages[0].data[0].translations).toBeUndefined();
    });

    it('no-op when commentsInfinite cache undefined', () => {
      const qc = createQueryClient();
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('comment:translation-updated', {
        postId: 'post-1',
        commentId: 'c-1',
        language: 'en',
        translation: { text: 'Hello', translationModel: 'nllb', createdAt: new Date().toISOString() },
      }));

      expect(qc.getQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'])).toBeUndefined();
    });
  });

  describe('story:viewed', () => {
    it('patches viewCount on the matching story in stories.feed()', () => {
      const qc = createQueryClient();
      seedStories(qc, [{ ...mockStory, viewCount: 5 }]);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('story:viewed', { storyId: 'story-1', viewerId: 'user-2', viewerUsername: 'bob', viewCount: 6 }));

      expect(getStories(qc)[0].viewCount).toBe(6);
    });
  });

  describe('story:reacted', () => {
    it('does not mutate stories.feed() (no authoritative count on the wire)', () => {
      const qc = createQueryClient();
      seedStories(qc, [mockStory]);
      const before = getStories(qc);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('story:reacted', { storyId: 'story-1', userId: 'user-2', emoji: '❤️' }));

      expect(getStories(qc)).toEqual(before);
    });
  });

  describe('status:updated', () => {
    it('invalidates statuses cache', () => {
      const qc = createQueryClient();
      const spy = jest.spyOn(qc, 'invalidateQueries');
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('status:updated', { status: mockPost }));

      expect(spy).toHaveBeenCalledWith({ queryKey: ['posts', 'list', 'statuses'] });
      spy.mockRestore();
    });
  });

  describe('status:reacted', () => {
    it('invalidates statuses cache', () => {
      const qc = createQueryClient();
      const spy = jest.spyOn(qc, 'invalidateQueries');
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('status:reacted', { statusId: 'st-1', userId: 'user-2', emoji: '❤️' }));

      expect(spy).toHaveBeenCalledWith({ queryKey: ['posts', 'list', 'statuses'] });
      spy.mockRestore();
    });
  });

  describe('comment:reaction-added', () => {
    it('updates comment likeCount and reactionSummary for matching comment', () => {
      const qc = createQueryClient();
      const comment = { id: 'c-1', content: 'Hi', likeCount: 0, replyCount: 0, createdAt: new Date().toISOString(), reactionSummary: {} as Record<string, number>, currentUserReactions: [] as string[] };
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
        pages: [{ data: [comment], meta: {} }],
        pageParams: [undefined],
      });
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-2' }), { wrapper: createWrapper(qc) });

      act(() => emit('comment:reaction-added', {
        postId: 'post-1',
        commentId: 'c-1',
        userId: 'user-2',
        emoji: '❤️',
        action: 'add',
        aggregation: { emoji: '❤️', count: 1 },
        timestamp: new Date().toISOString(),
      }));

      const data = qc.getQueryData<{ pages: { data: { likeCount: number; reactionSummary: Record<string, number>; currentUserReactions: string[] }[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      expect(data?.pages[0].data[0].likeCount).toBe(1);
      expect(data?.pages[0].data[0].reactionSummary['❤️']).toBe(1);
      expect(data?.pages[0].data[0].currentUserReactions).toContain('❤️');
    });

    it('does not add to currentUserReactions for another user', () => {
      const qc = createQueryClient();
      const comment = { id: 'c-1', content: 'Hi', likeCount: 0, replyCount: 0, createdAt: new Date().toISOString(), reactionSummary: {} as Record<string, number>, currentUserReactions: [] as string[] };
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
        pages: [{ data: [comment], meta: {} }],
        pageParams: [undefined],
      });
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-1' }), { wrapper: createWrapper(qc) });

      act(() => emit('comment:reaction-added', {
        postId: 'post-1',
        commentId: 'c-1',
        userId: 'user-99',
        emoji: '❤️',
        action: 'add',
        aggregation: { emoji: '❤️', count: 1 },
        timestamp: new Date().toISOString(),
      }));

      const data = qc.getQueryData<{ pages: { data: { currentUserReactions: string[] }[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      expect(data?.pages[0].data[0].currentUserReactions).toHaveLength(0);
    });

    it('no-op when commentsInfinite cache undefined', () => {
      const qc = createQueryClient();
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-1' }), { wrapper: createWrapper(qc) });

      act(() => emit('comment:reaction-added', {
        postId: 'post-1',
        commentId: 'c-1',
        userId: 'user-1',
        emoji: '❤️',
        action: 'add',
        aggregation: { emoji: '❤️', count: 1 },
        timestamp: new Date().toISOString(),
      }));

      expect(qc.getQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'])).toBeUndefined();
    });

    it('no-op when comment id does not match', () => {
      const qc = createQueryClient();
      const comment = { id: 'c-1', content: 'Hi', likeCount: 0, replyCount: 0, createdAt: new Date().toISOString(), reactionSummary: {} as Record<string, number>, currentUserReactions: [] as string[] };
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
        pages: [{ data: [comment], meta: {} }],
        pageParams: [undefined],
      });
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-1' }), { wrapper: createWrapper(qc) });

      act(() => emit('comment:reaction-added', {
        postId: 'post-1',
        commentId: 'other-comment',
        userId: 'user-1',
        emoji: '❤️',
        action: 'add',
        aggregation: { emoji: '❤️', count: 1 },
        timestamp: new Date().toISOString(),
      }));

      const data = qc.getQueryData<{ pages: { data: { likeCount: number }[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      expect(data?.pages[0].data[0].likeCount).toBe(0);
    });

    it('does NOT double-count likeCount on the reactor own self-echo', () => {
      // The gateway broadcasts comment:reaction-added for EVERY emoji (incl. ❤️),
      // so even a plain heart-like double-counted before the delta reconciliation:
      // optimistic likeCount 3→4 + summary ❤️:3→4, then self-echo authoritative 4.
      const qc = createQueryClient();
      const comment = { id: 'c-1', content: 'Hi', likeCount: 4, replyCount: 0, createdAt: new Date().toISOString(), reactionSummary: { '❤️': 4 } as Record<string, number>, currentUserReactions: ['❤️'] as string[] };
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
        pages: [{ data: [comment], meta: {} }],
        pageParams: [undefined],
      });
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-2' }), { wrapper: createWrapper(qc) });

      act(() => emit('comment:reaction-added', {
        postId: 'post-1',
        commentId: 'c-1',
        userId: 'user-2',
        emoji: '❤️',
        action: 'add',
        aggregation: { emoji: '❤️', count: 4 },
        timestamp: new Date().toISOString(),
      }));

      const data = qc.getQueryData<{ pages: { data: { likeCount: number; reactionSummary: Record<string, number> }[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      expect(data?.pages[0].data[0].likeCount).toBe(4);
      expect(data?.pages[0].data[0].reactionSummary['❤️']).toBe(4);
    });
  });

  describe('comment:reaction-removed', () => {
    it('removes emoji from reactionSummary when count drops to zero', () => {
      const qc = createQueryClient();
      const comment = { id: 'c-1', content: 'Hi', likeCount: 1, replyCount: 0, createdAt: new Date().toISOString(), reactionSummary: { '❤️': 1 } as Record<string, number>, currentUserReactions: ['❤️'] as string[] };
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
        pages: [{ data: [comment], meta: {} }],
        pageParams: [undefined],
      });
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-1' }), { wrapper: createWrapper(qc) });

      act(() => emit('comment:reaction-removed', {
        postId: 'post-1',
        commentId: 'c-1',
        userId: 'user-1',
        emoji: '❤️',
        action: 'remove',
        aggregation: { emoji: '❤️', count: 0 },
        timestamp: new Date().toISOString(),
      }));

      const data = qc.getQueryData<{ pages: { data: { likeCount: number; reactionSummary: Record<string, number>; currentUserReactions: string[] }[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      expect(data?.pages[0].data[0].likeCount).toBe(0);
      expect(data?.pages[0].data[0].reactionSummary['❤️']).toBeUndefined();
      expect(data?.pages[0].data[0].currentUserReactions).not.toContain('❤️');
    });

    it('keeps emoji in reactionSummary when count > 0', () => {
      const qc = createQueryClient();
      const comment = { id: 'c-1', content: 'Hi', likeCount: 2, replyCount: 0, createdAt: new Date().toISOString(), reactionSummary: { '❤️': 2 } as Record<string, number>, currentUserReactions: ['❤️'] as string[] };
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
        pages: [{ data: [comment], meta: {} }],
        pageParams: [undefined],
      });
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-1' }), { wrapper: createWrapper(qc) });

      act(() => emit('comment:reaction-removed', {
        postId: 'post-1',
        commentId: 'c-1',
        userId: 'user-1',
        emoji: '❤️',
        action: 'remove',
        aggregation: { emoji: '❤️', count: 1 },
        timestamp: new Date().toISOString(),
      }));

      const data = qc.getQueryData<{ pages: { data: { reactionSummary: Record<string, number> }[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      expect(data?.pages[0].data[0].reactionSummary['❤️']).toBe(1);
    });

    it('no-op when commentsInfinite cache undefined', () => {
      const qc = createQueryClient();
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-1' }), { wrapper: createWrapper(qc) });

      act(() => emit('comment:reaction-removed', {
        postId: 'post-1',
        commentId: 'c-1',
        userId: 'user-1',
        emoji: '❤️',
        action: 'remove',
        aggregation: { emoji: '❤️', count: 0 },
        timestamp: new Date().toISOString(),
      }));

      expect(qc.getQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'])).toBeUndefined();
    });
  });

  // M1 — newly-wired consumers that were emitted by the gateway but ignored on
  // web. Story/status lifecycle + comment media all invalidate/patch the cache.
  describe('story/status lifecycle + comment media (M1)', () => {
    it('story:updated replaces the matching story in stories.feed()', () => {
      const qc = createQueryClient();
      seedStories(qc, [{ ...mockStory, id: 's-1', content: 'old' }]);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('story:updated', { story: { ...mockStory, id: 's-1', content: 'new' } }));

      expect(getStories(qc)[0].content).toBe('new');
    });

    it('story:deleted removes the story from stories.feed()', () => {
      const qc = createQueryClient();
      seedStories(qc, [{ ...mockStory, id: 's-1' }, { ...mockStory, id: 's-2' }]);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('story:deleted', { storyId: 's-1', authorId: 'user-1' }));

      expect(getStories(qc).map((s) => s.id)).toEqual(['s-2']);
    });

    it('story:unreacted does not mutate stories.feed()', () => {
      const qc = createQueryClient();
      seedStories(qc, [{ ...mockStory, id: 's-1' }]);
      const before = getStories(qc);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('story:unreacted', { storyId: 's-1', userId: 'user-2', emoji: '❤️' }));

      expect(getStories(qc)).toEqual(before);
    });

    it('status:unreacted invalidates the statuses query', () => {
      const qc = createQueryClient();
      const spy = jest.spyOn(qc, 'invalidateQueries');
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('status:unreacted', { statusId: 'st-1', userId: 'user-2', emoji: '❤️' }));

      expect(spy).toHaveBeenCalledWith({ queryKey: ['posts', 'list', 'statuses'] });
    });

    it('comment:media-updated merges the refreshed comment into the cache', () => {
      const qc = createQueryClient();
      const comment = { id: 'c-1', content: 'Hi', likeCount: 0, replyCount: 0, createdAt: new Date().toISOString() };
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
        pages: [{ data: [comment], meta: {} }],
        pageParams: [undefined],
      });
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      const refreshed = { ...comment, content: 'Hi', media: { transcription: 'hello world' } };
      act(() => emit('comment:media-updated', { postId: 'post-1', commentId: 'c-1', comment: refreshed }));

      const data = qc.getQueryData<{ pages: { data: { media?: { transcription: string } }[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      expect(data?.pages[0].data[0].media?.transcription).toBe('hello world');
    });
  });

  describe('threaded replies (comment:added / comment:deleted / comment:reaction-added on replies)', () => {
    function seedComments(qc: QueryClient, comments: unknown[]) {
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
        pages: [{ data: comments, meta: {} }],
        pageParams: [undefined],
      });
    }
    function seedReplies(qc: QueryClient, parentId: string, replies: unknown[]) {
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'replies', parentId], {
        pages: [{ data: replies, meta: {} }],
        pageParams: [undefined],
      });
    }
    function topLevel(qc: QueryClient): { id: string; replyCount: number }[] {
      const d = qc.getQueryData<{ pages: { data: { id: string; replyCount: number }[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      return d?.pages.flatMap((p) => p.data) ?? [];
    }
    function repliesOf(qc: QueryClient, parentId: string): { id: string }[] {
      const d = qc.getQueryData<{ pages: { data: { id: string }[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'replies', parentId]);
      return d?.pages.flatMap((p) => p.data) ?? [];
    }

    const parent = { id: 'c-1', parentId: null, content: 'parent', likeCount: 0, replyCount: 0, createdAt: '2026-01-01T00:00:00Z', reactionSummary: {} as Record<string, number>, currentUserReactions: [] as string[] };

    it('routes a reply (parentId set) into the replies sub-cache, not the top-level list', () => {
      const qc = createQueryClient();
      seedFeed(qc);
      seedComments(qc, [parent]);
      seedReplies(qc, 'c-1', []);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      const reply = { id: 'r-1', parentId: 'c-1', content: 'a reply', likeCount: 0, replyCount: 0, createdAt: '2026-01-02T00:00:00Z' };
      act(() => emit('comment:added', { postId: 'post-1', comment: reply, commentCount: 3 }));

      expect(repliesOf(qc, 'c-1').map((c) => c.id)).toEqual(['r-1']);
      expect(topLevel(qc).map((c) => c.id)).toEqual(['c-1']);
    });

    it('bumps the parent replyCount when a reply arrives', () => {
      const qc = createQueryClient();
      seedFeed(qc);
      seedComments(qc, [parent]);
      seedReplies(qc, 'c-1', []);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      const reply = { id: 'r-1', parentId: 'c-1', content: 'a reply', likeCount: 0, replyCount: 0, createdAt: '2026-01-02T00:00:00Z' };
      act(() => emit('comment:added', { postId: 'post-1', comment: reply, commentCount: 3 }));

      expect(topLevel(qc).find((c) => c.id === 'c-1')?.replyCount).toBe(1);
    });

    it('still prepends a top-level comment (no parentId) to the top-level list', () => {
      const qc = createQueryClient();
      seedFeed(qc);
      seedComments(qc, [parent]);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      const c2 = { id: 'c-2', parentId: null, content: 'second', likeCount: 0, replyCount: 0, createdAt: '2026-01-03T00:00:00Z' };
      act(() => emit('comment:added', { postId: 'post-1', comment: c2, commentCount: 3 }));

      expect(topLevel(qc).map((c) => c.id)).toEqual(['c-2', 'c-1']);
    });

    it('removes a deleted reply from the replies sub-cache', () => {
      const qc = createQueryClient();
      seedFeed(qc);
      seedComments(qc, [parent]);
      seedReplies(qc, 'c-1', [{ id: 'r-1', parentId: 'c-1', content: 'a reply', likeCount: 0, replyCount: 0, createdAt: '2026-01-02T00:00:00Z' }]);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('comment:deleted', { postId: 'post-1', commentId: 'r-1', commentCount: 2 }));

      expect(repliesOf(qc, 'c-1').map((c) => c.id)).toEqual([]);
    });

    it('patches a reaction on a reply living in the replies sub-cache', () => {
      const qc = createQueryClient();
      seedReplies(qc, 'c-1', [{ id: 'r-1', parentId: 'c-1', content: 'a reply', likeCount: 0, replyCount: 0, reactionSummary: {} as Record<string, number>, currentUserReactions: [] as string[], createdAt: '2026-01-02T00:00:00Z' }]);
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-1' }), { wrapper: createWrapper(qc) });

      act(() => emit('comment:reaction-added', {
        commentId: 'r-1',
        postId: 'post-1',
        userId: 'user-1',
        emoji: '❤️',
        action: 'add',
        aggregation: { emoji: '❤️', count: 1 },
        timestamp: new Date().toISOString(),
      }));

      const reply = repliesOf(qc, 'c-1')[0] as unknown as { reactionSummary: Record<string, number> };
      expect(reply.reactionSummary).toEqual({ '❤️': 1 });
    });
  });

  describe('post:reaction-added - already reacted dedup', () => {
    it('does not duplicate emoji in currentUserReactions if already present', () => {
      const qc = createQueryClient();
      seedFeed(qc, [{ ...mockPost, reactionSummary: { '❤️': 1 } as Record<string, number>, currentUserReactions: ['❤️'] as string[] }]);
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-1' }), { wrapper: createWrapper(qc) });

      act(() => emit('post:reaction-added', {
        postId: 'post-1',
        userId: 'user-1',
        emoji: '❤️',
        action: 'add',
        aggregation: { emoji: '❤️', count: 1 },
        timestamp: new Date().toISOString(),
      }));

      const posts = getFeedPosts(qc) as (typeof mockPost & { currentUserReactions: string[] })[];
      // Should not have duplicated '❤️'
      expect(posts[0].currentUserReactions.filter((e) => e === '❤️')).toHaveLength(1);
    });
  });

  describe('post:reaction-removed - count stays above zero', () => {
    it('keeps emoji in reactionSummary when count > 0', () => {
      const seed = { ...mockPost, reactionSummary: { '❤️': 2 } as Record<string, number>, currentUserReactions: ['❤️'] as string[] };
      const qc = createQueryClient();
      seedFeed(qc, [seed]);
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-1' }), { wrapper: createWrapper(qc) });

      act(() => emit('post:reaction-removed', {
        postId: 'post-1',
        userId: 'user-1',
        emoji: '❤️',
        action: 'remove',
        aggregation: { emoji: '❤️', count: 1 },
        timestamp: new Date().toISOString(),
      }));

      const posts = getFeedPosts(qc) as (typeof mockPost & { reactionSummary: Record<string, number> })[];
      expect(posts[0].reactionSummary['❤️']).toBe(1);
    });
  });

  describe('patchPostInAllCaches - detail cache coverage', () => {
    it('patches post in detail cache when it contains data property', () => {
      const qc = createQueryClient();
      // Do NOT seed feed, only seed detail cache
      qc.setQueryData(['posts', 'detail', 'post-1'], { data: mockPost });
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:liked', {
        postId: 'post-1',
        userId: 'user-2',
        emoji: '❤️',
        likeCount: 99,
        reactionSummary: { '❤️': 99 },
      }));

      const detail = qc.getQueryData<{ data: typeof mockPost }>(['posts', 'detail', 'post-1']);
      expect(detail?.data.likeCount).toBe(99);
    });

    it('no-op when detail cache is undefined', () => {
      const qc = createQueryClient();
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:liked', {
        postId: 'post-1',
        userId: 'user-2',
        emoji: '❤️',
        likeCount: 99,
        reactionSummary: { '❤️': 99 },
      }));

      expect(qc.getQueryData(['posts', 'detail', 'post-1'])).toBeUndefined();
    });

    it('no-op when detail cache does not have data property', () => {
      const qc = createQueryClient();
      qc.setQueryData(['posts', 'detail', 'post-1'], { other: 'field' });
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:liked', {
        postId: 'post-1',
        userId: 'user-2',
        emoji: '❤️',
        likeCount: 99,
        reactionSummary: { '❤️': 99 },
      }));

      const detail = qc.getQueryData<{ other: string }>(['posts', 'detail', 'post-1']);
      expect(detail?.other).toBe('field');
    });
  });

  describe('multi-page feed - only first page gets new posts', () => {
    it('post:created prepends to page 0 only when feed has multiple pages', () => {
      const qc = createQueryClient();
      const page2Post = { ...mockPost, id: 'page2-post' };
      qc.setQueryData(['posts', 'list', 'infinite', 'feed'], {
        pages: [
          { data: [mockPost], meta: { pagination: { total: 2, offset: 0, limit: 1, hasMore: true }, nextCursor: 'cursor1' } },
          { data: [page2Post], meta: { pagination: { total: 2, offset: 1, limit: 1, hasMore: false }, nextCursor: null } },
        ],
        pageParams: [undefined, 'cursor1'],
      });
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      const newPost = { ...mockPost, id: 'brand-new' };
      act(() => emit('post:created', { post: newPost }));

      const data = qc.getQueryData<{ pages: { data: { id: string }[] }[] }>(['posts', 'list', 'infinite', 'feed']);
      expect(data?.pages[0].data[0].id).toBe('brand-new'); // prepended to page 0
      expect(data?.pages[1].data[0].id).toBe('page2-post'); // page 1 unchanged
    });

    it('post:reposted prepends to page 0 only when feed has multiple pages', () => {
      const qc = createQueryClient();
      const page2Post = { ...mockPost, id: 'page2-post' };
      qc.setQueryData(['posts', 'list', 'infinite', 'feed'], {
        pages: [
          { data: [mockPost], meta: {} },
          { data: [page2Post], meta: {} },
        ],
        pageParams: [undefined, 'cursor1'],
      });
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      const repost = { ...mockPost, id: 'repost-new' };
      act(() => emit('post:reposted', { repost }));

      const data = qc.getQueryData<{ pages: { data: { id: string }[] }[] }>(['posts', 'list', 'infinite', 'feed']);
      expect(data?.pages[0].data[0].id).toBe('repost-new');
      expect(data?.pages[1].data[0].id).toBe('page2-post');
    });
  });

  describe('post:created with undefined feed', () => {
    it('no-op when feed is undefined', () => {
      const qc = createQueryClient();
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:created', { post: mockPost }));

      expect(qc.getQueryData(['posts', 'list', 'infinite', 'feed'])).toBeUndefined();
    });
  });

  describe('post:deleted with undefined feed', () => {
    it('no-op when feed is undefined', () => {
      const qc = createQueryClient();
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:deleted', { postId: 'post-1', authorId: 'user-1' }));

      expect(qc.getQueryData(['posts', 'list', 'infinite', 'feed'])).toBeUndefined();
    });
  });

  describe('no socket - early return', () => {
    it('does not throw when socket is null', () => {
      // Override getSocket to return null for this test
      const { meeshySocketIOService } = jest.requireMock('@/services/meeshy-socketio.service');
      const originalGetSocket = meeshySocketIOService.getSocket;
      meeshySocketIOService.getSocket = () => null;

      const qc = createQueryClient();
      expect(() => {
        renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });
      }).not.toThrow();

      meeshySocketIOService.getSocket = originalGetSocket;
    });
  });

  describe('post:updated - post id does not match any in feed', () => {
    it('leaves feed unchanged when updated post is not in feed', () => {
      const qc = createQueryClient();
      seedFeed(qc); // feed has mockPost with id='post-1'
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:updated', { post: { ...mockPost, id: 'post-9999', content: 'Changed' } }));

      const posts = getFeedPosts(qc) as typeof mockPost[];
      expect(posts).toHaveLength(1);
      expect(posts[0].id).toBe('post-1'); // unchanged
      expect(posts[0].content).toBe('Hello');
    });
  });

  describe('comment:added - multi-page comment cache (second page unchanged)', () => {
    it('only prepends to the first page, leaves page 2+ intact', () => {
      const qc = createQueryClient();
      seedFeed(qc);
      const oldComment = { id: 'c-old', content: 'Old', likeCount: 0, replyCount: 0, createdAt: new Date().toISOString() };
      const page2Comment = { id: 'c-page2', content: 'Page2', likeCount: 0, replyCount: 0, createdAt: new Date().toISOString() };
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
        pages: [
          { data: [oldComment], meta: {} },
          { data: [page2Comment], meta: {} },
        ],
        pageParams: [undefined, 'cursor2'],
      });
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      const newComment = { id: 'c-new', content: 'New!', likeCount: 0, replyCount: 0, createdAt: new Date().toISOString() };
      act(() => emit('comment:added', { postId: 'post-1', comment: newComment, commentCount: 3 }));

      const data = qc.getQueryData<{ pages: { data: { id: string }[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      expect(data?.pages[0].data[0].id).toBe('c-new'); // prepended to page 0
      expect(data?.pages[1].data[0].id).toBe('c-page2'); // page 1 untouched
    });
  });

  describe('comment:reaction-added - already reacted dedup', () => {
    it('does not duplicate emoji when already in currentUserReactions', () => {
      const qc = createQueryClient();
      const comment = {
        id: 'c-1', content: 'Hi', likeCount: 1, replyCount: 0,
        createdAt: new Date().toISOString(),
        reactionSummary: { '❤️': 1 } as Record<string, number>,
        currentUserReactions: ['❤️'] as string[],
      };
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
        pages: [{ data: [comment], meta: {} }],
        pageParams: [undefined],
      });
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-1' }), { wrapper: createWrapper(qc) });

      act(() => emit('comment:reaction-added', {
        postId: 'post-1',
        commentId: 'c-1',
        userId: 'user-1',
        emoji: '❤️',
        action: 'add',
        aggregation: { emoji: '❤️', count: 1 },
        timestamp: new Date().toISOString(),
      }));

      const data = qc.getQueryData<{ pages: { data: { currentUserReactions: string[] }[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      expect(data?.pages[0].data[0].currentUserReactions.filter((e) => e === '❤️')).toHaveLength(1);
    });
  });

  describe('comment:reaction-removed - other user branch', () => {
    it('does not touch currentUserReactions when userId !== currentUserId', () => {
      const qc = createQueryClient();
      const comment = {
        id: 'c-1', content: 'Hi', likeCount: 2, replyCount: 0,
        createdAt: new Date().toISOString(),
        reactionSummary: { '❤️': 2 } as Record<string, number>,
        currentUserReactions: ['❤️'] as string[],
      };
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
        pages: [{ data: [comment], meta: {} }],
        pageParams: [undefined],
      });
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-1' }), { wrapper: createWrapper(qc) });

      act(() => emit('comment:reaction-removed', {
        postId: 'post-1',
        commentId: 'c-1',
        userId: 'user-99', // other user
        emoji: '❤️',
        action: 'remove',
        aggregation: { emoji: '❤️', count: 1 },
        timestamp: new Date().toISOString(),
      }));

      const data = qc.getQueryData<{ pages: { data: { currentUserReactions: string[] }[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      expect(data?.pages[0].data[0].currentUserReactions).toContain('❤️'); // unchanged
    });
  });

  describe('patchPostInAllCaches - non-matching post id in feed', () => {
    it('leaves unmatched posts unchanged in feed (covers p : p branch in patchPostInAllCaches)', () => {
      const qc = createQueryClient();
      const post2 = { ...mockPost, id: 'post-2', likeCount: 0 };
      seedFeed(qc, [mockPost, post2]);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:liked', {
        postId: 'post-1', // only post-1 matched
        userId: 'user-2',
        emoji: '❤️',
        likeCount: 99,
        reactionSummary: { '❤️': 99 },
      }));

      const posts = getFeedPosts(qc) as typeof mockPost[];
      expect(posts[0].likeCount).toBe(99);   // post-1 updated
      expect(posts[1].likeCount).toBe(0);    // post-2 unchanged (covers the false branch)
    });
  });

  describe('post:reaction-added - undefined currentUserReactions (?? [] right branch)', () => {
    it('appends emoji when post has no currentUserReactions and userId===currentUserId', () => {
      const qc = createQueryClient();
      const postNoReactions = { ...mockPost, currentUserReactions: undefined as unknown as string[] };
      seedFeed(qc, [postNoReactions]);
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-1' }), { wrapper: createWrapper(qc) });

      act(() => emit('post:reaction-added', {
        postId: 'post-1',
        userId: 'user-1',
        emoji: '👍',
        action: 'add',
        aggregation: { emoji: '👍', count: 1 },
        timestamp: new Date().toISOString(),
      }));

      const posts = getFeedPosts(qc) as (typeof mockPost & { currentUserReactions?: string[] })[];
      expect(posts[0].currentUserReactions).toContain('👍');
    });
  });

  describe('post:reaction-removed - undefined currentUserReactions (?? [] right branch)', () => {
    it('filters emoji when post has no currentUserReactions and userId===currentUserId', () => {
      const qc = createQueryClient();
      const postNoReactions = { ...mockPost, currentUserReactions: undefined as unknown as string[], reactionSummary: { '❤️': 1 } as Record<string, number> };
      seedFeed(qc, [postNoReactions]);
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-1' }), { wrapper: createWrapper(qc) });

      act(() => emit('post:reaction-removed', {
        postId: 'post-1',
        userId: 'user-1',
        emoji: '❤️',
        action: 'remove',
        aggregation: { emoji: '❤️', count: 0 },
        timestamp: new Date().toISOString(),
      }));

      const posts = getFeedPosts(qc) as (typeof mockPost & { currentUserReactions?: string[] })[];
      expect(posts[0].currentUserReactions ?? []).not.toContain('❤️');
    });
  });

  describe('comment:reaction-added - undefined currentUserReactions (?? [] right branch)', () => {
    it('appends emoji when comment has no currentUserReactions and userId===currentUserId', () => {
      const qc = createQueryClient();
      const comment = {
        id: 'c-1', content: 'Hi', likeCount: 0, replyCount: 0,
        createdAt: new Date().toISOString(),
        reactionSummary: {} as Record<string, number>,
        currentUserReactions: undefined as unknown as string[],
      };
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
        pages: [{ data: [comment], meta: {} }],
        pageParams: [undefined],
      });
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-1' }), { wrapper: createWrapper(qc) });

      act(() => emit('comment:reaction-added', {
        postId: 'post-1',
        commentId: 'c-1',
        userId: 'user-1',
        emoji: '👍',
        action: 'add',
        aggregation: { emoji: '👍', count: 1 },
        timestamp: new Date().toISOString(),
      }));

      const data = qc.getQueryData<{ pages: { data: { currentUserReactions?: string[] }[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      expect(data?.pages[0].data[0].currentUserReactions).toContain('👍');
    });
  });

  describe('comment:reaction-removed - non-matching comment id (line 309 true branch)', () => {
    it('skips non-matching comments and filters currentUserReactions on matching one', () => {
      const qc = createQueryClient();
      const matchComment = {
        id: 'c-match', content: 'Match', likeCount: 2, replyCount: 0,
        createdAt: new Date().toISOString(),
        reactionSummary: { '❤️': 2 } as Record<string, number>,
        currentUserReactions: undefined as unknown as string[], // ?? [] right branch
      };
      const otherComment = {
        id: 'c-other', content: 'Other', likeCount: 0, replyCount: 0,
        createdAt: new Date().toISOString(),
        reactionSummary: {} as Record<string, number>,
        currentUserReactions: [] as string[],
      };
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
        pages: [{ data: [matchComment, otherComment], meta: {} }],
        pageParams: [undefined],
      });
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-1' }), { wrapper: createWrapper(qc) });

      act(() => emit('comment:reaction-removed', {
        postId: 'post-1',
        commentId: 'c-match',
        userId: 'user-1',
        emoji: '❤️',
        action: 'remove',
        aggregation: { emoji: '❤️', count: 1 },
        timestamp: new Date().toISOString(),
      }));

      const data = qc.getQueryData<{ pages: { data: { id: string; likeCount: number; currentUserReactions?: string[] }[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      expect(data?.pages[0].data[0].likeCount).toBe(1);           // c-match updated
      expect(data?.pages[0].data[1].likeCount).toBe(0);           // c-other unchanged (line 309 true branch)
      expect(data?.pages[0].data[0].currentUserReactions ?? []).not.toContain('❤️'); // line 322 ?? [] right branch
    });
  });
});
