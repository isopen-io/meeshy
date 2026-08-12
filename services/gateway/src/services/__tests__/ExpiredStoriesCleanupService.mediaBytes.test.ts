import { describe, it, expect, jest } from '@jest/globals';
import { ExpiredStoriesCleanupService } from '../ExpiredStoriesCleanupService';

/**
 * La passe de hard-delete détruisait les LIGNES `PostMedia` et laissait les
 * FICHIERS pour toujours — le suivi que son propre commentaire annonçait.
 * Ces gardes ancrent les deux moitiés du contrat : les octets partent, et ils
 * partent AVANT les lignes qui seules savent où ils sont.
 */

type MediaRow = { id: string; fileUrl: string; thumbnailUrl: string | null };

function buildPrisma(media: MediaRow[] = [{ id: 'media-1', fileUrl: '/f/a.jpg', thumbnailUrl: null }]) {
  return {
    post: {
      updateMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>()
        .mockResolvedValueOnce([{ id: 'status-1' }])
        .mockResolvedValueOnce([]),
      deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 1 }),
    },
    postComment: {
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([{ id: 'comment-1' }]),
      updateMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
    },
    postMedia: {
      findMany: jest.fn<(args: unknown) => Promise<MediaRow[]>>().mockResolvedValue(media),
      deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 1 }),
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
  } as unknown as import('@meeshy/shared/prisma/client').PrismaClient;
}

function buildStorage() {
  return {
    delete: jest.fn<(fileUrl: string) => Promise<void>>().mockResolvedValue(undefined),
    duplicate: jest.fn(),
    planDuplicate: jest.fn(),
    relativePathFromUrl: jest.fn(),
  } as unknown as import('../storage/MediaStorage').MediaStorage;
}

describe('ExpiredStoriesCleanupService — octets des médias purgés', () => {
  it('test_cleanup_reclaimsTheBytesOfTheMediaRowsItDestroys', async () => {
    const prisma = buildPrisma([{ id: 'media-1', fileUrl: '/f/a.jpg', thumbnailUrl: '/f/a_thumb.jpg' }]);
    const storage = buildStorage();

    await new ExpiredStoriesCleanupService(prisma, { mediaStorage: storage }).cleanup();

    expect(storage.delete).toHaveBeenCalledWith('/f/a.jpg');
    expect(storage.delete).toHaveBeenCalledWith('/f/a_thumb.jpg');
  });

  it('test_cleanup_coversTheMediaOfTheCommentsItDeletes', async () => {
    const prisma = buildPrisma();
    const storage = buildStorage();

    await new ExpiredStoriesCleanupService(prisma, { mediaStorage: storage }).cleanup();

    expect(prisma.postMedia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ postId: { in: ['status-1'] } }, { commentId: { in: ['comment-1'] } }],
        },
      }),
    );
  });

  // `PostMedia.commentId` est en `onDelete: SetNull` : interroger après la
  // suppression des commentaires ne rendrait plus AUCUN média de commentaire —
  // ni ses octets, ni sa ligne, qui resterait orpheline pour toujours.
  it('test_cleanup_identifiesMediaBeforeDeletingTheComments', async () => {
    const prisma = buildPrisma();
    const storage = buildStorage();
    const order: string[] = [];
    (prisma.postMedia.findMany as jest.Mock).mockImplementation(async () => {
      order.push('findMedia');
      return [{ id: 'media-1', fileUrl: '/f/a.jpg', thumbnailUrl: null }];
    });
    (prisma.postComment.deleteMany as jest.Mock).mockImplementation(async () => {
      order.push('deleteComments');
      return { count: 1 };
    });

    await new ExpiredStoriesCleanupService(prisma, { mediaStorage: storage }).cleanup();

    expect(order).toEqual(['findMedia', 'deleteComments']);
  });

  // Par ID : le `where` d'origine rejouait `commentId`, que la suppression des
  // commentaires venait de mettre à `null`.
  it('test_cleanup_deletesTheMediaRowsItIdentified_byId', async () => {
    const prisma = buildPrisma([
      { id: 'media-1', fileUrl: '/f/a.jpg', thumbnailUrl: null },
      { id: 'media-2', fileUrl: '/f/b.jpg', thumbnailUrl: null },
    ]);
    const storage = buildStorage();

    await new ExpiredStoriesCleanupService(prisma, { mediaStorage: storage }).cleanup();

    expect(prisma.postMedia.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['media-1', 'media-2'] } },
    });
  });

  // L'ordre porte tout : la ligne est le seul chemin vers le fichier.
  it('test_cleanup_reclaimsBytesBeforeDeletingTheRows', async () => {
    const prisma = buildPrisma();
    const storage = buildStorage();
    const order: string[] = [];
    (storage.delete as jest.Mock).mockImplementation(async () => { order.push('unlink'); });
    (prisma.postMedia.deleteMany as jest.Mock).mockImplementation(async () => {
      order.push('deleteRows');
      return { count: 1 };
    });

    await new ExpiredStoriesCleanupService(prisma, { mediaStorage: storage }).cleanup();

    expect(order).toEqual(['unlink', 'deleteRows']);
  });

  // Si l'on ne sait pas quels fichiers appartiennent à ces lignes, on ne
  // détruit pas les lignes : la passe suivante rejouera tout.
  it('test_cleanup_mediaLookupFails_destroysNothing', async () => {
    const prisma = buildPrisma();
    (prisma.postMedia.findMany as jest.Mock).mockRejectedValue(new Error('mongo down'));
    const storage = buildStorage();

    const result = await new ExpiredStoriesCleanupService(prisma, { mediaStorage: storage }).cleanup();

    expect(prisma.postMedia.deleteMany).not.toHaveBeenCalled();
    expect(prisma.post.deleteMany).not.toHaveBeenCalled();
    expect(result.hardDeleted).toBe(0);
  });
});
