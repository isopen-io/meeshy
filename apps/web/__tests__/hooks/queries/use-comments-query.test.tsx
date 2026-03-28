import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useCommentsInfiniteQuery, useCommentsList } from '@/hooks/queries/use-comments-query';

const mockGetComments = jest.fn();

jest.mock('@/services/posts.service', () => ({
  postsService: {
    getComments: (...args: unknown[]) => mockGetComments(...args),
    getCommentReplies: jest.fn(),
  },
}));

jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    posts: {
      comments: (postId: string) => ['posts', 'detail', postId, 'comments'],
      commentsInfinite: (postId: string) => ['posts', 'detail', postId, 'comments', 'infinite'],
      commentReplies: (postId: string, commentId: string) => ['posts', 'detail', postId, 'comments', 'replies', commentId],
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

const mockComment = {
  id: 'comment-1',
  postId: 'post-1',
  authorId: 'user-1',
  content: 'Great post!',
  likeCount: 0,
  replyCount: 0,
  createdAt: '2026-03-28T00:00:00Z',
  author: { id: 'user-1', username: 'testuser' },
};

describe('useCommentsInfiniteQuery', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('fetches comments for a post', async () => {
    const page = {
      success: true,
      data: [mockComment],
      meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
    };
    mockGetComments.mockResolvedValue(page);

    const { result } = renderHook(
      () => useCommentsInfiniteQuery({ postId: 'post-1' }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetComments).toHaveBeenCalledWith('post-1', { cursor: undefined, limit: 20 });
    expect(result.current.data?.pages[0].data).toEqual([mockComment]);
  });

  it('does not fetch when postId is empty', () => {
    renderHook(
      () => useCommentsInfiniteQuery({ postId: '' }),
      { wrapper: createWrapper() },
    );
    expect(mockGetComments).not.toHaveBeenCalled();
  });
});

describe('useCommentsList', () => {
  it('flattens pages into array', async () => {
    const page = {
      success: true,
      data: [mockComment],
      meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
    };
    mockGetComments.mockResolvedValue(page);

    const { result } = renderHook(
      () => {
        const query = useCommentsInfiniteQuery({ postId: 'post-1' });
        const comments = useCommentsList(query);
        return { query, comments };
      },
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect(result.current.comments).toEqual([mockComment]);
  });
});
