/**
 * Régression production 2026-06-01 : le hard-delete des stories expirées
 * échouait avec Prisma P2014 sur la self-relation `CommentReplies` de
 * PostComment — l'émulation MongoDB refuse de cascade-supprimer un commentaire
 * parent encore référencé par ses réponses. Le service doit casser la
 * self-relation (parentId = null) et supprimer les commentaires AVANT les posts.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
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
    postComment: {
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
