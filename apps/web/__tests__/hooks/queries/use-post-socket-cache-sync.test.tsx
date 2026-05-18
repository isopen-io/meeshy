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
    STORY_CREATED: 'story:created',
    STORY_VIEWED: 'story:viewed',
    STORY_REACTED: 'story:reacted',
    STATUS_CREATED: 'status:created',
    STATUS_UPDATED: 'status:updated',
    STATUS_DELETED: 'status:deleted',
    STATUS_REACTED: 'status:reacted',
    POST_REACTION_ADDED: 'post:reaction-added',
    POST_REACTION_REMOVED: 'post:reaction-removed',
    POST_REACTION_SYNC: 'post:reaction-sync',
    COMMENT_REACTION_ADDED: 'comment:reaction-added',
    COMMENT_REACTION_REMOVED: 'comment:reaction-removed',
    COMMENT_REACTION_SYNC: 'comment:reaction-sync',
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
      bookmarks: () => ['posts', 'list', 'bookmarks'],
      stories: () => ['posts', 'list', 'stories'],
      statuses: () => ['posts', 'list', 'statuses'],
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

describe('usePostSocketCacheSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(listeners).forEach((k) => delete listeners[k]);
  });

  it('registers 25 socket listeners on mount (12 post/comment + 7 story/status + 6 reaction)', () => {
    const qc = createQueryClient();
    renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });
    expect(mockSocket.on).toHaveBeenCalledTimes(25);
  });

  it('unregisters all 25 listeners on unmount', () => {
    const qc = createQueryClient();
    const { unmount } = renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });
    unmount();
    expect(mockSocket.off).toHaveBeenCalledTimes(25);
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
    it('invalidates stories cache', () => {
      const qc = createQueryClient();
      const spy = jest.spyOn(qc, 'invalidateQueries');
      renderHook(() => usePostSocketCacheSync(), { wrapper: createWrapper(qc) });

      act(() => emit('story:created', { story: mockPost }));

      expect(spy).toHaveBeenCalledWith({ queryKey: ['posts', 'list', 'stories'] });
      spy.mockRestore();
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

  describe('post:reaction-sync', () => {
    it('replaces reactionSummary and currentUserReactions entirely', () => {
      const qc = createQueryClient();
      seedFeed(qc);
      renderHook(() => usePostSocketCacheSync({ currentUserId: 'user-1' }), { wrapper: createWrapper(qc) });

      act(() => emit('post:reaction-sync', {
        postId: 'post-1',
        reactions: [{ emoji: '👍', count: 3 }, { emoji: '❤️', count: 7 }],
        totalCount: 10,
        userReactions: ['👍'],
      }));

      const posts = getFeedPosts(qc) as (typeof mockPost & { reactionSummary: Record<string, number>; currentUserReactions: string[] })[];
      expect(posts[0].reactionSummary).toEqual({ '👍': 3, '❤️': 7 });
      expect(posts[0].currentUserReactions).toEqual(['👍']);
      expect(posts[0].likeCount).toBe(10);
    });
  });
});
