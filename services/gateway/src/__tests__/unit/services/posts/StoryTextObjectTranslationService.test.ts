/**
 * StoryTextObjectTranslationService Unit Tests
 *
 * @jest-environment node
 */

// Mock logger BEFORE all imports — called at module load time
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

// Mock communityVisibility to control getCommunityCoMemberIds
jest.mock('../../../../services/posts/communityVisibility', () => ({
  getCommunityCoMemberIds: jest.fn().mockResolvedValue([]),
}));

import { describe, it, expect, beforeEach } from '@jest/globals';
import { StoryTextObjectTranslationService } from '../../../../services/posts/StoryTextObjectTranslationService';
import { getCommunityCoMemberIds } from '../../../../services/posts/communityVisibility';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getCommunityCoMemberIdsMock = getCommunityCoMemberIds as jest.Mock;

type HandleParams = {
  postId: string;
  textObjectIndex: number;
  translations: Record<string, string>;
};

function makeHandleParams(overrides: Partial<HandleParams> = {}): HandleParams {
  return {
    postId: 'post-story-1',
    textObjectIndex: 0,
    translations: { en: 'Hello', es: 'Hola' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockPostFindUnique: jest.Mock;
let mockCommunityMemberFindMany: jest.Mock;
let mockCommunityMemberFindFirst: jest.Mock;
let mockFriendRequestFindMany: jest.Mock;
let mockRunCommandRaw: jest.Mock;
let mockIoEmit: jest.Mock;
let mockIoTo: jest.Mock;

function makeMocks() {
  mockPostFindUnique = jest.fn().mockResolvedValue(null);
  mockCommunityMemberFindMany = jest.fn().mockResolvedValue([]);
  mockCommunityMemberFindFirst = jest.fn().mockResolvedValue(null);
  mockFriendRequestFindMany = jest.fn().mockResolvedValue([]);
  mockRunCommandRaw = jest.fn().mockResolvedValue({ ok: 1 });
  mockIoEmit = jest.fn();
  mockIoTo = jest.fn().mockReturnValue({ emit: mockIoEmit });
}

function makePrisma(): PrismaClient {
  return {
    post: { findUnique: mockPostFindUnique },
    communityMember: {
      findMany: mockCommunityMemberFindMany,
      findFirst: mockCommunityMemberFindFirst,
    },
    friendRequest: { findMany: mockFriendRequestFindMany },
    $runCommandRaw: mockRunCommandRaw,
  } as unknown as PrismaClient;
}

function makeIo() {
  return { to: mockIoTo };
}

function initService() {
  return StoryTextObjectTranslationService.init(makePrisma(), makeIo() as never);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  makeMocks();
  getCommunityCoMemberIdsMock.mockResolvedValue([]);
  // Reset singleton
  (StoryTextObjectTranslationService as unknown as { _shared: null })._shared = null;
});

// ---------------------------------------------------------------------------
// handleTranslationCompleted — validation
// ---------------------------------------------------------------------------

describe('StoryTextObjectTranslationService.handleTranslationCompleted: validation', () => {
  it('returns early when post not found (no persist, no emit)', async () => {
    mockPostFindUnique.mockResolvedValue(null);
    const service = initService();

    await service.handleTranslationCompleted(makeHandleParams());

    expect(mockRunCommandRaw).not.toHaveBeenCalled();
    expect(mockIoTo).not.toHaveBeenCalled();
  });

  it('returns early when textObjectIndex is negative', async () => {
    mockPostFindUnique.mockResolvedValue({
      authorId: 'author-1',
      visibility: 'PUBLIC',
      visibilityUserIds: [],
    });
    const service = initService();

    await service.handleTranslationCompleted(makeHandleParams({ textObjectIndex: -1 }));

    expect(mockRunCommandRaw).not.toHaveBeenCalled();
  });

  it('returns early when textObjectIndex is a float', async () => {
    mockPostFindUnique.mockResolvedValue({
      authorId: 'author-1',
      visibility: 'PUBLIC',
      visibilityUserIds: [],
    });
    const service = initService();

    await service.handleTranslationCompleted(makeHandleParams({ textObjectIndex: 1.5 }));

    expect(mockRunCommandRaw).not.toHaveBeenCalled();
  });

  it('returns early when textObjectIndex exceeds 1000', async () => {
    mockPostFindUnique.mockResolvedValue({
      authorId: 'author-1',
      visibility: 'PUBLIC',
      visibilityUserIds: [],
    });
    const service = initService();

    await service.handleTranslationCompleted(makeHandleParams({ textObjectIndex: 1001 }));

    expect(mockRunCommandRaw).not.toHaveBeenCalled();
  });

  it('allows textObjectIndex of exactly 0', async () => {
    mockPostFindUnique.mockResolvedValue({
      authorId: 'author-1',
      visibility: 'PUBLIC',
      visibilityUserIds: [],
    });
    const service = initService();

    await service.handleTranslationCompleted(makeHandleParams({ textObjectIndex: 0 }));

    expect(mockRunCommandRaw).toHaveBeenCalled();
  });

  it('allows textObjectIndex of exactly 1000', async () => {
    mockPostFindUnique.mockResolvedValue({
      authorId: 'author-1',
      visibility: 'PUBLIC',
      visibilityUserIds: [],
    });
    const service = initService();

    await service.handleTranslationCompleted(makeHandleParams({ textObjectIndex: 1000 }));

    expect(mockRunCommandRaw).toHaveBeenCalled();
  });

  it('skips malformed language codes that do not match [a-z]{2,5}', async () => {
    mockPostFindUnique.mockResolvedValue({
      authorId: 'author-1',
      visibility: 'PUBLIC',
      visibilityUserIds: [],
    });
    const service = initService();

    // All provided langs are malformed — setFields should be empty, so returns early
    await service.handleTranslationCompleted(
      makeHandleParams({ translations: { 'a.b': 'Bad lang', 'EN': 'Uppercase', '123': 'Numeric' } }),
    );

    expect(mockRunCommandRaw).not.toHaveBeenCalled();
  });

  it('accepts valid 2-char lang code', async () => {
    mockPostFindUnique.mockResolvedValue({
      authorId: 'author-1',
      visibility: 'PUBLIC',
      visibilityUserIds: [],
    });
    const service = initService();

    await service.handleTranslationCompleted(makeHandleParams({ translations: { fr: 'Bonjour' } }));

    expect(mockRunCommandRaw).toHaveBeenCalled();
  });

  it('accepts valid 5-char lang code', async () => {
    mockPostFindUnique.mockResolvedValue({
      authorId: 'author-1',
      visibility: 'PUBLIC',
      visibilityUserIds: [],
    });
    const service = initService();

    await service.handleTranslationCompleted(makeHandleParams({ translations: { frfra: 'Test' } }));

    expect(mockRunCommandRaw).toHaveBeenCalled();
  });

  it('filters out bad lang codes but processes valid ones', async () => {
    mockPostFindUnique.mockResolvedValue({
      authorId: 'author-1',
      visibility: 'PUBLIC',
      visibilityUserIds: [],
    });
    const service = initService();

    await service.handleTranslationCompleted(
      makeHandleParams({ translations: { en: 'Hello', 'a.b': 'Bad', es: 'Hola' } }),
    );

    expect(mockRunCommandRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        updates: expect.arrayContaining([
          expect.objectContaining({
            u: expect.objectContaining({
              $set: expect.objectContaining({
                'storyEffects.textObjects.0.translations.en': 'Hello',
                'storyEffects.textObjects.0.translations.es': 'Hola',
              }),
            }),
          }),
        ]),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// handleTranslationCompleted — success path
// ---------------------------------------------------------------------------

describe('StoryTextObjectTranslationService.handleTranslationCompleted: success path', () => {
  it('persists translations using correct MongoDB dot-notation path', async () => {
    mockPostFindUnique.mockResolvedValue({
      authorId: 'author-1',
      visibility: 'PUBLIC',
      visibilityUserIds: [],
    });
    const service = initService();

    await service.handleTranslationCompleted({
      postId: 'post-story-1',
      textObjectIndex: 2,
      translations: { en: 'Hello', fr: 'Bonjour' },
    });

    expect(mockRunCommandRaw).toHaveBeenCalledWith({
      update: 'Post',
      updates: [{
        q: { _id: { $oid: 'post-story-1' } },
        u: {
          $set: {
            'storyEffects.textObjects.2.translations.en': 'Hello',
            'storyEffects.textObjects.2.translations.fr': 'Bonjour',
          },
        },
      }],
    });
  });

  it('broadcasts to author feed room after persisting', async () => {
    mockPostFindUnique.mockResolvedValue({
      authorId: 'author-1',
      visibility: 'PUBLIC',
      visibilityUserIds: [],
    });
    const service = initService();

    await service.handleTranslationCompleted(makeHandleParams());

    expect(mockIoTo).toHaveBeenCalledWith(ROOMS.feed('author-1'));
    expect(mockIoEmit).toHaveBeenCalledWith(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, {
      postId: 'post-story-1',
      textObjectIndex: 0,
      translations: { en: 'Hello', es: 'Hola' },
    });
  });

  it('does not throw when $runCommandRaw fails', async () => {
    mockPostFindUnique.mockResolvedValue({
      authorId: 'author-1',
      visibility: 'PUBLIC',
      visibilityUserIds: [],
    });
    mockRunCommandRaw.mockRejectedValue(new Error('MongoDB failure'));
    const service = initService();

    await expect(service.handleTranslationCompleted(makeHandleParams())).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveBroadcastRecipients — via handleTranslationCompleted
// ---------------------------------------------------------------------------

describe('StoryTextObjectTranslationService: resolveBroadcastRecipients (via handleTranslationCompleted)', () => {
  async function runWithVisibility(
    visibility: string,
    visibilityUserIds: string[] = [],
    authorId = 'author-1',
  ) {
    mockPostFindUnique.mockResolvedValue({ authorId, visibility, visibilityUserIds });
    const service = initService();
    await service.handleTranslationCompleted(makeHandleParams());
  }

  it('ONLY visibility: broadcasts to author + specified users only', async () => {
    await runWithVisibility('ONLY', ['user-2', 'user-3']);

    const roomCalls = mockIoTo.mock.calls.map((c: unknown[]) => c[0]);
    expect(roomCalls).toContain(ROOMS.feed('author-1'));
    expect(roomCalls).toContain(ROOMS.feed('user-2'));
    expect(roomCalls).toContain(ROOMS.feed('user-3'));
    expect(roomCalls).toHaveLength(3);
  });

  it('ONLY visibility: no friend lookup performed', async () => {
    await runWithVisibility('ONLY', ['user-2']);

    expect(mockFriendRequestFindMany).not.toHaveBeenCalled();
  });

  it('COMMUNITY visibility: broadcasts to community co-members', async () => {
    getCommunityCoMemberIdsMock.mockResolvedValue(['member-1', 'member-2']);
    await runWithVisibility('COMMUNITY');

    const roomCalls = mockIoTo.mock.calls.map((c: unknown[]) => c[0]);
    expect(roomCalls).toContain(ROOMS.feed('author-1'));
    expect(roomCalls).toContain(ROOMS.feed('member-1'));
    expect(roomCalls).toContain(ROOMS.feed('member-2'));
  });

  it('COMMUNITY visibility: no friend lookup performed', async () => {
    getCommunityCoMemberIdsMock.mockResolvedValue(['member-1']);
    await runWithVisibility('COMMUNITY');

    expect(mockFriendRequestFindMany).not.toHaveBeenCalled();
  });

  it('FRIENDS visibility: broadcasts to author + accepted friends', async () => {
    mockFriendRequestFindMany.mockResolvedValue([
      { senderId: 'author-1', receiverId: 'friend-1' },
      { senderId: 'friend-2', receiverId: 'author-1' },
    ]);
    await runWithVisibility('FRIENDS');

    const roomCalls = mockIoTo.mock.calls.map((c: unknown[]) => c[0]);
    expect(roomCalls).toContain(ROOMS.feed('author-1'));
    expect(roomCalls).toContain(ROOMS.feed('friend-1'));
    expect(roomCalls).toContain(ROOMS.feed('friend-2'));
  });

  it('PUBLIC visibility: broadcasts to author + all friends (same as FRIENDS lookup)', async () => {
    mockFriendRequestFindMany.mockResolvedValue([
      { senderId: 'author-1', receiverId: 'friend-a' },
    ]);
    await runWithVisibility('PUBLIC');

    const roomCalls = mockIoTo.mock.calls.map((c: unknown[]) => c[0]);
    expect(roomCalls).toContain(ROOMS.feed('author-1'));
    expect(roomCalls).toContain(ROOMS.feed('friend-a'));
  });

  it('EXCEPT visibility: excludes specified users from friend list', async () => {
    mockFriendRequestFindMany.mockResolvedValue([
      { senderId: 'author-1', receiverId: 'friend-1' },
      { senderId: 'friend-2', receiverId: 'author-1' },
      { senderId: 'friend-3', receiverId: 'author-1' },
    ]);
    await runWithVisibility('EXCEPT', ['friend-2']);

    const roomCalls = mockIoTo.mock.calls.map((c: unknown[]) => c[0]);
    expect(roomCalls).toContain(ROOMS.feed('author-1'));
    expect(roomCalls).toContain(ROOMS.feed('friend-1'));
    expect(roomCalls).toContain(ROOMS.feed('friend-3'));
    expect(roomCalls).not.toContain(ROOMS.feed('friend-2'));
  });

  it('friend lookup error degrades to author-only broadcast', async () => {
    mockFriendRequestFindMany.mockRejectedValue(new Error('DB error'));
    await runWithVisibility('FRIENDS');

    const roomCalls = mockIoTo.mock.calls.map((c: unknown[]) => c[0]);
    expect(roomCalls).toEqual([ROOMS.feed('author-1')]);
  });

  it('deduplicates recipients when friend appears in both senderId and receiverId sides', async () => {
    mockFriendRequestFindMany.mockResolvedValue([
      { senderId: 'author-1', receiverId: 'friend-1' },
      { senderId: 'author-1', receiverId: 'friend-1' }, // duplicate
    ]);
    await runWithVisibility('FRIENDS');

    const roomCalls = mockIoTo.mock.calls.map((c: unknown[]) => c[0]) as string[];
    const feedCalls = roomCalls.filter((r) => r === ROOMS.feed('friend-1'));
    // Due to Set deduplication in recipients, friend-1 should only be emitted once
    expect(feedCalls).toHaveLength(1);
  });

  it('author is always included even with ONLY and empty userIds', async () => {
    await runWithVisibility('ONLY', []);

    const roomCalls = mockIoTo.mock.calls.map((c: unknown[]) => c[0]);
    expect(roomCalls).toContain(ROOMS.feed('author-1'));
    expect(roomCalls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

describe('StoryTextObjectTranslationService singleton', () => {
  it('throws when accessing shared before init', () => {
    (StoryTextObjectTranslationService as unknown as { _shared: null })._shared = null;
    expect(() => StoryTextObjectTranslationService.shared).toThrow(
      'StoryTextObjectTranslationService not initialized',
    );
  });

  it('returns the initialized instance via shared', () => {
    const a = initService();
    const b = StoryTextObjectTranslationService.shared;
    expect(a).toBe(b);
  });
});
