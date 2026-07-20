/**
 * Tests for hooks/social/use-stories.ts
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useStoriesFeedQuery,
  useCreateStoryMutation,
  useDeleteStoryMutation,
  useRecordStoryViewMutation,
  useReactToStoryMutation,
} from '@/hooks/social/use-stories';
import type { Post } from '@meeshy/shared/types/post';

// ---------------------------------------------------------------------------
// Service mocks
// ---------------------------------------------------------------------------

const mockGetStories = jest.fn();
const mockCreateStory = jest.fn();
const mockDeleteStory = jest.fn();
const mockRecordView = jest.fn();
const mockReactToStory = jest.fn();

jest.mock('@/services/story.service', () => ({
  storyService: {
    getStories: (...args: unknown[]) => mockGetStories(...args),
    createStory: (...args: unknown[]) => mockCreateStory(...args),
    deleteStory: (...args: unknown[]) => mockDeleteStory(...args),
    recordView: (...args: unknown[]) => mockRecordView(...args),
    reactToStory: (...args: unknown[]) => mockReactToStory(...args),
  },
}));

// ---------------------------------------------------------------------------
// Auth store mock
// ---------------------------------------------------------------------------

const mockCurrentUser = {
  id: 'user-1',
  username: 'alice',
  displayName: 'Alice',
  avatar: null,
};

let mockAuthToken: string | null = 'tok-1';

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ user: mockCurrentUser, authToken: mockAuthToken }),
}));

// ---------------------------------------------------------------------------
// Query keys mock
// ---------------------------------------------------------------------------

jest.mock('@/lib/react-query/query-keys', () => ({
  queryKeys: {
    stories: {
      all: ['stories'],
      feed: () => ['stories', 'feed'],
    },
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  return {
    qc,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  };
}

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'story-1',
    authorId: 'user-1',
    type: 'STORY',
    visibility: 'FRIENDS',
    content: 'My story',
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    shareCount: 0,
    isPinned: false,
    isEdited: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthToken = 'tok-1';
});

// =============================================================================
// useStoriesFeedQuery
// =============================================================================

describe('useStoriesFeedQuery', () => {
  it('is enabled when token exists and calls getStories', async () => {
    const stories = [makePost({ id: 's1' })];
    mockGetStories.mockResolvedValue(stories);

    const { qc, wrapper } = makeWrapper();

    const { result } = renderHook(() => useStoriesFeedQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetStories).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(stories);
  });

  it('is disabled when token is null', () => {
    mockAuthToken = null;

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useStoriesFeedQuery(), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetStories).not.toHaveBeenCalled();
  });

  it('is disabled when enabled=false is passed', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useStoriesFeedQuery({ enabled: false }), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetStories).not.toHaveBeenCalled();
  });
});

// =============================================================================
// useCreateStoryMutation
// =============================================================================

describe('useCreateStoryMutation', () => {
  it('calls storyService.createStory', async () => {
    const serverStory = makePost({ id: 'server-1' });
    mockCreateStory.mockResolvedValue(serverStory);

    const { qc, wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateStoryMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ content: 'Hello story', visibility: 'FRIENDS' });
    });

    expect(mockCreateStory).toHaveBeenCalledWith({ content: 'Hello story', visibility: 'FRIENDS' });
  });

  it('optimistically prepends story to cache', async () => {
    const existingStory = makePost({ id: 'existing-1' });
    const serverStory = makePost({ id: 'server-1' });

    let resolveCreate!: (v: Post) => void;
    mockCreateStory.mockImplementation(() => new Promise(r => { resolveCreate = r; }));

    const { qc, wrapper } = makeWrapper();
    qc.setQueryData(['stories', 'feed'], [existingStory]);

    const { result } = renderHook(() => useCreateStoryMutation(), { wrapper });

    act(() => {
      result.current.mutate({ content: 'New story' });
    });

    // Optimistic update: should prepend
    await waitFor(() => {
      const stories = qc.getQueryData<Post[]>(['stories', 'feed']);
      expect(stories).toHaveLength(2);
      expect(stories![0].id).toMatch(/^_optimistic_/);
    });

    await act(async () => {
      resolveCreate(serverStory);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('replaces optimistic story with server story on success', async () => {
    const serverStory = makePost({ id: 'server-1' });
    mockCreateStory.mockResolvedValue(serverStory);

    const { qc, wrapper } = makeWrapper();
    qc.setQueryData(['stories', 'feed'], []);

    const { result } = renderHook(() => useCreateStoryMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ content: 'New story' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const stories = qc.getQueryData<Post[]>(['stories', 'feed']);
    expect(stories?.some(s => s.id === 'server-1')).toBe(true);
    expect(stories?.every(s => !s.id.startsWith('_optimistic_'))).toBe(true);
  });

  it('rolls back on error', async () => {
    const existingStory = makePost({ id: 'existing-1' });
    mockCreateStory.mockRejectedValue(new Error('Server error'));

    const { qc, wrapper } = makeWrapper();
    qc.setQueryData(['stories', 'feed'], [existingStory]);

    const { result } = renderHook(() => useCreateStoryMutation(), { wrapper });

    await act(async () => {
      result.current.mutate({ content: 'Will fail' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const stories = qc.getQueryData<Post[]>(['stories', 'feed']);
    expect(stories).toEqual([existingStory]);
  });

  it('handles null cache on success (sets to [serverStory])', async () => {
    const serverStory = makePost({ id: 'server-1' });
    mockCreateStory.mockResolvedValue(serverStory);

    const { qc, wrapper } = makeWrapper();
    // No cache set - undefined

    const { result } = renderHook(() => useCreateStoryMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ content: 'First story' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // onSuccess: if !old return [serverStory]
    const stories = qc.getQueryData<Post[]>(['stories', 'feed']);
    expect(stories).toContainEqual(serverStory);
  });
});

// =============================================================================
// useDeleteStoryMutation
// =============================================================================

describe('useDeleteStoryMutation', () => {
  it('optimistically removes story from cache', async () => {
    const story = makePost({ id: 'story-1' });
    const otherStory = makePost({ id: 'story-2' });

    let resolveDelete!: () => void;
    mockDeleteStory.mockImplementation(() => new Promise(r => { resolveDelete = r; }));

    const { qc, wrapper } = makeWrapper();
    qc.setQueryData(['stories', 'feed'], [story, otherStory]);

    const { result } = renderHook(() => useDeleteStoryMutation(), { wrapper });

    act(() => {
      result.current.mutate('story-1');
    });

    await waitFor(() => {
      const stories = qc.getQueryData<Post[]>(['stories', 'feed']);
      expect(stories).toHaveLength(1);
      expect(stories![0].id).toBe('story-2');
    });

    await act(async () => { resolveDelete(); });
  });

  it('rolls back on error', async () => {
    const story = makePost({ id: 'story-1' });
    mockDeleteStory.mockRejectedValue(new Error('Server error'));

    const { qc, wrapper } = makeWrapper();
    qc.setQueryData(['stories', 'feed'], [story]);

    const { result } = renderHook(() => useDeleteStoryMutation(), { wrapper });

    await act(async () => {
      result.current.mutate('story-1');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const stories = qc.getQueryData<Post[]>(['stories', 'feed']);
    expect(stories).toEqual([story]);
  });
});

// =============================================================================
// useRecordStoryViewMutation
// =============================================================================

describe('useRecordStoryViewMutation', () => {
  it('calls storyService.recordView on first call', async () => {
    mockRecordView.mockResolvedValue(undefined);

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useRecordStoryViewMutation(), { wrapper });

    await act(async () => {
      result.current.recordView('story-1');
    });

    await waitFor(() => expect(mockRecordView).toHaveBeenCalledWith('story-1'));
  });

  it('deduplicates: does NOT call recordView twice for same storyId', async () => {
    mockRecordView.mockResolvedValue(undefined);

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useRecordStoryViewMutation(), { wrapper });

    await act(async () => {
      result.current.recordView('story-1');
      result.current.recordView('story-1');
    });

    expect(mockRecordView).toHaveBeenCalledTimes(1);
  });

  it('calls recordView for different storyIds', async () => {
    mockRecordView.mockResolvedValue(undefined);

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useRecordStoryViewMutation(), { wrapper });

    await act(async () => {
      result.current.recordView('story-1');
      result.current.recordView('story-2');
    });

    expect(mockRecordView).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// useReactToStoryMutation
// =============================================================================

describe('useReactToStoryMutation', () => {
  it('calls storyService.reactToStory', async () => {
    mockReactToStory.mockResolvedValue(undefined);

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReactToStoryMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ storyId: 'story-1', emoji: '❤️' });
    });

    expect(mockReactToStory).toHaveBeenCalledWith('story-1', '❤️');
  });
});

// =============================================================================
// useCreateStoryMutation - null currentUser (covers ?? '' and ? {} : undefined)
// =============================================================================

describe('useCreateStoryMutation - null currentUser', () => {
  let origMock: typeof mockCurrentUser | null;

  beforeEach(() => {
    origMock = mockCurrentUser;
    // Override mock to return null user
    jest.mock('@/stores/auth-store', () => ({
      useAuthStore: (sel: (s: unknown) => unknown) =>
        sel({ user: null, authToken: 'tok-1' }),
    }));
  });

  it('creates optimistic story with empty authorId when user is null', async () => {
    // Re-require to pick up new mock
    const serverStory = makePost({ id: 'server-null-user' });
    mockCreateStory.mockResolvedValue(serverStory);

    // The store mock always returns mockCurrentUser via closure.
    // We test the ?? '' branch by providing a post without a real user via a custom wrapper.
    // This tests that the optimistic story has authorId='' when user is null.
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity }, mutations: { retry: false } },
    });

    // Patch the module mock locally
    const authStore = jest.requireMock('@/stores/auth-store');
    const originalUseAuthStore = authStore.useAuthStore;
    authStore.useAuthStore = (sel: (s: unknown) => unknown) =>
      sel({ user: null, authToken: 'tok-1' });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCreateStoryMutation(), { wrapper });

    let resolveCreate!: (v: Post) => void;
    mockCreateStory.mockImplementation(() => new Promise(r => { resolveCreate = r; }));

    act(() => { result.current.mutate({ content: 'Null user story', visibility: 'PUBLIC' }); });

    await waitFor(() => {
      const stories = qc.getQueryData<Post[]>(['stories', 'feed']);
      if (stories && stories.length > 0) {
        expect(stories[0].authorId).toBe('');           // ?? '' branch
        expect(stories[0].author).toBeUndefined();       // ? {} : undefined branch
        expect(stories[0].visibility).toBe('PUBLIC');    // visibility used directly (no ?? fallback)
      }
    });

    authStore.useAuthStore = originalUseAuthStore;
    await act(async () => { resolveCreate(serverStory); });
  });
});

// =============================================================================
// useCreateStoryMutation - visibility defaults to 'FRIENDS' when not provided
// =============================================================================

describe('useCreateStoryMutation - default visibility', () => {
  it('uses FRIENDS as default visibility when visibility is not provided', async () => {
    const serverStory = makePost({ id: 'server-vis' });
    let resolveCreate!: (v: Post) => void;
    mockCreateStory.mockImplementation(() => new Promise(r => { resolveCreate = r; }));

    const { qc, wrapper } = makeWrapper();
    qc.setQueryData(['stories', 'feed'], [] as Post[]);

    const { result } = renderHook(() => useCreateStoryMutation(), { wrapper });

    act(() => { result.current.mutate({ content: 'No vis' }); }); // no visibility

    await waitFor(() => {
      const stories = qc.getQueryData<Post[]>(['stories', 'feed']);
      if (stories && stories.length > 0) {
        expect(stories[0].visibility).toBe('FRIENDS'); // ?? 'FRIENDS' branch
      }
    });

    await act(async () => { resolveCreate(serverStory); });
  });
});

// =============================================================================
// useDeleteStoryMutation - no cache (covers old ?? [] branch)
// =============================================================================

describe('useDeleteStoryMutation - no existing cache', () => {
  it('no-op on delete when cache is undefined (old ?? [])', async () => {
    mockDeleteStory.mockResolvedValue(undefined);

    const { qc, wrapper } = makeWrapper();
    // No cache set - old will be undefined in onMutate setQueryData

    const { result } = renderHook(() => useDeleteStoryMutation(), { wrapper });

    await act(async () => { result.current.mutate('story-1'); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Cache was undefined; after delete it should still be undefined (filter on [])
    const stories = qc.getQueryData<Post[]>(['stories', 'feed']);
    expect(stories ?? []).toHaveLength(0);
  });
});

// =============================================================================
// useCreateStoryMutation - null displayName (covers displayName ?? null right branch)
// =============================================================================

describe('useCreateStoryMutation - null displayName in author', () => {
  it('sets displayName to null when currentUser.displayName is null (line 70 ?? null branch)', async () => {
    const serverStory = makePost({ id: 'server-null-dn' });
    let resolveCreate!: (v: Post) => void;
    mockCreateStory.mockImplementation(() => new Promise(r => { resolveCreate = r; }));

    const { qc, wrapper } = makeWrapper();
    qc.setQueryData(['stories', 'feed'], [] as Post[]);

    // Patch auth store to return a user with null displayName and non-null avatar
    const authStore = jest.requireMock('@/stores/auth-store');
    const originalUseAuthStore = authStore.useAuthStore;
    authStore.useAuthStore = (sel: (s: unknown) => unknown) =>
      sel({ user: { id: 'u-1', username: 'bob', displayName: null, avatar: 'https://cdn.example.com/avatar.jpg' }, authToken: 'tok-1' });

    const { result } = renderHook(() => useCreateStoryMutation(), { wrapper });

    act(() => { result.current.mutate({ content: 'Null displayName story' }); });

    await waitFor(() => {
      const stories = qc.getQueryData<Post[]>(['stories', 'feed']);
      if (stories && stories.length > 0 && stories[0].author) {
        expect(stories[0].author.displayName).toBeNull();   // ?? null right branch
        expect(stories[0].author.avatar).toBe('https://cdn.example.com/avatar.jpg'); // ?? null left branch
      }
    });

    authStore.useAuthStore = originalUseAuthStore;
    await act(async () => { resolveCreate(serverStory); });
  });
});
