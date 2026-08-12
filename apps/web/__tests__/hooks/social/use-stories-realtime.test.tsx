/**
 * Tests for hooks/social/use-stories-realtime.ts
 */

import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useStoriesRealtime } from '@/hooks/social/use-stories-realtime';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { Post } from '@meeshy/shared/types/post';

// ---------------------------------------------------------------------------
// Socket mock
// ---------------------------------------------------------------------------

const mockSocketOn = jest.fn();
const mockSocketOff = jest.fn();
const mockSocketEmit = jest.fn();
let mockSocket: {
  on: typeof mockSocketOn;
  off: typeof mockSocketOff;
  emit: typeof mockSocketEmit;
  connected: boolean;
} | null = {
  on: mockSocketOn,
  off: mockSocketOff,
  emit: mockSocketEmit,
  connected: true,
};

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    getSocket: () => mockSocket,
    onStatusChange: jest.fn(() => () => {}),
  },
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

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function makeQC() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
    },
  });
}

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'story-1',
    authorId: 'user-1',
    type: 'STORY',
    visibility: 'FRIENDS',
    content: null,
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

function triggerSocketEvent(eventName: string, data: unknown): void {
  const call = mockSocketOn.mock.calls.find(c => c[0] === eventName);
  if (!call) throw new Error(`No listener for "${eventName}". Registered: ${mockSocketOn.mock.calls.map(c => c[0]).join(', ')}`);
  call[1](data);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockSocket = {
    on: mockSocketOn,
    off: mockSocketOff,
    emit: mockSocketEmit,
    connected: true,
  };
});

describe('useStoriesRealtime - initial state', () => {
  it('starts with newStoriesCount=0', () => {
    const qc = makeQC();
    const { result } = renderHook(() => useStoriesRealtime(), { wrapper: makeWrapper(qc) });

    expect(result.current.newStoriesCount).toBe(0);
  });
});

describe('useStoriesRealtime - enabled=false', () => {
  it('does NOT subscribe to socket events', () => {
    const qc = makeQC();
    renderHook(() => useStoriesRealtime({ enabled: false }), { wrapper: makeWrapper(qc) });

    expect(mockSocketOn).not.toHaveBeenCalled();
    expect(mockSocketEmit).not.toHaveBeenCalled();
  });
});

describe('useStoriesRealtime - onStoryCreated', () => {
  it('prepends new story to cache and increments count', () => {
    const qc = makeQC();
    const existingStory = makePost({ id: 'existing-1' });
    qc.setQueryData(['stories', 'feed'], [existingStory]);

    const { result } = renderHook(() => useStoriesRealtime(), { wrapper: makeWrapper(qc) });

    const newStory = makePost({ id: 'new-story-1' });

    act(() => {
      triggerSocketEvent(SERVER_EVENTS.STORY_CREATED, { story: newStory });
    });

    expect(result.current.newStoriesCount).toBe(1);

    const stories = qc.getQueryData<Post[]>(['stories', 'feed']);
    expect(stories).toHaveLength(2);
    expect(stories![0].id).toBe('new-story-1');
  });

  it('no-op when story already exists (deduplication)', () => {
    const qc = makeQC();
    const story = makePost({ id: 'story-1' });
    qc.setQueryData(['stories', 'feed'], [story]);

    const { result } = renderHook(() => useStoriesRealtime(), { wrapper: makeWrapper(qc) });

    act(() => {
      triggerSocketEvent(SERVER_EVENTS.STORY_CREATED, { story });
    });

    expect(result.current.newStoriesCount).toBe(1); // Still increments count
    const stories = qc.getQueryData<Post[]>(['stories', 'feed']);
    expect(stories).toHaveLength(1); // No duplicate
  });

  it('initializes cache with [story] when old=null', () => {
    const qc = makeQC();
    // No existing cache

    const { result } = renderHook(() => useStoriesRealtime(), { wrapper: makeWrapper(qc) });

    const newStory = makePost({ id: 'new-story-1' });

    act(() => {
      triggerSocketEvent(SERVER_EVENTS.STORY_CREATED, { story: newStory });
    });

    expect(result.current.newStoriesCount).toBe(1);
    const stories = qc.getQueryData<Post[]>(['stories', 'feed']);
    expect(stories).toEqual([newStory]);
  });
});

