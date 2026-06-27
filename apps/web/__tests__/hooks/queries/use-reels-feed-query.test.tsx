/**
 * Tests for hooks/queries/use-reels-feed-query.ts
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, InfiniteData } from '@tanstack/react-query';
import React from 'react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetReelsFeed = jest.fn();

jest.mock('@/services/posts.service', () => ({
  postsService: {
    getReelsFeed: (...a: unknown[]) => mockGetReelsFeed(...a),
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper: Wrapper, queryClient };
}

const mockPost = { id: 'p1', type: 'reel', content: 'test' };
const makePageResponse = (hasMore = false, nextCursor?: string) => ({
  data: [mockPost],
  pagination: { hasMore, nextCursor },
});

beforeEach(() => jest.clearAllMocks());

import { useReelsFeedQuery, useReelsFeedPosts } from '@/hooks/queries/use-reels-feed-query';

// ─── useReelsFeedQuery ────────────────────────────────────────────────────────

describe('useReelsFeedQuery', () => {
  it('is disabled when enabled: false', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReelsFeedQuery({ enabled: false }), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetReelsFeed).not.toHaveBeenCalled();
  });

  it('fetches reels feed on mount', async () => {
    mockGetReelsFeed.mockResolvedValue(makePageResponse());
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReelsFeedQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetReelsFeed).toHaveBeenCalledWith(
      expect.objectContaining({ seed: undefined, limit: 10 })
    );
  });

  it('passes seed and custom limit to service', async () => {
    mockGetReelsFeed.mockResolvedValue(makePageResponse());
    const { wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useReelsFeedQuery({ seed: 'p99', limit: 5 }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetReelsFeed).toHaveBeenCalledWith(
      expect.objectContaining({ seed: 'p99', limit: 5 })
    );
  });

  it('has no next page when pagination.hasMore is false', async () => {
    mockGetReelsFeed.mockResolvedValue(makePageResponse(false));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReelsFeedQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });

  it('has a next page when pagination.hasMore is true and nextCursor is set', async () => {
    mockGetReelsFeed.mockResolvedValue(makePageResponse(true, 'cursor-abc'));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReelsFeedQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
  });

  it('returns no next page when hasMore is true but nextCursor is absent', async () => {
    mockGetReelsFeed.mockResolvedValue(makePageResponse(true, undefined));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReelsFeedQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // cursor is absent → getNextPageParam returns undefined → no next page
    expect(result.current.hasNextPage).toBe(false);
  });
});

// ─── useReelsFeedPosts ────────────────────────────────────────────────────────

type MockQueryResult = { data?: InfiniteData<{ data: typeof mockPost[]; pagination?: unknown }> };

describe('useReelsFeedPosts', () => {
  it('returns empty array when no data', () => {
    const query: MockQueryResult = { data: undefined };
    const result = useReelsFeedPosts(query as ReturnType<typeof useReelsFeedQuery>);
    expect(result).toEqual([]);
  });

  it('returns flattened posts from all pages', () => {
    const post2 = { id: 'p2', type: 'reel', content: 'b' };
    const query: MockQueryResult = {
      data: {
        pages: [{ data: [mockPost] }, { data: [post2] }],
        pageParams: [undefined, 'cursor1'],
      },
    };
    const result = useReelsFeedPosts(query as ReturnType<typeof useReelsFeedQuery>);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('p1');
    expect(result[1].id).toBe('p2');
  });

  it('deduplicates posts with the same id', () => {
    const query: MockQueryResult = {
      data: {
        pages: [{ data: [mockPost] }, { data: [mockPost, { id: 'p2', type: 'reel', content: 'b' }] }],
        pageParams: [undefined, 'cursor1'],
      },
    };
    const result = useReelsFeedPosts(query as ReturnType<typeof useReelsFeedQuery>);
    expect(result).toHaveLength(2);
    expect(result.map(p => p.id)).toEqual(['p1', 'p2']);
  });

  it('first occurrence wins on deduplication', () => {
    const postDup = { id: 'p1', type: 'reel', content: 'SECOND' };
    const query: MockQueryResult = {
      data: {
        pages: [{ data: [mockPost] }, { data: [postDup] }],
        pageParams: [undefined, 'cursor1'],
      },
    };
    const result = useReelsFeedPosts(query as ReturnType<typeof useReelsFeedQuery>);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('test');
  });
});
