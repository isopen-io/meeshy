import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useReelsFeedQuery, useReelsFeedPosts } from '@/hooks/queries/use-reels-feed-query';
import type { Post } from '@meeshy/shared/types/post';

const mockGetReelsFeed = jest.fn();

jest.mock('@/services/posts.service', () => ({
  postsService: {
    getReelsFeed: (...args: unknown[]) => mockGetReelsFeed(...args),
  },
}));

jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    posts: {
      all: ['posts'],
      lists: () => ['posts', 'list'],
      reelsFeed: (seed?: string) => ['posts', 'list', 'reels', seed ?? 'foryou'],
    },
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const mockPost: Post = {
  id: 'post-1',
  authorId: 'user-1',
  type: 'POST',
  visibility: 'PUBLIC',
  content: 'Hello world',
  likeCount: 5,
  commentCount: 2,
  repostCount: 0,
  viewCount: 10,
  bookmarkCount: 0,
  shareCount: 0,
  isPinned: false,
  isEdited: false,
  createdAt: '2026-03-28T00:00:00Z',
  updatedAt: '2026-03-28T00:00:00Z',
};

describe('useReelsFeedQuery', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('uses queryKeys.posts.reelsFeed(seed) as the query key', async () => {
    const page = {
      success: true,
      data: [mockPost],
      pagination: { limit: 10, hasMore: false, nextCursor: null },
    };
    mockGetReelsFeed.mockResolvedValue(page);

    const { result } = renderHook(() => useReelsFeedQuery({ seed: 'reel-abc' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pageParams[0]).toBeUndefined();
  });

  it('passes seed, cursor and limit to postsService.getReelsFeed', async () => {
    const page = {
      success: true,
      data: [mockPost],
      pagination: { limit: 5, hasMore: false, nextCursor: null },
    };
    mockGetReelsFeed.mockResolvedValue(page);

    const { result } = renderHook(
      () => useReelsFeedQuery({ seed: 'reel-xyz', limit: 5 }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetReelsFeed).toHaveBeenCalledWith({
      seed: 'reel-xyz',
      cursor: undefined,
      limit: 5,
    });
  });

  it('uses seed=undefined and limit=10 when no options are supplied', async () => {
    const page = {
      success: true,
      data: [mockPost],
      pagination: { limit: 10, hasMore: false, nextCursor: null },
    };
    mockGetReelsFeed.mockResolvedValue(page);

    const { result } = renderHook(() => useReelsFeedQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetReelsFeed).toHaveBeenCalledWith({
      seed: undefined,
      cursor: undefined,
      limit: 10,
    });
  });

  it('does not fetch when enabled=false', () => {
    renderHook(() => useReelsFeedQuery({ enabled: false }), {
      wrapper: createWrapper(),
    });

    expect(mockGetReelsFeed).not.toHaveBeenCalled();
  });

  it('returns hasNextPage=true and advances cursor when hasMore=true', async () => {
    const page = {
      success: true,
      data: [mockPost],
      pagination: { limit: 10, hasMore: true, nextCursor: 'cursor-abc' },
    };
    mockGetReelsFeed.mockResolvedValue(page);

    const { result } = renderHook(() => useReelsFeedQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
  });

  it('returns hasNextPage=false when hasMore=false', async () => {
    const page = {
      success: true,
      data: [mockPost],
      pagination: { limit: 10, hasMore: false, nextCursor: null },
    };
    mockGetReelsFeed.mockResolvedValue(page);

    const { result } = renderHook(() => useReelsFeedQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });

  it('returns hasNextPage=false when hasMore=true but nextCursor is null', async () => {
    const page = {
      success: true,
      data: [mockPost],
      pagination: { limit: 10, hasMore: true, nextCursor: null },
    };
    mockGetReelsFeed.mockResolvedValue(page);

    const { result } = renderHook(() => useReelsFeedQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });
});

describe('useReelsFeedPosts', () => {
  it('returns empty array when query.data is undefined', () => {
    const fakeQuery = { data: undefined } as ReturnType<typeof useReelsFeedQuery>;
    expect(useReelsFeedPosts(fakeQuery)).toEqual([]);
  });

  it('returns empty array when query.data is null', () => {
    const fakeQuery = { data: null } as unknown as ReturnType<typeof useReelsFeedQuery>;
    expect(useReelsFeedPosts(fakeQuery)).toEqual([]);
  });

  it('returns flattened posts from a single page', () => {
    const post2: Post = { ...mockPost, id: 'post-2' };
    const fakeQuery = {
      data: { pages: [{ data: [mockPost, post2], pagination: { limit: 10, hasMore: false, nextCursor: null } }], pageParams: [undefined] },
    } as unknown as ReturnType<typeof useReelsFeedQuery>;

    expect(useReelsFeedPosts(fakeQuery)).toEqual([mockPost, post2]);
  });

  it('flattens posts from multiple pages', () => {
    const post2: Post = { ...mockPost, id: 'post-2' };
    const post3: Post = { ...mockPost, id: 'post-3' };
    const fakeQuery = {
      data: {
        pages: [
          { data: [mockPost, post2], pagination: { limit: 2, hasMore: true, nextCursor: 'c1' } },
          { data: [post3], pagination: { limit: 2, hasMore: false, nextCursor: null } },
        ],
        pageParams: [undefined, 'c1'],
      },
    } as unknown as ReturnType<typeof useReelsFeedQuery>;

    expect(useReelsFeedPosts(fakeQuery)).toEqual([mockPost, post2, post3]);
  });

  it('deduplicates posts across pages — first occurrence wins', () => {
    const dup = { ...mockPost, id: 'post-1', likeCount: 5 };
    const dupLater = { ...mockPost, id: 'post-1', likeCount: 99 };
    const other: Post = { ...mockPost, id: 'post-2' };
    const fakeQuery = {
      data: {
        pages: [
          { data: [dup, other], pagination: { limit: 2, hasMore: true, nextCursor: 'c1' } },
          { data: [dupLater, { ...mockPost, id: 'post-3' }], pagination: { limit: 2, hasMore: false, nextCursor: null } },
        ],
        pageParams: [undefined, 'c1'],
      },
    } as unknown as ReturnType<typeof useReelsFeedQuery>;

    const result = useReelsFeedPosts(fakeQuery);
    const ids = result.map((p) => p.id);
    expect(ids).toEqual(['post-1', 'post-2', 'post-3']);
    expect(result.find((p) => p.id === 'post-1')?.likeCount).toBe(5);
  });
});
