/**
 * MentionService — uncovered branches (iter coverage)
 *
 * Covers:
 *  - resolveMentionedUsers: empty contents, no mentions, mentions found, null displayName
 *  - extractMentionsWithParticipants: raw @username (unresolved) branch, max mentions break
 *
 * @jest-environment node
 */

jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: jest.fn().mockReturnValue({
    get: jest.fn<any>().mockResolvedValue(null),
    set: jest.fn<any>().mockResolvedValue(undefined),
    del: jest.fn<any>().mockResolvedValue(undefined),
    keys: jest.fn<any>().mockResolvedValue([]),
    setnx: jest.fn<any>().mockResolvedValue(true),
    expire: jest.fn<any>().mockResolvedValue(true),
    isAvailable: jest.fn<any>().mockReturnValue(true),
  }),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>(() => ({
      info:  jest.fn<any>(),
      warn:  jest.fn<any>(),
      error: jest.fn<any>(),
      debug: jest.fn<any>(),
    })),
  },
}));

jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    user: {
      findMany:  jest.fn<any>(),
      findUnique: jest.fn<any>(),
    },
    conversation:  { findUnique: jest.fn<any>() },
    participant:   { findMany: jest.fn<any>(), findFirst: jest.fn<any>() },
    friendRequest: { findMany: jest.fn<any>() },
    mention:       { create: jest.fn<any>(), findMany: jest.fn<any>() },
    commentMention: { create: jest.fn<any>() },
    postMention:   { create: jest.fn<any>() },
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { MentionService, resolveMentionedUsers } from '../../../services/MentionService';

// ── shared fixtures ───────────────────────────────────────────────────────────

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-001',
  username: 'alice',
  displayName: 'Alice Martin',
  firstName: 'Alice',
  lastName: 'Martin',
  avatar: null,
  ...overrides,
});

// ── resolveMentionedUsers ─────────────────────────────────────────────────────