describe('useStoriesRealtime - onStoryViewed', () => {
  it('updates viewCount on matching story', () => {
    const qc = makeQC();
    const story = makePost({ id: 'story-1', viewCount: 5 });
    qc.setQueryData(['stories', 'feed'], [story]);

    renderHook(() => useStoriesRealtime(), { wrapper: makeWrapper(qc) });

    act(() => {
      triggerSocketEvent(SERVER_EVENTS.STORY_VIEWED, {
        storyId: 'story-1',
        viewerId: 'user-2',
        viewerUsername: 'bob',
        viewCount: 6,
      });
    });

    const stories = qc.getQueryData<Post[]>(['stories', 'feed']);
    expect(stories![0].viewCount).toBe(6);
  });

  it('no-op when storyId does not match', () => {
    const qc = makeQC();
    const story = makePost({ id: 'story-1', viewCount: 5 });
    qc.setQueryData(['stories', 'feed'], [story]);

    renderHook(() => useStoriesRealtime(), { wrapper: makeWrapper(qc) });

    act(() => {
      triggerSocketEvent(SERVER_EVENTS.STORY_VIEWED, {
        storyId: 'story-99',
        viewerId: 'user-2',
        viewerUsername: 'bob',
        viewCount: 1,
      });
    });

    const stories = qc.getQueryData<Post[]>(['stories', 'feed']);
    expect(stories![0].viewCount).toBe(5); // Unchanged
  });

  it('no-op when cache is undefined (old=undefined)', () => {
    const qc = makeQC();
    // No cache

    renderHook(() => useStoriesRealtime(), { wrapper: makeWrapper(qc) });

    act(() => {
      triggerSocketEvent(SERVER_EVENTS.STORY_VIEWED, {
        storyId: 'story-1',
        viewerId: 'user-2',
        viewerUsername: 'bob',
        viewCount: 1,
      });
    });

    expect(qc.getQueryData(['stories', 'feed'])).toBeUndefined();
  });
});

describe('useStoriesRealtime - onStoryReacted', () => {
  it('is informational only - no cache mutation', () => {
    const qc = makeQC();
    const story = makePost({ id: 'story-1' });
    qc.setQueryData(['stories', 'feed'], [story]);

    renderHook(() => useStoriesRealtime(), { wrapper: makeWrapper(qc) });

    act(() => {
      triggerSocketEvent(SERVER_EVENTS.STORY_REACTED, {
        storyId: 'story-1',
        userId: 'user-2',
        emoji: '❤️',
      });
    });

    // Cache should be unchanged
    const stories = qc.getQueryData<Post[]>(['stories', 'feed']);
    expect(stories).toEqual([story]);
  });
});

