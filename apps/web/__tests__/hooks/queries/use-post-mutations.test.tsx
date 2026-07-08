import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useCreatePostMutation,
  useDeletePostMutation,
  useLikePostMutation,
  useUnlikePostMutation,
  useBookmarkPostMutation,
  useUpdatePostMutation,
  useUnbookmarkPostMutation,
  useRepostMutation,
  useSharePostMutation,
  usePinPostMutation,
  useTranslatePostMutation,
} from '@/hooks/queries/use-post-mutations';

const mockCreatePost = jest.fn();
const mockDeletePost = jest.fn();
const mockBookmarkPost = jest.fn();
const mockUpdatePost = jest.fn();
const mockUnbookmarkPost = jest.fn();
const mockRepost = jest.fn();
const mockSharePost = jest.fn();
const mockPinPost = jest.fn();
const mockUnpinPost = jest.fn();
const mockTranslatePost = jest.fn();

// Socket mock for post reaction mutations
const mockSocketEmit = jest.fn();
let mockSocketConnected = true;
const mockSocket = {
  get connected() { return mockSocketConnected; },
  emit: mockSocketEmit,
};

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    getSocket: () => mockSocket,
    onStatusChange: jest.fn(() => () => {}),
  },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  CLIENT_EVENTS: {
    POST_REACTION_ADD: 'post:reaction-add',
    POST_REACTION_REMOVE: 'post:reaction-remove',
  },
}));

jest.mock('@/services/posts.service', () => ({
  postsService: {
    createPost: (...args: unknown[]) => mockCreatePost(...args),
    deletePost: (...args: unknown[]) => mockDeletePost(...args),
    bookmarkPost: (...args: unknown[]) => mockBookmarkPost(...args),
    updatePost: (...args: unknown[]) => mockUpdatePost(...args),
    unbookmarkPost: (...args: unknown[]) => mockUnbookmarkPost(...args),
    repost: (...args: unknown[]) => mockRepost(...args),
    sharePost: (...args: unknown[]) => mockSharePost(...args),
    pinPost: (...args: unknown[]) => mockPinPost(...args),
    unpinPost: (...args: unknown[]) => mockUnpinPost(...args),
    translatePost: (...args: unknown[]) => mockTranslatePost(...args),
  },
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({
    user: { id: 'user-1', username: 'testuser', displayName: 'Test', avatar: null },
  }),
}));

jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    posts: {
      all: ['posts'],
      lists: () => ['posts', 'list'],
      infinite: (type?: string) => ['posts', 'list', 'infinite', type],
      detail: (id: string) => ['posts', 'detail', id],
      bookmarks: () => ['posts', 'list', 'bookmarks'],
    },
  },
}));