describe('resolveMentionedUsers', () => {
  let prisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();
  });

  it('returns [] when contents array is empty', async () => {
    const result = await resolveMentionedUsers(prisma, []);
    expect(result).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('returns [] when no content has @mentions', async () => {
    const result = await resolveMentionedUsers(prisma, ['hello world', 'no mentions here']);
    expect(result).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('returns [] when content is an empty string (falsy skip)', async () => {
    const result = await resolveMentionedUsers(prisma, ['']);
    expect(result).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('returns [] when no users match the mentioned usernames', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    const result = await resolveMentionedUsers(prisma, ['@unknownuser hello']);
    expect(result).toEqual([]);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
  });

  it('resolves mentions from content and maps to MentionedUser', async () => {
    const user = makeUser({ displayName: 'Alice Martin' });
    prisma.user.findMany.mockResolvedValue([user]);

    const result = await resolveMentionedUsers(prisma, ['hey @alice how are you?']);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      userId: 'user-001',
      username: 'alice',
      displayName: 'Alice Martin',
      avatar: null,
    });
  });

  it('deduplicates the same username across multiple content strings', async () => {
    const user = makeUser();
    prisma.user.findMany.mockResolvedValue([user]);

    const result = await resolveMentionedUsers(prisma, ['@alice first', '@alice second']);

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    const callArg = (prisma.user.findMany.mock.calls as any[][])[0][0];
    expect(callArg.where.username.in).toEqual(['alice']);
  });

  it('builds displayName from firstName+lastName when displayName is null', async () => {
    const user = makeUser({ displayName: null, firstName: 'Bob', lastName: 'Dupont' });
    prisma.user.findMany.mockResolvedValue([user]);

    const result = await resolveMentionedUsers(prisma, ['@alice hello']);

    expect(result[0].displayName).toBe('Bob Dupont');
  });

  it('sets displayName to null when displayName is null and both name parts are empty', async () => {
    const user = makeUser({ displayName: null, firstName: '', lastName: '' });
    prisma.user.findMany.mockResolvedValue([user]);

    const result = await resolveMentionedUsers(prisma, ['@alice hello']);

    expect(result[0].displayName).toBeNull();
  });

  it('extracts multiple distinct usernames from one string', async () => {
    const alice = makeUser({ id: 'u1', username: 'alice' });
    const bob = makeUser({ id: 'u2', username: 'bob', displayName: 'Bob' });
    prisma.user.findMany.mockResolvedValue([alice, bob]);

    const result = await resolveMentionedUsers(prisma, ['@alice and @bob are here']);

    expect(result).toHaveLength(2);
  });
});

// ── extractMentionsWithParticipants — raw @username branch ────────────────────

describe('MentionService.extractMentionsWithParticipants — unresolved @username (line 208)', () => {
  let service: MentionService;

  beforeEach(() => {
    jest.clearAllMocks();
    const prisma = new PrismaClient();
    service = new MentionService(prisma);
  });

  it('handles a raw @username when no participants are provided (unresolved path)', () => {
    // parseMentions('@alice hello', []) returns ['@alice'] (raw, unresolved)
    // → result.startsWith('@') === true → lines 208-211 execute
    const usernames = service.extractMentionsWithParticipants('@alice hello', []);
    expect(usernames).toContain('alice');
  });

  it('lowercases the raw username', () => {
    const usernames = service.extractMentionsWithParticipants('@Alice hello', []);
    expect(usernames).toContain('alice');
  });

  it('deduplicates the same raw @username appearing twice', () => {
    const usernames = service.extractMentionsWithParticipants('@alice @alice again', []);
    expect(usernames.filter((u) => u === 'alice')).toHaveLength(1);
  });
});

// ── extractMentionsWithParticipants — max mentions break ─────────────────────

describe('MentionService.extractMentionsWithParticipants — max mentions limit (line 222)', () => {
  let service: MentionService;

  beforeEach(() => {
    jest.clearAllMocks();
    const prisma = new PrismaClient();
    service = new MentionService(prisma);
  });

  it('stops at the max mentions limit when overridden to 1', () => {
    // Override private readonly to keep the test fast (default is 50)
    (service as any).MAX_MENTIONS_PER_MESSAGE = 1;

    const usernames = service.extractMentionsWithParticipants('@alice @bob @charlie', []);

    expect(usernames).toHaveLength(1);
  });
});

// ── getUserSuggestionsForConversation — extra branches ────────────────────────

describe('MentionService.getUserSuggestionsForConversation — extra branches', () => {
  let service: MentionService;
  let prisma: any;

  const CONV_ID = 'conv-001';
  const USER_ME = 'user-me';

  const makeUserData = (id: string, username: string) => ({
    id,
    username,
    displayName: username,
    firstName: username,
    lastName: 'Test',
    avatar: null,
    lastActiveAt: null,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();
  });

  it('throws when friendships fetch rejects (lines 380-381)', async () => {
    service = new MentionService(prisma);
    prisma.participant.findMany.mockResolvedValue([]);
    prisma.friendRequest.findMany.mockRejectedValue(new Error('DB error'));

    await expect(
      service.getUserSuggestionsForConversation(CONV_ID, USER_ME, '')
    ).rejects.toThrow('DB error');
  });

  it('adds friend when receiverId === currentUserId (lines 392-394)', async () => {
    service = new MentionService(prisma);
    prisma.participant.findMany.mockResolvedValue([]);
    prisma.friendRequest.findMany.mockResolvedValue([
      {
        senderId: 'friend-001',
        receiverId: USER_ME,
        sender: makeUserData('friend-001', 'bob'),
        receiver: null,
      },
    ]);

    const result = await service.getUserSuggestionsForConversation(CONV_ID, USER_ME, '');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('friend-001');
    expect(result[0].badge).toBe('friend');
  });

  it('skips duplicate conversation member via addedUserIds (line 418)', async () => {
    service = new MentionService(prisma);
    const member = { user: makeUserData('member-001', 'alice') };
    prisma.participant.findMany.mockResolvedValue([member, member]);
    prisma.friendRequest.findMany.mockResolvedValue([]);

    const result = await service.getUserSuggestionsForConversation(CONV_ID, USER_ME, '');
    expect(result).toHaveLength(1);
  });

  it('skips friend who does not match query (line 445)', async () => {
    service = new MentionService(prisma);
    prisma.participant.findMany.mockResolvedValue([]);
    prisma.friendRequest.findMany.mockResolvedValue([
      {
        senderId: USER_ME,
        receiverId: 'friend-001',
        receiver: makeUserData('friend-001', 'charlie'),
        sender: null,
      },
    ]);
    prisma.user.findMany.mockResolvedValue([]);

    const result = await service.getUserSuggestionsForConversation(CONV_ID, USER_ME, 'alice');
    expect(result).toHaveLength(0);
  });

  it('returns early when MAX_SUGGESTIONS reached inside friends loop (lines 461-462)', async () => {
    service = new MentionService(prisma);
    (service as any).MAX_SUGGESTIONS = 1;

    prisma.participant.findMany.mockResolvedValue([]);
    prisma.friendRequest.findMany.mockResolvedValue([
      {
        senderId: USER_ME,
        receiverId: 'friend-a',
        receiver: makeUserData('friend-a', 'friend_a'),
        sender: null,
      },
      {
        senderId: USER_ME,
        receiverId: 'friend-b',
        receiver: makeUserData('friend-b', 'friend_b'),
        sender: null,
      },
    ]);

    const result = await service.getUserSuggestionsForConversation(CONV_ID, USER_ME, '');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('friend-a');
  });
});

// ── getUserSuggestionsForPost — extra branches ────────────────────────────────

describe('MentionService.getUserSuggestionsForPost — extra branches', () => {
  let service: MentionService;
  let prisma: any;

  const POST_ID = 'post-001';
  const USER_ME = 'user-me';
  const AUTHOR_ID = 'author-001';

  const makeUser = (id: string, username: string) => ({
    id,
    username,
    displayName: username,
    firstName: username,
    lastName: 'Test',
    avatar: null,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();
    prisma.post = { findUnique: jest.fn<any>() };
    prisma.postComment = { findMany: jest.fn<any>() };
    service = new MentionService(prisma);
  });

  it('returns early when MAX_SUGGESTIONS reached after author (line 602)', async () => {
    (service as any).MAX_SUGGESTIONS = 1;
    prisma.post.findUnique.mockResolvedValue({
      id: POST_ID,
      authorId: AUTHOR_ID,
      deletedAt: null,
      author: makeUser(AUTHOR_ID, 'author'),
    });
    prisma.postComment.findMany.mockResolvedValue([]);
    prisma.friendRequest.findMany.mockResolvedValue([]);

    const result = await service.getUserSuggestionsForPost(POST_ID, USER_ME, '');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(AUTHOR_ID);
  });

  it('skips comment with no author (line 629)', async () => {
    prisma.post.findUnique.mockResolvedValue({
      id: POST_ID,
      authorId: USER_ME,
      deletedAt: null,
      author: makeUser(USER_ME, 'me'),
    });
    prisma.postComment.findMany.mockResolvedValue([
      { authorId: 'other', author: null },
    ]);
    prisma.friendRequest.findMany.mockResolvedValue([]);

    const result = await service.getUserSuggestionsForPost(POST_ID, USER_ME, '');
    expect(result).toHaveLength(0);
  });

  it('skips comment author who does not match query (line 631)', async () => {
    prisma.post.findUnique.mockResolvedValue({
      id: POST_ID,
      authorId: USER_ME,
      deletedAt: null,
      author: makeUser(USER_ME, 'me'),
    });
    prisma.postComment.findMany.mockResolvedValue([
      { authorId: 'charlie', author: makeUser('charlie', 'charlie') },
    ]);
    prisma.friendRequest.findMany.mockResolvedValue([]);

    const result = await service.getUserSuggestionsForPost(POST_ID, USER_ME, 'alice');
    expect(result).toHaveLength(0);
  });

  it('skips friendship when friend is null (line 686)', async () => {
    prisma.post.findUnique.mockResolvedValue({
      id: POST_ID,
      authorId: USER_ME,
      deletedAt: null,
      author: makeUser(USER_ME, 'me'),
    });
    prisma.postComment.findMany.mockResolvedValue([]);
    prisma.friendRequest.findMany.mockResolvedValue([
      { senderId: USER_ME, receiverId: 'ghost', receiver: null, sender: null },
    ]);

    const result = await service.getUserSuggestionsForPost(POST_ID, USER_ME, '');
    expect(result).toHaveLength(0);
  });

  it('skips friend already in suggestions (line 687)', async () => {
    prisma.post.findUnique.mockResolvedValue({
      id: POST_ID,
      authorId: AUTHOR_ID,
      deletedAt: null,
      author: makeUser(AUTHOR_ID, 'author'),
    });
    prisma.postComment.findMany.mockResolvedValue([]);
    prisma.friendRequest.findMany.mockResolvedValue([
      {
        senderId: USER_ME,
        receiverId: AUTHOR_ID,
        receiver: makeUser(AUTHOR_ID, 'author'),
        sender: null,
      },
    ]);

    const result = await service.getUserSuggestionsForPost(POST_ID, USER_ME, '');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(AUTHOR_ID);
  });

  it('skips friend whose id equals currentUserId (line 688)', async () => {
    prisma.post.findUnique.mockResolvedValue({
      id: POST_ID,
      authorId: AUTHOR_ID,
      deletedAt: null,
      author: makeUser(AUTHOR_ID, 'author'),
    });
    prisma.postComment.findMany.mockResolvedValue([]);
    prisma.friendRequest.findMany.mockResolvedValue([
      {
        senderId: USER_ME,
        receiverId: USER_ME,
        receiver: makeUser(USER_ME, 'me'),
        sender: null,
      },
    ]);

    const result = await service.getUserSuggestionsForPost(POST_ID, USER_ME, '');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(AUTHOR_ID);
  });

  it('skips friend who does not match query (line 689)', async () => {
    prisma.post.findUnique.mockResolvedValue({
      id: POST_ID,
      authorId: USER_ME,
      deletedAt: null,
      author: makeUser(USER_ME, 'me'),
    });
    prisma.postComment.findMany.mockResolvedValue([]);
    prisma.friendRequest.findMany.mockResolvedValue([
      {
        senderId: USER_ME,
        receiverId: 'charlie',
        receiver: makeUser('charlie', 'charlie'),
        sender: null,
      },
    ]);

    const result = await service.getUserSuggestionsForPost(POST_ID, USER_ME, 'alice');
    expect(result).toHaveLength(0);
  });

  it('returns early when MAX_SUGGESTIONS reached in friends loop (line 703)', async () => {
    (service as any).MAX_SUGGESTIONS = 1;
    prisma.post.findUnique.mockResolvedValue({
      id: POST_ID,
      authorId: USER_ME,
      deletedAt: null,
      author: makeUser(USER_ME, 'me'),
    });
    prisma.postComment.findMany.mockResolvedValue([]);
    prisma.friendRequest.findMany.mockResolvedValue([
      {
        senderId: USER_ME,
        receiverId: 'friend-a',
        receiver: makeUser('friend-a', 'fa'),
        sender: null,
      },
      {
        senderId: USER_ME,
        receiverId: 'friend-b',
        receiver: makeUser('friend-b', 'fb'),
        sender: null,
      },
    ]);

    const result = await service.getUserSuggestionsForPost(POST_ID, USER_ME, '');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('friend-a');
  });
});
