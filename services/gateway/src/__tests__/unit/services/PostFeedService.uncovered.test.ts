/**
 * Coverage for PostFeedService uncovered paths:
 * - getDiscoverStatuses: no cursor, with cursor (AND clause), hasMore pagination
 * - getDirectConversationContactIds (private): cache hit, empty conversations, contacts dedup, catch
 * - getFriendIds (private): cache hit, sender mapping, receiver mapping, cache write, catch
 * - getReelSeed (private): reel not found (null), DB throws (catch → null)
 * - getSeenPostIds (private): empty postIds array, DB throws (catch → empty Set)
 * - getMentionsByPost (private): empty postIds array, DB throws (catch → empty Map)
 * - getInterestAffinity (private): cache hit, corrupted cache recalc, weights, self-skip, DB catch
 * - getSeenCounts (private): empty postIds, counts Map, _count missing, DB catch
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { PostFeedService } from '../../../services/PostFeedService';

// ── factories ──────────────────────────────────────────────────────────────────

const USER_ID   = '507f1f77bcf86cd799439011';
const POST_ID_1 = '507f1f77bcf86cd799439012';
const POST_ID_2 = '507f1f77bcf86cd799439013';

const makeStatus = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  authorId: 'author-1',
  type: 'STATUS',
  visibility: 'PUBLIC',
  content: 'Hello',
  reactions: [],
  reactionSummary: {},
  reactionCount: 0,
  likeCount: 0,
  commentCount: 0,
  shareCount: 0,
  repostCount: 0,
  viewCount: 0,
  bookmarkCount: 0,
  isPinned: false,
  deletedAt: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  expiresAt: null,
  author: { id: 'author-1', username: 'alice', displayName: 'Alice', avatar: null },
  ...overrides,
});

const makePrisma = () => ({
  post:            { findMany: jest.fn<any>().mockResolvedValue([]), findUnique: jest.fn<any>().mockResolvedValue(null) },
  participant:     { findMany: jest.fn<any>().mockResolvedValue([]) },
  friendRequest:   { findMany: jest.fn<any>().mockResolvedValue([]) },
  postReaction:    { findMany: jest.fn<any>().mockResolvedValue([]) },
  postBookmark:    { findMany: jest.fn<any>().mockResolvedValue([]) },
  postView:        { findMany: jest.fn<any>().mockResolvedValue([]) },
  postMention:     { findMany: jest.fn<any>().mockResolvedValue([]) },
  user:            { findUnique: jest.fn<any>().mockResolvedValue(null) },
  postImpression:  { groupBy: jest.fn<any>().mockResolvedValue([]) },
  communityMember: { findMany: jest.fn<any>().mockResolvedValue([]) },
} as any);

const makeCache = (getReturn: string | null = null) => ({
  get: jest.fn<any>().mockResolvedValue(getReturn),
  set: jest.fn<any>().mockResolvedValue(undefined),
} as any);

const buildCursor = (createdAt: Date, id: string) =>
  Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString('base64url');

// ── getDiscoverStatuses ────────────────────────────────────────────────────────

describe('PostFeedService — getDiscoverStatuses', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: PostFeedService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    service = new PostFeedService(prisma);
  });

  it('returns empty result when no statuses exist', async () => {
    const result = await service.getDiscoverStatuses(USER_ID);

    expect(result).toEqual({ items: [], nextCursor: null, hasMore: false });
  });

  it('returns all items and no cursor when count ≤ limit', async () => {
    prisma.post.findMany.mockResolvedValue([makeStatus(POST_ID_1)]);

    const result = await service.getDiscoverStatuses(USER_ID, undefined, 10);

    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('sets hasMore=true and returns nextCursor when count > limit', async () => {
    prisma.post.findMany.mockResolvedValue([
      makeStatus(POST_ID_1, { createdAt: new Date('2025-01-02T00:00:00Z') }),
      makeStatus(POST_ID_2, { createdAt: new Date('2025-01-01T00:00:00Z') }),
    ]);

    const result = await service.getDiscoverStatuses(USER_ID, undefined, 1);

    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).not.toBeNull();
  });

  it('appends cursor pagination clause to AND array when cursor is provided', async () => {
    const cursor = buildCursor(new Date('2025-01-01T00:00:00Z'), POST_ID_1);
    prisma.post.findMany.mockResolvedValue([makeStatus(POST_ID_2)]);

    await service.getDiscoverStatuses(USER_ID, cursor, 10);

    const callArgs = (prisma.post.findMany.mock.calls[0] as any[])[0] as any;
    expect(callArgs.where.AND.length).toBeGreaterThanOrEqual(2);
    const cursorClause = callArgs.where.AND.find((c: any) => c.OR !== undefined);
    expect(cursorClause).toBeDefined();
  });
});

// ── getDirectConversationContactIds (private) ──────────────────────────────────

describe('PostFeedService — getDirectConversationContactIds (private)', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns cached array immediately on cache hit', async () => {
    const cached = ['u1', 'u2'];
    const prisma = makePrisma();
    const cache = makeCache(JSON.stringify(cached));
    const service = new PostFeedService(prisma, cache);

    const result = await (service as any).getDirectConversationContactIds(USER_ID);

    expect(result).toEqual(cached);
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });

  it('returns [] and caches empty array when user has no direct conversations', async () => {
    const prisma = makePrisma();
    const cache = makeCache(null);
    prisma.participant.findMany.mockResolvedValue([]);
    const service = new PostFeedService(prisma, cache);

    const result = await (service as any).getDirectConversationContactIds(USER_ID);

    expect(result).toEqual([]);
    expect(cache.set).toHaveBeenCalledWith(
      expect.stringContaining(USER_ID),
      '[]',
      expect.any(Number),
    );
  });

  it('returns deduplicated contact IDs from DM conversation members', async () => {
    const prisma = makePrisma();
    const service = new PostFeedService(prisma);
    prisma.participant.findMany
      .mockResolvedValueOnce([{ conversationId: 'conv-1' }])
      .mockResolvedValueOnce([
        { userId: 'contact-a' },
        { userId: 'contact-a' },
        { userId: 'contact-b' },
      ]);

    const result = await (service as any).getDirectConversationContactIds(USER_ID);

    expect(result).toContain('contact-a');
    expect(result).toContain('contact-b');
    expect(result.filter((id: string) => id === 'contact-a')).toHaveLength(1);
  });

  it('returns [] when DB throws (catch path)', async () => {
    const prisma = makePrisma();
    prisma.participant.findMany.mockRejectedValue(new Error('DB error'));
    const service = new PostFeedService(prisma);

    const result = await (service as any).getDirectConversationContactIds(USER_ID);

    expect(result).toEqual([]);
  });

  it('falls through to DB when cache.get rejects', async () => {
    const prisma = makePrisma();
    const cache = { get: jest.fn<any>().mockRejectedValue(new Error('Redis down')), set: jest.fn<any>() } as any;
    prisma.participant.findMany.mockResolvedValue([]);
    const service = new PostFeedService(prisma, cache);

    const result = await (service as any).getDirectConversationContactIds(USER_ID);

    expect(result).toEqual([]);
    expect(prisma.participant.findMany).toHaveBeenCalled();
  });
});

// ── getFriendIds (private) ─────────────────────────────────────────────────────

describe('PostFeedService — getFriendIds (private)', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns cached array immediately on cache hit', async () => {
    const cached = ['friend-x'];
    const prisma = makePrisma();
    const cache = makeCache(JSON.stringify(cached));
    const service = new PostFeedService(prisma, cache);

    const result = await (service as any).getFriendIds(USER_ID);

    expect(result).toEqual(cached);
    expect(prisma.friendRequest.findMany).not.toHaveBeenCalled();
  });

  it('returns receiverId when userId is the sender', async () => {
    const prisma = makePrisma();
    prisma.friendRequest.findMany.mockResolvedValue([{ senderId: USER_ID, receiverId: 'friend-r' }]);
    const service = new PostFeedService(prisma);

    const result = await (service as any).getFriendIds(USER_ID);

    expect(result).toContain('friend-r');
  });

  it('returns senderId when userId is the receiver', async () => {
    const prisma = makePrisma();
    prisma.friendRequest.findMany.mockResolvedValue([{ senderId: 'friend-s', receiverId: USER_ID }]);
    const service = new PostFeedService(prisma);

    const result = await (service as any).getFriendIds(USER_ID);

    expect(result).toContain('friend-s');
  });

  it('writes computed friend IDs to cache', async () => {
    const prisma = makePrisma();
    const cache = makeCache(null);
    prisma.friendRequest.findMany.mockResolvedValue([{ senderId: USER_ID, receiverId: 'friend-c' }]);
    const service = new PostFeedService(prisma, cache);

    await (service as any).getFriendIds(USER_ID);

    expect(cache.set).toHaveBeenCalledWith(
      expect.stringContaining(USER_ID),
      JSON.stringify(['friend-c']),
      expect.any(Number),
    );
  });

  it('returns [] when DB throws (catch path)', async () => {
    const prisma = makePrisma();
    prisma.friendRequest.findMany.mockRejectedValue(new Error('timeout'));
    const service = new PostFeedService(prisma);

    const result = await (service as any).getFriendIds(USER_ID);

    expect(result).toEqual([]);
  });
});

// ── getReelSeed (private) — null and error paths ───────────────────────────────

describe('PostFeedService — getReelSeed (private)', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns null when post.findUnique returns null (reel not found)', async () => {
    const prisma = makePrisma();
    prisma.post.findUnique.mockResolvedValue(null);
    const service = new PostFeedService(prisma);

    const result = await (service as any).getReelSeed('nonexistent-reel');

    expect(result).toBeNull();
  });

  it('returns null when DB throws (catch path)', async () => {
    const prisma = makePrisma();
    prisma.post.findUnique.mockRejectedValue(new Error('DB error'));
    const service = new PostFeedService(prisma);

    const result = await (service as any).getReelSeed('some-reel');

    expect(result).toBeNull();
  });
});

// ── getSeenPostIds (private) — early return and error paths ───────────────────

describe('PostFeedService — getSeenPostIds (private)', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns empty Set without DB call when postIds is empty', async () => {
    const prisma = makePrisma();
    const service = new PostFeedService(prisma);

    const result = await (service as any).getSeenPostIds(USER_ID, []);

    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
    expect(prisma.postView.findMany).not.toHaveBeenCalled();
  });

  it('returns empty Set when DB throws (catch path)', async () => {
    const prisma = makePrisma();
    prisma.postView.findMany.mockRejectedValue(new Error('DB error'));
    const service = new PostFeedService(prisma);

    const result = await (service as any).getSeenPostIds(USER_ID, [POST_ID_1]);

    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });
});

// ── getMentionsByPost (private) — early return and error paths ────────────────

describe('PostFeedService — getMentionsByPost (private)', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns empty Map without DB call when postIds is empty', async () => {
    const prisma = makePrisma();
    const service = new PostFeedService(prisma);

    const result = await (service as any).getMentionsByPost([]);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
    expect(prisma.postMention.findMany).not.toHaveBeenCalled();
  });

  it('returns empty Map when DB throws (catch path)', async () => {
    const prisma = makePrisma();
    prisma.postMention.findMany.mockRejectedValue(new Error('DB error'));
    const service = new PostFeedService(prisma);

    const result = await (service as any).getMentionsByPost([POST_ID_1]);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });
});

// ── getInterestAffinity (private) ─────────────────────────────────────────────

describe('PostFeedService — getInterestAffinity (private)', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns parsed Map immediately on cache hit', async () => {
    const entries: [string, number][] = [['author-x', 0.6]];
    const prisma = makePrisma();
    const cache = makeCache(JSON.stringify(entries));
    const service = new PostFeedService(prisma, cache);

    const result = await (service as any).getInterestAffinity(USER_ID);

    expect(result).toBeInstanceOf(Map);
    expect(result.get('author-x')).toBeCloseTo(0.6);
    expect(prisma.postReaction.findMany).not.toHaveBeenCalled();
  });

  it('recalculates when cached JSON is corrupted (JSON.parse catch)', async () => {
    const prisma = makePrisma();
    const cache = makeCache('NOT_VALID_JSON');
    const service = new PostFeedService(prisma, cache);

    const result = await (service as any).getInterestAffinity(USER_ID);

    expect(prisma.postReaction.findMany).toHaveBeenCalled();
    expect(result).toBeInstanceOf(Map);
  });

  it('returns empty Map when there are no reactions or bookmarks', async () => {
    const prisma = makePrisma();
    const service = new PostFeedService(prisma);

    const result = await (service as any).getInterestAffinity(USER_ID);

    expect(result.size).toBe(0);
  });

  it('skips rows where authorId equals userId (self-interest excluded)', async () => {
    const prisma = makePrisma();
    prisma.postReaction.findMany.mockResolvedValue([{ post: { authorId: USER_ID } }]);
    const service = new PostFeedService(prisma);

    const result = await (service as any).getInterestAffinity(USER_ID);

    expect(result.has(USER_ID)).toBe(false);
  });

  it('skips rows where post or authorId is null', async () => {
    const prisma = makePrisma();
    prisma.postReaction.findMany.mockResolvedValue([
      { post: null },
      { post: { authorId: null } },
    ]);
    const service = new PostFeedService(prisma);

    const result = await (service as any).getInterestAffinity(USER_ID);

    expect(result.size).toBe(0);
  });

  it('computes positive affinity score for reactions (w=1) and bookmarks (w=2)', async () => {
    const AUTHOR = 'a-creator';
    const prisma = makePrisma();
    prisma.postReaction.findMany.mockResolvedValue([{ post: { authorId: AUTHOR } }]);
    prisma.postBookmark.findMany.mockResolvedValue([{ post: { authorId: AUTHOR } }]);
    const service = new PostFeedService(prisma);

    const result = await (service as any).getInterestAffinity(USER_ID);

    const affinity = result.get(AUTHOR) as number;
    expect(affinity).toBeGreaterThan(0);
    expect(affinity).toBeLessThanOrEqual(1);
  });

  it('caches computed affinity in serialised Map form', async () => {
    const AUTHOR = 'cached-author';
    const prisma = makePrisma();
    const cache = makeCache(null);
    prisma.postReaction.findMany.mockResolvedValue([{ post: { authorId: AUTHOR } }]);
    const service = new PostFeedService(prisma, cache);

    await (service as any).getInterestAffinity(USER_ID);

    expect(cache.set).toHaveBeenCalledWith(
      expect.stringContaining(USER_ID),
      expect.stringContaining(AUTHOR),
      expect.any(Number),
    );
  });

  it('returns empty Map when DB throws (catch path)', async () => {
    const prisma = makePrisma();
    prisma.postReaction.findMany.mockRejectedValue(new Error('DB error'));
    const service = new PostFeedService(prisma);

    const result = await (service as any).getInterestAffinity(USER_ID);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });
});

// ── getSeenCounts (private) ────────────────────────────────────────────────────

describe('PostFeedService — getSeenCounts (private)', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns empty Map without DB call when postIds is empty', async () => {
    const prisma = makePrisma();
    const service = new PostFeedService(prisma);

    const result = await (service as any).getSeenCounts(USER_ID, []);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
    expect(prisma.postImpression.groupBy).not.toHaveBeenCalled();
  });

  it('builds Map with impression counts per postId', async () => {
    const prisma = makePrisma();
    prisma.postImpression.groupBy.mockResolvedValue([
      { postId: POST_ID_1, _count: { postId: 3 } },
      { postId: POST_ID_2, _count: { postId: 1 } },
    ]);
    const service = new PostFeedService(prisma);

    const result = await (service as any).getSeenCounts(USER_ID, [POST_ID_1, POST_ID_2]);

    expect(result.get(POST_ID_1)).toBe(3);
    expect(result.get(POST_ID_2)).toBe(1);
  });

  it('defaults count to 0 when _count.postId is missing', async () => {
    const prisma = makePrisma();
    prisma.postImpression.groupBy.mockResolvedValue([{ postId: POST_ID_1, _count: {} }]);
    const service = new PostFeedService(prisma);

    const result = await (service as any).getSeenCounts(USER_ID, [POST_ID_1]);

    expect(result.get(POST_ID_1)).toBe(0);
  });

  it('returns empty Map when DB throws (catch path)', async () => {
    const prisma = makePrisma();
    prisma.postImpression.groupBy.mockRejectedValue(new Error('DB error'));
    const service = new PostFeedService(prisma);

    const result = await (service as any).getSeenCounts(USER_ID, [POST_ID_1]);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });
});

// ── getReels — cursor path (line 398) ────────────────────────────────────────

describe('PostFeedService — getReels cursor path (line 398)', () => {
  afterEach(() => jest.clearAllMocks());

  it('appends cursor OR clause to AND array when cursor is provided', async () => {
    const prisma = makePrisma();
    prisma.post.findMany.mockResolvedValue([]);
    const cursor = buildCursor(new Date('2025-01-01T00:00:00Z'), POST_ID_1);
    const service = new PostFeedService(prisma);

    await service.getReels(USER_ID, { cursor, limit: 10 });

    const call = (prisma.post.findMany.mock.calls[0] as any[])[0] as any;
    const cursorClause = call.where.AND.find((c: any) => c.OR !== undefined);
    expect(cursorClause).toBeDefined();
  });
});

// ── enrichReelsForViewer — empty items early return (line 470) ─────────────

describe('PostFeedService — enrichReelsForViewer empty items (line 470)', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns [] immediately when called with an empty items array', async () => {
    const service = new PostFeedService(makePrisma());
    const result = await (service as any).enrichReelsForViewer([], USER_ID);
    expect(result).toEqual([]);
  });
});

// ── getReelSeed — reel found with mentions (line 536) ────────────────────────

describe('PostFeedService — getReelSeed reel found with mentions (line 536)', () => {
  afterEach(() => jest.clearAllMocks());

  it('builds mentionedUserIds Set from mentions when reel is found', async () => {
    const prisma = makePrisma();
    prisma.post.findUnique.mockResolvedValue({ id: POST_ID_1, authorId: 'author-1', originalLanguage: 'fr' });
    prisma.postMention.findMany.mockResolvedValue([
      { mentionedUserId: 'user-a' },
      { mentionedUserId: 'user-b' },
    ]);
    const service = new PostFeedService(prisma);

    const result = await (service as any).getReelSeed(POST_ID_1);

    expect(result).not.toBeNull();
    expect(result.mentionedUserIds).toBeInstanceOf(Set);
    expect(result.mentionedUserIds.has('user-a')).toBe(true);
    expect(result.mentionedUserIds.has('user-b')).toBe(true);
  });
});

// ── getMentionsByPost — with actual mentions returned ─────────────────────────

describe('PostFeedService — getMentionsByPost — mention accumulation (lines 567-569)', () => {
  afterEach(() => jest.clearAllMocks());

  it('accumulates mentionedUserIds per postId in the result Map', async () => {
    const prisma = makePrisma();
    prisma.postMention.findMany.mockResolvedValue([
      { postId: POST_ID_1, mentionedUserId: 'u1' },
      { postId: POST_ID_1, mentionedUserId: 'u2' },
      { postId: POST_ID_2, mentionedUserId: 'u3' },
    ]);
    const service = new PostFeedService(prisma);

    const result = await (service as any).getMentionsByPost([POST_ID_1, POST_ID_2]);

    expect(result.get(POST_ID_1)).toEqual(['u1', 'u2']);
    expect(result.get(POST_ID_2)).toEqual(['u3']);
  });
});

// ── affinityScore — all three branches ───────────────────────────────────────

describe('PostFeedService — affinityScore (lines 845-846)', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns 0.8 when authorId === viewerId (self-affinity)', () => {
    const service = new PostFeedService(makePrisma());
    const score = (service as any).affinityScore(USER_ID, USER_ID, []);
    expect(score).toBe(0.8);
  });

  it('returns 0.5 when authorId is in friendIds (friend affinity)', () => {
    const FRIEND = 'friend-user';
    const service = new PostFeedService(makePrisma());
    const score = (service as any).affinityScore(FRIEND, USER_ID, [FRIEND]);
    expect(score).toBe(0.5);
  });

  it('returns 0 when authorId is neither viewer nor friend (stranger)', () => {
    const service = new PostFeedService(makePrisma());
    const score = (service as any).affinityScore('stranger', USER_ID, ['friend-a']);
    expect(score).toBe(0);
  });
});

// ── getFeed — cursor path (line 103) ──────────────────────────────────────────

describe('PostFeedService — getFeed cursor path (line 103)', () => {
  afterEach(() => jest.clearAllMocks());

  it('appends cursor AND clause when cursor is provided', async () => {
    const prisma = makePrisma();
    const post = makeStatus(POST_ID_1, { type: 'POST' });
    prisma.post.findMany.mockResolvedValue([post]);
    prisma.postReaction.findMany.mockResolvedValue([]);
    const cursor = buildCursor(new Date('2025-01-01T00:00:00Z'), POST_ID_1);
    const service = new PostFeedService(prisma);

    await service.getFeed(USER_ID, cursor, 10);

    const call = (prisma.post.findMany.mock.calls[0] as any[])[0] as any;
    expect(call.where.AND).toBeDefined();
    expect(call.where.AND.length).toBeGreaterThanOrEqual(1);
  });
});

// ── getFeed — userBookmarks callback coverage (line 200) ─────────────────────

describe('PostFeedService — getFeed bookmark map callback (line 200)', () => {
  afterEach(() => jest.clearAllMocks());

  it('populates isBookmarkedByMe when postBookmark returns a result', async () => {
    const prisma = makePrisma();
    const post = makeStatus(POST_ID_1, { type: 'POST' });
    prisma.post.findMany.mockResolvedValue([post]);
    prisma.postReaction.findMany.mockResolvedValue([]);
    prisma.postBookmark.findMany.mockResolvedValue([{ postId: POST_ID_1 }]);
    const service = new PostFeedService(prisma);

    const result = await service.getFeed(USER_ID, undefined, 10);

    expect((result.items[0] as any).isBookmarkedByMe).toBe(true);
  });
});

// ── getStories — viewedRows callback coverage (line 254) ─────────────────────

describe('PostFeedService — getStories viewedSet callback (line 254)', () => {
  afterEach(() => jest.clearAllMocks());

  it('marks story as viewed when postView returns a matching entry', async () => {
    const prisma = makePrisma();
    const story = makeStatus(POST_ID_1, { type: 'STORY', expiresAt: null });
    prisma.post.findMany.mockResolvedValue([story]);
    prisma.postView.findMany.mockResolvedValue([{ postId: POST_ID_1 }]);
    prisma.postReaction.findMany.mockResolvedValue([]);
    const service = new PostFeedService(prisma);

    const result = await service.getStories(USER_ID);

    expect((result[0] as any).isViewedByMe).toBe(true);
  });
});

// ── getUserPosts — cursor path (line 592) ─────────────────────────────────────

describe('PostFeedService — getUserPosts cursor path (line 592)', () => {
  afterEach(() => jest.clearAllMocks());

  it('appends cursor OR clause when cursor is provided', async () => {
    const prisma = makePrisma();
    const post = makeStatus(POST_ID_1, { type: 'POST', authorId: USER_ID });
    prisma.post.findMany.mockResolvedValue([post]);
    prisma.postReaction.findMany.mockResolvedValue([]);
    const cursor = buildCursor(new Date('2025-01-01T00:00:00Z'), POST_ID_1);
    const service = new PostFeedService(prisma);

    await service.getUserPosts(USER_ID, USER_ID, cursor, 10);

    const call = (prisma.post.findMany.mock.calls[0] as any[])[0] as any;
    expect(call.where.OR).toBeDefined();
  });
});

// ── getCommunityFeed — cursor path (line 658) ─────────────────────────────────

describe('PostFeedService — getCommunityFeed cursor path (line 658)', () => {
  afterEach(() => jest.clearAllMocks());

  it('appends cursor OR clause when cursor is provided', async () => {
    const prisma = makePrisma();
    const post = makeStatus(POST_ID_1, { type: 'POST' });
    prisma.post.findMany.mockResolvedValue([post]);
    prisma.postReaction.findMany.mockResolvedValue([]);
    const cursor = buildCursor(new Date('2025-01-01T00:00:00Z'), POST_ID_1);
    const service = new PostFeedService(prisma);

    await service.getCommunityFeed('community-1', USER_ID, cursor, 10);

    const call = (prisma.post.findMany.mock.calls[0] as any[])[0] as any;
    expect(call.where.OR).toBeDefined();
  });
});

// ── getBookmarks — cursor path (line 713) ─────────────────────────────────────

describe('PostFeedService — getBookmarks cursor path (line 713)', () => {
  afterEach(() => jest.clearAllMocks());

  it('appends cursor OR clause when cursor is provided', async () => {
    const prisma = makePrisma();
    prisma.postBookmark.findMany.mockResolvedValue([]);
    const cursor = buildCursor(new Date('2025-01-01T00:00:00Z'), POST_ID_1);
    const service = new PostFeedService(prisma);

    await service.getBookmarks(USER_ID, cursor, 10);

    const call = (prisma.postBookmark.findMany.mock.calls[0] as any[])[0] as any;
    expect(call.where.OR).toBeDefined();
  });
});

// ── getDirectConversationContactIds — cache.set rejection (lines 788, 801) ───

describe('PostFeedService — getDirectConversationContactIds cache.set rejection', () => {
  afterEach(() => jest.clearAllMocks());

  it('swallows cache.set rejection when contacts list is empty (line 788)', async () => {
    const prisma = makePrisma();
    const cache = {
      get: jest.fn<any>().mockResolvedValue(null),
      set: jest.fn<any>().mockRejectedValue(new Error('Redis write error')),
    } as any;
    prisma.participant.findMany.mockResolvedValue([]);
    const service = new PostFeedService(prisma, cache);

    const result = await (service as any).getDirectConversationContactIds(USER_ID);

    expect(result).toEqual([]);
    expect(cache.set).toHaveBeenCalled();
  });

  it('swallows cache.set rejection when contacts are found (line 801)', async () => {
    const prisma = makePrisma();
    const cache = {
      get: jest.fn<any>().mockResolvedValue(null),
      set: jest.fn<any>().mockRejectedValue(new Error('Redis write error')),
    } as any;
    prisma.participant.findMany
      .mockResolvedValueOnce([{ conversationId: 'conv-1' }])
      .mockResolvedValueOnce([{ userId: 'contact-a' }]);
    const service = new PostFeedService(prisma, cache);

    const result = await (service as any).getDirectConversationContactIds(USER_ID);

    expect(result).toContain('contact-a');
    expect(cache.set).toHaveBeenCalled();
  });
});

// ── getFriendIds — cache.get rejection (line 811) ────────────────────────────

describe('PostFeedService — getFriendIds cache.get rejection (line 811)', () => {
  afterEach(() => jest.clearAllMocks());

  it('falls through to DB when cache.get rejects', async () => {
    const prisma = makePrisma();
    const cache = {
      get: jest.fn<any>().mockRejectedValue(new Error('Redis read error')),
      set: jest.fn<any>().mockResolvedValue(undefined),
    } as any;
    prisma.friendRequest.findMany.mockResolvedValue([{ senderId: USER_ID, receiverId: 'friend-1' }]);
    const service = new PostFeedService(prisma, cache);

    const result = await (service as any).getFriendIds(USER_ID);

    expect(result).toContain('friend-1');
    expect(prisma.friendRequest.findMany).toHaveBeenCalled();
  });

  it('swallows cache.set rejection when friends are found (line 829)', async () => {
    const prisma = makePrisma();
    const cache = {
      get: jest.fn<any>().mockResolvedValue(null),
      set: jest.fn<any>().mockRejectedValue(new Error('Redis write error')),
    } as any;
    prisma.friendRequest.findMany.mockResolvedValue([{ senderId: USER_ID, receiverId: 'friend-1' }]);
    const service = new PostFeedService(prisma, cache);

    const result = await (service as any).getFriendIds(USER_ID);

    expect(result).toContain('friend-1');
    expect(cache.set).toHaveBeenCalled();
  });
});

// ── getInterestAffinity — cache.get rejection (line 864) ─────────────────────

describe('PostFeedService — getInterestAffinity cache.get rejection (line 864)', () => {
  afterEach(() => jest.clearAllMocks());

  it('falls through to DB when cache.get rejects (line 864 catch)', async () => {
    const prisma = makePrisma();
    const cache = {
      get: jest.fn<any>().mockRejectedValue(new Error('Redis read error')),
      set: jest.fn<any>().mockResolvedValue(undefined),
    } as any;
    prisma.postReaction.findMany.mockResolvedValue([]);
    prisma.postBookmark.findMany.mockResolvedValue([]);
    const service = new PostFeedService(prisma, cache);

    const result = await (service as any).getInterestAffinity(USER_ID);

    expect(result).toBeInstanceOf(Map);
    expect(prisma.postReaction.findMany).toHaveBeenCalled();
  });

  it('swallows cache.set rejection when affinity is computed (line 909)', async () => {
    const AUTHOR = 'creator-1';
    const prisma = makePrisma();
    const cache = {
      get: jest.fn<any>().mockResolvedValue(null),
      set: jest.fn<any>().mockRejectedValue(new Error('Redis write error')),
    } as any;
    prisma.postReaction.findMany.mockResolvedValue([{ post: { authorId: AUTHOR } }]);
    prisma.postBookmark.findMany.mockResolvedValue([]);
    const service = new PostFeedService(prisma, cache);

    const result = await (service as any).getInterestAffinity(USER_ID);

    expect(result.get(AUTHOR)).toBeGreaterThan(0);
    expect(cache.set).toHaveBeenCalled();
  });
});
