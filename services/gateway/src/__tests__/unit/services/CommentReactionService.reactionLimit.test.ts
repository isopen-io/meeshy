import { describe, it, expect, jest } from '@jest/globals';
import { CommentReactionService } from '../../../services/CommentReactionService';
import { MAX_REACTIONS_PER_OBJECT, REACTION_LIMIT_REACHED_MESSAGE } from '@meeshy/shared/utils/reaction-limit';
import { ConflictError } from '../../../errors/custom-errors';

/**
 * Cinq réactions au maximum, par personne et par objet (2026-08-20) — volet
 * commentaires, PREMIER chemin de création (`CommentReactionService.addReaction`,
 * emprunté par le socket). Le SECOND chemin
 * (`PostCommentService.likeComment`, fallback REST) a sa propre preuve dans
 * `PostCommentService.reactionLimit.test.ts` — les deux DOIVENT refuser la
 * sixième réaction, sinon l'un contourne silencieusement le plafond de
 * l'autre (cf. brief Task 3). La règle vit dans
 * `packages/shared/utils/reaction-limit.ts` (Task 1) ; ce fichier prouve
 * qu'elle s'applique APRÈS avoir vérifié qu'il s'agit d'une création réelle,
 * pas d'un `findFirst` qui aurait trouvé une réaction déjà posée. Miroir de
 * `ReactionService.reactionLimit.test.ts` (Task 2).
 */

const COMMENT_ID = '507f1f77bcf86cd799439021';
const USER_ID = '507f1f77bcf86cd799439022';

function makePrisma(existingReactionCount: number) {
  return {
    postComment: {
      findUnique: jest.fn<any>().mockResolvedValue({ id: COMMENT_ID, deletedAt: null })
    },
    commentReaction: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      count: jest.fn<any>().mockResolvedValue(existingReactionCount),
      create: jest.fn<any>().mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: 'r-new',
          commentId: COMMENT_ID,
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
        postComment: { findUnique: jest.fn<any>().mockResolvedValue({ id: COMMENT_ID }), update: jest.fn<any>() },
        commentReaction: { groupBy: jest.fn<any>().mockResolvedValue([]) }
      })
    )
  };
}

describe('CommentReactionService.addReaction — plafond de 5 réactions par personne et par commentaire', () => {
  it(`la ${MAX_REACTIONS_PER_OBJECT}e réaction (nouvel emoji) passe — la personne en a ${MAX_REACTIONS_PER_OBJECT - 1}`, async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT - 1);
    const service = new CommentReactionService(prisma as any);

    const result = await service.addReaction({
      commentId: COMMENT_ID,
      userId: USER_ID,
      emoji: '🎉'
    });

    expect(result?.unchanged).toBe(false);
    expect(prisma.commentReaction.create).toHaveBeenCalledTimes(1);
  });

  it(`la ${MAX_REACTIONS_PER_OBJECT + 1}e réaction (nouvel emoji) est refusée — la personne a déjà ${MAX_REACTIONS_PER_OBJECT} emojis distincts sur ce commentaire`, async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT);
    const service = new CommentReactionService(prisma as any);

    await expect(
      service.addReaction({
        commentId: COMMENT_ID,
        userId: USER_ID,
        emoji: '🎉'
      })
    ).rejects.toThrow(REACTION_LIMIT_REACHED_MESSAGE);

    expect(prisma.commentReaction.create).not.toHaveBeenCalled();
  });

  it('refuse avec un ConflictError — la route (POST /posts/:postId/comments/:commentId/like) le distingue d\'une panne via `instanceof`', async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT);
    const service = new CommentReactionService(prisma as any);

    await expect(
      service.addReaction({
        commentId: COMMENT_ID,
        userId: USER_ID,
        emoji: '🎉'
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('reposer un émoji déjà présent passe MÊME au plafond — un findFirst qui trouve déjà la réaction ne consomme aucune place', async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT);
    prisma.commentReaction.findFirst.mockResolvedValue({
      id: 'r-existing',
      commentId: COMMENT_ID,
      userId: USER_ID,
      emoji: '👍',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const service = new CommentReactionService(prisma as any);

    const result = await service.addReaction({
      commentId: COMMENT_ID,
      userId: USER_ID,
      emoji: '👍'
    });

    expect(result?.unchanged).toBe(true);
    expect(prisma.commentReaction.create).not.toHaveBeenCalled();
    // La décision de plafond ne s'applique qu'à une création réelle.
    expect(prisma.commentReaction.count).not.toHaveBeenCalled();
  });

  it('retirer une réaction libère une place — removeReaction ne consulte aucun plafond et supprime la ligne', async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT);
    (prisma.commentReaction as any).deleteMany = jest.fn<any>().mockResolvedValue({ count: 1 });
    const service = new CommentReactionService(prisma as any);

    const removed = await service.removeReaction({
      commentId: COMMENT_ID,
      userId: USER_ID,
      emoji: '👍'
    });

    expect(removed).toBe(true);
    expect((prisma.commentReaction as any).deleteMany).toHaveBeenCalledWith({
      where: { commentId: COMMENT_ID, userId: USER_ID, emoji: '👍' }
    });
  });
});
