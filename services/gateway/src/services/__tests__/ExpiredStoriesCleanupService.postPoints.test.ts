import { describe, it, expect, jest } from '@jest/globals';
import { ExpiredStoriesCleanupService } from '../ExpiredStoriesCleanupService';

/**
 * Ce qu'un post DÉTRUIT a rapporté à ses lecteurs ne lui survit pas (#9569).
 *
 * `EngagementPostPoints` n'a ni relation ni cascade vers `Post` — à dessein :
 * sans relation, aucun `include` ne peut ramener les lignes des autres lecteurs
 * avec un post. Le prix de ce choix est que rien ne les retire tout seul : le
 * retrait interactif le fait (`applyPostRemovalEffects`), et le balayage du
 * contenu éphémère, le seul chemin qui DÉTRUISE la ligne `Post`, doit le faire
 * aussi. Même régime que ses voisins de bloc : avant toute suppression, et il
 * gouverne la passe.
 *
 * @jest-environment node
 */

// De la forme de la production : `postId` est une colonne ObjectId, que le
// vrai client refuserait pour toute autre chaîne.
const STATUS = '68d000000000000000000001';
const REPOST = '68d000000000000000000002';

function buildPrisma() {
  return {
    post: {
      updateMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
      // 1er appel : les posts éphémères à détruire. 2e : leurs reposts.
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>()
        .mockResolvedValueOnce([{ id: STATUS }])
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
    postMedia: {
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([]),
      deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
    },
    trackingLink: {
      updateMany: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ count: 0 }),
    },
    engagementPostPoints: {
      deleteMany: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ count: 0 }),
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
  };
}

const sweep = (prisma: ReturnType<typeof buildPrisma>) =>
  new ExpiredStoriesCleanupService(prisma as unknown as import('@meeshy/shared/prisma/client').PrismaClient).cleanup();

describe('ExpiredStoriesCleanupService — ce que les posts détruits ont rapporté à leurs lecteurs', () => {
  it('retire les lignes de cumul des posts détruits ET de leurs reposts emportés', async () => {
    const prisma = buildPrisma();

    await sweep(prisma);

    expect(prisma.engagementPostPoints.deleteMany).toHaveBeenCalledWith({
      where: { postId: { in: [STATUS, REPOST] } },
    });
  });

  it('les retire AVANT de détruire les posts', async () => {
    const order: string[] = [];
    const prisma = buildPrisma();
    prisma.engagementPostPoints.deleteMany.mockImplementation(async () => {
      order.push('points');
      return { count: 0 };
    });
    prisma.post.deleteMany.mockImplementation(async () => {
      order.push('posts');
      return { count: 1 };
    });

    await sweep(prisma);

    expect(order.indexOf('points')).toBe(0);
    expect(order).toContain('posts');
  });

  it('ne détruit rien quand le retrait échoue — la passe suivante rejoue tant que les posts existent', async () => {
    const prisma = buildPrisma();
    prisma.engagementPostPoints.deleteMany.mockRejectedValue(new Error('mongo down'));

    const result = await sweep(prisma);

    expect(result.hardDeleted).toBe(0);
    expect(prisma.post.deleteMany).not.toHaveBeenCalled();
  });

  it('ne pose aucune question quand il n’y a rien à détruire', async () => {
    const prisma = buildPrisma();
    prisma.post.findMany.mockReset().mockResolvedValue([]);

    await sweep(prisma);

    expect(prisma.engagementPostPoints.deleteMany).not.toHaveBeenCalled();
  });
});
