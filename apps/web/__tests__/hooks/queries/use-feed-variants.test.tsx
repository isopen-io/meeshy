import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useStatusesQuery,
  useStatusesDiscoverQuery,
  useUserPostsQuery,
  useBookmarksQuery,
  usePostViewersQuery,
} from '@/hooks/queries/use-feed-variants';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetStatuses = jest.fn();
const mockGetStatusesDiscover = jest.fn();
const mockGetUserPosts = jest.fn();
const mockGetBookmarks = jest.fn();
const mockGetPostViews = jest.fn();

jest.mock('@/services/posts.service', () => ({
  postsService: {
    getStatuses: (...args: unknown[]) => mockGetStatuses(...args),
    getStatusesDiscover: (...args: unknown[]) => mockGetStatusesDiscover(...args),
    getUserPosts: (...args: unknown[]) => mockGetUserPosts(...args),
    getBookmarks: (...args: unknown[]) => mockGetBookmarks(...args),
    getPostViews: (...args: unknown[]) => mockGetPostViews(...args),
  },
}));

jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    posts: {
      all: ['posts'],
      lists: () => ['posts', 'list'],
      statuses: () => ['posts', 'list', 'statuses'],
      userPosts: (userId: string) => ['posts', 'list', 'user', userId],
      bookmarks: () => ['posts', 'list', 'bookmarks'],
      detail: (id: string) => ['posts', 'detail', id],
    },
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

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

const mockPage = {
  success: true,
  data: [],
  meta: {
    pagination: { total: 0, offset: 0, limit: 20, hasMore: false },
    nextCursor: null,
  },
};

const mockViewersResponse = { viewers: [], total: 0 };

// ── useStatusesQuery ─────────────────────────────────────────────────────────

describe('useStatusesQuery', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('fetches statuses on mount when enabled', async () => {
    mockGetStatuses.mockResolvedValue(mockPage);

    const { result } = renderHook(() => useStatusesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetStatuses).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20 }),
    );
  });

  it('does not fetch when enabled=false', () => {
    const { result } = renderHook(() => useStatusesQuery({ enabled: false }), {
      wrapper: createWrapper(),
    });

    expect(result.current.isFetching).toBe(false);
    expect(mockGetStatuses).not.toHaveBeenCalled();
  });
});

// ── useStatusesDiscoverQuery ─────────────────────────────────────────────────

describe('useStatusesDiscoverQuery', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('fetches discover statuses on mount when enabled', async () => {
    mockGetStatusesDiscover.mockResolvedValue(mockPage);

    const { result } = renderHook(() => useStatusesDiscoverQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetStatusesDiscover).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20 }),
    );
  });

  it('does not fetch when enabled=false', () => {
    const { result } = renderHook(
      () => useStatusesDiscoverQuery({ enabled: false }),
      { wrapper: createWrapper() },
    );

    expect(result.current.isFetching).toBe(false);
    expect(mockGetStatusesDiscover).not.toHaveBeenCalled();
  });
});

// ── useUserPostsQuery ────────────────────────────────────────────────────────

describe('useUserPostsQuery', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('fetches user posts when userId is provided', async () => {
    mockGetUserPosts.mockResolvedValue(mockPage);

    const { result } = renderHook(
      () => useUserPostsQuery({ userId: 'user-1' }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetUserPosts).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ limit: 20 }),
    );
  });

  it('does not fetch when userId is empty (!!userId && enabled branch = false)', () => {
    const { result } = renderHook(
      () => useUserPostsQuery({ userId: '' }),
      { wrapper: createWrapper() },
    );

    expect(result.current.isFetching).toBe(false);
    expect(mockGetUserPosts).not.toHaveBeenCalled();
  });

  it('does not fetch when enabled=false even with valid userId', () => {
    const { result } = renderHook(
      () => useUserPostsQuery({ userId: 'user-1', enabled: false }),
      { wrapper: createWrapper() },
    );

    expect(result.current.isFetching).toBe(false);
    expect(mockGetUserPosts).not.toHaveBeenCalled();
  });
});

// ── useBookmarksQuery ────────────────────────────────────────────────────────

describe('useBookmarksQuery', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('fetches bookmarks on mount with default options', async () => {
    mockGetBookmarks.mockResolvedValue(mockPage);

    const { result } = renderHook(() => useBookmarksQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetBookmarks).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20 }),
    );
  });

  it('does not fetch when enabled=false', () => {
    const { result } = renderHook(
      () => useBookmarksQuery({ enabled: false }),
      { wrapper: createWrapper() },
    );

    expect(result.current.isFetching).toBe(false);
    expect(mockGetBookmarks).not.toHaveBeenCalled();
  });
});

// ── usePostViewersQuery ──────────────────────────────────────────────────────

describe('usePostViewersQuery', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('fetches post viewers when postId is provided', async () => {
    mockGetPostViews.mockResolvedValue(mockViewersResponse);

    const { result } = renderHook(
      () => usePostViewersQuery({ postId: 'post-1' }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetPostViews).toHaveBeenCalledWith('post-1', 50);
    expect(result.current.data).toEqual(mockViewersResponse);
  });

  it('does not fetch when postId is empty (!!postId && enabled branch = false)', () => {
    const { result } = renderHook(
      () => usePostViewersQuery({ postId: '' }),
      { wrapper: createWrapper() },
    );

    expect(result.current.isFetching).toBe(false);
    expect(mockGetPostViews).not.toHaveBeenCalled();
  });

  it('does not fetch when enabled=false even with valid postId', () => {
    const { result } = renderHook(
      () => usePostViewersQuery({ postId: 'post-1', enabled: false }),
      { wrapper: createWrapper() },
    );

    expect(result.current.isFetching).toBe(false);
    expect(mockGetPostViews).not.toHaveBeenCalled();
  });

  it('uses custom limit when provided', async () => {
    mockGetPostViews.mockResolvedValue(mockViewersResponse);

    const { result } = renderHook(
      () => usePostViewersQuery({ postId: 'post-1', limit: 10 }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetPostViews).toHaveBeenCalledWith('post-1', 10);
  });
});
