/**
 * Tests for hooks/social/use-statuses.ts
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useStatusesFeedQuery,
  useStatusesList,
  useCreateStatusMutation,
} from '@/hooks/social/use-statuses';
import type { Post } from '@meeshy/shared/types/post';

// ---------------------------------------------------------------------------
// Service mock
// ---------------------------------------------------------------------------

const mockGetStatuses = jest.fn();
const mockCreatePost = jest.fn();

jest.mock('@/services/posts.service', () => ({
  postsService: {
    getStatuses: (...args: unknown[]) => mockGetStatuses(...args),
    createPost: (...args: unknown[]) => mockCreatePost(...args),
  },
}));

// ---------------------------------------------------------------------------
// Auth store mock
// ---------------------------------------------------------------------------

let mockAuthToken: string | null = 'tok-1';

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ authToken: mockAuthToken }),
}));

// ---------------------------------------------------------------------------
// Query keys mock
// ---------------------------------------------------------------------------

jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    posts: {
      all: ['posts'],
      lists: () => ['posts', 'list'],
      statuses: () => ['posts', 'list', 'statuses'],
    },
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStatus(overrides: Partial<Post> = {}): Post {
  return {
    id: 'st-1',
    authorId: 'author-1',
    type: 'STATUS',
    visibility: 'PUBLIC',
    content: 'hi',
    moodEmoji: '🎉',
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    shareCount: 0,
    isPinned: false,
    isEdited: false,
    createdAt: '2026-06-24T10:00:00Z',
    updatedAt: '2026-06-24T10:00:00Z',
    ...overrides,
  } as Post;
}

function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
}

function wrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthToken = 'tok-1';
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useStatusesFeedQuery', () => {
  it('returns the status posts from the API', async () => {
    mockGetStatuses.mockResolvedValue({ success: true, data: [makeStatus()] });
    const qc = makeQC();
    const { result } = renderHook(() => useStatusesFeedQuery(), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].id).toBe('st-1');
  });

  it('does not fetch when unauthenticated', () => {
    mockAuthToken = null;
    const qc = makeQC();
    renderHook(() => useStatusesFeedQuery(), { wrapper: wrapper(qc) });
    expect(mockGetStatuses).not.toHaveBeenCalled();
  });

  it('does not fetch when disabled', () => {
    const qc = makeQC();
    renderHook(() => useStatusesFeedQuery({ enabled: false }), { wrapper: wrapper(qc) });
    expect(mockGetStatuses).not.toHaveBeenCalled();
  });
});

describe('useStatusesList', () => {
  it('returns the data array', () => {
    expect(useStatusesList({ data: [makeStatus()] })).toHaveLength(1);
  });
  it('returns an empty array when data is undefined', () => {
    expect(useStatusesList({})).toEqual([]);
  });
});

describe('useCreateStatusMutation', () => {
  it('creates a STATUS post with the mood emoji and prepends it to the cache', async () => {
    const created = makeStatus({ id: 'st-new', moodEmoji: '🔥', content: 'on fire' });
    mockCreatePost.mockResolvedValue({ success: true, data: created });
    const qc = makeQC();
    qc.setQueryData(['posts', 'list', 'statuses'], [makeStatus({ id: 'st-old' })]);

    const { result } = renderHook(() => useCreateStatusMutation(), { wrapper: wrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({ moodEmoji: '🔥', content: 'on fire' });
    });

    expect(mockCreatePost).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STATUS', moodEmoji: '🔥', content: 'on fire', visibility: 'PUBLIC' }),
    );
    const cache = qc.getQueryData<Post[]>(['posts', 'list', 'statuses']);
    expect(cache?.map((s) => s.id)).toEqual(['st-new', 'st-old']);
  });
});
