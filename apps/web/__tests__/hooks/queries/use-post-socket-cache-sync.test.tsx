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
    COMMENT_UPDATED: 'comment:updated',
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

type CachedStory = {
  id: string;
  viewCount?: number;
  content?: string;
  likeCount?: number;
  reactionSummary?: Record<string, number>;
};

function getStories(qc: QueryClient): CachedStory[] {
  return qc.getQueryData<CachedStory[]>(['stories', 'feed']) ?? [];
}

// Reels affinity thread caches (`/feed/reels`, `/reel/:id`) key off
// `['posts','list','reels', seed]` — the `foryou` thread and per-seed threads.
function seedReels(qc: QueryClient, posts: unknown[] = [mockPost], seed = 'foryou') {
  qc.setQueryData(['posts', 'list', 'reels', seed], {
    pages: [{ data: posts, pagination: { hasMore: false, nextCursor: null } }],
    pageParams: [undefined],
  });
}

function getReels(qc: QueryClient, seed = 'foryou'): Array<{ id: string; content?: string; isEdited?: boolean }> {
  const data = qc.getQueryData<{ pages: { data: Array<{ id: string; content?: string; isEdited?: boolean }> }[] }>(
    ['posts', 'list', 'reels', seed],
  );
  return data?.pages.flatMap((p) => p.data) ?? [];
}

