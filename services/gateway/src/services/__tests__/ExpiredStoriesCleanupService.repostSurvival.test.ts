import { describe, it, expect, jest } from '@jest/globals';
import { ExpiredStoriesCleanupService } from '../ExpiredStoriesCleanupService';

/**
 * La passe de hard-delete emportait TOUT post repostant sa cible, sans filtre
 * de type. Depuis l'instantané (`PostService.repostPost` duplique le contenu de
 * toute source éphémère), un repost PERMANENT est autoporteur : le détruire
 * quatorze jours après l'expiration du statut d'origine efface un contenu que
 * son auteur avait justement voulu garder — et, depuis le cycle 96, ses octets
 * avec.
 *
 * Ces gardes ancrent les deux moitiés du nouveau contrat : le repost permanent
 * SURVIT, et il survit DÉTACHÉ — aucun pointeur pendant vers la ligne détruite.
 */

type PostRow = { id: string; type?: string };

type PrismaDouble = ReturnType<typeof buildPrisma>;

function buildPrisma(reposts: PostRow[] = []) {
  const order: string[] = [];
  const prisma = {
    post: {
      updateMany: jest.fn<(args: any) => Promise<unknown>>().mockImplementation(async (args: any) => {
        if (args?.data?.repostOfId === null) order.push('detach:direct');
        else if (args?.data?.originalRepostOfId === null) order.push('detach:roots');
        return { count: 0 };
      }),
      // Le double APPLIQUE le filtre de type qu'on lui envoie, au lieu de
      // rendre la liste telle quelle : c'est la seule façon qu'une garde
      // « le repost permanent survit » soit RED avant le correctif plutôt que
      // verte par construction du double.
      findMany: jest.fn<(args: any) => Promise<PostRow[]>>().mockImplementation(async (args: any) => {
        if (!args?.where?.repostOfId) return [{ id: 'status-1' }];
        const allowed: string[] | undefined = args?.where?.type?.in;
        return allowed ? reposts.filter((row) => allowed.includes(row.type ?? 'POST')) : reposts;
      }),
      deleteMany: jest.fn<(args: any) => Promise<unknown>>().mockImplementation(async () => {
        order.push('deletePosts');
        return { count: 1 };
      }),
    },
    postComment: {
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
      updateMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
    },
    postMedia: {
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([]),
      deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
    },
    sound: {
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([]),
      update: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({}),
    },
    trackingLink: {
      updateMany: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ count: 0 }),
    },
    soundUsage: {
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([]),
      deleteMany: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ count: 0 }),
      count: jest.fn<() => Promise<number>>().mockResolvedValue(0),
    },
    $runCommandRaw: jest.fn<(command: unknown) => Promise<unknown>>()
      .mockResolvedValue({ cursor: { firstBatch: [] } }),
    notification: {
      deleteMany: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ count: 0 }),
    },
  };
  return { prisma, order };
}

function buildStorage() {
  return {
    delete: jest.fn<(fileUrl: string) => Promise<void>>().mockResolvedValue(undefined),
    duplicate: jest.fn(),
    planDuplicate: jest.fn(),
    relativePathFromUrl: jest.fn(),
  } as unknown as import('../storage/MediaStorage').MediaStorage;
}

function run(double: PrismaDouble) {
  return new ExpiredStoriesCleanupService(
    double.prisma as unknown as import('@meeshy/shared/prisma/client').PrismaClient,
    { mediaStorage: buildStorage() },
  ).cleanup();
}

/** Les ids que la passe a effectivement demandé de détruire. */
function deletedIds(double: PrismaDouble): string[] {
  return (double.prisma.post.deleteMany as jest.Mock).mock.calls
    .flatMap((call) => ((call[0] as any)?.where?.id?.in ?? []) as string[]);
}

