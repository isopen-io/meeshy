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
import { postCounterWritesOf } from './helpers/posts-counter-writes';

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

/** La ligne `PostEngagement` telle que la base la rend après l'écriture de `session`. */
const storedRowOf = (session: ReturnType<typeof mkSession>) => ({
  surface: session.surface,
  contentType: session.contentType,
  dwellMs: session.dwellMs,
  watchMs: (session as { watchMs?: number }).watchMs ?? null,
  mediaDurationMs: (session as { mediaDurationMs?: number }).mediaDurationMs ?? null,
  completed: session.completed,
  actions: session.actions,
  watchSamples: session.watchSamples,
});

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
    findUnique: jest.fn<(arg?: unknown) => Promise<({ id: string } & Record<string, unknown>) | null>>().mockResolvedValue(null),
    // Une AUTRE session du même lecteur sur le même post, créée juste avant — aucune par défaut.
    findFirst: jest.fn<(arg?: unknown) => Promise<{ id: string } | null>>().mockResolvedValue(null),
  };
  const $runCommandRaw = jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue({ ok: 1 });
  const prisma = {
    post,
    postEngagement,
    $runCommandRaw,
    $transaction: jest.fn(async (fn: unknown) => {
      if (typeof fn === 'function') return (fn as (tx: unknown) => unknown)(prisma);
      return Promise.all(fn as Promise<unknown>[]);
    }),
    ...overrides,
  };
  return prisma as unknown as ConstructorParameters<typeof PostService>[0] & {
    post: typeof post;
    postEngagement: typeof postEngagement;
    $runCommandRaw: typeof $runCommandRaw;
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
    const n = await service.recordEngagementBatch([mkSession()], 'u1', 'granted');
    expect(n).toBe(1);
    expect(prisma.postEngagement.upsert).toHaveBeenCalledTimes(1);
    // La clé de session vient du client : la ligne n'est la sienne que sous SON identité.
    expect(upsertArg().where).toEqual({
      sessionId: '11111111-1111-1111-1111-111111111111',
      userId: 'u1',
    });
  });

  it('une session de lecture a une durée de conservation : 25 mois (760 jours) par défaut (décision porteur, #10510)', async () => {
    const saved = process.env.RAW_READING_RETENTION_DAYS;
    delete process.env.RAW_READING_RETENTION_DAYS;
    try {
      const before = Date.now();
      await service.recordEngagementBatch([mkSession()], 'u1', 'granted');
      const expiresAt = upsertArg().create.expiresAt as Date;

      expect(expiresAt).toBeInstanceOf(Date);
      expect(Math.round((expiresAt.getTime() - before) / 86_400_000)).toBe(760);
      // Une mise à jour (rejeu d'un ACK perdu) ne prolonge pas la conservation.
      expect(upsertArg().update.expiresAt).toBeUndefined();
    } finally {
      if (saved === undefined) delete process.env.RAW_READING_RETENTION_DAYS;
      else process.env.RAW_READING_RETENTION_DAYS = saved;
    }
  });

  it('la durée de conservation d’une session suit RAW_READING_RETENTION_DAYS', async () => {
    const saved = process.env.RAW_READING_RETENTION_DAYS;
    process.env.RAW_READING_RETENTION_DAYS = '120';
    try {
      const before = Date.now();
      await service.recordEngagementBatch([mkSession()], 'u1', 'granted');
      const expiresAt = upsertArg().create.expiresAt as Date;

      expect(Math.round((expiresAt.getTime() - before) / 86_400_000)).toBe(120);
    } finally {
      if (saved === undefined) delete process.env.RAW_READING_RETENTION_DAYS;
      else process.env.RAW_READING_RETENTION_DAYS = saved;
    }
  });

  it('persists the route userId, never the client-supplied userId', async () => {
    await service.recordEngagementBatch([mkSession({ userId: 'spoofed' })], 'u1', 'granted');
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
      'granted',
    );
    expect(n).toBe(1);
    expect(prisma.postEngagement.upsert).toHaveBeenCalledTimes(1);
  });

  it('caps dwellMs at 300000 defensively', async () => {
    await service.recordEngagementBatch([mkSession({ dwellMs: 999999 })], 'u1', 'granted');
    expect(upsertArg().create.dwellMs).toBe(300000);
  });

  it('caps watchMs at 300000 defensively', async () => {
    await service.recordEngagementBatch([mkSession({ watchMs: 999999 })], 'u1', 'granted');
    expect(upsertArg().create.watchMs).toBe(300000);
  });

  it('does not throw the whole batch when one row upsert fails', async () => {
    prisma.postEngagement.upsert
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ created: true });
    const n = await service.recordEngagementBatch(
      [mkSession({ sessionId: 'a' }), mkSession({ sessionId: 'b', postId: POST_B })],
      'u1',
      'granted',
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
    const writes = postCounterWritesOf(prisma.$runCommandRaw);
    return writes.length ? writes[writes.length - 1].data : undefined;
  };

  it('increments postOpenCount on a NEW reels-surface session', async () => {
    await service.recordEngagementBatch(
      [mkSession({ contentType: 'REEL', surface: 'reels', dwellMs: 1000 })],
      'u1',
      'granted',
    );
    expect(lastUpdateData()).toMatchObject({ postOpenCount: { increment: 1 } });
  });

  it('does NOT increment postOpenCount on a detail-surface session (Detail counts its open immediately via /impression?source=detail)', async () => {
    await service.recordEngagementBatch(
      [mkSession({ surface: 'detail', dwellMs: 1000 })],
      'u1',
      'granted',
    );
    // dwell < 2.5s → no qualified view either → no counters touched at all.
    const data = lastUpdateData() ?? {};
    expect(data).not.toHaveProperty('postOpenCount');
  });

  it('still increments qualifiedViewCount on a qualifying detail-surface session (dwell tracking preserved)', async () => {
    await service.recordEngagementBatch(
      [mkSession({ surface: 'detail', dwellMs: 4000 })],
      'u1',
      'granted',
    );
    const data = lastUpdateData() ?? {};
    expect(data).toMatchObject({ qualifiedViewCount: { increment: 1 } });
    expect(data).not.toHaveProperty('postOpenCount');
  });

  it('does NOT increment postOpenCount on an ephemeral surface (story/status)', async () => {
    await service.recordEngagementBatch(
      [mkSession({ contentType: 'STORY', surface: 'storyViewer', dwellMs: 1000 })],
      'u1',
      'granted',
    );
    const data = lastUpdateData() ?? {};
    expect(data).not.toHaveProperty('postOpenCount');
  });

  it('does NOT increment any counter on an UPDATE (lost-ACK retry)', async () => {
    // findUnique returns the row already stored → the session already landed → UPDATE path.
    const session = mkSession({ contentType: 'REEL', surface: 'reels' });
    prisma.postEngagement.findUnique.mockResolvedValueOnce({ id: 'existing', ...storedRowOf(session) });
    await service.recordEngagementBatch([session], 'u1', 'granted');
    expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
  });

  it('adds playCount by the number of completions (watchSamples-derived completed)', async () => {
    await service.recordEngagementBatch(
      [mkSession({ contentType: 'REEL', surface: 'reels', completed: true })],
      'u1',
      'granted',
    );
    expect(lastUpdateData()).toMatchObject({ playCount: { increment: 1 } });
  });

  it('marks a qualified view when watchMs >= 2500 (video/audio dwell-agnostic)', async () => {
    await service.recordEngagementBatch(
      [mkSession({ contentType: 'REEL', surface: 'reels', watchMs: 2500, mediaDurationMs: 60000, dwellMs: 0 })],
      'u1',
      'granted',
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
      'granted',
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
      'granted',
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
      'granted',
    );
    expect(lastUpdateData()).toMatchObject({ qualifiedViewCount: { increment: 1 } });
  });

  it('marks a qualified view for a DIRECT post when dwellMs >= 2500', async () => {
    await service.recordEngagementBatch(
      [mkSession({ contentType: 'POST', surface: 'detail', dwellMs: 2500 })],
      'u1',
      'granted',
    );
    expect(lastUpdateData()).toMatchObject({ qualifiedViewCount: { increment: 1 } });
  });

  it('does NOT mark a qualified view for a DIRECT post below 2500ms', async () => {
    await service.recordEngagementBatch(
      [mkSession({ contentType: 'POST', surface: 'detail', dwellMs: 2000 })],
      'u1',
      'granted',
    );
    const data = lastUpdateData() ?? {};
    expect(data).not.toHaveProperty('qualifiedViewCount');
  });
});

