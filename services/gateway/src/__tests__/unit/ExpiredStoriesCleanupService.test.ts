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
        // `repostOfId` D'ABORD : depuis le cycle 97 la requête des reposts porte
        // ELLE AUSSI un `type: { in: [...] }` (seuls les reposts éphémères sont
        // emportés par leur source ; un repost permanent est autoporteur et
        // survit). Tester le type en premier ferait rendre la fournée de
        // statuts à la question des reposts.
        if (args.where?.repostOfId) {
          return opts.repostIds.map((id) => ({ id }));
        }
        // Le balayage interroge une LISTE de types éphémères (`{ in: [...] }`),
        // pas le scalaire `'STORY'` : un double qui n'accepte que le scalaire
        // rendrait une liste vide et ferait passer la passe pour un no-op.
        if (Array.isArray(args.where?.type?.in)) {
          return opts.storyIds.map((id) => ({ id }));
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
      // Lue AVANT la destruction des lignes ET avant celle des commentaires :
      // c'est par elle que la passe fige la liste des médias et retrouve les
      // fichiers à effacer (`reclaimMediaRowBytes`). Rend une ligne par cible
      // désignée, pour que les gardes puissent suivre ce qui en découle.
      findMany: jest.fn(async (args: any) => {
        calls.push('postMedia.findMany');
        const targets: string[] = (args?.where?.OR ?? []).flatMap(
          (clause: any) => clause.postId?.in ?? clause.commentId?.in ?? [],
        );
        return targets.map((target) => ({
          id: `media-of-${target}`,
          fileUrl: `/f/${target}.jpg`,
          thumbnailUrl: null,
        }));
      }),
      deleteMany: jest.fn(async (args: any) => {
        calls.push('postMedia.deleteMany');
        return { count: 0 };
      }),
    },
    // La désactivation des liens de partage gouverne désormais la passe, au
    // même titre que le retrait des notifications : sans ce double elle rejette
    // et RIEN n'est détruit (comportement voulu — un lien laissé actif sur un
    // post détruit n'est plus rattrapable par aucune passe).
    trackingLink: {
      updateMany: jest.fn(async () => {
        calls.push('trackingLink.updateMany');
        return { count: 0 };
      }),
    },
    // Le hard-delete purge aussi les usages de sons (le Sound, lui, survit).
    // Sans ces doubles, l'accès à `prisma.soundUsage` lève et le try/catch de
    // la passe avale l'erreur : postMedia.deleteMany n'est jamais atteint.
    soundUsage: {
      findMany: jest.fn(async () => [] as { soundId: string }[]),
      deleteMany: jest.fn(async () => {
        calls.push('soundUsage.deleteMany');
        return { count: 0 };
      }),
    },
    sound: {
      // La garde de récupération des octets : un fichier encore référencé par
      // un son vivant n'est pas effacé. Aucun ici.
      findMany: jest.fn(async () => []),
      update: jest.fn(async () => ({})),
    },
    // Le retrait des notifications gouverne désormais la passe : sans ces deux
    // doubles, il rejette et RIEN n'est supprimé (c'est le comportement voulu,
    // cf. « ExpiredStoriesCleanupService — notifications des posts détruits »).
    $runCommandRaw: jest.fn(async (_command: any) => {
      calls.push('notification.find');
      return { cursor: { firstBatch: [] as unknown[] } };
    }),
    notification: {
      deleteMany: jest.fn(async (_args: any) => ({ count: 0 })),
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
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    trackingLink: {
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    soundUsage: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    sound: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    $runCommandRaw: jest.fn<any>().mockResolvedValue({ cursor: { firstBatch: [] } }),
    notification: {
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
  // content and ALL of them expire. Les lignes sont DÉSIGNÉES par une lecture
  // préalable puis détruites PAR ID : le même `SetNull` cachait les médias de
  // commentaire à un `where` rejoué après la suppression des commentaires.
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

    const lookup = (fake.prisma.postMedia.findMany as jest.Mock).mock.calls[0][0] as any;
    const postClause = (lookup.where.OR as any[]).find((c) => c.postId);
    expect(postClause.postId.in).toEqual(expect.arrayContaining(['story1', 'repost1']));

    const args = (fake.prisma.postMedia.deleteMany as jest.Mock).mock.calls[0][0] as any;
    expect(args.where.id.in).toEqual(
      expect.arrayContaining(['media-of-story1', 'media-of-repost1']),
    );
  });

  it('also purges media attached to the deleted comments (commentId leg)', async () => {
    const fake = makeFakePrisma({
      storyIds: ['story1'],
      repostIds: [],
      comments: [{ id: 'c1', postId: 'story1', parentId: null }],
    });
    const service = new ExpiredStoriesCleanupService(fake.prisma as any, { hardDeleteAgeMs: 0 });

    await service.cleanup();

    const lookup = (fake.prisma.postMedia.findMany as jest.Mock).mock.calls[0][0] as any;
    const commentClause = (lookup.where.OR as any[]).find((c) => c.commentId);
    expect(commentClause.commentId.in).toEqual(['c1']);

    // La désignation précède la suppression des commentaires ; sans cela le
    // `SetNull` aurait déjà vidé `commentId` et ce média serait resté orphelin.
    expect(fake.calls.indexOf('postMedia.findMany'))
      .toBeLessThan(fake.calls.indexOf('postComment.deleteMany'));

    const args = (fake.prisma.postMedia.deleteMany as jest.Mock).mock.calls[0][0] as any;
    expect(args.where.id.in).toContain('media-of-c1');
  });
});

