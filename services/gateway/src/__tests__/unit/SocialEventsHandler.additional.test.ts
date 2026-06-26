/**
 * Additional coverage for SocialEventsHandler
 * Covers branches not reached by SocialEventsHandler.test.ts:
 *  - broadcastStoryUpdated
 *  - broadcastStoryDeleted
 *  - broadcastStatusUpdated
 *  - broadcastStatusDeleted (with non-PUBLIC visibility)
 *  - broadcastPostTranslationUpdated
 *  - getFriendIds cache eviction when size >= 500
 *  - getVisibilityFilteredRecipients default (unknown visibility) branch
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { SocialEventsHandler } from '../../socketio/handlers/SocialEventsHandler';
import type { Post, PostTranslationUpdatedEventData } from '@meeshy/shared/types/post';

jest.mock('../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

// ── factories ────────────────────────────────────────────────────────────────

function createIO() {
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  return { to, emit };
}

function createPrisma() {
  return {
    friendRequest: {
      findMany: jest.fn<any>().mockResolvedValue([
        { senderId: 'author-1', receiverId: 'friend-1' },
        { senderId: 'friend-2', receiverId: 'author-1' },
      ]),
    },
    communityMember: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
  } as any;
}

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    authorId: 'author-1',
    type: 'POST',
    visibility: 'PUBLIC',
    content: 'hello',
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    shareCount: 0,
    isPinned: false,
    isEdited: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Post;
}

const AUTHOR_ID = 'author-1';
const FRIEND_1 = 'friend-1';
const FRIEND_2 = 'friend-2';

// ── tests ────────────────────────────────────────────────────────────────────

describe('SocialEventsHandler — additional coverage', () => {
  let handler: SocialEventsHandler;
  let mockIO: ReturnType<typeof createIO>;
  let mockPrisma: ReturnType<typeof createPrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIO = createIO();
    mockPrisma = createPrisma();
    handler = new SocialEventsHandler({ io: mockIO as any, prisma: mockPrisma });
  });

  // ── broadcastStoryUpdated ─────────────────────────────────────────────────

  it('broadcastStoryUpdated emits STORY_UPDATED to friends and author', async () => {
    const story = makePost({ id: 'story-1', type: 'STORY' });
    await handler.broadcastStoryUpdated(story, AUTHOR_ID);

    expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(FRIEND_1));
    expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(FRIEND_2));
    expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(AUTHOR_ID));
    expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.STORY_UPDATED, { story });
  });

  it('broadcastStoryUpdated with PRIVATE story reaches only the author', async () => {
    const story = makePost({ type: 'STORY', visibility: 'PRIVATE' });
    await handler.broadcastStoryUpdated(story, AUTHOR_ID);

    expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(AUTHOR_ID));
    expect(mockIO.to).not.toHaveBeenCalledWith(ROOMS.feed(FRIEND_1));
  });

  // ── broadcastStoryDeleted ─────────────────────────────────────────────────

  it('broadcastStoryDeleted emits STORY_DELETED to all friends and author', async () => {
    await handler.broadcastStoryDeleted('story-99', AUTHOR_ID);

    expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.STORY_DELETED, {
      storyId: 'story-99',
      authorId: AUTHOR_ID,
    });
    expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(FRIEND_1));
    expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(FRIEND_2));
    expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(AUTHOR_ID));
  });

  // ── broadcastStatusUpdated ────────────────────────────────────────────────

  it('broadcastStatusUpdated emits STATUS_UPDATED to friends and author', async () => {
    const status = makePost({ id: 'status-1', type: 'STATUS' });
    await handler.broadcastStatusUpdated(status, AUTHOR_ID);

    expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.STATUS_UPDATED, { status });
    expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(AUTHOR_ID));
  });

  // ── broadcastStatusDeleted ────────────────────────────────────────────────

  it('broadcastStatusDeleted (PUBLIC) emits to friends and author', async () => {
    await handler.broadcastStatusDeleted('status-1', AUTHOR_ID, 'PUBLIC');

    expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.STATUS_DELETED, {
      statusId: 'status-1',
      authorId: AUTHOR_ID,
    });
    expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(FRIEND_1));
  });

  it('broadcastStatusDeleted with PRIVATE visibility reaches only the author', async () => {
    await handler.broadcastStatusDeleted('status-1', AUTHOR_ID, 'PRIVATE', []);

    expect(mockIO.to).toHaveBeenCalledTimes(1);
    expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(AUTHOR_ID));
    expect(mockIO.to).not.toHaveBeenCalledWith(ROOMS.feed(FRIEND_1));
  });

  it('broadcastStatusDeleted with ONLY visibility reaches allowed user and author', async () => {
    await handler.broadcastStatusDeleted('status-1', AUTHOR_ID, 'ONLY', [FRIEND_1]);

    const calledRooms = mockIO.to.mock.calls.map((c: any[]) => c[0]);
    expect(calledRooms).toContain(ROOMS.feed(FRIEND_1));
    expect(calledRooms).not.toContain(ROOMS.feed(FRIEND_2));
  });

  it('broadcastStatusDeleted with EXCEPT visibility excludes the listed user', async () => {
    await handler.broadcastStatusDeleted('status-1', AUTHOR_ID, 'EXCEPT', [FRIEND_1]);

    const calledRooms = mockIO.to.mock.calls.map((c: any[]) => c[0]);
    expect(calledRooms).not.toContain(ROOMS.feed(FRIEND_1));
    expect(calledRooms).toContain(ROOMS.feed(FRIEND_2));
  });

  // ── broadcastPostTranslationUpdated ──────────────────────────────────────

  it('broadcastPostTranslationUpdated emits to friends and author', async () => {
    const data: PostTranslationUpdatedEventData = {
      postId: 'post-1',
      language: 'fr',
      translation: { text: 'Bonjour', translationModel: 'nllb', createdAt: new Date().toISOString() },
    };

    await handler.broadcastPostTranslationUpdated(data, AUTHOR_ID);

    expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.POST_TRANSLATION_UPDATED, data);
    expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(AUTHOR_ID));
  });

  // ── getVisibilityFilteredRecipients — default (unknown) branch ────────────

  it('unknown visibility falls back to friend list (default switch branch)', async () => {
    const post = makePost({ visibility: 'UNKNOWN_VISIBILITY' as any });
    await handler.broadcastPostCreated(post, AUTHOR_ID);

    const calledRooms = mockIO.to.mock.calls.map((c: any[]) => c[0]);
    expect(calledRooms).toContain(ROOMS.feed(FRIEND_1));
    expect(calledRooms).toContain(ROOMS.feed(FRIEND_2));
    expect(calledRooms).toContain(ROOMS.feed(AUTHOR_ID));
  });

  // ── getFriendIds cache eviction (size >= 500) ─────────────────────────────

  it('getFriendIds evicts expired entries and then drops the oldest when cache reaches 500', async () => {
    const CACHE_TTL_MS = 30_000;
    const cache = (handler as any).friendsCache as Map<string, { ids: string[]; expiresAt: number }>;

    const now = Date.now();

    // Fill cache with 499 fresh entries
    for (let i = 0; i < 499; i++) {
      cache.set(`user-${i}`, { ids: [], expiresAt: now + CACHE_TTL_MS });
    }

    // Add 1 expired entry to trigger the clean-sweep path
    cache.set('user-expired', { ids: [], expiresAt: now - 1 });

    // Now cache.size === 500 before the next getFriendIds call
    expect(cache.size).toBe(500);

    // This call triggers the eviction logic (size >= 500)
    const post = makePost();
    await handler.broadcastPostCreated(post, 'new-user');

    // The expired entry should have been evicted; the new entry should be stored
    expect(cache.has('new-user')).toBe(true);
  });

  it('getFriendIds drops the oldest entry when cache is full and no entries have expired', async () => {
    const CACHE_TTL_MS = 30_000;
    const cache = (handler as any).friendsCache as Map<string, { ids: string[]; expiresAt: number }>;

    const now = Date.now();

    // Fill cache with exactly 500 fresh (non-expired) entries
    for (let i = 0; i < 500; i++) {
      cache.set(`user-${i}`, { ids: [], expiresAt: now + CACHE_TTL_MS });
    }

    expect(cache.size).toBe(500);

    // Adding another user should force eviction of the first entry
    const firstKey = cache.keys().next().value;
    await handler.broadcastPostCreated(makePost(), 'overflow-user');

    // First entry should be gone; new entry should be present
    expect(cache.has(firstKey)).toBe(false);
    expect(cache.has('overflow-user')).toBe(true);
  });
});