/**
 * #10764 — le PREMIER CONTACT part tout de suite, la MESURE RICHE ensuite, sous
 * la MÊME clé de session. La passerelle fusionne (jamais en dessous de ce
 * qu'elle a déjà) et ne crédite que ce que la fusion ajoute : chaque compteur
 * une fois par session, quel que soit l'ordre d'arrivée.
 */
describe('PostService.recordEngagementBatch — premier contact puis mesure (#10764)', () => {
  const REEL_START = mkSession({ contentType: 'REEL', surface: 'reels', dwellMs: 0 });
  const REEL_END = mkSession({
    contentType: 'REEL', surface: 'reels', dwellMs: 9000, watchMs: 9000, mediaDurationMs: 9000, completed: true,
    watchSamples: [{ positionMs: 8800, atMs: 8800 }],
  });

  const counterWrites = (prisma: ReturnType<typeof buildPrisma>) =>
    postCounterWritesOf(prisma.$runCommandRaw).map((write) => write.data);

  it('le premier contact d’un réel compte son ouverture tout de suite', async () => {
    const prisma = buildPrisma();
    await new PostService(prisma).recordEngagementBatch([REEL_START], 'u1', 'granted');

    expect(counterWrites(prisma)).toEqual([{ postOpenCount: { increment: 1 } }]);
  });

  it('la mesure qui suit le premier contact crédite la lecture et la vue qualifiée, jamais une seconde ouverture', async () => {
    const prisma = buildPrisma();
    prisma.postEngagement.findUnique.mockResolvedValueOnce({ id: 'existing', ...storedRowOf(REEL_START) });

    await new PostService(prisma).recordEngagementBatch([REEL_END], 'u1', 'granted');

    expect(counterWrites(prisma)).toEqual([{ playCount: { increment: 1 }, qualifiedViewCount: { increment: 1 } }]);
  });

  it('un premier contact rejoué APRÈS la mesure ne crédite rien et ne fait pas reculer la ligne', async () => {
    const prisma = buildPrisma();
    prisma.postEngagement.findUnique.mockResolvedValueOnce({ id: 'existing', ...storedRowOf(REEL_END) });

    await new PostService(prisma).recordEngagementBatch([REEL_START], 'u1', 'granted');

    expect(counterWrites(prisma)).toEqual([]);
    const update = (prisma.postEngagement.upsert.mock.calls[0][0] as { update: Record<string, unknown> }).update;
    expect(update).toMatchObject({ dwellMs: 9000, watchMs: 9000, completed: true });
    expect(update.watchSamples).toEqual([{ positionMs: 8800, atMs: 8800 }]);
  });
});