/**
 * Les notifications que les stories détruites ont produites.
 *
 * Ce balayage est le SEUL chemin de hard-delete de post du gateway. Tant que
 * la story n'est que périmée, sa notification reste une trace légitime : les
 * deux clients l'affichent marquée « expirée » depuis `context.postExpiresAt`,
 * et `getPostById` ne filtre pas l'expiration — la cible répond encore. À la
 * destruction, ces deux appuis tombent ensemble : la ligne garde une copie
 * dénormalisée d'un contenu qui n'existe plus, son `view_post` n'ouvre qu'un
 * 404, et son badge non lu ne peut plus être décrémenté par personne.
 *
 * Le retrait est donc ancré sur la DESTRUCTION, pas sur l'expiration — et il
 * précède les suppressions, exactement comme la libération des usages de sons
 * juste à côté et pour la même raison : `context.postId` n'a ni relation ni
 * cascade, donc supprimer les posts après un retrait en échec laisserait des
 * lignes que plus aucun chemin n'atteindrait.
 */
describe('ExpiredStoriesCleanupService — notifications des posts détruits', () => {
  const ANNOUNCER = { announceNotificationsRetracted: jest.fn<any>() };

  beforeEach(() => {
    jest.clearAllMocks();
    ANNOUNCER.announceNotificationsRetracted.mockResolvedValue(undefined);
  });

  it('retire les notifications des stories ET de leurs reposts, en une seule question', async () => {
    const fake = makeFakePrisma({ storyIds: ['story1'], repostIds: ['repost1'], comments: [] });
    const service = new ExpiredStoriesCleanupService(fake.prisma as any, { hardDeleteAgeMs: 0 });

    await service.cleanup(ANNOUNCER as any);

    expect(fake.prisma.$runCommandRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        find: 'Notification',
        filter: {
          $or: [
            { 'context.postId': { $in: ['story1', 'repost1'] } },
            { 'metadata.repostId': { $in: ['story1', 'repost1'] } },
          ],
        },
      })
    );
  });

  it('retire AVANT de supprimer — un retrait en échec ne doit rien laisser d\'inatteignable', async () => {
    const fake = makeFakePrisma({ storyIds: ['story1'], repostIds: [], comments: [] });
    const service = new ExpiredStoriesCleanupService(fake.prisma as any, { hardDeleteAgeMs: 0 });

    await service.cleanup(ANNOUNCER as any);

    const retractIdx = fake.calls.indexOf('notification.find');
    const deleteIdx = fake.calls.indexOf('post.deleteMany');
    expect(retractIdx).toBeGreaterThanOrEqual(0);
    expect(retractIdx).toBeLessThan(deleteIdx);
  });

  it('renonce à la passe quand le retrait échoue — rien n\'est détruit cette heure-ci', async () => {
    const fake = makeFakePrisma({ storyIds: ['story1'], repostIds: [], comments: [] });
    (fake.prisma.$runCommandRaw as jest.Mock<any>).mockRejectedValue(new Error('mongo down'));
    const service = new ExpiredStoriesCleanupService(fake.prisma as any, { hardDeleteAgeMs: 0 });

    const result = await service.cleanup(ANNOUNCER as any);

    expect(result.hardDeleted).toBe(0);
    expect(fake.prisma.post.deleteMany).not.toHaveBeenCalled();
    expect(fake.prisma.postComment.deleteMany).not.toHaveBeenCalled();
  });

  it('annonce le retrait à CHAQUE destinataire', async () => {
    const fake = makeFakePrisma({ storyIds: ['story1'], repostIds: [], comments: [] });
    (fake.prisma.$runCommandRaw as jest.Mock<any>).mockResolvedValueOnce({
      cursor: {
        firstBatch: [
          { _id: { $oid: 'n1' }, userId: { $oid: '64a000000000000000000001' }, delivery: { pushSent: true } },
          { _id: { $oid: 'n2' }, userId: { $oid: '64a000000000000000000002' }, delivery: { pushSent: true } },
        ],
      },
    });
    const service = new ExpiredStoriesCleanupService(fake.prisma as any, { hardDeleteAgeMs: 0 });

    await service.cleanup(ANNOUNCER as any);

    expect(fake.prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['n1', 'n2'] } },
    });
    expect(ANNOUNCER.announceNotificationsRetracted).toHaveBeenCalledWith([
      { id: 'n1', userId: '64a000000000000000000001', pushSent: true },
      { id: 'n2', userId: '64a000000000000000000002', pushSent: true },
    ]);
  });

  it('ne pose aucune question quand rien n\'a expiré', async () => {
    const prisma = makeSimplePrisma();
    const service = new ExpiredStoriesCleanupService(prisma as any);

    await service.cleanup(ANNOUNCER as any);

    expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
  });

  it('détruit quand même sans annonceur branché — un worker sans `io` reste correct', async () => {
    const fake = makeFakePrisma({ storyIds: ['story1'], repostIds: [], comments: [] });
    const service = new ExpiredStoriesCleanupService(fake.prisma as any, { hardDeleteAgeMs: 0 });

    const result = await service.cleanup(undefined);

    expect(result.hardDeleted).toBe(1);
    expect(fake.prisma.$runCommandRaw).toHaveBeenCalled();
  });
});
