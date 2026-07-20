/**
 * Tests for hooks/social/use-story-viewers.ts
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useStoryViewersQuery } from '@/hooks/social/use-story-viewers';

const mockGetViewers = jest.fn();

jest.mock('@/services/story.service', () => ({
  storyService: {
    getViewers: (...args: unknown[]) => mockGetViewers(...args),
  },
}));

let mockAuthToken: string | null = 'tok-1';
jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ authToken: mockAuthToken }),
}));

jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    stories: {
      all: ['stories'],
      viewers: (storyId: string) => ['stories', 'viewers', storyId],
    },
  },
}));

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

describe('useStoryViewersQuery', () => {
  it('fetches viewers for the story', async () => {
    mockGetViewers.mockResolvedValue({
      viewers: [{ id: 'v1', postId: 'st-1', userId: 'u2', createdAt: '2026-06-24T10:00:00Z', user: { id: 'u2', username: 'bob' } }],
      total: 1,
    });
    const qc = makeQC();
    const { result } = renderHook(() => useStoryViewersQuery('st-1'), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetViewers).toHaveBeenCalledWith('st-1');
    expect(result.current.data?.total).toBe(1);
    expect(result.current.data?.viewers).toHaveLength(1);
  });

  it('does not fetch without a storyId', () => {
    const qc = makeQC();
    renderHook(() => useStoryViewersQuery(null), { wrapper: wrapper(qc) });
    expect(mockGetViewers).not.toHaveBeenCalled();
  });

  it('does not fetch when disabled (e.g. viewer is not the author)', () => {
    const qc = makeQC();
    renderHook(() => useStoryViewersQuery('st-1', { enabled: false }), { wrapper: wrapper(qc) });
    expect(mockGetViewers).not.toHaveBeenCalled();
  });

  it('does not fetch when unauthenticated', () => {
    mockAuthToken = null;
    const qc = makeQC();
    renderHook(() => useStoryViewersQuery('st-1'), { wrapper: wrapper(qc) });
    expect(mockGetViewers).not.toHaveBeenCalled();
  });
});
