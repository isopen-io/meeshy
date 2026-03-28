import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useCreatePostMutation,
  useDeletePostMutation,
  useLikePostMutation,
  useUnlikePostMutation,
  useBookmarkPostMutation,
} from '@/hooks/queries/use-post-mutations';

const mockCreatePost = jest.fn();
const mockDeletePost = jest.fn();
const mockLikePost = jest.fn();
const mockUnlikePost = jest.fn();
const mockBookmarkPost = jest.fn();

jest.mock('@/services/posts.service', () => ({
  postsService: {
    createPost: (...args: unknown[]) => mockCreatePost(...args),
    deletePost: (...args: unknown[]) => mockDeletePost(...args),
    likePost: (...args: unknown[]) => mockLikePost(...args),
    unlikePost: (...args: unknown[]) => mockUnlikePost(...args),
    bookmarkPost: (...args: unknown[]) => mockBookmarkPost(...args),
    updatePost: jest.fn(),
    unbookmarkPost: jest.fn(),
    repost: jest.fn(),
    sharePost: jest.fn(),
    pinPost: jest.fn(),
    unpinPost: jest.fn(),
    translatePost: jest.fn(),
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
});

describe('useLikePostMutation', () => {
  it('optimistically increments likeCount', async () => {
    const qc = createQueryClient();
    seedFeed(qc);
    mockLikePost.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useLikePostMutation(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      result.current.mutate({ postId: 'post-1' });
    });

    await waitFor(() => expect(result.current.isSuccess || result.current.isPending).toBe(true));

    const data = qc.getQueryData<{ pages: { data: typeof mockPost[] }[] }>(['posts', 'list', 'infinite', 'feed']);
    expect(data?.pages[0].data[0].likeCount).toBe(6);
  });
});

describe('useUnlikePostMutation', () => {
  it('optimistically decrements likeCount', async () => {
    const qc = createQueryClient();
    seedFeed(qc);
    mockUnlikePost.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useUnlikePostMutation(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      result.current.mutate('post-1');
    });

    await waitFor(() => expect(result.current.isSuccess || result.current.isPending).toBe(true));

    const data = qc.getQueryData<{ pages: { data: typeof mockPost[] }[] }>(['posts', 'list', 'infinite', 'feed']);
    expect(data?.pages[0].data[0].likeCount).toBe(4);
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