/**
 * Revue de sécurité du lot #10764 — une clé de session est fournie par le
 * client : en changer ne doit pas permettre de faire monter les compteurs à
 * volonté, et l'auteur ne compte jamais sa propre lecture.
 */
describe('PostService.recordEngagementBatch — une clé de session neuve ne regonfle pas les compteurs', () => {
  const REEL = mkSession({ contentType: 'REEL', surface: 'reels', dwellMs: 9000, watchMs: 9000, completed: true });
  const counterWrites = (prisma: ReturnType<typeof buildPrisma>) =>
    postCounterWritesOf(prisma.$runCommandRaw).map((write) => write.data);

  it('l’auteur qui regarde son propre réel ne crédite aucun compteur', async () => {
    const prisma = buildPrisma();
    await new PostService(prisma).recordEngagementBatch([REEL], 'author', 'granted');
    expect(counterWrites(prisma)).toEqual([]);
  });

  it('une session neuve du même lecteur sur le même post dans la fenêtre ne crédite rien', async () => {
    const prisma = buildPrisma();
    prisma.postEngagement.findFirst.mockResolvedValue({ id: 'session-precedente' });
    await new PostService(prisma).recordEngagementBatch([REEL], 'u1', 'granted');

    expect(counterWrites(prisma)).toEqual([]);
    const where = (prisma.postEngagement.findFirst.mock.calls[0][0] as { where: Record<string, any> }).where;
    expect(where).toMatchObject({ postId: POST_A, OR: [{ userId: 'u1' }, { readerKey: expect.stringMatching(/^[0-9a-f]{64}$/) }] });
    expect(where.NOT.sessionId.in).toContain(REEL.sessionId);
    expect(where.createdAt.lt.getTime() - where.createdAt.gte.getTime()).toBe(10_000);
  });

  it('la session elle-même compte quand aucune autre ne la précède dans la fenêtre', async () => {
    const prisma = buildPrisma();
    await new PostService(prisma).recordEngagementBatch([REEL], 'u1', 'granted');
    expect(counterWrites(prisma)).toEqual([{
      postOpenCount: { increment: 1 }, playCount: { increment: 1 }, qualifiedViewCount: { increment: 1 },
    }]);
  });
});
