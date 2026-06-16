/**
 * Tests — PostService.recordEngagementBatch + POST /posts/engagement/batch
 *
 * Couvre l'ingestion idempotente (upsert sur sessionId), le skip-and-continue
 * sur post supprimé, le cap défensif des durées, et l'agrégation dénormalisée
 * (incréments UNIQUEMENT à l'INSERT — jamais aux updates/retries).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostService } from '../services/PostService';

const POST_A = '507f1f77bcf86cd799439011';
const POST_B = '507f1f77bcf86cd799439012';

const mkSession = (over: Partial<Record<string, unknown>> = {}) => ({
  sessionId: '11111111-1111-1111-1111-111111111111',
  userId: 'u1',
  postId: POST_A,
  contentType: 'POST',
  surface: 'detail',
  startedAt: '2026-06-14T00:00:00.000Z',
  dwellMs: 4000,
  completed: false,
  truncated: false,
  actions: [] as unknown[],
  watchSamples: [] as unknown[],
  ...over,
});

type UpsertResult = { created: boolean };

const buildPrisma = (overrides: Partial<Record<string, unknown>> = {}) => {
  const post = {
    findFirst: jest.fn<(arg?: unknown) => Promise<{ id: string; authorId: string } | null>>()
      .mockResolvedValue({ id: POST_A, authorId: 'author' }),
    update: jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue({}),
  };
  // findUnique signals insert-vs-update: null = INSERT (drives denormalized counters),
  // non-null = UPDATE (lost-ACK retry, no counter change).
  const postEngagement = {
    upsert: jest.fn<(arg?: unknown) => Promise<UpsertResult>>().mockResolvedValue({ created: true }),
    findUnique: jest.fn<(arg?: unknown) => Promise<{ id: string } | null>>().mockResolvedValue(null),
  };
  const prisma = {
    post,
    postEngagement,
    $transaction: jest.fn(async (fn: unknown) => {
      if (typeof fn === 'function') return (fn as (tx: unknown) => unknown)(prisma);
      return Promise.all(fn as Promise<unknown>[]);
    }),
    ...overrides,
  };
  return prisma as unknown as ConstructorParameters<typeof PostService>[0] & {
    post: typeof post;
    postEngagement: typeof postEngagement;
  };
};

describe('PostService.recordEngagementBatch — ingestion', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: PostService;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new PostService(prisma);
  });

  const upsertArg = (i = 0) =>
    prisma.postEngagement.upsert.mock.calls[i][0] as {
      where: { sessionId: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };

  it('upserts each session by sessionId', async () => {
    const n = await service.recordEngagementBatch([mkSession()], 'u1');
    expect(n).toBe(1);
    expect(prisma.postEngagement.upsert).toHaveBeenCalledTimes(1);
    expect(upsertArg().where).toEqual({
      sessionId: '11111111-1111-1111-1111-111111111111',
    });
  });

  it('persists the route userId, never the client-supplied userId', async () => {
    await service.recordEngagementBatch([mkSession({ userId: 'spoofed' })], 'u1');
    const arg = upsertArg();
    expect(arg.create.userId).toBe('u1');
    expect(arg.update.userId).toBe('u1');
  });

  it('skips a session whose post no longer exists, continues the batch', async () => {
    prisma.post.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: POST_B, authorId: 'author' });
    const n = await service.recordEngagementBatch(
      [mkSession({ sessionId: 'a', postId: POST_A }),
       mkSession({ sessionId: 'b', postId: POST_B })],
      'u1',
    );
    expect(n).toBe(1);
    expect(prisma.postEngagement.upsert).toHaveBeenCalledTimes(1);
  });

  it('caps dwellMs at 300000 defensively', async () => {
    await service.recordEngagementBatch([mkSession({ dwellMs: 999999 })], 'u1');
    expect(upsertArg().create.dwellMs).toBe(300000);
  });

  it('caps watchMs at 300000 defensively', async () => {
    await service.recordEngagementBatch([mkSession({ watchMs: 999999 })], 'u1');
    expect(upsertArg().create.watchMs).toBe(300000);
  });

  it('does not throw the whole batch when one row upsert fails', async () => {
    prisma.postEngagement.upsert
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ created: true });
    const n = await service.recordEngagementBatch(
      [mkSession({ sessionId: 'a' }), mkSession({ sessionId: 'b', postId: POST_B })],
      'u1',
    );
    expect(n).toBe(1);
  });
});

describe('PostService.recordEngagementBatch — agrégation dénormalisée (INSERT only)', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: PostService;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new PostService(prisma);
  });

  const lastUpdateData = () => {
    const calls = prisma.post.update.mock.calls;
    return calls.length ? (calls[calls.length - 1][0] as { data: Record<string, unknown> }).data : undefined;
  };

  it('increments postOpenCount on a NEW reels-surface session', async () => {
    await service.recordEngagementBatch(
      [mkSession({ contentType: 'REEL', surface: 'reels', dwellMs: 1000 })],
      'u1',
    );
    expect(lastUpdateData()).toMatchObject({ postOpenCount: { increment: 1 } });
  });

  it('increments postOpenCount on a NEW detail-surface session (page Detail counts too)', async () => {
    await service.recordEngagementBatch(
      [mkSession({ surface: 'detail', dwellMs: 1000 })],
      'u1',
    );
    expect(lastUpdateData()).toMatchObject({ postOpenCount: { increment: 1 } });
  });

  it('does NOT increment postOpenCount on an ephemeral surface (story/status)', async () => {
    await service.recordEngagementBatch(
      [mkSession({ contentType: 'STORY', surface: 'storyViewer', dwellMs: 1000 })],
      'u1',
    );
    const data = lastUpdateData() ?? {};
    expect(data).not.toHaveProperty('postOpenCount');
  });

  it('does NOT increment any counter on an UPDATE (lost-ACK retry)', async () => {
    // findUnique returns an existing row → the session already landed → UPDATE path.
    prisma.postEngagement.findUnique.mockResolvedValueOnce({ id: 'existing' });
    await service.recordEngagementBatch(
      [mkSession({ contentType: 'REEL', surface: 'reels' })],
      'u1',
    );
    expect(prisma.post.update).not.toHaveBeenCalled();
  });

  it('adds playCount by the number of completions (watchSamples-derived completed)', async () => {
    await service.recordEngagementBatch(
      [mkSession({ contentType: 'REEL', surface: 'reels', completed: true })],
      'u1',
    );
    expect(lastUpdateData()).toMatchObject({ playCount: { increment: 1 } });
  });

  it('marks a qualified view when watchMs >= 2500 (video/audio dwell-agnostic)', async () => {
    await service.recordEngagementBatch(
      [mkSession({ contentType: 'REEL', surface: 'reels', watchMs: 2500, mediaDurationMs: 60000, dwellMs: 0 })],
      'u1',
    );
    expect(lastUpdateData()).toMatchObject({ qualifiedViewCount: { increment: 1 } });
  });

  it('marks a qualified view at 30% position for a LONG video (>= 8300ms)', async () => {
    await service.recordEngagementBatch(
      [mkSession({
        contentType: 'REEL', surface: 'reels', watchMs: 0, dwellMs: 0,
        mediaDurationMs: 20000,
        watchSamples: [{ positionMs: 6000, atMs: 1000 }],
      })],
      'u1',
    );
    expect(lastUpdateData()).toMatchObject({ qualifiedViewCount: { increment: 1 } });
  });

  it('does NOT mark a qualified view below 30% for a LONG video', async () => {
    await service.recordEngagementBatch(
      [mkSession({
        contentType: 'REEL', surface: 'reels', watchMs: 0, dwellMs: 0,
        mediaDurationMs: 20000,
        watchSamples: [{ positionMs: 4000, atMs: 1000 }],
      })],
      'u1',
    );
    const data = lastUpdateData() ?? {};
    expect(data).not.toHaveProperty('qualifiedViewCount');
  });

  it('requires 90% position for a SHORT video (< 8300ms)', async () => {
    await service.recordEngagementBatch(
      [mkSession({
        contentType: 'REEL', surface: 'reels', watchMs: 0, dwellMs: 0,
        mediaDurationMs: 5000,
        watchSamples: [{ positionMs: 4600, atMs: 1000 }],
      })],
      'u1',
    );
    expect(lastUpdateData()).toMatchObject({ qualifiedViewCount: { increment: 1 } });
  });

  it('marks a qualified view for a DIRECT post when dwellMs >= 2500', async () => {
    await service.recordEngagementBatch(
      [mkSession({ contentType: 'POST', surface: 'detail', dwellMs: 2500 })],
      'u1',
    );
    expect(lastUpdateData()).toMatchObject({ qualifiedViewCount: { increment: 1 } });
  });

  it('does NOT mark a qualified view for a DIRECT post below 2500ms', async () => {
    await service.recordEngagementBatch(
      [mkSession({ contentType: 'POST', surface: 'detail', dwellMs: 2000 })],
      'u1',
    );
    const data = lastUpdateData() ?? {};
    expect(data).not.toHaveProperty('qualifiedViewCount');
  });
});
