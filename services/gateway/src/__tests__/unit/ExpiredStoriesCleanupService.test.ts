/**
 * Régression production 2026-06-01 : le hard-delete des stories expirées
 * échouait avec Prisma P2014 sur la self-relation `CommentReplies` de
 * PostComment — l'émulation MongoDB refuse de cascade-supprimer un commentaire
 * parent encore référencé par ses réponses. Le service doit casser la
 * self-relation (parentId = null) et supprimer les commentaires AVANT les posts.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ExpiredStoriesCleanupService } from '../../services/ExpiredStoriesCleanupService';

type Comment = { id: string; postId: string; parentId: string | null };

function makeFakePrisma(opts: { storyIds: string[]; repostIds: string[]; comments: Comment[] }) {
  const state = {
    comments: [...opts.comments],
    deletedPostIds: [] as string[],
  };
  const calls: string[] = [];

  const inSet = (val: string, where: any): boolean => {
    const clause = where?.id ?? where?.postId ?? where?.repostOfId;
    return Array.isArray(clause?.in) ? clause.in.includes(val) : false;
  };

  const prisma = {
    post: {
      updateMany: jest.fn(async () => ({ count: 0 })),
      findMany: jest.fn(async (args: any) => {
        if (args.where?.type === 'STORY') {
          return opts.storyIds.map((id) => ({ id }));
        }
        if (args.where?.repostOfId) {
          return opts.repostIds.map((id) => ({ id }));
        }
        return [];
      }),
      deleteMany: jest.fn(async (args: any) => {
        calls.push('post.deleteMany');
        // Simulate the P2014 self-relation guard: deleting a post whose
        // comments still carry a non-null parentId violates CommentReplies.
        const blocking = state.comments.filter(
          (c) => inSet(c.postId, args.where) && c.parentId !== null,
        );
        if (blocking.length > 0) {
          const err: any = new Error('P2014 self-relation violation');
          err.code = 'P2014';
          throw err;
        }
        const targets = state.comments.length === 0
          ? opts.storyIds.concat(opts.repostIds)
          : [];
        void targets;
        return { count: opts.storyIds.length };
      }),
    },
    postMedia: {
      deleteMany: jest.fn(async (args: any) => {
        calls.push('postMedia.deleteMany');
        return { count: 0 };
      }),
    },
    postComment: {
      findMany: jest.fn(async (args: any) => {
        return state.comments
          .filter((c) => inSet(c.postId, args.where))
          .map((c) => ({ id: c.id ?? 'c-' + c.postId }));
      }),
      updateMany: jest.fn(async (args: any) => {
        calls.push('postComment.updateMany');
        let count = 0;
        for (const c of state.comments) {
          if (inSet(c.postId, args.where) && (args.data?.parentId === null)) {
            c.parentId = null;
            count++;
          }
        }
        return { count };
      }),
      deleteMany: jest.fn(async (args: any) => {
        calls.push('postComment.deleteMany');
        const before = state.comments.length;
        state.comments = state.comments.filter((c) => !inSet(c.postId, args.where));
        return { count: before - state.comments.length };
      }),
    },
  };

  return { prisma, calls, state };
}

function makeSimplePrisma() {
  return {
    post: {
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    postComment: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    postMedia: {
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('ExpiredStoriesCleanupService — start/stop lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('start() immediately calls cleanup and sets up interval', async () => {
    const prisma = makeSimplePrisma();
    const service = new ExpiredStoriesCleanupService(prisma as any);

    service.start(1000);

    await Promise.resolve(); // let initial cleanup run
    expect(prisma.post.updateMany).toHaveBeenCalled();

    service.stop();
  });

  it('stop() clears the interval without throwing', async () => {
    const prisma = makeSimplePrisma();
    const service = new ExpiredStoriesCleanupService(prisma as any);

    service.start(10_000);
    service.stop();

    // Call stop again to verify the early-return branch (no interval)
    expect(() => service.stop()).not.toThrow();
  });

  it('scheduled cleanup runs when interval fires', async () => {
    const prisma = makeSimplePrisma();
    const service = new ExpiredStoriesCleanupService(prisma as any);

    service.start(1000);
    await Promise.resolve(); // initial cleanup
    const callsBefore = (prisma.post.updateMany as jest.Mock<any>).mock.calls.length;

    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    expect((prisma.post.updateMany as jest.Mock<any>).mock.calls.length).toBeGreaterThan(callsBefore);
    service.stop();
  });
});

describe('ExpiredStoriesCleanupService — error handling', () => {
  it('cleanup() catches soft-delete errors and continues to hard-delete pass', async () => {
    const prisma = makeSimplePrisma();
    (prisma.post.updateMany as jest.Mock<any>).mockRejectedValueOnce(new Error('updateMany failed'));

    const service = new ExpiredStoriesCleanupService(prisma as any);
    const result = await service.cleanup();

    expect(result.softDeleted).toBe(0);
    expect(prisma.post.findMany).toHaveBeenCalled(); // hard-delete pass still attempted
  });

  it('cleanup() catches hard-delete errors and returns partial result', async () => {
    const prisma = makeSimplePrisma();
    (prisma.post.updateMany as jest.Mock<any>).mockResolvedValue({ count: 2 });
    (prisma.post.findMany as jest.Mock<any>).mockRejectedValueOnce(new Error('findMany failed'));

    const service = new ExpiredStoriesCleanupService(prisma as any);
    const result = await service.cleanup();

    expect(result.softDeleted).toBe(2);
    expect(result.hardDeleted).toBe(0);
  });
});

describe('ExpiredStoriesCleanupService — hard-delete P2014 regression', () => {
  let consoleWarnSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('clears PostComments (break self-relation + delete) before deleting the posts', async () => {
    const fake = makeFakePrisma({
      storyIds: ['story1'],
      repostIds: [],
      comments: [
        { id: 'c1', postId: 'story1', parentId: null },
        { id: 'c2', postId: 'story1', parentId: 'c1' },
      ],
    });
    const service = new ExpiredStoriesCleanupService(fake.prisma as any, { hardDeleteAgeMs: 0 });

    const result = await service.cleanup();

    expect(result.hardDeleted).toBe(1);
    expect(fake.prisma.postComment.updateMany).toHaveBeenCalled();
    expect(fake.prisma.postComment.deleteMany).toHaveBeenCalled();
    // Comments must be cleared before the post deletion that would otherwise P2014.
    const firstPostDelete = fake.calls.indexOf('post.deleteMany');
    const commentsDeleted = fake.calls.indexOf('postComment.deleteMany');
    expect(commentsDeleted).toBeGreaterThanOrEqual(0);
    expect(commentsDeleted).toBeLessThan(firstPostDelete);
  });

  it('does not throw P2014 and completes the pass', async () => {
    const fake = makeFakePrisma({
      storyIds: ['story1', 'story2'],
      repostIds: ['repost1'],
      comments: [
        { id: 'c1', postId: 'story1', parentId: null },
        { id: 'c2', postId: 'story1', parentId: 'c1' },
        { id: 'c3', postId: 'repost1', parentId: 'c1' },
      ],
    });
    const service = new ExpiredStoriesCleanupService(fake.prisma as any, { hardDeleteAgeMs: 0 });

    const result = await service.cleanup();

    expect(result.hardDeleted).toBe(2);
    // The hard-delete pass must NOT have warned (no P2014 escaped).
    const warnedHardDelete = consoleWarnSpy.mock.calls.some((c) =>
      String(c[0]).includes('hard-delete'),
    );
    expect(warnedHardDelete).toBe(false);
  });
});

describe('ExpiredStoriesCleanupService — G7 media-orphan purge', () => {
  // PostMedia.post and PostMedia.comment are `onDelete: SetNull`: without an
  // explicit purge, every hard-deleted story left its media rows orphaned
  // (postId/commentId = null) forever — stories are the most media-heavy
  // content and ALL of them expire. Disk files are a separate follow-up.
  it('purges media rows of the deleted posts BEFORE deleting the posts', async () => {
    const fake = makeFakePrisma({
      storyIds: ['story1'],
      repostIds: ['repost1'],
      comments: [],
    });
    const service = new ExpiredStoriesCleanupService(fake.prisma as any, { hardDeleteAgeMs: 0 });

    await service.cleanup();

    const mediaIdx = fake.calls.indexOf('postMedia.deleteMany');
    const postIdx = fake.calls.indexOf('post.deleteMany');
    expect(mediaIdx).toBeGreaterThanOrEqual(0);
    expect(mediaIdx).toBeLessThan(postIdx);

    const args = (fake.prisma.postMedia.deleteMany as jest.Mock).mock.calls[0][0] as any;
    const orClauses = args.where.OR as any[];
    const postClause = orClauses.find((c) => c.postId);
    expect(postClause.postId.in).toEqual(expect.arrayContaining(['story1', 'repost1']));
  });

  it('also purges media attached to the deleted comments (commentId leg)', async () => {
    const fake = makeFakePrisma({
      storyIds: ['story1'],
      repostIds: [],
      comments: [{ id: 'c1', postId: 'story1', parentId: null }],
    });
    const service = new ExpiredStoriesCleanupService(fake.prisma as any, { hardDeleteAgeMs: 0 });

    await service.cleanup();

    const args = (fake.prisma.postMedia.deleteMany as jest.Mock).mock.calls[0][0] as any;
    const orClauses = args.where.OR as any[];
    const commentClause = orClauses.find((c) => c.commentId);
    expect(commentClause.commentId.in).toEqual(['c1']);
  });
});
