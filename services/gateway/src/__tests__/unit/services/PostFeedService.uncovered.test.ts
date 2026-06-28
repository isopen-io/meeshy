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
