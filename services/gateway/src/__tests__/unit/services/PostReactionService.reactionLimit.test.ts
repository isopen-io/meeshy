import { describe, it, expect, jest } from '@jest/globals';
import { PostReactionService } from '../../../services/PostReactionService';
import { MAX_REACTIONS_PER_OBJECT, REACTION_LIMIT_REACHED_MESSAGE } from '@meeshy/shared/utils/reaction-limit';

/**
 * Cinq réactions au maximum, par personne et par objet (2026-08-20) — volet
 * posts. La règle vit dans `packages/shared/utils/reaction-limit.ts` (Task 1) ;
 * ce fichier prouve que `PostReactionService.addReaction` l'applique au bon
 * moment : APRÈS avoir vérifié qu'il s'agit d'une création réelle, pas d'un
 * `findFirst` qui aurait trouvé une réaction déjà posée (auquel cas aucune
 * place n'est consommée et la personne doit pouvoir reposer l'emoji même au
 * plafond). Miroir de `ReactionService.reactionLimit.test.ts` (Task 2).
 */

const POST_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439012';

function makePrisma(existingReactionCount: number) {
  return {
    post: {
      findUnique: jest.fn<any>().mockResolvedValue({ id: POST_ID, deletedAt: null })
    },
    postReaction: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      count: jest.fn<any>().mockResolvedValue(existingReactionCount),
      create: jest.fn<any>().mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: 'r-new',
          postId: POST_ID,
          userId: USER_ID,
          emoji: data.emoji,
          createdAt: new Date(),
          updatedAt: new Date()
        })
      ),
      groupBy: jest.fn<any>().mockResolvedValue([])
    },
    $transaction: jest.fn<any>().mockImplementation(async (fn: any) =>
      fn({
        post: { findUnique: jest.fn<any>().mockResolvedValue({ id: POST_ID }), update: jest.fn<any>() },
        postReaction: { groupBy: jest.fn<any>().mockResolvedValue([]) }
      })
    )
  };
}

describe('PostReactionService.addReaction — plafond de 5 réactions par personne et par post', () => {
  it(`la ${MAX_REACTIONS_PER_OBJECT}e réaction (nouvel emoji) passe — la personne en a ${MAX_REACTIONS_PER_OBJECT - 1}`, async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT - 1);
    const service = new PostReactionService(prisma as any);

    const result = await service.addReaction({
      postId: POST_ID,
      userId: USER_ID,
      emoji: '🎉'
    });

    expect(result?.unchanged).toBe(false);
    expect(prisma.postReaction.create).toHaveBeenCalledTimes(1);
  });

  it(`la ${MAX_REACTIONS_PER_OBJECT + 1}e réaction (nouvel emoji) est refusée — la personne a déjà ${MAX_REACTIONS_PER_OBJECT} emojis distincts sur ce post`, async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT);
    const service = new PostReactionService(prisma as any);

    await expect(
      service.addReaction({
        postId: POST_ID,
        userId: USER_ID,
        emoji: '🎉'
      })
    ).rejects.toThrow(REACTION_LIMIT_REACHED_MESSAGE);

    expect(prisma.postReaction.create).not.toHaveBeenCalled();
  });

  it('reposer un émoji déjà présent passe MÊME au plafond — un findFirst qui trouve déjà la réaction ne consomme aucune place', async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT);
    prisma.postReaction.findFirst.mockResolvedValue({
      id: 'r-existing',
      postId: POST_ID,
      userId: USER_ID,
      emoji: '👍',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const service = new PostReactionService(prisma as any);

    const result = await service.addReaction({
      postId: POST_ID,
      userId: USER_ID,
      emoji: '👍'
    });

    expect(result?.unchanged).toBe(true);
    expect(prisma.postReaction.create).not.toHaveBeenCalled();
    // La décision de plafond ne s'applique qu'à une création réelle.
    expect(prisma.postReaction.count).not.toHaveBeenCalled();
  });

  it('retirer une réaction libère une place — removeReaction ne consulte aucun plafond et supprime la ligne', async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT);
    (prisma.postReaction as any).deleteMany = jest.fn<any>().mockResolvedValue({ count: 1 });
    const service = new PostReactionService(prisma as any);

    const removed = await service.removeReaction({
      postId: POST_ID,
      userId: USER_ID,
      emoji: '👍'
    });

    expect(removed).toBe(true);
    expect((prisma.postReaction as any).deleteMany).toHaveBeenCalledWith({
      where: { postId: POST_ID, userId: USER_ID, emoji: '👍' }
    });
  });
});