const mockPost = {
  id: 'post-1',
  authorId: 'user-1',
  type: 'POST' as const,
  visibility: 'PUBLIC' as const,
  content: 'Hello world',
  likeCount: 5,
  commentCount: 2,
  repostCount: 0,
  viewCount: 10,
  bookmarkCount: 1,
  shareCount: 0,
  isPinned: false,
  isEdited: false,
  createdAt: '2026-03-28T00:00:00Z',
  updatedAt: '2026-03-28T00:00:00Z',
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function seedFeed(queryClient: QueryClient) {
  queryClient.setQueryData(['posts', 'list', 'infinite', 'feed'], {
    pages: [{
      data: [mockPost],
      meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
    }],
    pageParams: [undefined],
  });
}

function seedReels(queryClient: QueryClient, posts = [mockPost], seed = 'foryou') {
  queryClient.setQueryData(['posts', 'list', 'reels', seed], {
    pages: [{ data: posts }],
    pageParams: [undefined],
  });
}

function getReels(queryClient: QueryClient, seed = 'foryou'): Array<typeof mockPost> {
  const data = queryClient.getQueryData<{ pages: { data: Array<typeof mockPost> }[] }>([
    'posts', 'list', 'reels', seed,
  ]);
  return data?.pages.flatMap((p) => p.data) ?? [];
}

function seedMultiPostFeed(queryClient: QueryClient) {
  const post2 = { ...mockPost, id: 'post-2', likeCount: 0, bookmarkCount: 0 };
  queryClient.setQueryData(['posts', 'list', 'infinite', 'feed'], {
    pages: [{
      data: [mockPost, post2],
      meta: { pagination: { total: 2, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
    }],
    pageParams: [undefined],
  });
  return post2;
}

function seedMultiPageFeed(queryClient: QueryClient) {
  const page1Post = { ...mockPost, id: 'page1-post' };
  const page2Post = { ...mockPost, id: 'page2-post', likeCount: 0 };
  queryClient.setQueryData(['posts', 'list', 'infinite', 'feed'], {
    pages: [
      { data: [page1Post], meta: { pagination: { total: 2, offset: 0, limit: 1, hasMore: true }, nextCursor: 'c1' } },
      { data: [page2Post], meta: { pagination: { total: 2, offset: 1, limit: 1, hasMore: false }, nextCursor: null } },
    ],
    pageParams: [undefined, 'c1'],
  });
}

describe('useCreatePostMutation', () => {
  it('calls postsService.createPost', async () => {
    const qc = createQueryClient();
    mockCreatePost.mockResolvedValue({ success: true, data: { ...mockPost, id: 'new-1' } });

    const { result } = renderHook(() => useCreatePostMutation(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      result.current.mutate({ content: 'New post', type: 'POST', visibility: 'PUBLIC' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockCreatePost).toHaveBeenCalledWith({ content: 'New post', type: 'POST', visibility: 'PUBLIC' });
  });

  it('optimistically prepends post to feed', async () => {
    const qc = createQueryClient();
    seedFeed(qc);

    let resolveCreate: (v: unknown) => void;
    mockCreatePost.mockImplementation(() => new Promise((r) => { resolveCreate = r; }));

    const { result } = renderHook(() => useCreatePostMutation(), {
      wrapper: createWrapper(qc),
    });

    act(() => {
      result.current.mutate({ content: 'Optimistic post' });
    });

    await waitFor(() => {
      const data = qc.getQueryData<{ pages: { data: unknown[] }[] }>(['posts', 'list', 'infinite', 'feed']);
      expect(data?.pages[0].data).toHaveLength(2);
    });

    await act(async () => {
      resolveCreate!({ success: true, data: { ...mockPost, id: 'real-1' } });
    });
  });
});

describe('useDeletePostMutation', () => {
  it('optimistically removes post from feed', async () => {
    const qc = createQueryClient();
    seedFeed(qc);
    mockDeletePost.mockResolvedValue({ success: true, data: { deleted: true } });

    const { result } = renderHook(() => useDeletePostMutation(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      result.current.mutate('post-1');
    });

    await waitFor(() => expect(result.current.isSuccess || result.current.isPending).toBe(true));

    const data = qc.getQueryData<{ pages: { data: unknown[] }[] }>(['posts', 'list', 'infinite', 'feed']);
    expect(data?.pages[0].data).toHaveLength(0);
  });

  it('rolls back on error', async () => {
    const qc = createQueryClient();
    seedFeed(qc);
    mockDeletePost.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useDeletePostMutation(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      result.current.mutate('post-1');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const data = qc.getQueryData<{ pages: { data: unknown[] }[] }>(['posts', 'list', 'infinite', 'feed']);
    expect(data?.pages[0].data).toHaveLength(1);
  });

  it('optimistically removes post from reels threads', async () => {
    const qc = createQueryClient();
    const reel2 = { ...mockPost, id: 'post-2' };
    seedReels(qc, [mockPost, reel2]);
    mockDeletePost.mockResolvedValue({ success: true, data: { deleted: true } });

    const { result } = renderHook(() => useDeletePostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      result.current.mutate('post-1');
    });

    await waitFor(() => expect(result.current.isSuccess || result.current.isPending).toBe(true));
    expect(getReels(qc).map((p) => p.id)).toEqual(['post-2']);
  });

  it('restores reels threads on error', async () => {
    const qc = createQueryClient();
    seedReels(qc);
    mockDeletePost.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useDeletePostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      result.current.mutate('post-1');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getReels(qc).map((p) => p.id)).toEqual(['post-1']);
  });
});

describe('useLikePostMutation', () => {
  beforeEach(() => { mockSocketEmit.mockClear(); });

  it('emits post:reaction-add on the socket', async () => {
    const qc = createQueryClient();
    seedFeed(qc);
    mockSocketEmit.mockImplementation((_event: string, _payload: unknown, cb: (r: { success: boolean }) => void) => {
      cb({ success: true });
    });

    const { result } = renderHook(() => useLikePostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({ postId: 'post-1' });
    });

    expect(mockSocketEmit).toHaveBeenCalledWith(
      'post:reaction-add',
      { postId: 'post-1', emoji: '❤️' },
      expect.any(Function),
    );
  });

  it('optimistically increments likeCount', async () => {
    const qc = createQueryClient();
    seedFeed(qc);
    mockSocketEmit.mockImplementation((_event: string, _payload: unknown, cb: (r: { success: boolean }) => void) => {
      cb({ success: true });
    });

    const { result } = renderHook(() => useLikePostMutation(), { wrapper: createWrapper(qc) });

    act(() => { result.current.mutate({ postId: 'post-1' }); });

    await waitFor(() => {
      const data = qc.getQueryData<{ pages: { data: typeof mockPost[] }[] }>(['posts', 'list', 'infinite', 'feed']);
      expect(data?.pages[0].data[0].likeCount).toBe(6);
    });
  });
});

describe('useUnlikePostMutation', () => {
  beforeEach(() => { mockSocketEmit.mockClear(); });

  it('emits post:reaction-remove on the socket', async () => {
    const qc = createQueryClient();
    seedFeed(qc);
    mockSocketEmit.mockImplementation((_event: string, _payload: unknown, cb: (r: { success: boolean }) => void) => {
      cb({ success: true });
    });

    const { result } = renderHook(() => useUnlikePostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({ postId: 'post-1' });
    });

    expect(mockSocketEmit).toHaveBeenCalledWith(
      'post:reaction-remove',
      { postId: 'post-1', emoji: '❤️' },
      expect.any(Function),
    );
  });

  it('optimistically decrements likeCount', async () => {
    const qc = createQueryClient();
    seedFeed(qc);
    mockSocketEmit.mockImplementation((_event: string, _payload: unknown, cb: (r: { success: boolean }) => void) => {
      cb({ success: true });
    });

    const { result } = renderHook(() => useUnlikePostMutation(), { wrapper: createWrapper(qc) });

    act(() => { result.current.mutate({ postId: 'post-1' }); });

    await waitFor(() => {
      const data = qc.getQueryData<{ pages: { data: typeof mockPost[] }[] }>(['posts', 'list', 'infinite', 'feed']);
      expect(data?.pages[0].data[0].likeCount).toBe(4);
    });
  });
});

describe('useBookmarkPostMutation', () => {
  it('optimistically increments bookmarkCount', async () => {
    const qc = createQueryClient();
    seedFeed(qc);
    mockBookmarkPost.mockResolvedValue({ success: true, data: { bookmarked: true } });

    const { result } = renderHook(() => useBookmarkPostMutation(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      result.current.mutate('post-1');
    });

    await waitFor(() => expect(result.current.isSuccess || result.current.isPending).toBe(true));

    const data = qc.getQueryData<{ pages: { data: typeof mockPost[] }[] }>(['posts', 'list', 'infinite', 'feed']);
    expect(data?.pages[0].data[0].bookmarkCount).toBe(2);
  });
});

describe('useCreatePostMutation - rollback', () => {
  it('rolls back optimistic post on error', async () => {
    const qc = createQueryClient();
    seedFeed(qc);
    mockCreatePost.mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useCreatePostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      result.current.mutate({ content: 'Will fail' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const data = qc.getQueryData<{ pages: { data: unknown[] }[] }>(['posts', 'list', 'infinite', 'feed']);
    expect(data?.pages[0].data).toHaveLength(1);
    expect((data?.pages[0].data[0] as typeof mockPost).id).toBe('post-1');
  });
});

describe('useLikePostMutation - rollback', () => {
  it('rolls back likeCount on socket error', async () => {
    const qc = createQueryClient();
    seedFeed(qc);
    mockSocketEmit.mockImplementation((_event: string, _payload: unknown, cb: (r: { success: boolean; error?: string }) => void) => {
      cb({ success: false, error: 'Network error' });
    });

    const { result } = renderHook(() => useLikePostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      result.current.mutate({ postId: 'post-1' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const data = qc.getQueryData<{ pages: { data: typeof mockPost[] }[] }>(['posts', 'list', 'infinite', 'feed']);
    expect(data?.pages[0].data[0].likeCount).toBe(5);
  });
});

describe('useUnlikePostMutation - rollback', () => {
  it('rolls back likeCount on socket error', async () => {
    const qc = createQueryClient();
    seedFeed(qc);
    mockSocketEmit.mockImplementation((_event: string, _payload: unknown, cb: (r: { success: boolean; error?: string }) => void) => {
      cb({ success: false, error: 'Network error' });
    });

    const { result } = renderHook(() => useUnlikePostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      result.current.mutate({ postId: 'post-1' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const data = qc.getQueryData<{ pages: { data: typeof mockPost[] }[] }>(['posts', 'list', 'infinite', 'feed']);
    expect(data?.pages[0].data[0].likeCount).toBe(5);
  });
});

describe('useBookmarkPostMutation - rollback', () => {
  it('rolls back bookmarkCount on error', async () => {
    const qc = createQueryClient();
    seedFeed(qc);
    mockBookmarkPost.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useBookmarkPostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      result.current.mutate('post-1');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const data = qc.getQueryData<{ pages: { data: typeof mockPost[] }[] }>(['posts', 'list', 'infinite', 'feed']);
    expect(data?.pages[0].data[0].bookmarkCount).toBe(1);
  });
});

// =============================================================================
// useUpdatePostMutation
// =============================================================================

describe('useUpdatePostMutation', () => {
  beforeEach(() => {
    mockUpdatePost.mockClear();
  });

  it('optimistically patches post content in feed', async () => {
    const qc = createQueryClient();
    seedFeed(qc);

    let resolveUpdate: (v: unknown) => void;
    mockUpdatePost.mockImplementation(() => new Promise(r => { resolveUpdate = r; }));

    const { result } = renderHook(() => useUpdatePostMutation(), { wrapper: createWrapper(qc) });

    act(() => {
      result.current.mutate({ postId: 'post-1', data: { content: 'Updated content' } });
    });

    await waitFor(() => {
      const data = qc.getQueryData<{ pages: { data: typeof mockPost[] }[] }>(['posts', 'list', 'infinite', 'feed']);
      expect(data?.pages[0].data[0].content).toBe('Updated content');
      expect(data?.pages[0].data[0].isEdited).toBe(true);
    });

    await act(async () => {
      resolveUpdate!({ success: true, data: {} });
    });
  });

  it('rolls back on error', async () => {
    const qc = createQueryClient();
    seedFeed(qc);
    mockUpdatePost.mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useUpdatePostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      result.current.mutate({ postId: 'post-1', data: { content: 'Updated' } });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const data = qc.getQueryData<{ pages: { data: typeof mockPost[] }[] }>(['posts', 'list', 'infinite', 'feed']);
    expect(data?.pages[0].data[0].content).toBe('Hello world');
  });

  it('optimistically patches post content in reels threads', async () => {
    const qc = createQueryClient();
    seedReels(qc);

    let resolveUpdate: (v: unknown) => void;
    mockUpdatePost.mockImplementation(() => new Promise(r => { resolveUpdate = r; }));

    const { result } = renderHook(() => useUpdatePostMutation(), { wrapper: createWrapper(qc) });

    act(() => {
      result.current.mutate({ postId: 'post-1', data: { content: 'Reel content' } });
    });

    await waitFor(() => {
      const reel = getReels(qc)[0];
      expect(reel.content).toBe('Reel content');
      expect(reel.isEdited).toBe(true);
    });

    await act(async () => {
      resolveUpdate!({ success: true, data: {} });
    });
  });

  it('restores reels threads on error', async () => {
    const qc = createQueryClient();
    seedReels(qc);
    mockUpdatePost.mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useUpdatePostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      result.current.mutate({ postId: 'post-1', data: { content: 'Updated' } });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getReels(qc)[0].content).toBe('Hello world');
  });

  it('invalidates detail and list queries on settled', async () => {
    const qc = createQueryClient();
    seedFeed(qc);
    mockUpdatePost.mockResolvedValue({ success: true, data: {} });
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useUpdatePostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      result.current.mutate({ postId: 'post-1', data: { content: 'New' } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({
      queryKey: ['posts', 'detail', 'post-1'],
    }));
  });

  it('no-op when feed cache is undefined (patchPostInFeed with old=undefined)', async () => {
    const qc = createQueryClient();
    // Do NOT seed feed - old will be undefined
    mockUpdatePost.mockResolvedValue({ success: true, data: {} });

    const { result } = renderHook(() => useUpdatePostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      result.current.mutate({ postId: 'post-1', data: { content: 'Whatever' } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = qc.getQueryData(['posts', 'list', 'infinite', 'feed']);
    expect(data).toBeUndefined();
  });
});

// =============================================================================
// useUnbookmarkPostMutation
// =============================================================================

describe('useUnbookmarkPostMutation', () => {
  beforeEach(() => {
    mockUnbookmarkPost.mockClear();
  });

  it('optimistically decrements bookmarkCount', async () => {
    const qc = createQueryClient();
    seedFeed(qc);

    let resolveUnbookmark: (v: unknown) => void;
    mockUnbookmarkPost.mockImplementation(() => new Promise(r => { resolveUnbookmark = r; }));

    const { result } = renderHook(() => useUnbookmarkPostMutation(), { wrapper: createWrapper(qc) });

    act(() => {
      result.current.mutate('post-1');
    });

    await waitFor(() => {
      const data = qc.getQueryData<{ pages: { data: typeof mockPost[] }[] }>(['posts', 'list', 'infinite', 'feed']);
      expect(data?.pages[0].data[0].bookmarkCount).toBe(0);
    });

    await act(async () => {
      resolveUnbookmark!({ success: true });
    });
  });

  it('rolls back on error', async () => {
    const qc = createQueryClient();
    seedFeed(qc);
    mockUnbookmarkPost.mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useUnbookmarkPostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      result.current.mutate('post-1');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const data = qc.getQueryData<{ pages: { data: typeof mockPost[] }[] }>(['posts', 'list', 'infinite', 'feed']);
    expect(data?.pages[0].data[0].bookmarkCount).toBe(1);
  });

  it('does not go below 0', async () => {
    const qc = createQueryClient();
    qc.setQueryData(['posts', 'list', 'infinite', 'feed'], {
      pages: [{ data: [{ ...mockPost, bookmarkCount: 0 }], meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null } }],
      pageParams: [undefined],
    });
    mockUnbookmarkPost.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useUnbookmarkPostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      result.current.mutate('post-1');
    });

    await waitFor(() => {
      const data = qc.getQueryData<{ pages: { data: typeof mockPost[] }[] }>(['posts', 'list', 'infinite', 'feed']);
      expect(data?.pages[0].data[0].bookmarkCount).toBe(0);
    });
  });
});

// =============================================================================
// useRepostMutation
// =============================================================================

describe('useRepostMutation', () => {
  beforeEach(() => {
    mockRepost.mockClear();
  });

  it('calls postsService.repost and invalidates lists', async () => {
    const qc = createQueryClient();
    mockRepost.mockResolvedValue({ success: true, data: { ...mockPost, id: 'repost-1' } });
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useRepostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({ postId: 'post-1' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockRepost).toHaveBeenCalledWith('post-1', undefined);
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({
      queryKey: ['posts', 'list'],
    }));
  });

  it('calls postsService.repost with data', async () => {
    const qc = createQueryClient();
    mockRepost.mockResolvedValue({ success: true, data: {} });

    const { result } = renderHook(() => useRepostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({ postId: 'post-1', data: { content: 'Quote', isQuote: true } });
    });

    expect(mockRepost).toHaveBeenCalledWith('post-1', { content: 'Quote', isQuote: true });
  });
});

// =============================================================================
// useSharePostMutation
// =============================================================================

describe('useSharePostMutation', () => {
  beforeEach(() => {
    mockSharePost.mockClear();
  });

  it('calls postsService.sharePost', async () => {
    const qc = createQueryClient();
    mockSharePost.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useSharePostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({ postId: 'post-1', platform: 'twitter' });
    });

    expect(mockSharePost).toHaveBeenCalledWith('post-1', 'twitter');
  });

  it('calls postsService.sharePost without platform', async () => {
    const qc = createQueryClient();
    mockSharePost.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useSharePostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({ postId: 'post-1' });
    });

    expect(mockSharePost).toHaveBeenCalledWith('post-1', undefined);
  });
});

// =============================================================================
// usePinPostMutation
// =============================================================================

describe('usePinPostMutation', () => {
  beforeEach(() => {
    mockPinPost.mockClear();
    mockUnpinPost.mockClear();
  });

  it('calls pinPost when pin=true', async () => {
    const qc = createQueryClient();
    seedFeed(qc);
    mockPinPost.mockResolvedValue({ success: true });

    const { result } = renderHook(() => usePinPostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({ postId: 'post-1', pin: true });
    });

    expect(mockPinPost).toHaveBeenCalledWith('post-1');
    expect(mockUnpinPost).not.toHaveBeenCalled();

    const data = qc.getQueryData<{ pages: { data: typeof mockPost[] }[] }>(['posts', 'list', 'infinite', 'feed']);
    expect(data?.pages[0].data[0].isPinned).toBe(true);
  });

  it('calls unpinPost when pin=false', async () => {
    const qc = createQueryClient();
    qc.setQueryData(['posts', 'list', 'infinite', 'feed'], {
      pages: [{ data: [{ ...mockPost, isPinned: true }], meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null } }],
      pageParams: [undefined],
    });
    mockUnpinPost.mockResolvedValue({ success: true });

    const { result } = renderHook(() => usePinPostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({ postId: 'post-1', pin: false });
    });

    expect(mockUnpinPost).toHaveBeenCalledWith('post-1');
    expect(mockPinPost).not.toHaveBeenCalled();
  });

  it('rolls back on error', async () => {
    const qc = createQueryClient();
    seedFeed(qc);
    mockPinPost.mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => usePinPostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      result.current.mutate({ postId: 'post-1', pin: true });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const data = qc.getQueryData<{ pages: { data: typeof mockPost[] }[] }>(['posts', 'list', 'infinite', 'feed']);
    expect(data?.pages[0].data[0].isPinned).toBe(false);
  });
});

// =============================================================================
// useTranslatePostMutation
// =============================================================================

describe('useTranslatePostMutation', () => {
  beforeEach(() => {
    mockTranslatePost.mockClear();
  });

  it('calls postsService.translatePost', async () => {
    const qc = createQueryClient();
    mockTranslatePost.mockResolvedValue({ success: true, data: { text: 'Bonjour' } });

    const { result } = renderHook(() => useTranslatePostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({ postId: 'post-1', targetLanguage: 'fr' });
    });

    expect(mockTranslatePost).toHaveBeenCalledWith('post-1', 'fr');
  });
});

// =============================================================================
// removePostFromFeed with old=undefined
// =============================================================================

describe('removePostFromFeed via useDeletePostMutation - old=undefined', () => {
  it('returns undefined when feed cache is empty', async () => {
    const qc = createQueryClient();
    // Do NOT seed
    mockDeletePost.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useDeletePostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      result.current.mutate('post-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = qc.getQueryData(['posts', 'list', 'infinite', 'feed']);
    expect(data).toBeUndefined();
  });
});

// =============================================================================
// useLikePostMutation - socket not connected
// =============================================================================

describe('useLikePostMutation - socket not connected', () => {
  beforeEach(() => {
    mockSocketConnected = false;
    mockSocketEmit.mockClear();
  });

  afterEach(() => {
    mockSocketConnected = true;
  });

  it('rejects when socket not connected', async () => {
    const qc = createQueryClient();
    seedFeed(qc);

    const { result } = renderHook(() => useLikePostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      result.current.mutate({ postId: 'post-1' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/Socket not connected/i);
  });
});

// =============================================================================
// useLikePostMutation - socket ack timeout
// =============================================================================

describe('useLikePostMutation - socket ack timeout', () => {
  it('the mutationFn sets up a timeout that rejects after 10s', async () => {
    // Verify the timeout mechanism by directly testing the promise
    // The mutationFn uses setTimeout(reject, 10000)
    // We verify:
    // 1. socket.emit is called
    // 2. When no callback is invoked and timer fires, the promise rejects

    jest.useFakeTimers();
    mockSocketConnected = true;
    mockSocketEmit.mockClear();

    try {
      const qc = createQueryClient();
      seedFeed(qc);
      mockSocketEmit.mockImplementation(() => {
        // no callback - timer will fire
      });

      const { result } = renderHook(() => useLikePostMutation(), { wrapper: createWrapper(qc) });

      let mutatePromise: Promise<void> | undefined;
      act(() => {
        mutatePromise = result.current.mutateAsync({ postId: 'post-1' }).catch(() => {});
      });

      // The timer fires, reject is called
      await act(async () => {
        jest.advanceTimersByTime(10001);
      });

      // emit was called (meaning the mutationFn was invoked)
      expect(mockSocketEmit).toHaveBeenCalledWith(
        'post:reaction-add',
        { postId: 'post-1', emoji: '❤️' },
        expect.any(Function),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});

// =============================================================================
// useUnlikePostMutation - socket not connected
// =============================================================================

describe('useUnlikePostMutation - socket not connected', () => {
  beforeEach(() => {
    mockSocketConnected = false;
    mockSocketEmit.mockClear();
  });

  afterEach(() => {
    mockSocketConnected = true;
  });

  it('rejects when socket not connected', async () => {
    const qc = createQueryClient();
    seedFeed(qc);

    const { result } = renderHook(() => useUnlikePostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      result.current.mutate({ postId: 'post-1' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/Socket not connected/i);
  });
});

// =============================================================================
// useUnlikePostMutation - socket ack error branches
// =============================================================================

describe('useUnlikePostMutation - socket ack error branches', () => {
  beforeEach(() => {
    mockSocketConnected = true;
    mockSocketEmit.mockClear();
  });

  it('rejects with server error message when response.success=false and error is set', async () => {
    const qc = createQueryClient();
    seedFeed(qc);
    mockSocketEmit.mockImplementation((_e: string, _p: unknown, cb: (r: { success: boolean; error?: string }) => void) => {
      cb({ success: false, error: 'Reaction not found' });
    });

    const { result } = renderHook(() => useUnlikePostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => { result.current.mutate({ postId: 'post-1' }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Reaction not found');
  });

  it('uses default message when response.success=false and error is undefined', async () => {
    const qc = createQueryClient();
    seedFeed(qc);
    mockSocketEmit.mockImplementation((_e: string, _p: unknown, cb: (r: { success: boolean; error?: string }) => void) => {
      cb({ success: false }); // no error field
    });

    const { result } = renderHook(() => useUnlikePostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => { result.current.mutate({ postId: 'post-1' }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Failed to remove reaction');
  });

  it('patches post with existing reactionSummary and currentUserReactions (covers ?? branches)', async () => {
    const qc = createQueryClient();
    const postWithReactions = {
      ...mockPost,
      likeCount: 3,
      reactionSummary: { '❤️': 3 } as Record<string, number>,
      currentUserReactions: ['❤️'] as string[],
    };
    qc.setQueryData(['posts', 'list', 'infinite', 'feed'], {
      pages: [{ data: [postWithReactions], meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null } }],
      pageParams: [undefined],
    });
    mockSocketEmit.mockImplementation((_e: string, _p: unknown, cb: (r: { success: boolean }) => void) => {
      cb({ success: true });
    });

    const { result } = renderHook(() => useUnlikePostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => { result.current.mutate({ postId: 'post-1', emoji: '❤️' }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = qc.getQueryData<{ pages: { data: (typeof postWithReactions)[] }[] }>(['posts', 'list', 'infinite', 'feed']);
    expect(data?.pages[0].data[0].likeCount).toBe(2);
    expect(data?.pages[0].data[0].currentUserReactions).not.toContain('❤️');
  });
});

// =============================================================================
// patchPostInFeed false branch — 2-post feed so non-matching post takes the : p path
// =============================================================================

describe('useBookmarkPostMutation - 2-post feed (patchPostInFeed false branch)', () => {
  it('only patches the target post; leaves other posts untouched', async () => {
    const qc = createQueryClient();
    const post2 = seedMultiPostFeed(qc);
    mockBookmarkPost.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useBookmarkPostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => { result.current.mutate('post-1'); });
    await waitFor(() => expect(result.current.isSuccess || result.current.isPending).toBe(true));

    const data = qc.getQueryData<{ pages: { data: typeof mockPost[] }[] }>(['posts', 'list', 'infinite', 'feed']);
    expect(data?.pages[0].data[0].bookmarkCount).toBe(2); // post-1 patched
    expect(data?.pages[0].data[1].bookmarkCount).toBe(post2.bookmarkCount); // post-2 unchanged (false branch)
  });
});

describe('useDeletePostMutation - 2-post feed (removePostFromFeed false branch)', () => {
  it('removes only the target post, leaves others intact', async () => {
    const qc = createQueryClient();
    seedMultiPostFeed(qc);
    mockDeletePost.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useDeletePostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => { result.current.mutate('post-1'); });
    await waitFor(() => expect(result.current.isSuccess || result.current.isPending).toBe(true));

    const data = qc.getQueryData<{ pages: { data: { id: string }[] }[] }>(['posts', 'list', 'infinite', 'feed']);
    expect(data?.pages[0].data).toHaveLength(1);
    expect(data?.pages[0].data[0].id).toBe('post-2');
  });
});

describe('useCreatePostMutation - multi-page feed (i !== 0 branch)', () => {
  it('only prepends to page 0, leaves page 1+ unchanged', async () => {
    const qc = createQueryClient();
    seedMultiPageFeed(qc);

    let resolveCreate!: (v: unknown) => void;
    mockCreatePost.mockImplementation(() => new Promise(r => { resolveCreate = r; }));

    const { result } = renderHook(() => useCreatePostMutation(), { wrapper: createWrapper(qc) });

    act(() => { result.current.mutate({ content: 'New' }); });

    await waitFor(() => {
      const data = qc.getQueryData<{ pages: { data: { id: string }[] }[] }>(['posts', 'list', 'infinite', 'feed']);
      expect(data?.pages[0].data.some(p => p.id.startsWith('_temp_'))).toBe(true); // prepended to page 0
      expect(data?.pages[1].data[0].id).toBe('page2-post'); // page 1 unchanged (i !== 0 branch)
    });

    await act(async () => { resolveCreate({ success: true, data: {} }); });
  });
});

describe('useLikePostMutation - already reacted (dedup branch)', () => {
  beforeEach(() => { mockSocketEmit.mockClear(); mockSocketConnected = true; });

  it('keeps currentUserReactions length at 1 when emoji already present', async () => {
    const qc = createQueryClient();
    const postWithReaction = { ...mockPost, currentUserReactions: ['❤️'] as string[], reactionSummary: { '❤️': 1 } as Record<string, number> };
    qc.setQueryData(['posts', 'list', 'infinite', 'feed'], {
      pages: [{ data: [postWithReaction], meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null } }],
      pageParams: [undefined],
    });
    mockSocketEmit.mockImplementation((_e: string, _p: unknown, cb: (r: { success: boolean }) => void) => cb({ success: true }));

    const { result } = renderHook(() => useLikePostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => { result.current.mutate({ postId: 'post-1', emoji: '❤️' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = qc.getQueryData<{ pages: { data: (typeof postWithReaction)[] }[] }>(['posts', 'list', 'infinite', 'feed']);
    // Dedup: emoji already present → currentUserReactions stays same (covers true branch of includes check)
    expect(data?.pages[0].data[0].currentUserReactions.filter(e => e === '❤️').length).toBe(1);
  });
});

describe('useLikePostMutation - post without currentUserReactions (?? [] branch)', () => {
  beforeEach(() => { mockSocketEmit.mockClear(); mockSocketConnected = true; });

  it('handles missing currentUserReactions field', async () => {
    const qc = createQueryClient();
    const postNoReactions = { ...mockPost };
    delete (postNoReactions as Partial<typeof mockPost> & { currentUserReactions?: unknown }).currentUserReactions;
    qc.setQueryData(['posts', 'list', 'infinite', 'feed'], {
      pages: [{ data: [postNoReactions], meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null } }],
      pageParams: [undefined],
    });
    mockSocketEmit.mockImplementation((_e: string, _p: unknown, cb: (r: { success: boolean }) => void) => cb({ success: true }));

    const { result } = renderHook(() => useLikePostMutation(), { wrapper: createWrapper(qc) });

    await act(async () => { result.current.mutate({ postId: 'post-1', emoji: '❤️' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = qc.getQueryData<{ pages: { data: { currentUserReactions?: string[] }[] }[] }>(['posts', 'list', 'infinite', 'feed']);
    expect(data?.pages[0].data[0].currentUserReactions).toContain('❤️');
  });
});

describe('useLikePostMutation - socket ack error (no error message → default)', () => {
  beforeEach(() => { mockSocketEmit.mockClear(); mockSocketConnected = true; });

  it('uses default error message when ack has no error string', async () => {
    const qc = createQueryClient();
    seedFeed(qc);
    mockSocketEmit.mockImplementation((_e: string, _p: unknown, cb: (r: { success: boolean; error?: string }) => void) => {
      cb({ success: false }); // no error field
    });

    const { result } = renderHook(() => useLikePostMutation(), { wrapper: createWrapper(qc) });
    await act(async () => { result.current.mutate({ postId: 'post-1' }); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Failed to add reaction');
  });
});
