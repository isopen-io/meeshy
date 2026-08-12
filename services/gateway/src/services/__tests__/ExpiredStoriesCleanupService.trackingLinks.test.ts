import { describe, it, expect, jest } from '@jest/globals';
import { ExpiredStoriesCleanupService } from '../ExpiredStoriesCleanupService';

/**
 * Un `/l/<token>` qui vise une story DÉTRUITE restait actif pour toujours.
 *
 * Le retrait interactif d'un post — l'app comme la console — passe par
 * `applyPostRemovalEffects`, dont le troisième effet est exactement celui-ci :
 * « le soft-delete ne bascule que `deletedAt`, le `onDelete: Cascade` ne se
 * déclenche jamais, les `/l/<token>` qui visent ce post resteraient donc
 * opérationnels ». Le balayage du contenu éphémère est l'AUTRE chemin qui rend
 * un post inatteignable, et le SEUL qui le détruise — il ne l'appliquait pas.
 *
 * Rien ne pouvait le rattraper ensuite : `TrackingLink.targetId` n'a ni
 * relation ni cascade vers `Post` (le schéma le documente — le champ porte
 * indifféremment un postId, un conversationId ou un userId). Une fois la ligne
 * `Post` détruite, plus aucun chemin du gateway ne sait relier le lien à sa
 * cible disparue. Le lien survivait donc `isActive: true` : la route `/l/:token`
 * comptait son clic, incrémentait `totalClicks`, puis redirigeait vers une
 * page morte — là où le même contenu retiré à la main répondait 410
 * `LINK_INACTIVE`. Le même objet, deux fins de vie différentes selon le chemin
 * de retrait.
 *
 * Le geste est ancré sur la DESTRUCTION et non sur l'expiration, pour la même
 * raison que le retrait des notifications juste au-dessus : tant que la story
 * n'est que périmée, `getPostById` répond encore et le lien mène quelque part.
 * C'est `deletedAt` qui ferme cette porte, et le hard-delete qui la condamne.
 *
 * @jest-environment node
 */

const STORY = 'story-1';
const REPOST = 'repost-1';

function buildPrisma(overrides: Record<string, unknown> = {}) {
  return {
    post: {
      updateMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
      // 1er appel : les posts éphémères à détruire. 2e : leurs reposts.
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>()
        .mockResolvedValueOnce([{ id: STORY }])
        .mockResolvedValueOnce([{ id: REPOST }]),
      deleteMany: jest.fn<(args: any) => Promise<unknown>>(
        async (args) => ({ count: args?.where?.id?.in?.length ?? 0 }),
      ),
    },
    postComment: {
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
      updateMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
    },
    postMedia: { deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }) },
    trackingLink: {
      updateMany: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ count: 0 }),
    },
    soundUsage: {
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([]),
      deleteMany: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ count: 0 }),
      count: jest.fn<() => Promise<number>>().mockResolvedValue(0),
    },
    sound: { update: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({}) },
    $runCommandRaw: jest.fn<(command: unknown) => Promise<unknown>>()
      .mockResolvedValue({ cursor: { firstBatch: [] } }),
    notification: {
      deleteMany: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ count: 0 }),
    },
    ...overrides,
  } as unknown as import('@meeshy/shared/prisma/client').PrismaClient;
}

describe('ExpiredStoriesCleanupService — liens de partage', () => {
  /**
   * `allPostIds` et jamais `ids` : un repost est détruit par la cascade de son
   * original, sans jamais avoir été soft-deleté pour son propre compte (son
   * `expiresAt` est postérieur de plusieurs heures). Le borner aux stories
   * laisserait vivant chaque lien de partage de repost — et c'est justement le
   * repost qu'on partage.
   */
  it('test_cleanup_deactivatesTrackingLinksOfDestroyedPostsAndTheirReposts', async () => {
    const prisma = buildPrisma();
    await new ExpiredStoriesCleanupService(prisma).cleanup();

    expect(prisma.trackingLink.updateMany).toHaveBeenCalledWith({
      where: { targetId: { in: [STORY, REPOST] } },
      data: { isActive: false },
    });
  });

  /**
   * AVANT toute destruction, et pour la raison que ses deux voisins de bloc
   * écrivent déjà : sans relation ni cascade, détruire les posts après une
   * désactivation en échec laisserait des liens que plus aucun chemin
   * n'atteindrait — la passe suivante ne voit plus les posts.
   */
  it('test_cleanup_deactivatesLinks_beforeAnyDeletion', async () => {
    const order: string[] = [];
    const prisma = buildPrisma();
    (prisma.trackingLink.updateMany as jest.Mock).mockImplementation(async () => {
      order.push('links');
      return { count: 0 };
    });
    (prisma.postComment.deleteMany as jest.Mock).mockImplementation(async () => {
      order.push('comments');
      return { count: 0 };
    });
    (prisma.post.deleteMany as jest.Mock).mockImplementation(async () => {
      order.push('posts');
      return { count: 1 };
    });

    await new ExpiredStoriesCleanupService(prisma).cleanup();

    expect(order[0]).toBe('links');
    expect(order).toContain('posts');
  });

  /**
   * Le corollaire du témoin précédent : la désactivation GOUVERNE la passe. Si
   * elle échoue, rien n'est détruit et la passe horaire suivante rejoue tout.
   * Avaler l'erreur rendrait l'ordre décoratif.
   */
  it('test_cleanup_linkDeactivationFails_destroysNothing', async () => {
    const prisma = buildPrisma();
    (prisma.trackingLink.updateMany as jest.Mock).mockRejectedValue(new Error('mongo down'));

    const result = await new ExpiredStoriesCleanupService(prisma).cleanup();

    expect(result.hardDeleted).toBe(0);
    expect(prisma.post.deleteMany).not.toHaveBeenCalled();
    expect(prisma.postComment.deleteMany).not.toHaveBeenCalled();
  });

  /**
   * La passe horaire ne trouve le plus souvent rien à détruire. Elle ne doit
   * pas poser à Mongo une question dont l'ensemble est vide.
   *
   * Note de fidélité : ce témoin est DOUBLE-GARDÉ — par `toDelete.length > 0`
   * ici et par la garde de liste vide du helper — et il ne rougit donc qu'en
   * faisant tomber les deux. La sonde P5 (garde du helper retirée) fait tomber
   * `test_deactivate_emptyList_asksNothing`, pas celui-ci. Il pinne le contrat
   * de bout en bout — « rien de périmé ⇒ aucune écriture sur les liens » —
   * indépendamment de laquelle des deux gardes le tient, et non une garde en
   * particulier.
   */
  it('test_cleanup_nothingToDestroy_asksNoLinkQuery', async () => {
    const prisma = buildPrisma({
      post: {
        updateMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
        deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
      },
    });

    await new ExpiredStoriesCleanupService(prisma).cleanup();

    expect(prisma.trackingLink.updateMany).not.toHaveBeenCalled();
  });
});