describe('ExpiredStoriesCleanupService — survie des reposts permanents', () => {
  it('test_cleanup_neDemandeQueLesRepostsEphemeres', async () => {
    const double = buildPrisma();

    await run(double);

    const repostQuery = (double.prisma.post.findMany as jest.Mock).mock.calls
      .map((call) => call[0] as any)
      .find((args) => args?.where?.repostOfId);

    expect(repostQuery?.where?.type?.in).toEqual(['STATUS']);
  });

  it('test_cleanup_neDetruitPasUnRepostPermanent', async () => {
    // Le repost EXISTE en base ; seule la requête filtrée l'épargne.
    const double = buildPrisma([{ id: 'repost-post-1', type: 'POST' }]);

    await run(double);

    expect(deletedIds(double)).toEqual(['status-1']);
  });

  it('test_cleanup_neBalaieNiLesMediasNiLesCommentairesDuRepostPermanent', async () => {
    const double = buildPrisma([{ id: 'repost-post-1', type: 'POST' }]);

    await run(double);

    const lookup = (double.prisma.postMedia.findMany as jest.Mock).mock.calls[0]?.[0] as any;
    const postClause = (lookup.where.OR as any[]).find((clause) => clause.postId);
    expect(postClause.postId.in).toEqual(['status-1']);
  });

  it('test_cleanup_coupeLePointeurDirectDesRepostsSurvivants', async () => {
    const double = buildPrisma([]);

    await run(double);

    expect(double.prisma.post.updateMany).toHaveBeenCalledWith({
      where: { repostOfId: { in: ['status-1'] } },
      data: { repostOfId: null },
    });
  });

  it('test_cleanup_coupeAussiLePointeurDeRacine', async () => {
    const double = buildPrisma([]);

    await run(double);

    expect(double.prisma.post.updateMany).toHaveBeenCalledWith({
      where: { originalRepostOfId: { in: ['status-1'] } },
      data: { originalRepostOfId: null },
    });
  });

  // L'ordre porte le remède : couper APRÈS la suppression laisserait des
  // pointeurs vers une ligne détruite, que plus aucune passe ne retrouve.
  it('test_cleanup_coupeAvantDeDetruire', async () => {
    const double = buildPrisma([]);

    await run(double);

    expect(double.order.indexOf('detach:direct')).toBeLessThan(double.order.indexOf('deletePosts'));
    expect(double.order.indexOf('detach:roots')).toBeLessThan(double.order.indexOf('deletePosts'));
  });

  it('test_cleanup_coupureEnEchec_neDetruitRien', async () => {
    const double = buildPrisma([]);
    (double.prisma.post.updateMany as jest.Mock).mockImplementation(async (args: any) => {
      if (args?.data?.repostOfId === null) throw new Error('mongo down');
      return { count: 0 };
    });

    const result = await run(double);

    expect(double.prisma.post.deleteMany).not.toHaveBeenCalled();
    expect(result.hardDeleted).toBe(0);
  });

  // Un repost ÉPHÉMÈRE reste emporté par sa source : son propre `expiresAt` est
  // périmé depuis aussi longtemps qu'elle, et il n'a aucune surface d'archive.
  it('test_cleanup_detruitToujoursLesRepostsEphemeres', async () => {
    const double = buildPrisma([{ id: 'repost-status-1', type: 'STATUS' }]);

    await run(double);

    expect(deletedIds(double)).toEqual(expect.arrayContaining(['status-1', 'repost-status-1']));
  });

  // La coupure vise la fournée ENTIÈRE, reposts éphémères détruits compris :
  // un repost de repost pointe vers eux, et `repostOf` est en `onDelete:
  // NoAction` — la construction même dont l'émulation MongoDB refuse la
  // suppression (P2014).
  it('test_cleanup_coupeAussiLesPointeursVersLesRepostsDetruits', async () => {
    const double = buildPrisma([{ id: 'repost-status-1', type: 'STATUS' }]);

    await run(double);

    expect(double.prisma.post.updateMany).toHaveBeenCalledWith({
      where: { repostOfId: { in: ['status-1', 'repost-status-1'] } },
      data: { repostOfId: null },
    });
  });
});
