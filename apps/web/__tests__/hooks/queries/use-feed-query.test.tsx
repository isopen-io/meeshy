import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useFeedQuery, useFeedPosts } from '@/hooks/queries/use-feed-query';
import type { Post } from '@meeshy/shared/types/post';

const mockGetFeed = jest.fn();

jest.mock('@/services/posts.service', () => ({
  postsService: {
    getFeed: (...args: unknown[]) => mockGetFeed(...args),
    getPost: jest.fn(),
  },
}));

jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    posts: {
      all: ['posts'],
      lists: () => ['posts', 'list'],
      infinite: (type?: string) => ['posts', 'list', 'infinite', type],
      detail: (id: string) => ['posts', 'detail', id],
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

describe('useFeedQuery', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('fetches the feed on mount', async () => {
    const page1 = {
      success: true,
      data: [mockPost],
      meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
    };
    mockGetFeed.mockResolvedValue(page1);

    const { result } = renderHook(() => useFeedQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetFeed).toHaveBeenCalledWith({ cursor: undefined, limit: 20 });
    expect(result.current.data?.pages[0].data).toEqual([mockPost]);
  });

  it('does not fetch when enabled=false', () => {
    renderHook(() => useFeedQuery({ enabled: false }), {
      wrapper: createWrapper(),
    });

    expect(mockGetFeed).not.toHaveBeenCalled();
  });

  it('supports pagination via nextCursor', async () => {
    const page1 = {
      success: true,
      data: [mockPost],
      meta: { pagination: { total: 2, offset: 0, limit: 1, hasMore: true }, nextCursor: 'cursor-abc' },
    };
    mockGetFeed.mockResolvedValueOnce(page1);

    const { result } = renderHook(() => useFeedQuery({ limit: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
  });
});

describe('useFeedPosts', () => {
  it('flattens pages into a single array', async () => {
    const page1 = {
      success: true,
      data: [mockPost],
      meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
    };
    mockGetFeed.mockResolvedValue(page1);

    const { result } = renderHook(
      () => {
        const query = useFeedQuery();
        const posts = useFeedPosts(query);
        return { query, posts };
      },
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect(result.current.posts).toEqual([mockPost]);
  });

  it('returns empty array when no data', () => {
    const { result } = renderHook(
      () => {
        const query = useFeedQuery({ enabled: false });
        const posts = useFeedPosts(query);
        return { posts };
      },
      { wrapper: createWrapper() },
    );

    expect(result.current.posts).toEqual([]);
  });
});
