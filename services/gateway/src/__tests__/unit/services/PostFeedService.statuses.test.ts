/**
 * PostFeedService — getStatuses / getDiscoverStatuses coverage
 * These two methods are completely uncovered by the existing test files.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PostFeedService } from '../../../services/PostFeedService';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

// ── factories ──────────────────────────────────────────────────────────────────

function makeStatus(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    authorId: 'author-1',
    type: 'STATUS',
    visibility: 'PUBLIC',
    content: 'Status content',
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
    expiresAt: null,
    createdAt: new Date('2026-01-01T12:00:00Z'),
    author: { id: 'author-1', username: 'alice', displayName: 'Alice', avatar: null },
    media: [],
    ...overrides,
  };
}

function makePrisma(overrides: Partial<{
  postFindMany: jest.Mock;
  friendRequestFindMany: jest.Mock;
  participantFindMany: jest.Mock;
  communityMemberFindMany: jest.Mock;
}> = {}) {
  return {
    post: {
      findMany: overrides.postFindMany ?? jest.fn<any>().mockResolvedValue([]),
    },
    friendRequest: {
      findMany: overrides.friendRequestFindMany ?? jest.fn<any>().mockResolvedValue([]),
    },
    participant: {
      findMany: overrides.participantFindMany ?? jest.fn<any>().mockResolvedValue([]),
    },
    communityMember: {
      findMany: overrides.communityMemberFindMany ?? jest.fn<any>().mockResolvedValue([]),
    },
  } as any;
}

function makeCache() {
  const store = new Map<string, string>();
  return {
    get: jest.fn<any>().mockImplementation(async (k: string) => store.get(k) ?? null),
    set: jest.fn<any>().mockImplementation(async (k: string, v: string) => { store.set(k, v); }),
  } as any;
}

// ── getStatuses ────────────────────────────────────────────────────────────────

describe('PostFeedService.getStatuses()', () => {
  let service: PostFeedService;
  let mockPostFindMany: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPostFindMany = jest.fn<any>().mockResolvedValue([]);
    const prisma = makePrisma({ postFindMany: mockPostFindMany });
    service = new PostFeedService(prisma, makeCache());
  });

  it('returns empty items when no statuses exist', async () => {
    const result = await service.getStatuses('user-1');

    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('returns items and hasMore=false when fewer than limit', async () => {
    const statuses = [makeStatus('s1'), makeStatus('s2')];
    mockPostFindMany.mockResolvedValue(statuses);

    const result = await service.getStatuses('user-1', undefined, 10);

    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('returns hasMore=true and nextCursor when exactly limit+1 results come back', async () => {
    const statuses = Array.from({ length: 6 }, (_, i) => makeStatus(`s${i}`));
    mockPostFindMany.mockResolvedValue(statuses);

    const result = await service.getStatuses('user-1', undefined, 5);

    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(5);
    expect(result.nextCursor).toBeTruthy();
  });

  it('passes a cursor when provided (WHERE clause includes cursor conditions)', async () => {
    const statuses = Array.from({ length: 6 }, (_, i) =>
      makeStatus(`s${i}`, { createdAt: new Date(`2026-01-0${i + 1}T00:00:00Z`) })
    );
    mockPostFindMany.mockResolvedValue(statuses);

    const first = await service.getStatuses('user-1', undefined, 5);
    expect(first.nextCursor).toBeTruthy();

    // Second call with cursor — prisma.post.findMany WHERE should include cursor clause
    mockPostFindMany.mockResolvedValue([]);
    const second = await service.getStatuses('user-1', first.nextCursor!, 5);

    expect(second.items).toHaveLength(0);
    expect(second.hasMore).toBe(false);

    const secondCallArgs = mockPostFindMany.mock.calls[1][0];
    const andClauses = secondCallArgs?.where?.AND ?? [];
    const hasCursorClause = andClauses.some((c: any) => c?.OR?.[0]?.createdAt?.lt !== undefined);
    expect(hasCursorClause).toBe(true);
  });
});

// ── getDiscoverStatuses ─────────────────────────────────────────────────────────

describe('PostFeedService.getDiscoverStatuses()', () => {
  let service: PostFeedService;
  let mockPostFindMany: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPostFindMany = jest.fn<any>().mockResolvedValue([]);
    const prisma = makePrisma({ postFindMany: mockPostFindMany });
    service = new PostFeedService(prisma, makeCache());
  });

  it('returns empty items when no public statuses exist', async () => {
    const result = await service.getDiscoverStatuses('user-1');

    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('returns items without nextCursor when results < limit', async () => {
    const statuses = [makeStatus('ds1'), makeStatus('ds2')];
    mockPostFindMany.mockResolvedValue(statuses);

    const result = await service.getDiscoverStatuses('user-1', undefined, 10);

    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('returns hasMore=true and nextCursor when limit+1 results returned', async () => {
    const statuses = Array.from({ length: 4 }, (_, i) => makeStatus(`ds${i}`));
    mockPostFindMany.mockResolvedValue(statuses);

    const result = await service.getDiscoverStatuses('user-1', undefined, 3);

    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(3);
    expect(result.nextCursor).toBeTruthy();
  });

  it('calls prisma once (no friend/participant lookups needed)', async () => {
    await service.getDiscoverStatuses('user-1');

    // getDiscoverStatuses doesn't need friendRequest or participant queries
    expect(mockPostFindMany).toHaveBeenCalledTimes(1);
  });

  it('appends cursor WHERE clause when cursor provided', async () => {
    const statuses = Array.from({ length: 4 }, (_, i) =>
      makeStatus(`ds${i}`, { createdAt: new Date(`2026-01-0${i + 1}T00:00:00Z`) })
    );
    mockPostFindMany.mockResolvedValue(statuses);

    const first = await service.getDiscoverStatuses('user-1', undefined, 3);
    expect(first.nextCursor).toBeTruthy();

    mockPostFindMany.mockResolvedValue([]);
    const second = await service.getDiscoverStatuses('user-1', first.nextCursor!, 3);

    expect(second.items).toHaveLength(0);
    // Second call should have cursor conditions in WHERE
    const lastCall = mockPostFindMany.mock.calls[mockPostFindMany.mock.calls.length - 1][0];
    const andClauses = lastCall?.where?.AND ?? [];
    const hasCursorClause = andClauses.some((c: any) => c?.OR?.[0]?.createdAt?.lt !== undefined);
    expect(hasCursorClause).toBe(true);
  });
});
