import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useCreateCommentMutation,
  useDeleteCommentMutation,
  useLikeCommentMutation,
} from '@/hooks/queries/use-comment-mutations';

const mockCreateComment = jest.fn();
const mockDeleteComment = jest.fn();
const mockLikeComment = jest.fn();

jest.mock('@/services/posts.service', () => ({
  postsService: {
    createComment: (...args: unknown[]) => mockCreateComment(...args),
    deleteComment: (...args: unknown[]) => mockDeleteComment(...args),
    likeComment: (...args: unknown[]) => mockLikeComment(...args),
    unlikeComment: jest.fn(),
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
      comments: (postId: string) => ['posts', 'detail', postId, 'comments'],
      commentsInfinite: (postId: string) => ['posts', 'detail', postId, 'comments', 'infinite'],
    },
  },
}));

const mockComment = {
  id: 'comment-1',
  postId: 'post-1',
  authorId: 'user-2',
  parentId: null,
  content: 'Nice!',
  likeCount: 3,
  replyCount: 0,
  createdAt: '2026-03-28T00:00:00Z',
  author: { id: 'user-2', username: 'other' },
};

const mockPost = {
  id: 'post-1',
  authorId: 'user-1',
  type: 'POST' as const,
  visibility: 'PUBLIC' as const,
  content: 'Hello',
  likeCount: 0,
  commentCount: 5,
  repostCount: 0,
  viewCount: 0,
  bookmarkCount: 0,
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

function createWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function seedComments(qc: QueryClient) {
  qc.setQueryData(['posts', 'detail', 'post-1', 'comments', 'infinite'], {
    pages: [{
      data: [mockComment],
      meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
    }],
    pageParams: [undefined],
  });
}

function seedFeed(qc: QueryClient) {
  qc.setQueryData(['posts', 'list', 'infinite', 'feed'], {
    pages: [{
      data: [mockPost],
      meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
    }],
    pageParams: [undefined],
  });
}

describe('useCreateCommentMutation', () => {
  it('calls postsService.createComment', async () => {
    const qc = createQueryClient();
    mockCreateComment.mockResolvedValue({ success: true, data: { id: 'new-c', content: 'My comment' } });

    const { result } = renderHook(() => useCreateCommentMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      result.current.mutate({ postId: 'post-1', content: 'My comment' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockCreateComment).toHaveBeenCalledWith('post-1', 'My comment', undefined);
  });

  it('optimistically prepends comment and increments commentCount', async () => {
    const qc = createQueryClient();
    seedComments(qc);
    seedFeed(qc);

    let resolve: (v: unknown) => void;
    mockCreateComment.mockImplementation(() => new Promise((r) => { resolve = r; }));

    const { result } = renderHook(() => useCreateCommentMutation(), { wrapper: createWrapper(qc) });

    act(() => {
      result.current.mutate({ postId: 'post-1', content: 'New comment' });
    });

    await waitFor(() => {
      const comments = qc.getQueryData<{ pages: { data: unknown[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      expect(comments?.pages[0].data).toHaveLength(2);
    });

    const feed = qc.getQueryData<{ pages: { data: typeof mockPost[] }[] }>(['posts', 'list', 'infinite', 'feed']);
    expect(feed?.pages[0].data[0].commentCount).toBe(6);

    await act(async () => {
      resolve!({ success: true, data: { id: 'real-c', content: 'New comment' } });
    });
  });
});

describe('useDeleteCommentMutation', () => {
  it('optimistically removes comment and decrements commentCount', async () => {
    const qc = createQueryClient();
    seedComments(qc);
    seedFeed(qc);
    mockDeleteComment.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useDeleteCommentMutation(), { wrapper: createWrapper(qc) });

    act(() => {
      result.current.mutate({ postId: 'post-1', commentId: 'comment-1' });
    });

    await waitFor(() => {
      const comments = qc.getQueryData<{ pages: { data: unknown[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      expect(comments?.pages[0].data).toHaveLength(0);
    });

    const feed = qc.getQueryData<{ pages: { data: typeof mockPost[] }[] }>(['posts', 'list', 'infinite', 'feed']);
    expect(feed?.pages[0].data[0].commentCount).toBe(4);
  });
});

describe('useLikeCommentMutation', () => {
  it('optimistically increments likeCount', async () => {
    const qc = createQueryClient();
    seedComments(qc);
    mockLikeComment.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useLikeCommentMutation(), { wrapper: createWrapper(qc) });

    act(() => {
      result.current.mutate({ postId: 'post-1', commentId: 'comment-1' });
    });

    await waitFor(() => {
      const comments = qc.getQueryData<{ pages: { data: typeof mockComment[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
      expect(comments?.pages[0].data[0].likeCount).toBe(4);
    });
  });
});

describe('useCreateCommentMutation - rollback', () => {
  it('rolls back on error', async () => {
    const qc = createQueryClient();
    seedComments(qc);
    seedFeed(qc);
    mockCreateComment.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useCreateCommentMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      result.current.mutate({ postId: 'post-1', content: 'Will fail' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const comments = qc.getQueryData<{ pages: { data: unknown[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
    expect(comments?.pages[0].data).toHaveLength(1);

    const feed = qc.getQueryData<{ pages: { data: typeof mockPost[] }[] }>(['posts', 'list', 'infinite', 'feed']);
    expect(feed?.pages[0].data[0].commentCount).toBe(5);
  });
});

describe('useLikeCommentMutation - rollback', () => {
  it('rolls back likeCount on error', async () => {
    const qc = createQueryClient();
    seedComments(qc);
    mockLikeComment.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useLikeCommentMutation(), { wrapper: createWrapper(qc) });

    await act(async () => {
      result.current.mutate({ postId: 'post-1', commentId: 'comment-1' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const comments = qc.getQueryData<{ pages: { data: typeof mockComment[] }[] }>(['posts', 'detail', 'post-1', 'comments', 'infinite']);
    expect(comments?.pages[0].data[0].likeCount).toBe(3);
  });
});
