import { describe, it, expect, jest } from '@jest/globals';
import { ExpiredStoriesCleanupService } from '../ExpiredStoriesCleanupService';

/**
 * v1 était une garde de SOURCE (`code.toContain('soundUsage.deleteMany')`) :
 * elle a cassé au premier refactor légitime — la purge délègue désormais à
 * `SoundCaptureService.releasePosts` — alors que le comportement, lui, était
 * intact. Ancrée sur le comportement, elle survit au déplacement du code et
 * couvre en prime le recomptage, qu'une garde textuelle ne voyait pas.
 */
function buildPrisma(overrides: Record<string, unknown> = {}) {
  const post = {
    updateMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
    // 1er appel : les stories à purger. 2e : leurs reposts.
    findMany: jest.fn<(args: unknown) => Promise<unknown[]>>()
      .mockResolvedValueOnce([{ id: 'story-1' }])
      .mockResolvedValueOnce([{ id: 'repost-1' }]),
    deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 1 }),
  };
  return {
    post,
    postComment: {
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
      updateMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
    },
    postMedia: { deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }) },
    soundUsage: {
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([{ soundId: 'sound-a' }]),
      deleteMany: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ count: 1 }),
      count: jest.fn<() => Promise<number>>().mockResolvedValue(4),
    },
    sound: { update: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({}) },
    ...overrides,
  } as unknown as import('@meeshy/shared/prisma/client').PrismaClient;
}

describe('ExpiredStoriesCleanupService — usages de sons', () => {
  it('test_cleanup_purgesUsagesOfStoriesAndTheirReposts', async () => {
    const prisma = buildPrisma();
    await new ExpiredStoriesCleanupService(prisma).cleanup();

    // Les DEUX : ne purger que `ids` laisserait les usages des reposts
    // orphelins, à compter pour toujours.
    expect(prisma.soundUsage.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { postId: { in: ['story-1', 'repost-1'] } } }),
    );
  });

  it('test_cleanup_recountsUsageCount_ratherThanDecrementing', async () => {
    const prisma = buildPrisma();
    await new ExpiredStoriesCleanupService(prisma).cleanup();

    // Valeur ABSOLUE issue de `soundUsage.count`, jamais un `{ decrement: 1 }` :
    // un crash au milieu de la purge ne laisse plus de dérive définitive.
    expect(prisma.sound.update).toHaveBeenCalledWith({
      where: { id: 'sound-a' }, data: { usageCount: 4 },
    });
  });

  // Note : ce test ne rougit que si les DEUX gardes tombent (`toDelete.length > 0`
  // côté purge et `postIds.length === 0` côté service). Il documente l'absence
  // d'effet de bord ; `test_releasePosts_emptyList_touchesNothing` pinne la
  // seconde garde individuellement.
  it('test_cleanup_noExpiredStory_touchesNoUsage', async () => {
    const prisma = buildPrisma({
      post: {
        updateMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
        deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
      },
    });
    await new ExpiredStoriesCleanupService(prisma).cleanup();
    expect(prisma.soundUsage.deleteMany).not.toHaveBeenCalled();
  });

  /**
   * v1 de ce test affirmait l'inverse — « une panne de la bibliothèque ne doit
   * pas avorter la purge » — et c'était une erreur de conception de ma part.
   * `SoundUsage.postId` n'a ni relation ni cascade : supprimer les posts après
   * un échec de libération laisse des lignes que plus AUCUN chemin n'atteint, et
   * que `reconcileUsageCounts` confirmerait au lieu de corriger. Échouer coûte
   * une heure, la passe se rejoue ; orphaner coûte l'éternité.
   */
  it('test_cleanup_soundFailure_abortsTheHardDeleteSoItCanRetry', async () => {
    const prisma = buildPrisma({
      soundUsage: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockRejectedValue(new Error('DB down')),
        deleteMany: jest.fn(), count: jest.fn(),
      },
    });
    const result = await new ExpiredStoriesCleanupService(prisma).cleanup();

    expect(result.hardDeleted).toBe(0);
    // Et surtout : les posts sont TOUJOURS là, donc la passe suivante rejouera.
    expect(prisma.post.deleteMany).not.toHaveBeenCalled();
  });
});
