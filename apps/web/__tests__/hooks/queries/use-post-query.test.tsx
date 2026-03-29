import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { usePostQuery } from '@/hooks/queries/use-post-query';

const mockGetPost = jest.fn();

jest.mock('@/services/posts.service', () => ({
  postsService: {
    getPost: (...args: unknown[]) => mockGetPost(...args),
  },
}));

jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    posts: {
      details: () => ['posts', 'detail'],
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

const mockPost = {
  id: 'post-1',
  authorId: 'user-1',
  type: 'POST',
  content: 'Hello',
  likeCount: 0,
  commentCount: 0,
  repostCount: 0,
  viewCount: 0,
  bookmarkCount: 0,
  shareCount: 0,
  isPinned: false,
  isEdited: false,
  createdAt: '2026-03-28T00:00:00Z',
  updatedAt: '2026-03-28T00:00:00Z',
};

describe('usePostQuery', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('fetches post by id', async () => {
    mockGetPost.mockResolvedValue({ success: true, data: mockPost });

    const { result } = renderHook(() => usePostQuery('post-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetPost).toHaveBeenCalledWith('post-1');
    expect(result.current.data).toEqual(mockPost);
  });

  it('does not fetch when postId is null', () => {
    renderHook(() => usePostQuery(null), { wrapper: createWrapper() });
    expect(mockGetPost).not.toHaveBeenCalled();
  });

  it('does not fetch when postId is undefined', () => {
    renderHook(() => usePostQuery(undefined), { wrapper: createWrapper() });
    expect(mockGetPost).not.toHaveBeenCalled();
  });
});