describe('usePostSocketCacheSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(listeners).forEach((k) => delete listeners[k]);
  });

  it('registers 29 socket listeners on mount (14 post/comment + 11 story/status + 4 reaction)', () => {
    const qc = createQueryClient();
    renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });
    expect(mockSocket.on).toHaveBeenCalledTimes(29);
  });

  it('unregisters all 29 listeners on unmount', () => {
    const qc = createQueryClient();
    const { unmount } = renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });
    unmount();
    expect(mockSocket.off).toHaveBeenCalledTimes(29);
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

    it('propagates the edit to every reels affinity thread (foryou + deep-linked seed)', () => {
      const qc = createQueryClient();
      seedReels(qc, [mockPost], 'foryou');
      seedReels(qc, [mockPost], 'post-1');
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      const updated = { ...mockPost, content: 'Reel caption edited', isEdited: true };
      act(() => emit('post:updated', { post: updated }));

      expect(getReels(qc, 'foryou')[0]).toMatchObject({ content: 'Reel caption edited', isEdited: true });
      expect(getReels(qc, 'post-1')[0]).toMatchObject({ content: 'Reel caption edited', isEdited: true });
    });
  });

  describe('post:deleted — reels affinity thread & detail cache', () => {
    it('drops the deleted post from every reels cache, leaving siblings intact', () => {
      const qc = createQueryClient();
      seedReels(qc, [mockPost, { ...mockPost, id: 'post-2' }], 'foryou');
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:deleted', { postId: 'post-1', authorId: 'user-1' }));

      const reels = getReels(qc, 'foryou');
      expect(reels).toHaveLength(1);
      expect(reels[0].id).toBe('post-2');
    });

    it('evicts the post detail cache so a stale reel/detail view cannot resurface', () => {
      const qc = createQueryClient();
      qc.setQueryData(['posts', 'detail', 'post-1'], { data: mockPost });
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:deleted', { postId: 'post-1', authorId: 'user-1' }));

      expect(qc.getQueryData(['posts', 'detail', 'post-1'])).toBeUndefined();
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

    /**
     * Supprimer un commentaire soft-delete tout son sous-arbre côté serveur.
     * Retirer la seule cible laissait ses réponses dépliées à l'écran — et
     * aucun refetch ne les enlevait : `getComments` filtre `parentId: null`,
     * leur parent supprimé n'est plus rendu, donc `getReplies` n'est plus
     * jamais appelé pour elles.
     */
    it('retire tout le sous-arbre annoncé des caches de réponses', () => {
      const qc = createQueryClient();
      seedFeed(qc);
      const mkComment = (id: string) => ({ id, content: id, likeCount: 0, replyCount: 0, createdAt: new Date().toISOString() });
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
        pages: [{ data: [mkComment('c-1'), mkComment('c-keep')], meta: {} }],
        pageParams: [undefined],
      });
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'replies', 'c-1'], {
        pages: [{ data: [mkComment('r-1'), mkComment('r-1a')], meta: {} }],
        pageParams: [undefined],
      });
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('comment:deleted', {
        postId: 'post-1',
        commentId: 'c-1',
        deletedCommentIds: ['c-1', 'r-1', 'r-1a'],
        commentCount: 0,
      }));

      const top = qc.getQueryData<{ pages: { data: { id: string }[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      const replies = qc.getQueryData<{ pages: { data: { id: string }[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'replies', 'c-1']);
      expect(top?.pages[0].data.map((c) => c.id)).toEqual(['c-keep']);
      expect(replies?.pages[0].data).toHaveLength(0);
    });

    /**
     * Repli sur la seule cible quand le serveur n'annonce aucune liste (rejeu
     * idempotent d'une suppression) : exactement le comportement d'avant.
     */
    it('retire la seule cible quand aucune liste n\'est annoncée', () => {
      const qc = createQueryClient();
      seedFeed(qc);
      const mkComment = (id: string) => ({ id, content: id, likeCount: 0, replyCount: 0, createdAt: new Date().toISOString() });
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
        pages: [{ data: [mkComment('c-1'), mkComment('c-keep')], meta: {} }],
        pageParams: [undefined],
      });
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('comment:deleted', { postId: 'post-1', commentId: 'c-1', commentCount: 0 }));

      const top = qc.getQueryData<{ pages: { data: { id: string }[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      expect(top?.pages[0].data.map((c) => c.id)).toEqual(['c-keep']);
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
    // L'événement porte désormais l'état ABSOLU (`likeCount` + `reactionSummary`),
    // comme `post:liked`. Le tray écrit la valeur reçue : même résultat que
    // l'événement arrive une fois ou deux, et convergence après un manqué.
    it('écrit le total et la ventilation absolus dans stories.feed()', () => {
      const qc = createQueryClient();
      seedStories(qc, [mockStory]);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('story:reacted', {
        storyId: 'story-1', userId: 'user-2', emoji: '😂',
        likeCount: 4, reactionSummary: { '❤️': 3, '😂': 1 },
      }));

      expect(getStories(qc)[0].likeCount).toBe(4);
      expect(getStories(qc)[0].reactionSummary).toEqual({ '❤️': 3, '😂': 1 });
    });

    it('est idempotent — une seconde livraison du même événement ne double rien', () => {
      const qc = createQueryClient();
      seedStories(qc, [mockStory]);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      const event = {
        storyId: 'story-1', userId: 'user-2', emoji: '😂',
        likeCount: 4, reactionSummary: { '😂': 4 },
      };
      act(() => emit('story:reacted', event));
      act(() => emit('story:reacted', event));

      expect(getStories(qc)[0].likeCount).toBe(4);
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

    it('story:unreacted écrit le total absolu APRÈS retrait', () => {
      const qc = createQueryClient();
      seedStories(qc, [{ ...mockStory, id: 's-1', likeCount: 5 }]);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('story:unreacted', {
        storyId: 's-1', userId: 'user-2', emoji: '😂',
        likeCount: 4, reactionSummary: { '❤️': 4 },
      }));

      expect(getStories(qc)[0].likeCount).toBe(4);
      expect(getStories(qc)[0].reactionSummary).toEqual({ '❤️': 4 });
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

  // `comment:updated` — l'édition d'un commentaire. Le gateway la diffuse
  // (`SocialEventsHandler.broadcastCommentUpdated`, filtrée par visibilité) et
  // iOS l'applique ; le web n'avait aucun auditeur, alors qu'il en a un pour
  // TOUTES les mutations voisines (added / deleted / liked / media-updated /
  // translation-updated). Une édition faite depuis un iPhone n'atteignait donc
  // jamais un onglet web ouvert sur le même post.
  describe('comment:updated', () => {
    const baseComment = {
      id: 'c-1',
      content: 'Avant',
      isEdited: false,
      likeCount: 3,
      replyCount: 0,
      parentId: null as string | null,
      createdAt: '2026-08-14T00:00:00Z',
      translations: { en: { content: 'Before' } },
      originalLanguage: 'fr',
      reactionSummary: { '❤️': 3 },
      currentUserReactions: ['❤️'],
    };

    function seedTopLevel(qc: QueryClient, comments: unknown[]) {
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
        pages: [{ data: comments, meta: {} }],
        pageParams: [undefined],
      });
    }
    function topLevel(qc: QueryClient) {
      const d = qc.getQueryData<{ pages: { data: Record<string, unknown>[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      return d?.pages.flatMap((p) => p.data) ?? [];
    }

    it('remplace le texte du commentaire édité dans la liste de premier niveau', () => {
      const qc = createQueryClient();
      seedTopLevel(qc, [{ ...baseComment }, { ...baseComment, id: 'c-2', content: 'Intacte' }]);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('comment:updated', {
        postId: 'post-1',
        comment: { ...baseComment, content: 'Après', isEdited: true, translations: {}, originalLanguage: null },
      }));

      expect(topLevel(qc)[0].content).toBe('Après');
      expect(topLevel(qc)[0].isEdited).toBe(true);
      expect(topLevel(qc)[1].content).toBe('Intacte');
    });

    it("périme les traductions de l'ANCIEN texte, jamais servies sur le nouveau", () => {
      // Le serveur purge `translations` ET `originalLanguage` dans la MÊME
      // écriture que le contenu (`PostCommentService.updateComment`) : le
      // payload les porte vidés. Un patch qui ne recopierait que `content`
      // laisserait « Before » collé au texte « Après » jusqu'au prochain
      // `comment:translation-updated` — c'est-à-dire un affichage traduit qui
      // ment, exactement ce que la règle #1 du Prisme interdit.
      const qc = createQueryClient();
      seedTopLevel(qc, [{ ...baseComment }]);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('comment:updated', {
        postId: 'post-1',
        comment: { ...baseComment, content: 'Après', isEdited: true, translations: {}, originalLanguage: null },
      }));

      expect(topLevel(qc)[0].translations).toEqual({});
      expect(topLevel(qc)[0].originalLanguage).toBeNull();
    });

    it('patche aussi une RÉPONSE, qui vit dans le sous-cache de son parent', () => {
      const qc = createQueryClient();
      qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'replies', 'c-parent'], {
        pages: [{ data: [{ ...baseComment, id: 'r-1', parentId: 'c-parent' }], meta: {} }],
        pageParams: [undefined],
      });
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('comment:updated', {
        postId: 'post-1',
        comment: { ...baseComment, id: 'r-1', parentId: 'c-parent', content: 'Réponse éditée', isEdited: true },
      }));

      const d = qc.getQueryData<{ pages: { data: { content: string }[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'replies', 'c-parent']);
      expect(d?.pages[0].data[0].content).toBe('Réponse éditée');
    });

    it("préserve l'état de réaction PROPRE au lecteur, absent du payload diffusé", () => {
      // La diffusion est UNE charge pour toute la room : elle ne peut pas
      // porter `currentUserReactions`, qui dépend du lecteur. Les clés absentes
      // doivent rester celles du cache — sans quoi l'édition d'autrui
      // effacerait la réaction du lecteur.
      const qc = createQueryClient();
      seedTopLevel(qc, [{ ...baseComment }]);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('comment:updated', {
        postId: 'post-1',
        comment: {
          id: 'c-1', content: 'Après', isEdited: true, likeCount: 3, replyCount: 0,
          parentId: null, createdAt: '2026-08-14T00:00:00Z', translations: {}, originalLanguage: null,
        },
      }));

      expect(topLevel(qc)[0].currentUserReactions).toEqual(['❤️']);
      expect(topLevel(qc)[0].reactionSummary).toEqual({ '❤️': 3 });
    });

    it("ne ressuscite pas un commentaire absent du cache", () => {
      const qc = createQueryClient();
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('comment:updated', {
        postId: 'post-1',
        comment: { ...baseComment, content: 'Après' },
      }));

      expect(qc.getQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'])).toBeUndefined();
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

  // ---------------------------------------------------------------------------
  // Nested repostOf cache patches (Task 8): a liked/commented ORIGINAL can be
  // embedded as `repostOf` on any number of OTHER cache entries (every
  // displayed simple repost of it) — the socket sync must patch those too,
  // not only the top-level entry whose id === postId.
  // ---------------------------------------------------------------------------

  type RepostOfEntry = typeof mockPost & { isQuote?: boolean; repostOf?: { id: string; likeCount?: number; commentCount?: number } | null };

  function seedRepostOfFeed(qc: QueryClient, original: unknown, repost: RepostOfEntry) {
    qc.setQueryData(['posts', 'list', 'infinite', 'feed'], {
      pages: [{
        data: [original, repost],
        meta: { pagination: { total: 2, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
      }],
      pageParams: [undefined],
    });
  }

  function getFeedEntry(qc: QueryClient, id: string): RepostOfEntry | undefined {
    return (getFeedPosts(qc) as RepostOfEntry[]).find((p) => p.id === id);
  }

  describe('post:liked - nested repostOf', () => {
    it('bumps repostOf.likeCount on every feed entry embedding the liked original', () => {
      const qc = createQueryClient();
      const original = { ...mockPost, id: 'original-1', likeCount: 5 };
      const repost: RepostOfEntry = {
        ...mockPost, id: 'repost-1', likeCount: 0, isQuote: false,
        repostOf: { id: 'original-1', likeCount: 5, commentCount: 2 },
      };
      seedRepostOfFeed(qc, original, repost);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:liked', {
        postId: 'original-1', userId: 'user-2', emoji: '❤️', likeCount: 6, reactionSummary: { '❤️': 6 },
      }));

      expect(getFeedEntry(qc, 'original-1')?.likeCount).toBe(6);
      expect(getFeedEntry(qc, 'repost-1')?.repostOf?.likeCount).toBe(6);
    });

    it('bumps repostOf.likeCount on every reels entry embedding the liked original', () => {
      const qc = createQueryClient();
      const repost: RepostOfEntry = {
        ...mockPost, id: 'repost-1', likeCount: 0, isQuote: false,
        repostOf: { id: 'original-1', likeCount: 5, commentCount: 2 },
      };
      seedReels(qc, [repost]);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:liked', {
        postId: 'original-1', userId: 'user-2', emoji: '❤️', likeCount: 6, reactionSummary: { '❤️': 6 },
      }));

      const reel = getReels(qc)[0] as unknown as RepostOfEntry;
      expect(reel.repostOf?.likeCount).toBe(6);
    });

    it('bumps repostOf.likeCount on a post detail cache showing the repost', () => {
      const qc = createQueryClient();
      const repost: RepostOfEntry = {
        ...mockPost, id: 'repost-1', likeCount: 0, isQuote: false,
        repostOf: { id: 'original-1', likeCount: 5, commentCount: 2 },
      };
      qc.setQueryData(['posts', 'detail', 'repost-1'], { data: repost });
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:liked', {
        postId: 'original-1', userId: 'user-2', emoji: '❤️', likeCount: 6, reactionSummary: { '❤️': 6 },
      }));

      const detail = qc.getQueryData<{ data: RepostOfEntry }>(['posts', 'detail', 'repost-1']);
      expect(detail?.data.repostOf?.likeCount).toBe(6);
    });

    it('does not corrupt an unrelated comments cache sharing the details() key prefix', () => {
      const qc = createQueryClient();
      const repost: RepostOfEntry = {
        ...mockPost, id: 'repost-1', likeCount: 0, isQuote: false,
        repostOf: { id: 'original-1', likeCount: 5, commentCount: 2 },
      };
      qc.setQueryData(['posts', 'detail', 'repost-1'], { data: repost });
      const comment = { id: 'c-1', content: 'Hi', likeCount: 0, replyCount: 0, createdAt: new Date().toISOString() };
      qc.setQueryData(['posts', 'detail', 'repost-1', 'comments', 'infinite'], {
        pages: [{ data: [comment], meta: {} }],
        pageParams: [undefined],
      });
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:liked', {
        postId: 'original-1', userId: 'user-2', emoji: '❤️', likeCount: 6, reactionSummary: { '❤️': 6 },
      }));

      const comments = qc.getQueryData<{ pages: { data: unknown[] }[] }>(['posts', 'detail', 'repost-1', 'comments', 'infinite']);
      expect(comments?.pages[0].data).toEqual([comment]);
    });

    it('leaves an unrelated repost (of a different original) untouched', () => {
      const qc = createQueryClient();
      const original = { ...mockPost, id: 'original-1', likeCount: 5 };
      const unrelated: RepostOfEntry = {
        ...mockPost, id: 'repost-2', likeCount: 0, isQuote: false,
        repostOf: { id: 'other-original', likeCount: 9, commentCount: 1 },
      };
      seedRepostOfFeed(qc, original, unrelated);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:liked', {
        postId: 'original-1', userId: 'user-2', emoji: '❤️', likeCount: 6, reactionSummary: { '❤️': 6 },
      }));

      expect(getFeedEntry(qc, 'repost-2')?.repostOf?.likeCount).toBe(9);
    });
  });

  describe('post:unliked - nested repostOf', () => {
    it('sets repostOf.likeCount to the authoritative new count on every embedding entry', () => {
      const qc = createQueryClient();
      const original = { ...mockPost, id: 'original-1', likeCount: 5 };
      const repost: RepostOfEntry = {
        ...mockPost, id: 'repost-1', likeCount: 0, isQuote: false,
        repostOf: { id: 'original-1', likeCount: 5, commentCount: 2 },
      };
      seedRepostOfFeed(qc, original, repost);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('post:unliked', {
        postId: 'original-1', userId: 'user-2', emoji: '❤️', likeCount: 4, reactionSummary: { '❤️': 4 },
      }));

      expect(getFeedEntry(qc, 'repost-1')?.repostOf?.likeCount).toBe(4);
    });
  });

  describe('comment:added - nested repostOf.commentCount', () => {
    it('sets repostOf.commentCount on every entry embedding the commented original', () => {
      const qc = createQueryClient();
      const original = { ...mockPost, id: 'original-1', commentCount: 2 };
      const repost: RepostOfEntry = {
        ...mockPost, id: 'repost-1', commentCount: 0, isQuote: false,
        repostOf: { id: 'original-1', likeCount: 5, commentCount: 2 },
      };
      seedRepostOfFeed(qc, original, repost);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('comment:added', {
        postId: 'original-1',
        comment: { id: 'c-new', content: 'Nice', likeCount: 0, replyCount: 0, createdAt: new Date().toISOString() },
        commentCount: 3,
      }));

      expect(getFeedEntry(qc, 'original-1')?.commentCount).toBe(3);
      expect(getFeedEntry(qc, 'repost-1')?.repostOf?.commentCount).toBe(3);
    });
  });

  describe('comment:deleted - nested repostOf.commentCount', () => {
    it('sets repostOf.commentCount on every entry embedding the original', () => {
      const qc = createQueryClient();
      const original = { ...mockPost, id: 'original-1', commentCount: 2 };
      const repost: RepostOfEntry = {
        ...mockPost, id: 'repost-1', commentCount: 0, isQuote: false,
        repostOf: { id: 'original-1', likeCount: 5, commentCount: 2 },
      };
      seedRepostOfFeed(qc, original, repost);
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('comment:deleted', { postId: 'original-1', commentId: 'c-1', commentCount: 1 }));

      expect(getFeedEntry(qc, 'repost-1')?.repostOf?.commentCount).toBe(1);
    });
  });

  describe('post:reaction-added - nested repostOf.likeCount', () => {
    it('bumps repostOf.likeCount by the authoritative delta for a remote reactor', () => {
      const qc = createQueryClient();
      const original = { ...mockPost, id: 'original-1', likeCount: 5, reactionSummary: { '😂': 2 } as Record<string, number> };
      const repost: RepostOfEntry = {
        ...mockPost, id: 'repost-1', likeCount: 0, isQuote: false,
        repostOf: { id: 'original-1', likeCount: 5, commentCount: 2 },
      };
      seedRepostOfFeed(qc, original, repost);
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-1' }), { wrapper: createWrapper(qc) });

      act(() => emit('post:reaction-added', {
        postId: 'original-1', userId: 'user-99', emoji: '😂', action: 'add',
        aggregation: { emoji: '😂', count: 3 }, timestamp: new Date().toISOString(),
      }));

      expect(getFeedEntry(qc, 'original-1')?.likeCount).toBe(6);
      expect(getFeedEntry(qc, 'repost-1')?.repostOf?.likeCount).toBe(6);
    });

    it('does not touch repostOf when the reactor own self-echo has a zero delta', () => {
      const qc = createQueryClient();
      const original = { ...mockPost, id: 'original-1', likeCount: 6, reactionSummary: { '😂': 3 } as Record<string, number>, currentUserReactions: ['😂'] as string[] };
      const repost: RepostOfEntry = {
        ...mockPost, id: 'repost-1', likeCount: 0, isQuote: false,
        repostOf: { id: 'original-1', likeCount: 6, commentCount: 2 },
      };
      seedRepostOfFeed(qc, original, repost);
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-2' }), { wrapper: createWrapper(qc) });

      act(() => emit('post:reaction-added', {
        postId: 'original-1', userId: 'user-2', emoji: '😂', action: 'add',
        aggregation: { emoji: '😂', count: 3 }, timestamp: new Date().toISOString(),
      }));

      expect(getFeedEntry(qc, 'repost-1')?.repostOf?.likeCount).toBe(6);
    });

    it('does not double-apply the self-echo delta to feed-nested repostOf when the detail cache is stale (ordering independence)', () => {
      const qc = createQueryClient();
      // Feed: original + repost, ALREADY optimistically bumped by the acting
      // user's own useLikePostMutation (both directions: original's own
      // reactionSummary AND repost.repostOf.likeCount) — this mirrors what
      // useLikePostMutation.onMutate does before the socket echo arrives.
      const original = {
        ...mockPost, id: 'original-1', likeCount: 6,
        reactionSummary: { '😂': 3 } as Record<string, number>, currentUserReactions: ['😂'] as string[],
      };
      const repost: RepostOfEntry = {
        ...mockPost, id: 'repost-1', likeCount: 0, isQuote: false,
        repostOf: { id: 'original-1', likeCount: 6, commentCount: 2 },
      };
      seedRepostOfFeed(qc, original, repost);
      // Detail cache for the SAME original: STALE — the optimistic mutation
      // never touches detail, so it still reflects the pre-reaction state.
      const staleOriginalDetail = {
        ...mockPost, id: 'original-1', likeCount: 5,
        reactionSummary: { '😂': 2 } as Record<string, number>, currentUserReactions: [] as string[],
      };
      qc.setQueryData(['posts', 'detail', 'original-1'], { data: staleOriginalDetail });

      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-2' }), { wrapper: createWrapper(qc) });

      act(() => emit('post:reaction-added', {
        postId: 'original-1', userId: 'user-2', emoji: '😂', action: 'add',
        aggregation: { emoji: '😂', count: 3 }, timestamp: new Date().toISOString(),
      }));

      // Feed's nested repostOf was already correct (6) from the optimistic
      // patch — must NOT receive a second +1 from the detail cache's stale
      // (unrelated) delta.
      expect(getFeedEntry(qc, 'repost-1')?.repostOf?.likeCount).toBe(6);
      // The stale detail cache's OWN top-level fields still get reconciled —
      // unaffected by the nested-sweep fix.
      const detail = qc.getQueryData<{ data: typeof staleOriginalDetail }>(['posts', 'detail', 'original-1']);
      expect(detail?.data.likeCount).toBe(6);
    });

    it('reconciles a repost-of-the-original cached under its OWN detail page using the detail-local delta, independently of feed', () => {
      const qc = createQueryClient();
      // Feed: no entries at all for this scenario — only a detail cache for
      // a DIFFERENT post (the repost), embedding the original as repostOf,
      // stale relative to the incoming echo.
      const staleRepostDetail: RepostOfEntry = {
        ...mockPost, id: 'repost-1', likeCount: 0, isQuote: false,
        repostOf: { id: 'original-1', likeCount: 5, commentCount: 2 },
      };
      qc.setQueryData(['posts', 'detail', 'repost-1'], { data: staleRepostDetail });
      // Detail cache for the ORIGINAL itself carries the pre-reaction state,
      // giving the detail-local delta something to compute from.
      const originalDetail = {
        ...mockPost, id: 'original-1', likeCount: 5,
        reactionSummary: { '😂': 2 } as Record<string, number>, currentUserReactions: [] as string[],
      };
      qc.setQueryData(['posts', 'detail', 'original-1'], { data: originalDetail });

      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-1' }), { wrapper: createWrapper(qc) });

      act(() => emit('post:reaction-added', {
        postId: 'original-1', userId: 'user-99', emoji: '😂', action: 'add',
        aggregation: { emoji: '😂', count: 3 }, timestamp: new Date().toISOString(),
      }));

      const repostDetail = qc.getQueryData<{ data: RepostOfEntry }>(['posts', 'detail', 'repost-1']);
      expect(repostDetail?.data.repostOf?.likeCount).toBe(6);
    });
  });

  describe('post:reaction-removed - nested repostOf.likeCount', () => {
    it('decrements repostOf.likeCount by the authoritative delta', () => {
      const qc = createQueryClient();
      const original = { ...mockPost, id: 'original-1', likeCount: 5, reactionSummary: { '❤️': 1 } as Record<string, number>, currentUserReactions: ['❤️'] as string[] };
      const repost: RepostOfEntry = {
        ...mockPost, id: 'repost-1', likeCount: 0, isQuote: false,
        repostOf: { id: 'original-1', likeCount: 5, commentCount: 2 },
      };
      seedRepostOfFeed(qc, original, repost);
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-1' }), { wrapper: createWrapper(qc) });

      act(() => emit('post:reaction-removed', {
        postId: 'original-1', userId: 'user-1', emoji: '❤️', action: 'remove',
        aggregation: { emoji: '❤️', count: 0 }, timestamp: new Date().toISOString(),
      }));

      expect(getFeedEntry(qc, 'repost-1')?.repostOf?.likeCount).toBe(4);
    });
  });
});
