import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useHashtagFeedQuery, useFeedPosts } from '@/hooks/queries/use-feed-query';
import type { Post } from '@meeshy/shared/types/post';

const mockGetPostsByHashtag = jest.fn();

jest.mock('@/services/posts.service', () => ({
  postsService: {
    getPostsByHashtag: (...args: unknown[]) => mockGetPostsByHashtag(...args),
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
  content: 'Vue de #paris',
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

describe('useHashtagFeedQuery', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('fetches posts for the given tag on mount', async () => {
    const page1 = {
      success: true,
      data: [mockPost],
      meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
    };
    mockGetPostsByHashtag.mockResolvedValue(page1);

    const { result } = renderHook(() => useHashtagFeedQuery('paris'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetPostsByHashtag).toHaveBeenCalledWith('paris', { cursor: undefined, limit: 20 });
    expect(result.current.data?.pages[0].data).toEqual([mockPost]);
  });

  it('does not fetch when tag is empty', () => {
    renderHook(() => useHashtagFeedQuery(''), {
      wrapper: createWrapper(),
    });

    expect(mockGetPostsByHashtag).not.toHaveBeenCalled();
  });

  it('flattens pages via useFeedPosts', async () => {
    const page1 = {
      success: true,
      data: [mockPost],
      meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
    };
    mockGetPostsByHashtag.mockResolvedValue(page1);

    const { result } = renderHook(
      () => {
        const query = useHashtagFeedQuery('paris');
        const posts = useFeedPosts(query);
        return { query, posts };
      },
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect(result.current.posts).toEqual([mockPost]);
  });
});