describe('useStoriesRealtime - onStoryTranslationUpdated', () => {
  it('merges translations into the targeted textObject, preserving existing languages', () => {
    const qc = makeQC();
    const story = makePost({
      id: 'story-1',
      storyEffects: {
        textObjects: [
          { id: 't0', content: 'Bonjour', translations: { en: 'Hi' } },
          { id: 't1', content: 'Monde' },
        ],
      },
    } as Partial<Post>);
    qc.setQueryData(['stories', 'feed'], [story]);

    renderHook(() => useStoriesRealtime(), { wrapper: makeWrapper(qc) });

    act(() => {
      triggerSocketEvent(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, {
        postId: 'story-1',
        textObjectIndex: 0,
        translations: { es: 'Hola', pt: 'Olá' },
      });
    });

    const stories = qc.getQueryData<Post[]>(['stories', 'feed']);
    const effects = stories![0].storyEffects as { textObjects: Array<{ translations?: Record<string, string> }> };
    // New languages merged, pre-existing english preserved.
    expect(effects.textObjects[0].translations).toEqual({ en: 'Hi', es: 'Hola', pt: 'Olá' });
    // Sibling textObject untouched.
    expect(effects.textObjects[1].translations).toBeUndefined();
  });

  it('no-op when postId does not match any cached story', () => {
    const qc = makeQC();
    const story = makePost({
      id: 'story-1',
      storyEffects: { textObjects: [{ id: 't0', content: 'x' }] },
    } as Partial<Post>);
    qc.setQueryData(['stories', 'feed'], [story]);

    renderHook(() => useStoriesRealtime(), { wrapper: makeWrapper(qc) });

    act(() => {
      triggerSocketEvent(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, {
        postId: 'story-99',
        textObjectIndex: 0,
        translations: { es: 'Hola' },
      });
    });

    const stories = qc.getQueryData<Post[]>(['stories', 'feed']);
    expect(stories![0]).toBe(story); // same reference — untouched
  });

  it('no-op when textObjectIndex is out of range', () => {
    const qc = makeQC();
    const story = makePost({
      id: 'story-1',
      storyEffects: { textObjects: [{ id: 't0', content: 'x' }] },
    } as Partial<Post>);
    qc.setQueryData(['stories', 'feed'], [story]);

    renderHook(() => useStoriesRealtime(), { wrapper: makeWrapper(qc) });

    act(() => {
      triggerSocketEvent(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, {
        postId: 'story-1',
        textObjectIndex: 5,
        translations: { es: 'Hola' },
      });
    });

    const stories = qc.getQueryData<Post[]>(['stories', 'feed']);
    expect(stories![0]).toBe(story); // untouched
  });

  it('no-op when the story has no storyEffects.textObjects', () => {
    const qc = makeQC();
    const story = makePost({ id: 'story-1' });
    qc.setQueryData(['stories', 'feed'], [story]);

    renderHook(() => useStoriesRealtime(), { wrapper: makeWrapper(qc) });

    act(() => {
      triggerSocketEvent(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, {
        postId: 'story-1',
        textObjectIndex: 0,
        translations: { es: 'Hola' },
      });
    });

    const stories = qc.getQueryData<Post[]>(['stories', 'feed']);
    expect(stories![0]).toBe(story); // untouched
  });
});

describe('useStoriesRealtime - onStoryDeleted', () => {
  it('removes the deleted story from the feed cache', () => {
    const qc = makeQC();
    qc.setQueryData(['stories', 'feed'], [
      makePost({ id: 'story-1' }),
      makePost({ id: 'story-2' }),
    ]);

    renderHook(() => useStoriesRealtime(), { wrapper: makeWrapper(qc) });

    act(() => {
      triggerSocketEvent(SERVER_EVENTS.STORY_DELETED, {
        storyId: 'story-1',
        authorId: 'user-1',
      });
    });

    const stories = qc.getQueryData<Post[]>(['stories', 'feed']);
    expect(stories!.map(s => s.id)).toEqual(['story-2']);
  });

  it('no-op when the deleted story is not in cache (same reference)', () => {
    const qc = makeQC();
    const list = [makePost({ id: 'story-1' })];
    qc.setQueryData(['stories', 'feed'], list);

    renderHook(() => useStoriesRealtime(), { wrapper: makeWrapper(qc) });

    act(() => {
      triggerSocketEvent(SERVER_EVENTS.STORY_DELETED, {
        storyId: 'story-99',
        authorId: 'user-1',
      });
    });

    expect(qc.getQueryData<Post[]>(['stories', 'feed'])).toBe(list);
  });

  it('no-op when cache is undefined', () => {
    const qc = makeQC();

    renderHook(() => useStoriesRealtime(), { wrapper: makeWrapper(qc) });

    act(() => {
      triggerSocketEvent(SERVER_EVENTS.STORY_DELETED, {
        storyId: 'story-1',
        authorId: 'user-1',
      });
    });

    expect(qc.getQueryData(['stories', 'feed'])).toBeUndefined();
  });
});

describe('useStoriesRealtime - clearNewStories', () => {
  it('resets newStoriesCount to 0', () => {
    const qc = makeQC();
    qc.setQueryData(['stories', 'feed'], []);

    const { result } = renderHook(() => useStoriesRealtime(), { wrapper: makeWrapper(qc) });

    const newStory1 = makePost({ id: 's1' });
    const newStory2 = makePost({ id: 's2' });

    act(() => {
      triggerSocketEvent(SERVER_EVENTS.STORY_CREATED, { story: newStory1 });
      triggerSocketEvent(SERVER_EVENTS.STORY_CREATED, { story: newStory2 });
    });

    expect(result.current.newStoriesCount).toBe(2);

    act(() => {
      result.current.clearNewStories();
    });

    expect(result.current.newStoriesCount).toBe(0);
  });
});
